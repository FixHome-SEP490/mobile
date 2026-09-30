import apiClient from './client';

export interface TechnicianReview {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  customerName: string | null;
}

interface RawTechnicianReview {
  id?: unknown;
  rating?: unknown;
  comment?: unknown;
  createdAt?: unknown;
  customerName?: unknown;
  [key: string]: unknown;
}

function normalizeReview(value: RawTechnicianReview): TechnicianReview {
  const id = typeof value.id === 'string' && value.id.trim() ? value.id.trim() : '';
  const rating = Number(value.rating);
  const createdAt = typeof value.createdAt === 'string' ? value.createdAt : '';
  if (!id || !Number.isInteger(rating) || rating < 1 || rating > 5 || Number.isNaN(Date.parse(createdAt))) {
    throw new Error('Dữ liệu đánh giá kỹ thuật viên không hợp lệ');
  }
  const comment = typeof value.comment === 'string' && value.comment.trim()
    ? value.comment.trim()
    : null;
  const customerName = typeof value.customerName === 'string' && value.customerName.trim()
    ? value.customerName.trim()
    : null;
  return { id, rating, comment, createdAt, customerName };
}

export const technicianReviewsApi = {
  async listByTechnician(
    technicianUserId: string,
    page = 1,
    pageSize = 20,
  ): Promise<{ data: TechnicianReview[]; total: number }> {
    const res = await apiClient.get<{
      data?: RawTechnicianReview[];
      meta?: { total?: unknown };
    }>(`/technicians/${technicianUserId}/reviews`, {
      params: { page, pageSize },
    });
    const rows = Array.isArray(res.data?.data) ? res.data.data : [];
    const data = rows.map(normalizeReview);
    const rawTotal = Number(res.data?.meta?.total);
    return {
      data,
      total: Number.isInteger(rawTotal) && rawTotal >= 0 ? rawTotal : data.length,
    };
  },
};
