import { isSameVnDay, vnDateString, vnTimeString } from './vn-time';

/** Receiving jobs now: the weekly schedule switches it, the manual switch pauses, time off wins (`GET /technicians/me/availability`). */
export interface TechnicianAvailability {
  state: 'receiving' | 'paused' | 'off_hours' | 'time_off' | 'no_schedule';
  receiving: boolean;
  until: string | null;
  nextStartAt: string | null;
}

const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const HHMM: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: false };

/** "07:00 hôm nay", "07:00 T7 10/10". */
function when(at: string, now: Date): string {
  const date = new Date(at);
  const time = vnTimeString(date, HHMM);
  if (isSameVnDay(date, now)) return `${time} hôm nay`;
  const dow = new Date(date.getTime() + 7 * 3600_000).getUTCDay();
  return `${time} ${WEEKDAYS[dow]} ${vnDateString(date).slice(0, 5)}`;
}

/** Same five states and wording as the web dashboard switch. */
export function availabilityText(a: TechnicianAvailability, now: Date = new Date()): { title: string; detail: string; receiving: boolean } {
  switch (a.state) {
    case 'receiving':
      return { title: 'Đang nhận việc', detail: a.until ? `Theo lịch tới ${vnTimeString(a.until, HHMM)}` : 'Theo lịch làm việc', receiving: true };
    case 'off_hours':
      return { title: 'Ngoài giờ làm', detail: a.nextStartAt ? `Tự nhận việc lại lúc ${when(a.nextStartAt, now)}` : 'Theo lịch làm việc', receiving: false };
    case 'paused':
      return { title: 'Tạm nghỉ nhận đơn', detail: 'Bấm để bật lại', receiving: false };
    case 'time_off':
      return { title: 'Đang nghỉ', detail: a.until ? `Tới ${when(a.until, now)}` : 'Theo lịch nghỉ', receiving: false };
    default:
      return { title: 'Chưa đặt lịch làm', detail: 'Đặt lịch tuần để nhận việc', receiving: false };
  }
}
