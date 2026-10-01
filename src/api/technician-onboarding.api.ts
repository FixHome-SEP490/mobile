// src/api/technician-onboarding.api.ts
// Hợp đồng bám theo backend `technicians/onboarding/*` và bản web
// `web/src/api/technician-onboarding.api.ts`. Bước 2 (xác minh danh tính) dùng
// `technician-verification.api.ts`.
import apiClient from './client';

export type OnboardingStatus =
  | 'not_started'
  | 'in_progress'
  | 'submitted'
  | 'approved'
  | 'rejected';

export type Gender = 'male' | 'female' | 'other';

export interface ServiceAreaItem {
  provinceCode: string;
  districtCode: string;
}

export interface OnboardingStatusResponse {
  onboardingStatus: OnboardingStatus;
  verificationStatus?: string;
  currentStep: number;
  rejectionReason?: string | null;
  personalInfoCompleted: boolean;
  kycSubmitted: boolean;
  skillsSelected: boolean;
  addressSet: boolean;
  fullAddress?: string;
  latitude?: number;
  longitude?: number;
  serviceRadiusKm?: number;
  serviceAreas?: ServiceAreaItem[];
}

export interface SavePersonalInfoPayload {
  fullName: string;
  /** Ngày sinh dạng ISO `yyyy-MM-dd`. */
  dateOfBirth: string;
  gender: Gender;
  citizenIdNumber: string;
  phoneNumber?: string;
}

export interface SaveSkillsPayload {
  serviceIds: string[];
  yearsExperience: number;
  bio?: string;
}

export interface SaveAddressPayload {
  fullAddress: string;
  latitude?: number;
  longitude?: number;
  serviceAreas: ServiceAreaItem[];
  serviceRadiusKm?: number;
}

function unwrap<T>(payload: { data: T } | T): T {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

async function call<T>(
  request: Promise<{ data: { data: T } | T }>,
): Promise<T> {
  return unwrap((await request).data);
}

export const technicianOnboardingApi = {
  getStatus: () =>
    call<OnboardingStatusResponse>(apiClient.get('/technicians/onboarding/status')),

  savePersonalInfo: (payload: SavePersonalInfoPayload) =>
    call<OnboardingStatusResponse>(
      apiClient.post('/technicians/onboarding/personal-info', payload),
    ),

  saveSkills: (payload: SaveSkillsPayload) =>
    call<OnboardingStatusResponse>(
      apiClient.post('/technicians/onboarding/skills', payload),
    ),

  saveAddress: (payload: SaveAddressPayload) =>
    call<OnboardingStatusResponse>(
      apiClient.post('/technicians/onboarding/address', payload),
    ),

  submit: () =>
    call<OnboardingStatusResponse>(apiClient.post('/technicians/onboarding/submit', {})),
};
