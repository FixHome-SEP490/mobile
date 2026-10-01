import type {
  CustomerNotificationItem,
  NotificationPageMeta,
} from '../../api/notifications.api';

export function nextNotificationPage(meta: NotificationPageMeta | null): number | null {
  if (!meta || meta.page >= meta.totalPages) return null;
  return meta.page + 1;
}

export function mergeNotificationRows(
  current: CustomerNotificationItem[],
  incoming: CustomerNotificationItem[],
  replace = false,
): CustomerNotificationItem[] {
  if (replace) return dedupeNotificationRows(incoming);

  const seen = new Set(current.map((item) => item.id));
  const appended = incoming.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
  return [...current, ...appended];
}

function dedupeNotificationRows(
  rows: CustomerNotificationItem[],
): CustomerNotificationItem[] {
  const seen = new Set<string>();
  return rows.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}
