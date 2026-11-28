// Phone push (PO 28/11/2026): what a OneSignal notification carries and where tapping it goes.
// Pure functions so every rule is unit tested; push.service.ts wires them to the SDK.
// The payload is written by the backend (src/modules/push/push-payload.ts); keep the two in step.

export type PushData =
  | { kind: 'notification'; notificationId: string; type: string; referenceId: string | null; referenceType: string | null }
  | { kind: 'chat'; conversationId: string; messageId: string }
  | { kind: 'call'; conversationId: string; callId: string };

/** Android channels the app creates (plugins/with-notification-channels.js) and the backend names. */
export const PUSH_CHANNELS = {
  call: 'fh_calls',
  message: 'fh_messages',
  system: 'fh_system',
} as const;

const str = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const strOrNull = (value: unknown): string | null => str(value) || null;

/** Reads OneSignal's additionalData; anything we did not send becomes null and is ignored. */
export function parsePushData(raw: unknown): PushData | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  switch (data.kind) {
    case 'chat': {
      const conversationId = str(data.conversationId);
      return conversationId ? { kind: 'chat', conversationId, messageId: str(data.messageId) } : null;
    }
    case 'call': {
      const conversationId = str(data.conversationId);
      return conversationId ? { kind: 'call', conversationId, callId: str(data.callId) } : null;
    }
    case 'notification':
      return {
        kind: 'notification',
        notificationId: str(data.notificationId),
        type: str(data.type).toUpperCase() || 'INFO',
        referenceId: strOrNull(data.referenceId),
        referenceType: strOrNull(data.referenceType),
      };
    default:
      return null;
  }
}

export interface ForegroundContext {
  /** The chat thread open on screen right now, if any. */
  openConversationId: string | null;
}

/**
 * Whether a push that arrives while the app is open should still drop down from the top.
 * The app already shows these itself: the call screen rings for a call, and an open thread
 * shows its new message. Notices only update the bell in the app, so they still show.
 */
export function showWhileOpen(data: PushData | null, context: ForegroundContext): boolean {
  if (!data) return true;
  if (data.kind === 'call') return false;
  if (data.kind === 'chat') return data.conversationId !== context.openConversationId;
  return true;
}

/** A tapped notice, in the shape the role's notification screen opens an item with. */
export interface PushNoticeItem {
  id: string;
  title: string;
  message: string;
  type: string;
  referenceId: string | null;
  referenceType: string | null;
  /** Unknown to the push: the screen marks it read only when it has an id. */
  isRead: boolean;
  createdAt: string;
}

export type PushOpenTarget =
  | { screen: 'ChatThread'; params: { conversationId: string; counterpartName: string } }
  | { screen: 'Notifications'; item: PushNoticeItem };

/** Where a tap goes. A call opens its thread: the call screen shows on top while it still rings. */
export function pushOpenTarget(data: PushData, shown: { title?: string; body?: string }, now = new Date()): PushOpenTarget {
  if (data.kind === 'chat') {
    return { screen: 'ChatThread', params: { conversationId: data.conversationId, counterpartName: str(shown.title) } };
  }
  if (data.kind === 'call') {
    return { screen: 'ChatThread', params: { conversationId: data.conversationId, counterpartName: '' } };
  }
  return {
    screen: 'Notifications',
    item: {
      id: data.notificationId,
      title: str(shown.title),
      message: str(shown.body),
      type: data.type,
      referenceId: data.referenceId,
      referenceType: data.referenceType,
      // With no id (one push for many people) there is nothing to mark read.
      isRead: !data.notificationId,
      createdAt: now.toISOString(),
    },
  };
}
