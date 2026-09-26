import { orderDetailTarget } from '../customer/customer-order-detail';
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
  busy: boolean;
  error: string | null;
  /** Ambiguous POST lock: reload costs/detail before any retry. */
  needsVerify: boolean;
  /** Last submit returned 201 and reconciled. */
  sent: boolean;
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
  /** Current costs-list statuses for the duplicate-pending guard. */
  getCostStatuses: () => unknown[];
  createProposal: (orderId: string, payload: CreateAdditionalCostPayload) => Promise<unknown>;
  /** GET-only reconciliation: reload the costs list (and detail). */
  refreshCosts: () => Promise<void>;
  onAccessDenied: () => void;
  notify: (title: string, message: string) => void;
}

function statusOf(error: unknown): number | undefined {
  return (error as { response?: { status?: number } } | null)?.response?.status;
}

function hasPendingCosts(getCostStatuses: () => unknown[]): boolean {
  return getCostStatuses().some((status) => String(status ?? '').toUpperCase() === 'PENDING_APPROVAL');
}

/** Proposal gate: same tech/focus/real order, UNDER_REPAIR, open, no live pending. */
export function costProposalTarget(
  order: CostProposalOrderGate | null,
  getCostStatuses: () => unknown[],
): string | null {
  if (!order || order.historical === true) return null;
  const target = orderDetailTarget(order.id);
  if (!target) return null;
  if (String(order.status).toUpperCase() !== 'UNDER_REPAIR') return null;
  if (!!order.completionRequestedAt) return null;
  if (hasPendingCosts(getCostStatuses)) return null;
  return target;
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
      proposedTotalText: null,
      sent: false,
    });
  }

  function requestConfirm(): void {
    if (busy || state.needsVerify) return;
    if (!deps.getTechnicianId() || !deps.isFocused()) return;
    const target = costProposalTarget(deps.getOrder(), deps.getCostStatuses);
    if (!target) {
      deps.notify('Chưa thể đề xuất chi phí', 'Đơn chưa đủ điều kiện đề xuất chi phí phát sinh (cần đang sửa, chưa yêu cầu hoàn thành, không có yêu cầu chờ duyệt).');
      return;
    }
    const { reason, line, errors } = validateCostProposalDraft(state.draft);
    if (!reason || !line) {
      publish({ fieldErrors: errors, confirming: false, proposedTotalText: null });
      return;
    }
    publish({
      fieldErrors: {},
      confirming: true,
      proposedTotalText: `${line.total.toLocaleString('vi-VN')}đ`,
      error: null,
    });
  }

  function cancelConfirm(): void {
    if (busy) return;
    publish({ confirming: false, proposedTotalText: null });
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
      deps.notify('Chưa thể đề xuất chi phí', 'Đơn chưa đủ điều kiện đề xuất chi phí phát sinh (cần đang sửa, chưa yêu cầu hoàn thành, không có yêu cầu chờ duyệt).');
      return;
    }
    const { reason, line, note, errors } = validateCostProposalDraft(state.draft);
    if (!reason || !line) {
      publish({ fieldErrors: errors, confirming: false, proposedTotalText: null });
      return;
    }
    busy = true;
    publish({ busy: true, error: null });
    const sameSession = () =>
      deps.getTechnicianId() === technicianId &&
      deps.isFocused() &&
      deps.getOrder()?.id === target &&
      costProposalTarget(deps.getOrder(), deps.getCostStatuses) === target;
    try {
      const payload: CreateAdditionalCostPayload = {
        reason,
        items: [{ type: 'labor', description: line.description, quantity: line.quantity, unitPrice: line.unitPrice }],
        ...(note !== null ? { note } : {}),
      };
      await deps.createProposal(target, payload);
      if (!sameSession()) {
        reset();
        return;
      }
      state = { ...initialCostProposalState, draft: emptyDraft(), fieldErrors: {}, sent: true };
      write(state);
      deps.notify('Đã gửi đề xuất', 'Đã gửi đề xuất chi phí, khách cần duyệt, chưa thanh toán.');
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
          confirming: false,
          proposedTotalText: null,
          error: `Máy chủ từ chối đề xuất (mã ${status}). Vui lòng tải lại chi phí phát sinh và kiểm tra yêu cầu hiện có.`,
        });
        await deps.refreshCosts();
        return;
      }
      // Ambiguous POST (timeout/offline/5xx/lost response): the proposal may
      // exist server-side — never auto-repost. Lock until a fresh costs GET;
      // if that GET finds a pending request, the gate blocks any second POST.
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
