import type { BookingItem } from '../../api/bookings.api';

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
  reschedule: (
    id: string,
    preferredStartAt: string,
    preferredEndAt: string,
  ) => Promise<BookingItem>;
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

export async function rescheduleBookingConservative(
  deps: BookingMutationDeps,
  booking: BookingItem,
  preferredStartAt: string,
  preferredEndAt: string,
): Promise<BookingMutationResult> {
  const customerId = deps.getCustomerId();
  const start = Date.parse(preferredStartAt);
  const end = Date.parse(preferredEndAt);
  if (
    !customerId ||
    !sameOwner(booking, customerId) ||
    !canRescheduleBookingConservative(booking) ||
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end <= start ||
    end <= Date.now()
  ) {
    return { kind: 'uncertain', booking: null };
  }

  try {
    await deps.reschedule(
      booking.id,
      preferredStartAt,
      preferredEndAt,
    );
  } catch {
    // Unknown PATCH outcome: reconcile by GET, never blind retry.
  }

  const fresh = await freshOwned(deps, booking.id, customerId);
  if (!fresh) return { kind: 'uncertain', booking: null };
  if (fresh.serviceOrderId) return { kind: 'linked', booking: fresh };
  if (
    fresh.preferredStartAt === preferredStartAt &&
    fresh.preferredEndAt === preferredEndAt
  ) {
    return { kind: 'rescheduled', booking: fresh };
  }
  if (canRescheduleBookingConservative(fresh)) {
    return { kind: 'retryable', booking: fresh };
  }
  return { kind: 'uncertain', booking: fresh };
}
