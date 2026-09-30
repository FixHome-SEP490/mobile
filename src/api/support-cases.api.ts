import apiClient from './client';

export type SupportCaseType =
  | 'matching_exhausted'
  | 'arrival_abnormal'
  | 'cash_non_response'
  | 'cash_mismatch'
  | 'cancellation_review'
  | 'parts_dispute'
  | 'warranty_dispute'
  | 'mid_job_interruption'
  | 'property_damage'
  | 'quality'
  | 'pricing_dispute'
  | 'conduct'
  | 'other';

export type SupportCaseStatus = 'open' | 'in_review' | 'resolved' | 'rejected';

export interface MySupportCase {
  id: string;
  caseType: SupportCaseType;
  status: SupportCaseStatus;
  bookingId: string | null;
  serviceOrderId: string | null;
  reason: string;
  description: string | null;
  resolutionReason: string | null;
  evidenceRefs: string[] | null;
  isUrgent: boolean;
  respondBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSupportCasePayload {
  caseType: SupportCaseType;
  reason: string;
  description?: string;
  evidenceRefs?: string[];
  bookingId?: string;
  serviceOrderId?: string;
  isUrgent?: boolean;
}

export interface MySupportCaseQuery {
  page?: number;
  limit?: number;
  status?: SupportCaseStatus;
  serviceOrderId?: string;
}

export interface SupportCasePage {
  data: MySupportCase[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const CASE_TYPES = new Set<SupportCaseType>([
  'matching_exhausted',
  'arrival_abnormal',
  'cash_non_response',
  'cash_mismatch',
  'cancellation_review',
  'parts_dispute',
  'warranty_dispute',
  'mid_job_interruption',
  'property_damage',
  'quality',
  'pricing_dispute',
  'conduct',
  'other',
]);

const CASE_STATUSES = new Set<SupportCaseStatus>([
  'open',
  'in_review',
  'resolved',
  'rejected',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Phản hồi hỗ trợ không hợp lệ: thiếu ${field}.`);
  }
  return value.trim();
}

function asNullableString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== 'string') throw new Error('Phản hồi hỗ trợ không hợp lệ.');
  return value;
}

function unwrapData(value: unknown): unknown {
  if (isRecord(value) && 'data' in value) return value.data;
  return value;
}

function normalizeMine(value: unknown): MySupportCase {
  const raw = unwrapData(value);
  if (!isRecord(raw)) throw new Error('Backend trả về khiếu nại không hợp lệ.');
  const caseType = raw.caseType;
  const status = raw.status;
  if (!CASE_TYPES.has(caseType as SupportCaseType)) {
    throw new Error('Backend trả về loại khiếu nại không được hỗ trợ.');
  }
  if (!CASE_STATUSES.has(status as SupportCaseStatus)) {
    throw new Error('Backend trả về trạng thái khiếu nại không được hỗ trợ.');
  }
  const evidenceRefs = raw.evidenceRefs;
  if (
    evidenceRefs != null &&
    (!Array.isArray(evidenceRefs) || evidenceRefs.some((ref) => typeof ref !== 'string'))
  ) {
    throw new Error('Backend trả về ảnh minh chứng khiếu nại không hợp lệ.');
  }
  return {
    id: asString(raw.id, 'id'),
    caseType: caseType as SupportCaseType,
    status: status as SupportCaseStatus,
    bookingId: asNullableString(raw.bookingId),
    serviceOrderId: asNullableString(raw.serviceOrderId),
    reason: asString(raw.reason, 'reason'),
    description: asNullableString(raw.description),
    resolutionReason: asNullableString(raw.resolutionReason),
    evidenceRefs: evidenceRefs == null ? null : evidenceRefs.map(String),
    isUrgent: raw.isUrgent === true,
    respondBy: asNullableString(raw.respondBy),
    resolvedAt: asNullableString(raw.resolvedAt),
    createdAt: asString(raw.createdAt, 'createdAt'),
    updatedAt: asString(raw.updatedAt, 'updatedAt'),
  };
}

function normalizePositiveInt(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : fallback;
}

function normalizeQuery(query: MySupportCaseQuery): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  if (query.page !== undefined) params.page = query.page;
  if (query.limit !== undefined) params.limit = query.limit;
  if (query.status) params.status = query.status;
  if (query.serviceOrderId) params.serviceOrderId = query.serviceOrderId;
  return params;
}

export const supportCasesApi = {
  async listMine(query: MySupportCaseQuery = {}): Promise<SupportCasePage> {
    const response = await apiClient.get('/support/cases/mine', {
      params: normalizeQuery(query),
    });
    const body = response.data;
    if (!isRecord(body) || !Array.isArray(body.data)) {
      throw new Error('Backend trả về danh sách khiếu nại không hợp lệ.');
    }
    const meta = isRecord(body.meta) ? body.meta : {};
    const page = normalizePositiveInt(meta.page, query.page ?? 1) || 1;
    const limit = normalizePositiveInt(meta.limit, query.limit ?? 20) || 20;
    const total = normalizePositiveInt(meta.total, body.data.length);
    const totalPages = normalizePositiveInt(
      meta.totalPages,
      total === 0 ? 0 : Math.ceil(total / limit),
    );
    return {
      data: body.data.map(normalizeMine),
      total,
      page,
      limit,
      totalPages,
    };
  },

  async getMine(id: string): Promise<MySupportCase> {
    const response = await apiClient.get(
      `/support/cases/mine/${encodeURIComponent(id)}`,
    );
    return normalizeMine(response.data);
  },

  async createCase(payload: CreateSupportCasePayload): Promise<MySupportCase> {
    const response = await apiClient.post('/support/cases', payload);
    return normalizeMine(response.data);
  },
};
