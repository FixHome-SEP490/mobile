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

  it('converts legacy Mobile pageSize to Backend limit with a safe page', async () => {
    await servicesApi.getServices({ pageSize: 100 });
    expect(get).toHaveBeenCalledWith('/services', { params: { page: 1, limit: 100 } });
  });

  it('passes page and search through to the Backend catalog', async () => {
    await servicesApi.getServices({ page: 3, pageSize: 20, search: 'máy lạnh' });
    expect(get).toHaveBeenCalledWith('/services', { params: { page: 3, limit: 20, search: 'máy lạnh' } });
  });

  it('clamps invalid page and oversized limit to Backend bounds', async () => {
    await servicesApi.getServices({ page: 0, pageSize: 500 });
    expect(get).toHaveBeenCalledWith('/services', { params: { page: 1, limit: 100 } });
  });

  it('fetches one active service detail by real id', async () => {
    const id = '11111111-1111-4111-8111-111111111111';
    get.mockResolvedValue({ data: { data: { id, name: 'Vệ sinh máy lạnh' } } });
    const service = await servicesApi.getServiceById(id);
    expect(get).toHaveBeenCalledWith(`/services/${id}`);
    expect(service).toMatchObject({ id });
  });

  it('reads the Backend total from meta, falling back to list length', async () => {
    get.mockResolvedValue({ data: [{ id: 'a' }] });
    const result = await servicesApi.getServices({});
    expect(result.total).toBe(1);
  });
});
