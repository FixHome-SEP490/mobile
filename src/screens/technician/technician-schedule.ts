// Pure view logic for the technician weekly schedule ("Lịch làm việc").
import type { ServiceOrderItem } from '../../api/orders.api';
import type { TechnicianTimeOff } from '../../api/technician-profile.api';
import { startOfWeekVn } from './technician-home';

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_LABELS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

/** `yyyy-MM-dd` of an instant on the Asia/Ho_Chi_Minh calendar; null when unparsable. */
export function dayKeyVn(iso: string | number | null | undefined): string | null {
  const t = typeof iso === 'number' ? iso : Date.parse(String(iso ?? ''));
  return Number.isFinite(t) ? new Date(t + VN_OFFSET_MS).toISOString().slice(0, 10) : null;
}

export interface ScheduleDay {
  key: string;
  label: string;
  dayOfMonth: number;
  orders: ServiceOrderItem[];
  timeOff: TechnicianTimeOff[];
}

/** Orders that still matter on a calendar: not cancelled, not a sanitized archive row. */
const isScheduled = (o: ServiceOrderItem) =>
  !o.historical && String(o.status).toUpperCase() !== 'CANCELLED' && dayKeyVn(o.scheduledAt) !== null;

/** Seven days (Mon–Sun, VN time) of the week `weekOffset` weeks from the one containing `now`. */
export function buildWeek(
  orders: ServiceOrderItem[],
  timeOff: TechnicianTimeOff[],
  now: number,
  weekOffset = 0,
): ScheduleDay[] {
  const start = startOfWeekVn(now) + weekOffset * 7 * DAY_MS;
  const usable = orders.filter(isScheduled);
  return Array.from({ length: 7 }, (_, i) => {
    const at = start + i * DAY_MS;
    const key = dayKeyVn(at)!;
    const weekday = new Date(at + VN_OFFSET_MS).getUTCDay();
    return {
      key,
      label: DAY_LABELS[weekday],
      dayOfMonth: Number(key.slice(8, 10)),
      orders: usable
        .filter((o) => dayKeyVn(o.scheduledAt) === key)
        .sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt)),
      timeOff: timeOff.filter((t) => {
        const from = dayKeyVn(t.startAt);
        const to = dayKeyVn(t.endAt);
        return !!from && !!to && from <= key && key <= to;
      }),
    };
  });
}
