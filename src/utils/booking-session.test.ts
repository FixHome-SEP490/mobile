import { buildScheduleWindow, canDepartNow, scheduleSummary, sessionDayLabel, sessionLabel, upcomingSessions } from './booking-session';

test('names the session, urgent bookings and older bookings', () => {
  expect(sessionLabel({ bookingMode: 'scheduled', slot: 'morning', start: '2026-10-12T01:00:00Z' })).toBe('Buổi sáng (8:00 - 12:00), 12/10/2026');
  expect(sessionLabel({ bookingMode: 'urgent', start: '2026-10-12T06:00:00Z' })).toBe('Tới ngay');
  expect(sessionLabel({ start: null })).toBe('Chưa có lịch hẹn');
});

test('opens the depart button at departAvailableAt', () => {
  expect(canDepartNow('2026-10-12T00:00:00Z', Date.parse('2026-10-11T23:59:00Z'))).toBe(false);
  expect(canDepartNow('2026-10-12T00:00:00Z', Date.parse('2026-10-12T00:00:00Z'))).toBe(true);
  expect(canDepartNow(null)).toBe(true);
});

describe('session scheduling helpers', () => {
  // Thursday 2026-10-15 10:00 Vietnam time
  const now = new Date('2026-10-15T03:00:00Z');

  it('lists only sessions that have not started, 14 days ahead', () => {
    const list = upcomingSessions(14, now);
    expect(list[0]).toEqual({ date: '2026-10-15', slot: 'afternoon' });
    expect(list).toHaveLength(27);
    expect(list[list.length - 1]).toEqual({ date: '2026-10-28', slot: 'afternoon' });
  });

  it('labels days and summarises the schedule', () => {
    expect(sessionDayLabel('2026-10-15')).toBe('Thứ 5, 15/10');
    expect(scheduleSummary({ mode: 'scheduled', date: '2026-10-16', slot: 'morning' })).toBe('Thứ 6, 16/10 · Sáng 8:00 - 12:00');
    expect(scheduleSummary({ mode: 'urgent' })).toContain('Tới ngay');
  });

  it('turns a session into the server fields plus its window', () => {
    expect(buildScheduleWindow({ mode: 'scheduled', date: '2026-10-16', slot: 'afternoon' }, now)).toEqual({
      mode: 'scheduled', date: '2026-10-16', slot: 'afternoon',
      preferredStartAt: '2026-10-16T06:00:00.000Z', preferredEndAt: '2026-10-16T11:00:00.000Z',
    });
  });

  it('rejects a started session, a day beyond 14 and builds the urgent window from now', () => {
    expect(() => buildScheduleWindow({ mode: 'scheduled', date: '2026-10-15', slot: 'morning' }, now)).toThrow('đã bắt đầu');
    expect(() => buildScheduleWindow({ mode: 'scheduled', date: '2026-11-30', slot: 'morning' }, now)).toThrow('14 ngày');
    expect(buildScheduleWindow({ mode: 'urgent' }, now)).toEqual({
      mode: 'urgent', preferredStartAt: now.toISOString(), preferredEndAt: '2026-10-15T05:00:00.000Z',
    });
  });
});
