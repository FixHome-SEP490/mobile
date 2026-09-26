import type { InvoiceView } from './order-invoice';

export interface CustomerPaymentOrderGate {
  id: string;
  status: unknown;
  paymentStatus: unknown;
  customerConfirmed?: unknown;
  historical?: unknown;
}

export interface CashSettlementView {
  id: string;
  declaredAmount: number;
  confirmedAmount: number | null;
  status: 'PENDING_CONFIRMATION' | 'CONFIRMED' | 'DISPUTED';
  technicianNotes: string | null;
}

export interface CustomerPaymentState {
  loading: boolean;
  cashBusy: boolean;
  cashNeedsVerify: boolean;
  onlineBusy: boolean;
  onlinePending: boolean;
  error: string | null;
  settlement: CashSettlementView | null;
}

export const initialCustomerPaymentState: CustomerPaymentState = {
  loading: false,
  cashBusy: false,
  cashNeedsVerify: false,
  onlineBusy: false,
  onlinePending: false,
  error: null,
  settlement: null,
};

export interface CustomerPaymentDeps {
  getOrder: () => CustomerPaymentOrderGate | null;
  getInvoice: () => InvoiceView | null;
  getCustomerId: () => string | null;
  isFocused: () => boolean;
  getCashSettlement: (orderId: string) => Promise<unknown>;
  confirmCashSettlement: (
    orderId: string,
    body: { agreed: boolean; confirmedAmount?: number; disputeReason?: string },
  ) => Promise<unknown>;
  createVnpayUrl: (invoiceId: string) => Promise<string>;
  openExternalUrl: (url: string) => Promise<void>;
  refreshAll: () => Promise<void>;
  onAccessDenied: () => void;
  notify: (title: string, message: string) => void;
}

function statusOf(error: unknown): number | undefined {
  return (error as { response?: { status?: number } } | null)?.response?.status;
}

function currentTarget(
  order: CustomerPaymentOrderGate | null,
  invoice: InvoiceView | null,
): { orderId: string; invoiceId: string } | null {
  if (!order || !invoice || order.historical === true) return null;
  if (String(order.status).toUpperCase() !== 'UNDER_REPAIR') return null;
  if (order.customerConfirmed !== true) return null;
  if (String(order.paymentStatus).toUpperCase() !== 'UNPAID') return null;
  if (invoice.paymentStatus !== 'UNPAID') return null;
  if (!order.id || !invoice.id) return null;
  return { orderId: order.id, invoiceId: invoice.id };
}

export function customerPaymentTarget(
  order: CustomerPaymentOrderGate | null,
  invoice: InvoiceView | null,
) {
  return currentTarget(order, invoice);
}

export function sanitizeCashSettlement(payload: unknown): CashSettlementView | null {
  if (!payload || typeof payload !== 'object') return null;
  const value = payload as Record<string, unknown>;
  const id = typeof value.id === 'string' ? value.id.trim() : '';
  const declaredAmount =
    typeof value.declaredAmount === 'number' &&
    Number.isSafeInteger(value.declaredAmount) &&
    value.declaredAmount >= 0
      ? value.declaredAmount
      : null;
  const normalized = String(value.status ?? '').toUpperCase();
  if (
    !id ||
    declaredAmount === null ||
    !['PENDING_CONFIRMATION', 'CONFIRMED', 'DISPUTED'].includes(normalized)
  ) {
    return null;
  }
  const confirmedAmount =
    typeof value.confirmedAmount === 'number' &&
    Number.isSafeInteger(value.confirmedAmount) &&
    value.confirmedAmount >= 0
      ? value.confirmedAmount
      : null;
  return {
    id,
    declaredAmount,
    confirmedAmount,
    status: normalized as CashSettlementView['status'],
    technicianNotes:
      typeof value.technicianNotes === 'string'
        ? value.technicianNotes.slice(0, 500)
        : null,
  };
}

export function createCustomerPaymentController(
  deps: CustomerPaymentDeps,
  write: (state: CustomerPaymentState) => void,
) {
  let state = { ...initialCustomerPaymentState };
  let cashSubmitting = false;
  let onlineSubmitting = false;

  const publish = (patch: Partial<CustomerPaymentState>) => {
    state = { ...state, ...patch };
    write(state);
  };

  const context = () => {
    const customerId = deps.getCustomerId();
    const target = currentTarget(deps.getOrder(), deps.getInvoice());
    return customerId && target && deps.isFocused()
      ? { customerId, ...target }
      : null;
  };

  const same = (customerId: string, orderId: string) =>
    deps.isFocused() &&
    deps.getCustomerId() === customerId &&
    deps.getOrder()?.id === orderId;

  async function loadCash(): Promise<void> {
    const ctx = context();
    if (!ctx) {
      state = { ...initialCustomerPaymentState };
      write(state);
      return;
    }
    publish({ loading: true, error: null });
    try {
      const settlement = sanitizeCashSettlement(
        await deps.getCashSettlement(ctx.orderId),
      );
      if (!same(ctx.customerId, ctx.orderId)) return;
      publish({ loading: false, settlement, error: null });
    } catch (error) {
      if (!same(ctx.customerId, ctx.orderId)) return;
      const status = statusOf(error);
      if (status === 401 || status === 403) {
        state = { ...initialCustomerPaymentState };
        write(state);
        deps.onAccessDenied();
        return;
      }
      if (status === 404) {
        publish({ loading: false, settlement: null, error: null });
        return;
      }
      publish({
        loading: false,
        error: 'KhÃ´ng thá»ƒ táº£i tráº¡ng thÃ¡i thanh toÃ¡n tiá»n máº·t.',
      });
    }
  }

  async function reconcileCash(
    customerId: string,
    orderId: string,
  ): Promise<boolean> {
    try {
      await deps.refreshAll();
      if (!same(customerId, orderId)) return false;
      const order = deps.getOrder();
      const invoice = deps.getInvoice();
      if (
        String(order?.paymentStatus).toUpperCase() === 'PAID' ||
        invoice?.paymentStatus === 'PAID' ||
        String(order?.status).toUpperCase() === 'COMPLETED'
      ) {
        publish({
          cashBusy: false,
          cashNeedsVerify: false,
          onlinePending: false,
          error: null,
        });
        return true;
      }
      const settlement = sanitizeCashSettlement(
        await deps.getCashSettlement(orderId),
      );
      if (!same(customerId, orderId)) return false;
      if (
        settlement?.status === 'CONFIRMED' ||
        settlement?.status === 'DISPUTED'
      ) {
        publish({
          settlement,
          cashBusy: false,
          cashNeedsVerify: false,
          error: null,
        });
        return true;
      }
      publish({
        settlement,
        cashBusy: false,
        cashNeedsVerify: true,
        error:
          'ChÆ°a xÃ¡c minh Ä‘Æ°á»£c káº¿t quáº£ xÃ¡c nháº­n tiá»n máº·t. KhÃ´ng gá»­i POST láº¡i.',
      });
      return false;
    } catch {
      if (!same(customerId, orderId)) return false;
      publish({
        cashBusy: false,
        cashNeedsVerify: true,
        error:
          'ChÆ°a thá»ƒ Ä‘á»‘i chiáº¿u thanh toÃ¡n tiá»n máº·t báº±ng GET. KhÃ´ng gá»­i POST láº¡i.',
      });
      return false;
    }
  }

  async function confirmCash(
    agreed: boolean,
    confirmedAmount: number,
    disputeReason?: string,
  ): Promise<void> {
    if (cashSubmitting || state.cashBusy || state.cashNeedsVerify) return;
    const ctx = context();
    if (!ctx || !state.settlement) return;
    if (
      !Number.isSafeInteger(confirmedAmount) ||
      confirmedAmount < 0 ||
      state.settlement.status !== 'PENDING_CONFIRMATION'
    ) {
      return;
    }

    cashSubmitting = true;
    publish({ cashBusy: true, error: null });
    try {
      try {
        await deps.confirmCashSettlement(ctx.orderId, {
          agreed,
          confirmedAmount,
          ...(agreed
            ? {}
            : {
                disputeReason:
                  disputeReason?.trim() ||
                  'Sá»‘ tiá»n khÃ¡ch xÃ¡c nháº­n khÃ´ng khá»›p vá»›i khai bÃ¡o cá»§a ká»¹ thuáº­t viÃªn',
              }),
        });
      } catch (error) {
        if (!same(ctx.customerId, ctx.orderId)) return;
        const status = statusOf(error);
        if (status === 401 || status === 403) {
          state = { ...initialCustomerPaymentState };
          write(state);
          deps.onAccessDenied();
          return;
        }
        // Any mutation error may hide a committed settlement; reconcile by GET.
      }
      if (!same(ctx.customerId, ctx.orderId)) return;
      await reconcileCash(ctx.customerId, ctx.orderId);
    } finally {
      cashSubmitting = false;
      if (state.cashBusy && deps.getCustomerId() === ctx.customerId) {
        publish({ cashBusy: false });
      }
    }
  }

  async function reconcileOnline(): Promise<void> {
    const customerId = deps.getCustomerId();
    const before = deps.getOrder();
    if (!customerId || !before || !deps.isFocused()) return;
    const orderId = before.id;
    publish({ onlineBusy: true, error: null });
    try {
      await deps.refreshAll();
      if (!same(customerId, orderId)) return;
      const order = deps.getOrder();
      const invoice = deps.getInvoice();
      const paid =
        String(order?.paymentStatus).toUpperCase() === 'PAID' ||
        invoice?.paymentStatus === 'PAID' ||
        String(order?.status).toUpperCase() === 'COMPLETED';
      publish({
        onlineBusy: false,
        onlinePending: !paid,
        error: paid
          ? null
          : 'Backend chưa xác nhận PAID. Không coi việc quay lại từ VNPay là thanh toán thành công.',
      });
    } catch {
      if (!same(customerId, orderId)) return;
      publish({
        onlineBusy: false,
        onlinePending: true,
        error:
          'Chưa kiểm tra được trạng thái thanh toán mới nhất từ Backend.',
      });
    }
  }

  async function startVnpay(): Promise<void> {
    if (onlineSubmitting || state.onlineBusy || state.onlinePending) return;
    const ctx = context();
    if (!ctx) return;

    onlineSubmitting = true;
    publish({ onlineBusy: true, error: null });
    try {
      let url: string;
      try {
        url = await deps.createVnpayUrl(ctx.invoiceId);
      } catch (error) {
        if (!same(ctx.customerId, ctx.orderId)) return;
        const status = statusOf(error);
        if (status === 401 || status === 403) {
          state = { ...initialCustomerPaymentState };
          write(state);
          deps.onAccessDenied();
          return;
        }
        publish({
          onlineBusy: false,
          onlinePending: true,
          error:
            'Káº¿t quáº£ táº¡o liÃªn káº¿t VNPay chÆ°a xÃ¡c Ä‘á»‹nh. KhÃ´ng gá»­i POST táº¡o liÃªn káº¿t láº§n ná»¯a trong phiÃªn nÃ y.',
        });
        return;
      }

      if (!same(ctx.customerId, ctx.orderId)) return;
      if (!url.toLowerCase().startsWith('https://')) {
        publish({
          onlineBusy: false,
          onlinePending: true,
          error: 'Backend tráº£ vá» liÃªn káº¿t thanh toÃ¡n khÃ´ng há»£p lá»‡.',
        });
        return;
      }

      publish({ onlineBusy: false, onlinePending: true, error: null });
      try {
        await deps.openExternalUrl(url);
      } catch {
        if (!same(ctx.customerId, ctx.orderId)) return;
        publish({
          onlinePending: true,
          error:
            'KhÃ´ng má»Ÿ Ä‘Æ°á»£c VNPay. KhÃ´ng táº¡o liÃªn káº¿t má»›i tá»± Ä‘á»™ng; hÃ£y kiá»ƒm tra tráº¡ng thÃ¡i trÆ°á»›c.',
        });
      }
    } finally {
      onlineSubmitting = false;
      if (state.onlineBusy && deps.getCustomerId() === ctx.customerId) {
        publish({ onlineBusy: false });
      }
    }
  }

  function reset() {
    state = { ...initialCustomerPaymentState };
    write(state);
  }

  return {
    loadCash,
    confirmCash,
    reconcileCash: async () => {
      const ctx = context();
      if (ctx) await reconcileCash(ctx.customerId, ctx.orderId);
    },
    startVnpay,
    reconcileOnline,
    reset,
  };
}
