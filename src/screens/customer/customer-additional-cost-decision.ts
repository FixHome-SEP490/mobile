import { orderDetailTarget } from './customer-order-detail';

/**
 * P3B13 bounded CUSTOMER additional-cost APPROVE/REJECT, one LABOR proposal
 * only. Runs for the signed-in customer on the same focused real ServiceOrder
 * in UNDER_REPAIR with no completion requested, on a PENDING_APPROVAL cost
 * whose every line is a validated genuine LABOR item. APPROVE adds the
 * approved delta to server totals but does NOT pay/settle; REJECT affects
 * ONLY that cost request — the order keeps its repair status (unlike quote
 * REJECT, which closes the whole order). Paid-warranty ids are always empty:
 * anything non-labor fails closed instead of being approved blindly.
 */

/** Exact whole-request-only reject copy; screen renders this verbatim. */
export const REJECT_COST_ONLY_WARNING =
  'Từ chối chỉ áp dụng cho yêu cầu chi phí này, đơn dịch vụ vẫn tiếp tục sửa chữa.';

/** Approval confirmation must carry this: approval itself is not payment. */
export const APPROVE_COST_NOT_PAYMENT_NOTE = 'Duyệt chi phí chưa phải thanh toán.';

export interface CostDecisionItem {
  itemType: unknown;
}

export interface CostDecisionContext {
  orderId: string;
  orderStatus: unknown;
  completionRequestedAt: unknown;
  costId: unknown;
  costStatus: unknown;
  costExpiresAt: unknown;
  costItems: unknown;
}

export type CostDecisionKind = 'approve' | 'reject';

export interface CostDecisionState {
  confirming: { costId: string; kind: CostDecisionKind } | null;
  busy: boolean;
  error: string | null;
  /** Ambiguous POST lock: reload costs/detail before any retry. */
  needsVerify: boolean;
  decided: { costId: string; action: 'APPROVED' | 'REJECTED' } | null;
}

export const initialCostDecisionState: CostDecisionState = {
  confirming: null,
  busy: false,
  error: null,
  needsVerify: false,
  decided: null,
};

export interface CostDecisionDeps {
  getContext: (costId: string) => CostDecisionContext | null;
  getCustomerId: () => string | null;
  isFocused: () => boolean;
  approveCost: (costId: string) => Promise<unknown>;
  rejectCost: (costId: string) => Promise<unknown>;
  /** GET-only reconciliation: reload costs list (and detail). */
  refreshCosts: () => Promise<void>;
  onAccessDenied: () => void;
  notify: (title: string, message: string) => void;
}

function statusOf(error: unknown): number | undefined {
  return (error as { response?: { status?: number } } | null)?.response?.status;
}

/**
 * LABOR-only fail-closed check: a non-empty line set where every item type
 * is exactly 'labor' (case-insensitive). PARTS, missing, or unknown types —
 * whose paid-warranty eligibility cannot be confirmed from sanitized data —
 * block the decision instead of being approved with empty warranty ids.
 */
export function isLaborOnlyItems(items: unknown): boolean {
  if (!Array.isArray(items) || items.length === 0) return false;
  return items.every((entry) => {
    if (typeof entry !== 'object' || entry === null) return false;
    const type = (entry as Record<string, unknown>).itemType;
    return typeof type === 'string' && type.toLowerCase() === 'labor';
  });
}

/**
 * Expiry decision block: true means the client must NOT decide. Missing,
 * invalid, or past server expiry all fail closed — the Backend always
 * supplies a TTL for a decidable pending request, so an unverifiable
 * deadline can never justify a financial decision. The Backend remains the
 * final authority on expiry.
 */
export function isCostDecisionBlocked(expiresAt: unknown): boolean {
  if (typeof expiresAt !== 'string' || expiresAt.length === 0) return true;
  const time = Date.parse(expiresAt);
  if (!Number.isFinite(time)) return true;
  return time < Date.now();
}

/** Decision gate: same customer, focus, real UNDER_REPAIR open order, pending labor-only cost. */
export function costDecisionTarget(
  ctx: CostDecisionContext | null,
): { orderId: string; costId: string } | null {
  if (!ctx) return null;
  const orderId = orderDetailTarget(ctx.orderId);
  if (!orderId) return null;
  if (String(ctx.orderStatus).toUpperCase() !== 'UNDER_REPAIR') return null;
  if (!!ctx.completionRequestedAt) return null;
  if (typeof ctx.costId !== 'string' || !orderDetailTarget(ctx.costId)) return null;
  if (String(ctx.costStatus ?? '').toUpperCase() !== 'PENDING_APPROVAL') return null;
  if (isCostDecisionBlocked(ctx.costExpiresAt)) return null;
  if (!isLaborOnlyItems(ctx.costItems)) return null;
  return { orderId, costId: ctx.costId };
}

export function createCostDecisionController(
  deps: CostDecisionDeps,
  write: (state: CostDecisionState) => void,
) {
  let state: CostDecisionState = { ...initialCostDecisionState };
  let busy = false;

  const publish = (patch: Partial<CostDecisionState>) => {
    state = { ...state, ...patch };
    write(state);
  };

  function reset() {
    busy = false;
    state = { ...initialCostDecisionState };
    write(state);
  }

  function requestConfirm(costId: string, kind: CostDecisionKind): void {
    if (busy || state.needsVerify) return;
    if (!deps.getCustomerId() || !deps.isFocused()) return;
    const target = costDecisionTarget(deps.getContext(costId));
    if (!target) {
      deps.notify('Yêu cầu đã thay đổi', 'Yêu cầu chi phí không còn ở trạng thái chờ duyệt nhân công. Vui lòng tải lại chi tiết đơn.');
      return;
    }
    publish({ confirming: { costId: target.costId, kind }, error: null });
  }

  function cancelConfirm(): void {
    if (busy) return;
    publish({ confirming: null });
  }

  async function submit(): Promise<void> {
    const confirming = state.confirming;
    if (busy || !confirming || state.needsVerify) return;
    const customerId = deps.getCustomerId();
    if (!customerId || !deps.isFocused()) {
      reset();
      return;
    }
    const target = costDecisionTarget(deps.getContext(confirming.costId));
    if (!target || target.costId !== confirming.costId) {
      reset();
      deps.notify('Yêu cầu đã thay đổi', 'Yêu cầu chi phí không còn ở trạng thái chờ duyệt nhân công. Vui lòng tải lại chi tiết đơn.');
      return;
    }
    busy = true;
    publish({ busy: true, error: null });
    const sameSession = () =>
      deps.getCustomerId() === customerId &&
      deps.isFocused() &&
      costDecisionTarget(deps.getContext(confirming.costId))?.costId === target.costId;
    try {
      if (confirming.kind === 'approve') {
        await deps.approveCost(target.costId);
      } else {
        await deps.rejectCost(target.costId);
      }
      if (!sameSession()) {
        reset();
        return;
      }
      state = {
        ...initialCostDecisionState,
        decided: { costId: target.costId, action: confirming.kind === 'approve' ? 'APPROVED' : 'REJECTED' },
      };
      write(state);
      if (confirming.kind === 'approve') {
        deps.notify('Đã duyệt chi phí phát sinh', 'Chi phí đã được duyệt và cộng vào tổng đơn. Đây chưa phải thanh toán.');
      } else {
        deps.notify('Đã từ chối chi phí phát sinh', 'Yêu cầu chi phí đã bị từ chối. Đơn dịch vụ vẫn tiếp tục sửa chữa.');
      }
      await deps.refreshCosts();
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
          error: `Máy chủ từ chối quyết định (mã ${status}). Vui lòng tải lại chi phí phát sinh và kiểm tra trạng thái yêu cầu.`,
        });
        await deps.refreshCosts();
        return;
      }
      // Ambiguous POST (timeout/offline/5xx/lost response): the decision may
      // exist server-side — never auto-repost. Lock until fresh GET reloads.
      publish({
        busy: false,
        confirming: null,
        needsVerify: true,
        error: 'Chưa xác nhận quyết định đã được ghi nhận hay chưa. Hãy tải lại chi phí phát sinh để kiểm tra trước khi thử lại.',
      });
      await deps.refreshCosts();
    } finally {
      busy = false;
      if (state.busy) publish({ busy: false });
    }
  }

  return {
    requestConfirm,
    cancelConfirm,
    submit,
    reset,
    /** Called by the screen after its own costs/detail reload clears the lock. */
    markReverified: () => {
      if (!state.needsVerify) return;
      publish({ needsVerify: false, error: null });
    },
  };
}
