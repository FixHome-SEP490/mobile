// src/api/orders.api.ts
import apiClient from './client';

function unwrap<T>(payload: { data: T } | T): T {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

export interface OrdersPage {
  data: ServiceOrderItem[];
  total: number;
}

function toPositiveInt(value: number, fallback: number): number {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

export type CanonicalOrderStatus =
  | 'ACCEPTED'
  | 'EN_ROUTE'
  | 'UNDER_REPAIR'
  | 'COMPLETED'
  | 'CANCELLED';

export interface ServiceOrderItem {
  id: string;
  code: string;
  bookingId: string;
  serviceName: string;
  /** Backend sanitized history marker: never a full detail payload. */
  historical?: boolean;
  pricingMode?: string;
  fixedUnitPrice?: number;
  quantity?: number;
  scopeDescription?: string;
  bookingDescription?: string;
  completionRequestedAt?: string;
  customerConfirmed?: boolean;
  arrivalVerified?: boolean;
  beforeEvidenceCount?: number;
  afterEvidenceCount?: number;
  status: CanonicalOrderStatus;
  customerName: string;
  customerPhone: string;
  addressSummary: string;
  scheduledAt: string;
  technician?: {
    id: string;
    fullName: string;
    phoneNumber: string;
    avatarUrl?: string;
    averageRating: number;
  };
  laborTotal: number;
  partsTotal: number;
  grandTotal: number;
  paymentStatus: 'UNPAID' | 'PAID' | 'REFUNDED';
  createdAt: string;
  timeline?: {
    status: string;
    title: string;
    timestamp: string;
    actor: string;
  }[];
  quotation?: {
    id: string;
    status: string;
    laborTotal: number;
    partsTotal: number;
    items: QuotationLineItem[];
  };
  cashSettlement?: {
    id: string;
    declaredAmount: number;
    confirmedAmount?: number;
    status: string;
    technicianNotes?: string;
  };
}

export interface QuotationLineItem {
  id?: string;
  type: 'LABOR' | 'PARTS';
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  warrantyDays?: number;
  partSource?: string;
  partWarrantyOption?: string;
  warrantyFee?: number;
  warrantyTermDays?: number;
}

export interface EvidenceResponse {
  id: string;
  serviceOrderId: string;
  type: 'BEFORE' | 'AFTER' | 'ADDITIONAL';
  mediaUrl: string;
  note?: string;
  capturedAt?: string;
  createdAt: string;
}

export interface EvidenceUploadImage {
  uri: string;
  name: string;
  type: string;
}

export interface CreateQuotationLaborItem {
  type: 'labor';
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface CreateQuotationTechnicianPartItem {
  type: 'parts_equipment';
  description: string;
  quantity: number;
  unitPrice: number;
  partSource: 'technician';
  partWarrantyOption: 'no_warranty' | 'paid_warranty';
  warrantyFee?: number;
  warrantyTermDays?: number;
}

export type CreateQuotationItem =
  | CreateQuotationLaborItem
  | CreateQuotationTechnicianPartItem;

export interface CreateQuotationPayload {
  items: CreateQuotationItem[];
  note?: string;
}

export interface CreateAdditionalCostItem {
  type: 'labor';
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface CreateAdditionalCostPayload {
  reason: string;
  items: CreateAdditionalCostItem[];
  note?: string;
}

export interface CostRequest {
  id: string;
  serviceOrderId: string;
  status: string;
  reason: string;
  totalLaborDelta: number;
  totalPartsDelta: number;
  createdAt: string;
  expiresAt?: string;
  items: (QuotationLineItem & { id: string; lineTotal: number })[];
}

export interface RepairHistoryItem {
  orderId: string;
  bookingId: string;
  code: string;
  status: string;
  serviceName?: string;
  technicianName?: string;
  laborTotal: number;
  partsTotal: number;
  grandTotal: number;
  completedAt?: string;
  cancelledAt?: string;
}

export interface ReviewItem {
  id: string;
  rating: number;
  comment?: string;
  createdAt?: string;
}

const normalizeOrder = (order: ServiceOrderItem): ServiceOrderItem => ({
  ...order,
  status: (order.status?.toUpperCase?.() || order.status) as CanonicalOrderStatus,
  paymentStatus: (order.paymentStatus?.toUpperCase?.() ||
    order.paymentStatus) as ServiceOrderItem['paymentStatus'],
  quotation: order.quotation
    ? {
        ...order.quotation,
        status: order.quotation.status?.toUpperCase?.() || order.quotation.status,
        items: (Array.isArray(order.quotation.items) ? order.quotation.items : []).map((item) => ({
          ...item,
          type:
            String(item.type).toLowerCase() === 'labor' ? 'LABOR' : 'PARTS',
        })),
      }
    : undefined,
});

const get = async <T>(url: string): Promise<T> =>
  unwrap<T>((await apiClient.get(url)).data);

const post = async (
  url: string,
  body: unknown = {},
): Promise<Record<string, unknown>> =>
  unwrap((await apiClient.post(url, body)).data);

export const ordersApi = {
  async getMyOrders(): Promise<ServiceOrderItem[]> {
    return (await get<ServiceOrderItem[]>('/service-orders/my')).map(
      normalizeOrder,
    );
  },

  async getMyOrdersPage(page = 1, pageSize = 20): Promise<OrdersPage> {
    const safePage = toPositiveInt(page, 1);
    const safePageSize = Math.min(toPositiveInt(pageSize, 20), 100);
    const res = await apiClient.get('/service-orders/my', { params: { page: safePage, pageSize: safePageSize } });
    const body = res.data as { data?: ServiceOrderItem[]; meta?: { total?: number } } | ServiceOrderItem[];
    const rows = Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : [];
    const total = !Array.isArray(body)
      && typeof body?.meta?.total === 'number' && body.meta.total >= 0
      ? body.meta.total : rows.length;
    return { data: rows.map(normalizeOrder), total };
  },

  async getOrder(id: string): Promise<ServiceOrderItem> {
    return normalizeOrder(
      await get<ServiceOrderItem>(`/service-orders/${id}`),
    );
  },

  async enRoute(id: string) {
    return post(`/service-orders/${id}/en-route`);
  },

  async checkIn(
    id: string,
    coords: { lat: number; lng: number; accuracyMeters: number },
  ) {
    return post(`/service-orders/${id}/check-in`, coords);
  },

  async startRepair(id: string) {
    return post(`/service-orders/${id}/start-repair`);
  },

  async requestCompletion(id: string, body?: { completionNote?: string }) {
    return post(`/service-orders/${id}/request-completion`, body);
  },

  async confirmCompletion(
    id: string,
    body?: { feedback?: string; rating?: number; signatureUrl?: string },
  ) {
    return post(`/service-orders/${id}/confirm-completion`, body);
  },

  async completeRepair(id: string, body?: { completionNote?: string }) {
    return post(`/service-orders/${id}/complete`, body);
  },

  async cancelOrder(id: string, reason: string) {
    return post(`/service-orders/${id}/cancel`, { reason });
  },

  async getEvidence(id: string): Promise<EvidenceResponse[]> {
    return (
      await get<EvidenceResponse[]>(`/service-orders/${id}/evidence`)
    ).map((e) => ({
      ...e,
      type: e.type?.toUpperCase?.() as EvidenceResponse['type'],
    }));
  },

  /**
   * BEFORE-only evidence upload. Native multipart/form-data with an explicit
   * per-request Content-Type override (the shared client defaults to JSON);
   * no boundary is hardcoded and the global default is untouched. The POST
   * response may carry a private storage reference — callers must ignore the
   * body and re-fetch signed GET URLs instead of rendering it.
   */
  async uploadEvidenceBefore(id: string, image: EvidenceUploadImage): Promise<unknown> {
    const form = new FormData();
    form.append('type', 'before');
    form.append('file', {
      uri: image.uri,
      name: image.name,
      type: image.type,
    } as unknown as Blob);
    const res = await apiClient.post(`/service-orders/${id}/evidence`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return unwrap(res.data);
  },

  /**
   * AFTER-only evidence upload. Same per-request multipart pattern as the
   * BEFORE helper with exact lowercase `type='after'`; the BEFORE helper is
   * untouched. The 201 body may carry a private storage reference — callers
   * must ignore it and re-fetch signed GET URLs instead of rendering it.
   */
  async uploadEvidenceAfter(id: string, image: EvidenceUploadImage): Promise<unknown> {
    const form = new FormData();
    form.append('type', 'after');
    form.append('file', {
      uri: image.uri,
      name: image.name,
      type: image.type,
    } as unknown as Blob);
    const res = await apiClient.post(`/service-orders/${id}/evidence`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return unwrap(res.data);
  },

  async getQuotations(id: string) {
    return get(`/service-orders/${id}/quotations`);
  },

  /**
   * Labor-only quotation proposal for INSPECTION_REQUIRED orders. This is a
   * proposal only — never payment, approval, or repair start. The 201 body is
   * returned for reconciliation; callers refresh detail rather than trusting
   * it as final quoted state.
   */
  async createQuotation(orderId: string, payload: CreateQuotationPayload): Promise<unknown> {
    return post(`/service-orders/${orderId}/quotations`, payload);
  },

  /**
   * Technician additional-cost PROPOSAL (one labor line + mandatory reason).
   * A proposal only — never a charge, approval, or payment. The 201 body is
   * returned for reconciliation; callers re-fetch the costs GET rather than
   * trusting it as decided state.
   */
  async createAdditionalCostProposal(orderId: string, payload: CreateAdditionalCostPayload): Promise<unknown> {
    return post(`/service-orders/${orderId}/additional-costs`, payload);
  },

  async approveQuotation(
    id: string,
    paidWarrantyItemIds: string[] = [],
  ) {
    return post(`/quotations/${id}/decision`, {
      action: 'APPROVE',
      paidWarrantyItemIds,
    });
  },

  async rejectQuotation(id: string) {
    return post(`/quotations/${id}/decision`, { action: 'REJECT' });
  },

  async getAdditionalCosts(id: string): Promise<CostRequest[]> {
    return get(`/service-orders/${id}/additional-costs`);
  },

  async decideAdditionalCost(
    id: string,
    action: 'APPROVE' | 'REJECT',
    paidWarrantyItemIds: string[] = [],
  ) {
    return post(`/additional-costs/${id}/decision`, {
      action,
      paidWarrantyItemIds,
    });
  },

  async submitReview(id: string, body: { rating: number; comment?: string }) {
    return post(`/service-orders/${id}/reviews`, body);
  },

  async getOrderReview(id: string): Promise<ReviewItem | null> {
    return get(`/service-orders/${id}/reviews`);
  },

  async getRepairHistory(
    page = 1,
    pageSize = 20,
  ): Promise<{ data: RepairHistoryItem[]; total: number }> {
    const res = await apiClient.get('/repair-history', {
      params: { page, pageSize },
    });
    return { data: unwrap(res.data), total: res.data.meta?.total ?? 0 };
  },

  async getStatusHistory(id: string) {
    return get(`/service-orders/${id}/status-history`);
  },

  async getWarranties(id: string) {
    return get(`/service-orders/${id}/warranties`);
  },

  async declareCashSettlement(
    id: string,
    body: {
      declaredAmount: number;
      technicianNotes?: string;
      receiptEvidenceUrl?: string;
    },
  ) {
    return post(`/service-orders/${id}/cash-settlement/declare`, body);
  },

  async confirmCashSettlement(
    id: string,
    body: { agreed: boolean; disputeReason?: string; confirmedAmount?: number },
  ) {
    return post(`/service-orders/${id}/cash-settlement/confirm`, body);
  },

  async getCashSettlement(id: string) {
    return get(`/service-orders/${id}/cash-settlement`);
  },

  async getInvoice(id: string) {
    return get(`/service-orders/${id}/invoice`);
  },

  async payInvoice(id: string, idempotencyKey: string) {
    return post(`/invoices/${id}/pay`, { idempotencyKey });
  },
};
