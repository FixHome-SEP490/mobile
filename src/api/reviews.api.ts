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

type RawReview = Partial<Record<keyof TechnicianReview, unknown>>;

const text = (value: unknown) => (typeof value === 'string' ? value : '');

function toReview(row: RawReview): TechnicianReview {
  return {
    id: text(row.id),
    serviceOrderId: text(row.serviceOrderId),
    // The backend list does not carry the order code or service name yet; the screen skips them when empty.
    orderCode: text(row.orderCode),
    serviceName: text(row.serviceName),
    customerName: text(row.customerName),
    rating: Number(row.rating),
    comment: typeof row.comment === 'string' ? row.comment : null,
    createdAt: text(row.createdAt),
  };
}

export const reviewsApi = {
  /**
   * The signed-in technician's own reviews. The backend has no /technicians/me/reviews route
   * ("me" fails its UUID check with HTTP 400, bug 51), so the list is read from
   * GET /technicians/{user id}/reviews with the id of the session user.
   */
  async getMine(page = 1, pageSize = 20): Promise<TechnicianReviewsPage> {
    const userId = useAuthStore.getState().user?.id;
    if (!userId) throw new Error('Chưa đăng nhập tài khoản kỹ thuật viên.');
    const res = await apiClient.get<{ data?: RawReview[]; meta?: { total?: number } }>(
      `/technicians/${encodeURIComponent(userId)}/reviews`,
      { params: { page, pageSize } },
    );
    const rows = Array.isArray(res.data?.data) ? res.data.data.map(toReview) : [];
    const total = typeof res.data?.meta?.total === 'number' ? res.data.meta.total : rows.length;
    return { data: rows, total };
  },
};
