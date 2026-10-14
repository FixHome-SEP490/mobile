import type { BookingItem } from '../../api/bookings.api';
import type { AddressData } from '../../api/users.api';

export type BookingCreatePostErrorClass = 'definitive' | 'ambiguous';

const DEFINITIVE_PRECOMMIT_STATUSES = new Set([400, 401, 403, 404, 422]);

function statusOf(error: unknown): number | undefined {
  return (error as { response?: { status?: number } } | null)?.response?.status;
}

export function bookingCreateErrorStatus(error: unknown): number | undefined {
  return statusOf(error);
}

/**
 * Backend create currently rejects these statuses before entering the Booking
 * transaction. Anything else stays conservative because the transaction can
 * commit before a later audit/network failure becomes visible to the client.
 */
export function classifyBookingCreatePostError(
  error: unknown,
): BookingCreatePostErrorClass {
  const status = statusOf(error);
  return status !== undefined && DEFINITIVE_PRECOMMIT_STATUSES.has(status)
    ? 'definitive'
    : 'ambiguous';
}

function coordinate(value: unknown, min: number, max: number): number | null {
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(numeric) && numeric >= min && numeric <= max
    ? numeric
    : null;
}

export function addressReadyForBooking(
  address: Pick<AddressData, 'lat' | 'lng'> | null | undefined,
): boolean {
  if (!address) return false;
  return (
    coordinate(address.lat, -90, 90) !== null &&
    coordinate(address.lng, -180, 180) !== null
  );
}

export interface BookingCreationAttempt {
  ownerUserId: string;
  serviceId: string;
  addressId: string;
  description: string;
  preferredStartAt: string;
  preferredEndAt: string;
  baselineIds: readonly string[] | null;
  confirmedBookingId?: string;
}

/**
 * Only a real server-returned ID correlates this attempt. A unique history row
 * matching content/baseline can belong to another device's identical request.
 */
export function findCreatedBookingEvidence(
  attempt: BookingCreationAttempt,
  rows: readonly BookingItem[],
): BookingItem | null {
  if (!attempt.confirmedBookingId) return null;
  return rows.find(booking => booking.id === attempt.confirmedBookingId && booking.customerId === attempt.ownerUserId) ?? null;
}
