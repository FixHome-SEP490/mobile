import apiClient from './client';
import { technicianReviewsApi } from './technician-reviews.api';

jest.mock('./client', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));

const api = apiClient as unknown as { get: jest.Mock };
const TECHNICIAN_USER_ID = '11111111-1111-4111-8111-111111111111';

beforeEach(() => jest.resetAllMocks());

describe('technicianReviewsApi', () => {
  it('uses the technician USER id route and strips raw private identifiers', async () => {
    api.get.mockResolvedValue({
      data: {
        data: [{
          id: 'review-1',
          serviceOrderId: 'PRIVATE_ORDER',
          customerId: 'PRIVATE_CUSTOMER',
          technicianId: 'PRIVATE_PROFILE_OR_USER',
          isModerated: false,
          rating: 5,
          comment: '  Làm việc cẩn thận.  ',
          customerName: '  Khách A  ',
          createdAt: '2026-09-29T03:00:00.000Z',
        }],
        meta: { total: 7 },
      },
    });

    const result = await technicianReviewsApi.listByTechnician(TECHNICIAN_USER_ID, 1, 20);

    expect(api.get).toHaveBeenCalledWith(
      `/technicians/${TECHNICIAN_USER_ID}/reviews`,
      { params: { page: 1, pageSize: 20 } },
    );
    expect(result).toEqual({
      data: [{
        id: 'review-1',
        rating: 5,
        comment: 'Làm việc cẩn thận.',
        customerName: 'Khách A',
        createdAt: '2026-09-29T03:00:00.000Z',
      }],
      total: 7,
    });
    expect(result.data[0]).not.toHaveProperty('customerId');
    expect(result.data[0]).not.toHaveProperty('serviceOrderId');
    expect(result.data[0]).not.toHaveProperty('technicianId');
    expect(result.data[0]).not.toHaveProperty('isModerated');
  });

  it('normalizes blank optional text and falls back to returned length for invalid total', async () => {
    api.get.mockResolvedValue({
      data: {
        data: [{
          id: 'review-2',
          rating: 4,
          comment: '   ',
          customerName: '',
          createdAt: '2026-09-29T03:00:00.000Z',
        }],
        meta: { total: 'bad' },
      },
    });

    await expect(technicianReviewsApi.listByTechnician(TECHNICIAN_USER_ID)).resolves.toEqual({
      data: [{
        id: 'review-2',
        rating: 4,
        comment: null,
        customerName: null,
        createdAt: '2026-09-29T03:00:00.000Z',
      }],
      total: 1,
    });
  });

  it('fails closed on malformed review rows instead of rendering invented review data', async () => {
    api.get.mockResolvedValue({
      data: {
        data: [{
          id: 'review-3',
          rating: 9,
          createdAt: 'not-a-date',
        }],
      },
    });

    await expect(
      technicianReviewsApi.listByTechnician(TECHNICIAN_USER_ID),
    ).rejects.toThrow(/không hợp lệ/i);
  });
});
