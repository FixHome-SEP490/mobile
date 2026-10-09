import { vnDateString, vnTimeString } from './vn-time';

/**
 * Booking sessions (PO 08/10/2026): a scheduled booking takes the morning
 * (08:00-12:00) or the afternoon (13:00-18:00) of one day, Vietnam time; an
 * urgent booking means "come now". Same labels as the web.
 */
export type BookingSlot = 'morning' | 'afternoon';

export const SLOT_LABELS: Record<BookingSlot, string> = {
  morning: 'Buổi sáng (8:00 - 12:00)',
  afternoon: 'Buổi chiều (13:00 - 18:00)',
};

export function sessionLabel(input: { bookingMode?: string | null; slot?: string | null; start?: string | Date | null }): string {
  if (input.bookingMode === 'urgent') return 'Tới ngay';
  const start = input.start ? new Date(input.start) : null;
  const day = start && Number.isFinite(start.getTime()) ? vnDateString(start) : '';
  if (input.slot === 'morning' || input.slot === 'afternoon') return day ? `${SLOT_LABELS[input.slot]}, ${day}` : SLOT_LABELS[input.slot];
  if (!start || !Number.isFinite(start.getTime())) return 'Chưa có lịch hẹn';
  return `${vnTimeString(start)} ${day}`;
}

/** True once the technician may set out (the server opens it one hour before the appointment). */
export function canDepartNow(departAvailableAt: string | null | undefined, now: number = Date.now()): boolean {
  if (!departAvailableAt) return true;
  const at = Date.parse(departAvailableAt);
  return !Number.isFinite(at) || now >= at;
}
