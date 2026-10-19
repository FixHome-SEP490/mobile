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

/** Why a call ended, as the server says it (same contract as the web). */
export type CallEndReason =
  | 'rejected'
  | 'cancelled'
  | 'ended'
  | 'timeout'
  | 'disconnected'
  | 'busy'
  | 'answered_elsewhere';

export interface IncomingCallEvent { callId: string; conversationId: string; fromUserId: string }
export interface CallStepEvent { callId: string; conversationId?: string }
export interface CallMissedEvent { conversationId: string; fromUserId: string; reason: 'busy' }
export interface CallEndedEvent { callId: string; conversationId: string; reason: CallEndReason }
export interface CallSignalEvent<T> { callId: string; data: T }
export interface CallInviteResult {
  ok: boolean;
  callId?: string;
  reason?: 'invalid' | 'forbidden' | 'busy' | 'self_busy' | 'offline';
}
/** A STUN/TURN server handed over on connect:ready. */
export interface IceServer { urls: string | string[]; username?: string; credential?: string }
export interface SessionDescription { type: string; sdp: string }
export interface IceCandidateInit { candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null }

/** Server pushes that mean "something you may be looking at changed" (PO 18/10/2026), the same as the web's live updates. */
export const LIVE_EVENT_NAMES = [
  'order:updated', 'order:location', 'booking:updated', 'invitation:updated', 'notification:new', 'wallet:updated', 'realtime:resync',
] as const;
export type LiveEventName = (typeof LIVE_EVENT_NAMES)[number];
export interface LiveEvent {
  name: LiveEventName;
  /** e.g. `{serviceOrderId, bookingId, status, kinds?}` for order:updated; may be empty. */
  payload: Record<string, unknown>;
}

export interface ChatSocketHandlers {
  onLiveUpdate?: (event: LiveEvent) => void;
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
  // Voice calls (PO 18/10/2026), the same events the web listens to.
  onCallIncoming?: (event: IncomingCallEvent) => void;
  onCallRinging?: (event: CallStepEvent) => void;
  onCallAccepted?: (event: CallStepEvent) => void;
  onCallMissed?: (event: CallMissedEvent) => void;
  onCallEnded?: (event: CallEndedEvent) => void;
  onCallOffer?: (event: CallSignalEvent<SessionDescription>) => void;
  onCallAnswer?: (event: CallSignalEvent<SessionDescription>) => void;
  onCallIce?: (event: CallSignalEvent<IceCandidateInit>) => void;
}

/** A call request the server never answers would leave a screen stuck ringing. */
export const CALL_ACK_TIMEOUT_MS = 8000;

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
  /** Handed over on connect:ready; empty is valid on one Wi-Fi network. */
  private ice: IceServer[] = [];

  get connected(): boolean {
    return this.socket?.connected ?? false;
  }

  get iceServers(): IceServer[] {
    return this.ice;
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
        for (const name of LIVE_EVENT_NAMES) {
          socket.on(name, (payload: unknown) => this.emitToHandlers('onLiveUpdate', {
            name,
            payload: payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {},
          }));
        }
        socket.on('connect:ready', (payload: { iceServers?: IceServer[] }) => {
          this.ice = Array.isArray(payload?.iceServers) ? payload.iceServers : [];
        });
        // Call signalling. The server addresses each of these from the call it
        // stored, so anything arriving here is for this account.
        socket.on('call:incoming', (e: IncomingCallEvent) => this.emitToHandlers('onCallIncoming', e));
        socket.on('call:ringing', (e: CallStepEvent) => this.emitToHandlers('onCallRinging', e));
        socket.on('call:accepted', (e: CallStepEvent) => this.emitToHandlers('onCallAccepted', e));
        socket.on('call:missed', (e: CallMissedEvent) => this.emitToHandlers('onCallMissed', e));
        socket.on('call:ended', (e: CallEndedEvent) => this.emitToHandlers('onCallEnded', e));
        socket.on('call:offer', (e: CallSignalEvent<SessionDescription>) => this.emitToHandlers('onCallOffer', e));
        socket.on('call:answer', (e: CallSignalEvent<SessionDescription>) => this.emitToHandlers('onCallAnswer', e));
        socket.on('call:ice', (e: CallSignalEvent<IceCandidateInit>) => this.emitToHandlers('onCallIce', e));
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

  // --------------------------------------------------------- voice signalling

  /** Ring the other participant of a conversation; the server works out who. */
  callInvite(conversationId: string): Promise<CallInviteResult> {
    return this.emitWithAck<CallInviteResult>('call:invite', { conversationId });
  }

  /** Tell the caller this phone shows their call, so they hear it ring. */
  callRinging(callId: string): void {
    this.socket?.emit('call:ringing', { callId });
  }

  callAccept(callId: string): Promise<{ ok: boolean }> {
    return this.emitWithAck('call:accept', { callId });
  }

  callReject(callId: string): Promise<{ ok: boolean }> {
    return this.emitWithAck('call:reject', { callId });
  }

  callCancel(callId: string): Promise<{ ok: boolean }> {
    return this.emitWithAck('call:cancel', { callId });
  }

  callEnd(callId: string): Promise<{ ok: boolean }> {
    return this.emitWithAck('call:end', { callId });
  }

  sendOffer(callId: string, data: SessionDescription): void {
    this.socket?.emit('call:offer', { callId, data });
  }

  sendAnswer(callId: string, data: SessionDescription): void {
    this.socket?.emit('call:answer', { callId, data });
  }

  sendIceCandidate(callId: string, data: IceCandidateInit): void {
    this.socket?.emit('call:ice', { callId, data });
  }

  /** Every acknowledgement is bounded: no answer counts as a refusal. */
  private emitWithAck<T extends { ok: boolean }>(event: string, payload: Record<string, unknown>): Promise<T> {
    return new Promise((resolve) => {
      const socket = this.socket;
      if (!socket?.connected) {
        resolve({ ok: false, reason: 'invalid' } as unknown as T);
        return;
      }
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        resolve({ ok: false, reason: 'invalid' } as unknown as T);
      }, CALL_ACK_TIMEOUT_MS);
      socket.emit(event, payload, (answer: T) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(answer && typeof answer === 'object' ? answer : ({ ok: false } as T));
      });
    });
  }

  disconnect(): void {
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
    this.joined.clear();
    this.hasConnectedOnce = false;
    this.ice = [];
  }
}

export const chatSocketService = new ChatSocketService();
