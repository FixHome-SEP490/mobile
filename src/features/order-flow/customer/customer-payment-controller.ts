import { financialRecord, normalizeCustomerWalletSummary, paymentHttpsUrl, wholeVnd, type CustomerWalletSummary } from '../../../api/customer-wallet.api';
import { sameOrderSession, type OrderResourceKind, type OrderSessionKey, type Resource } from '../domain/order-session.types';
import { createOrderCommandAdapter, type CommandReadbackVerdict } from '../runtime/order-controller-adapters';
import type { OrderCommandJournal, OrderCommandMarker } from '../runtime/order-command-journal';
import type { OrderReadCoordinator } from '../runtime/order-read-coordinator';
import { cashFact, financialResult, hasCompletionRequest, invoiceFact, isUnresolvedMarker, m6Order, validateCashConfirmation,
  FINANCIAL_UNKNOWN, type CashConfirmationDto, type FinancialResult, type M6Phase, type PaymentMethod } from './payment-facts';

export interface OrderPaymentTransport {
  payWallet: (invoiceId: string) => Promise<unknown>;
  createVnpayUrl: (invoiceId: string) => Promise<string>;
  confirmCash: (orderId: string, dto: CashConfirmationDto) => Promise<unknown>;
  readWallet: () => Promise<unknown>;
  openUrl: (url: string) => Promise<unknown>;
}
export interface OrderPaymentDependencies {
  coordinator: OrderReadCoordinator; journal: OrderCommandJournal; transport: OrderPaymentTransport;
  getKey: () => OrderSessionKey | null; isActive: () => boolean; newIntentId: () => string; now?: () => number;
}
export interface PaymentConfirmation {
  key: OrderSessionKey; invoiceId: string; amount: number; method: PaymentMethod;
  settlementId?: string; declaredAmount?: number; declaredByTechnicianId?: string; declaredAt?: string; cashDto?: CashConfirmationDto;
}
export interface OrderPaymentState {
  phase: M6Phase; method: PaymentMethod | null; target: PaymentConfirmation | null;
  confirmation: PaymentConfirmation | null; result: FinancialResult; message: string | null;
  wallet: Resource<CustomerWalletSummary>; urlReady: boolean;
}
const paymentOperations = ['wallet-pay', 'vnpay-url', 'cash-confirm'];
const VNPAY_LINK_TTL_MS = 15 * 60 * 1000;
/** Exclusive durable order/invoice lock. No amount or redirect data is persisted. */
export function createOrderPaymentController(deps: OrderPaymentDependencies) {
  let state: OrderPaymentState = { phase: 'idle', method: null, target: null, confirmation: null, result: 'unverified', message: null,
    wallet: { status: 'unloaded', requestSeq: 0 }, urlReady: false };
  let busy = false, epoch = 0, walletSeq = 0;
  let redirect: { key: OrderSessionKey; intentId: string; invoiceId: string; url: string; opened: boolean; failed: boolean } | null = null;
  const listeners = new Set<() => void>();
  const publish = (patch: Partial<OrderPaymentState>) => { state = { ...state, ...patch }; listeners.forEach(fn => fn()); };
  const same = (key: OrderSessionKey) => deps.isActive() && key.role === 'customer' && sameOrderSession(deps.getKey(), key)
    && sameOrderSession(deps.coordinator.getSnapshot()?.key ?? null, key);
  const owned = (key: OrderSessionKey) => same(key) && !!m6Order(deps.coordinator.getSnapshot(), key);
  const snapshot = () => deps.coordinator.getSnapshot();
  function markers(key: OrderSessionKey) { return deps.journal.list(key.userId).filter(m => m.role === key.role && m.serviceOrderId === key.serviceOrderId && paymentOperations.includes(m.operation) && isUnresolvedMarker(m)); }
  async function refresh(key: OrderSessionKey, resources: OrderResourceKind[] = ['invoice', 'cash']) {
    await deps.coordinator.refreshOrderSession(key, 'payment-readback');
    if (!owned(key)) return;
    await Promise.all(resources.filter(k => snapshot()?.resources[k].status === 'unloaded').map(k => deps.coordinator.loadResource(key, k)));
  }
  function eligible(key: OrderSessionKey, method: PaymentMethod) {
    const order = m6Order(snapshot(), key), invoice = invoiceFact(snapshot(), key), cash = cashFact(snapshot(), key);
    if (!owned(key) || !order || !hasCompletionRequest(order) || !['UNDER_REPAIR', 'COMPLETED'].includes(order.status)
      || !invoice || invoice.status !== 'unpaid' || (method !== 'cash' && invoice.amount <= 0) || cash === undefined) return null;
    if (method !== 'cash' && cash !== null) return null;
    if (method === 'cash' && cash && cash.status !== 'pending_confirmation') return null;
    return { key: { ...key }, invoiceId: invoice.id, amount: invoice.amount, method,
      ...(cash ? { settlementId: cash.id, declaredAmount: cash.amount, declaredByTechnicianId: cash.declaredByTechnicianId, declaredAt: cash.declaredAt } : {}) } satisfies PaymentConfirmation;
  }
  function matches(target: PaymentConfirmation) {
    const current = eligible(target.key, target.method);
    if (!current || current.invoiceId !== target.invoiceId || current.amount !== target.amount
      || current.settlementId !== target.settlementId || current.declaredAmount !== target.declaredAmount
      || current.declaredByTechnicianId !== target.declaredByTechnicianId || current.declaredAt !== target.declaredAt) return false;
    if (target.method === 'wallet') return state.wallet.status === 'ready' && wholeVnd(state.wallet.data.balance)! >= target.amount;
    return !target.cashDto?.agreed || target.declaredAmount === target.amount
      && (target.cashDto.confirmedAmount === undefined || target.cashDto.confirmedAmount === target.amount);
  }
  async function readWallet(key: OrderSessionKey) {
    const seq = ++walletSeq; publish({ wallet: { status: 'loading', requestSeq: seq } });
    try {
      const data = normalizeCustomerWalletSummary(await deps.transport.readWallet());
      if (same(key) && seq === walletSeq) publish({ wallet: { status: 'ready', requestSeq: seq, fetchedAt: (deps.now ?? Date.now)(), data } });
    } catch { if (same(key) && seq === walletSeq) publish({ wallet: { status: 'error', requestSeq: seq, error: 'unavailable' } }); }
  }
  async function prepare(method: PaymentMethod, cashDto?: CashConfirmationDto) {
    const key = deps.getKey(); if (!key || !same(key) || busy) return;
    busy = true; const generation = ++epoch;
    publish({ phase: 'verifying', method, confirmation: null, message: null });
    try {
      await deps.journal.restore(); if (!same(key) || generation !== epoch) return;
      if (deps.journal.hasUnresolved(key)) { finish(key, markers(key)[0]); return; }
      await refresh(key); if (!owned(key) || generation !== epoch) return;
      if (method === 'wallet') await readWallet(key);
      if (!owned(key) || generation !== epoch) return;
      const target = eligible(key, method);
      if (!target || (cashDto && !target.settlementId)) { publish({ phase: 'denied', result: financialResult(snapshot(), key), message: 'Điều kiện thanh toán chưa sẵn sàng. Vui lòng kiểm tra hóa đơn và tiền mặt.' }); return; }
      const captured = Object.freeze({ ...target, key: Object.freeze({ ...target.key }), ...(cashDto ? { cashDto: Object.freeze({ ...cashDto }) } : {}) });
      if (!matches(captured)) { publish({ phase: 'denied', message: method === 'wallet' ? 'Số dư ví chưa đủ hoặc chưa xác minh được. Vui lòng kiểm tra ví.' : 'Số tiền chưa khớp hóa đơn và khai báo. Vui lòng kiểm tra hoặc báo sai lệch.' }); return; }
      publish({ phase: method === 'cash' && !cashDto ? 'idle' : 'confirming', target: captured,
        confirmation: method === 'cash' && !cashDto ? null : captured, result: financialResult(snapshot(), key) });
    } catch { if (same(key)) publish({ phase: 'denied', message: 'Chưa tải được dữ liệu thanh toán. Vui lòng làm mới.' }); }
    finally { busy = false; }
  }
  function verdict(key: OrderSessionKey, marker: OrderCommandMarker): CommandReadbackVerdict {
    if (!owned(key)) return 'unresolved';
    const invoice = invoiceFact(snapshot(), key), cash = cashFact(snapshot(), key);
    if (marker.operation === 'cash-confirm') {
      if (!cash || cash.id !== marker.entityId || !invoice || invoice.id !== marker.resultEntityId) return 'unresolved';
      if (cash.status === 'disputed') return 'resolved';
      return cash.status === 'confirmed' && invoice?.status === 'paid' ? 'resolved' : 'unresolved';
    }
    if (invoice?.id === marker.entityId && invoice.status === 'paid') return 'resolved';
    // A VNPay link only starts a payment and expires; once it has, an unpaid invoice proves nothing is in flight.
    if (marker.operation === 'vnpay-url' && invoice?.id === marker.entityId && invoice.status === 'unpaid'
      && (deps.now ?? Date.now)() - marker.dispatchedAt > VNPAY_LINK_TTL_MS) return 'failed-known';
    return 'unresolved';
  }
  function finish(key: OrderSessionKey, marker: OrderCommandMarker | undefined) {
    if (!same(key)) return;
    const resolved = marker?.status === 'resolved', failed = marker?.status === 'failed-known';
    const pending = !resolved && !failed && redirect && redirect.intentId === marker?.intentId && !redirect.failed;
    if (resolved) redirect = null;
    publish({ phase: resolved ? 'resolved' : failed ? 'failed-known' : pending ? 'pending' : 'unknown',
      method: marker?.operation === 'wallet-pay' ? 'wallet' : marker?.operation === 'vnpay-url' ? 'vnpay' : marker?.operation === 'cash-confirm' ? 'cash' : null,
      confirmation: null, result: financialResult(snapshot(), key), urlReady: !!pending && !redirect?.opened,
      message: resolved ? null : failed ? 'Thanh toán chưa được thực hiện. Hãy kiểm tra dữ liệu trước khi xác nhận lại.' : FINANCIAL_UNKNOWN });
  }
  async function submitConfirmation() {
    const target = state.confirmation; if (!target || busy || state.phase !== 'confirming' || !matches(target)) return;
    const key = target.key; busy = true; let sent = false, precommit = false;
    publish({ phase: 'submitting', target, message: null });
    const operation = target.method === 'wallet' ? 'wallet-pay' : target.method === 'vnpay' ? 'vnpay-url' : 'cash-confirm';
    const intentId = deps.newIntentId();
    const adapter = createOrderCommandAdapter(deps.journal, { isCurrent: owned, refresh: key => refresh(key) });
    try {
      await deps.journal.restore(); if (!same(key)) return;
      await adapter.dispatch(key, { intentId, operation, entityId: target.settlementId ?? target.invoiceId,
        ...(operation === 'cash-confirm' ? { resultEntityId: target.invoiceId } : {}) }, async () => {
        if (state.confirmation !== target || !matches(target)) return;
        sent = true; publish({ confirmation: null });
        if (target.method === 'wallet') {
          try { await deps.transport.payWallet(target.invoiceId); }
          catch (error) {
            // Pinned payInvoiceWithWallet rejects insufficient balance before writes (HTTP422 VALIDATION_FAILED) and the transaction rolls back.
            // Generic HTTP400/409, arbitrary 422, and other endpoints do not inherit this proof.
            const response = financialRecord(financialRecord(error)?.response), body = financialRecord(response?.data);
            precommit = response?.status === 422 && body?.success === false && financialRecord(body.error)?.code === 'VALIDATION_FAILED';
            throw error;
          }
        } else if (target.method === 'vnpay') {
          const url = paymentHttpsUrl(await deps.transport.createVnpayUrl(target.invoiceId));
          if (url && same(key)) redirect = { key: { ...key }, intentId, invoiceId: target.invoiceId, url, opened: false, failed: false };
        } else if (target.cashDto) await deps.transport.confirmCash(key.serviceOrderId, target.cashDto);
      }, () => !sent ? 'failed-known' : verdict(key, deps.journal.list(key.userId).find(m => m.intentId === intentId)!));
      if (precommit || !sent) {
        const marker = deps.journal.list(key.userId).find(m => m.intentId === intentId);
        if (marker && marker.status !== 'resolved') await deps.journal.mark(key.userId, intentId, 'failed-known');
      }
      finish(key, deps.journal.list(key.userId).find(m => m.intentId === intentId));
    } catch { if (same(key)) publish({ phase: 'unknown', confirmation: null, message: FINANCIAL_UNKNOWN }); }
    finally { busy = false; }
  }
  async function verify() {
    const key = deps.getKey(); if (!key || !same(key) || busy) return;
    busy = true; publish({ phase: 'verifying', confirmation: null });
    try {
      await deps.journal.restore(); if (!same(key)) return;
      const pending = markers(key);
      if (!pending.length) { publish({ phase: deps.journal.hasUnresolved(key) ? 'unknown' : 'idle', message: deps.journal.hasUnresolved(key) ? FINANCIAL_UNKNOWN : null }); return; }
      await refresh(key); if (!owned(key)) { if (same(key)) publish({ phase: 'unknown', message: FINANCIAL_UNKNOWN }); return; }
      const adapter = createOrderCommandAdapter(deps.journal, { isCurrent: owned, refresh: async () => {} });
      for (const marker of pending) await adapter.verify(key, marker.intentId, () => verdict(key, marker));
      if (same(key)) finish(key, deps.journal.list(key.userId).find(m => m.intentId === pending[0].intentId));
    } catch { if (same(key)) publish({ phase: 'unknown', message: FINANCIAL_UNKNOWN }); }
    finally { busy = false; }
  }
  return {
    getState: () => state,
    subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    requestPayment: (method: PaymentMethod) => ['wallet', 'vnpay', 'cash'].includes(method) ? prepare(method) : Promise.resolve(),
    async requestCashConfirmation(input: CashConfirmationDto) {
      let dto: CashConfirmationDto;
      try { dto = validateCashConfirmation(input); }
      catch { publish({ phase: 'denied', confirmation: null, message: 'Hãy kiểm tra số tiền và lý do xác nhận tiền mặt.' }); return; }
      await prepare('cash', dto);
    },
    cancelConfirmation() { epoch++; publish({ confirmation: null, ...(busy ? {} : { phase: 'idle' as const }) }); },
    revalidateConfirmation() { if (state.confirmation && !matches(state.confirmation)) { epoch++; publish({ confirmation: null, ...(busy ? {} : { phase: 'idle' as const }) }); } },
    invalidatePresentation() {
      epoch++; walletSeq++; redirect = null;
      publish({ phase: 'idle', target: null, confirmation: null, wallet: { status: 'unloaded', requestSeq: walletSeq }, urlReady: false, result: 'unverified', method: null, message: null });
    },
    submitConfirmation, verify,
    async restoredMarkers(): Promise<OrderCommandMarker[]> {
      const key = deps.getKey(); if (!key || !same(key)) return [];
      await deps.journal.restore(); return same(key) ? markers(key) : [];
    },
    async openPaymentUrl() {
      const link = redirect;
      if (!link || link.opened || busy || !owned(link.key) || invoiceFact(snapshot(), link.key)?.id !== link.invoiceId || invoiceFact(snapshot(), link.key)?.status !== 'unpaid') return;
      link.opened = true; publish({ urlReady: false });
      try { await deps.transport.openUrl(link.url); }
      catch { link.failed = true; if (same(link.key)) publish({ phase: 'unknown', message: FINANCIAL_UNKNOWN }); }
      finally { if (same(link.key)) await verify(); }
    },
  };
}
export type OrderPaymentController = ReturnType<typeof createOrderPaymentController>;
