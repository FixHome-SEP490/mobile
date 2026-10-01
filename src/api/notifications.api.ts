// src/api/notifications.api.ts
import apiClient from './client';

export interface NotificationItem {
  id?: string;
  title?: string;
  body?: string;
  message?: string; // Some apis use message instead of body
  createdAt?: string;
  isRead?: boolean;
  type?: string;
  referenceId?: string | null;
  referenceType?: string | null;
  [key: string]: any;
}

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

export interface NotificationPageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface CustomerNotificationPage {
  data: CustomerNotificationItem[];
  meta: NotificationPageMeta | null;
}

export interface NotificationsResponse {
  success: boolean;
  statusCode: number;
  message: string;
  data: {
    data: NotificationItem[];
    total: number;
  } | NotificationItem[] | any;
  meta?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

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

function normalizePageMeta(value: unknown): NotificationPageMeta | null {
  if (!isRecord(value)) return null;

  const page = Number(value.page);
  const limit = Number(value.limit);
  const total = Number(value.total);
  const totalPages = Number(value.totalPages);

  if (
    !Number.isInteger(page)
    || page < 1
    || !Number.isInteger(limit)
    || limit < 1
    || limit > 100
    || !Number.isInteger(total)
    || total < 0
    || !Number.isInteger(totalPages)
    || totalPages < 0
    || totalPages !== Math.ceil(total / limit)
  ) {
    return null;
  }

  return { page, limit, total, totalPages };
}

export const notificationsApi = {
  async getNotifications(page = 1, limit = 10): Promise<NotificationsResponse> {
    const res = await apiClient.get<NotificationsResponse>('/notifications', {
      params: { page, limit }
    });
    return res.data;
  },

  async getNotificationPage(page = 1, limit = 20): Promise<CustomerNotificationPage> {
    const res = await apiClient.get('/notifications', {
      params: { page, limit },
    });
    const payload = res.data;
    const rows = unwrapData(payload);
    if (!Array.isArray(rows)) {
      throw new Error('Danh sách thông báo từ máy chủ không hợp lệ.');
    }

    const rawMeta = isRecord(payload) ? normalizePageMeta(payload.meta) : null;
    const meta = rawMeta && rawMeta.page === page && rawMeta.limit === limit
      ? rawMeta
      : null;

    return {
      data: rows.map(normalizeNotification),
      meta,
    };
  },

  async getNotificationRows(page = 1, limit = 20): Promise<CustomerNotificationItem[]> {
    return (await this.getNotificationPage(page, limit)).data;
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
  }
};
