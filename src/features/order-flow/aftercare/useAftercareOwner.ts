import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { useAuthStore } from '../../../store/auth.store';
import type { AftercareOwner } from './support-controller';
/** Booking and assigned warranty own independent contexts, never a fabricated OrderSession. */
export function useAftercareOwner(requiredRole: AftercareOwner['role']) {
  const user = useAuthStore(s => s.user), authenticated = useAuthStore(s => s.isAuthenticated), generation = useAuthStore(s => s.sessionGeneration);
  const userId = user?.id, role = user?.role, focused = useIsFocused();
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const owner = useMemo<AftercareOwner | null>(() => authenticated && userId && role === requiredRole ? { userId, role: requiredRole, sessionGeneration: generation } : null, [authenticated, userId, role, requiredRole, generation]);
  const ownership = useMemo(() => ({ owner, active: false }), [owner]), active = focused && foreground;
  useLayoutEffect(() => { ownership.active = active; return () => { ownership.active = false; }; }, [ownership, active]);
  useEffect(() => {
    const listener = AppState.addEventListener('change', value => { ownership.active = focused && value === 'active'; setForeground(value === 'active'); });
    return () => { ownership.active = false; listener.remove(); };
  }, [ownership, focused]);
  const runtime = useMemo(() => ({ getOwner: () => ownership.owner, isActive: () => ownership.active }), [ownership]);
  return { runtime, owner, active };
}
export function useAftercarePresentation(clear: () => void, active: boolean) {
  useLayoutEffect(() => { if (!active) clear(); return clear; }, [clear, active]);
  useEffect(() => {
    const listener = AppState.addEventListener('change', value => { if (value !== 'active') clear(); });
    return () => listener.remove();
  }, [clear]);
}
