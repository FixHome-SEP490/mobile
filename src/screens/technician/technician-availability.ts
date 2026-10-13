import type { TechnicianScheduleSlot } from '../../api/technician-profile.api';
import { parseVnDateInput } from '../../utils/format';

export function replaceDaySchedule(slots: TechnicianScheduleSlot[], day: number, intervals: { startTime: string; endTime: string }[]): TechnicianScheduleSlot[] {
  return [...slots.filter(slot => slot.dayOfWeek !== day), ...intervals.map(slot => ({ ...slot, dayOfWeek: day }))];
}

export function validateSchedule(slots: TechnicianScheduleSlot[]): string {
  const time = /^([01]\d|2[0-3]):[0-5]\d$/;
  for (const slot of slots) {
    if (!Number.isInteger(slot.dayOfWeek) || slot.dayOfWeek < 0 || slot.dayOfWeek > 6 || !time.test(slot.startTime) || !time.test(slot.endTime) || slot.endTime <= slot.startTime) return 'Nhập giờ theo HH:mm, giờ kết thúc phải sau giờ bắt đầu.';
  }
  for (let day = 0; day < 7; day++) {
    const intervals = slots.filter(slot => slot.dayOfWeek === day).sort((a, b) => a.startTime.localeCompare(b.startTime));
    if (intervals.some((slot, index) => index > 0 && slot.startTime < intervals[index - 1].endTime)) return 'Các khung giờ trong cùng ngày không được trùng nhau.';
  }
  return '';
}

export function timeOffPayload(startText: string, endText: string, reason: string) {
  const start = parseVnDateInput(startText);
  const end = parseVnDateInput(endText);
  if (!start || !end || end < start) return null;
  return { startAt: `${start}T00:00:00`, endAt: `${end}T23:59:59`, reason: reason.trim() || undefined };
}
