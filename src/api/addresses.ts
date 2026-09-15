import apiClient from './client';

export interface AddressData {
  id: string;
  userId: string;
  label: string;
  line1: string;
  ward: string;
  district: string;
  province: string;
  lat: number;
  lng: number;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AddressRequest {
  label: string;
  line1: string;
  ward: string;
  district: string;
  province: string;
  lat: number;
  lng: number;
  isDefault?: boolean;
}

export interface AddressListResponse {
  success: boolean;
  statusCode: number;
  message: string;
  data: AddressData[];
}

export interface AddressSingleResponse {
  success: boolean;
  statusCode: number;
  message: string;
  data: AddressData;
}

export const addressesApi = {
  getAddresses: async () => {
    const response = await apiClient.get<AddressListResponse>('/me/addresses');
    return response.data;
  },
  createAddress: async (data: AddressRequest) => {
    const response = await apiClient.post<AddressSingleResponse>('/me/addresses', data);
    return response.data;
  },
  updateAddress: async (id: string, data: Partial<AddressRequest>) => {
    const response = await apiClient.patch<AddressSingleResponse>(`/me/addresses/${id}`, data);
    return response.data;
  },
  deleteAddress: async (id: string) => {
    const response = await apiClient.delete<AddressSingleResponse>(`/me/addresses/${id}`);
    return response.data;
  },
};
