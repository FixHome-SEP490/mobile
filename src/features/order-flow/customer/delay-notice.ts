import type { DelayDecision, DelayReasonCode, ServiceOrderItem } from '../../../api/orders.api';
import { extractApiErrorMessage } from '../../../utils/input-validation';

/** PO 31/10/2026: the technician still on another job told the customer this order will start late. */
const REASON_TEXT: Record<DelayReasonCode, string> = {
  new_fault_found: 'phát sinh lỗi thêm',
  waiting_parts: 'chờ linh kiện',
  repair_longer: 'sửa lâu hơn dự kiến',
  other: 'lý do khác',
};

export function delayReasonText(code: DelayReasonCode | null | undefined): string {
  return (code && REASON_TEXT[code]) || REASON_TEXT.other;
}

export type DelayNoticeState =
  | { kind: 'ask'; minutes: number; reason: string }
  | { kind: 'waiting'; minutes: number }
  | null;

/**
 * What the customer sees for an order the technician reported late. Only an order still waiting for the
 * technician can be answered; once the customer answered "wait" it shows as a reminder, and any other
 * answer already changed the order itself.
 */
export function delayNoticeState(order: Pick<ServiceOrderItem, 'status' | 'delayNotice'>): DelayNoticeState {
  const notice = order.delayNotice;
  if (!notice || !['ACCEPTED', 'EN_ROUTE'].includes(String(order.status))) return null;
  if (notice.decision === null) return { kind: 'ask', minutes: notice.minutes, reason: delayReasonText(notice.reasonCode) };
  return notice.decision === 'wait' ? { kind: 'waiting', minutes: notice.minutes } : null;
}

export const DELAY_CHOICES: { decision: DelayDecision; label: string; confirmTitle: string; confirmText: string | null }[] = [
  { decision: 'wait', label: 'Đợi thêm', confirmTitle: '', confirmText: null },
  {
    decision: 'switch',
    label: 'Chọn kỹ thuật viên khác',
    confirmTitle: 'Chọn kỹ thuật viên khác?',
    confirmText: 'Kỹ thuật viên hiện tại sẽ rời đơn này. Dịch vụ, giá và lịch hẹn giữ nguyên, bạn chọn người khác ngay sau đó.',
  },
  {
    decision: 'cancel',
    label: 'Hủy đơn, không mất phí',
    confirmTitle: 'Hủy đơn này?',
    confirmText: 'Đơn bị hủy, bạn không mất phí và không bị trừ điểm uy tín.',
  },
];

export const delayDecisionError = (err: unknown): string => extractApiErrorMessage(err, 'Chưa gửi được lựa chọn. Vui lòng thử lại.');
