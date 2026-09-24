import type { BookingItem } from '../api/bookings.api';
import type { ServiceOrderItem } from '../api/orders.api';

const USER_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Selection order is the actual customer invitation priority, not Backend rank. */
export function toggleCandidate(selected: readonly string[], userId: string): string[] {
  if (!USER_UUID.test(userId)) throw new Error('Mã người dùng kỹ thuật viên không hợp lệ.');
  if (selected.includes(userId)) return selected.filter((id) => id !== userId);
  if (selected.length >= 2) return [...selected];
  return [...selected, userId];
}

/** Only User UUIDs may be sent. TechnicianProfile UUIDs are never an alternative. */
export function orderedCandidateIds(selected: readonly string[]): readonly [string, string] {
  if (selected.length !== 2 || selected[0] === selected[1] || !selected.every((id) => USER_UUID.test(id))) {
    throw new Error('Vui lòng chọn hai kỹ thuật viên khác nhau theo thứ tự ưu tiên.');
  }
  return [selected[0], selected[1]];
}
/** UI only; Backend revalidates ownership, eligibility and current time on every shortlist. */
export function canChooseTechnicians(booking: BookingItem, now: Date = new Date()): boolean {
  return !booking.serviceOrderId && ['SUBMITTED', 'CLOSED'].includes(booking.status)
    && typeof booking.preferredEndAt === 'string'
    && Number.isFinite(Date.parse(booking.preferredEndAt))
    && Date.parse(booking.preferredEndAt) > now.getTime()
    && !(booking.invitations ?? []).some((invitation) =>
      invitation.status === 'PENDING' || invitation.status === 'STANDBY');
}

/**
 * Tentative linked-replacement CTA predicate (R05). DISPLAY-ONLY: true means the client may
 * *offer* a manual "request two new technicians" attempt for a retained linked ServiceOrder;
 * it is NEVER an eligibility or active-assignment claim. The locked Backend POST alone
 * decides; a 409 rejection is an expected transparent state, not a bypass.
 * Fails closed on: missing/mismatched IDs, non-owner, non-CLOSED booking, non-ACCEPTED/
 * EN_ROUTE order, missing invitation array, any live PENDING/STANDBY, expired/malformed
 * window. The historical order.technician presenter is deliberately ignored.
 */
export function mayRequestLinkedReplacement(
  booking: BookingItem | null | undefined,
  order: ServiceOrderItem | null | undefined,
  currentCustomerId: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!booking || !order) return false;
  if (typeof currentCustomerId !== 'string' || !USER_UUID.test(currentCustomerId)) return false;
  if (typeof booking.id !== 'string' || !USER_UUID.test(booking.id)) return false;
  if (booking.customerId !== currentCustomerId) return false;
  if (typeof booking.serviceOrderId !== 'string' || !USER_UUID.test(booking.serviceOrderId)) return false;
  if (booking.serviceOrderId !== order.id || order.bookingId !== booking.id) return false;
  if (String(booking.status).toUpperCase() !== 'CLOSED') return false;
  const orderStatus = String(order.status).toUpperCase();
  if (orderStatus !== 'ACCEPTED' && orderStatus !== 'EN_ROUTE') return false;
  if (!Array.isArray(booking.invitations)) return false;
  if (booking.invitations.some((invitation) => {
    const status = String(invitation?.status).toUpperCase();
    return status === 'PENDING' || status === 'STANDBY';
  })) return false;
  if (typeof booking.preferredStartAt !== 'string' || typeof booking.preferredEndAt !== 'string') return false;
  const start = Date.parse(booking.preferredStartAt);
  const end = Date.parse(booking.preferredEndAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
  return start < end && end > now.getTime();
}