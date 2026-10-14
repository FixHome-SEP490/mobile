import { orderDetailTarget } from '../customer/customer-order-detail';
import { isCostDecisionBlocked } from '../customer/customer-additional-cost-decision';
import type { CreateAdditionalCostPayload } from '../../api/orders.api';
import { validateQuoteDraft, type QuoteFieldErrors } from './technician-quotation-create';

/**
 * P3B12 bounded technician additional-cost PROPOSAL create: one validated
 * LABOR line plus a mandatory reason, on an assigned ACTIVE UNDER_REPAIR
 * detail with no completion requested and no current PENDING_APPROVAL request
 * (client-conservative duplicate guard; the Backend may permit more).
 * A proposal only — never a charge, approval, payment, or revision. Two
 * explicit taps, one-shot POST, no auto-repost on ambiguity: lock until a
 * fresh costs GET reconciliation. Stale sessions reset silently.
 */

export const COST_PROPOSAL_REASON_MAX = 2000;

export interface CostProposalDraft {
  reason: string;
  description: string;
  quantity: string;
  unitPrice: string;
  note: string;
}

export interface CostProposalFieldErrors extends QuoteFieldErrors {
  reason?: string;
}

export interface CostProposalOrderGate {
  id: string;
  status: unknown;
  completionRequestedAt: unknown;
  historical?: unknown;
}

export interface CostProposalState {
  draft: CostProposalDraft;
  fieldErrors: CostProposalFieldErrors;
  confirming: boolean;
  /** Exact pending request under revision, or null for a new proposal. */
  revisingId: string | null;
  busy: boolean;
  error: string | null;
  /** Ambiguous POST lock: reload costs/detail before any retry. */
  needsVerify: boolean;
  /** Last submit returned 201 and reconciled. */
  sent: boolean;
  /** Exact server ID captured from the 201 body; absent when the ID was lost. */
  createdProposalId?: string;
  proposedTotalText: string | null;
}

const emptyDraft = (): CostProposalDraft => ({
  reason: '',
  description: '',
  quantity: '',
  unitPrice: '',
  note: '',
});

export const initialCostProposalState: CostProposalState = {
  draft: emptyDraft(),
  fieldErrors: {},
  confirming: false,
  revisingId: null,
  busy: false,
  error: null,
  needsVerify: false,
  sent: false,
  proposedTotalText: null,
};

export interface CostProposalDeps {
  getOrder: () => CostProposalOrderGate | null;
  getTechnicianId: () => string | null;
  isFocused: () => boolean;
  /** Retained for callers; multiple independent pending roots are valid so it no longer gates. */
  getCostStatuses: () => unknown[];
  createProposal: (orderId: string, payload: CreateAdditionalCostPayload) => Promise<unknown>;
  /** Current pending request under revision, if the screen tracks one. */
  getCostRequest?: (costId: string) => { status: unknown; expiresAt?: unknown } | null;
  /** Revision POST; absent callers only create. */
  reviseProposal?: (costId: string, payload: CreateAdditionalCostPayload) => Promise<unknown>;
  /** GET-only reconciliation: reload the costs list (and detail). */
  refreshCosts: () => Promise<void>;
  onAccessDenied: () => void;
  notify: (title: string, message: string) => void;
  /**
   * Optional FixHome-catalog part lines picked in the screen's own part picker
   * UI. Omitted/empty in every existing caller and test — the labor-only
   * payload shape stays byte-identical when no parts are selected.
   */
  getExtraPartItems?: () => CreateAdditionalCostPayload['items'];
  /** Only consulted when getExtraPartItems() returns at least one FixHome line. */
  getFulfillment?: () => { method: 'pickup' | 'delivery'; shippingFee: number } | null;
}

function statusOf(error: unknown): number | undefined {
  return (error as { response?: { status?: number } } | null)?.response?.status;
}

/**
 * Full proposal total: the labor line plus any FixHome part lines and delivery
 * shipping fee — everything the payload actually sends and the customer must
 * approve, not just the labor line (a proposal with parts previously showed
 * only the labor amount in the confirmation banner).
 */
function proposedTotal(lineTotal: number, deps: CostProposalDeps): number {
  const extraParts = deps.getExtraPartItems?.() ?? [];
  const partsTotal = extraParts.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const hasFixHomeParts = extraParts.some((item) => item.partSource === 'fixhome');
  const fulfillment = hasFixHomeParts ? deps.getFulfillment?.() ?? null : null;
  const shippingFee = fulfillment?.method === 'delivery' ? fulfillment.shippingFee : 0;
  return lineTotal + partsTotal + shippingFee;
}

/** Proposal gate: same tech/focus/real order, UNDER_REPAIR, open.
 * Multiple independent pending roots are valid — the Backend owns duplicate
 * policy — so a live PENDING_APPROVAL elsewhere never blocks a new proposal. */
export function costProposalTarget(
  order: CostProposalOrderGate | null,
  _getCostStatuses?: () => unknown[],
): string | null {
  if (!order || order.historical === true) return null;
  const target = orderDetailTarget(order.id);
  if (!target) return null;
  if (String(order.status).toUpperCase() !== 'UNDER_REPAIR') return null;
  if (!!order.completionRequestedAt) return null;
  return target;
}

/**
 * Revision target: only a still-PENDING_APPROVAL, unexpired request may be
 * revised. APPROVED is immutable (create a new proposal instead); expired
 * requests restart as new proposals, never revisions.
 */
export function reviseProposalTarget(existing: { status: unknown; expiresAt?: unknown } | null | undefined): boolean {
  if (!existing) return false;
  if (String(existing.status ?? '').toUpperCase() !== 'PENDING_APPROVAL') return false;
  return !isCostDecisionBlocked(existing.expiresAt);
}

/** Exact server record ID captured from a 201 body; null when the ID was lost. */
export function createdProposalIdOf(response: unknown): string | null {
  const body = response && typeof response === 'object' && 'data' in (response as Record<string, unknown>)
    ? (response as Record<string, unknown>).data
    : response;
  if (body && typeof body === 'object' && typeof (body as Record<string, unknown>).id === 'string') {
    const id = ((body as Record<string, unknown>).id as string).trim();
    return id ? id : null;
  }
  return null;
}

export function validateCostProposalDraft(draft: CostProposalDraft): {
  reason: string | null;
  line: { description: string; quantity: number; unitPrice: number; total: number } | null;
  note: string | null;
  errors: CostProposalFieldErrors;
} {
  const errors: CostProposalFieldErrors = {};
  const reason = draft.reason.trim();
  if (!reason) {
    errors.reason = 'Vui lòng nhập lý do phát sinh.';
  } else if (reason.length > COST_PROPOSAL_REASON_MAX) {
    errors.reason = `Lý do tối đa ${COST_PROPOSAL_REASON_MAX} ký tự.`;
  }
  // Reuse the proven P3B6 labor-line validation (description/qty/price/note bounds).
  const { line, note, errors: lineErrors } = validateQuoteDraft({
    description: draft.description,
    quantity: draft.quantity,
    unitPrice: draft.unitPrice,
    note: draft.note,
  });
  Object.assign(errors, lineErrors);
  if (Object.keys(errors).length > 0 || !line) {
    return { reason: null, line: null, note: null, errors };
  }
  return { reason, line, note, errors };
}

export function createCostProposalController(
  deps: CostProposalDeps,
  write: (state: CostProposalState) => void,
) {
  let state: CostProposalState = { ...initialCostProposalState, draft: emptyDraft(), fieldErrors: {} };
  let busy = false;

  const publish = (patch: Partial<CostProposalState>) => {
    state = { ...state, ...patch };
    write(state);
  };

  function reset() {
    busy = false;
    state = { ...initialCostProposalState, draft: emptyDraft(), fieldErrors: {} };
    write(state);
  }

  function setField(field: keyof CostProposalDraft, value: string) {
    publish({
      draft: { ...state.draft, [field]: value },
      fieldErrors: { ...state.fieldErrors, [field]: undefined },
      confirming: false,
      revisingId: null,
      proposedTotalText: null,
      sent: false,
    });
  }

  function requestConfirm(): void {
    if (busy || state.needsVerify) return;
    if (!deps.getTechnicianId() || !deps.isFocused()) return;
    const target = costProposalTarget(deps.getOrder(), deps.getCostStatuses);
    if (!target) {
      deps.notify('Chưa thể đề xuất chi phí', 'Đơn chưa đủ điều kiện đề xuất chi phí phát sinh (cần đang sửa, chưa yêu cầu hoàn thành).');
      return;
    }
    const { reason, line, errors } = validateCostProposalDraft(state.draft);
    if (!reason || !line) {
      publish({ fieldErrors: errors, confirming: false, revisingId: null, proposedTotalText: null });
      return;
    }
    publish({
      fieldErrors: {},
      confirming: true,
      revisingId: null,
      proposedTotalText: `${proposedTotal(line.total, deps).toLocaleString('vi-VN')}đ`,
      error: null,
    });
  }

  function requestReviseConfirm(costId: string): void {
    if (busy || state.needsVerify) return;
    if (!deps.getTechnicianId() || !deps.isFocused()) return;
    if (!orderDetailTarget(costId)) return;
    const target = costProposalTarget(deps.getOrder(), deps.getCostStatuses);
    if (!target) {
      deps.notify('Chưa thể đề xuất chi phí', 'Đơn chưa đủ điều kiện đề xuất chi phí phát sinh (cần đang sửa, chưa yêu cầu hoàn thành).');
      return;
    }
    if (!reviseProposalTarget(deps.getCostRequest?.(costId) ?? null)) {
      deps.notify('Không thể sửa đề xuất', 'Chỉ đề xuất đang chờ duyệt và còn hạn mới được sửa. Đề xuất đã duyệt không thể sửa.');
      return;
    }
    const { reason, line, errors } = validateCostProposalDraft(state.draft);
    if (!reason || !line) {
      publish({ fieldErrors: errors, confirming: false, revisingId: null, proposedTotalText: null });
      return;
    }
    publish({
      fieldErrors: {},
      confirming: true,
      revisingId: costId,
      proposedTotalText: `${proposedTotal(line.total, deps).toLocaleString('vi-VN')}đ`,
      error: null,
    });
  }

  function cancelConfirm(): void {
    if (busy) return;
    publish({ confirming: false, revisingId: null, proposedTotalText: null });
  }

  async function submit(): Promise<void> {
    if (busy || !state.confirming || state.needsVerify) return;
    const technicianId = deps.getTechnicianId();
    if (!technicianId || !deps.isFocused()) {
      reset();
      return;
    }
    const target = costProposalTarget(deps.getOrder(), deps.getCostStatuses);
    if (!target || deps.getOrder()?.id !== target) {
      reset();
      deps.notify('Chưa thể đề xuất chi phí', 'Đơn chưa đủ điều kiện đề xuất chi phí phát sinh (cần đang sửa, chưa yêu cầu hoàn thành).');
      return;
    }
    const revisingId = state.revisingId;
    if (revisingId && !reviseProposalTarget(deps.getCostRequest?.(revisingId) ?? null)) {
      reset();
      deps.notify('Đề xuất đã thay đổi', 'Đề xuất đang sửa không còn ở trạng thái chờ duyệt. Vui lòng tải lại chi phí phát sinh.');
      return;
    }
    if (revisingId && !deps.reviseProposal) {
      publish({
        busy: false,
        confirming: false,
        revisingId: null,
        proposedTotalText: null,
        error: 'Sửa đề xuất chưa được hỗ trợ. Vui lòng tạo đề xuất mới.',
      });
      return;
    }
    const { reason, line, note, errors } = validateCostProposalDraft(state.draft);
    if (!reason || !line) {
      publish({ fieldErrors: errors, confirming: false, revisingId: null, proposedTotalText: null });
      return;
    }
    busy = true;
    publish({ busy: true, error: null });
    const sameSession = () =>
      deps.getTechnicianId() === technicianId &&
      deps.isFocused() &&
      deps.getOrder()?.id === target &&
      costProposalTarget(deps.getOrder(), deps.getCostStatuses) === target &&
      (revisingId ? reviseProposalTarget(deps.getCostRequest?.(revisingId) ?? null) : true);
    try {
      const extraParts = deps.getExtraPartItems?.() ?? [];
      const hasFixHomeParts = extraParts.some((item) => item.partSource === 'fixhome');
      const fulfillment = hasFixHomeParts ? deps.getFulfillment?.() ?? null : null;
      const payload: CreateAdditionalCostPayload = {
        reason,
        items: [
          { type: 'labor', description: line.description, quantity: line.quantity, unitPrice: line.unitPrice },
          ...extraParts,
        ],
        ...(note !== null ? { note } : {}),
        ...(fulfillment ? { fulfillmentMethod: fulfillment.method, shippingFee: fulfillment.method === 'delivery' ? fulfillment.shippingFee : 0 } : {}),
      };
      const response = revisingId && deps.reviseProposal
        ? await deps.reviseProposal(revisingId, payload)
        : await deps.createProposal(target, payload);
      if (!sameSession()) {
        reset();
        return;
      }
      // Exact record ID from the 201 body; a lost ID stays locked, never sent.
      const recordId = createdProposalIdOf(response);
      await deps.refreshCosts();
      if (!sameSession()) {
        reset();
        return;
      }
      if (!recordId) {
        publish({
          busy: false,
          confirming: false,
          revisingId: null,
          proposedTotalText: null,
          needsVerify: true,
          error: 'Chưa xác nhận đề xuất đã được tạo hay chưa. Hãy tải lại chi phí phát sinh để kiểm tra trước khi thử lại.',
        });
        return;
      }
      state = { ...initialCostProposalState, draft: emptyDraft(), fieldErrors: {}, sent: true, createdProposalId: recordId };
      write(state);
      deps.notify(
        revisingId ? 'Đã gửi bản sửa đề xuất' : 'Đã gửi đề xuất',
        'Đã gửi đề xuất chi phí, khách cần duyệt, chưa thanh toán.',
      );
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
          proposedTotalText: null,
          error: `Hệ thống từ chối đề xuất (mã ${status}). Vui lòng tải lại chi phí phát sinh và kiểm tra yêu cầu hiện có.`,
        });
        await deps.refreshCosts();
        return;
      }
      // Ambiguous POST (timeout/offline/5xx/lost response): the proposal may
      // exist server-side — never auto-repost. Lock until a fresh costs GET
      // reconciliation; only an exact captured ID proves this intent.
      publish({
        busy: false,
        confirming: false,
        proposedTotalText: null,
        needsVerify: true,
        error: 'Chưa xác nhận đề xuất đã được tạo hay chưa. Hãy tải lại chi phí phát sinh để kiểm tra trước khi thử lại.',
      });
      await deps.refreshCosts();
    } finally {
      busy = false;
      if (state.busy) publish({ busy: false });
    }
  }

  return {
    setField,
    requestConfirm,
    requestReviseConfirm,
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
