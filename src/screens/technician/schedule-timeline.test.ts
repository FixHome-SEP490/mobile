import { buildDayTimeline } from './schedule-timeline';
import type { ScheduleDay } from './technician-schedule';

// 2026-10-15 is a Thursday; +07:00
const at = (hhmm: string) => `2026-10-15T${hhmm}:00+07:00`;
const order = (id: string, hhmm: string) => ({ id, scheduledAt: at(hhmm) }) as never;
const day = (over: Partial<ScheduleDay> = {}): ScheduleDay => ({ key: '2026-10-15', label: 'T5', dayOfMonth: 15, orders: [], timeOff: [], ...over });

describe('buildDayTimeline', () => {
  it('places a 2 h block from the scheduled time', () => {
    const t = buildDayTimeline(day({ orders: [order('a', '09:30')] }), Date.parse(at('08:00')));
    expect(t.blocks[0]).toMatchObject({ startMin: 570, endMin: 690, col: 0, cols: 1 });
    expect([t.startHour, t.endHour]).toEqual([6, 22]);
  });

  it('puts overlapping orders side by side and widens the hour range', () => {
    const t = buildDayTimeline(day({ orders: [order('a', '05:00'), order('b', '06:00'), order('c', '20:00')] }), 0);
    const cols = Object.fromEntries(t.blocks.map((b) => [b.id, [b.col, b.cols]]));
    expect(cols).toEqual({ a: [0, 2], b: [1, 2], c: [0, 2] });
    expect(t.startHour).toBe(5);
  });

  it('clips time off to the day and shows the now line only today', () => {
    const timeOff = [{ id: 't', startAt: '2026-10-14T20:00:00+07:00', endAt: '2026-10-15T12:00:00+07:00', reason: null }];
    const today = buildDayTimeline(day({ timeOff }), Date.parse(at('10:15')));
    expect(today.blocks[0]).toMatchObject({ kind: 'timeoff', startMin: 0, endMin: 720 });
    expect(today.nowMin).toBe(615);
    expect(buildDayTimeline(day({ key: '2026-10-16' }), Date.parse(at('10:15'))).nowMin).toBeNull();
  });
});
