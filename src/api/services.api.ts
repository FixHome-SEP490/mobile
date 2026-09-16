// src/api/services.api.ts
import apiClient from './client';

function unwrap<T>(payload: { data: T } | T): T {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

export interface CategoryItem {
  id: string;
  name: string;
  slug: string;
  description?: string;
  iconUrl?: string;
  isActive: boolean;
  sortOrder: number;
}

export interface ServiceItem {
  id: string;
  name: string;
  slug: string;
  description?: string;
  categoryId: string;
  categoryName?: string;
  pricingMode: 'FIXED' | 'CUSTOM_QUOTE';
  fixedUnitPrice?: number;
  unit?: string;
  scope?: string;
  iconUrl?: string;
  isActive: boolean;
  sortOrder: number;
}

export const servicesApi = {
  async getCategories(): Promise<CategoryItem[]> {
    const res = await apiClient.get('/categories');
    return unwrap<CategoryItem[]>(res.data);
  },

  async getServices(params?: {
    categoryId?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ data: ServiceItem[]; total: number }> {
    const res = await apiClient.get('/services', { params });
    const data = unwrap<ServiceItem[]>(res.data);
    return { data, total: res.data?.meta?.total ?? data.length };
  },

  async getServiceById(id: string): Promise<ServiceItem> {
    const res = await apiClient.get(`/services/${id}`);
    return unwrap<ServiceItem>(res.data);
  },
};
