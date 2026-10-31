import apiClient from './client';
import { reviewsApi } from './reviews.api';
import { useAuthStore } from '../store/auth.store';

jest.mock('./client', () => ({ __esModule: true, default: { get: jest.fn() } }));

const get = (apiClient as unknown as { get: jest.Mock }).get;
const USER_ID = '11111111-1111-4111-8111-111111111111';

describe('reviewsApi.getMine', () => {
  beforeEach(() => jest.resetAllMocks());

  it('reads the session user id from the public technician route, never /me', async () => {
    useAuthStore.setState({ user: { id: USER_ID } as never });
    get.mockResolvedValue({ data: { data: [{ id: 'r1', serviceOrderId: 'o1', rating: 5 }], meta: { total: 3 } } });
    const page = await reviewsApi.getMine(2, 20);
    expect(get).toHaveBeenCalledWith(`/technicians/${USER_ID}/reviews`, { params: { page: 2, pageSize: 20 } });
    expect(page.total).toBe(3);
    expect(page.data[0]).toMatchObject({ id: 'r1', orderCode: '', serviceName: '', customerName: 'Khách hàng FixHome' });
  });

  it('fails without a signed-in user instead of calling the API', async () => {
    useAuthStore.setState({ user: null });
    await expect(reviewsApi.getMine()).rejects.toThrow();
    expect(get).not.toHaveBeenCalled();
  });
});
