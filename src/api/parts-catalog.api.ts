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
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface CatalogPartsQuery {
  page?: number;
  limit?: number;
  search?: string;
}

function unwrap<T>(payload: { data: T } | T): T {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

export const partsCatalogApi = {
  async getCatalog(query: CatalogPartsQuery = {}): Promise<{ data: FixHomePart[]; meta: PaginationMeta }> {
    const res = await apiClient.get<{ data: FixHomePart[]; meta?: Partial<PaginationMeta> }>(
      '/parts/catalog',
      { params: query },
    );
    const data = Array.isArray(res.data?.data) ? res.data.data : [];
    const meta: PaginationMeta = {
      page: res.data?.meta?.page ?? 1,
      limit: res.data?.meta?.limit ?? data.length,
      total: res.data?.meta?.total ?? data.length,
      totalPages: res.data?.meta?.totalPages ?? 1,
    };
    return { data, meta };
  },

  async getPartById(id: string): Promise<FixHomePart> {
    const res = await apiClient.get<{ data: FixHomePart } | FixHomePart>(`/parts/catalog/${id}`);
    return unwrap(res.data);
  },
};
