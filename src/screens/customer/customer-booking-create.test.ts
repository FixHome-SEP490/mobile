import type { BookingItem } from '../../api/bookings.api';
import {
  addressReadyForBooking,
  classifyBookingCreatePostError,
  findCreatedBookingEvidence,
  type BookingCreationAttempt,
} from './customer-booking-create';

const attempt: BookingCreationAttempt = {
  ownerUserId: 'customer-a',
  serviceId: '11111111-1111-4111-8111-111111111111',
  addressId: '22222222-2222-4222-8222-222222222222',
  description: 'Máy lạnh chảy nước',
  preferredStartAt: '2026-09-26T02:00:00.000Z',
  preferredEndAt: '2026-09-26T04:00:00.000Z',
  baselineIds: ['old-booking'],
};

function booking(overrides: Partial<BookingItem> = {}): BookingItem {
  return {
    id: 'new-booking',
    customerId: 'customer-a',
    serviceId: attempt.serviceId,
    addressId: attempt.addressId,
    description: attempt.description,
    preferredAt: attempt.preferredStartAt,
    preferredStartAt: attempt.preferredStartAt,
    preferredEndAt: attempt.preferredEndAt,
    urgency: 'NORMAL',
    status: 'SUBMITTED',
    createdAt: '2026-09-25T03:00:00.000Z',
    ...overrides,
  };
}

describe('customer booking create safety helpers', () => {
  it.each([
    [400, 'definitive'],
    [401, 'definitive'],
    [403, 'definitive'],
    [404, 'definitive'],
    [422, 'definitive'],
    [409, 'ambiguous'],
    [500, 'ambiguous'],
    [503, 'ambiguous'],
  ] as const)('classifies HTTP %s as %s', (status, expected) => {
    expect(classifyBookingCreatePostError({ response: { status } })).toBe(expected);
  });

  it('keeps timeout/offline/unknown failures ambiguous', () => {
    expect(classifyBookingCreatePostError({ code: 'ECONNABORTED' })).toBe(
      'ambiguous',
    );
    expect(classifyBookingCreatePostError(new Error('offline'))).toBe(
      'ambiguous',
    );
  });

  it('requires finite in-range coordinates for a saved repair address', () => {
    expect(addressReadyForBooking({ lat: 10.7769, lng: 106.7009 })).toBe(true);
    expect(addressReadyForBooking({ lat: 0, lng: 0 })).toBe(true);
    expect(addressReadyForBooking({ lat: Number.NaN, lng: 106 })).toBe(false);
    expect(addressReadyForBooking({ lat: 91, lng: 106 })).toBe(false);
    expect(
      addressReadyForBooking({ lat: null as unknown as number, lng: 106 }),
    ).toBe(false);
  });

  it('accepts exactly one new exact owned-history row as positive evidence', () => {
    expect(findCreatedBookingEvidence(attempt, [booking()])?.id).toBe(
      'new-booking',
    );
  });

  it('does not treat a baseline booking as new evidence', () => {
    expect(
      findCreatedBookingEvidence(attempt, [booking({ id: 'old-booking' })]),
    ).toBeNull();
  });

  it('keeps the lock when no pre-POST baseline was captured', () => {
    expect(
      findCreatedBookingEvidence({ ...attempt, baselineIds: null }, [booking()]),
    ).toBeNull();
  });

  it.each([
    ['owner', { customerId: 'different-customer' }],
    ['service', { serviceId: 'different-service' }],
    ['address', { addressId: 'different-address' }],
    ['description', { description: 'Khác' }],
    ['start', { preferredStartAt: '2026-09-26T03:00:00.000Z' }],
    ['end', { preferredEndAt: '2026-09-26T05:00:00.000Z' }],
  ])('rejects a %s mismatch during reconciliation', (_label, overrides) => {
    expect(
      findCreatedBookingEvidence(attempt, [booking(overrides)]),
    ).toBeNull();
  });

  it('keeps the lock when multiple exact new rows make the outcome non-unique', () => {
    expect(
      findCreatedBookingEvidence(attempt, [
        booking({ id: 'new-1' }),
        booking({ id: 'new-2' }),
      ]),
    ).toBeNull();
  });
});
