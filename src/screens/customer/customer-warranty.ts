import type {
  RepairHistoryItem,
  ServiceOrderItem,
  WarrantyClaimView,
  WarrantyCoverageItem,
} from '../../api/orders.api';

export type WarrantyCoverageUiStatus = 'ACTIVE' | 'EXPIRED' | 'VOIDED' | 'UNKNOWN';
export type WarrantyClaimTone = 'info' | 'warning' | 'repair' | 'success' | 'neutral';

export interface CustomerWarrantyGroup {
  orderId: string;
  orderCode: string;
  serviceName: string;
  technicianName: string;
  completedAt?: string;
  coverages: WarrantyCoverageItem[];
  claims: WarrantyClaimView[];
}

const CLOSED_CLAIM_STATUSES = new Set(['resolved', 'rejected']);

export const WARRANTY_CLAIM_MIN_TEXT_LENGTH = 10;
export const WARRANTY_CLAIM_MAX_TEXT_LENGTH = 2000;

export function isOpenWarrantyClaim(status: string): boolean {
  return !CLOSED_CLAIM_STATUSES.has(String(status).toLowerCase());
}

export function busyWarrantyCoverageIds(claims: WarrantyClaimView[]): string[] {
  return [...new Set(
    (claims ?? [])
      .filter((claim) => isOpenWarrantyClaim(claim.status))
      .map((claim) => claim.warrantyCoverageId),
  )];
}

export function warrantyCoverageUiStatus(
  coverage: WarrantyCoverageItem,
  nowMs = Date.now(),
): WarrantyCoverageUiStatus {
  const raw = String(coverage.status ?? '').toUpperCase();
  if (raw === 'VOIDED') return 'VOIDED';
  const expiry = new Date(coverage.expiresAt).getTime();
  if (!Number.isFinite(expiry)) return raw === 'ACTIVE' ? 'UNKNOWN' : (raw === 'EXPIRED' ? 'EXPIRED' : 'UNKNOWN');
  if (raw === 'ACTIVE' && expiry > nowMs) return 'ACTIVE';
  if (raw === 'EXPIRED' || expiry <= nowMs) return 'EXPIRED';
  return 'UNKNOWN';
}

export function isWarrantyCoverageClaimable(
  coverage: WarrantyCoverageItem,
  claims: WarrantyClaimView[],
): boolean {
  const status = warrantyCoverageUiStatus(coverage);
  if (status === 'VOIDED' || status === 'UNKNOWN') return false;
  return !busyWarrantyCoverageIds(claims).includes(coverage.id);
}

export function warrantyCoverageLabel(coverage: WarrantyCoverageItem): string {
  return coverage.note?.trim() || 'Bảo hành dịch vụ';
}

export function warrantyClaimDisplayMeta(claim: WarrantyClaimView): {
  label: string;
  tone: WarrantyClaimTone;
} {
  if (claim.status === 'awaiting_customer' && claim.customerResponse === 'agreed') {
    return { label: 'Đã đồng ý, chờ quản lý dịch vụ đóng', tone: 'info' };
  }
  const table: Record<string, { label: string; tone: WarrantyClaimTone }> = {
    submitted: { label: 'Đã gửi yêu cầu', tone: 'info' },
    accepted: { label: 'Kỹ thuật viên đã nhận', tone: 'info' },
    inspected: { label: 'Chờ quản lý dịch vụ duyệt', tone: 'warning' },
    in_progress: { label: 'Đang bảo hành', tone: 'repair' },
    awaiting_customer: { label: 'Chờ bạn phản hồi', tone: 'warning' },
    disputed: { label: 'Đang xem xét phản đối', tone: 'info' },
    resolved: { label: 'Đã hoàn tất bảo hành', tone: 'success' },
    rejected: { label: 'Không được bảo hành', tone: 'neutral' },
  };
  return table[String(claim.status).toLowerCase()] ?? {
    label: 'Trạng thái chưa xác định',
    tone: 'neutral',
  };
}

export function warrantyCustomerPromptCopy(claim: WarrantyClaimView): {
  question: string;
  agree: string;
  dispute: string;
  reason: string;
  agreed: string;
} {
  if (claim.awaitingPrompt === 'completion') {
    return {
      question: 'Kỹ thuật viên báo đã xử lý xong. Lỗi đã được khắc phục chưa?',
      agree: 'Đã khắc phục',
      dispute: 'Vẫn còn lỗi',
      reason: 'Mô tả lỗi vẫn còn',
      agreed: 'Bạn đã xác nhận đã khắc phục. Quản lý dịch vụ sẽ xác nhận và đóng yêu cầu.',
    };
  }
  return {
    question: 'Bạn có đồng ý với kết luận bảo hành không?',
    agree: 'Đồng ý',
    dispute: 'Không đồng ý',
    reason: 'Lý do bạn không đồng ý',
    agreed: 'Bạn đã đồng ý với kết luận. Quản lý dịch vụ sẽ xác nhận và đóng yêu cầu.',
  };
}

export function validateWarrantyText(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length < WARRANTY_CLAIM_MIN_TEXT_LENGTH) {
    return `Vui lòng nhập ít nhất ${WARRANTY_CLAIM_MIN_TEXT_LENGTH} ký tự.`;
  }
  if (trimmed.length > WARRANTY_CLAIM_MAX_TEXT_LENGTH) {
    return `Nội dung tối đa ${WARRANTY_CLAIM_MAX_TEXT_LENGTH} ký tự.`;
  }
  return null;
}

export function formatWarrantyDate(value?: string | null): string {
  if (!value) return 'Chưa xác định';
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return 'Chưa xác định';
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(parsed);
}

export function historyToWarrantyGroupSeed(row: RepairHistoryItem): Omit<CustomerWarrantyGroup, 'coverages' | 'claims'> {
  return {
    orderId: row.orderId,
    orderCode: row.code,
    serviceName: row.serviceName || 'Dịch vụ sửa chữa',
    technicianName: row.technicianName || 'Kỹ thuật viên FixHome',
    completedAt: row.completedAt,
  };
}

export function orderToWarrantyGroupSeed(order: ServiceOrderItem): Omit<CustomerWarrantyGroup, 'coverages' | 'claims'> {
  return {
    orderId: order.id,
    orderCode: order.code,
    serviceName: order.serviceName || 'Dịch vụ sửa chữa',
    technicianName: order.technician?.fullName || 'Kỹ thuật viên FixHome',
    completedAt: undefined,
  };
}
