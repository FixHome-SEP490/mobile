import type { ServiceOrderItem } from '../../api/orders.api';
import {
  createOrderDetailLoader,
  orderDetailTarget,
  type OrderDetailState,
} from '../customer/customer-order-detail';
import type { JobsState } from './technician-jobs-loader';

const historicalMessage = 'Đơn này chỉ còn tóm tắt lưu trữ, không xem được chi tiết đầy đủ.';

/** Backend sanitized history marker — never a full detail payload, never detail-linked. */
export function isHistoricalOrder(order: unknown): boolean {
  return typeof order === 'object' && order !== null
    && (order as { historical?: unknown }).historical === true;
}

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
  return new Date(time).toLocaleDateString('vi-VN');
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

/**
 * Technician read-only detail loader: same focus/blur/generation/auth semantics as the
 * customer detail loader, plus suppression of sanitized historical summaries returned
 * by GET (cleared state, safe message, no private fields ever rendered).
 */
export function createTechOrderDetailLoader(
  getOrder: (id: string) => Promise<ServiceOrderItem>,
  write: (state: OrderDetailState) => void,
  session: TechDetailSession,
) {
  return createOrderDetailLoader(getOrder, write, session, {
    suppressResponse: (fetched) => (isHistoricalOrder(fetched) ? historicalMessage : null),
  });
}

export type JobsTab = 'all' | 'pending' | 'in_progress';
export type JobsEmptyNote = 'no-match' | 'more-pages';

export interface JobsView {
  filtered: ServiceOrderItem[];
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
    return true;
  });
  const showLoadMoreJobs = state.jobs.length < state.jobsTotal;
  const jobsCoverageText = state.jobsTotal > 0 || state.jobs.length > 0
    ? `Đang hiển thị ${state.jobs.length}/${state.jobsTotal} việc` : null;
  const emptyNote: JobsEmptyNote | null = (filtered.length > 0 || !!state.error)
    ? null : (showLoadMoreJobs ? 'more-pages' : 'no-match');
  return { filtered, showLoadMoreJobs, jobsCoverageText, emptyNote };
}
