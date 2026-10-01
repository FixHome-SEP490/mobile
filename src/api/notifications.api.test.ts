import apiClient from './client';
import { notificationsApi } from './notifications.api';

jest.mock('./client', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    patch: jest.fn(),
  },
}));

const api = apiClient as unknown as {
  get: jest.Mock;
  patch: jest.Mock;
};

const ID = '11111111-1111-4111-8111-111111111111';
const REF = '22222222-2222-4222-8222-222222222222';

beforeEach(() => jest.resetAllMocks());

describe('notificationsApi', () => {
  it('normalizes current Backend envelope and preserves only actionable reference metadata', async () => {
    api.get.mockResolvedValue({
      data: {
        success: true,
        statusCode: 200,
        message: 'Success',
        data: [{
          id: ID,
          userId: 'PRIVATE_USER_ID',
          title: 'Thá»£ Ä‘ang di chuyá»ƒn',
          message: 'Ká»¹ thuáº­t viÃªn Ä‘ang Ä‘áº¿n.',
          type: 'TECHNICIAN_EN_ROUTE',
          referenceId: REF,
          referenceType: 'SERVICE_ORDER',
          isRead: false,
          createdAt: '2026-10-01T01:00:00.000Z',
        }],
      },
    });

    const rows = await notificationsApi.getNotificationRows(1, 20);

    expect(api.get).toHaveBeenCalledWith('/notifications', {
      params: { page: 1, limit: 20 },
    });
    expect(rows).toEqual([{
      id: ID,
      title: 'Thá»£ Ä‘ang di chuyá»ƒn',
      message: 'Ká»¹ thuáº­t viÃªn Ä‘ang Ä‘áº¿n.',
      type: 'TECHNICIAN_EN_ROUTE',
      referenceId: REF,
      referenceType: 'SERVICE_ORDER',
      isRead: false,
      createdAt: '2026-10-01T01:00:00.000Z',
    }]);
    expect(rows[0]).not.toHaveProperty('userId');
  });

  it('also accepts a direct row array without inventing pagination metadata', async () => {
    api.get.mockResolvedValue({
      data: [{
        id: ID,
        title: 'ThÃ´ng bÃ¡o',
        body: 'Ná»™i dung cÅ©',
        type: 'INFO',
        referenceId: null,
        referenceType: null,
        isRead: true,
        createdAt: '2026-10-01T01:00:00.000Z',
      }],
    });

    await expect(notificationsApi.getNotificationRows()).resolves.toEqual([{
      id: ID,
      title: 'ThÃ´ng bÃ¡o',
      message: 'Ná»™i dung cÅ©',
      body: 'Ná»™i dung cÅ©',
      type: 'INFO',
      referenceId: null,
      referenceType: null,
      isRead: true,
      createdAt: '2026-10-01T01:00:00.000Z',
    }]);
  });

  it('fails closed on malformed rows', async () => {
    api.get.mockResolvedValue({
      data: { data: [{ id: '', title: 'x', message: 'y' }] },
    });

    await expect(notificationsApi.getNotificationRows()).rejects.toThrow();
  });

  it('unwraps unread count and clamps malformed count to zero', async () => {
    api.get.mockResolvedValueOnce({ data: { data: { count: 4 } } });
    await expect(notificationsApi.getCountUnread()).resolves.toBe(4);

    api.get.mockResolvedValueOnce({ data: { data: { count: -1 } } });
    await expect(notificationsApi.getCountUnread()).resolves.toBe(0);
  });

  it('uses the existing read endpoints', async () => {
    api.patch.mockResolvedValue({ data: {} });

    await notificationsApi.readNotification(ID);
    await notificationsApi.readAll();

    expect(api.patch).toHaveBeenNthCalledWith(1, `/notifications/${ID}/read`);
    expect(api.patch).toHaveBeenNthCalledWith(2, '/notifications/read-all');
  });
});
