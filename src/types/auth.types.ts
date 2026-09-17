// src/types/auth.types.ts
export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  user: UserInfo;
}

export interface RegisterResponse {
  message: string;
  email: string;
  expiresInMinutes: number;
}

export interface VerifyOtpRequest {
  email: string;
  otp: string;
}

export interface ResendOtpResponse {
  message: string;
  resendAvailableAt: string;
}

export interface ForgotPasswordResponse {
  message: string;
}

export interface ResetPasswordRequest {
  email: string;
  otp: string;
  newPassword: string;
}

export interface ResetPasswordResponse {
  message: string;
}

export interface UserInfo {
  id: string;
  email: string;
  fullName: string;
  phoneNumber?: string;
  avatarUrl?: string;
  role: UserRole;
}

export enum UserRole {
  CUSTOMER = 'customer',
  TECHNICIAN = 'technician',
  SERVICE_MANAGER = 'service_manager',
  ADMIN = 'admin',
}
