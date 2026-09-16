import apiClient from './client';
import type { UserInfo } from '../types';

export interface GetProfileResponse {
  success: boolean;
  statusCode: number;
  message: string;
  data: UserInfo;
}

export interface UpdateProfileRequest {
  fullName?: string;
  phoneNumber?: string;
  avatarUrl?: string;
}

export const usersApi = {
  getProfile: async () => {
    const response = await apiClient.get<GetProfileResponse>('/users/me');
    return response.data;
  },
  updateProfile: async (data: UpdateProfileRequest) => {
    const response = await apiClient.patch<GetProfileResponse>('/users/me', data);
    return response.data;
  }
};
