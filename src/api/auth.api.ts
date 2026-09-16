// src/api/auth.api.ts
import apiClient from './client';
import { storageService } from '../services/storage.service';
import type { UserInfo } from '../types';

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

  async register(data: RegisterRequest): Promise<AuthResponse> {
    const res = await apiClient.post<{ data: AuthResponse } | AuthResponse>(
      '/auth/register',
      data,
    );
    const result = unwrap(res.data);
    await storageService.setToken(result.accessToken);
    await storageService.setRefreshToken(result.refreshToken);
    return result;
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
