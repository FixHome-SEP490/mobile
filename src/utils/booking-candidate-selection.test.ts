import { canChooseTechnicians, mayRequestLinkedReplacement, orderedCandidateIds, toggleCandidate } from './booking-candidate-selection';
import type { BookingItem } from '../api/bookings.api';
import type { ServiceOrderItem } from '../api/orders.api';

const FIRST = '11111111-1111-4111-8111-111111111111';
const SECOND = '22222222-2222-4222-8222-222222222222';
const THIRD = '33333333-3333-4333-8333-333333333333';

describe('Booking customer selects exactly 2 distinct technician USER UUIDs in priority order', () => {
  it('first tap means priority one; second means standby; third is not silently added', () => {
    expect(toggleCandidate([], FIRST)).toEqual([FIRST]);
    expect(toggleCandidate([FIRST], SECOND)).toEqual([FIRST, SECOND]);
    expect(toggleCandidate([FIRST, SECOND], THIRD)).toEqual([FIRST, SECOND]);
    expect(orderedCandidateIds([FIRST, SECOND])).toEqual([FIRST, SECOND]);
  });
  it('tapping selected user removes them and promotes the remaining one', () => {
    expect(toggleCandidate([FIRST, SECOND], FIRST)).toEqual([SECOND]);
    expect(toggleCandidate([FIRST, SECOND], SECOND)).toEqual([FIRST]);
  });
  it('rejects empty, one, duplicated or malformed candidate ids before a POST', () => {
    expect(() => orderedCandidateIds([])).toThrow();
    expect(() => orderedCandidateIds([FIRST])).toThrow();
    expect(() => orderedCandidateIds([FIRST, FIRST])).toThrow();
    expect(() => orderedCandidateIds([FIRST, SECOND, THIRD])).toThrow();
    expect(() => orderedCandidateIds([FIRST, 'technician-profile-01'])).toThrow();
  });
  it('does not offer new shortlist while matching, pending, linked or expired', () => {
    const sample = {
      id: 'booking-1', status: 'SUBMITTED', preferredEndAt: '2030-10-21T10:00:00Z',
    } as BookingItem;
    const now = new Date('2026-09-22T10:00:00Z');
    expect(canChooseTechnicians(sample, now)).toBe(true);
    expect(canChooseTechnicians({ ...sample, status: 'MATCHING' }, now)).toBe(false);
    expect(canChooseTechnicians({ ...sample, status: 'MATCHED', serviceOrderId: 'order-1' }, now)).toBe(false);
    expect(canChooseTechnicians({ ...sample, status: 'SUBMITTED', invitations: [
      { id: 'i-1', bookingId: 'booking-1', priorityOrder: 1, status: 'PENDING', invitedAt: '2026-09-22T09:00:00Z', expiresAt: null },
    ] }, now)).toBe(false);
    expect(canChooseTechnicians({ ...sample, status: 'CLOSED' }, now)).toBe(true);
    expect(canChooseTechnicians({ ...sample, preferredEndAt: '2026-09-21T10:00:00Z' }, now)).toBe(false);
  });
  it('rejects invalid id selection instead of replacing it with a profile ID', () => {
    expect(() => toggleCandidate([], 'not-a-user-uuid')).toThrow();
  });
});

const CUSTOMER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_CUSTOMER_ID = '99999999-9999-4999-8999-999999999999';
const LINKED_BOOKING_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const LINKED_ORDER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const R05_NOW = new Date('2026-09-24T10:00:00Z');

const linkedBooking = (overrides: Partial<BookingItem> = {}): BookingItem => ({
  id: LINKED_BOOKING_ID,
  customerId: CUSTOMER_ID,
  serviceOrderId: LINKED_ORDER_ID,
  serviceId: 'service-1',
  addressId: 'address-1',
  description: 'Replacement round',
  status: 'CLOSED',
  urgency: 'NORMAL',
  preferredStartAt: '2026-09-25T10:00:00Z',
  preferredEndAt: '2026-09-25T12:00:00Z',
  createdAt: '2026-09-20T08:00:00Z',
  invitations: [
    { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', bookingId: LINKED_BOOKING_ID, priorityOrder: 1, status: 'DECLINED', invitedAt: '2026-09-20T09:00:00Z', expiresAt: null },
    { id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', bookingId: LINKED_BOOKING_ID, priorityOrder: 2, status: 'EXPIRED', invitedAt: '2026-09-20T09:00:00Z', expiresAt: '2026-09-20T10:00:00Z' },
  ],
  ...overrides,
} as BookingItem);

const linkedOrder = (overrides: Partial<ServiceOrderItem> = {}): ServiceOrderItem => ({
  id: LINKED_ORDER_ID,
  code: 'FH-20260920-ABCD1234',
  bookingId: LINKED_BOOKING_ID,
  serviceName: 'Tap repair',
  status: 'ACCEPTED',
  customerName: 'An',
  customerPhone: '090',
  addressSummary: 'HCM',
  scheduledAt: '2026-09-25T10:00:00Z',
  laborTotal: 100,
  partsTotal: 0,
  grandTotal: 100,
  paymentStatus: 'UNPAID',
  createdAt: '2026-09-20T09:00:00Z',
  ...overrides,
} as ServiceOrderItem);

describe('R05 mayRequestLinkedReplacement tentative CTA (Backend POST stays final authority)', () => {
  it('R01/R02: unlinked SUBMITTED/CLOSED keeps the original guard and never shows the linked CTA', () => {
    const now = new Date('2026-09-22T10:00:00Z');
    const submitted = { id: 'booking-1', status: 'SUBMITTED', preferredEndAt: '2030-10-21T10:00:00Z' } as BookingItem;
    expect(canChooseTechnicians(submitted, now)).toBe(true);
    expect(mayRequestLinkedReplacement(submitted, null, CUSTOMER_ID, now)).toBe(false);
    const closed = { ...submitted, status: 'CLOSED' } as BookingItem;
    expect(canChooseTechnicians(closed, now)).toBe(true);
    expect(mayRequestLinkedReplacement(closed, null, CUSTOMER_ID, now)).toBe(false);
  });
  it('R03: unlinked MATCHING with a live invite stays closed on both predicates', () => {
    const now = new Date('2026-09-22T10:00:00Z');
    const matching = {
      id: 'booking-1', status: 'MATCHING', preferredEndAt: '2030-10-21T10:00:00Z',
      invitations: [
        { id: 'i-1', bookingId: 'booking-1', priorityOrder: 1, status: 'PENDING', invitedAt: '2026-09-22T09:00:00Z', expiresAt: null },
      ],
    } as BookingItem;
    expect(canChooseTechnicians(matching, now)).toBe(false);
    expect(mayRequestLinkedReplacement(matching, null, CUSTOMER_ID, now)).toBe(false);
  });
  it('R05: linked CLOSED + ACCEPTED/EN_ROUTE + exhausted invitations + future window + owner match is tentative true', () => {
    expect(mayRequestLinkedReplacement(linkedBooking(), linkedOrder(), CUSTOMER_ID, R05_NOW)).toBe(true);
    expect(mayRequestLinkedReplacement(linkedBooking(), linkedOrder({ status: 'EN_ROUTE' }), CUSTOMER_ID, R05_NOW)).toBe(true);
  });
  it('R04/R06: linked MATCHING, MATCHED, or terminal order statuses never show the CTA', () => {
    expect(mayRequestLinkedReplacement(linkedBooking({ status: 'MATCHING' }), linkedOrder(), CUSTOMER_ID, R05_NOW)).toBe(false);
    expect(mayRequestLinkedReplacement(linkedBooking({ status: 'MATCHED' }), linkedOrder(), CUSTOMER_ID, R05_NOW)).toBe(false);
    for (const orderStatus of ['UNDER_REPAIR', 'COMPLETED', 'CANCELLED'] as const) {
      expect(mayRequestLinkedReplacement(linkedBooking(), linkedOrder({ status: orderStatus }), CUSTOMER_ID, R05_NOW)).toBe(false);
    }
  });
  it('R06: a live PENDING/STANDBY invitation blocks the CTA even on linked CLOSED', () => {
    for (const live of ['PENDING', 'STANDBY'] as const) {
      const booking = linkedBooking({
        invitations: [
          { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', bookingId: LINKED_BOOKING_ID, priorityOrder: 1, status: live, invitedAt: '2026-09-24T09:00:00Z', expiresAt: null },
        ],
      });
      expect(mayRequestLinkedReplacement(booking, linkedOrder(), CUSTOMER_ID, R05_NOW)).toBe(false);
    }
  });
  it('R06: missing/null invitation array fails closed (cannot prove the round is exhausted)', () => {
    expect(mayRequestLinkedReplacement(linkedBooking({ invitations: null }), linkedOrder(), CUSTOMER_ID, R05_NOW)).toBe(false);
    const { invitations: _dropped, ...withoutInvitations } = linkedBooking();
    expect(mayRequestLinkedReplacement(withoutInvitations as BookingItem, linkedOrder(), CUSTOMER_ID, R05_NOW)).toBe(false);
  });
  it('R06/R10: wrong order crosswalk, wrong customer, or malformed IDs fail closed', () => {
    expect(mayRequestLinkedReplacement(linkedBooking(), linkedOrder({ bookingId: 'ffffffff-ffff-4fff-8fff-ffffffffffff' }), CUSTOMER_ID, R05_NOW)).toBe(false);
    expect(mayRequestLinkedReplacement(linkedBooking({ serviceOrderId: 'ffffffff-ffff-4fff-8fff-ffffffffffff' }), linkedOrder(), CUSTOMER_ID, R05_NOW)).toBe(false);
    expect(mayRequestLinkedReplacement(linkedBooking(), linkedOrder(), OTHER_CUSTOMER_ID, R05_NOW)).toBe(false);
    expect(mayRequestLinkedReplacement(linkedBooking(), linkedOrder(), null, R05_NOW)).toBe(false);
    expect(mayRequestLinkedReplacement(linkedBooking({ id: 'not-a-uuid' }), linkedOrder(), CUSTOMER_ID, R05_NOW)).toBe(false);
    expect(mayRequestLinkedReplacement(linkedBooking(), null, CUSTOMER_ID, R05_NOW)).toBe(false);
    expect(mayRequestLinkedReplacement(null, linkedOrder(), CUSTOMER_ID, R05_NOW)).toBe(false);
  });
  it('R06: expired or malformed time window fails closed', () => {
    expect(mayRequestLinkedReplacement(linkedBooking({ preferredEndAt: '2026-09-23T10:00:00Z' }), linkedOrder(), CUSTOMER_ID, R05_NOW)).toBe(false);
    expect(mayRequestLinkedReplacement(
      linkedBooking({ preferredStartAt: '2026-09-25T12:00:00Z', preferredEndAt: '2026-09-25T10:00:00Z' }),
      linkedOrder(), CUSTOMER_ID, R05_NOW,
    )).toBe(false);
    expect(mayRequestLinkedReplacement(linkedBooking({ preferredEndAt: 'not-a-date' }), linkedOrder(), CUSTOMER_ID, R05_NOW)).toBe(false);
  });
  it('R06: the historical order technician presenter never proves or blocks the CTA', () => {
    const withStaleTech = linkedOrder({ technician: { id: 't-1', fullName: 'Old Tech', phoneNumber: '090', averageRating: 4 } });
    expect(mayRequestLinkedReplacement(linkedBooking(), withStaleTech, CUSTOMER_ID, R05_NOW)).toBe(true);
    expect(mayRequestLinkedReplacement(linkedBooking(), linkedOrder({ technician: undefined }), CUSTOMER_ID, R05_NOW)).toBe(true);
  });
  it('does not flip the global unlinked guard for linked bookings', () => {
    expect(canChooseTechnicians(linkedBooking(), R05_NOW)).toBe(false);
  });
});