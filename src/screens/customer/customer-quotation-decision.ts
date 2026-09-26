import { orderDetailTarget } from './customer-order-detail';

/**
 * P3B7 bounded CUSTOMER quotation APPROVE/REJECT with paid-warranty opt-in.
 * Runs only for the signed-in customer on the same focused real ServiceOrder
 * in EN_ROUTE with the latest quotation SENT. Approval is NOT payment, and
 * REJECT closes the whole order — the exact warning below must precede any
 * REJECT POST. Paid-warranty selection accepts ONLY genuinely eligible
 * TECHNICIAN PAID_WARRANTY lines (valid UUID id, Backend fee/term); FixHome
 * INCLUDED warranty is never selectable and nothing is ever invented.
 */

/** Exact owner-approved whole-order-close warning; screen renders this verbatim. */
export const REJECT_WHOLE_ORDER_WARNING =
  'Từ chối báo giá sẽ hủy toàn bộ đơn dịch vụ, không chỉ báo giá';

/** Approval confirmation must carry this: approval itself is not payment. */
export const APPROVE_NOT_PAYMENT_NOTE = 'Duyệt báo giá chưa phải thanh toán.';

export interface RawQuoteItem {
  id?: unknown;
  description?: unknown;
  quantity?: unknown;
  lineTotal?: unknown;
  partSource?: unknown;
  partWarrantyOption?: unknown;
  warrantyFee?: unknown;
  warrantyTermDays?: unknown;
  warrantyDays?: unknown;
}

export interface WarrantyOption {
  itemId: string;
  description: string;
  fee: number;
  feeText: string;
  termDays: number;
}

export interface DecisionContext {
  orderId: string;
  orderStatus: unknown;
  quoteId: unknown;
  quoteStatus: unknown;
  items: unknown;
}

export type DecisionKind = 'approve' | 'reject';

export interface DecisionState {
  /** Exact valid UUIDs from eligible lines only; default OFF (empty). */
  selectedIds: string[];
  confirming: DecisionKind | null;
  busy: boolean;
  error: string | null;
  /** Ambiguous POST lock: reload the detail before any retry. */
  needsVerify: boolean;
  decided: 'APPROVED' | 'REJECTED' | null;
}

export const initialDecisionState: DecisionState = {
  selectedIds: [],
  confirming: null,
  busy: false,
  error: null,
  needsVerify: false,
  decided: null,
};

export interface QuotationDecisionDeps {
  getContext: () => DecisionContext | null;
  getCustomerId: () => string | null;
  isFocused: () => boolean;
  approveQuotation: (quoteId: string, paidWarrantyItemIds: string[]) => Promise<unknown>;
  rejectQuotation: (quoteId: string) => Promise<unknown>;
  /** GET-only reconciliation: reload the authorized detail (incl. quote). */
  refreshDetail: () => Promise<void>;
  onAccessDenied: () => void;
  notify: (title: string, message: string) => void;
}

function statusOf(error: unknown): number | undefined {
  return (error as { response?: { status?: number } } | null)?.response?.status;
}

export function decisionMoneyText(value: number): string {
  return `${value.toLocaleString('vi-VN')}đ`;
}

/**
 * Genuinely eligible paid-warranty lines only: item id is a real UUID,
 * partSource is technician, partWarrantyOption is paid_warranty (lowercase),
 * fee is a finite nonnegative Backend number, term a positive integer.
 * Anything else — including FixHome INCLUDED catalog warranty — is excluded.
 */
export function eligibleWarrantyOptions(items: unknown): WarrantyOption[] {
  if (!Array.isArray(items)) return [];
  const options: WarrantyOption[] = [];
  for (const entry of items) {
    if (typeof entry !== 'object' || entry === null) continue;
    const record = entry as Record<string, unknown>;
    const id = typeof record.id === 'string' ? record.id.trim() : '';
    if (!id || !orderDetailTarget(id)) continue;
    const partSource = typeof record.partSource === 'string' ? record.partSource.toLowerCase() : '';
    const warrantyOption = typeof record.partWarrantyOption === 'string'
      ? record.partWarrantyOption.toLowerCase()
      : '';
    if (partSource !== 'technician' || warrantyOption !== 'paid_warranty') continue;
    const fee = record.warrantyFee;
    if (typeof fee !== 'number' || !Number.isFinite(fee) || fee < 0) continue;
    const termRaw = record.warrantyTermDays ?? record.warrantyDays;
    if (typeof termRaw !== 'number' || !Number.isInteger(termRaw) || termRaw <= 0) continue;
    const description = typeof record.description === 'string' ? record.description.trim() : '';
    if (!description) continue;
    options.push({
      itemId: id,
      description,
      fee,
      feeText: decisionMoneyText(fee),
      termDays: termRaw,
    });
  }
  return options;
}

/** Decision gate: same customer, focus, real order, EN_ROUTE, latest quote SENT by UUID. */
export function decisionTarget(
  ctx: DecisionContext | null,
): { orderId: string; quoteId: string } | null {
  if (!ctx) return null;
  const orderId = orderDetailTarget(ctx.orderId);
  if (!orderId) return null;
  if (String(ctx.orderStatus).toUpperCase() !== 'EN_ROUTE') return null;
  if (typeof ctx.quoteId !== 'string' || !orderDetailTarget(ctx.quoteId)) return null;
  if (String(ctx.quoteStatus ?? '').toUpperCase() !== 'SENT') return null;
  return { orderId, quoteId: ctx.quoteId };
}

export function createQuotationDecisionController(
  deps: QuotationDecisionDeps,
  write: (state: DecisionState) => void,
) {
  let state: DecisionState = { ...initialDecisionState, selectedIds: [] };
  let busy = false;

  const publish = (patch: Partial<DecisionState>) => {
    state = { ...state, ...patch };
    write(state);
  };

  function reset() {
    busy = false;
    state = { ...initialDecisionState, selectedIds: [] };
    write(state);
  }

  function eligibleNow(): WarrantyOption[] {
    return eligibleWarrantyOptions(deps.getContext()?.items);
  }

  function toggleWarranty(itemId: string): void {
    if (busy || state.needsVerify) return;
    if (!deps.getCustomerId() || !deps.isFocused()) return;
    if (!eligibleNow().some((option) => option.itemId === itemId)) return;
    const selected = state.selectedIds.includes(itemId)
      ? state.selectedIds.filter((id) => id !== itemId)
      : [...state.selectedIds, itemId];
    publish({ selectedIds: selected, decided: null });
  }

  function requestConfirm(kind: DecisionKind): void {
    if (busy || state.needsVerify) return;
    if (!deps.getCustomerId() || !deps.isFocused()) return;
    if (!decisionTarget(deps.getContext())) {
      deps.notify('Báo giá đã thay đổi', 'Báo giá không còn ở trạng thái chờ duyệt. Vui lòng tải lại chi tiết đơn.');
      return;
    }
    publish({ confirming: kind, error: null });
  }

  function cancelConfirm(): void {
    if (busy) return;
    publish({ confirming: null });
  }

  async function submit(): Promise<void> {
    const kind = state.confirming;
    if (busy || !kind || state.needsVerify) return;
    const customerId = deps.getCustomerId();
    if (!customerId || !deps.isFocused()) {
      reset();
      return;
    }
    const target = decisionTarget(deps.getContext());
    if (!target || deps.getContext()?.orderId !== target.orderId) {
      reset();
      deps.notify('Báo giá đã thay đổi', 'Báo giá không còn ở trạng thái chờ duyệt. Vui lòng tải lại chi tiết đơn.');
      return;
    }
    // Re-derive eligible lines at submit time: only exact valid UUIDs from
    // the current SENT quote are ever sent; stale ids are dropped, never posted.
    const eligibleIds = new Set(eligibleNow().map((option) => option.itemId));
    const selectedIds = state.selectedIds.filter((id) => eligibleIds.has(id));
    busy = true;
    publish({ busy: true, error: null, selectedIds });
    const sameSession = () =>
      deps.getCustomerId() === customerId &&
      deps.isFocused() &&
      deps.getContext()?.orderId === target.orderId &&
      decisionTarget(deps.getContext())?.quoteId === target.quoteId;
    try {
      if (kind === 'approve') {
        await deps.approveQuotation(target.quoteId, selectedIds);
      } else {
        await deps.rejectQuotation(target.quoteId);
      }
      if (!sameSession()) {
        reset();
        return;
      }
      state = { ...initialDecisionState, selectedIds: [], decided: kind === 'approve' ? 'APPROVED' : 'REJECTED' };
      write(state);
      if (kind === 'approve') {
        deps.notify('Đã duyệt báo giá', 'Đã ghi nhận duyệt báo giá. Đây chưa phải thanh toán.');
      } else {
        deps.notify('Đã từ chối báo giá', 'Đơn dịch vụ đã bị hủy theo quyết định từ chối báo giá.');
      }
      await deps.refreshDetail();
    } catch (error) {
      if (!sameSession()) {
        reset();
        return;
      }
      const status = statusOf(error);
      if (status === 401 || status === 403) {
        reset();
        deps.onAccessDenied();
        deps.notify('Phiên đăng nhập đã hết', 'Vui lòng đăng nhập lại để tiếp tục.');
        return;
      }
      if (status === 409 || status === 422) {
        publish({
          busy: false,
          confirming: null,
          error: `Máy chủ từ chối quyết định (mã ${status}). Vui lòng tải lại chi tiết đơn và kiểm tra trạng thái báo giá.`,
        });
        await deps.refreshDetail();
        return;
      }
      // Ambiguous POST (timeout/offline/5xx/lost response): the decision may
      // exist server-side — never auto-repost. Lock until the detail reloads.
      publish({
        busy: false,
        confirming: null,
        needsVerify: true,
        error: 'Chưa xác nhận quyết định đã được ghi nhận hay chưa. Hãy tải lại chi tiết đơn để kiểm tra trước khi thử lại.',
      });
      await deps.refreshDetail();
    } finally {
      busy = false;
      if (state.busy) publish({ busy: false });
    }
  }

  return {
    toggleWarranty,
    requestConfirm,
    cancelConfirm,
    submit,
    reset,
    /** Called by the screen after its own detail reload clears the lock. */
    markReverified: () => {
      if (!state.needsVerify) return;
      publish({ needsVerify: false, error: null });
    },
  };
}
