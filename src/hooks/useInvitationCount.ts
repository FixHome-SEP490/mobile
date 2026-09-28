// src/hooks/useInvitationCount.ts
import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { bookingsApi } from '../api/bookings.api';
import { isActionable } from '../screens/technician/invitation-inbox';
import { useAuthStore } from '../store/auth.store';

/**
 * Count of actionable (pending, unexpired) technician invitations, for the
 * "Lời mời" badge on the Jobs header. Refreshes on focus, same pattern as
 * useChatUnreadCount.
 */
export function useInvitationCount(): number {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const [count, setCount] = useState(0);

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
  }, [isAuthenticated]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  return isAuthenticated ? count : 0;
}
