// Pure view logic for the technician Notifications tab.
import type { NotificationItem } from '../../api/notifications.api';
import { formatDate, formatTime } from '../../utils/format';

export type NotificationSection = { key: 'today' | 'earlier'; title: string; data: NotificationItem[] };

const isToday = (iso: string | undefined, now: number) =>
  !!iso && formatDate(iso) !== '—' && formatDate(iso) === formatDate(new Date(now));

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
  if (isToday(iso, now)) return formatTime(iso);
  const date = formatDate(iso);
  return date.slice(-4) === formatDate(new Date(now)).slice(-4) ? date.slice(0, 5) : date;
}

/** Append a fetched page without duplicating items the list already has (ids are optional). */
export function mergeNotificationPage(current: NotificationItem[], page: NotificationItem[]): NotificationItem[] {
  const seen = new Set(current.map((i) => i.id).filter(Boolean));
  return [...current, ...page.filter((i) => !i.id || !seen.has(i.id))];
}
