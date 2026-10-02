import type {
  CustomerNotificationItem,
  NotificationPageMeta,
} from '../../api/notifications.api';
import {
  mergeNotificationRows,
  nextNotificationPage,
} from './customer-notification-pagination';

function row(id: string): CustomerNotificationItem {
  return {
    id,
    title: `Notification ${id}`,
    message: 'Message',
    createdAt: '2026-10-01T01:00:00.000Z',
    isRead: false,
    type: 'INFO',
    referenceId: null,
    referenceType: null,
  };
}

describe('customer notification pagination', () => {
  it('requests another page only from trusted metadata that says one exists', () => {
    const meta: NotificationPageMeta = {
      page: 1,
      limit: 20,
      total: 45,
      totalPages: 3,
    };
    expect(nextNotificationPage(meta)).toBe(2);
    expect(nextNotificationPage({ ...meta, page: 3 })).toBeNull();
    expect(nextNotificationPage(null)).toBeNull();
  });

  it('appends only new ids and preserves already-loaded local row state', () => {
    const current = [{ ...row('a'), isRead: true }, row('b')];
    const incoming = [row('b'), row('c'), row('c'), row('d')];

    expect(mergeNotificationRows(current, incoming)).toEqual([
      { ...row('a'), isRead: true },
      row('b'),
      row('c'),
      row('d'),
    ]);
  });

  it('refresh replacement discards older pages and deduplicates the first page', () => {
    expect(mergeNotificationRows(
      [row('old-a'), row('old-b')],
      [row('new-a'), row('new-a'), row('new-b')],
      true,
    )).toEqual([
      row('new-a'),
      row('new-b'),
    ]);
  });
});
