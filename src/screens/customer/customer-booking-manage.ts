import type { BookingItem } from '../../api/bookings.api';
import type { BookingSchedule } from '../../utils/booking-session';
import { vnParts } from '../../utils/vn-time';

export function canCancelBookingConservative(booking: BookingItem): boolean {
  return (
    !booking.serviceOrderId &&
    ['SUBMITTED', 'MATCHING', 'CLOSED'].includes(
      String(booking.status).toUpperCase(),
    )
  );
}

export function canRescheduleBookingConservative(
  booking: BookingItem,
): boolean {
  return (
    !booking.serviceOrderId &&
    ['SUBMITTED', 'MATCHING'].includes(
      String(booking.status).toUpperCase(),
    )
  );
}

export type BookingMutationResult =
  | { kind: 'cancelled'; booking: BookingItem }
  | { kind: 'rescheduled'; booking: BookingItem }
  | { kind: 'linked'; booking: BookingItem }
  | { kind: 'retryable'; booking: BookingItem }
  | { kind: 'uncertain'; booking: BookingItem | null };

export interface BookingMutationDeps {
  getCustomerId: () => string | null;
  getBooking: (id: string) => Promise<BookingItem>;
  cancelBooking: (id: string, reason: string) => Promise<BookingItem>;
  reschedule: (id: string, schedule: Extract<BookingSchedule, { mode: 'scheduled' }>) => Promise<BookingItem>;
}

function sameOwner(
  booking: BookingItem,
  customerId: string,
): boolean {
  return booking.customerId === customerId;
}

async function freshOwned(
  deps: BookingMutationDeps,
  bookingId: string,
  customerId: string,
): Promise<BookingItem | null> {
  try {
    const fresh = await deps.getBooking(bookingId);
    return sameOwner(fresh, customerId) ? fresh : null;
  } catch {
    return null;
  }
}

export async function cancelBookingConservative(
  deps: BookingMutationDeps,
  booking: BookingItem,
  reason: string,
): Promise<BookingMutationResult> {
  const customerId = deps.getCustomerId();
  const trimmed = reason.trim();
  if (
    !customerId ||
    !sameOwner(booking, customerId) ||
    !canCancelBookingConservative(booking) ||
    trimmed.length < 1 ||
    trimmed.length > 2000
  ) {
    return { kind: 'uncertain', booking: null };
  }

  try {
    await deps.cancelBooking(booking.id, trimmed);
  } catch {
    // Never blind-repost; owner GET below is authoritative.
  }

  const fresh = await freshOwned(deps, booking.id, customerId);
  if (!fresh) return { kind: 'uncertain', booking: null };
  if (String(fresh.status).toUpperCase() === 'CANCELLED') {
    return { kind: 'cancelled', booking: fresh };
  }
  if (fresh.serviceOrderId) return { kind: 'linked', booking: fresh };
  if (canCancelBookingConservative(fresh)) {
    return { kind: 'retryable', booking: fresh };
  }
  return { kind: 'uncertain', booking: fresh };
}

/** The server picks the exact window, so read-back compares the chosen day and session instead. */
function appliedSchedule(fresh: BookingItem, schedule: Extract<BookingSchedule, { mode: 'scheduled' }>): boolean {
  const p = vnParts(fresh.preferredStartAt ?? fresh.preferredAt);
  const day = `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
  return fresh.bookingMode === 'scheduled' && fresh.slot === schedule.slot && day === schedule.date;
}

export async function rescheduleBookingConservative(
  deps: BookingMutationDeps,
  booking: BookingItem,
  schedule: Extract<BookingSchedule, { mode: 'scheduled' }>,
): Promise<BookingMutationResult> {
  const customerId = deps.getCustomerId();
  if (
    !customerId ||
    !sameOwner(booking, customerId) ||
    !canRescheduleBookingConservative(booking)
  ) {
    return { kind: 'uncertain', booking: null };
  }

  try {
    await deps.reschedule(booking.id, schedule);
  } catch {
    // Unknown PATCH outcome: reconcile by GET, never blind retry.
  }

  const fresh = await freshOwned(deps, booking.id, customerId);
  if (!fresh) return { kind: 'uncertain', booking: null };
  if (fresh.serviceOrderId) return { kind: 'linked', booking: fresh };
  if (appliedSchedule(fresh, schedule)) {
    return { kind: 'rescheduled', booking: fresh };
  }
  if (canRescheduleBookingConservative(fresh)) {
    return { kind: 'retryable', booking: fresh };
  }
  return { kind: 'uncertain', booking: fresh };
}
