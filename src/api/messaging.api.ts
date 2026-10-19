// src/api/messaging.api.ts
import apiClient from './client';
import { storageService } from '../services/storage.service';
import { apiUrl, toVideoLink, type UploadProgressOptions, type VideoLink } from './media.api';

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

function requireArray<T>(payload: unknown, resource: string): T[] {
  if (!Array.isArray(payload)) {
    throw new Error('Invalid ' + resource + ' response');
  }
  return payload as T[];
}

function unwrapMessagePage(payload: unknown): { data: unknown; meta: unknown } {
  let current = payload;
  let meta: unknown;

  while (current && typeof current === 'object' && !Array.isArray(current)) {
    const envelope = current as Record<string, unknown>;
    if ('meta' in envelope) meta = envelope.meta;
    if (!('data' in envelope)) return { data: undefined, meta };

    const data = envelope.data;
    if (Array.isArray(data)) return { data, meta };
    if (data && typeof data === 'object') {
      current = data;
      continue;
    }
    return { data, meta };
  }

  return { data: undefined, meta };
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
  /** The order's code (FH-...), to tell apart threads with the same person and service (PO 18/10/2026). Older servers send nothing. */
  orderCode?: string | null;
  counterpart: ConversationParticipant;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  unreadCount: number;
  canSend: boolean;
  /**
   * `order_completed`: the order is done, so the chat is closed; a warranty claim opens it again
   * while the claim is in progress (PO 18/10/2026). Older servers send nothing.
   */
  closedReason?: 'order_completed' | null;
}

/** A photo or short video sent in the chat (PO 18/10/2026); the bytes come from the attachment routes. */
export interface ChatAttachment {
  kind: 'image' | 'video';
  mimeType: string;
  sizeBytes: number | null;
}

/** What the chat accepts, as the server checks it: photos up to 10 MB, videos up to 50 MB. */
export const CHAT_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const CHAT_VIDEO_MAX_BYTES = 50 * 1024 * 1024;

/** The send was refused because the order completed and no warranty claim is open. */
export function isConversationClosedError(error: unknown): boolean {
  const response = (error as { response?: { status?: number; data?: { error?: { code?: string } } } } | null)?.response;
  return response?.status === 409 && response.data?.error?.code === 'CONVERSATION_CLOSED';
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
  /** Sent by FixHome on the sender's behalf, e.g. the technician's greeting on accepting a job. */
  isAutomated?: boolean;
  attachment?: ChatAttachment | null;
  /** Client only: the picked file while it is prepared and sent from this device, and what went wrong if it did not. */
  localUri?: string;
  upload?: { state: 'preparing' | 'uploading' | 'failed'; progress: number; error?: string };
}

export interface MessagePage {
  data: ChatMessage[];
  nextBefore: string | null;
}

export const messagingApi = {
  async listConversations(): Promise<ConversationItem[]> {
    const res = await apiClient.get('/conversations');
    return requireArray<ConversationItem>(unwrap<unknown>(res.data), 'conversations');
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
    const body = unwrapMessagePage(res.data);
    const meta = body.meta as { nextBefore?: string | null } | null | undefined;
    return {
      data: requireArray<ChatMessage>(body.data, 'messages'),
      nextBefore: meta?.nextBefore ?? null,
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

  /** One photo or video with an optional caption, as multipart. */
  async sendAttachment(
    conversationId: string,
    file: { uri: string; name: string; type: string },
    content?: string,
    clientMessageId?: string,
    opts: UploadProgressOptions = {},
  ): Promise<ChatMessage> {
    const form = new FormData();
    form.append('file', { uri: file.uri, name: file.name, type: file.type } as unknown as Blob);
    if (content?.trim()) form.append('content', content.trim());
    if (clientMessageId) form.append('clientMessageId', clientMessageId);
    const res = await apiClient.post(`/conversations/${conversationId}/attachments`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      // No fixed timeout with progress: the caller watches for a stall instead (weak connections).
      timeout: opts.onProgress ? 0 : 180_000,
      ...(opts.signal ? { signal: opts.signal } : {}),
      ...(opts.onProgress
        ? { onUploadProgress: (event: { loaded: number; total?: number }) => { if (event.total) opts.onProgress?.(event.loaded / event.total); } }
        : {}),
    });
    return unwrap<ChatMessage>(res.data);
  },

  /** A viewing link for a chat video: the player streams it instead of downloading it whole. */
  async getAttachmentVideoLink(messageId: string): Promise<VideoLink> {
    const res = await apiClient.get(`/messages/${encodeURIComponent(messageId)}/attachment/stream`);
    return toVideoLink(unwrap<VideoLink>(res.data), '/messages/attachment/stream/');
  },

  /** Source for an `<Image>` of a chat photo: the bytes sit behind the bearer token (no public link exists). */
  async getAttachmentPhotoSource(messageId: string): Promise<{ uri: string; headers: Record<string, string> }> {
    const token = await storageService.getToken();
    return {
      uri: apiUrl(`/messages/${encodeURIComponent(messageId)}/attachment`),
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    };
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
