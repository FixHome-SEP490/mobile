import { isHistoricalOrder } from '../../../api/orders.api';
import { createOrderSessionSnapshot, readyResource, sameOrderSession } from '../domain/order-session.types';
import type { OrderSessionKey, OrderSessionSnapshot, OrderResourceKind } from '../domain/order-session.types';
import { normalizeOrderResource, normalizeSessionOrder } from '../domain/order-view-models';

export interface OrderReadDependencies {
  readOrder: (key: OrderSessionKey) => Promise<unknown>;
  readResource: (key: OrderSessionKey, kind: OrderResourceKind) => Promise<unknown>;
  now?: () => number;
}
/** Re-reads that never blank the screen. An explicit refresh and the cancellation/aftercare reads still show loading. */
const QUIET_REASONS = new Set(['live', 'focus', 'foreground', 'command-readback', 'payment-readback']);
export function createOrderReadCoordinator(deps: OrderReadDependencies) {
  let snapshot: OrderSessionSnapshot | null = null;
  let generation = 0;
  let seq = 0;
  const flights = new Map<string, Promise<void>>();
  const listeners = new Set<() => void>();
  const publish = () => listeners.forEach(listener => listener());
  const matches = (key: OrderSessionKey, gen = generation) => gen === generation && sameOrderSession(snapshot?.key ?? null, key);
  function purge(access: 'revoked' | 'unverified') {
    generation++; flights.clear();
    if (snapshot) snapshot = { ...createOrderSessionSnapshot(snapshot.key), access };
    publish();
  }
  function deny(error: unknown): boolean {
    const status = (error as { response?: { status?: number } } | null)?.response?.status;
    return status === 401 || status === 403;
  }
  async function refreshOrderSession(key: OrderSessionKey, reason: string): Promise<void> {
    if (!matches(key)) return;
    const active = flights.get('order'); if (active) return active;
    const previous = snapshot!;
    const opened = (Object.keys(previous.resources) as OrderResourceKind[])
      .filter(kind => previous.resources[kind].status !== 'unloaded');
    // Each explicit order refresh supersedes already-opened resource reads.
    // No unopened resource is fetched; stale mutation targets cannot remain ready.
    generation++; flights.clear();
    const gen = generation, requestSeq = ++seq;
    // Background re-reads (live, focus, foreground and command/payment read-back) keep showing the data it has until the new data arrives,
    // so a command read-back, focus or push never flashes the screen to a loading state or drops what the user typed.
    // Only a live (server push / poll) re-read also swallows its own failure; the next push or poll retries.
    // Any other failed re-read still ends in the error state below, so a stale target is never trusted.
    const quiet = QUIET_REASONS.has(reason) && previous.order.status === 'ready';
    const swallow = quiet && reason === 'live';
    if (!quiet) {
      const resources = { ...previous.resources };
      for (const kind of opened) resources[kind] = { status: 'loading', requestSeq };
      const terminal = previous.order.status === 'ready' && ['COMPLETED', 'CANCELLED'].includes(previous.order.data.status);
      snapshot = { ...previous, resources, order: terminal ? previous.order : { status: 'loading', requestSeq } }; publish();
    }
    const request = (async () => {
      try {
        const order = normalizeSessionOrder(await deps.readOrder(key), key.serviceOrderId);
        if (!matches(key, gen)) return;
        if (isHistoricalOrder(order)) {
          if (key.role !== 'technician') { purge('revoked'); return; }
          generation++; flights.clear();
          snapshot = { ...createOrderSessionSnapshot(key), access: 'historical', order: readyResource(order, requestSeq, (deps.now ?? Date.now)()) }; publish(); return;
        }
        if (key.role === 'technician' && order.technician?.id !== key.userId) { purge('revoked'); return; }
        const old = previous.order.status === 'ready' && !isHistoricalOrder(previous.order.data) ? previous.order.data : null;
        if (old?.technician?.id !== order.technician?.id && old) {
          const pendingIntent = snapshot?.pendingIntent, proofPolicy = snapshot?.proofPolicy;
          generation++; flights.clear(); snapshot = { ...createOrderSessionSnapshot(key), pendingIntent, proofPolicy };
        }
        const terminal = old && ['COMPLETED', 'CANCELLED'].includes(old.status);
        snapshot = { ...snapshot!, access: 'current', order: readyResource(terminal && !['COMPLETED', 'CANCELLED'].includes(order.status) ? old : order, requestSeq, (deps.now ?? Date.now)()) };
        publish();
        if (matches(key, gen)) await Promise.all(opened.map(kind => loadResource(key, kind, quiet, swallow)));
      } catch (error) {
        if (!matches(key, gen)) return;
        if (deny(error)) { purge('revoked'); return; }
        if (swallow) return;
        // Known terminal remains terminal even if an auxiliary refresh fails.
        if (previous.order.status === 'ready' && ['COMPLETED', 'CANCELLED'].includes(previous.order.data.status)) snapshot = { ...snapshot!, order: previous.order };
        else snapshot = { ...snapshot!, order: { status: 'error', requestSeq, error: 'unavailable' } };
        const resources = { ...snapshot!.resources };
        for (const kind of opened) resources[kind] = { status: 'error', requestSeq, error: 'unavailable' };
        snapshot = { ...snapshot!, resources };
        publish();
      }
    })();
    flights.set('order', request);
    try { await request; } finally { if (flights.get('order') === request) flights.delete('order'); }
  }
  async function loadResource(key: OrderSessionKey, kind: OrderResourceKind, quiet = false, swallow = false): Promise<void> {
    if (!matches(key) || snapshot?.access !== 'current' || snapshot.order.status !== 'ready') return;
    const active = flights.get(kind); if (active) return active;
    const gen = generation, requestSeq = ++seq;
    const keep = quiet && snapshot.resources[kind].status === 'ready';
    if (!keep) { snapshot = { ...snapshot, resources: { ...snapshot.resources, [kind]: { status: 'loading', requestSeq } } }; publish(); }
    const request = (async () => {
      try {
        const payload = await deps.readResource(key, kind);
        if (!matches(key, gen) || snapshot?.access !== 'current') return;
        const data = normalizeOrderResource(kind, payload, key.serviceOrderId, key.role);
        snapshot = { ...snapshot, resources: { ...snapshot.resources, [kind]: readyResource(data, requestSeq, (deps.now ?? Date.now)()) } }; publish();
      } catch (error) {
        if (!matches(key, gen)) return;
        if (deny(error)) { purge('revoked'); return; }
        if (keep && swallow) return;
        snapshot = { ...snapshot!, resources: { ...snapshot!.resources, [kind]: { status: 'error', requestSeq, error: 'unavailable' } } }; publish();
      }
    })();
    flights.set(kind, request);
    try { await request; } finally { if (flights.get(kind) === request) flights.delete(kind); }
  }
  return {
    activate(key: OrderSessionKey) {
      if (sameOrderSession(snapshot?.key ?? null, key)) return;
      generation++; flights.clear(); snapshot = createOrderSessionSnapshot(key); publish();
    },
    refreshOrderSession, loadResource,
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    invalidate() { generation++; flights.clear(); snapshot = null; publish(); },
    setPendingIntent(key: OrderSessionKey, pendingIntent: boolean) {
      if (!matches(key)) return; snapshot = { ...snapshot!, pendingIntent }; publish();
    },
    setProofPolicy(key: OrderSessionKey, proofPolicy: OrderSessionSnapshot['proofPolicy']) {
      if (!matches(key)) return; snapshot = { ...snapshot!, proofPolicy }; publish();
    },
  };
}
export type OrderReadCoordinator = ReturnType<typeof createOrderReadCoordinator>;
