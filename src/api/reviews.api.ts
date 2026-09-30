import apiClient from './client';

export interface TechnicianReview {
  id: string;
  serviceOrderId: string;
  orderCode: string;
  serviceName: string;
  customerName: string;
  rating: number;
  comment?: string | null;
  createdAt: string;
}

export interface TechnicianReviewsPage {
  data: TechnicianReview[];
  total: number;
}

export const reviewsApi = {
  /** The signed-in technician's own reviews (identity comes from the token, never from the client). */
  async getMine(page = 1, pageSize = 20): Promise<TechnicianReviewsPage> {
    const res = await apiClient.get<{ data?: TechnicianReview[]; meta?: { total?: number } }>(
      '/technicians/me/reviews',
      { params: { page, pageSize } },
    );
    const rows = Array.isArray(res.data?.data) ? res.data.data : [];
    const total = typeof res.data?.meta?.total === 'number' ? res.data.meta.total : rows.length;
    return { data: rows, total };
  },
};
