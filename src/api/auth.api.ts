// src/api/auth.api.ts
import apiClient from './client';
import { storageService } from '../services/storage.service';
import { useAuthStore } from '../store/auth.store';
import type {
  UserInfo,
  RegisterResponse,
  ResendOtpResponse,
  ForgotPasswordResponse,
  ResetPasswordResponse,
} from '../types';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  fullName: string;
  email: string;
  password: string;
  phoneNumber?: string;
  role: 'customer';
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: UserInfo;
}

export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
}

/** Unwrap the `{ data: T }` envelope the Backend uses */
function unwrap<T>(payload: { data: T } | T): T {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

export const authApi = {
  async login(data: LoginRequest): Promise<AuthResponse> {
    useAuthStore.getState().beginSessionTransition();
    const res = await apiClient.post<{ data: AuthResponse } | AuthResponse>(
      '/auth/login',
      { identifier: data.email.trim(), password: data.password },
    );
    const result = unwrap(res.data);
    // Persist tokens
    await storageService.setToken(result.accessToken);
    await storageService.setRefreshToken(result.refreshToken);
    return result;
  },

  /**
   * Bước hai của đăng nhập Google: đổi mã bàn giao lấy phiên thật.
   *
   * Mã bàn giao chỉ sống 60 giây và đi qua thanh địa chỉ trình duyệt; token
   * thật chỉ xuất hiện ở lời gọi POST này rồi vào thẳng expo-secure-store.
   */
  async exchangeGoogleCode(code: string): Promise<AuthResponse> {
    const res = await apiClient.post<{ data: AuthResponse } | AuthResponse>(
      '/auth/google/exchange',
      { code, deviceInfo: 'Mobile - FixHome app' },
    );
    const result = unwrap(res.data);
    await storageService.setToken(result.accessToken);
    await storageService.setRefreshToken(result.refreshToken);
    return result;
  },

  /** Backend now requires OTP verification before issuing tokens; no auto-login here. */
  async register(data: RegisterRequest): Promise<RegisterResponse> {
    const res = await apiClient.post<
      { data: RegisterResponse } | RegisterResponse
    >('/auth/register', data);
    return unwrap(res.data);
  },

  async verifyRegisterOtp(email: string, otp: string): Promise<AuthResponse> {
    useAuthStore.getState().beginSessionTransition();
    const res = await apiClient.post<{ data: AuthResponse } | AuthResponse>(
      '/auth/verify-register-otp',
      { email, otp },
    );
    const result = unwrap(res.data);
    await storageService.setToken(result.accessToken);
    await storageService.setRefreshToken(result.refreshToken);
    return result;
  },

  async resendRegisterOtp(email: string): Promise<ResendOtpResponse> {
    const res = await apiClient.post<
      { data: ResendOtpResponse } | ResendOtpResponse
    >('/auth/resend-register-otp', { email });
    return unwrap(res.data);
  },

  async forgotPassword(email: string): Promise<ForgotPasswordResponse> {
    const res = await apiClient.post<
      { data: ForgotPasswordResponse } | ForgotPasswordResponse
    >('/auth/forgot-password', { email });
    return unwrap(res.data);
  },

  async resetPassword(
    email: string,
    otp: string,
    newPassword: string,
  ): Promise<ResetPasswordResponse> {
    const res = await apiClient.post<
      { data: ResetPasswordResponse } | ResetPasswordResponse
    >('/auth/reset-password', { email, otp, newPassword });
    return unwrap(res.data);
  },

  async getProfile(): Promise<UserInfo> {
    const res = await apiClient.get<{ data: UserInfo } | UserInfo>('/me');
    return unwrap(res.data);
  },

  async refresh(): Promise<RefreshResponse> {
    const refreshToken = await storageService.getRefreshToken();
    if (!refreshToken) throw new Error('No refresh token available');
    const res = await apiClient.post<
      { data: RefreshResponse } | RefreshResponse
    >('/auth/refresh', { refreshToken });
    const result = unwrap(res.data);
    await storageService.setToken(result.accessToken);
    await storageService.setRefreshToken(result.refreshToken);
    return result;
  },

  async logout(): Promise<void> {
    useAuthStore.getState().beginSessionTransition();
    try {
      const refreshToken = await storageService.getRefreshToken();
      await apiClient.post('/auth/logout', { refreshToken });
    } catch {
      // ignore network error on logout
    }
    await storageService.removeToken();
    await storageService.removeRefreshToken();
  },
};