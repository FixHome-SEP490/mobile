import apiClient from './client';

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

export const technicianWarrantyApi = {
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
