import type { BookingItem } from '../../api/bookings.api';
import { canCancelBookingConservative } from './customer-booking-manage';

export const STALE_WAITING_MS = 24 * 3600_000;

/** Requests still waiting for a technician more than 24 hours after they were made, oldest first (PO 19/11/2026, same rule as the web). */
export function staleWaitingRequests(bookings: BookingItem[], now: number): BookingItem[] {
  return bookings
    .filter((b) => !b.visitGroupId && canCancelBookingConservative(b) && now - Date.parse(b.createdAt) > STALE_WAITING_MS)
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}
