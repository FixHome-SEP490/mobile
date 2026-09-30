// src/hooks/useInvitationCount.ts
import { useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { bookingsApi } from '../api/bookings.api';
import { isActionable } from '../screens/technician/invitation-inbox';
import { useAuthStore } from '../store/auth.store';
import { useBadgeStore } from '../store/badge.store';

/**
 * Count of actionable (pending, unexpired) technician invitations, for the
 * "Lời mời" tab badge. Backed by the shared badge store, so the Invitations
 * screen can push a fresh count after an answer. Refreshes on focus, same
 * pattern as useChatUnreadCount.
 */
export function useInvitationCount(): number {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const count = useBadgeStore((state) => state.pendingInvitations);
  const setCount = useBadgeStore((state) => state.setPendingInvitations);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) {
      setCount(0);
      return;
    }
    try {
      const invitations = await bookingsApi.getMyInvitations();
      setCount(invitations.filter(isActionable).length);
    } catch {
      // A badge is not worth an error state; leave the previous value.
    }
  }, [isAuthenticated, setCount]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  return isAuthenticated ? count : 0;
}
