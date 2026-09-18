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
  [key: string]: any;
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

export const notificationsApi = {
  async getNotifications(page = 1, limit = 10): Promise<NotificationsResponse> {
    const res = await apiClient.get<NotificationsResponse>('/notifications', {
      params: { page, limit }
    });
    return res.data;
  },
  async getCountUnread(): Promise<number> {
    const res = await apiClient.get<any>('/notifications/unread-count');
    return res.data.data.count;
  },
};
