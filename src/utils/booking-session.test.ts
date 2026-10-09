import { canDepartNow, sessionLabel } from './booking-session';

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
