import type { BookingItem, CustomerBookingInvitation } from '../../api/bookings.api';
import type { ServiceOrderItem } from '../../api/orders.api';
import { mayRequestLinkedReplacement } from '../../utils/booking-candidate-selection';

/**
 * P1a render-gate predicate: the visible Booking card, candidates, and picker may only
 * render when the Booking is owned by the CURRENTLY signed-in customer. Customer B must
 * never see customer A's content after an account switch, including the unlinked flow;
 * a missing customerId fails closed (renders nothing private).
 */
export function isVisibleBookingOwner(
  booking: BookingItem | null | undefined,
  currentCustomerId: string | null | undefined,
): boolean {
  if (!booking || typeof currentCustomerId !== 'string' || currentCustomerId.length === 0) return false;
  return typeof booking.customerId === 'string'
    && booking.customerId.length > 0
    && booking.customerId === currentCustomerId;
}

/**
 * R05 linked-replacement POST outcome classification (pure). The locked Backend POST is the
 * sole authority; the client never retries automatically:
 * - 'definitive' (403/404/409/422): server answered, no re-POST; reconcile with a fresh
 *   owner GET and drop the stale draft.
 * - 'denied' (401): authentication lost; hide candidates/technician details, fail closed.
 * - 'ambiguous' (timeout/offline/5xx/unknown): delivery unknown; keep the persisted
 *   support lock and reconcile only on positive new-invitation evidence.
 */
export type LinkedShortlistPostErrorClass = 'definitive' | 'denied' | 'ambiguous';

function responseStatus(error: unknown): number | null {
  const status = (error as { response?: { status?: unknown } } | null)?.response?.status;
  return typeof status === 'number' ? status : null;
}

export function classifyLinkedShortlistPostError(error: unknown): LinkedShortlistPostErrorClass {
  const status = responseStatus(error);
  if (status === 401) return 'denied';
  if (status === 403 || status === 404 || status === 409 || status === 422) return 'definitive';
  return 'ambiguous';
}

/** Stable invitation UUID set; malformed entries are dropped, never trusted. */
export function invitationIds(
  invitations: readonly CustomerBookingInvitation[] | null | undefined,
): string[] {
  if (!Array.isArray(invitations)) return [];
  return invitations
    .filter((invitation) => !!invitation && typeof invitation.id === 'string' && invitation.id.length > 0)
    .map((invitation) => invitation.id);
}

/**
 * Positive server evidence for an ambiguous linked POST: the fresh owner GET carries at
 * least one invitation UUID absent from the pre-POST baseline. A status flip or the old
 * CLOSED/MATCHING list alone is NEVER evidence.
 */
export function hasPositiveNewInvitations(
  baselineIds: readonly string[] | null | undefined,
  current: readonly CustomerBookingInvitation[] | null | undefined,
): boolean {
  if (!Array.isArray(current) || current.length === 0) return false;
  const baseline = new Set(Array.isArray(baselineIds) ? baselineIds : []);
  return invitationIds(current).some((id) => !baseline.has(id));
}

export interface LinkedReselectPrePostSnapshot {
  bookingId: string;
  serviceOrderId: string;
  customerId: string;
  bookingStatus: string;
  orderStatus: string;
  preferredStartAt?: string;
  preferredEndAt?: string;
  invitationIds: readonly string[];
  selectedIds: readonly string[];
  candidateUserIds: readonly string[];
}

function sameIdSet(left: readonly string[], right: readonly string[]): boolean {
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.length === sortedRight.length
    && sortedLeft.every((id, index) => id === sortedRight[index]);
}

/**
 * Pre-POST revalidation: exactly one POST may be sent only when the fresh owner-scoped
 * Booking + original ServiceOrder still match the snapshot taken from what the customer
 * saw (same IDs/crosswalk/customer/statuses/window/invitations) and the manual
 * selection plus candidate identities are unchanged. Any drift fails closed.
 * P1b: the fresh reads are additionally rechecked against the SAME tentative CTA
 * predicate with an injectable dispatch time, so an expired end-of-window blocks the
 * POST even when every snapshot string is byte-identical.
 */
export function validateLinkedReselectPrePost(
  snapshot: LinkedReselectPrePostSnapshot | null | undefined,
  freshBooking: BookingItem | null | undefined,
  freshOrder: ServiceOrderItem | null | undefined,
  currentCustomerId: string | null | undefined,
  selectedIds: readonly string[],
  candidateUserIds: readonly string[],
  now: Date = new Date(),
): boolean {
  if (!snapshot || !freshBooking || !freshOrder) return false;
  if (typeof currentCustomerId !== 'string' || currentCustomerId.length === 0) return false;
  if (freshBooking.id !== snapshot.bookingId || freshOrder.id !== snapshot.serviceOrderId) return false;
  if (freshBooking.serviceOrderId !== snapshot.serviceOrderId || freshOrder.bookingId !== snapshot.bookingId) return false;
  if (freshBooking.customerId !== snapshot.customerId || snapshot.customerId !== currentCustomerId) return false;
  if (String(freshBooking.status).toUpperCase() !== String(snapshot.bookingStatus).toUpperCase()) return false;
  if (String(freshOrder.status).toUpperCase() !== String(snapshot.orderStatus).toUpperCase()) return false;
  if ((freshBooking.preferredStartAt ?? null) !== (snapshot.preferredStartAt ?? null)) return false;
  if ((freshBooking.preferredEndAt ?? null) !== (snapshot.preferredEndAt ?? null)) return false;
  if (!sameIdSet(invitationIds(freshBooking.invitations), snapshot.invitationIds)) return false;
  if (selectedIds.length !== snapshot.selectedIds.length
    || selectedIds.some((id, index) => id !== snapshot.selectedIds[index])) return false;
  if (!sameIdSet(candidateUserIds, snapshot.candidateUserIds)) return false;
  return mayRequestLinkedReplacement(freshBooking, freshOrder, currentCustomerId, now);
}
