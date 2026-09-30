// src/api/geo.api.ts
import apiClient from './client';

export interface PlaceSuggestion {
  placeId: string;
  description: string;
  lat: number;
  lng: number;
  ward?: string;
  district?: string;
  province?: string;
}

export interface PlaceLocation {
  lat: number;
  lng: number;
  formattedAddress: string;
  ward?: string;
  district?: string;
  province?: string;
  provinceCode?: string;
  districtCode?: string;
}

export interface District {
  code: number;
  name: string;
}

export interface Province {
  code: number;
  name: string;
  districts?: District[];
}

export const geoApi = {
  async autocomplete(input: string): Promise<PlaceSuggestion[]> {
    if (!input.trim()) return [];
    const res = await apiClient.get<{ data: PlaceSuggestion[] }>('/geo/autocomplete', { params: { input } });
    return res.data?.data || [];
  },

  async reverse(lat: number, lng: number): Promise<PlaceLocation> {
    const res = await apiClient.get<{ data: PlaceLocation }>('/geo/reverse', { params: { lat, lng } });
    return res.data.data;
  },

  /** Tỉnh/thành kèm quận/huyện (backend proxy provinces.open-api.vn, có cache). */
  async getProvinces(): Promise<Province[]> {
    const res = await apiClient.get<{ data: Province[] }>('/geo/provinces', { params: { depth: 2 } });
    return res.data?.data || [];
  },
};
