import type { ServiceOrderItem } from '../../api/orders.api';
import { pickPriorityJob, startOfWeekVn, weeklyStats } from './technician-home';

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
