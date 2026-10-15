import { financialRecord, normalizeCustomerWalletSummary, paymentHttpsUrl, validateCustomerTopUp,
  type CustomerTopUpDto, type CustomerWalletSummary } from '../../../api/customer-wallet.api';
import type { Resource } from '../domain/order-session.types';
import { FINANCIAL_UNKNOWN, type M6Phase } from './payment-facts';
import type { WalletTopUpJournal, WalletTopUpMarker } from './wallet-top-up-journal';
export interface CustomerWalletOwner { userId: string; role: 'customer'; sessionGeneration: number }
export interface CustomerWalletDependencies {
  journal: WalletTopUpJournal; getOwner: () => CustomerWalletOwner | null; isActive: () => boolean; newKey: () => string; now?: () => number;
  transport: { readSummary: (page: number) => Promise<unknown>; topUp: (dto: CustomerTopUpDto) => Promise<unknown>; openUrl: (url: string) => Promise<unknown> };
}
export interface TopUpConfirmation { owner: CustomerWalletOwner; dto: CustomerTopUpDto }
export interface CustomerWalletState { phase: M6Phase; confirmation: TopUpConfirmation | null; summary: Resource<CustomerWalletSummary>; urlReady: boolean; message: string | null }
export function isCustomerWalletReturn(url: string) {
  try { const link = new URL(url); return link.protocol === 'fixhome:' && link.hostname === 'app' && link.pathname === '/wallet' && !link.username && !link.password; } catch { return false; }
}
/** No POST replay, no automatic invoice payment, no credit inferred from a redirect. */
export function createCustomerWalletController(deps: CustomerWalletDependencies) {
  let state: CustomerWalletState = { phase: 'idle', confirmation: null, summary: { status: 'unloaded', requestSeq: 0 }, urlReady: false, message: null };
  let busy = false, epoch = 0, readSeq = 0;
  let redirect: { owner: CustomerWalletOwner; stableKey: string; url: string; opened: boolean; failed: boolean } | null = null;
  const listeners = new Set<() => void>();
  const publish = (patch: Partial<CustomerWalletState>) => { state = { ...state, ...patch }; listeners.forEach(f => f()); };
  const same = (owner: CustomerWalletOwner) => { const current = deps.getOwner(); return deps.isActive() && owner.role === 'customer' && current?.role === 'customer'
    && current.userId === owner.userId && current.sessionGeneration === owner.sessionGeneration; };
  function finish(owner: CustomerWalletOwner, marker: WalletTopUpMarker | null) {
    if (!same(owner)) return;
    const resolved = marker?.status === 'resolved', pending = marker?.status === 'unknown' && redirect?.stableKey === marker.stableKey && !redirect.failed;
    if (resolved) redirect = null;
    publish({ phase: resolved ? 'resolved' : marker?.status === 'failed-known' ? 'failed-known' : pending ? 'pending' : marker ? 'unknown' : 'idle',
      confirmation: null, urlReady: !!pending && !redirect?.opened, message: marker?.status === 'unknown' ? FINANCIAL_UNKNOWN : null });
  }
  async function read(owner: CustomerWalletOwner, page: number) {
    const seq = ++readSeq; publish({ summary: { status: 'loading', requestSeq: seq } });
    try {
      const data = normalizeCustomerWalletSummary(await deps.transport.readSummary(page));
      if (!same(owner) || seq !== readSeq) return null;
      publish({ summary: { status: 'ready', data, requestSeq: seq, fetchedAt: (deps.now ?? Date.now)() } }); return data;
    } catch { if (same(owner) && seq === readSeq) publish({ summary: { status: 'error', requestSeq: seq, error: 'unavailable' } }); return null; }
  }
  async function reconcile(owner: CustomerWalletOwner, page: number) {
    const summary = await read(owner, page); if (!same(owner)) return;
    const marker = deps.journal.get(owner.userId);
    if (marker?.status === 'unknown' && marker.paymentId && summary?.transactions.some(t => t.type === 'top_up' && t.referenceType === 'PAYMENT' && t.referenceId === marker.paymentId)) {
      await deps.journal.mark(owner.userId, marker.stableKey, 'resolved');
    }
    finish(owner, deps.journal.get(owner.userId));
  }
  async function verify(page = 1) {
    const owner = deps.getOwner(); if (!owner || !same(owner) || busy || !Number.isSafeInteger(page) || page < 1) return;
    busy = true; publish({ phase: 'verifying', confirmation: null });
    try { await deps.journal.restore(); if (same(owner)) await reconcile(owner, page); }
    catch { if (same(owner)) publish({ phase: 'unknown', message: FINANCIAL_UNKNOWN }); }
    finally { busy = false; }
  }
  return {
    getState: () => state, subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    async requestTopUp(amount: number) {
      const owner = deps.getOwner(); if (!owner || !same(owner) || busy) return;
      busy = true; const generation = ++epoch; publish({ confirmation: null, message: null });
      try {
        await deps.journal.restore(); if (!same(owner) || generation !== epoch) return;
        const marker = deps.journal.get(owner.userId);
        if (marker?.status === 'unknown') { finish(owner, marker); return; }
        const dto = Object.freeze(validateCustomerTopUp({ amount, idempotencyKey: deps.newKey() }));
        publish({ phase: 'confirming', confirmation: Object.freeze({ owner: Object.freeze({ ...owner }), dto }) });
      } catch { if (same(owner)) publish({ phase: 'denied', confirmation: null, message: 'Hãy kiểm tra số tiền nạp và trạng thái ví trước khi tiếp tục.' }); }
      finally { busy = false; }
    },
    async submitConfirmation() {
      const target = state.confirmation; if (!target || busy || !same(target.owner) || state.phase !== 'confirming') return;
      busy = true; publish({ phase: 'submitting' });
      try {
        const reserved = await deps.journal.begin(target.owner.userId, target.dto.idempotencyKey, (deps.now ?? Date.now)());
        if (!reserved) { finish(target.owner, deps.journal.get(target.owner.userId)); return; }
        if (!same(target.owner) || state.confirmation !== target) {
          await deps.journal.mark(target.owner.userId, target.dto.idempotencyKey, 'failed-known');
          finish(target.owner, deps.journal.get(target.owner.userId)); return;
        }
        publish({ confirmation: null });
        try {
          const row = financialRecord(await deps.transport.topUp(target.dto));
          if (typeof row?.paymentId === 'string') await deps.journal.recordPayment(target.owner.userId, target.dto.idempotencyKey, row.paymentId);
          const url = paymentHttpsUrl(row?.paymentUrl);
          if (url && row?.paymentId && same(target.owner)) redirect = { owner: target.owner, stableKey: target.dto.idempotencyKey, url, opened: false, failed: false };
        } catch { /* Transport success/failure is not credit authority. */ }
        if (same(target.owner)) { publish({ phase: 'verifying' }); await reconcile(target.owner, 1); }
      } catch { if (same(target.owner)) publish({ phase: 'unknown', confirmation: null, message: FINANCIAL_UNKNOWN }); }
      finally { busy = false; }
    },
    cancelConfirmation() { epoch++; publish({ confirmation: null, ...(busy ? {} : { phase: 'idle' as const }) }); },
    invalidatePresentation() { epoch++; readSeq++; redirect = null; publish({ phase: 'idle', confirmation: null, summary: { status: 'unloaded', requestSeq: readSeq }, urlReady: false, message: null }); },
    async restoredMarker() { const owner = deps.getOwner(); if (!owner || !same(owner)) return null; await deps.journal.restore(); return same(owner) ? deps.journal.get(owner.userId) : null; },
    verify, refresh: verify,
    handleReturn: (url: string) => isCustomerWalletReturn(url) ? verify() : Promise.resolve(),
    async openPaymentUrl() {
      const link = redirect; if (!link || link.opened || busy || !same(link.owner)) return;
      link.opened = true; publish({ urlReady: false });
      try { await deps.transport.openUrl(link.url); }
      catch { link.failed = true; if (same(link.owner)) publish({ phase: 'unknown', message: FINANCIAL_UNKNOWN }); }
      finally { if (same(link.owner)) await verify(); }
    },
  };
}
export type CustomerWalletController = ReturnType<typeof createCustomerWalletController>;
