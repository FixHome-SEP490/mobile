import { vnDateString, vnTimeString, vnTodayCalendarDate, vnWallClockToDate } from './vn-time';

/**
 * Booking sessions (PO 08/10/2026): a scheduled booking takes the morning
 * (08:00-12:00), afternoon (13:00-18:00) or evening (18:00-23:00) of one day, Vietnam time; an
 * urgent booking means "come now". Same labels as the web.
 */
export const BOOKING_SLOTS = ['morning', 'afternoon', 'evening'] as const;
export type BookingSlot = typeof BOOKING_SLOTS[number];

export const SLOT_LABELS: Record<BookingSlot, string> = {
  morning: 'Buổi sáng (8:00 - 12:00)',
  afternoon: 'Buổi chiều (13:00 - 18:00)',
  evening: 'Buổi tối (18:00 - 23:00)',
};

export function sessionLabel(input: { bookingMode?: string | null; slot?: string | null; start?: string | Date | null }): string {
  if (input.bookingMode === 'urgent') return 'Tới ngay';
  const start = input.start ? new Date(input.start) : null;
  const day = start && Number.isFinite(start.getTime()) ? vnDateString(start) : '';
  if (input.slot === 'morning' || input.slot === 'afternoon' || input.slot === 'evening') return day ? `${SLOT_LABELS[input.slot]}, ${day}` : SLOT_LABELS[input.slot];
  if (!start || !Number.isFinite(start.getTime())) return 'Chưa có lịch hẹn';
  return `${vnTimeString(start)} ${day}`;
}

/** True once the technician may set out (the server opens it one hour before the appointment). */
export function canDepartNow(departAvailableAt: string | null | undefined, now: number = Date.now()): boolean {
  if (!departAvailableAt) return true;
  const at = Date.parse(departAvailableAt);
  return !Number.isFinite(at) || now >= at;
}

export const SLOT_SHORT: Record<BookingSlot, string> = { morning: 'Sáng 8:00 - 12:00', afternoon: 'Chiều 13:00 - 18:00', evening: 'Tối 18:00 - 23:00' };
const SLOT_HOURS: Record<BookingSlot, [number, number]> = { morning: [8, 12], afternoon: [13, 18], evening: [18, 23] };
/** Length of the "tới ngay" window; the backend applies its own configured value (default 120). */
export const URGENT_WINDOW_MIN = 120;

export interface SessionChoice {
  /** Vietnam calendar day, YYYY-MM-DD. */
  date: string;
  slot: BookingSlot;
}

export type BookingSchedule = { mode: 'urgent' } | ({ mode: 'scheduled' } & SessionChoice);

const pad = (n: number) => String(n).padStart(2, '0');
const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Start and end instants of a session on a Vietnam day, or null for a malformed date. */
export function sessionWindow(choice: SessionChoice): { start: Date; end: Date } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(choice.date);
  const hours = SLOT_HOURS[choice.slot];
  if (!m || !hours) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return { start: vnWallClockToDate(y, mo, d, hours[0], 0), end: vnWallClockToDate(y, mo, d, hours[1], 0) };
}

/** Morning and afternoon close when they start; the evening stays open until 23:00 (BE 19/10/2026). */
export function sessionCloseAt(choice: SessionChoice): number | undefined {
  const w = sessionWindow(choice);
  return w ? (choice.slot === 'evening' ? w.end : w.start).getTime() : undefined;
}

export function isSessionOpen(choice: SessionChoice, now: Date = new Date()): boolean {
  const close = sessionCloseAt(choice);
  return close !== undefined && close > now.getTime();
}

/** Sessions of the next `days` days (Vietnam time) that can still be booked. */
export function upcomingSessions(days = 14, now: Date = new Date()): SessionChoice[] {
  const out: SessionChoice[] = [];
  for (let i = 0; i < days; i++) {
    const date = keyOf(vnTodayCalendarDate(now, i));
    for (const slot of BOOKING_SLOTS) {
      if (isSessionOpen({ date, slot }, now)) out.push({ date, slot });
    }
  }
  return out;
}

const WEEKDAYS = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];

/** "Thứ 2, 13/10" for a Vietnam day key. */
export function sessionDayLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return `${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}, ${pad(d)}/${pad(m)}`;
}

/** What the booking says about its schedule, for the review sheet. */
export function scheduleSummary(schedule: BookingSchedule): string {
  return schedule.mode === 'urgent'
    ? 'Tới ngay (thợ gần bạn đang rảnh tới trong khoảng 2 giờ)'
    : `${sessionDayLabel(schedule.date)} · ${SLOT_SHORT[schedule.slot]}`;
}

/**
 * The request fields for a schedule: `mode`/`date`/`slot` for the server plus the
 * resolved window, which the create-attempt bookkeeping keeps using.
 */
export function buildScheduleWindow(
  schedule: BookingSchedule,
  now: Date = new Date(),
): { mode: 'scheduled' | 'urgent'; date?: string; slot?: BookingSlot; preferredStartAt: string; preferredEndAt: string } {
  if (schedule.mode === 'urgent') {
    return {
      mode: 'urgent',
      preferredStartAt: now.toISOString(),
      preferredEndAt: new Date(now.getTime() + URGENT_WINDOW_MIN * 60_000).toISOString(),
    };
  }
  const w = sessionWindow(schedule);
  if (!w) throw new Error('Vui lòng chọn ngày và buổi (sáng, chiều hoặc tối).');
  if (!isSessionOpen(schedule, now)) throw new Error('Buổi bạn chọn đã bắt đầu. Vui lòng chọn buổi khác.');
  if (!upcomingSessions(14, now).some((s) => s.date === schedule.date && s.slot === schedule.slot)) {
    throw new Error('Vui lòng chọn buổi trong 14 ngày tới.');
  }
  return { mode: 'scheduled', date: schedule.date, slot: schedule.slot, preferredStartAt: new Date(Math.max(w.start.getTime(), now.getTime())).toISOString(), preferredEndAt: w.end.toISOString() };
}
