// src/api/bookings.api.ts
import apiClient from './client';

function unwrap<T>(payload: { data: T } | T): T {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

export interface BookingItem {
  id: string;
  customerId: string;
  serviceOrderId?: string;
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

export interface CreateBookingDto {
  serviceId: string;
  addressId: string;
  description: string;
  preferredStartAt: string;
  preferredEndAt: string;
  quantity?: number;
  urgency: 'LOW' | 'NORMAL' | 'HIGH' | 'EMERGENCY';
  mediaUrls?: string[];
  aiDiagnosisId?: string;
}

export interface TechnicianCandidate {
  id: string;
  technicianId?: string;
  userId?: string;
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

export interface InvitationItem {
  id: string;
  bookingId: string;
  booking?: BookingItem;
  technicianId: string;
  priorityOrder: number;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED';
  invitedAt: string;
  expiresAt: string;
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
    return candidates.map((c) => ({
      ...c,
      id: c.userId || c.id,
      technicianId: c.userId || c.technicianId,
    }));
  },

  async sendShortlist(
    bookingId: string,
    technicianIds: string[],
  ): Promise<void> {
    await apiClient.post(`/bookings/${bookingId}/shortlist`, { technicianIds });
  },

  async getMyInvitations(): Promise<InvitationItem[]> {
    const res = await apiClient.get('/invitations/my');
    const invitations = unwrap<
      (InvitationItem & { booking: RawBooking })[]
    >(res.data);
    return invitations.map((inv) => ({
      ...inv,
      status: inv.status?.toUpperCase() as InvitationItem['status'],
      booking: inv.booking ? normalizeBooking(inv.booking) : undefined,
    }));
  },

  async respondInvitation(
    id: string,
    action: 'ACCEPT' | 'DECLINE',
  ): Promise<{ serviceOrder?: { id: string } }> {
    const res = await apiClient.post(`/invitations/${id}/respond`, { action });
    return unwrap(res.data);
  },

  async cancelBooking(id: string, reason: string): Promise<void> {
    await apiClient.post(`/bookings/${id}/cancel`, { reason });
  },

  async reschedule(
    id: string,
    preferredStartAt: string,
    preferredEndAt: string,
  ): Promise<void> {
    await apiClient.patch(`/bookings/${id}/schedule`, {
      preferredStartAt,
      preferredEndAt,
    });
  },

  async attachMedia(
    bookingId: string,
    url: string,
    mimeType?: string,
  ): Promise<void> {
    await apiClient.post(`/bookings/${bookingId}/media`, { url, mimeType });
  },
};
