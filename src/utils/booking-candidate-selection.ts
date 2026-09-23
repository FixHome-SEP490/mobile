import type { BookingItem } from '../api/bookings.api';

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