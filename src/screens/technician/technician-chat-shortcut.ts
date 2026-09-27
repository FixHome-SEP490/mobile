// src/screens/technician/technician-chat-shortcut.ts
import { messagingApi } from '../../api/messaging.api';

export interface ChatShortcutTarget {
  conversationId: string;
  counterpartName: string;
  serviceName?: string;
}

/**
 * Mirrors web's chatStore.openConversationForBooking: a client-side lookup in the
 * technician's own conversation list, never a create call. Returns null when no
 * conversation exists yet for that booking (nothing to open).
 */
export async function findChatForBooking(bookingId: string): Promise<ChatShortcutTarget | null> {
  const conversations = await messagingApi.listConversations();
  const match = conversations.find((c) => c.bookingId === bookingId);
  if (!match) return null;
  return {
    conversationId: match.id,
    counterpartName: match.counterpart.fullName,
    serviceName: match.serviceName ?? undefined,
  };
}
