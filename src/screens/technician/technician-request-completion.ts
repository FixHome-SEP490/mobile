import { orderDetailTarget } from '../customer/customer-order-detail';

/**
 * Bounded technician REQUEST COMPLETION (dev/test orders only in this slice).
 * Runs only on an assigned ACTIVE UNDER_REPAIR detail with AFTER photos on
 * record, no completion requested yet, no pending additional costs, and either
 * FIXED_PRICE or INSPECTION_REQUIRED with an APPROVED quotation (SENT always
 * blocks). These UI checks are preliminary — the Backend transaction is the
 * final validator. One explicit two-tap confirmation, one-shot POST, no
 * auto-repost on ambiguity. This requests completion ONLY: it never marks the
 * order COMPLETED, never pays/settles, and the durable invoice stays UNPAID
 * until customer acceptance and payment (separate flows).
 */

/** Explicit two-tap confirmation copy; screen renders this verbatim. */
export const REQUEST_COMPLETION_CONFIRM_COPY =
  'Yêu cầu hoàn thành sẽ tạo hóa đơn UNPAID và chốt tạm tính theo cấu hình hệ thống. Đơn KHÔNG chuyển sang Hoàn thành và KHÔNG trừ tiền — chờ khách nghiệm thu và thanh toán. Sau khi yêu cầu, không thể đề xuất chi phí phát sinh thêm.';

export interface RequestCompletionOrderGate {
  id: string;
  status: unknown;
  completionRequestedAt: unknown;
  historical?: unknown;
  afterEvidenceCount?: unknown;
  pricingMode?: unknown;
  quotationStatus?: unknown;
  hasPendingCosts: boolean;
}

export interface RequestCompletionState {
  confirming: boolean;
  busy: boolean;
  error: string | null;
  /** Ambiguous POST lock: reload the detail before any retry. */
  needsVerify: boolean;
  /** Server-confirmed request this focus; cleared on blur/order change. */
  requested: boolean;
}

export const initialRequestCompletionState: RequestCompletionState = {
  confirming: false,
  busy: false,
  error: null,
  needsVerify: false,
  requested: false,
};

export interface RequestCompletionDeps {
  getOrder: () => RequestCompletionOrderGate | null;
  getTechnicianId: () => string | null;
  isFocused: () => boolean;
  /**
   * Dev-release gate: the screen passes `() => __DEV__`. Confirmation and
   * submit fail closed when this is omitted or false — even for a stale
   * confirmation opened while it was true. Production builds can never POST.
   */
  isDevBuild?: () => boolean;
  requestCompletion: (orderId: string) => Promise<unknown>;
  /** GET-only reconciliation: reload order, evidence, and invoice. */
  refreshDetail: () => Promise<void>;
  onAccessDenied: () => void;
  notify: (title: string, message: string) => void;
}

function statusOf(error: unknown): number | undefined {
  return (error as { response?: { status?: number } } | null)?.response?.status;
}

function pricingOk(order: RequestCompletionOrderGate): boolean {
  const mode = String(order.pricingMode ?? '').toLowerCase();
  if (mode === 'fixed_price') return true;
  if (mode === 'inspection_required') {
    return String(order.quotationStatus ?? '').toUpperCase() === 'APPROVED';
  }
  return false;
}

/** Preliminary UI gate; only the authenticated Backend POST confirms success. */
export function requestCompletionTarget(
  order: RequestCompletionOrderGate | null,
): { orderId: string } | null {
  if (!order || order.historical === true) return null;
  const orderId = orderDetailTarget(order.id);
  if (!orderId) return null;
  if (String(order.status).toUpperCase() !== 'UNDER_REPAIR') return null;
  if (!!order.completionRequestedAt) return null;
  if (
    typeof order.afterEvidenceCount !== 'number' ||
    !Number.isFinite(order.afterEvidenceCount) ||
    order.afterEvidenceCount < 1
  ) {
    return null;
  }
  if (order.hasPendingCosts) return null;
  const quoteStatus = order.quotationStatus == null ? '' : String(order.quotationStatus).toUpperCase();
  if (quoteStatus === 'SENT') return null;
  if (!pricingOk(order)) return null;
  return { orderId };
}

/** Honest per-condition blocker copy for the eligibility indicator. */
export function describeCompletionBlockers(order: RequestCompletionOrderGate | null): string[] {
  if (!order || order.historical === true || !orderDetailTarget(order.id)) return [];
  const blockers: string[] = [];
  if (String(order.status).toUpperCase() !== 'UNDER_REPAIR') {
    blockers.push('Đơn chưa ở trạng thái đang sửa chữa.');
  }
  if (!!order.completionRequestedAt) {
    blockers.push('Đơn đã được yêu cầu hoàn thành.');
  }
  if (
    typeof order.afterEvidenceCount !== 'number' ||
    !Number.isFinite(order.afterEvidenceCount) ||
    order.afterEvidenceCount < 1
  ) {
    blockers.push('Cần ảnh sau sửa chữa, số lượng yêu cầu do hệ thống kiểm tra.');
  }
  if (order.hasPendingCosts) {
    blockers.push('Còn yêu cầu chi phí chờ duyệt.');
  }
  const quoteStatus = order.quotationStatus == null ? '' : String(order.quotationStatus).toUpperCase();
  if (quoteStatus === 'SENT') {
    blockers.push('Còn báo giá chờ khách duyệt.');
  } else if (!pricingOk({ ...order, quotationStatus: quoteStatus || order.quotationStatus })) {
    const mode = String(order.pricingMode ?? '').toLowerCase();
    if (mode === 'inspection_required') {
      blockers.push('Cần báo giá được khách duyệt.');
    } else {
      blockers.push('Loại báo giá chưa đủ điều kiện.');
    }
  }
  return blockers;
}

export function createRequestCompletionController(
  deps: RequestCompletionDeps,
  write: (state: RequestCompletionState) => void,
) {
  let state: RequestCompletionState = { ...initialRequestCompletionState };
  let busy = false;

  const publish = (patch: Partial<RequestCompletionState>) => {
    state = { ...state, ...patch };
    write(state);
  };

  function reset() {
    busy = false;
    state = { ...initialRequestCompletionState };
    write(state);
  }

  function requestConfirm(): void {
    if (busy || state.needsVerify) return;
    if (deps.isDevBuild?.() !== true) return;
    if (!deps.getTechnicianId() || !deps.isFocused()) return;
    const target = requestCompletionTarget(deps.getOrder());
    if (!target) {
      deps.notify('Chưa thể yêu cầu hoàn thành', 'Đơn chưa đủ điều kiện yêu cầu hoàn thành. Vui lòng kiểm tra từng điều kiện.');
      return;
    }
    publish({ confirming: true, error: null });
  }

  function cancelConfirm(): void {
    if (busy) return;
    publish({ confirming: false });
  }

  async function submit(): Promise<void> {
    if (busy || !state.confirming || state.needsVerify) return;
    // Re-check the release gate at POST time: a confirmation opened in a dev
    // build must never POST once the build is not dev. Drops silently.
    if (deps.isDevBuild?.() !== true) {
      publish({ confirming: false });
      return;
    }
    const technicianId = deps.getTechnicianId();
    if (!technicianId || !deps.isFocused()) return;
    const target = requestCompletionTarget(deps.getOrder());
    if (!target || deps.getOrder()?.id !== target.orderId) {
      deps.notify('Chưa thể yêu cầu hoàn thành', 'Đơn chưa đủ điều kiện yêu cầu hoàn thành. Vui lòng kiểm tra từng điều kiện.');
      return;
    }
    busy = true;
    publish({ busy: true, error: null });
    const sameSession = () =>
      deps.getTechnicianId() === technicianId &&
      deps.isFocused() &&
      deps.getOrder()?.id === target.orderId &&
      requestCompletionTarget(deps.getOrder())?.orderId === target.orderId;
    try {
      await deps.requestCompletion(target.orderId);
      if (!sameSession()) {
        reset();
        return;
      }
      state = { ...initialRequestCompletionState, requested: true };
      write(state);
      deps.notify('Đã gửi yêu cầu hoàn thành', 'Đã yêu cầu hoàn thành, chờ khách nghiệm thu và thanh toán.');
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
          confirming: false,
          error: `Máy chủ từ chối yêu cầu hoàn thành (mã ${status}). Vui lòng tải lại chi tiết đơn và kiểm tra điều kiện.`,
        });
        await deps.refreshDetail();
        return;
      }
      // Ambiguous POST (timeout/offline/5xx/lost response): the request may
      // exist server-side — never auto-repost. Lock until verified GET shows
      // completionRequestedAt (then no replay) or its definitive absence.
      publish({
        busy: false,
        confirming: false,
        needsVerify: true,
        error: 'Chưa xác nhận yêu cầu đã được ghi nhận hay chưa. Hãy tải lại chi tiết đơn để kiểm tra trạng thái trước khi thử lại.',
      });
      await deps.refreshDetail();
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
    /** Called by the screen after its own detail reload clears the lock. */
    markReverified: () => {
      if (!state.needsVerify) return;
      publish({ needsVerify: false, error: null });
    },
  };
}
