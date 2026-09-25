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
}

function sameInstant(left?: string | null, right?: string | null): boolean {
  if (!left || !right) return false;
  const leftMs = Date.parse(left);
  const rightMs = Date.parse(right);
  return Number.isFinite(leftMs) && Number.isFinite(rightMs)
    ? leftMs === rightMs
    : left === right;
}

/**
 * Positive-only reconciliation after an ambiguous create POST.
 *
 * Absence is never proof of failure. We only accept one exact owned-history row
 * whose ID did not exist in the pre-POST baseline. Without a baseline, or with
 * zero/multiple exact new rows, the caller must keep the no-repost lock.
 */
export function findCreatedBookingEvidence(
  attempt: BookingCreationAttempt,
  rows: readonly BookingItem[],
): BookingItem | null {
  if (!attempt.baselineIds) return null;
  const baseline = new Set(attempt.baselineIds);

  const matches = rows.filter(
    (booking) =>
      !baseline.has(booking.id) &&
      booking.customerId === attempt.ownerUserId &&
      booking.serviceId === attempt.serviceId &&
      booking.addressId === attempt.addressId &&
      booking.description === attempt.description &&
      sameInstant(
        booking.preferredStartAt ?? booking.preferredAt,
        attempt.preferredStartAt,
      ) &&
      sameInstant(booking.preferredEndAt, attempt.preferredEndAt),
  );

  return matches.length === 1 ? matches[0] : null;
}
