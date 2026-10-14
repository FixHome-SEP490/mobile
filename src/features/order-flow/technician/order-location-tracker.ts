import { isHistoricalOrder } from '../../../api/orders.api';
import type { UpdateLocationDto } from '../../../types/api.types';
import { sameOrderSession, type OrderSessionKey } from '../domain/order-session.types';
import type { OrderReadCoordinator } from '../runtime/order-read-coordinator';
import { isFreshOrderPosition, type FreshOrderPosition } from './arrival-proof-controller';
const owners = new WeakMap<OrderReadCoordinator, object>();
/** Foreground/focus owner only. Location is never persisted and never proves arrival. */
export function createOrderLocationTracker(deps: {
  coordinator: OrderReadCoordinator; getKey: () => OrderSessionKey | null;
  watch: (onPosition: (position: FreshOrderPosition) => void) => Promise<() => void>;
  patch: (orderId: string, dto: UpdateLocationDto) => Promise<unknown>; now?: () => number;
}) {
  const owner = {};
  let active = false, generation = 0, remove: (() => void) | undefined, unsubscribe: (() => void) | undefined;
  let pending: FreshOrderPosition | null = null, sending = false, key: OrderSessionKey | null = null;
  let lastSentAt = Number.NEGATIVE_INFINITY;
  function eligible() {
    const s = deps.coordinator.getSnapshot();
    return active && key?.role === 'technician' && sameOrderSession(deps.getKey(), key) && sameOrderSession(s?.key ?? null, key)
      && s?.access === 'current' && s.order.status === 'ready' && !isHistoricalOrder(s.order.data)
      && s.order.data.id === key.serviceOrderId && s.order.data.technician?.id === key.userId && s.order.data.status === 'EN_ROUTE';
  }
  function stop() {
    active = false; generation++; pending = null; remove?.(); remove = undefined;
    unsubscribe?.(); unsubscribe = undefined;
    if (owners.get(deps.coordinator) === owner) owners.delete(deps.coordinator);
  }
  async function flush(gen: number) {
    if (sending || !eligible() || gen !== generation) return;
    sending = true;
    try {
      while (pending && eligible() && gen === generation) {
        const sampleTime = (deps.now ?? Date.now)();
        // iOS distance events can arrive rapidly: retain only the latest sample
        // until a later foreground event, never schedule an offline retry.
        if (sampleTime - lastSentAt < 15000) return;
        const p = pending; pending = null;
        if (!isFreshOrderPosition(p, (deps.now ?? Date.now)())) continue;
        lastSentAt = sampleTime;
        try { await deps.patch(key!.serviceOrderId, { lat: p.lat, lng: p.lng, accuracyMeters: p.accuracyMeters }); }
        catch { /* No background retry, no permission inference from a failed ping. */ }
      }
    } finally { sending = false; }
  }
  return { stop,
    async start() {
      if (active || owners.has(deps.coordinator)) return;
      key = deps.getKey(); active = true;
      if (!eligible()) { active = false; return; }
      owners.set(deps.coordinator, owner); const gen = ++generation;
      unsubscribe = deps.coordinator.subscribe(() => { if (!eligible()) stop(); });
      try {
        const cleanup = await deps.watch(position => {
          if (!eligible() || gen !== generation || !isFreshOrderPosition(position, (deps.now ?? Date.now)())) return;
          pending = position; void flush(gen);
        });
        if (!eligible() || gen !== generation) cleanup(); else remove = cleanup;
      } catch { stop(); }
    },
  };
}
export type OrderLocationTracker = ReturnType<typeof createOrderLocationTracker>;
