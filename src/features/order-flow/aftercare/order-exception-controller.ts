import { sameOrderSession, type OrderSessionKey, type OrderSessionSnapshot } from '../domain/order-session.types';
import type { OrderReadCoordinator } from '../runtime/order-read-coordinator';
import type { OrderCommandJournal, OrderCommandMarker } from '../runtime/order-command-journal';
import { createOrderCommandAdapter, type CommandReadbackVerdict } from '../runtime/order-controller-adapters';
import { FINANCIAL_UNKNOWN, m6Order, type M6Phase } from '../customer/payment-facts';
import { boundedText } from './aftercare-contracts';
import { isHistoricalOrder } from '../../../api/orders.api';

/** Historical permission grants precisely this summary, never original booking/contact/evidence. */
export function orderExceptionView(s: OrderSessionSnapshot | null) {
  const order = s?.key.role === 'technician' && s.access === 'historical' && s.order.status === 'ready' && s.order.data.id === s.key.serviceOrderId && isHistoricalOrder(s.order.data) ? s.order.data : null;
  return { access: s?.access ?? 'unverified', summary: order ? { id: order.id, code: order.code, status: order.status,
    createdAt: order.createdAt, completedAt: order.completedAt ?? null, cancelledAt: order.cancelledAt ?? null, historical: true as const } : null };
}
export interface OrderExceptionDependencies {
  coordinator: OrderReadCoordinator; journal: OrderCommandJournal; getKey: () => OrderSessionKey | null;
  isActive: () => boolean; newIntentId: () => string; cancel: (id: string, reason: string) => Promise<unknown>;
}
export interface CancellationConfirmation { key: OrderSessionKey; reason: string; signature: string }
export interface OrderExceptionState { phase: M6Phase; result: 'unverified' | 'cancelled' | 'no-longer-assigned'; confirmation: CancellationConfirmation | null; message: string | null }
export function createOrderExceptionController(deps: OrderExceptionDependencies) {
  let busy = false, epoch = 0;
  let state: OrderExceptionState = { phase: 'idle', result: 'unverified', confirmation: null, message: null };
  const listeners = new Set<() => void>();
  const publish = (patch: Partial<OrderExceptionState>) => { state = { ...state, ...patch }; listeners.forEach(f => f()); };
  const same = (key: OrderSessionKey) => deps.isActive() && sameOrderSession(deps.getKey(), key) && sameOrderSession(deps.coordinator.getSnapshot()?.key ?? null, key);
  function signature(key: OrderSessionKey) {
    const order = same(key) ? m6Order(deps.coordinator.getSnapshot(), key) : null;
    if (!order || !['ACCEPTED', 'EN_ROUTE'].includes(order.status) || (key.role === 'technician' && order.arrivalVerified !== false)) return null;
    return JSON.stringify({ id: order.id, status: order.status, bookingId: order.bookingId, technicianId: order.technician?.id, arrivalVerified: order.arrivalVerified });
  }
  const matches = (t: CancellationConfirmation) => signature(t.key) === t.signature;
  const pending = (key: OrderSessionKey) => deps.journal.list(key.userId).filter(m => m.role === key.role && m.serviceOrderId === key.serviceOrderId && m.operation === 'order-cancel' && !['resolved', 'failed-known'].includes(m.status));
  function verdict(key: OrderSessionKey): CommandReadbackVerdict {
    const s = deps.coordinator.getSnapshot(); if (!same(key) || s?.order.status !== 'ready' || s.order.data.id !== key.serviceOrderId) return 'unresolved';
    if (s.access === 'current' && s.order.data.status === 'CANCELLED') { publish({ result: 'cancelled' }); return 'resolved'; }
    if (key.role === 'technician' && s.access === 'historical') { publish({ result: s.order.data.status === 'CANCELLED' ? 'cancelled' : 'no-longer-assigned' }); return 'resolved'; }
    return 'unresolved';
  }
  const adapter = () => createOrderCommandAdapter(deps.journal, { isCurrent: same, refresh: async key => { await deps.coordinator.refreshOrderSession(key, 'cancellation-readback'); } });
  function finish(key: OrderSessionKey, marker?: OrderCommandMarker) {
    if (!same(key)) return; const phase = marker?.status === 'resolved' ? 'resolved' : marker?.status === 'failed-known' ? 'failed-known' : 'unknown';
    publish({ phase, confirmation: null, message: phase === 'unknown' ? FINANCIAL_UNKNOWN : null });
  }
  return {
    getState: () => state, subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    canCancel() { const key = deps.getKey(); return !!key && !busy && !deps.journal.hasUnresolved(key) && !!signature(key); },
    invalidatePresentation() { epoch++; publish({ phase: 'idle', result: 'unverified', confirmation: null, message: null }); },
    cancelConfirmation() { epoch++; publish({ confirmation: null, ...(busy ? {} : { phase: 'idle' as const }) }); },
    revalidateConfirmation() { if (state.confirmation && !matches(state.confirmation)) { epoch++; publish({ confirmation: null, ...(busy ? {} : { phase: 'idle' as const }) }); } },
    async prepareCancellation(reason: string) {
      const key = deps.getKey(); if (!key || !same(key) || busy) return; busy = true; const generation = ++epoch; publish({ phase: 'verifying', confirmation: null, result: 'unverified' });
      try {
        await deps.journal.restore(); if (!same(key) || generation !== epoch) return;
        if (deps.journal.hasUnresolved(key)) { finish(key, pending(key)[0]); return; }
        await deps.coordinator.refreshOrderSession(key, 'cancellation-confirm'); if (!same(key) || generation !== epoch) return;
        const sig = signature(key); if (!sig) { publish({ phase: 'denied', message: 'Hãy liên hệ hỗ trợ cho bước hiện tại của đơn.' }); return; }
        publish({ phase: 'confirming', message: null, confirmation: Object.freeze({ key: Object.freeze({ ...key }), signature: sig, reason: boundedText(reason, 1, 2000) }) });
      } catch { if (same(key)) publish({ phase: 'denied', confirmation: null, message: 'Hãy kiểm tra đơn và lý do hủy.' }); }
      finally { busy = false; }
    },
    async submitConfirmation() {
      const t = state.confirmation; if (!t || busy || state.phase !== 'confirming' || !matches(t)) return;
      busy = true; let intentId: string | null = null, sent = false; publish({ phase: 'submitting' });
      try {
        intentId = deps.newIntentId(); const allocatedId = intentId;
        await adapter().dispatch(t.key, { intentId, operation: 'order-cancel', entityId: t.key.serviceOrderId }, async () => {
          if (state.confirmation !== t || !matches(t)) return; sent = true; publish({ confirmation: null }); await deps.cancel(t.key.serviceOrderId, t.reason);
        }, () => sent ? verdict(t.key) : 'failed-known');
        if (!sent && deps.journal.list(t.key.userId).some(m => m.intentId === allocatedId)) await deps.journal.mark(t.key.userId, allocatedId, 'failed-known');
        finish(t.key, deps.journal.list(t.key.userId).find(m => m.intentId === allocatedId));
      } catch { if (same(t.key)) publish({ phase: intentId ? 'unknown' : 'failed-known', confirmation: null, message: intentId ? FINANCIAL_UNKNOWN : 'Chưa gửi được thao tác. Hãy xác nhận lại.' }); }
      finally { busy = false; }
    },
    async verify() {
      const key = deps.getKey(); if (!key || !same(key) || busy) return; busy = true; publish({ phase: 'verifying', confirmation: null });
      try { await deps.journal.restore(); if (!same(key)) return; const markers = pending(key);
        if (!markers.length) { publish({ phase: deps.journal.hasUnresolved(key) ? 'unknown' : 'idle' }); return; }
        for (const m of markers) { if (!same(key)) break; await adapter().verify(key, m.intentId, () => verdict(key)); }
        finish(key, deps.journal.list(key.userId).find(m => m.intentId === markers[0].intentId));
      } catch { if (same(key)) publish({ phase: 'unknown', message: FINANCIAL_UNKNOWN }); }
      finally { busy = false; }
    },
  };
}
export type OrderExceptionController = ReturnType<typeof createOrderExceptionController>;
