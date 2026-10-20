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
    expect(list).toHaveLength(41);
    expect(list[list.length - 1]).toEqual({ date: '2026-10-28', slot: 'evening' });
  });

  it('keeps the evening open until 23:00 and books it from now once it has started', () => {
    const evening = new Date('2026-10-15T13:30:00Z'); // 20:30 Vietnam time
    expect(upcomingSessions(1, evening)).toEqual([{ date: '2026-10-15', slot: 'evening' }]);
    expect(upcomingSessions(1, new Date('2026-10-15T16:00:00Z')).some((s) => s.date === '2026-10-15')).toBe(false); // 23:00
    expect(buildScheduleWindow({ mode: 'scheduled', date: '2026-10-15', slot: 'evening' }, evening)).toEqual({
      mode: 'scheduled', date: '2026-10-15', slot: 'evening',
      preferredStartAt: '2026-10-15T13:30:00.000Z', preferredEndAt: '2026-10-15T16:00:00.000Z',
    });
    expect(buildScheduleWindow({ mode: 'scheduled', date: '2026-10-16', slot: 'evening' }, now).preferredStartAt).toBe('2026-10-16T11:00:00.000Z');
    expect(sessionLabel({ bookingMode: 'scheduled', slot: 'evening', start: '2026-10-15T11:00:00Z' })).toBe('Buổi tối (18:00 - 23:00), 15/10/2026');
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
