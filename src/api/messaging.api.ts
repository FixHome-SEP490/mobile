// src/api/messaging.api.ts
import apiClient from './client';

/**
 * Backend controllers return `{ data }` and the global TransformInterceptor wraps
 * that again, so a response without `meta` arrives double-nested. Peel until the
 * payload itself is reached; chat payloads never carry a `data` field of their
 * own, so this cannot over-unwrap.
 */
function unwrap<T>(payload: unknown): T {
  let current = payload;
  while (
    current &&
    typeof current === 'object' &&
    !Array.isArray(current) &&
    'data' in (current as Record<string, unknown>)
  ) {
    current = (current as Record<string, unknown>).data;
  }
  return current as T;
}

export type ConversationStatus = 'active' | 'read_only' | 'closed';

export interface ConversationParticipant {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  role: string;
}

export interface ConversationItem {
  id: string;
  bookingId: string;
  serviceOrderId: string | null;
  status: ConversationStatus;
  /** Booked service name, shown as the small note under the counterpart name. */
  serviceName: string | null;
  counterpart: ConversationParticipant;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  unreadCount: number;
  canSend: boolean;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  createdAt: string;
  editedAt: string | null;
  isDeleted: boolean;
  clientMessageId: string | null;
}

export interface MessagePage {
  data: ChatMessage[];
  nextBefore: string | null;
}

export const messagingApi = {
  async listConversations(): Promise<ConversationItem[]> {
    const res = await apiClient.get('/conversations');
    return unwrap<ConversationItem[]>(res.data) ?? [];
  },

  async getConversation(id: string): Promise<ConversationItem> {
    const res = await apiClient.get(`/conversations/${id}`);
    return unwrap<ConversationItem>(res.data);
  },

  /** `before` is the keyset cursor returned by the previous page. */
  async listMessages(
    conversationId: string,
    params: { limit?: number; before?: string } = {},
  ): Promise<MessagePage> {
    const res = await apiClient.get(`/conversations/${conversationId}/messages`, {
      params,
    });
    const body = res.data as { data?: ChatMessage[]; meta?: { nextBefore?: string | null } };
    return {
      data: body?.data ?? [],
      nextBefore: body?.meta?.nextBefore ?? null,
    };
  },

  async sendMessage(
    conversationId: string,
    content: string,
    clientMessageId?: string,
  ): Promise<ChatMessage> {
    const res = await apiClient.post(`/conversations/${conversationId}/messages`, {
      content,
      ...(clientMessageId ? { clientMessageId } : {}),
    });
    return unwrap<ChatMessage>(res.data);
  },

  async editMessage(messageId: string, content: string): Promise<ChatMessage> {
    const res = await apiClient.patch(`/messages/${messageId}`, { content });
    return unwrap<ChatMessage>(res.data);
  },

  async deleteMessage(messageId: string): Promise<ChatMessage> {
    const res = await apiClient.delete(`/messages/${messageId}`);
    return unwrap<ChatMessage>(res.data);
  },

  async markRead(conversationId: string): Promise<void> {
    await apiClient.post(`/conversations/${conversationId}/read`);
  },
};
