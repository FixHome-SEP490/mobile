// Pure rules of the "Báo cáo vấn đề sửa chữa" screen (web CannotContinueDialog). Wording is web's.
import type { ContactReadiness, StopReasonClass, StopReasonCode, StopScope } from '../../../api/cannot-continue.api';
import { isCustomerNoShow } from '../../../api/cannot-continue.api';
import type { TechnicianReportReasonCode } from './technician-report';
import type { VisitDeviceState } from '../../../api/visit-groups.api';

/** `stop`: the work on the device ends. `support`: ask the manager for help, the work goes on. */
export type StopMode = 'stop' | 'support';

export type FormReasonCode = StopReasonCode | 'customer_cancelled';
export const FORM_REASONS: { code: FormReasonCode; label: string }[] = [
  { code: 'skill_gap', label: 'Thiếu kỹ năng hoặc thao tác chưa đúng' },
  { code: 'device_too_old', label: 'Thiết bị đã quá cũ' },
  { code: 'severe_damage', label: 'Thiết bị hư hỏng nặng' },
  { code: 'no_compatible_part', label: 'Không có linh kiện phù hợp' },
  { code: 'manufacturer_warranty_or_workshop', label: 'Cần trung tâm hoặc bảo hành hãng' },
  { code: 'dispute_or_other', label: 'Tranh chấp hoặc tình huống khác' },
  { code: 'customer_absent', label: 'Khách không có mặt' },
  { code: 'customer_unreachable', label: 'Không liên lạc được khách' },
  { code: 'customer_cancelled', label: 'Khách đề nghị hủy · chỉ báo quản lý' },
];

/** "Khách đề nghị hủy" can only be reported, never stops the work; "không liên lạc được" only stops. */
export function reasonsFor(mode: StopMode, isVisit: boolean): { code: FormReasonCode; label: string }[] {
  return FORM_REASONS
    .filter((r) => (mode === 'stop' ? r.code !== 'customer_cancelled' : r.code !== 'customer_unreachable'))
    .map((r) => (isVisit && mode === 'stop' && isCustomerNoShow(r.code as StopReasonCode) ? { ...r, label: `${r.label} · cả lượt` } : r));
}

const CUSTOMER_REASONS: FormReasonCode[] = ['customer_absent', 'customer_unreachable', 'customer_cancelled'];

/** The same reasons grouped for the list: what is wrong with the work, and what is up with the customer. `wholeVisit` = stops every device of the visit. */
export function reasonGroups(mode: StopMode, isVisit: boolean): { title: string; items: { code: FormReasonCode; label: string; wholeVisit: boolean }[] }[] {
  const items = reasonsFor(mode, isVisit).map((r) => ({
    code: r.code,
    label: FORM_REASONS.find((f) => f.code === r.code)!.label,
    wholeVisit: isVisit && mode === 'stop' && isCustomerNoShow(r.code as StopReasonCode),
  }));
  return [
    { title: 'Về công việc', items: items.filter((r) => !CUSTOMER_REASONS.includes(r.code)) },
    { title: 'Về khách hàng', items: items.filter((r) => CUSTOMER_REASONS.includes(r.code)) },
  ];
}

export const reasonClassOf = (code: FormReasonCode): StopReasonClass => (code === 'skill_gap' ? 'technician_skill_gap' : 'non_technician_exception');

/** A customer who is not there ends the whole visit when the order is part of one, else just this order. */
export function stopScopeFor(order: { id: string; visitGroupId?: string | null }, code: FormReasonCode | null): StopScope {
  return order.visitGroupId && code && isCustomerNoShow(code as StopReasonCode)
    ? { kind: 'group', groupId: order.visitGroupId, orderId: order.id }
    : { kind: 'order', orderId: order.id };
}

/** Backend only takes a private ADDITIONAL photo while the order is under repair. */
export const canAttachStopPhotos = (status: string): boolean => String(status).toUpperCase() === 'UNDER_REPAIR';

export const STOP_PHOTO_MAX = 3;
export const STOP_REASON_MIN = 10;
export const STOP_REASON_MAX = 2000;

export const NO_SHOW_RULE = 'Cần check-in, ít nhất 2 cuộc gọi cách nhau 5 phút, 1 thông báo trong ứng dụng và đợi 10 phút sau cuộc gọi đầu.';

export function deviceDisposition(state: VisitDeviceState | undefined, isThis: boolean): string {
  if (state === undefined) return 'Chưa xác minh trạng thái';
  return state === 'open' || isThis ? 'Dự kiến dừng' : 'Giữ nguyên kết quả';
}

/** Why the form cannot be sent yet, or null. `devicesKnown` matters only for a whole-visit stop. */
export function stopFormProblem(input: {
  mode: StopMode;
  code: FormReasonCode | null;
  reason: string;
  confirmed: boolean;
  scope: StopScope;
  readiness: ContactReadiness | null;
  devicesKnown: boolean;
}): string | null {
  if (!input.code) return 'Chọn lý do.';
  const length = input.reason.trim().length;
  if (length < STOP_REASON_MIN) return `Mô tả ít nhất ${STOP_REASON_MIN} ký tự.`;
  if (length > STOP_REASON_MAX) return 'Mô tả tối đa 2.000 ký tự.';
  if (input.mode === 'support') return null;
  if (isCustomerNoShow(input.code as StopReasonCode)) {
    if (input.scope.kind === 'group' && !input.devicesKnown) return 'Chưa xác minh được các máy trong lượt. Tải lại rồi thử lại.';
    if (!input.readiness?.ready) return 'Chưa đủ điều kiện liên hệ khách. Gọi và gửi thông báo theo hướng dẫn rồi kiểm tra lại.';
  }
  if (!input.confirmed) return 'Cần xác nhận trước khi gửi.';
  return null;
}

export function readinessSummary(r: ContactReadiness | null): string {
  if (!r) return 'Chưa kiểm tra điều kiện liên hệ.';
  return `${r.contactCount} cuộc gọi đã ghi nhận · ${r.notificationSent ? 'đã gửi thông báo' : 'chưa gửi thông báo'} · ${r.callsSpaced ? 'đủ giãn cách' : 'chưa đủ giãn cách giữa các cuộc gọi'}`;
}

export const submitLabel = (mode: StopMode, scope: StopScope, busy: boolean, retry: boolean): string => {
  if (busy) return 'Đang gửi…';
  if (retry) return 'Thử lại cùng nội dung';
  if (mode === 'support') return 'Gửi báo cáo hỗ trợ';
  return scope.kind === 'group' ? 'Xác nhận dừng cả lượt' : 'Xác nhận không thể tiếp tục';
};

export const confirmText = (mode: StopMode, scope: StopScope): string =>
  mode === 'support' ? 'Tôi xác nhận chỉ gửi báo cáo, công việc vẫn tiếp tục.'
    : scope.kind === 'group' ? 'Tôi xác nhận dừng cả lượt, không chỉ yêu cầu hỗ trợ.'
      : 'Tôi xác nhận không thể tiếp tục, không chỉ yêu cầu hỗ trợ.';

export function isSupportCode(code: FormReasonCode): code is TechnicianReportReasonCode { return code !== 'customer_unreachable'; }
