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
  /** null when the server sent nothing usable; screens show "Chưa có đánh giá" for 0 reviews. */
  averageRating: number | null;
  ratingCount: number;
  /** null when the server did not send one; never replaced by a made-up score. */
  reliabilityScore: number | null;
  /** null until the technician has set a service radius. */
  serviceRadiusKm: number | null;
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

/** A number the server really sent (decimals arrive as strings), or null. */
function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/**
 * PO 07/10/2026: only real data. A missing rating, reliability score or
 * radius stays null instead of an invented 5 sao / 100% / 10 km.
 */
export function normalizeProfile(
  profile: Partial<Record<keyof TechnicianProfile, unknown>> | null | undefined,
): TechnicianProfile {
  const ratingCount = numberOrNull(profile?.ratingCount);
  return {
    bio: typeof profile?.bio === 'string' ? profile.bio : null,
    yearsExperience: numberOrNull(profile?.yearsExperience) ?? 0,
    isAvailable: profile?.isAvailable === true,
    averageRating: numberOrNull(profile?.averageRating),
    ratingCount: ratingCount !== null && Number.isInteger(ratingCount) && ratingCount > 0 ? ratingCount : 0,
    reliabilityScore: numberOrNull(profile?.reliabilityScore),
    serviceRadiusKm: numberOrNull(profile?.serviceRadiusKm),
    schedules: Array.isArray(profile?.schedules) ? (profile.schedules as TechnicianScheduleSlot[]) : [],
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
