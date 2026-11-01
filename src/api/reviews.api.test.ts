import apiClient from './client';
import { reviewsApi } from './reviews.api';
import { useAuthStore } from '../store/auth.store';

jest.mock('./client', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));
jest.mock('../store/auth.store', () => ({
  useAuthStore: { getState: jest.fn() },
}));

const api = apiClient as unknown as { get: jest.Mock };
const auth = useAuthStore as unknown as { getState: jest.Mock };
const TECH_USER_ID = '7b1bf1cb-0d07-4f9d-ba59-d826418b688d';

beforeEach(() => jest.resetAllMocks());

describe('reviewsApi.getMine (bug 51)', () => {
  it('reads the signed-in technician reviews from the user id route, never from /technicians/me', async () => {
    auth.getState.mockReturnValue({ user: { id: TECH_USER_ID, role: 'technician' } });
    api.get.mockResolvedValue({
      data: {
        data: [{
          id: 'review-1', serviceOrderId: 'order-1', customerId: 'customer-1', technicianId: TECH_USER_ID,
          rating: 5, comment: 'Thợ đến đúng giờ.', customerName: 'Khách Hàng Bốn', createdAt: '2026-11-01T11:54:00.219Z',
        }],
        meta: { total: 1 },
      },
    });

    const page = await reviewsApi.getMine(1, 20);

    expect(api.get).toHaveBeenCalledWith(`/technicians/${TECH_USER_ID}/reviews`, { params: { page: 1, pageSize: 20 } });
    expect(api.get.mock.calls[0][0]).not.toContain('/me/');
    expect(page).toEqual({
      total: 1,
      data: [{
        id: 'review-1', serviceOrderId: 'order-1', orderCode: '', serviceName: '', customerName: 'Khách Hàng Bốn',
        rating: 5, comment: 'Thợ đến đúng giờ.', createdAt: '2026-11-01T11:54:00.219Z',
      }],
    });
  });

  it('does not call the backend without a signed-in user', async () => {
    auth.getState.mockReturnValue({ user: null });
    await expect(reviewsApi.getMine()).rejects.toThrow();
    expect(api.get).not.toHaveBeenCalled();
  });
});
