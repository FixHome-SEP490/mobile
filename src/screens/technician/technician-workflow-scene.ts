import type { WorkOrderNextActionKind } from './technician-work-order-hierarchy';

export type TechnicianWorkflowSceneId =
  | 'accepted'
  | 'check-in'
  | 'before-evidence'
  | 'quotation'
  | 'ready-repair'
  | 'extras-pending'
  | 'after-evidence'
  | 'completion-readiness'
  | 'request-completion'
  | 'waiting-acceptance'
  | 'completed-summary'
  | 'neutral';

export interface TechnicianWorkflowSceneInput {
  actionKind: WorkOrderNextActionKind | null;
  orderStatus: unknown;
  historical?: unknown;
  assignedToViewer?: unknown;
  hasError?: unknown;
  offline?: unknown;
  denied?: unknown;
  arrivalVerified?: unknown;
  completionRequested?: unknown;
  /**
   * Mirrors the existing `WorkOrderNextAction` presentation flags
   * (`disabled`/`busy`/`confirming`). The selector never assumes a CTA from
   * the kind alone: `hasPrimaryCta` is true only when all three are
   * explicitly `false`.
   */
  actionDisabled?: unknown;
  actionBusy?: unknown;
  actionConfirming?: unknown;
}

export interface TechnicianWorkflowScene {
  sceneId: TechnicianWorkflowSceneId;
  title: string;
  description: string;
  hasPrimaryCta: boolean;
  allowOrderDetails: boolean;
  allowContactActions: boolean;
}

const NEUTRAL: TechnicianWorkflowScene = {
  sceneId: 'neutral',
  title: 'Chưa xác định bước tiếp theo',
  description: 'Không thể xác định bước tiếp theo. Vui lòng thử lại.',
  hasPrimaryCta: false,
  allowOrderDetails: false,
  allowContactActions: false,
};

function normalizedStatus(orderStatus: unknown): string | null {
  const status = String(orderStatus ?? '').toUpperCase();
  if (
    status === 'ACCEPTED' ||
    status === 'EN_ROUTE' ||
    status === 'UNDER_REPAIR' ||
    status === 'IN_PROGRESS' ||
    status === 'COMPLETED'
  ) return status;
  return null;
}

type BeforeKind =
  | 'capture-before-evidence'
  | 'reconcile-before-evidence'
  | 'upload-before-evidence';

type AfterKind =
  | 'capture-after-evidence'
  | 'reconcile-after-evidence'
  | 'upload-after-evidence';

function isBeforeKind(kind: WorkOrderNextActionKind): kind is BeforeKind {
  return (
    kind === 'capture-before-evidence' ||
    kind === 'reconcile-before-evidence' ||
    kind === 'upload-before-evidence'
  );
}

function isAfterKind(kind: WorkOrderNextActionKind): kind is AfterKind {
  return (
    kind === 'capture-after-evidence' ||
    kind === 'reconcile-after-evidence' ||
    kind === 'upload-after-evidence'
  );
}

function isEnRouteKind(kind: WorkOrderNextActionKind): boolean {
  return (
    kind === 'check-in' ||
    isBeforeKind(kind) ||
    kind === 'await-quotation' ||
    kind === 'start-repair' ||
    kind === 'start-repair-blocked'
  );
}

function isRepairKind(kind: WorkOrderNextActionKind): boolean {
  return (
    kind === 'await-additional-cost-decision' ||
    isAfterKind(kind) ||
    kind === 'completion-blocked' ||
    kind === 'request-completion' ||
    kind === 'await-customer-acceptance'
  );
}

/**
 * Presentation-only status/action correlation from the canonical packet
 * stage table and the existing source (`technician-job-progress.ts` treats
 * `IN_PROGRESS` as the `UNDER_REPAIR` alias). This never creates a
 * permission rule or a new action: an unknown correlation returns neutral
 * with no CTA instead of guessing a scene.
 */
function statusMatchesKind(status: string, kind: WorkOrderNextActionKind): boolean {
  if (kind === 'begin-travel') return status === 'ACCEPTED';
  if (isEnRouteKind(kind)) return status === 'EN_ROUTE';
  if (isRepairKind(kind)) return status === 'UNDER_REPAIR' || status === 'IN_PROGRESS';
  return false;
}

function sceneForKind(actionKind: WorkOrderNextActionKind): TechnicianWorkflowScene | null {
  switch (actionKind) {
    case 'begin-travel':
      return {
        sceneId: 'accepted',
        title: 'Công việc đã nhận',
        description: 'Đơn đã được giao cho bạn. Xem nhiệm vụ di chuyển hiện tại.',
        hasPrimaryCta: true,
        allowOrderDetails: true,
        allowContactActions: true,
      };
    case 'check-in':
      return {
        sceneId: 'check-in',
        title: 'Đến nơi, xác nhận rõ',
        description: 'Xác nhận đã đến nơi khi bạn đã ở đúng vị trí.',
        hasPrimaryCta: true,
        allowOrderDetails: true,
        allowContactActions: true,
      };
    case 'capture-before-evidence':
    case 'reconcile-before-evidence':
    case 'upload-before-evidence':
      return {
        sceneId: 'before-evidence',
        title: 'Ghi nhận trước khi sửa',
        description: 'Chụp và đối chiếu ảnh trước sửa chữa theo hướng dẫn.',
        hasPrimaryCta: true,
        allowOrderDetails: true,
        allowContactActions: true,
      };
    case 'await-quotation':
      return {
        sceneId: 'quotation',
        title: 'Báo giá đang chờ',
        description: 'Báo giá đang chờ khách duyệt. Không tự xác nhận thay khách.',
        hasPrimaryCta: false,
        allowOrderDetails: true,
        allowContactActions: true,
      };
    case 'start-repair':
      return {
        sceneId: 'ready-repair',
        title: 'Sẵn sàng bắt đầu sửa',
        description: 'Kiểm tra điều kiện rồi bắt đầu sửa theo quy trình.',
        hasPrimaryCta: true,
        allowOrderDetails: true,
        allowContactActions: true,
      };
    case 'start-repair-blocked':
      return {
        sceneId: 'ready-repair',
        title: 'Sẵn sàng bắt đầu sửa',
        description: 'Còn điều kiện chưa đạt nên chưa thể bắt đầu sửa.',
        hasPrimaryCta: false,
        allowOrderDetails: true,
        allowContactActions: true,
      };
    case 'await-additional-cost-decision':
      return {
        sceneId: 'extras-pending',
        title: 'Chi phí phát sinh đang chờ',
        description: 'Chi phí phát sinh đang chờ quyết định. Không tiếp tục khi chưa rõ.',
        hasPrimaryCta: false,
        allowOrderDetails: true,
        allowContactActions: true,
      };
    case 'capture-after-evidence':
    case 'reconcile-after-evidence':
    case 'upload-after-evidence':
      return {
        sceneId: 'after-evidence',
        title: 'Tình trạng sau sửa',
        description: 'Ghi nhận ảnh sau sửa chữa theo hướng dẫn.',
        hasPrimaryCta: true,
        allowOrderDetails: true,
        allowContactActions: true,
      };
    case 'completion-blocked':
      return {
        sceneId: 'completion-readiness',
        title: 'Chưa đủ điều kiện nghiệm thu',
        description: 'Còn điều kiện chưa đạt. Xem lại danh sách trước khi gửi yêu cầu.',
        hasPrimaryCta: false,
        allowOrderDetails: true,
        allowContactActions: true,
      };
    case 'request-completion':
      return {
        sceneId: 'request-completion',
        title: 'Sẵn sàng yêu cầu nghiệm thu',
        description: 'Kiểm tra lại kết quả rồi gửi yêu cầu nghiệm thu.',
        hasPrimaryCta: true,
        allowOrderDetails: true,
        allowContactActions: true,
      };
    case 'await-customer-acceptance':
      return {
        sceneId: 'waiting-acceptance',
        title: 'Chờ khách kiểm tra',
        description: 'Yêu cầu nghiệm thu đang chờ khách xác nhận.',
        hasPrimaryCta: false,
        allowOrderDetails: true,
        allowContactActions: true,
      };
    default:
      return null;
  }
}

/**
 * P0 view-only stage selector for the Technician work journey (UX01B).
 * Consumes the already-computed `primaryAction.kind` plus server-verified
 * owner/status/error/arrival/completion flags and returns static Vietnamese
 * copy with disclosure flags only. It never invokes controllers, performs
 * I/O, creates permission rules or actions, or carries customer PII,
 * amounts, or raw status codes. Any unverified, historical, unassigned,
 * error, offline, denied, unknown, legacy, cancelled, or status/action
 * mismatched input returns the neutral scene with no CTA (fail-closed).
 */
export function selectTechnicianWorkflowScene(
  input: TechnicianWorkflowSceneInput,
): TechnicianWorkflowScene {
  if (input.historical !== false) return { ...NEUTRAL };
  if (input.assignedToViewer !== true) return { ...NEUTRAL };
  if (input.hasError !== false || input.offline !== false || input.denied !== false) {
    return { ...NEUTRAL };
  }
  const status = normalizedStatus(input.orderStatus);
  if (status === null) return { ...NEUTRAL };
  if (input.actionKind === null || input.actionKind === undefined) {
    if (status === 'COMPLETED') {
      return {
        sceneId: 'completed-summary',
        title: 'Công việc đã hoàn thành',
        description: 'Đơn đã hoàn thành. Xem lại tóm tắt lưu trữ.',
        hasPrimaryCta: false,
        allowOrderDetails: true,
        allowContactActions: false,
      };
    }
    return { ...NEUTRAL };
  }
  const scene = sceneForKind(input.actionKind);
  if (!scene) return { ...NEUTRAL };
  if (status === 'COMPLETED') return { ...NEUTRAL };
  if (!statusMatchesKind(status, input.actionKind)) return { ...NEUTRAL };
  if (input.actionKind === 'check-in' && input.arrivalVerified !== false) {
    return { ...NEUTRAL };
  }
  if (isBeforeKind(input.actionKind) && input.arrivalVerified !== true) {
    return { ...NEUTRAL };
  }
  if (input.actionKind === 'await-customer-acceptance') {
    if (input.completionRequested !== true) return { ...NEUTRAL };
  } else if (isRepairKind(input.actionKind)) {
    if (input.completionRequested !== false) return { ...NEUTRAL };
  } else if (input.completionRequested === true) {
    return { ...NEUTRAL };
  }
  const actionEnabled =
    input.actionDisabled === false &&
    input.actionBusy === false &&
    input.actionConfirming === false;
  return { ...scene, hasPrimaryCta: scene.hasPrimaryCta && actionEnabled };
}
