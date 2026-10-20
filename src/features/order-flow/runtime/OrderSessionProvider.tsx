import React, { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '../../../store/auth.store';
import { isHistoricalOrder } from '../../../api/orders.api';
import { sameOrderSession } from '../domain/order-session.types';
import type { OrderResourceKind, OrderSessionKey, OrderSessionSnapshot } from '../domain/order-session.types';
import { createOrderReadCoordinator, type OrderReadCoordinator } from './order-read-coordinator';
import { createOrderCommandJournal, type OrderCommandJournal } from './order-command-journal';
import { orderReadDependencies } from './order-controller-adapters';

// Non-secret minimal intent markers only. Private order/media snapshots are memory-only.
export const orderCommandJournal = createOrderCommandJournal(AsyncStorage);
// Stages that end before UNDER_REPAIR: once the order is past them no screen can verify their markers any more,
// so a leftover unknown marker would lock every later task (capture, handover) for good.
const PRE_REPAIR_OPERATIONS = ['en-route', 'check-in', 'face-upload', 'before-upload', 'repair-recovery', 'quote-create', 'quote-decision', 'evidence-delete'];
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
  const orderStatus = snapshot?.access === 'current' && snapshot.order.status === 'ready' && !isHistoricalOrder(snapshot.order.data)
    ? snapshot.order.data.status : null;
  useEffect(() => {
    if (!key || (orderStatus !== 'UNDER_REPAIR' && orderStatus !== 'COMPLETED')) return;
    void (async () => {
      await journal.restore();
      for (const m of journal.list(key.userId)) {
        if (m.serviceOrderId === key.serviceOrderId && (m.status === 'unknown' || m.status === 'verifying' || m.status === 'submitting')
          && PRE_REPAIR_OPERATIONS.includes(m.operation) && !(m.operation === 'evidence-delete' && m.stableKey === 'm6-after-delete')) {
          await journal.mark(key.userId, m.intentId, 'resolved');
        }
      }
    })().catch(() => {});
  }, [journal, key, orderStatus]);
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
