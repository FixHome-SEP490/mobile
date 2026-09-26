// src/api/parts-catalog.api.ts
import apiClient from './client';

export interface FixHomePart {
  id: string;
  sku: string | null;
  name: string;
  description: string | null;
  sellingPrice: number;
  warrantyDays: number | null;
  warrantyPolicy: string | null;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CatalogPartsQuery {
  page?: number;
  limit?: number;
  search?: string;
}

export interface CatalogPartsResponse {
  data: FixHomePart[];
  meta?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export const partsCatalogApi = {
  async getCatalog(query: CatalogPartsQuery = {}): Promise<CatalogPartsResponse> {
    const res = await apiClient.get('/parts/catalog', { params: query });
    const payload = res.data as { data?: FixHomePart[]; meta?: Record<string, unknown> } | FixHomePart[];
    const data = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [];
    const meta = !Array.isArray(payload) && payload?.meta ? (payload.meta as { page: number; limit: number; total: number; totalPages: number }) : {
      page: 1,
      limit: data.length,
      total: data.length,
      totalPages: 1,
    };
    return { data, meta };
  },

  async getPartById(id: string): Promise<FixHomePart> {
    const res = await apiClient.get(`/parts/catalog/${id}`);
    const payload = res.data as { data?: FixHomePart } | FixHomePart;
    if (payload && typeof payload === 'object' && 'data' in payload && payload.data) {
      return payload.data;
    }
    return payload as FixHomePart;
  },
};
