// Pure view logic for the technician Home tab (priority job + this-week stats).
import type { ServiceOrderItem } from '../../api/orders.api';

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const ACTIVE_PRIORITY = ['EN_ROUTE', 'ACCEPTED', 'UNDER_REPAIR', 'IN_PROGRESS'];
const upper = (status: unknown) => String(status ?? '').toUpperCase();

export const isActiveOrder = (o: Pick<ServiceOrderItem, 'status'>) => ACTIVE_PRIORITY.includes(upper(o.status));

/**
 * The one job to surface first: EN_ROUTE (waiting on check-in) > ACCEPTED > repairing,
 * earliest scheduled first within a status. Sanitized historical orders are never picked.
 */
export function pickPriorityJob(orders: ServiceOrderItem[]): ServiceOrderItem | null {
  const rank = (o: ServiceOrderItem) => {
    const s = upper(o.status);
    return s === 'IN_PROGRESS' ? ACTIVE_PRIORITY.indexOf('UNDER_REPAIR') : ACTIVE_PRIORITY.indexOf(s);
  };
  const candidates = orders.filter((o) => !o.historical && isActiveOrder(o));
  candidates.sort(
    (a, b) => rank(a) - rank(b) || (Date.parse(a.scheduledAt) || 0) - (Date.parse(b.scheduledAt) || 0),
  );
  return candidates[0] ?? null;
}

/** Monday 00:00 (Asia/Ho_Chi_Minh) of the week containing `now`, as epoch ms. */
export function startOfWeekVn(now: number): number {
  const d = new Date(now + VN_OFFSET_MS);
  const sinceMonday = (d.getUTCDay() + 6) % 7;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - sinceMonday) - VN_OFFSET_MS;
}

export const completedAt = (o: ServiceOrderItem) => o.completionRequestedAt || o.scheduledAt;

export const orderIncome = (o: ServiceOrderItem) => o.laborTotal || o.grandTotal || 0;

/** Completed orders whose completion time falls in the current Mon–Sun week (VN time). */
export function weeklyStats(orders: ServiceOrderItem[], now: number) {
  const start = startOfWeekVn(now);
  const done = orders.filter((o) => {
    if (upper(o.status) !== 'COMPLETED') return false;
    const t = Date.parse(completedAt(o));
    return Number.isFinite(t) && t >= start && t < start + WEEK_MS;
  });
  return { completed: done.length, earnings: done.reduce((sum, o) => sum + orderIncome(o), 0) };
}
