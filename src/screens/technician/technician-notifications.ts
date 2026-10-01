// Pure view logic for the technician Notifications tab.
import type { NotificationItem } from '../../api/notifications.api';
import { isSameVnDay, vnParts, vnTimeString } from '../../utils/vn-time';

export type NotificationSection = { key: 'today' | 'earlier'; title: string; data: NotificationItem[] };

const isToday = (iso: string | undefined, now: number) =>
  !!iso && Number.isFinite(Date.parse(iso)) && isSameVnDay(iso, now);

const pad = (n: number) => String(n).padStart(2, '0');

/** "Hôm nay" / "Trước đó" by Asia/Ho_Chi_Minh calendar day; order within a group is preserved. */
export function groupNotificationsByDay(items: NotificationItem[], now: number): NotificationSection[] {
  const today = items.filter((i) => isToday(i.createdAt, now));
  const earlier = items.filter((i) => !isToday(i.createdAt, now));
  const sections: NotificationSection[] = [];
  if (today.length) sections.push({ key: 'today', title: 'Hôm nay', data: today });
  if (earlier.length) sections.push({ key: 'earlier', title: 'Trước đó', data: earlier });
  return sections;
}

/** `HH:mm` for today, otherwise `dd/MM` (year only when it differs). */
export function formatNotificationTime(iso: string, now: number): string {
  if (isToday(iso, now)) return vnTimeString(iso, { hour: '2-digit', minute: '2-digit' });
  const p = vnParts(iso);
  const day = `${pad(p.day)}/${pad(p.month)}`;
  return p.year === vnParts(now).year ? day : `${day}/${p.year}`;
}

/** Append a fetched page without duplicating items the list already has (ids are optional). */
export function mergeNotificationPage(current: NotificationItem[], page: NotificationItem[]): NotificationItem[] {
  const seen = new Set(current.map((i) => i.id).filter(Boolean));
  return [...current, ...page.filter((i) => !i.id || !seen.has(i.id))];
}
