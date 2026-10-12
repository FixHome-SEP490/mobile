import { isHistoricalOrder, type TechnicianOrderItem } from '../../api/orders.api';
import {
  initialOrderDetailState,
  orderDetailTarget,
  type OrderDetailState,
} from '../customer/customer-order-detail';
import type { JobsState } from './technician-jobs-loader';
import { vnDateString } from '../../utils/vn-time';

export { isHistoricalOrder } from '../../api/orders.api';

const historicalMessage = 'Đơn này chỉ còn tóm tắt lưu trữ, không xem được chi tiết đầy đủ.';

/**
 * Detail target for an ACTIVE technician job card only: real ServiceOrder UUID.
 * Historical rows, missing ids and Booking ids never produce a target.
 */
export function techOrderDetailTarget(job: { id?: unknown; historical?: unknown } | null | undefined): string | null {
  if (!job || isHistoricalOrder(job)) return null;
  return orderDetailTarget(job.id);
}

function isoDate(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return null;
  return vnDateString(time);
}

/** Display-only dates for a sanitized historical card; never private fields. */
export function historicalSummaryDates(order: unknown): { created: string | null; ended: string | null } {
  const record = (typeof order === 'object' && order !== null ? order : {}) as Record<string, unknown>;
  return {
    created: isoDate(record.createdAt),
    ended: isoDate(record.completedAt) ?? isoDate(record.cancelledAt),
  };
}

interface TechDetailSession {
  getUserId: () => string | null;
  subscribe: (listener: () => void) => () => void;
}

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
 * Technician read-only detail loader: same focus/blur/generation/auth semantics as the
 * customer detail loader, plus suppression of sanitized historical summaries returned
 * by GET (cleared state, safe message, no private fields ever rendered).
 */
export function createTechOrderDetailLoader(
  getOrder: (id: string) => Promise<TechnicianOrderItem>,
  write: (state: OrderDetailState) => void,
  session: TechDetailSession,
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
        if (isHistoricalOrder(fetched)) {
          clearWith(historicalMessage);
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
        if (isHistoricalOrder(fetched)) {
          clearWith(historicalMessage);
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

export type JobsTab = 'all' | 'pending' | 'in_progress' | 'completed';
export type JobsEmptyNote = 'no-match' | 'more-pages';

export interface JobsView {
  filtered: TechnicianOrderItem[];
  showLoadMoreJobs: boolean;
  jobsCoverageText: string | null;
  /** Distinct note when the loaded list has zero matching cards and no error banner. */
  emptyNote: JobsEmptyNote | null;
}

/**
 * Production branch decisions for the Jobs list footer. The screen renders exactly
 * this: tab filtering stays loaded-only and truthful, while the load-more control
 * remains reachable whenever further pages exist — even with zero matching cards.
 */
export function resolveJobsView(
  state: Pick<JobsState, 'jobs' | 'jobsTotal' | 'loading' | 'error'>,
  activeTab: JobsTab,
): JobsView {
  const filtered = state.jobs.filter((job) => {
    const s = String(job.status).toUpperCase();
    if (activeTab === 'pending') return ['ACCEPTED', 'EN_ROUTE'].includes(s);
    if (activeTab === 'in_progress') return ['UNDER_REPAIR', 'IN_PROGRESS'].includes(s);
    if (activeTab === 'completed') return s === 'COMPLETED';
    return true;
  });
  const showLoadMoreJobs = state.jobs.length < state.jobsTotal;
  const jobsCoverageText = state.jobsTotal > 0 || state.jobs.length > 0
    ? `Đang hiển thị ${state.jobs.length}/${state.jobsTotal} việc` : null;
  const emptyNote: JobsEmptyNote | null = (filtered.length > 0 || !!state.error)
    ? null : (showLoadMoreJobs ? 'more-pages' : 'no-match');
  return { filtered, showLoadMoreJobs, jobsCoverageText, emptyNote };
}
