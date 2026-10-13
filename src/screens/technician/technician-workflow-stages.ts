import type { ServiceOrderItem } from '../../api/orders.api';
import type { TechnicianWorkflowSceneId } from './technician-workflow-scene';

export type TechnicianStageId = TechnicianWorkflowSceneId | 'scope' | 'repair';
export interface TechnicianStage { id: TechnicianStageId; label: string; done: boolean }

/** UI navigation only. A past step needs its own server proof, never an index. */
export function technicianWorkflowStages(
  order: ServiceOrderItem,
  scene: TechnicianWorkflowSceneId,
  handover = false,
  recoveringAfter = false,
): { current: TechnicianStageId; steps: TechnicianStage[] } {
  if (scene === 'neutral' || order.historical === true) return { current: 'neutral', steps: [] };
  const status = String(order.status).toUpperCase();
  const repair = status === 'UNDER_REPAIR';
  const requested = !!order.completionRequestedAt;
  const inspection = order.pricingMode === 'inspection_required';
  const approved = order.quotation?.status?.toUpperCase() === 'APPROVED';
  const paidAndAccepted = order.customerConfirmed === true && order.paymentStatus === 'PAID';
  const completed = status === 'COMPLETED' && paidAndAccepted;
  let current: TechnicianStageId = scene;
  if (repair && !requested && scene !== 'extras-pending' && !recoveringAfter && !handover) current = 'repair';
  if (status === 'COMPLETED' && !completed) current = 'waiting-acceptance';
  const recorded = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value > 0;
  const steps: TechnicianStage[] = [
    { id: 'accepted', label: 'Di chuyển', done: ['EN_ROUTE', 'UNDER_REPAIR', 'COMPLETED'].includes(status) },
    { id: 'check-in', label: 'Check-in GPS', done: order.arrivalVerified === true },
    { id: 'before-evidence', label: 'Ảnh trước sửa', done: recorded(order.beforeEvidenceCount) },
    ...(inspection ? [{ id: 'quotation' as const, label: 'Báo giá', done: approved }] : []),
    { id: 'scope', label: inspection ? 'Phạm vi đã duyệt' : 'Phạm vi đã đặt', done: order.arrivalVerified === true && recorded(order.beforeEvidenceCount) && (inspection ? approved : order.pricingMode === 'fixed_price') },
    { id: 'repair', label: 'Sửa chữa', done: requested || completed },
    { id: 'after-evidence', label: 'Ảnh sau & bàn giao', done: recorded(order.afterEvidenceCount) && (requested || completed) },
    { id: 'waiting-acceptance', label: 'Nghiệm thu & thanh toán', done: completed },
    { id: 'completed-summary', label: 'Hoàn thành', done: completed },
  ];
  return { current, steps };
}
