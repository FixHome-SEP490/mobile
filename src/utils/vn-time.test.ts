import {
  isSameVnDay,
  vnDateString,
  vnDateTimeString,
  vnParts,
  vnTimeString,
  vnTodayCalendarDate,
  vnWallClockToDate,
} from './vn-time';
import { buildBookingWindow, buildCustomerBookingWindow, getBookingDateRange } from './booking-window';

// Every input here is an absolute instant, so these tests must pass whatever
// zone the machine is in. Run them with TZ=UTC and TZ=America/New_York too.

const calendar = (d: Date) => [d.getFullYear(), d.getMonth() + 1, d.getDate()];

describe('vn-time', () => {
  it('reads the Vietnam clock from an instant', () => {
    expect(vnParts('2026-09-30T17:30:00Z')).toEqual({
      year: 2026, month: 10, day: 1, hour: 0, minute: 30, weekday: 4,
    });
  });

  it('turns a Vietnam clock time into the right instant', () => {
    expect(vnWallClockToDate(2026, 10, 1, 9, 0).toISOString()).toBe('2026-10-01T02:00:00.000Z');
    expect(vnWallClockToDate(2026, 12, 31, 23, 30).toISOString()).toBe('2026-12-31T16:30:00.000Z');
  });

  it('shows Vietnam time, not the phone time', () => {
    expect(vnTimeString('2026-09-30T02:05:00Z', { hour: '2-digit', minute: '2-digit' })).toBe('09:05');
    expect(vnDateString('2026-09-30T20:00:00Z', { day: '2-digit', month: '2-digit' })).toMatch(/^01\D10$/);
    expect(vnDateTimeString('2026-09-30T02:05:00Z')).toContain('09:05');
  });

  it('decides "today" by the Vietnam date', () => {
    // 23:00 UTC on 30/09 and 01:00 UTC on 01/10 are both 01/10 in Vietnam.
    expect(isSameVnDay('2026-09-30T23:00:00Z', '2026-10-01T01:00:00Z')).toBe(true);
    // 16:59 UTC is still 30/09 in Vietnam, 17:00 UTC is already 01/10.
    expect(isSameVnDay('2026-09-30T16:59:00Z', '2026-09-30T17:00:00Z')).toBe(false);
  });

  it('offers booking days starting from today in Vietnam', () => {
    // 20:00 UTC on 30/09 is 03:00 on 01/10 in Vietnam.
    const now = new Date('2026-09-30T20:00:00Z');
    expect(calendar(vnTodayCalendarDate(now))).toEqual([2026, 10, 1]);
    const { minimumDate, maximumDate } = getBookingDateRange(now);
    expect(calendar(minimumDate)).toEqual([2026, 10, 1]);
    expect(calendar(maximumDate)).toEqual([2026, 10, 4]);
  });

  it('books the Vietnam clock time the customer picked', () => {
    const now = new Date('2026-09-30T20:00:00Z');
    expect(
      buildCustomerBookingWindow({ date: vnTodayCalendarDate(now, 1), time: '09:00', now }),
    ).toEqual({
      preferredStartAt: '2026-10-02T02:00:00.000Z',
      preferredEndAt: '2026-10-02T04:00:00.000Z',
    });
    expect(buildBookingWindow({ dayOffset: 0, time: '14:00', now }).preferredStartAt).toBe(
      '2026-10-01T07:00:00.000Z',
    );
  });
});
