// src/hooks/useInvitationCount.ts
import { useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { bookingsApi } from '../api/bookings.api';
import { technicianWarrantyApi } from '../api/technician-warranty.api';
import { isActionable } from '../screens/technician/invitation-inbox';
import { useAuthStore } from '../store/auth.store';
import { useLiveRefresh } from './useLiveRefresh';
import { useBadgeStore } from '../store/badge.store';

/**
 * Count of actionable (pending, unexpired) technician invitations, for the
 * "Lời mời" tab badge, plus the warranty claims waiting for the technician. Backed by the shared badge store, so the Invitations
 * screen can push a fresh count after an answer. Refreshes on focus, same
 * pattern as useChatUnreadCount.
 */
export function useInvitationCount(): number {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const count = useBadgeStore((state) => state.pendingInvitations);
  const setCount = useBadgeStore((state) => state.setPendingInvitations);
  const warranty = useBadgeStore((state) => state.pendingWarranty);
  const setWarranty = useBadgeStore((state) => state.setPendingWarranty);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) {
      setCount(0);
      setWarranty(0);
      return;
    }
    try {
      const invitations = await bookingsApi.getMyInvitations();
      setCount(invitations.filter(isActionable).length);
    } catch {
      // A badge is not worth an error state; leave the previous value.
    }
    try {
      // A warranty claim waiting for the technician to take it is an invitation as well.
      setWarranty((await technicianWarrantyApi.listMine({ status: 'submitted', page: 1, pageSize: 1 })).meta.total);
    } catch {
      // Same: keep the previous number.
    }
  }, [isAuthenticated, setCount, setWarranty]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );
  useLiveRefresh(['invitation:updated'], () => void refresh(), undefined, { pollMs: 60_000 });

  return isAuthenticated ? count + warranty : 0;
}
