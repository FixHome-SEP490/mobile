import type { BookingItem } from '../../api/bookings.api';
import {
  bookingDetailTarget,
  bookingNextAction,
  bookingStatusLabel,
  createBookingDetailLoader,
  initialBookingDetailState,
  type BookingDetailState,
} from './customer-booking-detail';

const BOOKING_ID = '11111111-1111-4111-8111-111111111111';
const ORDER_ID = '22222222-2222-4222-8222-222222222222';
const CUSTOMER_ID = '33333333-3333-4333-8333-333333333333';

const booking = (overrides: Partial<BookingItem> = {}): BookingItem => ({
  id: BOOKING_ID,
  customerId: CUSTOMER_ID,
  serviceId: '44444444-4444-4444-8444-444444444444',
  addressId: '55555555-5555-4555-8555-555555555555',
  description: 'Máy lạnh không mát',
  status: 'SUBMITTED',
  urgency: 'NORMAL',
  preferredStartAt: '2030-10-21T10:00:00Z',
  preferredEndAt: '2030-10-21T12:00:00Z',
  createdAt: '2030-10-20T08:00:00Z',
  ...overrides,
} as BookingItem);

it('accepts only a real UUID-shaped Booking target', () => {
  expect(bookingDetailTarget(BOOKING_ID)).toBe(BOOKING_ID);
  expect(bookingDetailTarget('booking-1')).toBeNull();
  expect(bookingDetailTarget('')).toBeNull();
  expect(bookingDetailTarget(undefined)).toBeNull();
});

it.each([
  ['SUBMITTED', 'Đã gửi yêu cầu'],
  ['MATCHING', 'Đang tìm kỹ thuật viên'],
  ['CLOSED', 'Vòng tìm kỹ thuật viên đã kết thúc'],
  ['CANCELLED', 'Đã hủy'],
])('maps Booking status %s to Vietnamese display copy', (status, label) => {
  expect(bookingStatusLabel(status)).toBe(label);
});

it('keeps CLOSED Booking replacement as the primary next action even with a linked historical order', () => {
  expect(bookingNextAction(booking({ status: 'CLOSED', serviceOrderId: ORDER_ID }))).toMatchObject({
    kind: 'choose_technician',
    primaryLabel: 'Chọn lại kỹ thuật viên',
    serviceOrderId: ORDER_ID,
  });
});

it('opens only the authoritative linked ServiceOrder for a non-CLOSED Booking', () => {
  expect(bookingNextAction(booking({ status: 'MATCHED', serviceOrderId: ORDER_ID }))).toMatchObject({
    kind: 'open_order',
    primaryLabel: 'Xem đơn sửa chữa',
    serviceOrderId: ORDER_ID,
  });
});

it('never treats the Booking id itself as a ServiceOrder id', () => {
  const action = bookingNextAction(booking({ status: 'SUBMITTED', serviceOrderId: undefined }));
  expect(action.kind).toBe('choose_technician');
  expect(action.serviceOrderId).toBeNull();
});

function setup() {
  let userId: string | null = CUSTOMER_ID;
  const listeners = new Set<() => void>();
  const getBooking = jest.fn<Promise<BookingItem>, [string]>().mockResolvedValue(booking());
  const write = jest.fn<void, [BookingDetailState]>();
  const loader = createBookingDetailLoader(getBooking, write, {
    getUserId: () => userId,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  });
  const state = () => write.mock.calls.at(-1)?.[0] ?? initialBookingDetailState;
  return {
    getBooking,
    loader,
    state,
    changeUser(id: string | null) {
      userId = id;
      listeners.forEach((listener) => listener());
    },
  };
}

it('loads only the requested Booking owned by the active customer', async () => {
  const h = setup();
  await h.loader.focus(BOOKING_ID);
  expect(h.getBooking).toHaveBeenCalledWith(BOOKING_ID);
  expect(h.state()).toMatchObject({
    booking: expect.objectContaining({ id: BOOKING_ID, customerId: CUSTOMER_ID }),
    loading: false,
    error: null,
  });
});

it('fails closed for a mismatched owner payload', async () => {
  const h = setup();
  h.getBooking.mockResolvedValue(booking({ customerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }));
  await h.loader.focus(BOOKING_ID);
  expect(h.state().booking).toBeNull();
  expect(h.state().error).toContain('Không tìm thấy');
});

it('clears detail when the customer session changes', async () => {
  const h = setup();
  await h.loader.focus(BOOKING_ID);
  h.changeUser(null);
  expect(h.state().booking).toBeNull();
  expect(h.state().error).toContain('quyền');
});
