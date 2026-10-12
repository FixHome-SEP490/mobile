// Pure view logic for the technician Home tab (priority job + this-week stats).
import { isHistoricalOrder, type TechnicianOrderItem, type ServiceOrderItem } from '../../api/orders.api';
import { vnParts, vnWallClockToDate } from '../../utils/vn-time';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const ACTIVE_PRIORITY = ['EN_ROUTE', 'ACCEPTED', 'UNDER_REPAIR', 'IN_PROGRESS'];
const upper = (status: unknown) => String(status ?? '').toUpperCase();

/**
 * Technician Home GET guard. An older request cannot replace a newer list,
 * and an observed historical summary permanently revokes that full DTO in
 * this screen instance. No private data is stored by this guard.
 */
export function createHomeOrdersReadGuard() {
  let generation = 0;
  let active = true;
  const revokedIds = new Set<string>();
  return {
    begin: () => { active = true; return ++generation; },
    isCurrent: (request: number) => active && request === generation,
    invalidate: () => { active = false; generation += 1; },
    resolve(request: number, rows: TechnicianOrderItem[]): {
      orders: ServiceOrderItem[] | null; revokedIds: string[];
    } {
      // A stale successful GET still proves historical access was revoked.
      // Generation controls only which full rows may replace the visible list.
      if (!active) return { orders: null, revokedIds: [] };
      const confirmed: string[] = [];
      for (const row of rows) {
        if (isHistoricalOrder(row) && !revokedIds.has(row.id)) {
          revokedIds.add(row.id);
          confirmed.push(row.id);
        }
      }
      if (request !== generation) return { orders: null, revokedIds: confirmed };
      return {
        orders: rows.filter(
          (row): row is ServiceOrderItem => !isHistoricalOrder(row) && !revokedIds.has(row.id),
        ),
        revokedIds: confirmed,
      };
    },
  };
}

export const isActiveOrder = (o: Pick<ServiceOrderItem, 'status'>) => ACTIVE_PRIORITY.includes(upper(o.status));

/**
 * The one job to surface first: EN_ROUTE (waiting on check-in) > ACCEPTED > repairing,
 * earliest scheduled first within a status. Sanitized historical orders are never picked.
 */
export function pickPriorityJob(orders: TechnicianOrderItem[]): ServiceOrderItem | null {
  const rank = (o: ServiceOrderItem) => {
    const s = upper(o.status);
    return s === 'IN_PROGRESS' ? ACTIVE_PRIORITY.indexOf('UNDER_REPAIR') : ACTIVE_PRIORITY.indexOf(s);
  };
  const candidates = orders.filter((o): o is ServiceOrderItem => !isHistoricalOrder(o)).filter(isActiveOrder);
  candidates.sort(
    (a, b) => rank(a) - rank(b) || (Date.parse(a.scheduledAt) || 0) - (Date.parse(b.scheduledAt) || 0),
  );
  return candidates[0] ?? null;
}

/** Monday 00:00 (Asia/Ho_Chi_Minh) of the week containing `now`, as epoch ms. */
export function startOfWeekVn(now: number): number {
  const p = vnParts(now);
  const sinceMonday = (p.weekday + 6) % 7;
  return vnWallClockToDate(p.year, p.month, p.day - sinceMonday).getTime();
}

export const completedAt = (o: ServiceOrderItem) => o.completionRequestedAt || o.scheduledAt;

export const orderIncome = (o: ServiceOrderItem) => o.laborTotal || o.grandTotal || 0;

/** Completed orders whose completion time falls in the current Mon–Sun week (VN time). */
export function weeklyStats(orders: TechnicianOrderItem[], now: number) {
  const start = startOfWeekVn(now);
  const done = orders.filter((o): o is ServiceOrderItem => !isHistoricalOrder(o)).filter((o) => {
    if (upper(o.status) !== 'COMPLETED') return false;
    const t = Date.parse(completedAt(o));
    return Number.isFinite(t) && t >= start && t < start + WEEK_MS;
  });
  return { completed: done.length, earnings: done.reduce((sum, o) => sum + orderIncome(o), 0) };
}
