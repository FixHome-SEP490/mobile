// src/api/users.api.ts
import apiClient from './client';
import type { UserInfo } from '../types';

export interface AddressData {
  id: string;
  userId: string;
  label: string;
  line1: string;
  ward: string;
  district: string;
  province: string;
  provinceCode?: string;
  districtCode?: string;
  lat: number;
  lng: number;
  isDefault: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateAddressRequest {
  label: string;
  line1: string;
  ward: string;
  district: string;
  province: string;
  provinceCode?: string;
  districtCode?: string;
  lat?: number;
  lng?: number;
  isDefault?: boolean;
}

export interface UpdateProfileRequest {
  fullName?: string;
  phoneNumber?: string;
  avatarUrl?: string;
}

function unwrap<T>(payload: { data: T } | T): T {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

export const usersApi = {
  async getProfile(): Promise<UserInfo> {
    const res = await apiClient.get<{ data: UserInfo } | UserInfo>('/users/me');
    return unwrap(res.data);
  },

  async updateProfile(data: UpdateProfileRequest): Promise<UserInfo> {
    const res = await apiClient.patch<{ data: UserInfo } | UserInfo>('/users/me', data);
    return unwrap(res.data);
  },

  async getAddresses(): Promise<AddressData[]> {
    const res = await apiClient.get<{ data: AddressData[] } | AddressData[]>('/me/addresses');
    const result = unwrap(res.data);
    return Array.isArray(result) ? result : [];
  },

  async createAddress(data: CreateAddressRequest): Promise<AddressData> {
    const res = await apiClient.post<{ data: AddressData } | AddressData>('/me/addresses', data);
    return unwrap(res.data);
  },

  async updateAddress(id: string, data: Partial<CreateAddressRequest>): Promise<AddressData> {
    const res = await apiClient.patch<{ data: AddressData } | AddressData>(`/me/addresses/${id}`, data);
    return unwrap(res.data);
  },

  async deleteAddress(id: string): Promise<void> {
    await apiClient.delete(`/me/addresses/${id}`);
  },
};
