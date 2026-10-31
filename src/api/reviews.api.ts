import apiClient from './client';
import { useAuthStore } from '../store/auth.store';

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
  /** The signed-in technician's own reviews: the existing public route with the session's own user id (the Backend has no /me variant). */
  async getMine(page = 1, pageSize = 20): Promise<TechnicianReviewsPage> {
    const userId = useAuthStore.getState().user?.id;
    if (!userId) throw new Error('No signed-in technician');
    const res = await apiClient.get<{ data?: Partial<TechnicianReview>[]; meta?: { total?: number } }>(
      `/technicians/${userId}/reviews`,
      { params: { page, pageSize } },
    );
    // The public route has no order code or service name; the screen skips an empty order line.
    const rows = (Array.isArray(res.data?.data) ? res.data.data : []).map((r) => ({
      ...r, orderCode: r.orderCode ?? '', serviceName: r.serviceName ?? '', customerName: r.customerName ?? 'Khách hàng FixHome',
    })) as TechnicianReview[];
    const total = typeof res.data?.meta?.total === 'number' ? res.data.meta.total : rows.length;
    return { data: rows, total };
  },
};
