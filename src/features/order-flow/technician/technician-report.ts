// Typed technician report (BE POST /support/cases/technician-report, REPORT_ONLY):
// a manager reviews it; it never stops, cancels or scores the order.
export type TechnicianReportReasonCode =
  | 'skill_gap' | 'device_too_old' | 'severe_damage' | 'no_compatible_part'
  | 'manufacturer_warranty_or_workshop' | 'customer_absent' | 'customer_cancelled' | 'dispute_or_other';

export const technicianReportReasons: { code: TechnicianReportReasonCode; label: string }[] = [
  { code: 'skill_gap', label: 'Không đủ khả năng sửa' },
  { code: 'device_too_old', label: 'Thiết bị đã quá cũ' },
  { code: 'severe_damage', label: 'Thiết bị hư hỏng nặng' },
  { code: 'no_compatible_part', label: 'Không có linh kiện phù hợp' },
  { code: 'manufacturer_warranty_or_workshop', label: 'Cần trung tâm hoặc bảo hành hãng' },
  { code: 'customer_absent', label: 'Khách không có mặt' },
  { code: 'customer_cancelled', label: 'Khách đã hủy' },
  { code: 'dispute_or_other', label: 'Tranh chấp hoặc tình huống khác' },
];

export function technicianReportProblem(code: TechnicianReportReasonCode | null, reason: string): string | null {
  if (!code) return 'Chọn nguyên nhân.';
  const length = reason.trim().length;
  if (length < 10) return 'Mô tả ít nhất 10 ký tự.';
  if (length > 2000) return 'Mô tả tối đa 2.000 ký tự.';
  return null;
}

export function technicianReportBody(serviceOrderId: string, code: TechnicianReportReasonCode, reason: string) {
  return {
    intent: 'REPORT_ONLY' as const,
    serviceOrderId,
    reasonClass: code === 'skill_gap' ? 'technician_skill_gap' as const : 'non_technician_exception' as const,
    reasonCode: code,
    reason: reason.trim(),
  };
}

/** Same gate as web: on site (arrival verified) while EN_ROUTE or UNDER_REPAIR, completion not yet requested. */
export function canReportTechnicianIssue(order: { status: string; arrivalVerified?: boolean | null; completionRequestedAt?: string | null; historical?: boolean | null }): boolean {
  const status = String(order.status).toUpperCase();
  return order.historical !== true && order.arrivalVerified === true && !order.completionRequestedAt
    && (status === 'EN_ROUTE' || status === 'UNDER_REPAIR');
}
