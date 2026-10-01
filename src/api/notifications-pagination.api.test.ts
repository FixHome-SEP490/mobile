import apiClient from './client';
import { notificationsApi } from './notifications.api';

jest.mock('./client', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    patch: jest.fn(),
  },
}));

const get = apiClient.get as jest.Mock;
const ID = '11111111-1111-4111-8111-111111111111';

function notification(id = ID) {
  return {
    id,
    userId: 'private-user-id',
    title: 'Order update',
    message: 'Technician is on the way.',
    type: 'TECHNICIAN_EN_ROUTE',
    referenceId: null,
    referenceType: null,
    isRead: false,
    createdAt: '2026-10-01T01:00:00.000Z',
  };
}

beforeEach(() => jest.resetAllMocks());

describe('notificationsApi Customer pagination', () => {
  it('normalizes rows and trusts matching canonical Backend page metadata', async () => {
    get.mockResolvedValue({
      data: {
        success: true,
        statusCode: 200,
        message: 'Success',
        data: [notification()],
        meta: {
          page: 2,
          limit: 20,
          total: 45,
          totalPages: 3,
        },
      },
    });

    await expect(notificationsApi.getNotificationPage(2, 20)).resolves.toEqual({
      data: [{
        id: ID,
        title: 'Order update',
        message: 'Technician is on the way.',
        type: 'TECHNICIAN_EN_ROUTE',
        referenceId: null,
        referenceType: null,
        isRead: false,
        createdAt: '2026-10-01T01:00:00.000Z',
      }],
      meta: {
        page: 2,
        limit: 20,
        total: 45,
        totalPages: 3,
      },
    });
    expect(get).toHaveBeenCalledWith('/notifications', {
      params: { page: 2, limit: 20 },
    });
  });

  it.each([
    undefined,
    { page: 1, limit: 20, total: 45 },
    { page: 1, limit: 20, total: -1, totalPages: 0 },
    { page: 1, limit: 20, total: 45, totalPages: 99 },
    { page: 2, limit: 20, total: 45, totalPages: 3 },
    { page: 1, limit: 50, total: 45, totalPages: 1 },
  ])('keeps rows usable but disables pagination for absent/malformed/mismatched meta %#', async (meta) => {
    get.mockResolvedValue({
      data: {
        success: true,
        data: [notification()],
        ...(meta === undefined ? {} : { meta }),
      },
    });

    const page = await notificationsApi.getNotificationPage(1, 20);

    expect(page.data).toHaveLength(1);
    expect(page.meta).toBeNull();
  });

  it('keeps the row-only compatibility helper while using the page parser', async () => {
    get.mockResolvedValue({
      data: {
        data: [notification()],
        meta: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
        },
      },
    });

    await expect(notificationsApi.getNotificationRows(1, 20)).resolves.toEqual([
      expect.objectContaining({ id: ID }),
    ]);
  });
});
