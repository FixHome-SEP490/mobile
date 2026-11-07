import apiClient from './client';
import type { WarrantyClaimView } from './orders.api';
import { claimStatuses, existingRefs, normalizeClaim, record, uuid4, validTimestamp, warrantyCommandPayload, type WarrantyCommand } from '../features/order-flow/aftercare/aftercare-contracts';

export type TechnicianWarrantyClaimStatus =
  | 'submitted'
  | 'accepted'
  | 'inspected'
  | 'in_progress'
  | 'awaiting_customer'
  | 'disputed'
  | 'resolved'
  | 'rejected';

export type TechnicianWarrantyVisitStatus =
  | 'scheduled'
  | 'checked_in'
  | 'inspected'
  | 'completed'
  | 'cancelled';

export interface TechnicianWarrantyOverview {
  id: string;
  status: TechnicianWarrantyClaimStatus;
  submittedAt: string;
  orderCode: string;
  serviceName: string;
  coverageItemDescription: string | null;
  coverageExpiresAt: string | null;
  visitStatus: TechnicianWarrantyVisitStatus | null;
  scheduledAt: string | null;
}

const CLAIM_STATUSES = new Set<TechnicianWarrantyClaimStatus>([
  'submitted',
  'accepted',
  'inspected',
  'in_progress',
  'awaiting_customer',
  'disputed',
  'resolved',
  'rejected',
]);

const VISIT_STATUSES = new Set<TechnicianWarrantyVisitStatus>([
  'scheduled',
  'checked_in',
  'inspected',
  'completed',
  'cancelled',
]);

const LIST_ERROR = 'Không thể tải danh sách bảo hành. Vui lòng thử lại.';
const STATUS_ERROR = 'Trạng thái bảo hành không hợp lệ.';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asId(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(LIST_ERROR);
  }
  return value;
}

function asDateString(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || Number.isNaN(Date.parse(value))) {
    throw new Error(LIST_ERROR);
  }
  return value;
}

function asNullableDateString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || !value.trim() || Number.isNaN(Date.parse(value))) {
    throw new Error(LIST_ERROR);
  }
  return value;
}

function asOrderText(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error(LIST_ERROR);
  }
  return value;
}

function asNullableText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') {
    throw new Error(LIST_ERROR);
  }
  return value;
}

function normalizeCoverage(value: unknown): Pick<
  TechnicianWarrantyOverview,
  'coverageItemDescription' | 'coverageExpiresAt'
> {
  if (value === null || value === undefined) {
    return { coverageItemDescription: null, coverageExpiresAt: null };
  }
  if (!isRecord(value)) {
    throw new Error(LIST_ERROR);
  }
  return {
    coverageItemDescription: asNullableText(value.itemDescription),
    coverageExpiresAt: asNullableDateString(value.expiresAt),
  };
}

function normalizeVisit(
  value: unknown,
): Pick<TechnicianWarrantyOverview, 'visitStatus' | 'scheduledAt'> {
  if (value === null || value === undefined) {
    return { visitStatus: null, scheduledAt: null };
  }
  if (!isRecord(value)) {
    throw new Error(LIST_ERROR);
  }
  const status = value.status;
  if (!VISIT_STATUSES.has(status as TechnicianWarrantyVisitStatus)) {
    throw new Error(LIST_ERROR);
  }
  return {
    visitStatus: status as TechnicianWarrantyVisitStatus,
    scheduledAt: asNullableDateString(value.scheduledAt),
  };
}

function normalizeOverview(row: unknown): TechnicianWarrantyOverview {
  if (!isRecord(row)) {
    throw new Error(LIST_ERROR);
  }
  const status = row.status;
  if (!CLAIM_STATUSES.has(status as TechnicianWarrantyClaimStatus)) {
    throw new Error(LIST_ERROR);
  }
  const order = row.order;
  if (!isRecord(order)) {
    throw new Error(LIST_ERROR);
  }
  const coverage = normalizeCoverage(row.coverage);
  const visit = normalizeVisit(row.visit);
  return {
    id: asId(row.id),
    status: status as TechnicianWarrantyClaimStatus,
    submittedAt: asDateString(row.submittedAt),
    orderCode: asOrderText(order.code),
    serviceName: asOrderText(order.serviceName),
    coverageItemDescription: coverage.coverageItemDescription,
    coverageExpiresAt: coverage.coverageExpiresAt,
    visitStatus: visit.visitStatus,
    scheduledAt: visit.scheduledAt,
  };
}

const assignedOverviewApi = {
  async listAssigned(status?: TechnicianWarrantyClaimStatus): Promise<TechnicianWarrantyOverview[]> {
    if (status !== undefined && !CLAIM_STATUSES.has(status)) {
      throw new Error(STATUS_ERROR);
    }
    const response =
      status === undefined
        ? await apiClient.get('/warranty-claims/mine')
        : await apiClient.get('/warranty-claims/mine', { params: { status } });
    const body: unknown = response?.data;
    if (!isRecord(body) || !Array.isArray(body.data)) {
      throw new Error(LIST_ERROR);
    }
    return body.data.map(normalizeOverview);
  },
};
export interface WarrantyVisit {
  id: string; status: 'scheduled' | 'checked_in' | 'inspected' | 'completed' | 'cancelled'; scheduledAt: string | null; checkedInAt: string | null;
  proposedResult: 'covered_workmanship' | 'covered_part' | 'not_covered' | null; notCoveredReasonCode: string | null; findings: string | null;
  evidenceRefs: string[] | null; reServiceNotes: string | null; reServiceEvidenceRefs: string[] | null; completedAt: string | null;
  /** Part lines of the original job the technician named as faulty (part fault only). */
  faultyInvoiceItemIds?: string[] | null;
  faultyQuantities?: Record<string, number> | null;
}
export interface TechnicianWarrantyClaim extends WarrantyClaimView {
  order: { id: string; code: string; serviceName: string; addressSummary: string; customerName: string; customerPhone: string; bookingId?: string; partLines?: { id: string; name: string; quantity: number; partSource: string | null }[] };
  coverage: { id: string; itemDescription: string; expiresAt: string } | null; visit: WarrantyVisit | null;
  /** Backend 04/11: how a closed claim ended, and what went back to the customer. Absent on an older Backend. */
  outcomeCode?: 'fixed' | 'unfixed' | 'rejected' | null; refundAmount?: number | null;
  declineReview?: 'pending' | 'valid' | 'invalid' | null; noShowFlaggedAt?: string | null;
  /** The free warranty part, and the deadline to bring the faulty one back to the warehouse. */
  partRequest?: { id: string; status: string; faultyReturnDueAt: string | null; faultyReturnedAt: string | null; faultyReturnChargedAt: string | null; faultyInspectionResult: 'manufacturer' | 'installation' | 'undetermined' | null; items?: { id: string; name: string; quantity: number; usageStatus: 'pending' | 'used' | 'returned' }[] } | null;
}
export interface WarrantyMinePage { data: TechnicianWarrantyClaim[]; meta: { page: number; pageSize: number; total: number } }
export interface WarrantyMineQuery { status?: string; page?: number; pageSize?: number }
export function normalizeTechnicianWarrantyClaim(value: unknown): TechnicianWarrantyClaim {
  const r = record(value), base = normalizeClaim(r), order = record(r.order);
  if (order.id !== base.serviceOrderId || ['code', 'serviceName', 'addressSummary', 'customerName', 'customerPhone'].some(k => typeof order[k] !== 'string')) throw Error('Thông tin bảo hành chưa xác định.');
  const c = r.coverage === null ? null : record(r.coverage), v = r.visit === null ? null : record(r.visit);
  if (c && (c.id !== base.warrantyCoverageId || typeof c.itemDescription !== 'string' || !validTimestamp(c.expiresAt))) throw Error('Hạng mục bảo hành chưa xác định.');
  let visit: WarrantyVisit | null = null;
  if (v) {
    if (!uuid4(v.id) || !['scheduled', 'checked_in', 'inspected', 'completed', 'cancelled'].includes(String(v.status))
      || ['scheduledAt', 'checkedInAt', 'completedAt'].some(k => v[k] !== null && !validTimestamp(v[k]))
      || ![null, 'covered_workmanship', 'covered_part', 'not_covered'].includes(v.proposedResult as never)
      || ['notCoveredReasonCode', 'findings', 'reServiceNotes'].some(k => v[k] !== null && (typeof v[k] !== 'string' || (v[k] as string).length > 2000))) throw Error('Lượt bảo hành chưa xác định.');
    const refs = (value: unknown) => value === null ? null : existingRefs(value, Array.isArray(value) ? value : []) ?? (() => { throw Error('Bằng chứng chưa xác định.'); })();
    visit = { id: v.id, status: v.status as WarrantyVisit['status'], scheduledAt: v.scheduledAt as string | null, checkedInAt: v.checkedInAt as string | null,
      proposedResult: v.proposedResult as WarrantyVisit['proposedResult'], notCoveredReasonCode: v.notCoveredReasonCode as string | null, findings: v.findings as string | null,
      evidenceRefs: refs(v.evidenceRefs), reServiceNotes: v.reServiceNotes as string | null, reServiceEvidenceRefs: refs(v.reServiceEvidenceRefs), completedAt: v.completedAt as string | null };
  }
  return { ...base, order: { id: base.serviceOrderId, code: order.code as string, serviceName: order.serviceName as string, addressSummary: order.addressSummary as string,
    customerName: order.customerName as string, customerPhone: order.customerPhone as string,
      ...(uuid4(order.bookingId) ? { bookingId: order.bookingId as string } : {}),
      ...(Array.isArray(order.partLines) ? { partLines: order.partLines.filter((l: any) => l && uuid4(l.id) && typeof l.name === 'string').map((l: any) => ({ id: l.id as string, name: l.name as string, quantity: Number(l.quantity) || 1, partSource: typeof l.partSource === 'string' ? l.partSource : null })) } : {}) },
    coverage: c ? { id: c.id as string, itemDescription: c.itemDescription as string, expiresAt: c.expiresAt as string } : null, visit,
    outcomeCode: ['fixed', 'unfixed', 'rejected'].includes(String(r.outcomeCode)) ? r.outcomeCode as TechnicianWarrantyClaim['outcomeCode'] : null,
    refundAmount: typeof r.refundAmount === 'number' && Number.isFinite(r.refundAmount) && r.refundAmount >= 0 ? r.refundAmount : null,
    declineReview: ['pending', 'valid', 'invalid'].includes(String(r.declineReview)) ? r.declineReview as TechnicianWarrantyClaim['declineReview'] : null,
    noShowFlaggedAt: typeof r.noShowFlaggedAt === 'string' && validTimestamp(r.noShowFlaggedAt) ? r.noShowFlaggedAt : null,
    partRequest: normalizePartRequest(r.partRequest) };
}
const iso = (value: unknown) => (typeof value === 'string' && validTimestamp(value) ? value : null);
function normalizePartRequest(value: unknown): TechnicianWarrantyClaim['partRequest'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const r = value as Record<string, unknown>;
  if (!uuid4(r.id) || typeof r.status !== 'string') return null;
  return { id: r.id, status: r.status, faultyReturnDueAt: iso(r.faultyReturnDueAt), faultyReturnedAt: iso(r.faultyReturnedAt), faultyReturnChargedAt: iso(r.faultyReturnChargedAt),
    items: (Array.isArray(r.items) ? r.items : []).filter((i: any) => i && uuid4(i.id) && typeof i.name === 'string').map((i: any) => ({ id: i.id as string, name: i.name as string, quantity: Number(i.quantity) || 1, usageStatus: (['used', 'returned'].includes(String(i.usageStatus)) ? i.usageStatus : 'pending') as 'pending' | 'used' | 'returned' })),
    faultyInspectionResult: ['manufacturer', 'installation', 'undetermined'].includes(String(r.faultyInspectionResult)) ? r.faultyInspectionResult as 'manufacturer' | 'installation' | 'undetermined' : null };
}
function query(input: WarrantyMineQuery) {
  const r = record(input, ['status', 'page', 'pageSize']), page = r.page ?? 1, pageSize = r.pageSize ?? 100;
  if (typeof page !== 'number' || !Number.isSafeInteger(page) || page < 1 || page > 1000000 || typeof pageSize !== 'number' || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100
    || (r.status !== undefined && !claimStatuses.includes(r.status as never))) throw Error('Trang bảo hành chưa hợp lệ.');
  return { page, pageSize, ...(r.status === undefined ? {} : { status: r.status as string }) };
}
function body(value: unknown) {
  const b = record(value);
  if (b.success !== undefined && b.success !== true) throw Error('Phản hồi bảo hành chưa xác định.');
  return b;
}
export const technicianWarrantyApi = {
  ...assignedOverviewApi,
  /** The faulty part was brought back to the warehouse. Idempotent on the server, so no command journal is needed. */
  async returnFaultyPart(partRequestId: string): Promise<void> {
    if (!uuid4(partRequestId)) throw Error('Yêu cầu linh kiện chưa hợp lệ.');
    await apiClient.post(`/part-requests/${partRequestId}/faulty-return`, {});
  },
  /** Moves the inspection time before check-in. Setting the same time twice changes nothing, so no command journal is needed. */
  async rescheduleVisit(claimId: string, scheduledAt: string): Promise<void> {
    if (!uuid4(claimId) || !validTimestamp(scheduledAt)) throw Error('Lịch kiểm tra chưa hợp lệ.');
    await apiClient.post(`/warranty-claims/${claimId}/reschedule`, { scheduledAt });
  },
  async listMine(input: WarrantyMineQuery = {}): Promise<WarrantyMinePage> {
    const params = query(input), b = body((await apiClient.get('/warranty-claims/mine', { params })).data), meta = record(b.meta);
    if (!Array.isArray(b.data) || meta.page !== params.page || meta.pageSize !== params.pageSize || typeof meta.total !== 'number' || !Number.isSafeInteger(meta.total) || meta.total < 0
      || b.data.length !== Math.min(params.pageSize, Math.max(0, meta.total - (params.page - 1) * params.pageSize))) throw Error('Danh sách bảo hành chưa xác định.');
    const data = b.data.map(normalizeTechnicianWarrantyClaim);
    if (new Set(data.map(r => r.id)).size !== data.length) throw Error('Danh sách bảo hành chưa xác định.');
    return { data, meta: { page: params.page, pageSize: params.pageSize, total: meta.total } };
  },
  async findMine(id: string, options: { pageSize?: number; isCurrent?: () => boolean } = {}): Promise<TechnicianWarrantyClaim | null> {
    if (!uuid4(id)) throw Error('Yêu cầu bảo hành chưa hợp lệ.');
    const current = options.isCurrent ?? (() => true);
    for (let page = 1; page <= 1000000; page++) {
      if (!current()) throw Error('Phiên bảo hành đã thay đổi.');
      const result = await this.listMine({ page, pageSize: options.pageSize ?? 100 });
      if (!current()) throw Error('Phiên bảo hành đã thay đổi.');
      const match = result.data.find(r => r.id === id); if (match) return match;
      if (page * result.meta.pageSize >= result.meta.total) return null;
    }
    throw Error('Chưa tìm được yêu cầu bảo hành trong phạm vi được phép.');
  },
  async command(id: string, operation: WarrantyCommand, input: unknown, authorizedRefs: readonly string[] = []): Promise<TechnicianWarrantyClaim> {
    if (!uuid4(id) || !['accept', 'decline', 'check-in', 'propose', 'complete'].includes(operation)) throw Error('Thao tác bảo hành chưa hợp lệ.');
    const dto = warrantyCommandPayload(operation, input, authorizedRefs), b = body((await apiClient.post(`/warranty-claims/${id}/${operation}`, dto)).data);
    const result = normalizeTechnicianWarrantyClaim(b.data);
    if (result.id !== id) throw Error('Yêu cầu bảo hành không khớp.');
    return result;
  },
};
