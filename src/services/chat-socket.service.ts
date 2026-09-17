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
  /**
   * Fired after the socket comes back. Nothing was pushed while it was down, so
   * a screen showing a thread must refetch instead of trusting what it holds.
   */
  onReconnected?: () => void;
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
  /** Threads opened after connect; re-joined whenever the socket comes back. */
  private joined = new Set<string>();
  private hasConnectedOnce = false;

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

  /**
   * Resolves only once the socket is really connected. Several screens call this
   * while navigating; they must all wait on the same attempt, otherwise a later
   * caller sees `connected === false`, assumes there is no socket, and tears down
   * the one that is still completing its handshake -- taking any room join
   * already emitted on it with it.
   */
  async connect(): Promise<void> {
    if (this.socket?.connected) return;
    if (this.connecting) return this.connecting;

    this.connecting = new Promise<void>((resolve) => {
      void (async () => {
        const token = await storageService.getToken();
        if (!token) {
          resolve();
          return;
        }

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
        this.socket = socket;

        socket.on('connect', () => {
          this.emitToHandlers('onStatusChange', true);
          // A reconnect is a brand new server-side socket. It auto-joins the
          // threads that exist in the database, but a thread opened during this
          // session still has to be asked for again.
          this.joined.forEach((id) =>
            socket.emit('conversation:join', { conversationId: id }),
          );
          if (this.hasConnectedOnce) this.emitToHandlers('onReconnected');
          this.hasConnectedOnce = true;
          resolve();
        });
        socket.on('disconnect', () => this.emitToHandlers('onStatusChange', false));
        socket.on('connect_error', () => {
          this.emitToHandlers('onStatusChange', false);
          // Never leave callers hanging; socket.io keeps retrying underneath.
          resolve();
        });

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
      })();
    });

    try {
      await this.connecting;
    } finally {
      this.connecting = null;
    }
  }

  /**
   * Threads created after connect (a new invitation) still need a room join.
   * The id is remembered so a reconnect does not silently drop the thread the
   * user is actually looking at.
   */
  joinConversation(conversationId: string): void {
    this.joined.add(conversationId);
    this.socket?.emit('conversation:join', { conversationId });
  }

  /**
   * Only stop tracking the room. The socket stays in it: the server already
   * limits rooms to threads this user belongs to, so holding the membership
   * costs nothing, while dropping and re-adding it opens a window where a
   * message has nowhere to land.
   */
  forgetConversation(conversationId: string): void {
    this.joined.delete(conversationId);
  }

  sendTyping(conversationId: string, isTyping: boolean): void {
    this.socket?.emit('typing', { conversationId, isTyping });
  }

  disconnect(): void {
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
    this.joined.clear();
    this.hasConnectedOnce = false;
  }
}

export const chatSocketService = new ChatSocketService();
