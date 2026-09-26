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

export type ServicePricingMode = 'fixed_price' | 'inspection_required';

export interface ServiceItem {
  id: string;
  name: string;
  code?: string;
  slug?: string | null;
  description?: string | null;
  categoryId: string;
  categoryName?: string;
  pricingMode: ServicePricingMode;
  basePrice?: number | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  fixedPrice?: number | null;
  unit?: string | null;
  scopeDescription?: string | null;
  isActive: boolean;
  sortOrder?: number;
}

export const SERVICES_PAGE_SIZE = 20;
export const SERVICES_MAX_LIMIT = 100;

function toPositiveInt(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback;
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
    // The Backend PaginationDto accepts page + limit (max 100), not pageSize.
    const { pageSize, ...filters } = params ?? {};
    const page = toPositiveInt(params?.page, 1);
    const limit = Math.min(toPositiveInt(pageSize, SERVICES_PAGE_SIZE), SERVICES_MAX_LIMIT);
    const res = await apiClient.get('/services', {
      params: { ...filters, page, limit },
    });
    const data = unwrap<ServiceItem[]>(res.data);
    return { data, total: res.data?.meta?.total ?? data.length };
  },

  async getServiceById(id: string): Promise<ServiceItem> {
    const res = await apiClient.get(`/services/${id}`);
    return unwrap<ServiceItem>(res.data);
  },
};
