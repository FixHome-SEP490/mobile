// src/api/orders.api.ts
import { Platform } from 'react-native';
import apiClient from './client';
import type { CheckInDto, UpdateLocationDto, EvidenceUploadMetadata, CompletionRequestDto, OrderStatusHistoryResponse } from '../types/api.types';

// Browsers need a real Blob; the {uri,name,type} shape only works in React Native.
async function appendImage(form: FormData, image: { uri: string; name: string; type: string }, field = 'file') {
  if (Platform.OS !== 'web') { form.append(field, { uri: image.uri, name: image.name, type: image.type } as unknown as Blob); return; }
  const blob = await (await fetch(image.uri)).blob();
  form.append(field, blob.type ? blob : new Blob([blob], { type: image.type }), image.name);
}

// Backend's Cloudinary round-trip for evidence photos is observed at 30s+
// (see service-orders.service.ts uploadEvidence comment); the shared 15s
// client default aborts these before the server finishes, so override it here.
const EVIDENCE_UPLOAD_TIMEOUT = 60000;

function unwrap<T>(payload: { data: T } | T): T {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

export type OverrunReleaseBlock =
  | 'NOT_ASSIGNED'
  | 'ORDER_NOT_WAITING'
  | 'ALREADY_ARRIVED'
  | 'NO_CURRENT_JOB'
  | 'NOT_STARTING_SOON';

/** PO 31/10/2026: why the technician cannot reach the next order in time; Backend stores it with the report. */
export type DelayReasonCode = 'new_fault_found' | 'waiting_parts' | 'repair_longer' | 'other';
export type DelayDecision = 'wait' | 'switch' | 'cancel';

/** A report of a late or released next order is never a bare tap: reason, 1 to 3 photos of the job under repair, confirmation. */
export interface DelayReportPayload {
  reasonCode: DelayReasonCode;
  reason: string;
  evidenceIds: string[];
  confirm: true;
}
export interface DelayNoticePayload extends DelayReportPayload { delayMinutes: number }

export interface DelayNoticeView {
  minutes: number;
  noticedAt: string;
  decision: DelayDecision | null;
  reasonCode: DelayReasonCode | null;
  /** Only in the technician's own read (`overrun-release`): what they wrote and the photos they attached. The customer's order never carries these. */
  reason?: string | null;
  evidenceIds?: string[];
}

export interface OverrunReleaseStatus {
  eligible: boolean;
  block: OverrunReleaseBlock | null;
  currentOrderCode: string | null;
  /** The job the technician is on: its order screen holds the report form and its photos. */
  currentOrderId: string | null;
  currentOrderStatus: string | null;
  windowMinutes: number | null;
  delayNotice: DelayNoticeView | null;
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

export interface HistoricalOrderItem {
  id: string;
  code: string;
  status: CanonicalOrderStatus;
  createdAt: string;
  completedAt?: string | null;
  cancelledAt?: string | null;
  historical: true;
}

export type TechnicianOrderItem = ServiceOrderItem | HistoricalOrderItem;
export interface TechnicianOrdersPage {
  data: TechnicianOrderItem[];
  total: number;
}

export function isHistoricalOrder(order: unknown): order is HistoricalOrderItem {
  return typeof order === 'object' && order !== null
    && 'historical' in order && order.historical === true;
}

export interface ServiceOrderItem {
  id: string;
  code: string;
  bookingId: string;
  /** Set when this order is one device of a multi-device visit (paid, rescheduled and cancelled as a whole). */
  visitGroupId?: string | null;
  serviceName: string;
  /** Backend sanitized history marker: never a full detail payload. */
  historical?: boolean;
  pricingMode?: string;
  fixedUnitPrice?: number;
  quantity?: number;
  scopeDescription?: string;
  bookingDescription?: string;
  /** Photos/videos the customer attached when booking; read per item through /bookings/:bookingId/media. */
  bookingMedia?: { id: string; url: string | null; isPrivate: boolean; mimeType: string }[];
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
  /** scheduled = one morning/afternoon/evening session; urgent = come now (PO 08/10/2026). */
  bookingMode?: 'scheduled' | 'urgent';
  slot?: 'morning' | 'afternoon' | 'evening' | null;
  customerNote?: string | null;
  /** Labor warranty (days) fixed when the technician was assigned. */
  laborWarrantyDays?: number | null;
  /** The technician may set out from this instant (one hour before the appointment). */
  departAvailableAt?: string | null;
  /** PO 31/10/2026: set when the technician told the customer this order will start late; `decision` is the customer's answer. */
  delayNotice?: DelayNoticeView | null;
  technician?: {
    id: string;
    fullName: string;
    phoneNumber: string;
    avatarUrl?: string;
    averageRating: number | null;
  };
  laborTotal: number;
  partsTotal: number;
  grandTotal: number;
  paymentStatus: 'UNPAID' | 'PAID' | 'REFUNDED';
  createdAt: string;
  completedAt?: string;
  completionNote?: string | null;
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
  type: 'BEFORE' | 'AFTER' | 'ADDITIONAL' | 'CHECKIN_FACE';
  uploaderId?: string;
  mediaUrl: string;
  note?: string;
  capturedAt?: string;
  createdAt: string;
}

export interface EvidenceUploadImage {
  uri: string;
  name: string;
  type: string;
  /** Check-in face only: the second photo (doing the server's challenge) and the token that proves which challenge. */
  liveness?: { token: string; image: { uri: string; name: string; type: string } };
}

/** `challenge` is null when the server has face checks off: then one photo is enough. */
export interface CheckInFaceChallenge {
  challenge: 'turn_head' | 'smile' | null;
  token?: string;
}

export interface CreateQuotationLaborItem {
  type: 'labor';
  description: string;
  quantity: number;
  unitPrice: number;
  warrantyDays?: number;
}

export interface CreateQuotationFixHomePartItem {
  type: 'parts_equipment';
  description: string;
  quantity: number;
  unitPrice: number;
  partSource: 'fixhome';
  partCatalogId: string;
  partNameSnapshot?: string;
  partSku?: string;
  warrantyPolicy?: string;
}

export interface CreateQuotationExternalPartItem {
  type: 'parts_equipment';
  description: string;
  quantity: number;
  unitPrice: number;
  partSource: 'external';
  partWarrantyOption: 'no_warranty';
  warrantyDays?: number;
  warrantyFee?: number;
  warrantyTermDays?: number;
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
  | CreateQuotationFixHomePartItem
  | CreateQuotationExternalPartItem
  | CreateQuotationTechnicianPartItem;

export interface CreateQuotationPayload {
  items: CreateQuotationItem[];
  note?: string;
}

export interface CreateAdditionalCostItem {
  type: 'labor' | 'parts_equipment';
  description: string;
  quantity: number;
  unitPrice: number;
  partSource?: 'fixhome' | 'technician' | 'external';
  partCatalogId?: string;
  partNameSnapshot?: string;
  partSku?: string;
  warrantyPolicy?: string;
  partWarrantyOption?: 'no_warranty' | 'technician_free' | 'paid_warranty';
  warrantyFee?: number;
  warrantyTermDays?: number;
  warrantyDays?: number;
}

export interface CreateAdditionalCostPayload {
  reason: string;
  items: CreateAdditionalCostItem[];
  note?: string;
  evidenceUrls?: string[];
  fulfillmentMethod?: 'pickup' | 'delivery';
  shippingFee?: number;
}

export interface CostRequest {
  id: string;
  serviceOrderId: string;
  technicianId?: string;
  status: string;
  /** Compatibility only; AdditionalCostRequest has NO version in Backend. Must not drive authority. */
  version?: number;
  supersedesId?: string | null;
  reason: string;
  totalLaborDelta: number;
  totalPartsDelta: number;
  createdAt: string;
  expiresAt?: string;
  decidedAt?: string | null;
  decidedByCustomerId?: string | null;
  evidenceUrls?: string[] | null;
  fulfillmentMethod?: 'pickup' | 'delivery' | null;
  shippingFee?: number;
  items: (QuotationLineItem & {
    id: string;
    lineTotal: number;
    partSource?: string | null;
    partCatalogId?: string | null;
    partWarrantyOption?: string | null;
    warrantyFee?: number | null;
    warrantyTermDays?: number | null;
  })[];
}

export interface RepairHistoryItem {
  orderId: string;
  bookingId: string;
  code: string;
  status: string;
  serviceName?: string;
  technicianName?: string;
  addressSummary?: string;
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

export type WarrantyClaimStatus =
  | 'submitted'
  | 'accepted'
  | 'inspected'
  | 'in_progress'
  | 'awaiting_customer'
  | 'disputed'
  | 'resolved'
  | 'rejected';

export interface WarrantyCoverageItem {
  id: string;
  serviceOrderId?: string;
  invoiceItemId?: string | null;
  /** Invoice line this coverage covers (backend #130); null on coverages without one. */
  itemType?: 'labor' | 'parts_equipment' | null;
  itemDescription?: string | null;
  warrantyDaysSnapshot: number;
  note?: string | null;
  startsAt: string;
  expiresAt: string;
  status: string;
}

export interface WarrantyClaimView {
  id: string;
  serviceOrderId: string;
  warrantyCoverageId: string;
  status: WarrantyClaimStatus | string;
  description: string;
  evidenceRefs: string[] | null;
  submittedAfterExpiry: boolean;
  customerResponse: 'agreed' | 'disputed' | null;
  awaitingPrompt: 'conclusion' | 'completion' | null;
  resolutionNotes: string | null;
  submittedAt: string;
  resolvedAt: string | null;
  technician: { id: string; fullName: string } | null;
  /** When the technician comes to inspect; null until the claim is accepted. */
  inspectionScheduledAt?: string | null;
}

export interface CreateWarrantyClaimPayload {
  warrantyCoverageId: string;
  description: string;
  evidenceRefs?: string[];
}

/**
 * The API sends Postgres numerics as strings ("220000.00"). Adding those
 * concatenates them, so totals are turned into numbers once, here.
 */
const toMoney = (value: unknown): number => {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
};

const normalizeOrder = (order: ServiceOrderItem): ServiceOrderItem => ({
  ...order,
  // A listed-price device inside a multi-device visit is still quoted on site (PO 21/10/2026), so every flow treats it as an inspection order; `fixedUnitPrice` stays for the quote's first line.
  pricingMode: order.visitGroupId && String(order.pricingMode).toUpperCase() === 'FIXED_PRICE' ? 'INSPECTION_REQUIRED' : order.pricingMode,
  laborTotal: toMoney(order.laborTotal),
  partsTotal: toMoney(order.partsTotal),
  grandTotal: toMoney(order.grandTotal),
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

function normalizeTechnicianOrder(order: TechnicianOrderItem): TechnicianOrderItem {
  if (isHistoricalOrder(order)) {
    return {
      id: order.id, code: order.code,
      status: String(order.status).toUpperCase() as CanonicalOrderStatus,
      createdAt: order.createdAt, completedAt: order.completedAt ?? null,
      cancelledAt: order.cancelledAt ?? null, historical: true,
    };
  }
  return normalizeOrder(order);
}

const get = async <T>(url: string): Promise<T> =>
  unwrap<T>((await apiClient.get(url)).data);

const post = async (
  url: string,
  body: unknown = {},
): Promise<Record<string, unknown>> =>
  unwrap((await apiClient.post(url, body)).data);

const del = async (url: string): Promise<void> => {
  await apiClient.delete(url);
};

export const ordersApi = {
  /** `statuses` lets Backend filter before it builds each order (lowercase, comma separated on the wire); without it every order the technician ever held is built. */
  async getTechnicianJobs(options: { excludeVisitGroups?: boolean; statuses?: string[] } = {}): Promise<TechnicianOrderItem[]> {
    const params = {
      ...(options.excludeVisitGroups ? { excludeVisitGroups: 'true' } : {}),
      ...(options.statuses?.length ? { statuses: options.statuses.join(',') } : {}),
    };
    const rows = Object.keys(params).length
      ? unwrap<TechnicianOrderItem[]>((await apiClient.get('/service-orders/my', { params })).data)
      : await get<TechnicianOrderItem[]>('/service-orders/my');
    return rows.map(normalizeTechnicianOrder);
  },

  async getTechnicianJobsPage(page = 1, pageSize = 20, options: { excludeVisitGroups?: boolean } = {}): Promise<TechnicianOrdersPage> {
    const safePage = toPositiveInt(page, 1);
    const safePageSize = Math.min(toPositiveInt(pageSize, 20), 100);
    const res = await apiClient.get('/service-orders/my', {
      params: { page: safePage, pageSize: safePageSize, ...(options.excludeVisitGroups ? { excludeVisitGroups: 'true' } : {}) },
    });
    const body = res.data as { data?: TechnicianOrderItem[]; meta?: { total?: number } } | TechnicianOrderItem[];
    const rows = Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : null;
    if (rows === null) {
      throw new Error('Danh sách đơn sửa chữa từ máy chủ không hợp lệ.');
    }
    const total = !Array.isArray(body)
      && typeof body?.meta?.total === 'number' && body.meta.total >= 0
      ? body.meta.total : rows.length;
    return { data: rows.map(normalizeTechnicianOrder), total };
  },

  async getTechnicianOrder(id: string): Promise<TechnicianOrderItem> {
    return normalizeTechnicianOrder(await get<TechnicianOrderItem>(`/service-orders/${id}`));
  },


  async getMyOrders(options: { excludeVisitGroups?: boolean } = {}): Promise<ServiceOrderItem[]> {
    const rows = options.excludeVisitGroups
      ? unwrap<ServiceOrderItem[]>((await apiClient.get('/service-orders/my', { params: { excludeVisitGroups: 'true' } })).data)
      : await get<ServiceOrderItem[]>('/service-orders/my');
    return rows.map(normalizeOrder);
  },

  async getMyOrdersPage(page = 1, pageSize = 20, options: { excludeVisitGroups?: boolean } = {}): Promise<OrdersPage> {
    const safePage = toPositiveInt(page, 1);
    const safePageSize = Math.min(toPositiveInt(pageSize, 20), 100);
    const res = await apiClient.get('/service-orders/my', {
      params: { page: safePage, pageSize: safePageSize, ...(options.excludeVisitGroups ? { excludeVisitGroups: 'true' } : {}) },
    });
    const body = res.data as { data?: ServiceOrderItem[]; meta?: { total?: number } } | ServiceOrderItem[] | null | undefined;
    const rows = Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : undefined;
    if (!rows) throw new Error('Invalid orders page response');
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
    coords: CheckInDto,
  ) {
    return post(`/service-orders/${id}/check-in`, coords);
  },

  async updateOrderLocation(id: string, coords: UpdateLocationDto) {
    return unwrap((await apiClient.patch(`/service-orders/${id}/location`, coords)).data);
  },

  async startRepair(id: string) {
    return post(`/service-orders/${id}/start-repair`);
  },

  async requestCompletion(id: string, body?: CompletionRequestDto) {
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

  /** BE 20/10/2026: may this upcoming order be released because the current job overruns (no reputation penalty)? */
  async overrunReleaseStatus(id: string): Promise<OverrunReleaseStatus> {
    const data = await get<Partial<OverrunReleaseStatus> | null>(`/service-orders/${id}/overrun-release`);
    return {
      eligible: data?.eligible === true,
      block: data?.block ?? null,
      currentOrderCode: data?.currentOrderCode ?? null,
      currentOrderId: data?.currentOrderId ?? null,
      currentOrderStatus: data?.currentOrderStatus ?? null,
      windowMinutes: typeof data?.windowMinutes === 'number' ? data.windowMinutes : null,
      delayNotice: data?.delayNotice ?? null,
    };
  },

  /** BE 31/10/2026: tell the customer of the upcoming order it will start late; the customer then waits, picks another technician or cancels. */
  async sendDelayNotice(id: string, notice: DelayNoticePayload) {
    return post(`/service-orders/${id}/delay-notice`, notice);
  },

  /** The customer's answer to a delay notice. */
  async decideDelay(id: string, decision: DelayDecision) {
    return post(`/service-orders/${id}/delay-decision`, { decision });
  },

  /** ADDITIONAL photo of the job under repair (the evidence of a delay report). Returns the evidence id. */
  async uploadEvidenceAdditional(id: string, image: EvidenceUploadImage): Promise<{ id: string }> {
    const form = new FormData();
    form.append('type', 'additional');
    await appendImage(form, image);
    const row = unwrap<{ id?: unknown }>((await apiClient.post(`/service-orders/${id}/evidence`, form, {
      headers: { 'Content-Type': 'multipart/form-data' }, timeout: EVIDENCE_UPLOAD_TIMEOUT,
    })).data);
    if (typeof row?.id !== 'string') throw new Error('Chưa xác nhận được ảnh đã tải lên.');
    return { id: row.id };
  },

  async getEvidence(id: string): Promise<EvidenceResponse[]> {
    return (
      await get<EvidenceResponse[]>(`/service-orders/${id}/evidence`)
    ).map((e) => ({
      ...e,
      type: e.type?.toUpperCase?.() as EvidenceResponse['type'],
    }));
  },

  async deleteEvidence(id: string, evidenceId: string): Promise<void> {
    await del(`/service-orders/${id}/evidence/${evidenceId}`);
  },

  /**
   * BEFORE-only evidence upload (several photos: every photo but the last sets `deferAutoStart`). Native multipart/form-data with an explicit
   * per-request Content-Type override (the shared client defaults to JSON);
   * no boundary is hardcoded and the global default is untouched. The POST
   * response may carry a private storage reference — callers must ignore the
   * body and re-fetch signed GET URLs instead of rendering it.
   */
  async uploadEvidenceBefore(id: string, image: EvidenceUploadImage, options: { deferAutoStart?: boolean } = {}): Promise<unknown> {
    const form = new FormData();
    form.append('type', 'before');
    // BE 20/10/2026: `true` keeps a fixed-price order EN_ROUTE for the next photo; the last photo omits it or sends `false`.
    if (options.deferAutoStart !== undefined) form.append('deferAutoStart', String(options.deferAutoStart));
    await appendImage(form, image);
    const res = await apiClient.post(`/service-orders/${id}/evidence`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: EVIDENCE_UPLOAD_TIMEOUT,
    });
    return unwrap(res.data);
  },

  /** Random liveness challenge for the check-in face. A failed call means "no challenge": the single photo path stays. */
  async getCheckInFaceChallenge(id: string): Promise<CheckInFaceChallenge> {
    try {
      const body = unwrap((await apiClient.get(`/service-orders/${id}/checkin-face/challenge`)).data) as Partial<CheckInFaceChallenge> | null;
      return body?.challenge && body.token ? { challenge: body.challenge, token: body.token } : { challenge: null };
    } catch {
      return { challenge: null };
    }
  },

  async uploadCheckInFace(
    id: string,
    image: EvidenceUploadImage,
    metadata: EvidenceUploadMetadata = {},
  ): Promise<unknown> {
    const form = new FormData();
    const { liveness } = image;
    // With a challenge the server needs both photos in one request; without one the old single-photo route is used.
    if (liveness) {
      await appendImage(form, image);
      await appendImage(form, liveness.image, 'challengeFile');
      form.append('challengeToken', liveness.token);
    } else {
      form.append('type', 'checkin_face');
      await appendImage(form, image);
      if (metadata.note !== undefined) form.append('note', metadata.note);
    }
    if (metadata.capturedAt !== undefined) form.append('capturedAt', metadata.capturedAt);
    return unwrap((await apiClient.post(liveness ? `/service-orders/${id}/checkin-face` : `/service-orders/${id}/evidence`, form, {
      headers: { 'Content-Type': 'multipart/form-data' }, timeout: EVIDENCE_UPLOAD_TIMEOUT,
    })).data);
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
    await appendImage(form, image);
    const res = await apiClient.post(`/service-orders/${id}/evidence`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: EVIDENCE_UPLOAD_TIMEOUT,
    });
    return unwrap(res.data);
  },

  async getQuotations(id: string) {
    return get(`/service-orders/${id}/quotations`);
  },

  async getQuotation(id: string): Promise<unknown> {
    return get(`/quotations/${id}`);
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

  async reviseAdditionalCost(proposalId: string, payload: CreateAdditionalCostPayload): Promise<unknown> {
    return post(`/additional-costs/${proposalId}/revise`, payload);
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

  /** "Không sửa được" on a device of a multi-device visit: 0 đồng, no points taken. */
  async reportRepairFailed(
    id: string,
    body: { reason: string; note?: string; parts?: { partRequestId: string; outcome: 'installed' | 'returned' }[]; photoEvidenceIds?: string[] },
  ): Promise<void> {
    await apiClient.post(`/service-orders/${id}/repair-failed`, body);
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
    status?: 'completed' | 'cancelled',
    options: { excludeVisitGroups?: boolean } = {},
  ): Promise<{ data: RepairHistoryItem[]; total: number }> {
    const res = await apiClient.get('/repair-history', {
      params: { page, pageSize, status, ...(options.excludeVisitGroups ? { excludeVisitGroups: 'true' } : {}) },
    });
    return { data: unwrap(res.data), total: res.data.meta?.total ?? 0 };
  },

  async getStatusHistory(id: string): Promise<OrderStatusHistoryResponse[]> {
    return get<OrderStatusHistoryResponse[]>(`/service-orders/${id}/status-history`);
  },

  async getOrderWarranties(id: string): Promise<WarrantyCoverageItem[]> {
    return get<WarrantyCoverageItem[]>(`/service-orders/${id}/warranties`);
  },

  async getWarranties(id: string): Promise<WarrantyCoverageItem[]> {
    return this.getOrderWarranties(id);
  },

  async getOrderWarrantyClaims(id: string): Promise<WarrantyClaimView[]> {
    return get<WarrantyClaimView[]>(`/service-orders/${id}/warranty-claims`);
  },

  async createWarrantyClaim(
    id: string,
    payload: CreateWarrantyClaimPayload,
  ): Promise<WarrantyClaimView> {
    return unwrap<WarrantyClaimView>(
      (await apiClient.post(`/service-orders/${id}/warranty-claims`, payload)).data,
    );
  },

  async respondWarrantyClaim(
    id: string,
    claimId: string,
    payload: { decision: 'agree' | 'dispute'; note?: string },
  ): Promise<WarrantyClaimView> {
    return unwrap<WarrantyClaimView>(
      (
        await apiClient.post(
          `/service-orders/${id}/warranty-claims/${claimId}/respond`,
          payload,
        )
      ).data,
    );
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

  async payInvoiceWithWallet(id: string): Promise<unknown> {
    return unwrap((await apiClient.post(`/invoices/${id}/pay-with-wallet`)).data);
  },

  /** A genuine zero invoice is confirmed without a provider or wallet transaction (BE P013). */
  async confirmNoCharge(id: string): Promise<unknown> {
    return unwrap((await apiClient.post(`/invoices/${id}/no-charge`)).data);
  },

  async createVnpayUrl(id: string): Promise<string> {
    // The marker makes the backend deep-link back to the app after VNPay instead of the web page.
    const payload = unwrap((await apiClient.post(`/invoices/${id}/vnpay-url`, {}, { headers: { 'x-client-platform': 'mobile' } })).data);
    const url = typeof payload.paymentUrl === 'string'
      ? payload.paymentUrl.trim()
      : '';
    if (!/^https:\/\//i.test(url)) {
      throw new Error('Backend returned an invalid VNPay payment URL');
    }
    return url;
  },
};
