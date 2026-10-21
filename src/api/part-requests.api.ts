// src/api/part-requests.api.ts
import apiClient from './client';

export type PartRequestStatus = 'requested' | 'ready' | 'delivering' | 'received' | 'completed' | 'cancelled';
export type PartRequestType = 'pre_repair' | 'additional' | 'quotation';
export type FulfillmentMethod = 'pickup' | 'delivery';
export type PartUsageStatus = 'pending' | 'used' | 'returned';
export type PartSource = 'fixhome' | 'technician' | 'external';

export interface PartRequestItem {
  id: string;
  partRequestId: string;
  partCatalogId?: string | null;
  partSource: PartSource;
  partNameSnapshot: string;
  quantity: number;
  unitPriceSnapshot: number;
  usageStatus: PartUsageStatus;
  note?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PartRequest {
  id: string;
  serviceOrderId: string;
  technicianId: string;
  requestType: PartRequestType;
  fulfillmentMethod: FulfillmentMethod;
  status: PartRequestStatus;
  reason?: string | null;
  shippingFee: number;
  additionalCostId?: string | null;
  /** Set on a `quotation` request: the approved quotation whose missing FixHome parts it supplies (BE P013). */
  quotationId?: string | null;
  qrToken?: string | null;
  qrGeneratedAt?: string | null;
  receivedAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  preparedByUserId?: string | null;
  createdAt: string;
  updatedAt: string;
  items: PartRequestItem[];
}

export interface CreatePartRequestPayload {
  items: { partCatalogId: string; quantity: number; note?: string }[];
  fulfillmentMethod?: FulfillmentMethod;
  reason?: string;
}

function unwrap<T>(payload: { data: T } | T): T {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

/** Whole-line status, or (custody rows, BE 20/10/2026) an exact used quantity with the ledger version. */
export interface UpdateItemUsagePayload {
  usageStatus: 'used' | 'returned';
  usedQty?: number;
  expectedVersion?: number;
  idempotencyKey?: string;
}

export const partRequestsApi = {
  async createPreRepair(orderId: string, payload: CreatePartRequestPayload): Promise<PartRequest> {
    const res = await apiClient.post<{ data: PartRequest } | PartRequest>(
      `/service-orders/${orderId}/part-requests`,
      payload,
    );
    return unwrap(res.data);
  },

  async getByOrderId(orderId: string): Promise<PartRequest[]> {
    const res = await apiClient.get<{ data: PartRequest[] } | PartRequest[]>(
      `/service-orders/${orderId}/part-requests`,
    );
    const result = unwrap(res.data);
    return Array.isArray(result) ? result : [];
  },

  async getById(requestId: string): Promise<PartRequest> {
    const res = await apiClient.get<{ data: PartRequest } | PartRequest>(
      `/part-requests/${requestId}`,
    );
    return unwrap(res.data);
  },

  async receiveByQr(requestId: string, qrToken: string): Promise<PartRequest> {
    const res = await apiClient.post<{ data: PartRequest } | PartRequest>(
      `/part-requests/${requestId}/receive`,
      { qrToken },
    );
    return unwrap(res.data);
  },

  async updateItemUsage(requestId: string, itemId: string, usage: 'used' | 'returned' | UpdateItemUsagePayload): Promise<PartRequestItem> {
    const res = await apiClient.patch<{ data: PartRequestItem } | PartRequestItem>(
      `/part-requests/${requestId}/items/${itemId}/usage`,
      typeof usage === 'string' ? { usageStatus: usage } : usage,
    );
    return unwrap(res.data);
  },

  async cancel(requestId: string, reason?: string): Promise<PartRequest> {
    const res = await apiClient.patch<{ data: PartRequest } | PartRequest>(
      `/part-requests/${requestId}/cancel`,
      { reason },
    );
    return unwrap(res.data);
  },
};

/**
 * P1 parts custody (owner lock 19/10/2026): the return obligation of one FixHome part line the
 * technician received through QR handover. A declaration only marks the intent to hand parts back;
 * the obligation ends when the Service Manager physically accepts them at the counter.
 */
export interface PartCustodyReturnRecord {
  partRequestId: string;
  partRequestItemId: string;
  partNameSnapshot: string;
  issuedQty: number;
  usedQty: number;
  declaredQty: number;
  managerAcceptedQty: number;
  outstandingQty: number;
  version: number;
  /** Return tracking (BE 20/10/2026), present only when the Backend sends it. */
  returnStatus?: PartReturnStatus;
  /** True while this line keeps the technician from taking new jobs. */
  blocksNewWork?: boolean;
  trackingOnly?: boolean;
  usageRecorded?: boolean;
}

export type PartReturnStatus = 'outstanding' | 'declared' | 'partially_received' | 'exception' | 'received' | 'not_required';

/** What to tell the technician about one return line, or null when there is nothing to add. */
export function partReturnStatusText(status: PartReturnStatus | undefined): { text: string; tone: 'warning' | 'success' } | null {
  switch (status) {
    case 'declared': return { text: 'Đang chờ quản lý xác nhận', tone: 'warning' };
    case 'partially_received': return { text: 'Quản lý mới nhận một phần, còn thiếu', tone: 'warning' };
    case 'exception': return { text: 'Số lượng thực nhận lệch với khai báo, hãy liên hệ quản lý', tone: 'warning' };
    case 'received': return { text: 'Đã nhận', tone: 'success' };
    default: return null;
  }
}

export interface DeclareReturnPayload {
  quantity: number;
  expectedVersion: number;
  idempotencyKey: string;
}

/** One key per user action, reused only when the same action is retried; the Backend rejects a key reused with a different request. */
export function createIdempotencyKey(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Feature flag off (404), no access (403), not enabled (501) or not available yet (503): hide the return UI, keep QR/usage working. */
export function isPartReturnsUnavailableError(err: unknown): boolean {
  const status = (err as { response?: { status?: number } } | null)?.response?.status;
  return status === 403 || status === 404 || status === 501 || status === 503;
}

/** Declared but not physically accepted yet: the manager still has to confirm. */
export const pendingDeclaredQty = (r: PartCustodyReturnRecord) => Math.max(0, r.declaredQty - r.managerAcceptedQty);

/** What the technician may still declare: the return-due quantity not declared yet. */
export const canDeclareMoreQty = (r: PartCustodyReturnRecord) => Math.max(0, r.outstandingQty - pendingDeclaredQty(r));

/** The used quantity may only grow, and never past what the manager has not already accepted back. */
export const usedQtyRange = (r: PartCustodyReturnRecord) => ({
  min: r.usedQty,
  max: Math.max(r.usedQty, r.issuedQty - r.managerAcceptedQty),
});

export const partReturnsApi = {
  async getByOrderId(orderId: string): Promise<PartCustodyReturnRecord[]> {
    const res = await apiClient.get<{ data: PartCustodyReturnRecord[] } | PartCustodyReturnRecord[]>(
      `/service-orders/${orderId}/part-returns`,
    );
    const result = unwrap(res.data);
    return Array.isArray(result) ? result : [];
  },

  /** Every line the technician still owes or has settled, across orders, including finished ones (BE tracking mode). */
  async getMine(): Promise<PartCustodyReturnRecord[]> {
    const res = await apiClient.get<{ data: PartCustodyReturnRecord[] } | PartCustodyReturnRecord[]>('/part-returns/mine');
    const result = unwrap(res.data);
    return Array.isArray(result) ? result : [];
  },

  async declare(requestId: string, itemId: string, payload: DeclareReturnPayload): Promise<void> {
    await apiClient.post(`/part-requests/${requestId}/items/${itemId}/declare-return`, payload);
  },
};
