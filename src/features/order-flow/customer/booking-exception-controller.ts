import type { Resource } from '../domain/order-session.types';
import type { EntryAttempt, EntryAttemptJournal } from '../runtime/entry-attempt-journal';
import type { AftercareOwner, SupportContext } from '../aftercare/support-controller';
import { boundedText, deniedRead, record, uuid4 } from '../aftercare/aftercare-contracts';
import { FINANCIAL_UNKNOWN, type M6Phase } from './payment-facts';
export interface BookingRecoverySummary { id: string; customerId: string; status: string; serviceOrderId: string | null; mediaUrls: string[] }
export type BookingRecovery = { kind: 'unverified' | 'cancelled' } | { kind: 'order'; serviceOrderId: string } | { kind: 'reselect' | 'matching' | 'booking'; bookingId: string };
export interface BookingExceptionDependencies {
  journal: EntryAttemptJournal; getOwner: () => AftercareOwner | null; isActive: () => boolean; newIntentId: () => string;
  transport: { read: (id: string) => Promise<unknown>; cancel: (id: string, reason: string) => Promise<unknown> };
}
export interface BookingCancellationConfirmation { owner: AftercareOwner; bookingId: string; reason: string; signature: string }
export interface BookingExceptionState { phase: M6Phase; selectedBookingId: string | null; booking: Resource<BookingRecoverySummary>; confirmation: BookingCancellationConfirmation | null; message: string | null }
type Marker = Extract<EntryAttempt, { kind: 'booking-cancel' }>;
export function createBookingExceptionController(deps: BookingExceptionDependencies) {
  let busy = false, epoch = 0, seq = 0, loadedOwner: AftercareOwner | null = null;
  const empty = (id: string | null = null): BookingExceptionState => ({ phase: 'idle', selectedBookingId: id, booking: { status: 'unloaded', requestSeq: seq }, confirmation: null, message: null });
  let state = empty(); const listeners = new Set<() => void>();
  const publish = (patch: Partial<BookingExceptionState>) => { state = { ...state, ...patch }; listeners.forEach(f => f()); };
  const sameOwner = (o: AftercareOwner) => { const current = deps.getOwner(); return deps.isActive() && o.role === 'customer' && current?.role === 'customer' && current.userId === o.userId && current.sessionGeneration === o.sessionGeneration; };
  const same = (o: AftercareOwner, id: string) => sameOwner(o) && state.selectedBookingId === id;
  const current = () => loadedOwner && same(loadedOwner, state.selectedBookingId ?? '') && state.booking.status === 'ready' ? state.booking.data : null;
  function purge() { epoch++; seq++; loadedOwner = null; state = empty(state.selectedBookingId); publish({}); }
  const signature = (b: BookingRecoverySummary) => JSON.stringify({ id: b.id, status: b.status, serviceOrderId: b.serviceOrderId });
  const eligible = (b: BookingRecoverySummary) => !b.serviceOrderId && ['SUBMITTED', 'MATCHING', 'CLOSED'].includes(b.status);
  const matches = (t: BookingCancellationConfirmation) => { const b = current(); return same(t.owner, t.bookingId) && !!b && eligible(b) && signature(b) === t.signature; };
  const pending = (o: AftercareOwner, id: string) => deps.journal.list(o.userId).filter((m): m is Marker => m.kind === 'booking-cancel' && m.bookingId === id && !m.resolved);
  async function read(o: AftercareOwner, id: string) {
    const generation = epoch, requestSeq = ++seq; loadedOwner = null; publish({ booking: { status: 'loading', requestSeq } });
    try {
      const r = record(await deps.transport.read(id)); if (!same(o, id) || generation !== epoch) return;
      if (r.id !== id || r.customerId !== o.userId) { purge(); return; }
      if (!['PENDING', 'MATCHING', 'CONFIRMED', 'CANCELLED', 'SUBMITTED', 'CLOSED', 'MATCHED'].includes(String(r.status))
        || (r.serviceOrderId != null && !uuid4(r.serviceOrderId)) || (r.mediaUrls !== undefined && (!Array.isArray(r.mediaUrls) || r.mediaUrls.some(v => typeof v !== 'string')))) throw Error('Yêu cầu chưa xác định.');
      const b: BookingRecoverySummary = { id, customerId: o.userId, status: r.status as string, serviceOrderId: (r.serviceOrderId ?? null) as string | null,
        mediaUrls: (r.mediaUrls as string[] | undefined ?? []).filter(v => v.length > 0 && v.length <= 512 && !/^(file|content|data|blob):/i.test(v)) };
      loadedOwner = { ...o }; publish({ booking: { status: 'ready', data: b, requestSeq, fetchedAt: Date.now() } });
    } catch (e) { if (!same(o, id) || generation !== epoch) return; if (deniedRead(e)) purge(); else publish({ booking: { status: 'error', requestSeq, error: 'unavailable' } }); }
  }
  async function reconcile(o: AftercareOwner, id: string, markers: Marker[]) {
    await read(o, id); if (!same(o, id)) return;
    if (current()?.status === 'CANCELLED') for (const m of markers) { if (!same(o, id)) return; await deps.journal.resolve(o.userId, m.intentId); }
    if (!same(o, id)) return; const done = markers.every(m => deps.journal.list(o.userId).find(r => r.intentId === m.intentId)?.resolved);
    publish({ phase: done ? 'resolved' : 'unknown', confirmation: null, message: done ? null : FINANCIAL_UNKNOWN });
  }
  return {
    getState: () => state, subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    selectBooking(id: string | null) { purge(); state = empty(id && uuid4(id) ? id : null); publish({}); },
    invalidatePresentation: purge,
    cancelConfirmation() { epoch++; publish({ confirmation: null, ...(busy ? {} : { phase: 'idle' as const }) }); },
    revalidateConfirmation() { if (state.confirmation && !matches(state.confirmation)) { epoch++; publish({ confirmation: null, ...(busy ? {} : { phase: 'idle' as const }) }); } },
    async refresh() { const o = deps.getOwner(), id = state.selectedBookingId; if (!o || !id || !same(o, id) || busy) return; busy = true; try { await read(o, id); } finally { busy = false; } },
    supportContext(): SupportContext | null { const b = current(); return b ? { kind: 'booking', id: b.id, phase: 'no_order', authorizedRefs: b.mediaUrls, ...(b.serviceOrderId ? { linkedOrderId: b.serviceOrderId } : {}) } : null; },
    recovery(): BookingRecovery { const b = current(); if (!b) return { kind: 'unverified' }; if (b.serviceOrderId) return { kind: 'order', serviceOrderId: b.serviceOrderId };
      if (b.status === 'CANCELLED') return { kind: 'cancelled' }; return { kind: b.status === 'CLOSED' ? 'reselect' : b.status === 'MATCHING' ? 'matching' : 'booking', bookingId: b.id }; },
    async prepareCancellation(reason: string) {
      const o = deps.getOwner(), id = state.selectedBookingId; if (!o || !id || !same(o, id) || busy) return; busy = true; const generation = ++epoch; publish({ phase: 'verifying', confirmation: null });
      try {
        await deps.journal.restore(); if (!same(o, id) || generation !== epoch) return;
        if (deps.journal.blocked(o.userId, 'booking-cancel', id)) { publish({ phase: 'unknown', message: FINANCIAL_UNKNOWN }); return; }
        await read(o, id); if (!same(o, id) || generation !== epoch) return; const b = current();
        if (!b || !eligible(b)) { publish({ phase: 'denied', message: 'Hãy mở đơn đã liên kết hoặc liên hệ hỗ trợ.' }); return; }
        publish({ phase: 'confirming', message: null, confirmation: Object.freeze({ owner: Object.freeze({ ...o }), bookingId: id, signature: signature(b), reason: boundedText(reason, 1, 2000) }) });
      } catch { if (same(o, id)) publish({ phase: 'denied', confirmation: null, message: 'Hãy kiểm tra yêu cầu và lý do hủy.' }); }
      finally { busy = false; }
    },
    async submitConfirmation() {
      const t = state.confirmation; if (!t || busy || state.phase !== 'confirming' || !matches(t)) return; busy = true; let intentId: string | null = null; publish({ phase: 'submitting' });
      try {
        intentId = deps.newIntentId();
        if (!await deps.journal.begin({ kind: 'booking-cancel', bookingId: t.bookingId, ownerUserId: t.owner.userId, intentId, createdAt: Date.now() })) { publish({ phase: 'unknown', confirmation: null, message: FINANCIAL_UNKNOWN }); return; }
        if (state.confirmation !== t || !matches(t)) { await deps.journal.resolve(t.owner.userId, intentId); if (same(t.owner, t.bookingId)) publish({ phase: 'failed-known', confirmation: null, message: null }); return; }
        publish({ confirmation: null }); try { await deps.transport.cancel(t.bookingId, t.reason); } catch { /* GET decides; timeout/409 can follow a write. */ }
        if (same(t.owner, t.bookingId)) await reconcile(t.owner, t.bookingId, pending(t.owner, t.bookingId));
      } catch { if (same(t.owner, t.bookingId)) publish({ phase: intentId ? 'unknown' : 'failed-known', confirmation: null, message: intentId ? FINANCIAL_UNKNOWN : 'Chưa gửi được thao tác. Hãy xác nhận lại.' }); }
      finally { busy = false; }
    },
    async verify() {
      const o = deps.getOwner(), id = state.selectedBookingId; if (!o || !id || !same(o, id) || busy) return; busy = true; publish({ phase: 'verifying', confirmation: null });
      try { await deps.journal.restore(); if (!same(o, id)) return; const markers = pending(o, id); if (markers.length) await reconcile(o, id, markers); else publish({ phase: 'idle' }); }
      catch { if (same(o, id)) publish({ phase: 'unknown', message: FINANCIAL_UNKNOWN }); }
      finally { busy = false; }
    },
  };
}
export type BookingExceptionController = ReturnType<typeof createBookingExceptionController>;
