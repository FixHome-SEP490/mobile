import type { BookingItem } from '../../api/bookings.api';
import { canExtendMatching } from './customer-booking-detail';

const now = Date.parse('2026-10-08T03:00:00Z');
const booking = (over: Partial<BookingItem> = {}): BookingItem => ({
  id: 'b1',
  status: 'MATCHING',
  serviceOrderId: null,
  preferredEndAt: '2026-10-08T05:00:00Z',
  invitations: [{ id: 'i1', bookingId: 'b1', priorityOrder: 1, status: 'PENDING', invitedAt: '2026-10-08T02:50:00Z', expiresAt: '2026-10-08T03:20:00Z' }],
  ...over,
} as BookingItem);

test('offers more time only while matching with a pending invitation and a future window', () => {
  expect(canExtendMatching(booking(), now)).toBe(true);
  expect(canExtendMatching(booking({ status: 'CLOSED' }), now)).toBe(false);
  expect(canExtendMatching(booking({ serviceOrderId: 'o1' }), now)).toBe(false);
  expect(canExtendMatching(booking({ preferredEndAt: '2026-10-08T02:00:00Z' }), now)).toBe(false);
  expect(canExtendMatching(booking({ invitations: [] }), now)).toBe(false);
  expect(canExtendMatching(null, now)).toBe(false);
});
