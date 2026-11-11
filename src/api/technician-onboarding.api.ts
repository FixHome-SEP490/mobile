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

/** Giai đoạn xét duyệt sau khi thợ nộp hồ sơ (tính ở backend). */
export type ReviewStage =
  | 'identity_review'
  | 'visit_required'
  | 'visit_scheduled'
  | 'visit_blocked'
  | 'profile_review'
  | 'approved'
  | 'identity_rejected'
  | 'profile_rejected';

export interface OnboardingSkill {
  serviceId: string;
  /** Cấp độ thợ tự khai lúc đăng ký. */
  declaredLevel: string | null;
  /** Cấp độ hiện hiệu lực; chỉ là cấp đã xác nhận khi `verificationStatus` là verified. */
  level: string;
  verificationStatus: string;
}

export interface OnboardingOfficeVisit {
  id: string;
  officeId: string;
  officeName: string;
  officeAddress: string;
  scheduledAt: string;
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
  fullName?: string;
  /** `yyyy-MM-dd`. */
  dateOfBirth?: string;
  gender?: Gender;
  phoneNumber?: string;
  citizenIdNumber?: string;
  fullAddress?: string;
  latitude?: number;
  longitude?: number;
  serviceRadiusKm?: number;
  serviceAreas?: ServiceAreaItem[];
  skills?: OnboardingSkill[];
  reviewStage?: ReviewStage | null;
  identityVerifiedAt?: string;
  profileRejectionReason?: string;
  officeVisit?: OnboardingOfficeVisit | null;
  /** Chỉ có khi bị khóa đặt lịch vì vắng nhiều lần. */
  supportPhone?: string;
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
  /** Cấp độ tự khai cho từng kỹ năng đã chọn. */
  skills?: { serviceId: string; level: string }[];
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
