import type { ServiceOrderItem } from '../../api/orders.api';
import { fetchAllOrders, summarizeEarnings } from './technician-earnings';

const NOW = Date.parse('2026-09-30T07:00:00Z'); // Wed 30/09/2026 VN
const done = (id: string, at: string, labor: number, over: Record<string, unknown> = {}) =>
  ({ id, code: `FH-${id}`, serviceName: 'Sửa', status: 'COMPLETED', completionRequestedAt: at, scheduledAt: at, laborTotal: labor, grandTotal: labor, ...over }) as unknown as ServiceOrderItem;

describe('summarizeEarnings', () => {
  const orders = [
    done('a', '2026-09-29T05:00:00Z', 300000), // this week, September
    done('b', '2026-09-22T05:00:00Z', 200000), // last week, September
    done('c', '2026-08-10T05:00:00Z', 900000), // August
    done('d', '2026-09-29T05:00:00Z', 111, { status: 'ACCEPTED' }),
    done('e', '2026-09-29T05:00:00Z', 999, { historical: true }),
  ];
  const s = summarizeEarnings(orders, NOW);

  it('buckets completed orders by week, oldest first, ending with the current week', () => {
    expect(s.weeks).toHaveLength(8);
    expect(s.weeks[7]).toMatchObject({ key: '2026-09-28', label: '28/09', amount: 300000, count: 1 });
    expect(s.weeks[6]).toMatchObject({ key: '2026-09-21', amount: 200000, count: 1 });
  });

  it('buckets by month and ignores open or archived orders', () => {
    expect(s.months.map((m) => m.label)).toEqual(['T4', 'T5', 'T6', 'T7', 'T8', 'T9']);
    expect(s.months[5]).toMatchObject({ amount: 500000, count: 2 });
    expect(s.months[4]).toMatchObject({ amount: 900000, count: 1 });
    expect(s.totalAmount).toBe(1400000);
    expect(s.totalCount).toBe(3);
  });

  it('finds the best order and copes with no data', () => {
    expect(s.best).toMatchObject({ id: 'c', amount: 900000 });
    const empty = summarizeEarnings([], NOW);
    expect(empty.best).toBeNull();
    expect(empty.totalAmount).toBe(0);
  });

  it('rolls months back across a year boundary', () => {
    const jan = summarizeEarnings([], Date.parse('2027-01-15T00:00:00Z'));
    expect(jan.months.map((m) => m.key)).toEqual(['2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-01']);
  });
});

describe('fetchAllOrders', () => {
  const page = (n: number) => Array.from({ length: n }, (_, i) => done(String(i), '2026-09-01T00:00:00Z', 1));
  it('walks pages until the total is reached', async () => {
    const getPage = jest.fn()
      .mockResolvedValueOnce({ data: page(100), total: 130 })
      .mockResolvedValueOnce({ data: page(30), total: 130 });
    const res = await fetchAllOrders(getPage);
    expect(res.orders).toHaveLength(130);
    expect(res.truncated).toBe(false);
    expect(getPage.mock.calls).toEqual([[1, 100], [2, 100]]);
  });
  it('reports truncation when the page cap cuts the list short', async () => {
    const getPage = jest.fn().mockResolvedValue({ data: page(100), total: 900 });
    const res = await fetchAllOrders(getPage, 2);
    expect(res.orders).toHaveLength(200);
    expect(res.truncated).toBe(true);
  });
});
