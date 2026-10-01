import type { ServiceOrderItem } from '../../api/orders.api';
import type { TechnicianTimeOff } from '../../api/technician-profile.api';
import { buildWeek, dayKeyVn } from './technician-schedule';

const NOW = Date.parse('2026-09-30T07:00:00Z'); // Wed 30/09/2026 14:00 VN
const order = (id: string, scheduledAt: string, over: Partial<ServiceOrderItem> = {}) =>
  ({ id, status: 'ACCEPTED', scheduledAt, ...over }) as ServiceOrderItem;
const off = (startAt: string, endAt: string) => ({ id: 'x', startAt, endAt, reason: null }) as TechnicianTimeOff;

describe('dayKeyVn', () => {
  it('uses the Vietnam calendar day', () => {
    expect(dayKeyVn('2026-09-30T17:30:00Z')).toBe('2026-10-01');
    expect(dayKeyVn('2026-09-30T16:59:00Z')).toBe('2026-09-30');
    expect(dayKeyVn('nope')).toBeNull();
    expect(dayKeyVn(null)).toBeNull();
  });
});

describe('buildWeek', () => {
  it('returns Monday to Sunday of the current week', () => {
    const week = buildWeek([], [], NOW);
    expect(week.map((d) => d.label)).toEqual(['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']);
    expect(week[0].key).toBe('2026-09-28');
    expect(week[6].key).toBe('2026-10-04');
    expect(buildWeek([], [], NOW, 1)[0].key).toBe('2026-10-05');
    expect(buildWeek([], [], NOW, -1)[0].key).toBe('2026-09-21');
  });

  it('places orders on their VN day sorted by time, skipping cancelled and archived ones', () => {
    const week = buildWeek([
      order('late', '2026-09-30T09:00:00Z'),
      order('early', '2026-09-30T02:00:00Z'),
      order('cancelled', '2026-09-30T03:00:00Z', { status: 'CANCELLED' }),
      order('archived', '2026-09-30T03:00:00Z', { historical: true }),
      order('bad', 'x'),
      order('nextweek', '2026-10-06T03:00:00Z'),
    ], [], NOW);
    expect(week[2].orders.map((o) => o.id)).toEqual(['early', 'late']);
    expect(week.flatMap((d) => d.orders).length).toBe(2);
  });

  it('marks every day covered by a time-off range', () => {
    const week = buildWeek([], [off('2026-09-28T17:00:00.000Z', '2026-10-01T16:59:59.000Z')], NOW);
    expect(week.map((d) => d.timeOff.length)).toEqual([0, 1, 1, 1, 0, 0, 0]);
  });
});
