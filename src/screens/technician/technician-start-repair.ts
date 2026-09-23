import { orderDetailTarget } from '../customer/customer-order-detail';

/**
 * P3B9 bounded technician START REPAIR mutation. Runs only on an assigned
 * ACTIVE EN_ROUTE detail with Backend `arrivalVerified===true`, at least one
 * BEFORE photo on record, and either FIXED_PRICE with a real fixed unit price
 * (no quote needed) or INSPECTION_REQUIRED with an APPROVED quotation.
 * These UI checks are preliminary — the Backend transaction is the final
 * validator (same-tech BEFORE count, config minimum, pending costs). One
 * explicit two-tap confirmation, one-shot POST, no auto-repost on ambiguity.
 * This marks repair start ONLY: never completion, payment, approval, or photo
 * upload.
 */

/** Explicit two-tap confirmation copy; screen renders this verbatim. */
export const START_REPAIR_CONFIRM_COPY =
  'Bắt đầu sửa chữa: đơn chuyển sang Đang sửa; chỉ thực hiện sau khi đã check-in hợp lệ, tải đủ ảnh trước sửa, và khách duyệt báo giá khi cần.';

export interface StartRepairOrderGate {
  id: string;
  status: unknown;
  arrivalVerified: unknown;
  historical?: unknown;
  pricingMode?: unknown;
  fixedUnitPrice?: unknown;
  beforeEvidenceCount?: unknown;
  quotationStatus?: unknown;
}

export type StartRepairPricing = 'fixed_price' | 'inspection_required';

export interface StartRepairState {
  confirming: boolean;
  busy: boolean;
  error: string | null;
  /** Ambiguous POST lock: reload the detail before any retry. */
  needsVerify: boolean;
  /** Server-confirmed start this focus; cleared on blur/order change. */
  started: boolean;
  pricing: StartRepairPricing | null;
}

export const initialStartRepairState: StartRepairState = {
  confirming: false,
  busy: false,
  error: null,
  needsVerify: false,
  started: false,
  pricing: null,
};

export interface StartRepairDeps {
  getOrder: () => StartRepairOrderGate | null;
  getTechnicianId: () => string | null;
  isFocused: () => boolean;
  startRepair: (orderId: string) => Promise<unknown>;
  /** GET-only reconciliation: reload order, evidence, and invoice. */
  refreshDetail: () => Promise<void>;
  onAccessDenied: () => void;
  notify: (title: string, message: string) => void;
}

function statusOf(error: unknown): number | undefined {
  return (error as { response?: { status?: number } } | null)?.response?.status;
}

function pricingOf(order: StartRepairOrderGate): StartRepairPricing | null {
  const mode = String(order.pricingMode ?? '').toLowerCase();
  if (mode === 'fixed_price') {
    return typeof order.fixedUnitPrice === 'number' &&
      Number.isFinite(order.fixedUnitPrice) &&
      order.fixedUnitPrice >= 0
      ? 'fixed_price'
      : null;
  }
  if (mode === 'inspection_required') {
    return String(order.quotationStatus ?? '').toUpperCase() === 'APPROVED'
      ? 'inspection_required'
      : null;
  }
  return null;
}

/** Preliminary UI gate; only the authenticated Backend POST confirms success. */
export function startRepairTarget(
  order: StartRepairOrderGate | null,
): { orderId: string; pricing: StartRepairPricing } | null {
  if (!order || order.historical === true) return null;
  const orderId = orderDetailTarget(order.id);
  if (!orderId) return null;
  if (String(order.status).toUpperCase() !== 'EN_ROUTE') return null;
  if (order.arrivalVerified !== true) return null;
  if (
    typeof order.beforeEvidenceCount !== 'number' ||
    !Number.isFinite(order.beforeEvidenceCount) ||
    order.beforeEvidenceCount < 1
  ) {
    return null;
  }
  const pricing = pricingOf(order);
  if (!pricing) return null;
  return { orderId, pricing };
}

/** Honest per-condition blocker copy for the eligibility indicator. */
export function describeStartRepairBlockers(order: StartRepairOrderGate | null): string[] {
  if (!order || order.historical === true || !orderDetailTarget(order.id)) return [];
  const blockers: string[] = [];
  if (String(order.status).toUpperCase() !== 'EN_ROUTE') {
    blockers.push('Đơn chưa ở trạng thái di chuyển.');
  }
  if (order.arrivalVerified !== true) {
    blockers.push('Chưa check-in hợp lệ.');
  }
  if (
    typeof order.beforeEvidenceCount !== 'number' ||
    !Number.isFinite(order.beforeEvidenceCount) ||
    order.beforeEvidenceCount < 1
  ) {
    blockers.push('Cần ảnh trước sửa chữa do bạn tải lên, số lượng yêu cầu do hệ thống kiểm tra.');
  }
  const mode = String(order.pricingMode ?? '').toLowerCase();
  if (mode === 'fixed_price') {
    if (
      typeof order.fixedUnitPrice !== 'number' ||
      !Number.isFinite(order.fixedUnitPrice) ||
      order.fixedUnitPrice < 0
    ) {
      blockers.push('Đơn giá cố định chưa có.');
    }
  } else if (mode === 'inspection_required') {
    if (String(order.quotationStatus ?? '').toUpperCase() !== 'APPROVED') {
      blockers.push('Cần báo giá được khách duyệt.');
    }
  } else {
    blockers.push('Loại báo giá chưa đủ điều kiện.');
  }
  return blockers;
}

export function createStartRepairController(
  deps: StartRepairDeps,
  write: (state: StartRepairState) => void,
) {
  let state: StartRepairState = { ...initialStartRepairState };
  let busy = false;

  const publish = (patch: Partial<StartRepairState>) => {
    state = { ...state, ...patch };
    write(state);
  };

  function reset() {
    busy = false;
    state = { ...initialStartRepairState };
    write(state);
  }

  function requestConfirm(): void {
    if (busy || state.needsVerify) return;
    if (!deps.getTechnicianId() || !deps.isFocused()) return;
    const target = startRepairTarget(deps.getOrder());
    if (!target) {
      deps.notify('Chưa thể bắt đầu sửa chữa', 'Đơn chưa đủ điều kiện bắt đầu sửa chữa. Vui lòng kiểm tra từng điều kiện.');
      return;
    }
    publish({ confirming: true, pricing: target.pricing, error: null });
  }

  function cancelConfirm(): void {
    if (busy) return;
    publish({ confirming: false, pricing: null });
  }

  async function submit(): Promise<void> {
    if (busy || !state.confirming || state.needsVerify) return;
    const technicianId = deps.getTechnicianId();
    if (!technicianId || !deps.isFocused()) return;
    const target = startRepairTarget(deps.getOrder());
    if (!target || deps.getOrder()?.id !== target.orderId) {
      deps.notify('Chưa thể bắt đầu sửa chữa', 'Đơn chưa đủ điều kiện bắt đầu sửa chữa. Vui lòng kiểm tra từng điều kiện.');
      return;
    }
    busy = true;
    publish({ busy: true, error: null, pricing: target.pricing });
    const sameSession = () =>
      deps.getTechnicianId() === technicianId &&
      deps.isFocused() &&
      deps.getOrder()?.id === target.orderId &&
      startRepairTarget(deps.getOrder())?.orderId === target.orderId;
    try {
      await deps.startRepair(target.orderId);
      if (!sameSession()) {
        reset();
        return;
      }
      state = { ...initialStartRepairState, started: true, pricing: target.pricing };
      write(state);
      deps.notify('Đã bắt đầu sửa chữa', 'Đơn đã chuyển sang trạng thái đang sửa chữa.');
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
          pricing: null,
          error: `Máy chủ từ chối bắt đầu sửa chữa (mã ${status}). Vui lòng tải lại chi tiết đơn và kiểm tra điều kiện.`,
        });
        await deps.refreshDetail();
        return;
      }
      // Ambiguous POST (timeout/offline/5xx/lost response): the transition
      // may exist server-side — never auto-repost. Lock until verified GET.
      publish({
        busy: false,
        confirming: false,
        pricing: null,
        needsVerify: true,
        error: 'Chưa xác nhận sửa chữa đã bắt đầu hay chưa. Hãy tải lại chi tiết đơn để kiểm tra trạng thái trước khi thử lại.',
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
