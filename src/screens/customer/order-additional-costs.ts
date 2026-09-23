import { orderDetailTarget } from './customer-order-detail';
import type { CostRequest } from '../../api/orders.api';

/**
 * P3B11 GET-only additional-cost proposals, shared by the customer and
 * technician detail screens. Reads `GET /service-orders/:id/additional-costs`
 * only after the caller confirms an authorized full order detail for the same
 * real ServiceOrder UUID (never historical technician summaries). Renders an
 * allowlisted view only: no raw records, evidence URLs, or third-party
 * identifiers ever enter state, logs, or UI. Amounts are labeled by Backend
 * status (proposed vs approved) and never as paid. No decision, create,
 * payment, or persistence lives here.
 */

export type AdditionalCostStatus =
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'SUPERSEDED'
  | 'UNKNOWN';

export interface AdditionalCostItemView {
  id: string;
  description: string;
  quantity: number;
  lineTotalText: string | null;
  /**
   * Raw Backend item type for the LABOR-only decision safety gate
   * (P3B13 fail-closed: only exact 'labor' lines are decidable).
   * Display-neutral; never rendered directly.
   */
  itemType: string | null;
}

export interface AdditionalCostView {
  id: string;
  status: AdditionalCostStatus;
  reason: string;
  laborText: string | null;
  partsText: string | null;
  expiresText: string | null;
  /**
   * Raw server expiry for the decision gate (blocklist when past).
   * Display uses expiresText; Backend remains the final authority.
   */
  expiresAt: string | null;
  items: AdditionalCostItemView[];
}

export interface AdditionalCostsState {
  requests: AdditionalCostView[];
  loading: boolean;
  error: string | null;
  /** Real read-only retry affordance; false when unauthorized (button disabled). */
  canRetry: boolean;
}

export const initialAdditionalCostsState: AdditionalCostsState = {
  requests: [],
  loading: false,
  error: null,
  canRetry: false,
};

const deniedMessage = 'Không có quyền xem chi phí phát sinh.';
const failedMessage = 'Không thể tải chi phí phát sinh. Vui lòng thử lại.';
const unavailableMessage = 'Dịch vụ chi phí phát sinh tạm thời không khả dụng. Vui lòng thử lại.';

/** Human-readable Backend status; UNKNOWN stays neutral, never implies payment. */
export function additionalCostStatusLabel(status: AdditionalCostStatus): string {
  switch (status) {
    case 'PENDING_APPROVAL':
      return 'Chờ duyệt';
    case 'APPROVED':
      return 'Đã duyệt';
    case 'REJECTED':
      return 'Đã từ chối';
    case 'EXPIRED':
      return 'Đã hết hạn';
    case 'CANCELLED':
      return 'Đã hủy';
    case 'SUPERSEDED':
      return 'Đã thay thế';
    case 'UNKNOWN':
      return 'Không rõ';
  }
}

function statusOf(error: unknown): number | undefined {
  return (error as { response?: { status?: number } } | null)?.response?.status;
}

/**
 * Lossless money only: finite numbers or exact numeric strings (bigint DB
 * serialization) within the safe-integer range render; anything else —
 * including overflow — falls back so no invalid amount displays as money.
 */
export function costMoneyText(value: unknown): string | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) && Number.isSafeInteger(value) && value >= 0
      ? `${value.toLocaleString('vi-VN')}đ`
      : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) return null;
    const parsed = Number(trimmed);
    return Number.isSafeInteger(parsed) ? `${parsed.toLocaleString('vi-VN')}đ` : null;
  }
  return null;
}

function dateText(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return null;
  return new Date(time).toLocaleString('vi-VN');
}

function costStatusOf(value: unknown): AdditionalCostStatus {
  const normalized = typeof value === 'string' ? value.toUpperCase() : '';
  return normalized === 'PENDING_APPROVAL' ||
    normalized === 'APPROVED' ||
    normalized === 'REJECTED' ||
    normalized === 'EXPIRED' ||
    normalized === 'CANCELLED' ||
    normalized === 'SUPERSEDED'
    ? normalized
    : 'UNKNOWN';
}

function itemsList(value: unknown): AdditionalCostItemView[] {
  if (!Array.isArray(value)) return [];
  const items: AdditionalCostItemView[] = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue;
    const record = entry as Record<string, unknown>;
    const id = typeof record.id === 'string' ? record.id.trim() : '';
    if (!id) continue;
    const description = typeof record.description === 'string' ? record.description.trim() : '';
    if (!description) continue;
    const quantity = typeof record.quantity === 'number' &&
      Number.isInteger(record.quantity) && record.quantity > 0
      ? record.quantity
      : 0;
    if (quantity <= 0) continue;
    const itemType = typeof record.type === 'string' ? record.type : null;
    items.push({ id, description, quantity, lineTotalText: costMoneyText(record.lineTotal), itemType });
  }
  return items;
}

/**
 * Sanitize one raw cost record into the renderable allowlist. Returns null
 * for anything that must never render (wrong order, blank/non-UUID id).
 * Only display fields enter the view: evidence URLs, technician/customer
 * identifiers, and raw finance metadata can never leak into state or UI.
 */
export function sanitizeCostRequest(
  serviceOrderId: string,
  record: unknown,
): AdditionalCostView | null {
  if (typeof record !== 'object' || record === null) return null;
  const row = record as Record<string, unknown>;
  const id = typeof row.id === 'string' ? row.id.trim() : '';
  if (!id || !orderDetailTarget(id)) return null;
  if (row.serviceOrderId !== serviceOrderId) return null;
  const reason = typeof row.reason === 'string' && row.reason.trim().length > 0 ? row.reason : null;
  if (!reason) return null;
  const expiresAt = typeof row.expiresAt === 'string' && row.expiresAt.length > 0 ? row.expiresAt : null;
  return {
    id,
    status: costStatusOf(row.status),
    reason,
    laborText: costMoneyText(row.totalLaborDelta),
    partsText: costMoneyText(row.totalPartsDelta),
    expiresText: dateText(row.expiresAt),
    expiresAt,
    items: itemsList(row.items),
  };
}

export function createAdditionalCostsController(
  getAdditionalCosts: (id: string) => Promise<CostRequest[]>,
  write: (state: AdditionalCostsState) => void,
) {
  let state: AdditionalCostsState = { ...initialAdditionalCostsState };
  let activeOrderId: string | null = null;
  let loadedFor: string | null = null;
  let generation = 0;
  let inFlight: Promise<boolean> | null = null;

  const isClean =
    () =>
      activeOrderId === null &&
      loadedFor === null &&
      inFlight === null &&
      state.requests.length === 0 &&
      !state.loading &&
      state.error === null &&
      !state.canRetry;

  const publish = (patch: Partial<AdditionalCostsState>) => {
    state = { ...state, ...patch };
    write(state);
  };

  function purge() {
    generation += 1;
    inFlight = null;
    activeOrderId = null;
    loadedFor = null;
    if (isClean()) return;
    state = { requests: [], loading: false, error: null, canRetry: false };
    write(state);
  }

  async function load(
    target: string,
    gen: number,
    isReadable: () => boolean,
  ): Promise<boolean> {
    publish({ loading: true, error: null });
    try {
      const rows = await getAdditionalCosts(target);
      if (gen !== generation || activeOrderId !== target) return false;
      if (!isReadable()) {
        purge();
        return false;
      }
      loadedFor = target;
      const requests = Array.isArray(rows)
        ? rows
          .map((row) => sanitizeCostRequest(target, row))
          .filter((view): view is AdditionalCostView => view !== null)
        : [];
      publish({ requests, loading: false, error: null, canRetry: false });
      return true;
    } catch (error) {
      if (gen !== generation || activeOrderId !== target) return false;
      if (!isReadable()) {
        purge();
        return false;
      }
      const status = statusOf(error);
      if (status === 401 || status === 403) {
        generation += 1;
        inFlight = null;
        activeOrderId = null;
        loadedFor = null;
        state = { requests: [], loading: false, error: deniedMessage, canRetry: false };
        write(state);
        return false;
      }
      if (status === 404) {
        loadedFor = target;
        publish({ requests: [], loading: false, error: null, canRetry: false });
        return false;
      }
      loadedFor = null;
      publish({
        loading: false,
        error: status === 503 ? unavailableMessage : failedMessage,
        canRetry: true,
      });
      return false;
    }
  }

  function startLoad(target: string, isReadable: () => boolean): Promise<boolean> {
    const gen = ++generation;
    const request = load(target, gen, isReadable).then((fresh) => {
      if (inFlight === request) inFlight = null;
      return fresh;
    });
    inFlight = request;
    return request;
  }

  return {
    focusCosts(orderId: string, isReadable: () => boolean): Promise<void> {
      if (!isReadable()) {
        purge();
        return Promise.resolve();
      }
      if (activeOrderId === orderId && inFlight) return inFlight.then(() => undefined);
      // One GET per successful focus; blur purges so refocus always refetches.
      if (activeOrderId === orderId && loadedFor === orderId) {
        return Promise.resolve();
      }
      activeOrderId = orderId;
      return startLoad(orderId, isReadable).then(() => undefined);
    },
    /**
     * Parent pull-to-refresh may refetch costs once for the same order.
     * Resolves true ONLY when this call performed a fresh authorized GET
     * that returned a valid list for the still-current order. Reused
     * in-flight requests, denials, 404s, errors, and stale responses all
     * resolve false and must never release an ambiguous-action lock.
     */
    refreshCosts(isReadable: () => boolean): Promise<boolean> {
      const target = activeOrderId;
      if (!target) return Promise.resolve(false);
      if (inFlight) return Promise.resolve(false);
      if (!isReadable()) {
        purge();
        return Promise.resolve(false);
      }
      return startLoad(target, isReadable);
    },
    blurCosts(): void {
      purge();
    },
  };
}
