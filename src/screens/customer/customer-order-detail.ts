import type { ServiceOrderItem } from '../../api/orders.api';
import { orderTotalText } from './customer-bookings-history';

interface DetailSession {
  getUserId: () => string | null;
  subscribe: (listener: () => void) => () => void;
}

export interface OrderDetailState {
  order: ServiceOrderItem | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
}

export const initialOrderDetailState: OrderDetailState = {
  order: null, loading: true, refreshing: false, error: null,
};

export interface DetailScreenMirror {
  current: { order: ServiceOrderItem | null; serviceOrderId: string };
}

/**
 * Synchronous production mirror writer for the detail screen: publishes the
 * freshly fetched order into the screen's ref in the SAME TICK as the state
 * write, before React commits or passive effects run — so a verified GET can
 * never unlock an ambiguous-action retry against a stale pre-commit order.
 * The published order's own id is authoritative for the mirror's route id
 * (the loader only publishes payloads matching the focused order); the
 * fallback covers cleared/denied states with no order. The screen keeps its
 * passive effect as a backstop writing identical values (no rollback).
 */
export function writeDetailWithMirror(
  mirror: DetailScreenMirror,
  serviceOrderId: string,
  write: (state: OrderDetailState) => void,
): (state: OrderDetailState) => void {
  return (state) => {
    mirror.current = {
      order: state.order,
      serviceOrderId: state.order ? state.order.id : serviceOrderId,
    };
    write(state);
  };
}

const ORDER_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const deniedMessage = 'Không có quyền xem đơn dịch vụ. Vui lòng kiểm tra đăng nhập.';
const notFoundMessage = 'Không tìm thấy đơn dịch vụ hoặc bạn không có quyền xem.';
const invalidIdMessage = 'Mã đơn dịch vụ không hợp lệ.';

function statusOf(error: unknown): number | undefined {
  return (error as { response?: { status?: number } } | null)?.response?.status;
}

function accessDenied(error: unknown) {
  const status = statusOf(error);
  return status === 401 || status === 403;
}

/**
 * Detail target for navigation and fetch: a real ServiceOrder UUID only.
 * Booking IDs are UUIDs too, so callers must pass `order.id` (never `booking.id`);
 * this guard only rejects malformed IDs before a pointless request.
 */
export function orderDetailTarget(orderId: unknown): string | null {
  return typeof orderId === 'string' && ORDER_UUID.test(orderId) ? orderId : null;
}

export interface OrderDetailSections {
  hasTechnician: boolean;
  technicianName: string | null;
  technicianPhone: string | null;
  laborText: string | null;
  partsText: string | null;
  totalText: string | null;
  fixedUnitPriceText: string | null;
  quantity: number | null;
  hasQuotation: boolean;
  quotationStatus: string | null;
  quoteAwaitingDecision: boolean;
  hasTimeline: boolean;
  beforeCount: number | null;
  afterCount: number | null;
}

function amountOrNull(value: unknown): string | null {
  return typeof value === 'number' ? `${value.toLocaleString('vi-VN')}đ` : null;
}

/** Quotation line items for rendering; missing/null/non-array shapes become an empty list. */
export function quotationItemsList(order: ServiceOrderItem | null): NonNullable<ServiceOrderItem['quotation']>['items'] {
  if (!order?.quotation || !Array.isArray(order.quotation.items)) return [];
  return order.quotation.items;
}

export const TECHNICIAN_ATTRIBUTION_NOTE =
  'Nếu đơn đang tìm thợ thay thế, đây có thể là thông tin thợ trước đó. Thông tin trên đơn chưa xác nhận thợ hiện phụ trách.';

/**
 * P3 provenance clarification (display-only): Backend `presentOrder` selects the
 * latest assignment without an `isActive` predicate, so `order.technician` is the
 * technician RECORDED on the order — which may be a previous technician while a
 * replacement is underway. This pure derivation surfaces a hedged caution only
 * when a technician is recorded AND the order is ACCEPTED/EN_ROUTE (the window
 * where replacement can happen). It never claims who the current/active
 * technician is, and returns null for missing tech, null orders, and all other
 * statuses so genuine active contacts elsewhere stay untouched.
 */
export function technicianAttributionNote(order: ServiceOrderItem | null): string | null {
  if (!order?.technician?.fullName) return null;
  const status = String(order.status).toUpperCase();
  return status === 'ACCEPTED' || status === 'EN_ROUTE' ? TECHNICIAN_ATTRIBUTION_NOTE : null;
}

/** Presence decisions for the read-only detail screen; the screen renders exactly this. */
export function resolveOrderDetailSections(order: ServiceOrderItem | null): OrderDetailSections {
  const quotationStatus = order?.quotation?.status != null
    ? String(order.quotation.status).toUpperCase() : null;
  return {
    hasTechnician: !!order?.technician?.fullName,
    technicianName: order?.technician?.fullName ?? null,
    technicianPhone: order?.technician?.phoneNumber ?? null,
    laborText: amountOrNull(order?.laborTotal),
    partsText: amountOrNull(order?.partsTotal),
    totalText: order ? orderTotalText(order) : null,
    fixedUnitPriceText: amountOrNull(order?.fixedUnitPrice),
    quantity: typeof order?.quantity === 'number' ? order.quantity : null,
    hasQuotation: !!order?.quotation,
    quotationStatus,
    quoteAwaitingDecision: quotationStatus === 'SENT',
    hasTimeline: Array.isArray(order?.timeline) && order.timeline.length > 0,
    beforeCount: typeof order?.beforeEvidenceCount === 'number' ? order.beforeEvidenceCount : null,
    afterCount: typeof order?.afterEvidenceCount === 'number' ? order.afterEvidenceCount : null,
  };
}

export interface OrderDetailLoaderOptions {
  /**
   * Inspect a fetched payload before render. Return a safe message to suppress it
   * (cleared state, no private fields shown), or null to accept. Used by the
   * technician slice to reject sanitized historical summaries returned by GET.
   */
  suppressResponse?: (order: ServiceOrderItem) => string | null;
}

export function createOrderDetailLoader(
  getOrder: (id: string) => Promise<ServiceOrderItem>,
  write: (state: OrderDetailState) => void,
  session: DetailSession,
  options: OrderDetailLoaderOptions = {},
) {
  let state = initialOrderDetailState;
  let active = false;
  let ownerId: string | null = null;
  let orderId: string | null = null;
  let requestGeneration = 0;
  let loaded = false;
  let inFlight: Promise<void> | null = null;
  let unsubscribe: (() => void) | undefined;
  const authorized = () => ownerId !== null && session.getUserId() === ownerId;
  const publish = (patch: Partial<OrderDetailState>) => {
    state = { ...state, ...patch };
    if (active) write(state);
  };
  function invalidate() { ++requestGeneration; inFlight = null; }
  function denyAccess() {
    invalidate();
    loaded = false;
    publish({ ...initialOrderDetailState, loading: false, error: deniedMessage });
  }
  function clearWith(message: string) {
    invalidate();
    loaded = false;
    publish({ ...initialOrderDetailState, loading: false, error: message });
  }
  function refresh(force = false): Promise<void> {
    if (!active || !authorized() || !orderId) return Promise.resolve();
    const target = orderDetailTarget(orderId);
    if (!target) { clearWith(invalidIdMessage); return Promise.resolve(); }
    if (inFlight && !force) return inFlight;
    const generation = ++requestGeneration;
    const valid = () => active && authorized() && generation === requestGeneration;
    publish({ loading: !loaded, refreshing: loaded, error: null });
    const request = (async () => {
      try {
        const fetched = await getOrder(target);
        if (!valid()) return;
        if (!fetched || fetched.id !== target) {
          clearWith(notFoundMessage);
          return;
        }
        const suppressed = options.suppressResponse?.(fetched) ?? null;
        if (suppressed) {
          clearWith(suppressed);
          return;
        }
        loaded = true;
        publish({ order: fetched, error: null });
      } catch (error) {
        if (!valid()) return;
        if (accessDenied(error)) { denyAccess(); return; }
        const status = statusOf(error);
        if (status === 400) { clearWith(invalidIdMessage); return; }
        if (status === 404) { clearWith(notFoundMessage); return; }
        publish({ error: 'Không thể tải chi tiết đơn. Vui lòng thử lại.' });
      } finally {
        if (valid()) publish({ loading: false, refreshing: false });
      }
    })();
    inFlight = request;
    void request.then(() => { if (valid()) inFlight = null; });
    return request;
  }
  /**
   * Forced detail reload with a verified freshness receipt for ambiguous-
   * action unlocks. Resolves true ONLY after a NEW forced GET of the exact
   * current authorized order UUID returns valid unsuppressed detail, remains
   * same owner/active generation/focus, and publishes it. False for
   * unavailable/denied/404/400/503/offline/malformed/wrong-order payloads,
   * stale generations, reused old in-flight requests, and unfocused loaders.
   * Existing refresh/focus semantics and last-good privacy are unchanged.
   */
  function refreshVerified(): Promise<boolean> {
    if (!active || !authorized() || !orderId) return Promise.resolve(false);
    const target = orderDetailTarget(orderId);
    if (!target) { clearWith(invalidIdMessage); return Promise.resolve(false); }
    if (inFlight) return Promise.resolve(false);
    const generation = ++requestGeneration;
    const valid = () => active && authorized() && generation === requestGeneration;
    publish({ loading: !loaded, refreshing: loaded, error: null });
    const request = (async (): Promise<boolean> => {
      try {
        const fetched = await getOrder(target);
        if (!valid()) return false;
        if (!fetched || fetched.id !== target) {
          clearWith(notFoundMessage);
          return false;
        }
        const suppressed = options.suppressResponse?.(fetched) ?? null;
        if (suppressed) {
          clearWith(suppressed);
          return false;
        }
        loaded = true;
        publish({ order: fetched, error: null });
        return true;
      } catch (error) {
        if (!valid()) return false;
        if (accessDenied(error)) { denyAccess(); return false; }
        const status = statusOf(error);
        if (status === 400) { clearWith(invalidIdMessage); return false; }
        if (status === 404) { clearWith(notFoundMessage); return false; }
        publish({ error: 'Không thể tải chi tiết đơn. Vui lòng thử lại.' });
        return false;
      } finally {
        if (valid()) publish({ loading: false, refreshing: false });
      }
    })();
    inFlight = request.then(
      () => undefined,
      () => undefined,
    );
    void request.then(() => { if (valid()) inFlight = null; });
    return request;
  }
  function blur() {
    active = false;
    invalidate();
    unsubscribe?.();
    unsubscribe = undefined;
  }
  return {
    refresh, refreshVerified, blur,
    focus(id: string) {
      blur();
      const nextOwner = session.getUserId();
      if (nextOwner !== ownerId || id !== orderId) { state = initialOrderDetailState; loaded = false; }
      ownerId = nextOwner;
      orderId = id;
      active = true;
      unsubscribe = session.subscribe(() => {
        if (session.getUserId() === ownerId) return;
        ownerId = null;
        denyAccess();
      });
      if (!authorized()) { denyAccess(); return Promise.resolve(); }
      return refresh();
    },
  };
}
