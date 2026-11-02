// src/api/visit-groups.api.ts
// Up to three devices in one visit (PO 21/10/2026): one technician with every
// skill takes them all and the customer pays once for the devices repaired.
import apiClient from './client';
import { CANDIDATES_TIMEOUT_MS } from '../constants/config';
import type { BookingDeviceAttributes } from './catalog-pricing.api';
import { normalizeBooking, USER_UUID_REGEX } from './bookings.api';
import type { BookingItem, BookingSlot, SessionOption, TechnicianCandidate } from './bookings.api';

/** The most devices one visit takes; the form locks "Thêm thiết bị" at this count. */
export const VISIT_DEVICE_LIMIT = 3;

export type VisitBookingMode = 'scheduled' | 'urgent';

export interface VisitDeviceInput {
  serviceId: string;
  deviceLabel?: string;
  description?: string;
  deviceAttributes?: BookingDeviceAttributes;
  selectedVariantCode?: string;
  photoUploadIds?: string[];
}

export interface CreateVisitDto {
  addressId: string;
  mode: VisitBookingMode;
  date?: string;
  slot?: BookingSlot;
  customerNote?: string;
  urgency?: 'LOW' | 'NORMAL' | 'HIGH' | 'EMERGENCY';
  idempotencyKey: string;
  /** The assistant conversation that suggested the visit; its summary goes with the first device. */
  aiSessionId?: string;
  items: VisitDeviceInput[];
}

export interface VisitItem {
  id: string;
  sequence: number;
  serviceId: string;
  deviceLabel: string | null;
  booking: BookingItem | null;
}

export interface Visit {
  id: string;
  status: 'submitted' | 'cancelled';
  bookingMode: VisitBookingMode;
  slot: BookingSlot | null;
  preferredStartAt: string;
  preferredEndAt: string;
  leadBookingId: string | null;
  items: VisitItem[];
}

export type VisitGroupReadStatus =
  | 'submitted'
  | 'matching'
  | 'no_technician'
  | 'accepted'
  | 'en_route'
  | 'under_repair'
  | 'completed'
  | 'cancelled'
  | 'failed'
  | 'quote_declined'
  | 'mixed';

export type VisitGroupTechnicianTab = 'all' | 'in_progress' | 'accepted' | 'en_route' | 'under_repair' | 'completed' | 'cancelled' | 'failed' | 'quote_declined' | 'mixed';

export interface VisitGroupPageDevice {
  itemId: string;
  sequence: number;
  bookingId: string;
  serviceId: string;
  deviceLabel: string | null;
  outcome: 'succeeded' | 'failed' | 'quote_declined' | null;
  bookingStatus: string;
  serviceName: string | null;
  orderId: string | null;
  orderCode: string | null;
  orderStatus: string | null;
}

/** A server-paged parent row for the customer or assigned technician lists. */
export interface VisitGroupPageItem {
  id: string;
  createdAt: string;
  bookingMode: VisitBookingMode;
  slot: BookingSlot | null;
  scheduledAt: string | null;
  scheduledEndAt: string | null;
  /** Shared address of the devices; the orders carry it only once a technician has taken the visit. */
  addressSummary?: string | null;
  status: VisitGroupReadStatus;
  items: VisitGroupPageDevice[];
}

export interface VisitGroupsPage {
  data: VisitGroupPageItem[];
  total: number;
}

export type VisitDeviceState = 'succeeded' | 'failed' | 'quote_declined' | 'cancelled' | 'open';

export interface VisitCheckout {
  visitGroupId: string;
  devices: {
    sequence: number;
    deviceLabel: string | null;
    bookingId: string;
    serviceName: string | null;
    serviceOrderId: string | null;
    orderCode: string | null;
    state: VisitDeviceState;
    invoiceId: string | null;
    amount: number;
    paid: boolean;
  }[];
  total: number;
  waiting: number;
  ready: boolean;
  paid: boolean;
  pendingCash: { id: string; amount: number; declaredAt: string } | null;
}

const URGENCY = { LOW: 'low', NORMAL: 'medium', HIGH: 'high', EMERGENCY: 'critical' } as const;

function unwrap<T>(payload: unknown): T {
  return (payload && typeof payload === 'object' && 'data' in payload ? (payload as { data: T }).data : payload) as T;
}

function normalizeVisit(raw: Visit): Visit {
  return {
    ...raw,
    items: (raw.items ?? []).map((item) => ({ ...item, booking: item.booking ? normalizeBooking(item.booking) : null })),
  };
}

function toPositiveInt(value: number, fallback: number): number {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

/** `{ data: [...], meta: { total } }`; anything else is rejected rather than shown as an empty list. */
function readPage(body: unknown): VisitGroupsPage {
  const envelope = body && typeof body === 'object' && !Array.isArray(body) ? (body as { data?: unknown; meta?: { total?: unknown } }) : undefined;
  const rows = Array.isArray(body) ? body : Array.isArray(envelope?.data) ? envelope.data : null;
  if (rows === null) throw new Error('Danh sách lượt sửa từ máy chủ không hợp lệ.');
  const total = typeof envelope?.meta?.total === 'number' && envelope.meta.total >= 0 ? envelope.meta.total : rows.length;
  return { data: rows as VisitGroupPageItem[], total };
}

function pageParams(page: number, pageSize: number) {
  return { page: toPositiveInt(page, 1), pageSize: Math.min(toPositiveInt(pageSize, 20), 100) };
}

export const visitGroupsApi = {
  /** Whether several devices may be booked now, and the limit. */
  async contact(): Promise<{ enabled: boolean; deviceLimit: number; hotline: string | null }> {
    const data = unwrap<{ enabled?: boolean; deviceLimit?: number; hotline?: string | null } | undefined>((await apiClient.get('/visit-groups/contact')).data);
    const hotline = typeof data?.hotline === 'string' ? data.hotline.trim() : '';
    return { enabled: data?.enabled === true, deviceLimit: Number(data?.deviceLimit) || VISIT_DEVICE_LIMIT, hotline: hotline || null };
  },

  async consultation(dto: { message: string; devices?: string[] }): Promise<void> {
    await apiClient.post('/visit-groups/consultation', dto);
  },

  async create(dto: CreateVisitDto): Promise<Visit> {
    const body = { ...dto, ...(dto.urgency ? { urgency: URGENCY[dto.urgency] } : {}) };
    return normalizeVisit(unwrap<Visit>((await apiClient.post('/visit-groups', body)).data));
  },

  async get(id: string): Promise<Visit> {
    return normalizeVisit(unwrap<Visit>((await apiClient.get(`/visit-groups/${id}`)).data));
  },

  /** Customer-owned visits; filtering, search and totals stay on the server. */
  async getMyPage(page = 1, pageSize = 20, filter: { status?: VisitGroupReadStatus; q?: string } = {}): Promise<VisitGroupsPage> {
    const q = filter.q?.trim();
    const res = await apiClient.get('/visit-groups/my-page', {
      params: { ...pageParams(page, pageSize), ...(filter.status ? { status: filter.status } : {}), ...(q ? { q } : {}) },
    });
    return readPage(res.data);
  },

  /** Visits assigned to the signed-in technician; the response holds only authorized orders. */
  async getAssignedPage(page = 1, pageSize = 20, tab?: VisitGroupTechnicianTab): Promise<VisitGroupsPage> {
    const res = await apiClient.get('/visit-groups/assigned-page', { params: { ...pageParams(page, pageSize), ...(tab ? { tab } : {}) } });
    return readPage(res.data);
  },

  async getCandidates(id: string): Promise<TechnicianCandidate[]> {
    const candidates = unwrap<TechnicianCandidate[]>((await apiClient.get(`/visit-groups/${id}/technician-candidates`, { timeout: CANDIDATES_TIMEOUT_MS })).data);
    return candidates.map((candidate) => {
      // Only the technician User ID is valid in a shortlist.
      if (!candidate.userId || !USER_UUID_REGEX.test(candidate.userId)) throw new Error('Candidate is missing a valid technician User ID');
      return { ...candidate, id: candidate.userId };
    });
  },

  async sendShortlist(id: string, technicianUserIds: readonly [string] | readonly [string, string]): Promise<void> {
    if (technicianUserIds.length < 1 || technicianUserIds.length > 2
      || new Set(technicianUserIds).size !== technicianUserIds.length
      || !technicianUserIds.every((userId) => USER_UUID_REGEX.test(userId))) {
      throw new Error('Select 1 or 2 different technicians in priority order');
    }
    await apiClient.post(`/visit-groups/${id}/shortlist`, { technicianIds: [...technicianUserIds] });
  },

  /** One reschedule per visit; every device moves together. */
  async reschedule(id: string, dto: { date: string; slot: BookingSlot }): Promise<Visit> {
    return normalizeVisit(unwrap<Visit>((await apiClient.post(`/visit-groups/${id}/reschedule`, { mode: 'scheduled', ...dto })).data));
  },

  /** Sessions the technician holding the visit is free for, through its lead booking. */
  async getAvailableSessions(leadBookingId: string): Promise<SessionOption[]> {
    const data = unwrap<{ sessions?: SessionOption[] } | undefined>((await apiClient.get(`/bookings/${leadBookingId}/available-slots`, { params: { days: 14 } })).data);
    return data?.sessions ?? [];
  },

  async cancel(id: string, reason: string): Promise<Visit> {
    return normalizeVisit(unwrap<Visit>((await apiClient.post(`/visit-groups/${id}/cancel`, { reason })).data));
  },

  /** Technician leaves the whole visit; every order goes back to matching. */
  async withdraw(id: string, reason: string): Promise<void> {
    await apiClient.post(`/visit-groups/${id}/withdraw`, { reason });
  },

  async getCheckout(id: string): Promise<VisitCheckout> {
    return unwrap<VisitCheckout>((await apiClient.get(`/visit-groups/${id}/checkout`)).data);
  },

  async payWithWallet(id: string): Promise<{ amount: number; balance: number }> {
    return unwrap<{ amount: number; balance: number }>((await apiClient.post(`/visit-groups/${id}/checkout/wallet`)).data);
  },

  async createVnpayUrl(id: string): Promise<string> {
    // The marker makes the backend deep-link back to the app after VNPay instead of the web page.
    const res = await apiClient.post(`/visit-groups/${id}/checkout/vnpay`, {}, { headers: { 'x-client-platform': 'mobile' } });
    const url = unwrap<{ paymentUrl?: unknown } | undefined>(res.data)?.paymentUrl;
    if (typeof url !== 'string' || !/^https:\/\//i.test(url.trim())) throw new Error('Backend returned an invalid VNPay payment URL');
    return url.trim();
  },

  async declareCash(id: string, declaredAmount: number): Promise<void> {
    await apiClient.post(`/visit-groups/${id}/checkout/cash/declare`, { declaredAmount });
  },

  async confirmCash(id: string, agreed: boolean, disputeReason?: string): Promise<void> {
    await apiClient.post(`/visit-groups/${id}/checkout/cash/confirm`, agreed ? { agreed } : { agreed, disputeReason });
  },
};

/** Why an approved device of a visit could not be made to work; the technician taps one. */
export const REPAIR_FAILURE_REASONS = [
  { code: 'no_part', label: 'Không có linh kiện thay thế phù hợp' },
  { code: 'beyond_repair', label: 'Máy hỏng nặng, không sửa được' },
  { code: 'needs_workshop', label: 'Cần mang về xưởng để sửa' },
  { code: 'other', label: 'Lý do khác' },
] as const;
export type RepairFailureReason = (typeof REPAIR_FAILURE_REASONS)[number]['code'];
