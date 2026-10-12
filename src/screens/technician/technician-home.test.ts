import type { ServiceOrderItem } from '../../api/orders.api';
import { createHomeOrdersReadGuard, pickPriorityJob, startOfWeekVn, weeklyStats } from './technician-home';

const order = (id: string, status: string, over: Partial<ServiceOrderItem> = {}) =>
  ({ id, status, scheduledAt: '2026-09-30T03:00:00Z', laborTotal: 0, grandTotal: 0, ...over }) as ServiceOrderItem;

describe('pickPriorityJob', () => {
  it('prefers EN_ROUTE over ACCEPTED over repairing', () => {
    const list = [order('rep', 'UNDER_REPAIR'), order('acc', 'ACCEPTED'), order('route', 'EN_ROUTE')];
    expect(pickPriorityJob(list)?.id).toBe('route');
    expect(pickPriorityJob(list.slice(0, 2))?.id).toBe('acc');
  });

  it('breaks ties with the earliest schedule and treats IN_PROGRESS as repairing', () => {
    const list = [
      order('late', 'ACCEPTED', { scheduledAt: '2026-10-01T03:00:00Z' }),
      order('soon', 'ACCEPTED', { scheduledAt: '2026-09-30T01:00:00Z' }),
    ];
    expect(pickPriorityJob(list)?.id).toBe('soon');
    expect(pickPriorityJob([order('a', 'IN_PROGRESS'), order('b', 'ACCEPTED')])?.id).toBe('b');
  });

  it('ignores historical, completed, cancelled and empty input', () => {
    expect(pickPriorityJob([order('h', 'EN_ROUTE', { historical: true }), order('c', 'COMPLETED'), order('x', 'CANCELLED')])).toBeNull();
    expect(pickPriorityJob([])).toBeNull();
  });
});

describe('startOfWeekVn', () => {
  it('returns Monday 00:00 +07 (= Sunday 17:00 UTC)', () => {
    // Wed 30/09/2026 14:00 VN
    expect(new Date(startOfWeekVn(Date.parse('2026-09-30T07:00:00Z'))).toISOString()).toBe('2026-09-27T17:00:00.000Z');
  });

  it('keeps Sunday in the week that started the previous Monday and rolls at Monday VN midnight', () => {
    // Sun 04/10/2026 23:30 VN → still week of Mon 28/09
    expect(new Date(startOfWeekVn(Date.parse('2026-10-04T16:30:00Z'))).toISOString()).toBe('2026-09-27T17:00:00.000Z');
    // Mon 05/10/2026 00:30 VN → new week
    expect(new Date(startOfWeekVn(Date.parse('2026-10-04T17:30:00Z'))).toISOString()).toBe('2026-10-04T17:00:00.000Z');
  });
});

describe('weeklyStats', () => {
  const now = Date.parse('2026-09-30T07:00:00Z');
  it('counts only completed orders finished this week and sums income', () => {
    const list = [
      order('in', 'COMPLETED', { completionRequestedAt: '2026-09-29T05:00:00Z', laborTotal: 300000 }),
      order('fallback', 'COMPLETED', { completionRequestedAt: undefined, scheduledAt: '2026-09-28T05:00:00Z', grandTotal: 200000 }),
      order('old', 'COMPLETED', { completionRequestedAt: '2026-09-20T05:00:00Z', laborTotal: 999999 }),
      order('open', 'ACCEPTED', { laborTotal: 111 }),
    ];
    expect(weeklyStats(list, now)).toEqual({ completed: 2, earnings: 500000 });
  });

  it('is zero for no data and skips unparsable dates', () => {
    expect(weeklyStats([], now)).toEqual({ completed: 0, earnings: 0 });
    expect(weeklyStats([order('bad', 'COMPLETED', { completionRequestedAt: 'x', scheduledAt: 'y' })], now)).toEqual({ completed: 0, earnings: 0 });
  });
});

it('excludes historical completion and income even if extra private fields arrive', () => {
  const archived = order('archived', 'COMPLETED', { historical: true,
    completionRequestedAt: '2026-09-29T05:00:00Z', laborTotal: 999 });
  expect(weeklyStats([archived], Date.parse('2026-09-30T07:00:00Z'))).toEqual({ completed: 0, earnings: 0 });
});


it('prevents a late full-order GET from resurrecting revoked PII after a historical response', () => {
  const guard = createHomeOrdersReadGuard();
  const full = order('revoked', 'COMPLETED', {
    customerName: 'PRIVATE_CUSTOMER', addressSummary: 'PRIVATE_ADDRESS', laborTotal: 900000,
  });
  const historical = {
    id: full.id, code: 'SO-HIST', status: 'COMPLETED' as const,
    createdAt: '2026-10-09T00:00:00Z', historical: true as const,
  };
  const oldRequest = guard.begin();
  const newerRequest = guard.begin();
  expect(guard.resolve(newerRequest, [historical])).toEqual({ orders: [], revokedIds: ['revoked'] });
  expect(guard.resolve(oldRequest, [full])).toEqual({ orders: null, revokedIds: [] });
  const freshAgain = guard.begin();
  expect(guard.resolve(freshAgain, [full, order('unrelated', 'ACCEPTED')]))
    .toEqual({ orders: [expect.objectContaining({ id: 'unrelated' })], revokedIds: [] });
});

it('ignores results after the Home loader is invalidated', () => {
  const guard = createHomeOrdersReadGuard();
  const oldRequest = guard.begin();
  guard.invalidate();
  expect(guard.isCurrent(oldRequest)).toBe(false);
  expect(guard.resolve(oldRequest, [order('private', 'ACCEPTED')])).toEqual({ orders: null, revokedIds: [] });
});


it('uses stale historical confirmation to purge a full row even when newer GET fails', () => {
  const guard = createHomeOrdersReadGuard();
  const full = order('revoked-2', 'COMPLETED', {
    customerName: 'PRIVATE', addressSummary: 'PRIVATE', laborTotal: 950000,
  });
  const initial = guard.begin();
  expect(guard.resolve(initial, [full]).orders).toEqual([full]);
  const stale = guard.begin();
  const latest = guard.begin();
  // Latest request fails; its generation remains current but cannot erase evidence from stale GET.
  const observed = guard.resolve(stale, [{
    id: full.id, code: 'SO-HIST', status: 'COMPLETED',
    createdAt: '2026-10-09T00:00:00Z', historical: true,
  }]);
  expect(guard.isCurrent(latest)).toBe(true);
  expect(observed).toEqual({ orders: null, revokedIds: ['revoked-2'] });
  const next = guard.begin();
  expect(guard.resolve(next, [full])).toEqual({ orders: [], revokedIds: [] });
});
