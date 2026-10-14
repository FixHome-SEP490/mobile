import apiClient from '../../../api/client';
import { fetchStrictCatalog, fetchStrictPartById } from './parts-catalog-adapter';

jest.mock('../../../api/client', () => ({
  get: jest.fn(),
}));

const mockGet = apiClient.get as jest.Mock;

beforeEach(() => {
  mockGet.mockReset();
});

it('fetchStrictCatalog returns parsed parts and meta for valid payload', async () => {
  mockGet.mockResolvedValueOnce({
    data: {
      data: [
        {
          id: 'part-1',
          sku: 'SKU-1',
          name: 'Ống đồng',
          description: 'Mô tả',
          sellingPrice: 150000,
          warrantyDays: 90,
          warrantyPolicy: 'Chính hãng',
          isActive: true,
          createdAt: '2026-10-13T00:00:00Z',
          updatedAt: '2026-10-13T00:00:00Z',
        },
      ],
      meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
    },
  });

  const res = await fetchStrictCatalog({ page: 1 });
  expect(res.data).toHaveLength(1);
  expect(res.data[0].name).toBe('Ống đồng');
  expect(res.data[0].sellingPrice).toBe(150000);
  expect(res.meta.total).toBe(1);
});

it('fetchStrictCatalog throws and fails closed when data is malformed instead of returning []', async () => {
  mockGet.mockResolvedValueOnce({
    data: {
      data: 'not-an-array',
    },
  });

  await expect(fetchStrictCatalog()).rejects.toThrow('Catalog data is not a list');
});

it('fetchStrictCatalog throws when item sellingPrice is invalid', async () => {
  mockGet.mockResolvedValueOnce({
    data: {
      data: [
        { id: 'part-1', name: 'Ống đồng', sellingPrice: -100 },
      ],
    },
  });

  await expect(fetchStrictCatalog()).rejects.toThrow('Invalid catalog item sellingPrice');
});

it('fetchStrictPartById returns valid part detail and throws on invalid ID', async () => {
  await expect(fetchStrictPartById('')).rejects.toThrow('Invalid part ID');

  mockGet.mockResolvedValueOnce({
    data: {
      id: 'part-1',
      name: 'Gas R32',
      sellingPrice: 300000,
      warrantyDays: 30,
      isActive: true,
    },
  });

  const part = await fetchStrictPartById('part-1');
  expect(part.name).toBe('Gas R32');
  expect(part.sellingPrice).toBe(300000);
});

it('fetchStrictPartById throws on catalog part ID mismatch', async () => {
  mockGet.mockResolvedValueOnce({
    data: {
      id: 'part-different',
      name: 'Gas R32',
      sellingPrice: 300000,
    },
  });

  await expect(fetchStrictPartById('part-1')).rejects.toThrow('Catalog part ID mismatch');
});

it('fetchStrictCatalog accepts integer wire string prices and rejects fractional/unsafe money', async () => {
  mockGet.mockResolvedValueOnce({
    data: {
      data: [{ id: 'p1', name: 'Van', sellingPrice: '250000' }],
      meta: { total: 1 },
    },
  });
  const res = await fetchStrictCatalog();
  expect(res.data[0].sellingPrice).toBe(250000);

  // Decimal/fractional
  mockGet.mockResolvedValueOnce({
    data: { data: [{ id: 'p2', name: 'Van', sellingPrice: 150000.5 }] },
  });
  await expect(fetchStrictCatalog()).rejects.toThrow('Invalid catalog item sellingPrice');

  // Decimal string
  mockGet.mockResolvedValueOnce({
    data: { data: [{ id: 'p3', name: 'Van', sellingPrice: '150000.5' }] },
  });
  await expect(fetchStrictCatalog()).rejects.toThrow('Invalid catalog item sellingPrice');

  // Unsafe integer
  mockGet.mockResolvedValueOnce({
    data: { data: [{ id: 'p4', name: 'Van', sellingPrice: Number.MAX_SAFE_INTEGER + 1000 }] },
  });
  await expect(fetchStrictCatalog()).rejects.toThrow('Invalid catalog item sellingPrice');
});
