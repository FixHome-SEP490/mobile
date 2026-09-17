// src/hooks/useChatUnreadCount.ts
import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { messagingApi } from '../api/messaging.api';
import { chatSocketService } from '../services/chat-socket.service';
import { useAuthStore } from '../store/auth.store';

/**
 * Total unread across every booking thread, for the badge on the home screen
 * chat button. Refreshes on focus and on any socket activity, so the badge does
 * not sit stale while the user is looking at it.
 */
export function useChatUnreadCount(): number {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) {
      setUnread(0);
      return;
    }
    try {
      const conversations = await messagingApi.listConversations();
      setUnread(
        conversations.reduce((total, item) => total + (item.unreadCount || 0), 0),
      );
    } catch {
      // A badge is not worth an error state; leave the previous value.
    }
  }, [isAuthenticated]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  useEffect(() => {
    if (!isAuthenticated) return;
    void chatSocketService.connect();
    const unsubscribe = chatSocketService.subscribe({
      onConversationUpdated: () => void refresh(),
    });
    return unsubscribe;
  }, [isAuthenticated, refresh]);

  return unread;
}
