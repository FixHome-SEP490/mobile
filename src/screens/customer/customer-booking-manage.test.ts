import type { BookingItem } from '../../api/bookings.api';
import {
  canCancelBookingConservative,
  canRescheduleBookingConservative,
  cancelBookingConservative,
  rescheduleBookingConservative,
  type BookingMutationDeps,
} from './customer-booking-manage';

const booking = (overrides: Partial<BookingItem> = {}): BookingItem => ({
  id: 'booking-1',
  customerId: 'customer-a',
  serviceId: 'service-1',
  addressId: 'address-1',
  description: 'fix',
  preferredAt: '2030-10-21T10:00:00Z',
  preferredStartAt: '2030-10-21T10:00:00Z',
  preferredEndAt: '2030-10-21T12:00:00Z',
  urgency: 'NORMAL',
  status: 'SUBMITTED',
  createdAt: '2030-10-20T00:00:00Z',
  ...overrides,
});

function deps(fresh: BookingItem): BookingMutationDeps {
  return {
    getCustomerId: () => 'customer-a',
    getBooking: jest.fn().mockResolvedValue(fresh),
    cancelBooking: jest.fn().mockResolvedValue(fresh),
    reschedule: jest.fn().mockResolvedValue(fresh),
  };
}

it('mirrors conservative Web visibility', () => {
  expect(canCancelBookingConservative(booking({ status: 'SUBMITTED' }))).toBe(true);
  expect(canCancelBookingConservative(booking({ status: 'MATCHING' }))).toBe(true);
  expect(canCancelBookingConservative(booking({ status: 'CLOSED' }))).toBe(true);
  expect(canCancelBookingConservative(booking({ status: 'MATCHED' }))).toBe(false);
  expect(canCancelBookingConservative(booking({ serviceOrderId: 'so-1' }))).toBe(false);

  expect(canRescheduleBookingConservative(booking({ status: 'SUBMITTED' }))).toBe(true);
  expect(canRescheduleBookingConservative(booking({ status: 'MATCHING' }))).toBe(true);
  expect(canRescheduleBookingConservative(booking({ status: 'CLOSED' }))).toBe(false);
  expect(canRescheduleBookingConservative(booking({ serviceOrderId: 'so-1' }))).toBe(false);
});

it('cancel performs one POST then owner GET reconciliation', async () => {
  const fresh = booking({ status: 'CANCELLED' });
  const d = deps(fresh);
  const result = await cancelBookingConservative(d, booking(), 'Không còn nhu cầu');
  expect(d.cancelBooking).toHaveBeenCalledTimes(1);
  expect(d.getBooking).toHaveBeenCalledTimes(1);
  expect(result.kind).toBe('cancelled');
});

it('cancel race to ServiceOrder never retries Booking cancel', async () => {
  const fresh = booking({ status: 'MATCHED', serviceOrderId: 'order-1' });
  const d = deps(fresh);
  (d.cancelBooking as jest.Mock).mockRejectedValue(new Error('race'));
  const result = await cancelBookingConservative(d, booking(), 'Không còn nhu cầu');
  expect(d.cancelBooking).toHaveBeenCalledTimes(1);
  expect(result.kind).toBe('linked');
});

it('reschedule only succeeds after exact GET readback', async () => {
  const start = '2030-10-22T10:00:00Z';
  const end = '2030-10-22T12:00:00Z';
  const fresh = booking({ status: 'SUBMITTED', preferredStartAt: start, preferredEndAt: end });
  const d = deps(fresh);
  const result = await rescheduleBookingConservative(d, booking(), start, end);
  expect(d.reschedule).toHaveBeenCalledTimes(1);
  expect(d.getBooking).toHaveBeenCalledTimes(1);
  expect(result.kind).toBe('rescheduled');
});

it('ambiguous reschedule with unchanged fresh state becomes explicit retryable, not auto-repost', async () => {
  const d = deps(booking());
  (d.reschedule as jest.Mock).mockRejectedValue(new Error('offline'));
  const result = await rescheduleBookingConservative(
    d,
    booking(),
    '2030-10-22T10:00:00Z',
    '2030-10-22T12:00:00Z',
  );
  expect(d.reschedule).toHaveBeenCalledTimes(1);
  expect(result.kind).toBe('retryable');
});
