import { orderDetailTarget } from './customer-order-detail';

/**
 * P3B13 bounded CUSTOMER additional-cost APPROVE/REJECT. Runs for the signed-in
 * customer on the same focused real ServiceOrder in UNDER_REPAIR with no
 * completion requested, on a PENDING_APPROVAL, unexpired, non-superseded cost
 * whose every line is validated genuine LABOR or an eligible TECHNICIAN
 * PAID_WARRANTY part line. APPROVE adds the approved delta to server totals
 * but does NOT pay/settle; REJECT affects ONLY that cost request — the order
 * keeps its repair status (unlike quote REJECT, which closes the whole order).
 * Paid-warranty approval sends only exact eligible line IDs (default OFF);
 * anything else fails closed instead of being approved blindly.
 */

/** Exact whole-request-only reject copy; screen renders this verbatim. */
export const REJECT_COST_ONLY_WARNING =
  'Từ chối chỉ áp dụng cho yêu cầu chi phí này, đơn dịch vụ vẫn tiếp tục sửa chữa.';

/** Approval confirmation must carry this: approval itself is not payment. */
export const APPROVE_COST_NOT_PAYMENT_NOTE = 'Duyệt chi phí chưa phải thanh toán.';

export interface CostDecisionItem {
  itemType: unknown;
  /** Alternate wire field name for the line type. */
  type?: unknown;
  id?: unknown;
  description?: unknown;
  partSource?: unknown;
  partWarrantyOption?: unknown;
  warrantyFee?: unknown;
  warrantyTermDays?: unknown;
}

export interface ExtraWarrantyOption {
  itemId: string;
  description: string;
  fee: number;
  feeText: string;
  termDays: number;
}

export interface CostDecisionContext {
  orderId: string;
  orderStatus: unknown;
  completionRequestedAt: unknown;
  costId: unknown;
  costStatus: unknown;
  costExpiresAt: unknown;
  costItems: unknown;
  /** True when this request was superseded by a newer revision. */
  costSuperseded?: unknown;
}

export type CostDecisionKind = 'approve' | 'reject';

export interface CostDecisionState {
  confirming: { costId: string; kind: CostDecisionKind; selectedIds: string[] } | null;
  /** Exact valid UUIDs from eligible paid-warranty lines only; default OFF (empty). */
  selectedIds: string[];
  busy: boolean;
  error: string | null;
  /** Ambiguous POST lock: reload costs/detail before any retry. */
  needsVerify: boolean;
  decided: { costId: string; action: 'APPROVED' | 'REJECTED' } | null;
}

export const initialCostDecisionState: CostDecisionState = {
  confirming: null,
  selectedIds: [],
  busy: false,
  error: null,
  needsVerify: false,
  decided: null,
};

export interface CostDecisionDeps {
  getContext: (costId: string) => CostDecisionContext | null;
  getCustomerId: () => string | null;
  isFocused: () => boolean;
  approveCost: (costId: string, paidWarrantyItemIds: string[]) => Promise<unknown>;
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

export function decisionMoneyText(amount: number): string {
  return `${amount.toLocaleString('vi-VN')}đ`;
}

/**
 * Genuinely eligible paid-warranty lines only: PARTS type, real UUID id,
 * partSource technician, partWarrantyOption paid_warranty, finite nonnegative
 * fee, positive integer term, non-empty description. Anything else is excluded.
 */
export function eligibleExtraWarrantyOptions(items: unknown): ExtraWarrantyOption[] {
  if (!Array.isArray(items)) return [];
  const options: ExtraWarrantyOption[] = [];
  for (const entry of items) {
    if (typeof entry !== 'object' || entry === null) continue;
    const record = entry as Record<string, unknown>;
    const rawType = typeof record.itemType === 'string'
      ? record.itemType
      : typeof record.type === 'string' ? record.type : '';
    const normalized = rawType.toLowerCase();
    if (normalized !== 'parts' && normalized !== 'parts_equipment') continue;
    const id = typeof record.id === 'string' ? record.id.trim() : '';
    if (!id || !orderDetailTarget(id)) continue;
    const partSource = typeof record.partSource === 'string' ? record.partSource.toLowerCase() : '';
    const warrantyOption = typeof record.partWarrantyOption === 'string' ? record.partWarrantyOption.toLowerCase() : '';
    if (partSource !== 'technician' || warrantyOption !== 'paid_warranty') continue;
    const fee = record.warrantyFee;
    if (typeof fee !== 'number' || !Number.isFinite(fee) || fee < 0) continue;
    const termRaw = record.warrantyTermDays;
    if (typeof termRaw !== 'number' || !Number.isInteger(termRaw) || termRaw <= 0) continue;
    const description = typeof record.description === 'string' ? record.description.trim() : '';
    if (!description) continue;
    options.push({ itemId: id, description, fee, feeText: decisionMoneyText(fee), termDays: termRaw });
  }
  return options;
}

/**
 * Decidable line sets: every line is LABOR or an eligible paid-warranty PARTS
 * line. Anything else fails closed instead of being approved blindly.
 */
export function isDecidableExtraItems(items: unknown): boolean {
  if (!Array.isArray(items) || items.length === 0) return false;
  const paidIds = new Set(eligibleExtraWarrantyOptions(items).map((option) => option.itemId));
  return (items as unknown[]).every((entry) => {
    if (typeof entry !== 'object' || entry === null) return false;
    const record = entry as Record<string, unknown>;
    const rawType = typeof record.itemType === 'string'
      ? record.itemType
      : typeof record.type === 'string' ? record.type : '';
    if (typeof rawType === 'string' && rawType.toLowerCase() === 'labor') return true;
    const id = typeof record.id === 'string' ? record.id.trim() : '';
    return id !== '' && paidIds.has(id);
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

/** Decision gate: same customer, focus, real UNDER_REPAIR open order, pending decidable cost. */
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
  if (ctx.costSuperseded === true) return null;
  if (isCostDecisionBlocked(ctx.costExpiresAt)) return null;
  if (!isDecidableExtraItems(ctx.costItems)) return null;
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
      deps.notify('Yêu cầu đã thay đổi', 'Yêu cầu chi phí không còn ở trạng thái chờ duyệt. Vui lòng tải lại chi tiết đơn.');
      return;
    }
    const eligibleIds = new Set(eligibleExtraWarrantyOptions(deps.getContext(costId)?.costItems).map((option) => option.itemId));
    const selectedIds = kind === 'approve' ? state.selectedIds.filter((id) => eligibleIds.has(id)) : [];
    publish({ confirming: { costId: target.costId, kind, selectedIds }, error: null });
  }

  function toggleWarranty(itemId: string, costId?: string): void {
    if (busy || state.needsVerify) return;
    if (!deps.getCustomerId() || !deps.isFocused()) return;
    const ctx = deps.getContext(costId ?? state.confirming?.costId ?? '');
    const eligible = eligibleExtraWarrantyOptions(ctx?.costItems);
    if (!eligible.some((option) => option.itemId === itemId)) return;
    const selected = state.selectedIds.includes(itemId)
      ? state.selectedIds.filter((id) => id !== itemId)
      : [...state.selectedIds, itemId];
    publish({ selectedIds: selected, confirming: null, decided: null });
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
        await deps.approveCost(target.costId, confirming.selectedIds ?? []);
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
          error: `Hệ thống từ chối quyết định (mã ${status}). Vui lòng tải lại chi phí phát sinh và kiểm tra trạng thái yêu cầu.`,
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
    toggleWarranty,
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
