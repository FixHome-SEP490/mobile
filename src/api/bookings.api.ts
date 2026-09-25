// src/api/bookings.api.ts
import apiClient from './client';

const USER_UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  quantity?: number;
  urgency: 'LOW' | 'NORMAL' | 'HIGH' | 'EMERGENCY';
  mediaUrls?: string[];
  photoUploadIds?: string[];
  aiDiagnosisId?: string;
}

export interface TechnicianCandidate {
  id: string;
  technicianId?: string;
  userId: string;
  fullName: string;
  avatarUrl?: string;
  averageRating: number;
  ratingCount: number;
  yearsExperience: number;
  reliabilityScore: number;
  distanceKm?: number;
  isAvailable: boolean;
  listedLaborPrice?: number | null;
  typicalWarrantyDays?: number;
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
}

export interface InvitationItem {
  id: string;
  bookingId: string;
  booking?: TechnicianBookingPreview;
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

const normalizeBooking = (booking: RawBooking): BookingItem => ({
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

export const bookingsApi = {
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

  async getMyBookingsPage(page = 1, pageSize = 20): Promise<BookingsPage> {
    const safePage = toPositiveInt(page, 1);
    const safePageSize = Math.min(toPositiveInt(pageSize, 20), 100);
    const res = await apiClient.get('/bookings/my', { params: { page: safePage, pageSize: safePageSize } });
    const body = res.data as { data?: RawBooking[]; meta?: { total?: number } } | RawBooking[];
    const rows = Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : [];
    const total = !Array.isArray(body)
      && typeof body?.meta?.total === 'number' && body.meta.total >= 0
      ? body.meta.total : rows.length;
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
    technicianUserIds: readonly [string, string],
  ): Promise<void> {
    if (!Array.isArray(technicianUserIds)
      || technicianUserIds.length !== 2
      || technicianUserIds[0] === technicianUserIds[1]
      || !technicianUserIds.every((id) => typeof id === 'string' && USER_UUID_REGEX.test(id))) {
      throw new Error('Select exactly two different technicians in priority order');
    }
    // Preserve priority order: the Backend decides invitation activation and acceptance.
    await apiClient.post(`/bookings/${bookingId}/shortlist`, { technicianIds: [...technicianUserIds] });
  },
  async getMyInvitations(): Promise<InvitationItem[]> {
    const res = await apiClient.get('/invitations/my');
    const invitations = unwrap<InvitationItem[]>(res.data);
    return invitations.map((inv) => ({
      id: inv.id,
      bookingId: inv.bookingId,
      priorityOrder: inv.priorityOrder,
      status: inv.status?.toUpperCase() as InvitationItem['status'],
      invitedAt: inv.invitedAt,
      expiresAt: inv.expiresAt ?? null,
      // Allowlist: a live invitation never exposes a full Booking or private customer media.
      booking: inv.booking ? {
        id: inv.booking.id,
        province: inv.booking.province,
        district: inv.booking.district,
        serviceName: inv.booking.serviceName,
        quantity: inv.booking.quantity,
        urgency: inv.booking.urgency,
        preferredStartAt: inv.booking.preferredStartAt,
        preferredEndAt: inv.booking.preferredEndAt,
      } : undefined,
    }));
  },
  async respondInvitation(
    id: string,
    action: 'ACCEPT' | 'DECLINE',
  ): Promise<{ serviceOrder?: { id: string } }> {
    const res = await apiClient.post(`/invitations/${id}/respond`, { action });
    return unwrap(res.data);
  },

  async cancelBooking(id: string, reason: string): Promise<BookingItem> {
    const res = await apiClient.post(`/bookings/${id}/cancel`, { reason });
    return normalizeBooking(unwrap<RawBooking>(res.data));
  },

  async reschedule(
    id: string,
    preferredStartAt: string,
    preferredEndAt: string,
  ): Promise<BookingItem> {
    const res = await apiClient.patch(`/bookings/${id}/schedule`, {
      preferredStartAt,
      preferredEndAt,
    });
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
