// src/services/chat-socket.service.ts
import { io, Socket } from 'socket.io-client';
import { APP_CONFIG } from '../constants';
import { storageService } from './storage.service';
import type { ChatMessage } from '../api/messaging.api';

export interface TypingEvent {
  conversationId: string;
  userId: string;
  isTyping: boolean;
}

export interface ChatSocketHandlers {
  onMessageNew?: (message: ChatMessage) => void;
  onMessageUpdated?: (message: ChatMessage) => void;
  onMessageDeleted?: (message: ChatMessage) => void;
  onConversationUpdated?: (payload: { conversationId: string }) => void;
  onTyping?: (event: TypingEvent) => void;
  onStatusChange?: (connected: boolean) => void;
}

/**
 * The gateway lives at the server root, not under the REST prefix, so the socket
 * URL is the API base with `/api/v1` stripped off.
 */
function socketOrigin(): string {
  return APP_CONFIG.API_BASE_URL.replace(/\/api\/v\d+\/?$/, '');
}

/**
 * One socket for the whole app. Screens subscribe and unsubscribe; the
 * connection itself survives navigation so a message that arrives while the user
 * is on the thread list still updates the list.
 */
class ChatSocketService {
  private socket: Socket | null = null;
  private handlers = new Set<ChatSocketHandlers>();
  private connecting: Promise<void> | null = null;

  get connected(): boolean {
    return this.socket?.connected ?? false;
  }

  subscribe(handlers: ChatSocketHandlers): () => void {
    this.handlers.add(handlers);
    return () => {
      this.handlers.delete(handlers);
    };
  }

  private emitToHandlers<K extends keyof ChatSocketHandlers>(
    key: K,
    ...args: Parameters<NonNullable<ChatSocketHandlers[K]>>
  ): void {
    this.handlers.forEach((handler) => {
      const fn = handler[key] as ((...a: unknown[]) => void) | undefined;
      fn?.(...(args as unknown[]));
    });
  }

  async connect(): Promise<void> {
    if (this.socket?.connected) return;
    if (this.connecting) return this.connecting;

    this.connecting = (async () => {
      const token = await storageService.getToken();
      if (!token) return;

      this.socket?.removeAllListeners();
      this.socket?.disconnect();

      // The token goes in the handshake, never in the URL, so it stays out of logs.
      const socket = io(`${socketOrigin()}/chat`, {
        transports: ['websocket'],
        auth: { token },
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 10000,
      });

      socket.on('connect', () => this.emitToHandlers('onStatusChange', true));
      socket.on('disconnect', () => this.emitToHandlers('onStatusChange', false));
      socket.on('connect_error', () => this.emitToHandlers('onStatusChange', false));

      socket.on('message:new', (m: ChatMessage) => this.emitToHandlers('onMessageNew', m));
      socket.on('message:updated', (m: ChatMessage) =>
        this.emitToHandlers('onMessageUpdated', m),
      );
      socket.on('message:deleted', (m: ChatMessage) =>
        this.emitToHandlers('onMessageDeleted', m),
      );
      socket.on('conversation:updated', (p: { conversationId: string }) =>
        this.emitToHandlers('onConversationUpdated', p),
      );
      socket.on('typing', (e: TypingEvent) => this.emitToHandlers('onTyping', e));

      this.socket = socket;
    })();

    try {
      await this.connecting;
    } finally {
      this.connecting = null;
    }
  }

  /** Threads created after connect (a new invitation) still need a room join. */
  joinConversation(conversationId: string): void {
    this.socket?.emit('conversation:join', { conversationId });
  }

  leaveConversation(conversationId: string): void {
    this.socket?.emit('conversation:leave', { conversationId });
  }

  sendTyping(conversationId: string, isTyping: boolean): void {
    this.socket?.emit('typing', { conversationId, isTyping });
  }

  disconnect(): void {
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
  }
}

export const chatSocketService = new ChatSocketService();
