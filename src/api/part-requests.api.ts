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
  /** W3 delivery path: latest warehouse delivery event (the request keeps status 'requested'). */
  w3DeliveryStage?: string | null;
}

export type WarehouseAllocationStatus = 'manual_assistance' | 'stock_unavailable' | 'reserved' | 'ready' | 'handed_over' | 'received' | 'released' | null;
export interface WarehouseAllocation {
  partRequestId: string;
  mode: 'warehouse' | 'legacy';
  status: WarehouseAllocationStatus;
  warehouseId?: string | null;
  warehouseName?: string | null;
  warehouseAddress?: string | null;
  estimatedStraightLineKm?: number | null;
  distanceReference?: 'booking_snapshot' | null;
  reviewRequired?: boolean;
  stockUnavailable?: boolean;
  handedOverAt?: string | null;
  receivedAt?: string | null;
}

const W3_STAGE_STATUS: Record<string, PartRequestStatus> = {
  RESERVED: 'ready', ISSUED_TO_COURIER: 'delivering', DISPATCH_RECORDED: 'delivering', TECHNICIAN_RECEIVED: 'received',
};
/** Status as shown: a received W3 delivery reads as received (usage + completion unlock). */
export function readW3Received(request: PartRequest): PartRequest {
  return request.status === 'requested' && request.w3DeliveryStage === 'TECHNICIAN_RECEIVED'
    ? { ...request, status: 'received' } : request;
}
/** Label status of a request on the W3 path (web w3-delivery-stage.ts). */
export function displayPartRequestStatus(request: Pick<PartRequest, 'status' | 'w3DeliveryStage'>): PartRequestStatus {
  if (!request.w3DeliveryStage || request.status !== 'requested') return request.status;
  return W3_STAGE_STATUS[request.w3DeliveryStage] ?? 'requested';
}

/** W2 PICKUP: may the technician enter the receipt code? Warehouse path only after the SM's physical handover. */
export function canReceivePickup(request: Pick<PartRequest, 'fulfillmentMethod' | 'status'>, allocation: WarehouseAllocation | null | undefined): boolean {
  if (request.fulfillmentMethod !== 'pickup' || !allocation) return false;
  if (allocation.mode === 'warehouse') return allocation.status === 'handed_over';
  return request.status === 'ready';
}

/** Straight-line km line for the allocated warehouse; never a road distance or ETA. */
export function warehouseDistanceText(allocation: WarehouseAllocation | null | undefined): string | null {
  if (!allocation || allocation.mode !== 'warehouse') return null;
  if (allocation.distanceReference === 'booking_snapshot' && typeof allocation.estimatedStraightLineKm === 'number'
    && Number.isFinite(allocation.estimatedStraightLineKm)) {
    return `Khoảng cách đường thẳng ước tính từ vị trí đặt lịch: ~${allocation.estimatedStraightLineKm.toFixed(1)} km (chưa tính đường đi).`;
  }
  return allocation.warehouseId ? 'Chưa xác minh khoảng cách tới kho.' : null;
}

export function warehouseStatusText(allocation: WarehouseAllocation | null | undefined): string | null {
  switch (allocation?.mode === 'warehouse' ? allocation.status : null) {
    case 'stock_unavailable': return 'Không có kho FixHome nào đủ toàn bộ linh kiện yêu cầu. Bạn tự chuẩn bị linh kiện; hệ thống không tự tính phí linh kiện tự mua.';
    case 'reserved': case 'ready': return 'Kho đã giữ linh kiện. Đang chờ quản lý bàn giao trực tiếp tại kho.';
    case 'handed_over': return 'Quản lý đã bàn giao. Nhập hoặc quét mã nhận do quản lý đưa (hiệu lực 48 giờ) để xác nhận đã nhận.';
    case 'received': return 'Đã xác nhận nhận linh kiện tại kho.';
    case 'released': return 'Kho đã bỏ giữ linh kiện cho yêu cầu này.';
    default: return null;
  }
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
    // A W3 delivery the technician has received stays 'requested' in storage; the backend reads it
    // as received for completion, so the order screens do the same (web part-requests.api.ts).
    return Array.isArray(result) ? result.map(readW3Received) : [];
  },

  /** W2: the warehouse a PICKUP request is allocated to (name, address, straight-line km, stock). */
  async getWarehouseAllocation(requestId: string): Promise<WarehouseAllocation> {
    const res = await apiClient.get<{ data: WarehouseAllocation } | WarehouseAllocation>(`/part-requests/${requestId}/warehouse-allocation`);
    return unwrap(res.data);
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
  /** Sent by the Backend on every custody row; absent on older responses. */
  orderId?: string;
  handedOverAt?: string;
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

/** Until the invoice is made the used count may be corrected either way, but never past what the manager has not already accepted back. */
export const usedQtyRange = (r: PartCustodyReturnRecord) => ({
  min: 0,
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
