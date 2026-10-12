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
  const page = (n: number, offset = 0) => Array.from({ length: n }, (_, i) => done(String(i + offset), '2026-09-01T00:00:00Z', 1));
  it('walks pages until the total is reached', async () => {
    const getPage = jest.fn()
      .mockResolvedValueOnce({ data: page(100), total: 130 })
      .mockResolvedValueOnce({ data: page(30, 100), total: 130 });
    const res = await fetchAllOrders(getPage);
    expect(res.orders).toHaveLength(130);
    expect(res.truncated).toBe(false);
    expect(getPage.mock.calls).toEqual([[1, 100], [2, 100]]);
  });
  it('reports truncation when the page cap cuts the list short', async () => {
    const getPage = jest.fn().mockImplementation(async (pageNumber: number) => ({ data: page(100, (pageNumber - 1) * 100), total: 900 }));
    const res = await fetchAllOrders(getPage, 2);
    expect(res.orders).toHaveLength(200);
    expect(res.truncated).toBe(true);
  });
});

it('filters historical pages but counts raw rows for coverage at the cap', async () => {
  const history = { id: 'h', code: 'H', status: 'COMPLETED', historical: true,
    createdAt: '2026-09-29T05:00:00Z' };
  const getPage = jest.fn().mockResolvedValue({
    data: [done('a', '2026-09-29T05:00:00Z', 1), ...Array.from({ length: 99 }, () => history)], total: 100,
  });
  const res = await fetchAllOrders(getPage, 1);
  expect(res.orders).toHaveLength(1);
  expect(res.truncated).toBe(true);
  expect(summarizeEarnings(res.orders, NOW).totalCount).toBe(1);
});

it('continues across an all-historical page and uses raw counts for final coverage', async () => {
  const history = { id: 'h', code: 'H', status: 'COMPLETED', historical: true,
    createdAt: '2026-09-29T05:00:00Z' };
  const getPage = jest.fn()
    .mockResolvedValueOnce({ data: Array.from({ length: 100 }, () => history), total: 101 })
    .mockResolvedValueOnce({ data: [done('a', '2026-09-29T05:00:00Z', 3)], total: 101 });
  expect(await fetchAllOrders(getPage, 2)).toMatchObject({ orders: [expect.objectContaining({ id: 'a' })], truncated: true });
  expect(getPage.mock.calls).toEqual([[1, 100], [2, 100]]);
});
it('reports incomplete coverage when only historical pages hit the cap', async () => {
  const history = { id: 'h', code: 'H', status: 'COMPLETED', historical: true,
    createdAt: '2026-09-29T05:00:00Z' };
  const getPage = jest.fn().mockResolvedValue({ data: Array.from({ length: 100 }, () => history), total: 101 });
  expect(await fetchAllOrders(getPage, 1)).toEqual({ orders: [], truncated: true });
});

it('removes earlier full-order income when a later page returns only a historical summary for its ID', async () => {
  const full = done('revoked', '2026-09-29T05:00:00Z', 700000);
  const laterHistory = { id: full.id, code: full.code, historical: true, status: 'COMPLETED',
    createdAt: '2026-09-01T00:00:00Z' };
  const getPage = jest.fn()
    .mockResolvedValueOnce({ data: Array.from({ length: 100 }, (_, i) => i === 0 ? full : done('other-' + i, '2026-09-29T05:00:00Z', 1)), total: 101 })
    .mockResolvedValueOnce({ data: [laterHistory], total: 101 });
  const result = await fetchAllOrders(getPage, 2);
  expect(result.orders.find((item) => item.id === full.id)).toBeUndefined();
  expect(JSON.stringify(result.orders)).not.toContain('700000');
  expect(result.truncated).toBe(true);
});


it('reports incomplete unique coverage and never double-counts an ID repeated across offset pages', async () => {
  const full = (id: string) => done(id, '2026-09-29T05:00:00Z', 10);
  const first = Array.from({ length: 100 }, (_, index) => full('id-' + index));
  const overlap = [full('id-99'), ...Array.from({ length: 49 }, (_, index) => full('id-' + (100 + index)))];
  const getPage = jest.fn()
    .mockResolvedValueOnce({ data: first, total: 150 })
    .mockResolvedValueOnce({ data: overlap, total: 150 });
  const result = await fetchAllOrders(getPage, 2);
  expect(result.orders).toHaveLength(149);
  expect(new Set(result.orders.map((o) => o.id)).size).toBe(149);
  expect(result.truncated).toBe(true);
  expect(summarizeEarnings(result.orders, NOW).totalAmount).toBe(1490);
});

it('reports verified revocation immediately even when a later GET page fails', async () => {
  const archived = { id: 'revoked-a', code: 'H', status: 'COMPLETED',
    historical: true, createdAt: '2026-09-29T00:00:00Z' };
  const first = [archived, ...Array.from({ length: 99 }, (_, index) =>
    done('live-' + index, '2026-09-29T05:00:00Z', 10))];
  const getPage = jest.fn()
    .mockResolvedValueOnce({ data: first, total: 101 })
    .mockRejectedValueOnce(new Error('page 2 timeout'));
  const notify = jest.fn();
  await expect(fetchAllOrders(getPage, 2, notify)).rejects.toThrow('page 2 timeout');
  expect(notify).toHaveBeenCalledWith(['revoked-a']);
  expect(getPage).toHaveBeenCalledTimes(2);
});
