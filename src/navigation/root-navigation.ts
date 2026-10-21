import { createNavigationContainerRef } from '@react-navigation/native';
import type { RootStackParamList } from '../types';
import { useAuthStore } from '../store/auth.store';

// Login may unmount when session role changes; dispatch handoff against the live root.
export const rootNavigationRef = createNavigationContainerRef<RootStackParamList>();

type LandingRoute = 'CustomerMain' | 'TechnicianMain' | 'TechnicianOnboarding';
let pending: { name: LandingRoute; userId: string; generation: number } | null = null;

export function flushAuthHandoff(): void {
  if (!pending) return;
  const session = useAuthStore.getState();
  if (!session.isAuthenticated || session.user?.id !== pending.userId || session.sessionGeneration !== pending.generation) { pending = null; return; }
  if (!rootNavigationRef.isReady() || !rootNavigationRef.getRootState()?.routeNames.includes(pending.name)) return;
  const target = pending.name;
  pending = null;
  rootNavigationRef.resetRoot({ index: 0, routes: [{ name: target }] });
}

/** Wait for role routes to mount before resetting the root; never use an unmounted Auth navigator. */
export function handoffAuthenticatedRoute(name: LandingRoute): void {
  const session = useAuthStore.getState();
  const expectedRole = name === 'CustomerMain' ? 'customer' : 'technician';
  if (!session.isAuthenticated || !session.user?.id || session.user.role !== expectedRole) return;
  pending = { name, userId: session.user.id, generation: session.sessionGeneration };
  flushAuthHandoff();
}

/** Drop every pushed screen and land on the signed-in user's main tabs. */
export function goHome(): void {
  const role = useAuthStore.getState().user?.role;
  if (!rootNavigationRef.isReady() || !role) return;
  rootNavigationRef.resetRoot({ index: 0, routes: [{ name: role === 'technician' ? 'TechnicianMain' : 'CustomerMain' }] });
}
