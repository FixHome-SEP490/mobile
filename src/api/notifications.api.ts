// src/api/notifications.api.ts
import apiClient from './client';

/**
 * Legacy notification shape used by the Technician notification utilities.
 * Keep fields optional because those pure helpers intentionally accept partial
 * rows in tests and UI grouping.
 */
export interface NotificationItem {
  id?: string;
  title?: string;
  body?: string;
  message?: string;
  createdAt?: string;
  isRead?: boolean;
  type?: string;
  referenceId?: string | null;
  referenceType?: string | null;
  [key: string]: any;
}

/** Strict, normalized Customer-facing row after validating the Backend payload. */
export interface CustomerNotificationItem {
  id: string;
  title: string;
  message: string;
  body?: string;
  createdAt: string;
  isRead: boolean;
  type: string;
  referenceId: string | null;
  referenceType: string | null;
}

/**
 * Legacy screen compatibility surface. TechnicianNotificationsScreen still
 * consumes the raw Backend envelope; Customer uses getNotificationRows below.
 */
export interface NotificationsResponse { success: boolean; data: any; message?: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unwrapData(value: unknown): unknown {
  return isRecord(value) && 'data' in value ? value.data : value;
}

function nullableString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== 'string') throw new Error('Thông báo từ máy chủ không hợp lệ.');
  const text = value.trim();
  return text || null;
}

function requiredString(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('Thông báo từ máy chủ không hợp lệ.');
  }
  return value.trim();
}

function normalizeNotification(value: unknown): CustomerNotificationItem {
  if (!isRecord(value)) throw new Error('Thông báo từ máy chủ không hợp lệ.');

  return {
    id: requiredString(value.id),
    title: requiredString(value.title),
    message: requiredString(value.message ?? value.body),
    ...(typeof value.body === 'string' && value.body.trim()
      ? { body: value.body.trim() }
      : {}),
    createdAt: requiredString(value.createdAt),
    isRead: value.isRead === true,
    type: typeof value.type === 'string' && value.type.trim()
      ? value.type.trim()
      : 'INFO',
    referenceId: nullableString(value.referenceId),
    referenceType: nullableString(value.referenceType),
  };
}

export const notificationsApi = {
  /** Existing raw-envelope API kept for the Technician screen. */
  async getNotifications(page = 1, limit = 20): Promise<NotificationsResponse> {
    const res = await apiClient.get('/notifications', {
      params: { page, limit },
    });
    return res.data;
  },

  /**
   * Customer-safe normalized rows. Intentionally does not invent pagination
   * metadata while the Backend envelope currently drops sibling total.
   */
  async getNotificationRows(page = 1, limit = 20): Promise<CustomerNotificationItem[]> {
    const res = await apiClient.get('/notifications', {
      params: { page, limit },
    });
    const rows = unwrapData(res.data);
    if (!Array.isArray(rows)) {
      throw new Error('Danh sách thông báo từ máy chủ không hợp lệ.');
    }
    return rows.map(normalizeNotification);
  },

  async getCountUnread(): Promise<number> {
    const res = await apiClient.get('/notifications/unread-count');
    const body = unwrapData(res.data);
    if (!isRecord(body)) return 0;
    const count = Number(body.count);
    return Number.isInteger(count) && count >= 0 ? count : 0;
  },

  async readNotification(id: string): Promise<void> {
    await apiClient.patch(`/notifications/${id}/read`);
  },

  async readAll(): Promise<void> {
    await apiClient.patch('/notifications/read-all');
  },
};
