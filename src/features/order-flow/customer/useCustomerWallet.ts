import { useEffect, useLayoutEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { useAuthStore } from '../../../store/auth.store';
import { createProductionCustomerWalletController, customerWalletJournal } from './wallet-production';
import type { CustomerWalletOwner } from './customer-wallet-controller';
export function useCustomerWallet(journal = customerWalletJournal) {
  const user = useAuthStore(s => s.user), authenticated = useAuthStore(s => s.isAuthenticated), generation = useAuthStore(s => s.sessionGeneration);
  const userId = user?.id, role = user?.role;
  const focused = useIsFocused(), [foreground, setForeground] = useState(AppState.currentState === 'active');
  const owner = useMemo<CustomerWalletOwner | null>(() => authenticated && userId && role === 'customer'
    ? { userId, role: 'customer', sessionGeneration: generation } : null, [authenticated, userId, role, generation]);
  const ownership = useMemo(() => ({ owner, active: false }), [owner]);
  const active = focused && foreground;
  const controller = useMemo(() => createProductionCustomerWalletController({ getOwner: () => ownership.owner, isActive: () => ownership.active }, journal), [ownership, journal]);
  const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
  useLayoutEffect(() => {
    ownership.active = active;
    if (!active) controller.invalidatePresentation();
    return () => { ownership.active = false; controller.invalidatePresentation(); };
  }, [ownership, controller, active]);
  useEffect(() => {
    const listener = AppState.addEventListener('change', value => {
      ownership.active = focused && value === 'active';
      if (!ownership.active) controller.invalidatePresentation();
      setForeground(value === 'active');
    });
    return () => listener.remove();
  }, [ownership, controller, focused]);
  useEffect(() => { if (active && owner) void controller.refresh(); }, [controller, active, owner]);
  return { controller, state };
}
