import apiClient from './client';
import { servicesApi } from './services.api';

jest.mock('./client', () => ({ __esModule: true, default: { get: jest.fn() } }));

const get = apiClient.get as jest.Mock;

describe('Mobile services catalog query matches Backend pagination DTO', () => {
  beforeEach(() => {
    get.mockReset();
    get.mockResolvedValue({
      data: { success: true, statusCode: 200, message: 'Success', data: [], meta: { page: 1, limit: 100, total: 0, totalPages: 0 } },
    });
  });

  it('converts legacy Mobile pageSize to Backend limit, not an unrecognized query param', async () => {
    await servicesApi.getServices({ pageSize: 100 });
    expect(get).toHaveBeenCalledWith('/services', { params: { limit: 100 } });
  });
});