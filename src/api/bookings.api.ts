// src/api/bookings.api.ts
import apiClient from './client';
import type { BookingDeviceAttributes } from './catalog-pricing.api';
import type { BookingSchedule } from '../utils/booking-session';

export const USER_UUID_REGEX =/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function unwrap<T>(payload: { data: T } | T): T {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

export interface CustomerBookingInvitation {
  id: string;
  bookingId: string;
  priorityOrder: number;
  status: 'PENDING' | 'STANDBY' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED' | 'CANCELLED';
  invitedAt: string;
  expiresAt: string | null;
}

export interface BookingItem {
  id: string;
  customerId: string;
  serviceOrderId?: string | null;
  /** Set when this booking is one device of a multi-device visit. */
  visitGroupId?: string | null;
  /** A visit can be moved once; the server counts it on each device. */
  rescheduleCount?: number;
  invitations?: CustomerBookingInvitation[] | null;
  serviceId: string;
  serviceName?: string;
  addressId: string;
  addressSummary?: string;
  description: string;
  preferredAt: string;
  urgency: 'LOW' | 'NORMAL' | 'HIGH' | 'EMERGENCY';
  status: 'PENDING' | 'MATCHING' | 'CONFIRMED' | 'CANCELLED' | 'SUBMITTED' | 'CLOSED' | 'MATCHED';
  preferredStartAt?: string;
  preferredEndAt?: string;
  /** scheduled = one session (sáng/chiều), urgent = tới ngay. */
  bookingMode?: 'scheduled' | 'urgent';
  slot?: BookingSlot | null;
  customerNote?: string | null;
  createdAt: string;
  mediaUrls?: string[];
  diagnosis?: {
    possibleIssues: string[];
    possibleCauses: string[];
    suggestedPriceMin: number;
    suggestedPriceMax: number;
    confidence: number;
  };
}

/** Exact server counts for the Activity tabs and their filters (`GET /bookings/my/activity-counts`). */
export interface ActivityCounts {
  repair: { all: number; in_progress: number; completed: number; cancelled: number };
  request: { all: number; no_technician: number; sent: number; cancelled: number };
}

export interface BookingsPage {
  data: BookingItem[];
  total: number;
}

function toPositiveInt(value: number, fallback: number): number {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

export interface CreateBookingDto {
  serviceId: string;
  addressId: string;
  description: string;
  preferredStartAt: string;
  preferredEndAt: string;
  /** Session booking (web parity): the server takes the window from `date` + `slot`, or starts now when urgent. */
  mode?: 'scheduled' | 'urgent';
  date?: string;
  slot?: BookingSlot;
  customerNote?: string;
  quantity?: number;
  urgency: 'LOW' | 'NORMAL' | 'HIGH' | 'EMERGENCY';
  mediaUrls?: string[];
  photoUploadIds?: string[];
  aiDiagnosisId?: string;
  /** Session id from the assistant; the technician receives a summary of it. */
  aiSessionId?: string;
  /** P012: customer-reported device facts; the server validates them and derives the pricing snapshot itself. */
  deviceAttributes?: BookingDeviceAttributes;
  /** P012: approved variant code, sent only after the preview confirmed it with FIXED_PRICE. */
  selectedVariantCode?: string;
}

export interface TechnicianCandidate {
  id: string;
  technicianId?: string;
  userId: string;
  fullName: string;
  avatarUrl?: string;
  /** null while the technician has no reviews; never shown as a score. */
  averageRating: number | null;
  ratingCount: number;
  yearsExperience: number;
  reliabilityScore: number;
  distanceKm?: number;
  isAvailable: boolean;
  listedLaborPrice?: number | null;
  typicalWarrantyDays?: number;
  bio?: string | null;
  completedOrdersCount?: number;
  completionRate?: number;
}

export interface DiagnosisResult {
  id?: string;
  possibleProblems?: string[];
  possibleCauses?: string[];
  urgency?: string;
  estimatedCostMin?: number;
  estimatedCostMax?: number;
  suggestedServiceId?: string | null;
  suggestedServiceName?: string | null;
  confidence: number;
  isFallback?: boolean;
  disclaimer?: string;
  recommendedActions?: string[];
}

export interface TechnicianBookingPreview {
  id: string;
  province: string | null;
  district: string | null;
  serviceName: string | null;
  quantity: number;
  urgency: string;
  preferredStartAt: string | null;
  preferredEndAt: string | null;
  bookingMode?: 'scheduled' | 'urgent';
  slot?: BookingSlot | null;
  /** PO 18/10/2026: what the technician needs to decide before accepting; never the address or phone. */
  description?: string | null;
  aiSummary?: AiBookingSummary | null;
  media?: BookingMedia[];
  /** `fixed_price` (listed price) or `inspection_required` (quote after checking). */
  pricingMode?: string | null;
  fixedUnitPrice?: number | null;
  /** A coarse band, never an exact distance: {0,1}, {1,3} ... {40,null}. */
  distanceBand?: { minKm: number; maxKm: number | null } | null;
}

export interface AiBookingSummary {
  deviceName?: string | null;
  customerText?: string | null;
  suspectedFaults?: string[];
  suggestedActions?: string[];
  conclusion?: string | null;
  priceMin?: number | null;
  priceMax?: number | null;
  recommendedServiceName?: string | null;
  /** What the customer already tried, ruled out or suspects. */
  notes?: string[];
}

export interface BookingMedia {
  id: string;
  url: string | null;
  isPrivate: boolean;
  mimeType: string;
}

const finiteOrNull = (v: unknown): number | null => (v != null && Number.isFinite(Number(v)) ? Number(v) : null);

function previewBand(v: unknown): TechnicianBookingPreview['distanceBand'] {
  if (!v || typeof v !== 'object') return null;
  const { minKm, maxKm } = v as { minKm?: unknown; maxKm?: unknown };
  const min = finiteOrNull(minKm);
  const max = maxKm === null ? null : finiteOrNull(maxKm);
  return min == null || min < 0 || (max != null && max <= min) || (maxKm !== null && max == null) ? null : { minKm: min, maxKm: max };
}

/** Keeps only media with the shape the viewer relies on; a private item never carries a url. */
function previewMedia(v: unknown): BookingMedia[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((m) => {
    if (!m || typeof m !== 'object' || typeof m.id !== 'string' || !m.id.trim() || typeof m.mimeType !== 'string'
      || typeof m.isPrivate !== 'boolean' || (m.url !== null && typeof m.url !== 'string')) return [];
    return [{ id: m.id, url: m.isPrivate ? null : m.url, isPrivate: m.isPrivate, mimeType: m.mimeType }];
  });
}

const normalizePreview = (booking: TechnicianBookingPreview): TechnicianBookingPreview => ({
  id: booking.id,
  province: booking.province,
  district: booking.district,
  serviceName: booking.serviceName,
  quantity: booking.quantity,
  urgency: booking.urgency,
  preferredStartAt: booking.preferredStartAt,
  preferredEndAt: booking.preferredEndAt,
  bookingMode: booking.bookingMode,
  slot: booking.slot,
  description: typeof booking.description === 'string' && booking.description.trim() ? booking.description : null,
  aiSummary: booking.aiSummary && typeof booking.aiSummary === 'object' ? booking.aiSummary : null,
  media: previewMedia(booking.media),
  pricingMode: typeof booking.pricingMode === 'string' ? booking.pricingMode : null,
  fixedUnitPrice: finiteOrNull(booking.fixedUnitPrice),
  distanceBand: previewBand(booking.distanceBand),
});

export interface InvitationItem {
  id: string;
  bookingId: string;
  booking?: TechnicianBookingPreview;
  /** Every device of a multi-device visit (more than one); accepting takes them all. */
  visitDevices?: { sequence: number; deviceLabel: string | null; booking: TechnicianBookingPreview }[];
  priorityOrder: number;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED';
  invitedAt: string;
  expiresAt: string | null;
}

type RawBooking = BookingItem & {
  service?: { name: string };
  serviceNameSnapshot?: string;
  addressTextSnapshot?: string;
  media?: { url: string }[];
};

export const normalizeBooking = (booking: RawBooking): BookingItem => ({
  ...booking,
  serviceName: booking.serviceNameSnapshot || booking.service?.name,
  addressSummary: booking.addressTextSnapshot,
  preferredAt: booking.preferredStartAt || booking.preferredAt,
  status: booking.status?.toUpperCase() as BookingItem['status'],
  urgency: booking.urgency?.toUpperCase() as BookingItem['urgency'],
  invitations: booking.invitations?.map((invitation) => ({
    ...invitation,
    status: invitation.status?.toUpperCase() as CustomerBookingInvitation['status'],
  })) ?? booking.invitations,
  mediaUrls: booking.mediaUrls?.length
    ? booking.mediaUrls
    : booking.media?.map((m) => m.url) || [],
});

export type BookingSlot = 'morning' | 'afternoon' | 'evening';

export interface SessionOption {
  date: string;
  slot: BookingSlot;
  label: string;
  available: boolean;
  reason: string | null;
}

export const bookingsApi = {
  /** Next 14 days of sessions; with `previous` it tells whether the former technician is free in each. */
  async availableSessions(bookingId: string, previous = false): Promise<{ technicianId: string | null; sessions: SessionOption[] }> {
    const res = await apiClient.get(`/bookings/${bookingId}/available-slots`, {
      params: { days: 14, ...(previous ? { previous: 1 } : {}) },
    });
    const data = unwrap<{ technicianId?: string | null; sessions?: SessionOption[] }>(res.data);
    return { technicianId: data?.technicianId ?? null, sessions: data?.sessions ?? [] };
  },

  /** New booking with the same service and address; the former technician is invited when free. */
  async rebook(
    bookingId: string,
    dto: { date: string; slot: BookingSlot; customerNote?: string },
  ): Promise<{ booking: BookingItem; previousTechnicianInvited: boolean }> {
    const res = await apiClient.post(`/bookings/${bookingId}/rebook`, { mode: 'scheduled', ...dto });
    const { previousTechnicianInvited, ...booking } = unwrap<RawBooking & { previousTechnicianInvited?: boolean }>(res.data);
    return { booking: normalizeBooking(booking), previousTechnicianInvited: previousTechnicianInvited === true };
  },

  async createBooking(dto: CreateBookingDto): Promise<BookingItem> {
    const urgencyMap: Record<string, string> = {
      LOW: 'low',
      NORMAL: 'medium',
      HIGH: 'high',
      EMERGENCY: 'critical',
    };
    const body = { ...dto, urgency: urgencyMap[dto.urgency] || dto.urgency };
    const res = await apiClient.post('/bookings', body);
    return normalizeBooking(unwrap<RawBooking>(res.data));
  },

  async getMyBookings(): Promise<BookingItem[]> {
    const res = await apiClient.get('/bookings/my');
    return unwrap<RawBooking[]>(res.data).map(normalizeBooking);
  },

  async getActivityCounts(): Promise<ActivityCounts> {
    const res = await apiClient.get('/bookings/my/activity-counts');
    const data = unwrap<{ repair?: Record<string, unknown>; request?: Record<string, unknown> }>(res.data);
    const n = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0);
    const repair = { in_progress: n(data?.repair?.in_progress), completed: n(data?.repair?.completed), cancelled: n(data?.repair?.cancelled) };
    const request = { no_technician: n(data?.request?.no_technician), sent: n(data?.request?.sent), cancelled: n(data?.request?.cancelled) };
    return {
      repair: { all: repair.in_progress + repair.completed + repair.cancelled, ...repair },
      request: { all: request.no_technician + request.sent + request.cancelled, ...request },
    };
  },

  /** `excludeVisitGroups` leaves out devices of a multi-device visit; those are listed by `visitGroupsApi`. */
  async getMyBookingsPage(page = 1, pageSize = 20, options: { excludeVisitGroups?: boolean } = {}): Promise<BookingsPage> {
    const safePage = toPositiveInt(page, 1);
    const safePageSize = Math.min(toPositiveInt(pageSize, 20), 100);
    const res = await apiClient.get('/bookings/my', {
      params: { page: safePage, pageSize: safePageSize, ...(options.excludeVisitGroups ? { excludeVisitGroups: 'true' } : {}) },
    });
    const body: unknown = res.data;
    const envelope = !Array.isArray(body) && body !== null && typeof body === 'object'
      ? body as { data?: unknown; meta?: { total?: unknown } }
      : undefined;
    const rows = Array.isArray(body)
      ? body as RawBooking[]
      : Array.isArray(envelope?.data) ? envelope.data as RawBooking[] : null;
    if (rows === null) throw new Error('Invalid bookings page response');
    const total = typeof envelope?.meta?.total === 'number' && envelope.meta.total >= 0
      ? envelope.meta.total : rows.length;
    return { data: rows.map(normalizeBooking), total };
  },

  async getBooking(id: string): Promise<BookingItem> {
    const res = await apiClient.get(`/bookings/${id}`);
    return normalizeBooking(unwrap<RawBooking>(res.data));
  },

  async diagnoseAI(dto: {
    description: string;
    serviceId?: string;
    imageUrl?: string;
    images?: string[];
    categoryHint?: string;
  }): Promise<DiagnosisResult> {
    const res = await apiClient.post('/ai/diagnoses', dto);
    return unwrap<DiagnosisResult>(res.data);
  },

  async getCandidates(bookingId: string): Promise<TechnicianCandidate[]> {
    const res = await apiClient.get(
      `/bookings/${bookingId}/technician-candidates`,
    );
    const candidates = unwrap<TechnicianCandidate[]>(res.data);
    return candidates.map((candidate) => {
      // Backend exposes both IDs. Only the User ID is valid in a shortlist.
      if (!candidate.userId || !USER_UUID_REGEX.test(candidate.userId)) {
        throw new Error('Candidate is missing a valid technician User ID');
      }
      return { ...candidate, id: candidate.userId };
    });
  },

  async sendShortlist(
    bookingId: string,
    technicianUserIds: readonly [string] | readonly [string, string],
  ): Promise<void> {
    if (!Array.isArray(technicianUserIds)
      || technicianUserIds.length < 1
      || technicianUserIds.length > 2
      || new Set(technicianUserIds).size !== technicianUserIds.length
      || !technicianUserIds.every((id) => typeof id === 'string' && USER_UUID_REGEX.test(id))) {
      throw new Error('Select 1 or 2 different technicians in priority order');
    }
    // Preserve priority order: the Backend decides invitation activation and acceptance.
    await apiClient.post(`/bookings/${bookingId}/shortlist`, { technicianIds: [...technicianUserIds] });
  },
  async getMyInvitations(): Promise<InvitationItem[]> {
    const res = await apiClient.get('/invitations/my');
    const invitations = unwrap<InvitationItem[]>(res.data);
    return invitations.map((inv) => {
      // A visit of several devices lists every device; they are taken together on Accept.
      const visitDevices = (Array.isArray(inv.visitDevices) ? inv.visitDevices : [])
        .filter((d) => d && d.booking && typeof d.sequence === 'number')
        .map((d) => ({ sequence: d.sequence, deviceLabel: d.deviceLabel ?? null, booking: normalizePreview(d.booking) }));
      return {
      id: inv.id,
      bookingId: inv.bookingId,
      priorityOrder: inv.priorityOrder,
      status: inv.status?.toUpperCase() as InvitationItem['status'],
      invitedAt: inv.invitedAt,
      expiresAt: inv.expiresAt ?? null,
      // Allowlist: a live invitation never exposes a full Booking or private customer media.
      booking: inv.booking ? normalizePreview(inv.booking) : undefined,
      ...(visitDevices.length > 1 ? { visitDevices } : {}),
      };
    });
  },
  async respondInvitation(
    id: string,
    action: 'ACCEPT' | 'DECLINE',
  ): Promise<{ serviceOrder?: { id: string } }> {
    const res = await apiClient.post(`/invitations/${id}/respond`, { action });
    return unwrap(res.data);
  },

  /** Gives the pending invitations of a matching booking more time (same rule as the web). */
  async extendMatching(bookingId: string): Promise<{ expiresAt: string; extendedInvitationCount: number }> {
    const res = await apiClient.post(`/bookings/${bookingId}/matching/extend`);
    const data = unwrap<{ bookingId?: string; expiresAt?: string; extendedInvitationCount?: number }>(res.data);
    if (!data || data.bookingId !== bookingId || typeof data.expiresAt !== 'string' || !Number.isFinite(Date.parse(data.expiresAt))
      || typeof data.extendedInvitationCount !== 'number' || data.extendedInvitationCount < 1) {
      throw new Error('Invalid matching extension response');
    }
    return { expiresAt: data.expiresAt, extendedInvitationCount: data.extendedInvitationCount };
  },

  async cancelBooking(id: string, reason: string): Promise<BookingItem> {
    const res = await apiClient.post(`/bookings/${id}/cancel`, { reason });
    return normalizeBooking(unwrap<RawBooking>(res.data));
  },

  /** Moves a booking to another session; the server turns it into the arrival window, as on the web. It refuses "tới ngay". */
  async reschedule(id: string, schedule: Extract<BookingSchedule, { mode: 'scheduled' }>): Promise<BookingItem> {
    const res = await apiClient.patch(`/bookings/${id}/schedule`, schedule);
    return normalizeBooking(unwrap<RawBooking>(res.data));
  },

  async attachMedia(
    bookingId: string,
    url: string,
    mimeType?: string,
  ): Promise<void> {
    await apiClient.post(`/bookings/${bookingId}/media`, { url, mimeType });
  },
};
