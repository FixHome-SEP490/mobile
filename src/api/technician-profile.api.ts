// src/api/technician-profile.api.ts
import apiClient from './client';

export interface TechnicianScheduleSlot {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

export interface TechnicianTimeOff {
  id: string;
  startAt: string;
  endAt: string;
  reason: string | null;
}

export interface TechnicianServiceOffering {
  id: string;
  serviceId: string;
  listedLaborPrice: number | null;
  typicalWarrantyDays: number | null;
  level: string;
  isActive: boolean;
  verificationStatus: 'pending' | 'verified' | 'rejected';
}

export interface TechnicianProfile {
  bio: string | null;
  yearsExperience: number;
  isAvailable: boolean;
  averageRating: number;
  ratingCount: number;
  reliabilityScore: number;
  serviceRadiusKm: number;
  schedules: TechnicianScheduleSlot[];
}

export interface UpdateTechnicianProfileRequest {
  bio?: string;
  isAvailable?: boolean;
  yearsExperience?: number;
  serviceRadiusKm?: number;
}

export interface UpdateSkillPricingRequest {
  listedLaborPrice?: number | null;
  typicalWarrantyDays?: number | null;
  level?: string;
  isActive?: boolean;
}

function unwrap<T>(payload: { data: T } | T): T {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

/** Backend may omit rating/reliability fields (e.g. no reviews yet) — default like web does. */
function normalizeProfile(profile: Partial<TechnicianProfile> | null | undefined): TechnicianProfile {
  return {
    bio: profile?.bio ?? null,
    yearsExperience: Number(profile?.yearsExperience ?? 0),
    isAvailable: Boolean(profile?.isAvailable ?? true),
    averageRating: Number(profile?.averageRating ?? 5),
    ratingCount: Number(profile?.ratingCount ?? 0),
    reliabilityScore: Number(profile?.reliabilityScore ?? 100),
    serviceRadiusKm: Number(profile?.serviceRadiusKm ?? 10),
    schedules: Array.isArray(profile?.schedules) ? profile.schedules : [],
  };
}

export const technicianProfileApi = {
  async getMyProfile(): Promise<TechnicianProfile> {
    const res = await apiClient.get<{ data: TechnicianProfile } | TechnicianProfile>(
      '/technicians/me/profile',
    );
    return normalizeProfile(unwrap(res.data));
  },

  async updateMyProfile(data: UpdateTechnicianProfileRequest): Promise<TechnicianProfile> {
    const res = await apiClient.patch<{ data: TechnicianProfile } | TechnicianProfile>(
      '/technicians/me/profile',
      data,
    );
    return normalizeProfile(unwrap(res.data));
  },

  async getMySchedule(): Promise<TechnicianScheduleSlot[]> {
    const res = await apiClient.get<{ data: TechnicianScheduleSlot[] } | TechnicianScheduleSlot[]>(
      '/technicians/me/schedule',
    );
    const result = unwrap(res.data);
    return Array.isArray(result) ? result : [];
  },

  async updateMySchedule(schedules: TechnicianScheduleSlot[]): Promise<TechnicianScheduleSlot[]> {
    const res = await apiClient.put<{ data: TechnicianScheduleSlot[] } | TechnicianScheduleSlot[]>(
      '/technicians/me/schedule',
      { schedules },
    );
    const result = unwrap(res.data);
    return Array.isArray(result) ? result : [];
  },

  async getMyTimeOff(): Promise<TechnicianTimeOff[]> {
    const res = await apiClient.get<{ data: TechnicianTimeOff[] } | TechnicianTimeOff[]>(
      '/technicians/me/time-off',
    );
    const result = unwrap(res.data);
    return Array.isArray(result) ? result : [];
  },

  async createTimeOff(data: {
    startAt: string;
    endAt: string;
    reason?: string;
  }): Promise<TechnicianTimeOff> {
    const res = await apiClient.post<{ data: TechnicianTimeOff } | TechnicianTimeOff>(
      '/technicians/me/time-off',
      data,
    );
    return unwrap(res.data);
  },

  async deleteTimeOff(id: string): Promise<void> {
    await apiClient.delete(`/technicians/me/time-off/${id}`);
  },

  async getMyServices(): Promise<TechnicianServiceOffering[]> {
    const res = await apiClient.get<
      { data: TechnicianServiceOffering[] } | TechnicianServiceOffering[]
    >('/technicians/me/services');
    const result = unwrap(res.data);
    return Array.isArray(result) ? result : [];
  },

  async setSkillPricing(
    serviceId: string,
    data: UpdateSkillPricingRequest,
  ): Promise<TechnicianServiceOffering> {
    const res = await apiClient.put<
      { data: TechnicianServiceOffering } | TechnicianServiceOffering
    >(`/technicians/me/services/${serviceId}`, data);
    return unwrap(res.data);
  },
};
