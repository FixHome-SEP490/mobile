// Pure aggregation for the technician earnings screen. Money math stays display-only:
// it sums what the Backend already returned on completed orders.
import type { ServiceOrderItem } from '../../api/orders.api';
import { completedAt, orderIncome, startOfWeekVn } from './technician-home';
import { dayKeyVn } from './technician-schedule';

const DAY_MS = 24 * 60 * 60 * 1000;
export const EARNINGS_PAGE_SIZE = 100;
export const EARNINGS_MAX_PAGES = 5;

/**
 * Load every page of the technician's orders (capped). `truncated` is true when the cap cut the
 * list short, so the screen can say the totals only cover the newest orders.
 */
export async function fetchAllOrders(
  getPage: (page: number, pageSize: number) => Promise<{ data: ServiceOrderItem[]; total: number }>,
  maxPages = EARNINGS_MAX_PAGES,
): Promise<{ orders: ServiceOrderItem[]; truncated: boolean }> {
  const orders: ServiceOrderItem[] = [];
  let total = 0;
  for (let page = 1; page <= maxPages; page += 1) {
    const res = await getPage(page, EARNINGS_PAGE_SIZE);
    total = res.total;
    orders.push(...res.data);
    if (res.data.length < EARNINGS_PAGE_SIZE || orders.length >= total) return { orders, truncated: false };
  }
  return { orders, truncated: orders.length < total };
}

export interface EarningsBucket {
  key: string;
  label: string;
  amount: number;
  count: number;
}

export interface EarningsSummary {
  weeks: EarningsBucket[];
  months: EarningsBucket[];
  totalAmount: number;
  totalCount: number;
  best: { id: string; code: string; serviceName: string; amount: number } | null;
}

const completedOrders = (orders: ServiceOrderItem[]) =>
  orders.filter(
    (o) => !o.historical && String(o.status).toUpperCase() === 'COMPLETED' && dayKeyVn(completedAt(o)) !== null,
  );

/** Last `weekCount` weeks (oldest first, Mon–Sun VN) and last `monthCount` months, plus overall figures. */
export function summarizeEarnings(
  orders: ServiceOrderItem[],
  now: number,
  weekCount = 8,
  monthCount = 6,
): EarningsSummary {
  const completed = completedOrders(orders);
  const thisWeek = startOfWeekVn(now);
  const weeks: EarningsBucket[] = Array.from({ length: weekCount }, (_, i) => {
    const start = thisWeek - (weekCount - 1 - i) * 7 * DAY_MS;
    const inWeek = completed.filter((o) => {
      const t = Date.parse(completedAt(o));
      return t >= start && t < start + 7 * DAY_MS;
    });
    const day = dayKeyVn(start)!;
    return {
      key: day,
      label: `${day.slice(8, 10)}/${day.slice(5, 7)}`,
      amount: inWeek.reduce((s, o) => s + orderIncome(o), 0),
      count: inWeek.length,
    };
  });

  const [ny, nm] = dayKeyVn(now)!.split('-').map(Number);
  const months: EarningsBucket[] = Array.from({ length: monthCount }, (_, i) => {
    const offset = monthCount - 1 - i;
    const idx = ny * 12 + (nm - 1) - offset;
    const y = Math.floor(idx / 12);
    const m = (idx % 12) + 1;
    const key = `${y}-${String(m).padStart(2, '0')}`;
    const inMonth = completed.filter((o) => dayKeyVn(completedAt(o))!.slice(0, 7) === key);
    return {
      key,
      label: `T${m}`,
      amount: inMonth.reduce((s, o) => s + orderIncome(o), 0),
      count: inMonth.length,
    };
  });

  let best: EarningsSummary['best'] = null;
  for (const o of completed) {
    const amount = orderIncome(o);
    if (!best || amount > best.amount) best = { id: o.id, code: o.code, serviceName: o.serviceName, amount };
  }
  return {
    weeks,
    months,
    totalAmount: completed.reduce((s, o) => s + orderIncome(o), 0),
    totalCount: completed.length,
    best,
  };
}
