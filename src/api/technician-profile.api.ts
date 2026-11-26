// src/api/technician-profile.api.ts
import apiClient from './client';
import type { TechnicianAvailability } from '../utils/availability';

export interface TechnicianScheduleSlot {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

/** Server trả thêm id/technicianId/createdAt...; backend (whitelist) từ chối các trường đó khi gửi lại, nên chỉ giữ 3 trường. */
export function toScheduleSlot(raw: unknown): TechnicianScheduleSlot {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    dayOfWeek: Number(r.dayOfWeek),
    startTime: String(r.startTime ?? '').slice(0, 5),
    endTime: String(r.endTime ?? '').slice(0, 5),
  };
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

/** Backend `SkillEvidenceType`; the trust group is derived server-side, never sent. */
export const SKILL_EVIDENCE_TYPE_VALUES = [
  'national_skill_certificate', 'vocational_diploma', 'electrical_safety_card', 'manufacturer_training',
  'employer_confirmation', 'social_insurance', 'work_photos', 'other',
] as const;
export type SkillEvidenceType = (typeof SKILL_EVIDENCE_TYPE_VALUES)[number];

const SKILL_EVIDENCE_REVIEW_VALUES = ['pending', 'valid', 'invalid', 'need_more'] as const;
export type SkillEvidenceReviewStatus = (typeof SKILL_EVIDENCE_REVIEW_VALUES)[number];

/** What the technician says about one file; dates are `YYYY-MM-DD`. Only `evidenceType` is required once any detail is sent. */
/** A paper the technician already sent: one per stored file, with the service categories it covers. */
export interface SentSkillEvidence {
  documentId: string;
  /** A skill the paper sits on, for the access route. */
  serviceId: string;
  fileName: string;
  mimeType: string;
  evidenceType: SkillEvidenceType | null;
  issuer: string | null;
  referenceNumber: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  claimedYears: number | null;
  /** False once the paper helped approve a skill (or the profile waits for review): the server refuses edit and delete. Absent on older backends. */
  editable?: boolean;
  categories: { id: string; name: string }[];
}

export interface SkillEvidenceDetails {
  evidenceType: SkillEvidenceType;
  issuer?: string;
  referenceNumber?: string;
  issuedAt?: string;
  expiresAt?: string;
  claimedYears?: number;
}

export interface SkillEvidenceDocument {
  id: string;
  fileName: string;
  /** null for a file sent before the details existed. */
  evidenceType: SkillEvidenceType | null;
  issuer: string | null;
  referenceNumber: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  claimedYears: number | null;
  reviewStatus: SkillEvidenceReviewStatus | null;
  reviewNote: string | null;
}

export interface SkillVerification {
  id: string;
  status: 'pending' | 'verified' | 'rejected';
  rejectionReason: string | null;
  documents: SkillEvidenceDocument[];
}

function normalizeEvidenceDocument(raw: unknown): SkillEvidenceDocument {
  const d = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const text = (value: unknown) => (value == null || value === '' ? null : String(value));
  const years = d.claimedYears == null ? NaN : Number(d.claimedYears);
  return {
    id: String(d.id ?? ''),
    fileName: String(d.fileName ?? ''),
    // An unknown type or review status is dropped, never guessed.
    evidenceType: SKILL_EVIDENCE_TYPE_VALUES.find((t) => t === d.evidenceType) ?? null,
    issuer: text(d.issuer),
    referenceNumber: text(d.referenceNumber),
    issuedAt: text(d.issuedAt),
    expiresAt: text(d.expiresAt),
    claimedYears: Number.isFinite(years) ? years : null,
    reviewStatus: SKILL_EVIDENCE_REVIEW_VALUES.find((s) => s === d.reviewStatus) ?? null,
    reviewNote: text(d.reviewNote),
  };
}

function normalizeSkillVerification(payload: unknown): SkillVerification {
  const v = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;
  const status = String(v.status ?? 'pending');
  return {
    id: String(v.id ?? ''),
    status: status === 'verified' || status === 'rejected' ? status : 'pending',
    rejectionReason: v.rejectionReason == null ? null : String(v.rejectionReason),
    documents: Array.isArray(v.documents) ? v.documents.map(normalizeEvidenceDocument) : [],
  };
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
  /** "Tự nhận việc": the backend accepts invitations for the technician. */
  autoAcceptInvitations: boolean;
  /** Labor warranty (days) given when a service has none of its own; null until set. */
  defaultLaborWarrantyDays: number | null;
  schedules: TechnicianScheduleSlot[];
}

export interface UpdateTechnicianProfileRequest {
  bio?: string;
  isAvailable?: boolean;
  yearsExperience?: number;
  serviceRadiusKm?: number;
  autoAcceptInvitations?: boolean;
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
    autoAcceptInvitations: profile?.autoAcceptInvitations === true,
    defaultLaborWarrantyDays: numberOrNull(profile?.defaultLaborWarrantyDays),
    schedules: Array.isArray(profile?.schedules) ? (profile.schedules as unknown[]).map(toScheduleSlot) : [],
  };
}

export const technicianProfileApi = {
  async getMyAvailability(): Promise<TechnicianAvailability> {
    const res = await apiClient.get<{ data: TechnicianAvailability } | TechnicianAvailability>('/technicians/me/availability');
    return unwrap(res.data);
  },

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

  /** applyToAllServices also overwrites every service's own warranty. Max 365 days is enforced by the backend. */
  async setDefaultLaborWarranty(days: number, applyToAllServices: boolean): Promise<{ defaultLaborWarrantyDays: number; servicesUpdated: number }> {
    const res = await apiClient.put('/technicians/me/warranty-default', { days, applyToAllServices });
    return unwrap<{ defaultLaborWarrantyDays: number; servicesUpdated: number }>(res.data);
  },

  /** Last GPS position while the app is open; the backend offers urgent jobs nearby. */
  async reportLocation(data: { lat: number; lng: number; accuracyMeters?: number }): Promise<void> {
    await apiClient.patch('/technicians/me/location', data);
  },

  async getMySchedule(): Promise<TechnicianScheduleSlot[]> {
    const res = await apiClient.get<{ data: TechnicianScheduleSlot[] } | TechnicianScheduleSlot[]>(
      '/technicians/me/schedule',
    );
    const result = unwrap(res.data);
    return Array.isArray(result) ? result.map(toScheduleSlot) : [];
  },

  async updateMySchedule(schedules: TechnicianScheduleSlot[]): Promise<TechnicianScheduleSlot[]> {
    const res = await apiClient.put<{ data: TechnicianScheduleSlot[] } | TechnicianScheduleSlot[]>(
      '/technicians/me/schedule',
      { schedules: schedules.map(toScheduleSlot) },
    );
    const result = unwrap(res.data);
    return Array.isArray(result) ? result.map(toScheduleSlot) : [];
  },

  async getMyServiceAreas(): Promise<{ provinceCode: string; districtCode: string }[]> {
    const res = await apiClient.get<{ data: { provinceCode: string; districtCode: string }[] }>(
      '/technicians/me/service-areas',
    );
    const result = unwrap(res.data);
    return Array.isArray(result) ? result.map((a) => ({ provinceCode: String(a.provinceCode), districtCode: String(a.districtCode) })) : [];
  },

  async updateMyServiceAreas(areas: { provinceCode: string; districtCode: string }[]): Promise<void> {
    await apiClient.put('/technicians/me/service-areas', { areas });
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
    if (!Array.isArray(result)) {
      throw new Error('Danh sách dịch vụ từ máy chủ không hợp lệ.');
    }
    return result;
  },

  /** The service's verification (with the reason when it was refused); null before any certificate was sent. */
  async getSkillVerification(serviceId: string): Promise<SkillVerification | null> {
    const res = await apiClient.get<{ data: unknown } | unknown>(`/technicians/me/services/${serviceId}/verification`);
    const data = unwrap(res.data as { data: unknown });
    return data == null ? null : normalizeSkillVerification(data);
  },

  async requestSkillEvidenceUploadUrl(serviceId: string, mimeType: string): Promise<{ storageObjectPath: string; uploadUrl: string }> {
    const res = await apiClient.post<{ data: unknown } | unknown>(`/technicians/me/services/${serviceId}/verification/documents/upload-url`, { mimeType });
    const slot = (unwrap(res.data as { data: unknown }) ?? {}) as Record<string, unknown>;
    const storageObjectPath = String(slot.storageObjectPath ?? '');
    const uploadUrl = String(slot.uploadUrl ?? '');
    if (!storageObjectPath || !uploadUrl) throw new Error('Máy chủ chưa cấp chỗ tải chứng chỉ. Vui lòng thử lại.');
    return { storageObjectPath, uploadUrl };
  },

  async attachSkillEvidence(
    serviceId: string,
    doc: { storageObjectPath: string; fileName: string; fileSize: number; mimeType: string } & Partial<SkillEvidenceDetails>,
  ): Promise<SkillVerification> {
    const res = await apiClient.post<{ data: unknown } | unknown>(`/technicians/me/services/${serviceId}/verification/documents`, doc);
    return normalizeSkillVerification(unwrap(res.data as { data: unknown }));
  },

  /** One upload slot for a paper that covers several service categories (not tied to one service). */
  async requestCategoryEvidenceUploadUrl(mimeType: string): Promise<{ storageObjectPath: string; uploadUrl: string }> {
    const res = await apiClient.post<{ data: unknown } | unknown>('/technicians/me/skill-evidence/upload-url', { mimeType });
    const slot = (unwrap(res.data as { data: unknown }) ?? {}) as Record<string, unknown>;
    const storageObjectPath = String(slot.storageObjectPath ?? '');
    const uploadUrl = String(slot.uploadUrl ?? '');
    if (!storageObjectPath || !uploadUrl) throw new Error('Máy chủ chưa cấp chỗ tải chứng chỉ. Vui lòng thử lại.');
    return { storageObjectPath, uploadUrl };
  },

  /** The papers already sent, one entry per file with the categories it covers (what step 3 shows after coming back). */
  async getMySkillEvidence(): Promise<SentSkillEvidence[]> {
    const res = await apiClient.get<{ data: unknown } | unknown>('/technicians/me/skill-evidence');
    const data = unwrap(res.data as { data: unknown });
    return Array.isArray(data) ? (data as SentSkillEvidence[]) : [];
  },

  /** Changes the details and the categories of a paper already sent (replaces them); returns the papers. */
  async updateSkillEvidence(
    documentId: string,
    body: { categoryIds: string[] } & Partial<SkillEvidenceDetails>,
  ): Promise<SentSkillEvidence[]> {
    const res = await apiClient.patch<{ data: unknown } | unknown>(`/technicians/me/skill-evidence/${documentId}`, body);
    const data = unwrap(res.data as { data: unknown });
    return Array.isArray(data) ? (data as SentSkillEvidence[]) : [];
  },

  /** Removes a paper already sent from every skill it sits on. */
  async deleteSkillEvidence(documentId: string): Promise<void> {
    await apiClient.delete(`/technicians/me/skill-evidence/${documentId}`);
  },

  /** A short-lived link to look at one of the technician's own papers; `serviceId` is the one the entry names. */
  async getSkillEvidenceAccess(serviceId: string, documentId: string): Promise<string> {
    const res = await apiClient.get<{ data: unknown } | unknown>(`/technicians/me/services/${serviceId}/verification/documents/${documentId}/access`);
    const data = (unwrap(res.data as { data: unknown }) ?? {}) as Record<string, unknown>;
    return String(data.signedUrl ?? '');
  },

  /** Attaches the uploaded paper to every skill the technician has in `categoryIds`; Backend says how many it reached. */
  async attachCategoryEvidence(
    categoryIds: string[],
    doc: { storageObjectPath: string; fileName: string; fileSize: number; mimeType: string } & Partial<SkillEvidenceDetails>,
  ): Promise<{ attachedSkills: number }> {
    const res = await apiClient.post<{ data: unknown } | unknown>('/technicians/me/skill-evidence', { ...doc, categoryIds });
    const data = (unwrap(res.data as { data: unknown }) ?? {}) as Record<string, unknown>;
    return { attachedSkills: Number(data.attachedSkills ?? 0) };
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
