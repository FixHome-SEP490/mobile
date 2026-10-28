import { financialRecord, wholeVnd } from '../../../api/customer-wallet.api';
import { sameOrderSession, type OrderSessionKey } from '../domain/order-session.types';
import type { OrderCommandJournal, OrderCommandMarker } from '../runtime/order-command-journal';
import { createOrderCommandAdapter, type CommandReadbackVerdict } from '../runtime/order-controller-adapters';
import type { OrderReadCoordinator } from '../runtime/order-read-coordinator';
import { NoFundedCashReservationError, type FundedCashReservation } from '../../../api/funded-checkout.api';
import { cashFact, financialResult, hasCompletionRequest, invoiceFact, isUnresolvedMarker, m6Order, validateCashDeclaration,
  FINANCIAL_UNKNOWN, type CashDeclarationDto, type FinancialResult, type M6Phase } from '../customer/payment-facts';
export interface TechnicianCashDependencies {
  coordinator: OrderReadCoordinator; journal: OrderCommandJournal; getKey: () => OrderSessionKey | null; isActive: () => boolean; newIntentId: () => string;
  transport: {
    declareCash: (id: string, dto: CashDeclarationDto) => Promise<unknown>;
    /** Funded cash (backend T2.1): the held voucher of this order, or throws NoFundedCashReservationError when the server says there is none. */
    cashReservation?: (orderId: string) => Promise<FundedCashReservation>;
    declareFundedCash?: (orderId: string, reservationId: string, dto: CashDeclarationDto) => Promise<unknown>;
  };
}
export interface CashDeclarationConfirmation { key: OrderSessionKey; invoiceId: string; invoiceAmount: number; dto: CashDeclarationDto; voucher?: { reservationId: string; dueVnd: number } }
/** What the server says about a voucher on this order. Only `none` lets the full invoice amount be collected; `error` collects nothing. */
export type CashVoucherLookup = { status: 'unchecked' | 'checking' | 'none' | 'error' } | { status: 'held'; reservationId: string; dueVnd: number };
export interface TechnicianCashState { phase: M6Phase; confirmation: CashDeclarationConfirmation | null; result: FinancialResult; message: string | null; voucher: CashVoucherLookup }
export const CASH_VOUCHER_UNCHECKED = 'Chưa kiểm tra được voucher của khách. Chưa thể khai báo tiền mặt; hãy thử lại.';
const cashDueMessage = (due: number) => `Khách đang dùng voucher. Số tiền mặt cần thu là ${due.toLocaleString('vi-VN')} ₫; hãy khai báo đúng số này.`;
/** First declaration only; existing declarations are read/support, never silently overwritten. */
export function createTechnicianCashController(deps: TechnicianCashDependencies) {
  let state: TechnicianCashState = { phase: 'idle', confirmation: null, result: 'unverified', message: null, voucher: { status: 'unchecked' } }, busy = false, epoch = 0;
  const listeners = new Set<() => void>();
  const publish = (patch: Partial<TechnicianCashState>) => { state = { ...state, ...patch }; listeners.forEach(f => f()); };
  const same = (key: OrderSessionKey) => key.role === 'technician' && deps.isActive() && sameOrderSession(deps.getKey(), key)
    && sameOrderSession(deps.coordinator.getSnapshot()?.key ?? null, key);
  const order = (key: OrderSessionKey) => same(key) ? m6Order(deps.coordinator.getSnapshot(), key) : null;
  const pending = (key: OrderSessionKey) => deps.journal.list(key.userId).filter(m => m.role === key.role && m.serviceOrderId === key.serviceOrderId && m.operation === 'cash-declare' && isUnresolvedMarker(m));
  async function refresh(key: OrderSessionKey) {
    await deps.coordinator.refreshOrderSession(key, 'cash-declaration-readback'); if (!order(key)) return;
    await Promise.all((['invoice', 'cash'] as const).filter(k => deps.coordinator.getSnapshot()?.resources[k].status === 'unloaded').map(k => deps.coordinator.loadResource(key, k)));
  }
  function eligible(key: OrderSessionKey) {
    const current = order(key), s = deps.coordinator.getSnapshot(), invoice = invoiceFact(s, key);
    return current && hasCompletionRequest(current) && ['UNDER_REPAIR', 'COMPLETED'].includes(current.status)
      && invoice?.status === 'unpaid' && cashFact(s, key) === null ? invoice : null;
  }
  const matches = (t: CashDeclarationConfirmation) => { const invoice = eligible(t.key); return !!invoice && invoice.id === t.invoiceId && invoice.amount === t.invoiceAmount; };
  /** One server read of the voucher on this order; any answer but an explicit "none" is not a licence to collect the full amount. */
  async function lookupVoucher(key: OrderSessionKey): Promise<CashVoucherLookup> {
    const read = deps.transport.cashReservation;
    if (!read) return { status: 'none' };
    try {
      const held = await read(key.serviceOrderId);
      return { status: 'held', reservationId: held.voucherReservationId, dueVnd: held.customerDueVnd };
    } catch (error) {
      return error instanceof NoFundedCashReservationError ? { status: 'none' } : { status: 'error' };
    }
  }
  function verdict(key: OrderSessionKey, m: OrderCommandMarker): CommandReadbackVerdict {
    if (!order(key)) return 'unresolved';
    const s = deps.coordinator.getSnapshot(), cash = cashFact(s, key), invoice = invoiceFact(s, key);
    return m.resultEntityId && cash?.id === m.resultEntityId && invoice?.id === m.entityId
      && (cash.status === 'pending_confirmation' || cash.status === 'disputed' || (cash.status === 'confirmed' && invoice.status === 'paid')) ? 'resolved' : 'unresolved';
  }
  function finish(key: OrderSessionKey, m?: OrderCommandMarker) {
    if (!same(key)) return;
    const phase = m?.status === 'resolved' ? 'resolved' : m?.status === 'failed-known' ? 'failed-known' : 'unknown';
    publish({ phase, confirmation: null, result: financialResult(deps.coordinator.getSnapshot(), key), message: phase === 'unknown' ? FINANCIAL_UNKNOWN : null });
  }
  return {
    getState: () => state, subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    /** Reads the voucher for the screen to show the amount to collect; the declaration reads it again just before it is sent. */
    async checkVoucher() {
      const key = deps.getKey(); if (!key || !same(key)) return;
      publish({ voucher: { status: 'checking' } });
      const found = await lookupVoucher(key);
      if (same(key)) publish({ voucher: found });
    },
    async requestDeclaration(input: CashDeclarationDto) {
      const key = deps.getKey(); if (!key || !same(key) || busy) return;
      let dto: CashDeclarationDto;
      try { dto = Object.freeze(validateCashDeclaration(input)); }
      catch { publish({ phase: 'denied', confirmation: null, message: 'Hãy nhập số tiền thực nhận và ghi chú hợp lệ.' }); return; }
      busy = true; const generation = ++epoch; publish({ phase: 'verifying', confirmation: null });
      try {
        await deps.journal.restore(); if (!same(key) || generation !== epoch) return;
        if (deps.journal.hasUnresolved(key)) { finish(key, pending(key)[0]); return; }
        await refresh(key); if (!same(key) || generation !== epoch) return;
        const invoice = eligible(key);
        if (!invoice) { publish({ phase: 'denied', message: 'Hóa đơn hoặc đối soát tiền mặt chưa cho phép khai báo.' }); return; }
        const found = await lookupVoucher(key); if (!same(key) || generation !== epoch) return;
        publish({ voucher: found });
        if (found.status === 'error') { publish({ phase: 'denied', message: CASH_VOUCHER_UNCHECKED }); return; }
        if (found.status === 'held' && dto.declaredAmount !== found.dueVnd) { publish({ phase: 'denied', message: cashDueMessage(found.dueVnd) }); return; }
        publish({ phase: 'confirming', message: null, confirmation: Object.freeze({ key: Object.freeze({ ...key }), invoiceId: invoice.id, invoiceAmount: invoice.amount, dto,
          ...(found.status === 'held' ? { voucher: Object.freeze({ reservationId: found.reservationId, dueVnd: found.dueVnd }) } : {}) }) });
      } catch { if (same(key)) publish({ phase: 'unknown', message: FINANCIAL_UNKNOWN }); }
      finally { busy = false; }
    },
    cancelConfirmation() { epoch++; publish({ confirmation: null, ...(busy ? {} : { phase: 'idle' as const }) }); },
    revalidateConfirmation() { if (state.confirmation && !matches(state.confirmation)) { epoch++; publish({ confirmation: null, ...(busy ? {} : { phase: 'idle' as const }) }); } },
    invalidatePresentation() { epoch++; publish({ phase: 'idle', confirmation: null, result: 'unverified', message: null, voucher: { status: 'unchecked' } }); },
    async submitConfirmation() {
      const target = state.confirmation; if (!target || busy || state.phase !== 'confirming' || !matches(target)) return;
      busy = true; let sent = false; const key = target.key, intentId = deps.newIntentId(); publish({ phase: 'submitting' });
      try {
        const adapter = createOrderCommandAdapter(deps.journal, { isCurrent: k => !!order(k), refresh });
        await adapter.dispatch(key, { operation: 'cash-declare', intentId, entityId: target.invoiceId }, async () => {
          if (state.confirmation !== target || !matches(target)) return;
          sent = true; publish({ confirmation: null });
          const row = financialRecord(target.voucher
            ? await deps.transport.declareFundedCash!(key.serviceOrderId, target.voucher.reservationId, target.dto)
            : await deps.transport.declareCash(key.serviceOrderId, target.dto));
          if (typeof row?.id === 'string' && row.serviceOrderId === key.serviceOrderId && row.declaredByTechnicianId === key.userId
            && wholeVnd(row.declaredAmount) === target.dto.declaredAmount) await deps.journal.recordEntity(key.userId, intentId, row.id);
        }, () => sent ? verdict(key, deps.journal.list(key.userId).find(m => m.intentId === intentId)!) : 'failed-known');
        if (!sent) { const m = deps.journal.list(key.userId).find(m => m.intentId === intentId); if (m) await deps.journal.mark(key.userId, intentId, 'failed-known'); }
        finish(key, deps.journal.list(key.userId).find(m => m.intentId === intentId));
      } catch { if (same(key)) publish({ phase: 'unknown', confirmation: null, message: FINANCIAL_UNKNOWN }); }
      finally { busy = false; }
    },
    async restoredMarkers() { const key = deps.getKey(); if (!key || !same(key)) return []; await deps.journal.restore(); return same(key) ? pending(key) : []; },
    async verify() {
      const key = deps.getKey(); if (!key || !same(key) || busy) return;
      busy = true; publish({ phase: 'verifying', confirmation: null });
      try {
        await deps.journal.restore(); if (!same(key)) return; const markers = pending(key);
        if (!markers.length) { publish({ phase: deps.journal.hasUnresolved(key) ? 'unknown' : 'idle' }); return; }
        await refresh(key);
        const adapter = createOrderCommandAdapter(deps.journal, { isCurrent: k => !!order(k), refresh: async () => {} });
        for (const m of markers) await adapter.verify(key, m.intentId, () => verdict(key, m));
        finish(key, deps.journal.list(key.userId).find(m => m.intentId === markers[0].intentId));
      } catch { if (same(key)) publish({ phase: 'unknown', message: FINANCIAL_UNKNOWN }); }
      finally { busy = false; }
    },
  };
}
export type TechnicianCashController = ReturnType<typeof createTechnicianCashController>;
