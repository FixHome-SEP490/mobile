import React, { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '../../../store/auth.store';
import { sameOrderSession } from '../domain/order-session.types';
import type { OrderResourceKind, OrderSessionKey, OrderSessionSnapshot } from '../domain/order-session.types';
import { createOrderReadCoordinator, type OrderReadCoordinator } from './order-read-coordinator';
import { createOrderCommandJournal, type OrderCommandJournal } from './order-command-journal';
import { orderReadDependencies } from './order-controller-adapters';

// Non-secret minimal intent markers only. Private order/media snapshots are memory-only.
export const orderCommandJournal = createOrderCommandJournal(AsyncStorage);
export interface OrderSessionContextValue {
  key: OrderSessionKey | null;
  snapshot: OrderSessionSnapshot | null;
  coordinator: OrderReadCoordinator;
  journal: OrderCommandJournal;
  refresh: (reason?: string) => Promise<void>;
  loadResource: (kind: OrderResourceKind) => Promise<void>;
}
const Context = createContext<OrderSessionContextValue | null>(null);
export function OrderSessionProvider({ serviceOrderId, coordinator: supplied, journal = orderCommandJournal, proofPolicy, children }: {
  serviceOrderId: string;
  coordinator?: OrderReadCoordinator;
  journal?: OrderCommandJournal;
  /** Supply only attested environment values; absent policy keeps readiness/recovery writes closed. */
  proofPolicy?: OrderSessionSnapshot['proofPolicy'];
  children: React.ReactNode;
}) {
  const user = useAuthStore(state => state.user);
  const authenticated = useAuthStore(state => state.isAuthenticated);
  const sessionGeneration = useAuthStore(state => state.sessionGeneration);
  const userId = user?.id;
  const role = user?.role;
  const coordinator = useMemo(() => supplied ?? createOrderReadCoordinator(orderReadDependencies), [supplied]);
  const key = useMemo<OrderSessionKey | null>(() => authenticated && userId
    && (role === 'customer' || role === 'technician')
    ? { userId, role, sessionGeneration, serviceOrderId } : null,
  [authenticated, userId, role, sessionGeneration, serviceOrderId]);
  const raw = useSyncExternalStore(coordinator.subscribe, coordinator.getSnapshot, coordinator.getSnapshot);
  // Render must never expose the preceding user's snapshot while effects are being cleaned up.
  const snapshot = key && sameOrderSession(raw?.key ?? null, key) ? raw : null;
  useEffect(() => {
    if (!key) { coordinator.invalidate(); return; }
    coordinator.activate(key);
    coordinator.setPendingIntent(key, true);
    let active = true;
    const updateJournal = () => {
      if (active) coordinator.setPendingIntent(key, journal.hasUnresolved(key));
    };
    const unsubscribe = journal.subscribe(updateJournal);
    void journal.restore().then(() => {
      if (!active) return;
      updateJournal(); return coordinator.refreshOrderSession(key, 'focus');
    }).catch(() => {
      if (!active) return;
      coordinator.setPendingIntent(key, true);
      // Reading stays available when durable locks cannot be loaded. Writes stay closed.
      void coordinator.refreshOrderSession(key, 'focus');
    });
    const listener = AppState.addEventListener('change', state => {
      if (active && state === 'active') void coordinator.refreshOrderSession(key, 'foreground');
    });
    return () => { active = false; unsubscribe(); listener.remove(); coordinator.invalidate(); };
  }, [coordinator, journal, key]);
  useEffect(() => {
    if (key) coordinator.setProofPolicy(key, proofPolicy);
  }, [coordinator, key, proofPolicy]);
  const value = useMemo<OrderSessionContextValue>(() => ({ key, snapshot, coordinator, journal,
    refresh: (reason = 'refresh') => key ? coordinator.refreshOrderSession(key, reason) : Promise.resolve(),
    loadResource: kind => key ? coordinator.loadResource(key, kind) : Promise.resolve(),
  }), [key, snapshot, coordinator, journal]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useOrderSession(): OrderSessionContextValue {
  const context = useContext(Context);
  if (!context) throw new Error('OrderSessionProvider required');
  return context;
}
