import type { CreateSupportCasePayload, SupportCaseType } from '../../../api/support-cases.api';
import type { WarrantyClaimView, WarrantyCoverageItem } from '../../../api/orders.api';
import { allowedCustomerComplaintTypes } from '../../../screens/customer/customer-support-cases';
import { validateWarrantyText } from '../../../screens/customer/customer-warranty';
export const PRIVATE_ATTACHMENT_NOTICE = 'Đính kèm ảnh đang chờ hỗ trợ lưu trữ riêng tư.';
export const uuid4 = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
export const deniedRead = (error: unknown) => [401, 403, 404].includes(Number((error as { response?: { status?: number } })?.response?.status));
export function record(value: unknown, fields?: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Dữ liệu chưa xác định.');
  const row = value as Record<string, unknown>;
  if (fields && Object.keys(row).some(k => !fields.includes(k))) throw Error('Thông tin gửi chưa hợp lệ.');
  return row;
}
export function boundedText(value: unknown, min: number, max: number) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) throw Error('Hãy kiểm tra nội dung đã nhập.');
  return value.trim();
}
export function warrantyText(value: unknown) {
  if (typeof value !== 'string' || validateWarrantyText(value)) throw Error('Nội dung cần từ 10 đến 2.000 ký tự.');
  return value.trim();
}
export function existingRefs(value: unknown, authorized: readonly string[], max = 10): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > max) throw Error(PRIVATE_ATTACHMENT_NOTICE);
  const refs = value.map(v => boundedText(v, 1, 512));
  if (new Set(refs).size !== refs.length || refs.some(ref => /^(file|content|data|blob):/i.test(ref) || !authorized.includes(ref))) throw Error(PRIVATE_ATTACHMENT_NOTICE);
  return refs;
}
export function allowedSupportTypes(role: string, phase: string): SupportCaseType[] {
  if (role === 'customer') return phase === 'no_order' ? ['matching_exhausted', 'other'] : allowedCustomerComplaintTypes(phase);
  if (role !== 'technician') return [];
  const table: Record<string, SupportCaseType[]> = {
    ACCEPTED: ['arrival_abnormal', 'conduct', 'other'], EN_ROUTE: ['arrival_abnormal', 'technician_replacement', 'conduct', 'other'],
    UNDER_REPAIR: ['mid_job_interruption', 'parts_dispute', 'pricing_dispute', 'property_damage', 'technician_replacement', 'conduct', 'other'],
    COMPLETED: ['cash_mismatch', 'conduct', 'other'], CANCELLED: ['cancellation_review', 'other'],
  };
  return table[phase] ?? [];
}
export function supportPayload(value: unknown, refs: readonly string[]): CreateSupportCasePayload {
  const r = record(value, ['caseType', 'reason', 'description', 'evidenceRefs', 'bookingId', 'serviceOrderId', 'isUrgent']);
  const all = new Set(['matching_exhausted', ...allowedSupportTypes('customer', 'ACCEPTED'), ...allowedSupportTypes('customer', 'UNDER_REPAIR'), ...allowedSupportTypes('customer', 'COMPLETED'), 'technician_replacement']);
  if (!all.has(String(r.caseType)) || (!r.bookingId && !r.serviceOrderId)
    || (r.bookingId !== undefined && !uuid4(r.bookingId)) || (r.serviceOrderId !== undefined && !uuid4(r.serviceOrderId))
    || (r.isUrgent !== undefined && typeof r.isUrgent !== 'boolean')) throw Error('Ngữ cảnh hỗ trợ chưa hợp lệ.');
  const description = r.description === undefined ? undefined : typeof r.description === 'string' && !r.description.trim() ? undefined : boundedText(r.description, 1, 5000);
  const evidenceRefs = existingRefs(r.evidenceRefs, refs, 20);
  return { caseType: r.caseType as SupportCaseType, reason: boundedText(r.reason, 1, 2000), ...(description ? { description } : {}),
    ...(r.bookingId ? { bookingId: r.bookingId as string } : {}), ...(r.serviceOrderId ? { serviceOrderId: r.serviceOrderId as string } : {}),
    ...(r.isUrgent === undefined ? {} : { isUrgent: r.isUrgent as boolean }), ...(evidenceRefs ? { evidenceRefs } : {}) };
}
export interface ReviewDto { rating: number; comment?: string }
export interface AftercareReview { id: string; serviceOrderId: string; customerId: string; rating: number; comment: string | null; createdAt: string }
export function reviewPayload(value: unknown): ReviewDto {
  const r = record(value, ['rating', 'comment']);
  if (typeof r.rating !== 'number' || !Number.isInteger(r.rating) || r.rating < 1 || r.rating > 5
    || (r.comment !== undefined && (typeof r.comment !== 'string' || r.comment.length > 2000))) throw Error('Hãy chọn mức đánh giá từ 1 đến 5.');
  return { rating: r.rating, ...(r.comment === undefined ? {} : { comment: r.comment as string }) };
}
export function normalizeReview(value: unknown, orderId: string, customerId: string): AftercareReview | null {
  if (value === null) return null;
  const r = record(value), dto = reviewPayload({ rating: r.rating, ...(r.comment == null ? {} : { comment: r.comment }) });
  if (!uuid4(r.id) || r.serviceOrderId !== orderId || r.customerId !== customerId || !validTimestamp(r.createdAt)) throw Error('Đánh giá chưa xác định.');
  return { id: r.id, serviceOrderId: orderId, customerId, rating: dto.rating, comment: dto.comment ?? null, createdAt: r.createdAt };
}
export interface ClaimDto { warrantyCoverageId: string; description: string; evidenceRefs?: string[] }
export interface ResponseDto { decision: 'agree' | 'dispute'; note?: string }
export function claimPayload(value: unknown, refs: readonly string[]): ClaimDto {
  const r = record(value, ['warrantyCoverageId', 'description', 'evidenceRefs']); if (!uuid4(r.warrantyCoverageId)) throw Error('Hạng mục bảo hành chưa hợp lệ.');
  const evidenceRefs = existingRefs(r.evidenceRefs, refs);
  return { warrantyCoverageId: r.warrantyCoverageId, description: warrantyText(r.description), ...(evidenceRefs ? { evidenceRefs } : {}) };
}
export function responsePayload(value: unknown): ResponseDto {
  const r = record(value, ['decision', 'note']); if (r.decision !== 'agree' && r.decision !== 'dispute') throw Error('Phản hồi chưa hợp lệ.');
  const note = r.decision === 'dispute' || r.note !== undefined ? warrantyText(r.note) : undefined;
  return { decision: r.decision, ...(note === undefined ? {} : { note }) };
}
export const claimStatuses = ['submitted', 'accepted', 'inspected', 'in_progress', 'awaiting_customer', 'disputed', 'resolved', 'rejected'] as const;
export const validTimestamp = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
function nullableText(v: unknown): string | null { if (v === null) return null; if (typeof v !== 'string') throw Error('Dữ liệu chưa xác định.'); return v; }
export function normalizeClaim(value: unknown, orderId?: string): WarrantyClaimView {
  const r = record(value);
  if (!uuid4(r.id) || !uuid4(r.serviceOrderId) || !uuid4(r.warrantyCoverageId) || (orderId && r.serviceOrderId !== orderId)
    || !claimStatuses.includes(r.status as never) || typeof r.submittedAfterExpiry !== 'boolean' || !validTimestamp(r.submittedAt)
    || (r.resolvedAt !== null && !validTimestamp(r.resolvedAt)) || ![null, 'agreed', 'disputed'].includes(r.customerResponse as never)
    || ![null, 'conclusion', 'completion'].includes(r.awaitingPrompt as never)) throw Error('Yêu cầu bảo hành chưa xác định.');
  const evidenceRefs = r.evidenceRefs === null ? null : existingRefs(r.evidenceRefs, Array.isArray(r.evidenceRefs) ? r.evidenceRefs : []);
  if (evidenceRefs === undefined) throw Error('Bằng chứng chưa xác định.');
  const tech = r.technician === null ? null : record(r.technician);
  if (tech && (!uuid4(tech.id) || typeof tech.fullName !== 'string')) throw Error('Phân công chưa xác định.');
  return { id: r.id, serviceOrderId: r.serviceOrderId, warrantyCoverageId: r.warrantyCoverageId, status: r.status as string,
    description: warrantyText(r.description), evidenceRefs, submittedAfterExpiry: r.submittedAfterExpiry,
    customerResponse: r.customerResponse as 'agreed' | 'disputed' | null, awaitingPrompt: r.awaitingPrompt as 'conclusion' | 'completion' | null,
    resolutionNotes: nullableText(r.resolutionNotes), submittedAt: r.submittedAt, resolvedAt: r.resolvedAt as string | null,
    technician: tech ? { id: tech.id as string, fullName: tech.fullName as string } : null };
}
export function normalizeCoverage(value: unknown, orderId: string): WarrantyCoverageItem {
  const r = record(value);
  if (!uuid4(r.id) || r.serviceOrderId !== orderId || !['pending', 'active', 'expired', 'voided'].includes(String(r.status))
    || !validTimestamp(r.startsAt) || !validTimestamp(r.expiresAt) || typeof r.warrantyDaysSnapshot !== 'number' || !Number.isSafeInteger(r.warrantyDaysSnapshot) || r.warrantyDaysSnapshot < 0) throw Error('Hạng mục bảo hành chưa xác định.');
  return { id: r.id, serviceOrderId: orderId, warrantyDaysSnapshot: r.warrantyDaysSnapshot, startsAt: r.startsAt, expiresAt: r.expiresAt, status: r.status as string,
    ...(r.note === undefined ? {} : { note: nullableText(r.note) }), ...(r.invoiceItemId === undefined ? {} : { invoiceItemId: nullableText(r.invoiceItemId) }) };
}
export type WarrantyCommand = 'accept' | 'decline' | 'check-in' | 'propose' | 'complete';
export type InspectionResult = 'covered_workmanship' | 'covered_part' | 'not_covered';
export interface WarrantyCommandDto { scheduledAt?: string; reasonCode?: 'busy' | 'on_leave' | 'out_of_area' | 'other'; note?: string; lat?: number; lng?: number; result?: InspectionResult; findings?: string; notCoveredReasonCode?: string; evidenceRefs?: string[]; notes?: string }
export function warrantyCommandPayload(op: WarrantyCommand, value: unknown, refs: readonly string[]): WarrantyCommandDto {
  const fields = { accept: ['scheduledAt'], decline: ['reasonCode', 'note'], 'check-in': ['lat', 'lng'], propose: ['result', 'findings', 'notCoveredReasonCode', 'evidenceRefs'], complete: ['notes', 'evidenceRefs'] };
  if (!Object.prototype.hasOwnProperty.call(fields, op)) throw Error('Thao tác bảo hành chưa hợp lệ.');
  const r = record(value, fields[op]);
  if (op === 'accept') { if (r.scheduledAt !== undefined && !validTimestamp(r.scheduledAt)) throw Error('Lịch kiểm tra chưa hợp lệ.'); return r.scheduledAt === undefined ? {} : { scheduledAt: r.scheduledAt as string }; }
  if (op === 'decline') {
    if (!['busy', 'on_leave', 'out_of_area', 'other'].includes(String(r.reasonCode))) throw Error('Lý do chưa hợp lệ.');
    const note = r.reasonCode === 'other' || r.note !== undefined ? warrantyText(r.note) : undefined;
    return { reasonCode: r.reasonCode as WarrantyCommandDto['reasonCode'], ...(note === undefined ? {} : { note }) };
  }
  if (op === 'check-in') {
    for (const [key, bound] of [['lat', 90], ['lng', 180]] as const) if (r[key] !== undefined && (typeof r[key] !== 'number' || !Number.isFinite(r[key]) || Math.abs(r[key] as number) > bound)) throw Error('Vị trí chưa hợp lệ.');
    return { ...(r.lat === undefined ? {} : { lat: r.lat as number }), ...(r.lng === undefined ? {} : { lng: r.lng as number }) };
  }
  const evidenceRefs = existingRefs(r.evidenceRefs, refs);
  if (op === 'complete') return { notes: warrantyText(r.notes), ...(evidenceRefs ? { evidenceRefs } : {}) };
  if (!['covered_workmanship', 'covered_part', 'not_covered'].includes(String(r.result))) throw Error('Kết luận chưa hợp lệ.');
  const reasons = ['customer_misuse', 'normal_wear', 'other_component', 'not_workmanship_related', 'expired', 'cannot_reproduce', 'customer_unavailable', 'other'];
  if ((r.notCoveredReasonCode !== undefined && !reasons.includes(String(r.notCoveredReasonCode))) || (r.result === 'not_covered' && (!r.notCoveredReasonCode || !evidenceRefs?.length))) throw Error(PRIVATE_ATTACHMENT_NOTICE);
  return { result: r.result as InspectionResult, findings: warrantyText(r.findings), ...(r.result === 'not_covered' ? { notCoveredReasonCode: r.notCoveredReasonCode as string } : {}), ...(evidenceRefs ? { evidenceRefs } : {}) };
}
