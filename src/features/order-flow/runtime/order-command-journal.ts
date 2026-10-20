import type { OrderRole, OrderSessionKey } from '../domain/order-session.types';

export type OrderCommandOperation = 'en-route' | 'check-in' | 'face-upload' | 'before-upload' | 'after-upload' | 'repair-recovery' | 'evidence-delete'
  | 'quote-create' | 'quote-decision' | 'extra-create' | 'extra-revise' | 'extra-decision'
  | 'parts-create' | 'parts-receive' | 'parts-usage' | 'parts-cancel' | 'request-completion'
  | 'wallet-pay' | 'vnpay-url' | 'no-charge' | 'cash-declare' | 'cash-confirm' | 'support-create' | 'review-create' | 'warranty-create'
  | 'order-cancel' | 'warranty-respond-agree' | 'warranty-respond-dispute';
export type OrderCommandStatus = 'submitting' | 'verifying' | 'unknown' | 'resolved' | 'failed-known';
export interface OrderCommandIntent {
  intentId: string;
  entityId: string;
  operation: OrderCommandOperation;
  stableKey?: string;
  resultEntityId?: string;
}
export interface OrderCommandMarker extends OrderCommandIntent {
  userId: string;
  role: OrderRole;
  serviceOrderId: string;
  dispatchedAt: number;
  status: OrderCommandStatus;
}
export interface OrderJournalStorage {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
}
const STORE_KEY = 'fixhome.order-command-intents.v1';
const operations: OrderCommandOperation[] = ['en-route', 'check-in', 'face-upload', 'before-upload', 'after-upload', 'repair-recovery', 'evidence-delete', 'quote-create', 'quote-decision', 'extra-create', 'extra-revise', 'extra-decision', 'parts-create', 'parts-receive', 'parts-usage', 'parts-cancel', 'request-completion', 'wallet-pay', 'vnpay-url', 'no-charge', 'cash-declare', 'cash-confirm', 'support-create', 'review-create', 'warranty-create', 'order-cancel', 'warranty-respond-agree', 'warranty-respond-dispute'];
const statuses: OrderCommandStatus[] = ['submitting', 'verifying', 'unknown', 'resolved', 'failed-known'];
const identifier = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
const stableKeyValid = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{7,127}$/.test(value);
const unresolved = (m: OrderCommandMarker) => m.status !== 'resolved' && m.status !== 'failed-known';
function sanitize(value: unknown): OrderCommandMarker {
  if (!value || typeof value !== 'object') throw new Error('Invalid command journal');
  const r = value as OrderCommandMarker;
  if (![r.userId, r.intentId, r.entityId, r.serviceOrderId].every(identifier)
    || !['customer', 'technician'].includes(r.role) || !operations.includes(r.operation)
    || !statuses.includes(r.status) || !Number.isFinite(r.dispatchedAt) || r.dispatchedAt < 0
    || (r.stableKey !== undefined && !stableKeyValid(r.stableKey))
    || (r.resultEntityId !== undefined && !identifier(r.resultEntityId))) throw new Error('Invalid command journal');
  return { userId: r.userId, role: r.role, serviceOrderId: r.serviceOrderId, intentId: r.intentId,
    entityId: r.entityId, operation: r.operation, dispatchedAt: r.dispatchedAt, status: r.status,
    ...(r.stableKey === undefined ? {} : { stableKey: r.stableKey }),
    ...(r.resultEntityId === undefined ? {} : { resultEntityId: r.resultEntityId }) };
}
/** No offline write queue: a marker is a durable lock, never a stored command body. */
export function createOrderCommandJournal(storage: OrderJournalStorage) {
  let markers: OrderCommandMarker[] = [];
  let loaded = false;
  let damaged = false;
  let restoring: Promise<void> | null = null;
  let writes: Promise<void> = Promise.resolve();
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach(listener => listener());
  const requireReady = () => { if (!loaded || damaged) throw new Error('Command journal unavailable'); };
  function persist() {
    const data = JSON.stringify(markers);
    writes = writes.then(() => storage.setItem(STORE_KEY, data)).catch(error => { damaged = true; throw error; });
    return writes;
  }
  return {
    restore(): Promise<void> {
      if (loaded) return Promise.resolve();
      if (restoring) return restoring;
      restoring = (async () => {
        try {
          const raw = await storage.getItem(STORE_KEY);
          const parsed: unknown = raw === null ? [] : JSON.parse(raw);
          if (!Array.isArray(parsed)) throw new Error('Invalid command journal');
          markers = parsed.map(sanitize).map(marker => unresolved(marker) ? { ...marker, status: 'unknown' as const } : marker);
          loaded = true; emit();
        } catch (error) { damaged = true; throw error; }
      })();
      return restoring;
    },
    async begin(key: OrderSessionKey, intent: OrderCommandIntent, now = Date.now()): Promise<boolean> {
      requireReady();
      if (markers.some(m => m.userId === key.userId && unresolved(m)
        && (m.entityId === intent.entityId || m.serviceOrderId === key.serviceOrderId))) return false;
      const marker = sanitize({ ...intent, userId: key.userId, role: key.role, serviceOrderId: key.serviceOrderId, dispatchedAt: now, status: 'submitting' });
      // Reserve synchronously before storage await so two taps cannot pass.
      markers = [...markers.filter(m => !(m.userId === key.userId && m.intentId === intent.intentId)), marker];
      emit(); await persist(); return true;
    },
    async mark(userId: string, intentId: string, status: OrderCommandStatus): Promise<void> {
      requireReady();
      markers = markers.map(m => m.userId === userId && m.intentId === intentId ? { ...m, status } : m);
      emit(); await persist();
    },
    async recordEntity(userId: string, intentId: string, entityId: string): Promise<void> {
      requireReady();
      const marker = markers.find(m => m.userId === userId && m.intentId === intentId);
      if (!marker || !identifier(entityId) || (marker.resultEntityId !== undefined && marker.resultEntityId !== entityId)) throw new Error('Conflicting command entity');
      markers = markers.map(m => m === marker ? sanitize({ ...m, resultEntityId: entityId }) : m);
      emit(); await persist();
    },
    hasUnresolved(key: OrderSessionKey, entityId?: string): boolean {
      // Corrupt/unread journal never grants a write. Auth token renewal cannot remove markers.
      if (!loaded || damaged) return true;
      return markers.some(m => m.userId === key.userId && unresolved(m)
        && (m.serviceOrderId === key.serviceOrderId || (entityId !== undefined && m.entityId === entityId)));
    },
    list(userId: string): OrderCommandMarker[] { requireReady(); return markers.filter(m => m.userId === userId).map(m => ({ ...m })); },
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}
export type OrderCommandJournal = ReturnType<typeof createOrderCommandJournal>;
