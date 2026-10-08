import type {
  MySupportCase,
  SupportCaseStatus,
  SupportCaseType,
} from '../../api/support-cases.api';

export const SUPPORT_CASE_REASON_MIN_LENGTH = 10;
export const SUPPORT_CASE_REASON_MAX_LENGTH = 2000;
export const SUPPORT_CASE_POST_COMPLETION_WINDOW_DAYS = 7;

export const supportCaseStatusLabels: Record<SupportCaseStatus, string> = {
  open: 'Đã gửi',
  in_review: 'Đang được xem xét',
  resolved: 'Đã giải quyết',
  rejected: 'Đã từ chối',
};

export const complaintTypeLabels: Record<SupportCaseType, string> = {
  matching_exhausted: 'Không tìm được kỹ thuật viên',
  arrival_abnormal: 'Kỹ thuật viên không đến hoặc đến trễ',
  cash_non_response: 'Không phản hồi xác nhận tiền mặt',
  cash_mismatch: 'Số tiền mặt không khớp',
  cancellation_review: 'Tranh chấp về việc hủy đơn',
  parts_dispute: 'Tranh chấp về linh kiện',
  warranty_dispute: 'Tranh chấp bảo hành',
  mid_job_interruption: 'Công việc bị gián đoạn giữa chừng',
  property_damage: 'Hư hại hoặc mất tài sản',
  quality: 'Chất lượng sửa chữa chưa đạt',
  pricing_dispute: 'Tranh chấp về chi phí',
  conduct: 'Thái độ hoặc hành vi của kỹ thuật viên',
  other: 'Vấn đề khác',
  technician_replacement: 'Cần thay đổi thợ (ngoài kỹ năng)',
};

const CUSTOMER_TYPES: Record<string, SupportCaseType[]> = {
  ACCEPTED: ['arrival_abnormal', 'cancellation_review', 'conduct', 'other'],
  EN_ROUTE: ['arrival_abnormal', 'cancellation_review', 'conduct', 'other'],
  UNDER_REPAIR: [
    'mid_job_interruption',
    'parts_dispute',
    'pricing_dispute',
    'property_damage',
    'quality',
    'conduct',
    'other',
  ],
  COMPLETED: [
    'quality',
    'property_damage',
    'pricing_dispute',
    'parts_dispute',
    'cash_mismatch',
    'conduct',
    'other',
  ],
  CANCELLED: ['cancellation_review', 'other'],
};

export const ACTIVE_COMPLAINT_STATUSES = ['ACCEPTED', 'EN_ROUTE', 'UNDER_REPAIR'] as const;

export function complaintTypeLabel(type: SupportCaseType): string {
  return complaintTypeLabels[type] ?? 'Vấn đề khác';
}

export function isComplaintWindowOpen(
  orderStatus: string,
  completedAt?: string | null,
  now = new Date(),
): boolean {
  const status = String(orderStatus).toUpperCase();
  if (status !== 'COMPLETED' || !completedAt) return true;
  const completed = new Date(completedAt).getTime();
  if (!Number.isFinite(completed)) return true;
  return now.getTime() - completed <= SUPPORT_CASE_POST_COMPLETION_WINDOW_DAYS * 86_400_000;
}

export function allowedCustomerComplaintTypes(
  orderStatus: string,
  completedAt?: string | null,
  now = new Date(),
): SupportCaseType[] {
  const status = String(orderStatus).toUpperCase();
  if (!isComplaintWindowOpen(status, completedAt, now)) return [];
  return CUSTOMER_TYPES[status] ?? [];
}

export function canMarkComplaintUrgent(orderStatus: string): boolean {
  return ACTIVE_COMPLAINT_STATUSES.includes(
    String(orderStatus).toUpperCase() as (typeof ACTIVE_COMPLAINT_STATUSES)[number],
  );
}

export function isOpenSupportCase(item: MySupportCase): boolean {
  return item.status === 'open' || item.status === 'in_review';
}

export function validateSupportCaseReason(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length < SUPPORT_CASE_REASON_MIN_LENGTH) {
    return `Vui lòng mô tả vấn đề ít nhất ${SUPPORT_CASE_REASON_MIN_LENGTH} ký tự.`;
  }
  if (trimmed.length > SUPPORT_CASE_REASON_MAX_LENGTH) {
    return `Mô tả vấn đề tối đa ${SUPPORT_CASE_REASON_MAX_LENGTH} ký tự.`;
  }
  return null;
}

export function formatSupportCaseDateTime(value?: string | null): string {
  if (!value) return 'Chưa xác định';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Chưa xác định';
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
