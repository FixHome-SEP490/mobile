// src/api/auth.ts
import apiClient from './client';
import type { UserInfo } from '../types';

export interface LoginRequest {
  email: string;
  identifier?: string;
  password?: string;
  deviceInfo?: string;
}

export interface RegisterRequest {
  email: string;
  password?: string;
  fullName?: string;
  phoneNumber?: string;
  role?: string;
}

export interface AuthResponse {
  success: boolean;
  statusCode: number;
  message: string;
  data: {
    accessToken: string;
    refreshToken: string;
    user: UserInfo;
  };
}

export const authApi = {
  login: async (data: LoginRequest) => {
    const response = await apiClient.post<AuthResponse>('/auth/login', {
      identifier: data.email,
      deviceInfo: 'Mobile App - React Native',
      ...data,
    });
    return response.data;
  },

  register: async (data: RegisterRequest) => {
    const response = await apiClient.post('/auth/register', {
      role: 'customer',
      ...data,
    });
    return response.data;
  },

  logout: async (data: any) => {
    const response = await apiClient.post('/auth/logout', data);
    return response.data;
  }
};
