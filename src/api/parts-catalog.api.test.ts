import apiClient from './client';
import { partsCatalogApi } from './parts-catalog.api';

jest.mock('./client', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
  },
}));

const mockGet = apiClient.get as jest.Mock;

describe('partsCatalogApi', () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  it('getCatalog requests /parts/catalog with query parameters and unwraps response', async () => {
    const mockData = [
      {
        id: 'fh-part-1',
        name: 'Tụ ngậm 35uF',
        sku: 'CAP-35',
        sellingPrice: 150000,
        warrantyDays: 180,
        warrantyPolicy: 'BH 6 tháng',
        isActive: true,
      },
    ];
    mockGet.mockResolvedValueOnce({
      data: {
        data: mockData,
        meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
      },
    });

    const res = await partsCatalogApi.getCatalog({ search: 'Tụ', limit: 10 });
    expect(mockGet).toHaveBeenCalledWith('/parts/catalog', {
      params: { search: 'Tụ', limit: 10 },
    });
    expect(res.data).toEqual(mockData);
    expect(res.meta?.total).toBe(1);
  });

  it('getPartById requests /parts/catalog/:id and returns part detail', async () => {
    const mockPart = {
      id: 'fh-part-1',
      name: 'Tụ ngậm 35uF',
      sku: 'CAP-35',
      sellingPrice: 150000,
      warrantyDays: 180,
      warrantyPolicy: 'BH 6 tháng',
    };
    mockGet.mockResolvedValueOnce({
      data: { data: mockPart },
    });

    const res = await partsCatalogApi.getPartById('fh-part-1');
    expect(mockGet).toHaveBeenCalledWith('/parts/catalog/fh-part-1');
    expect(res).toEqual(mockPart);
  });
});
