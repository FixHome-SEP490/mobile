import apiClient from './client';
import { ordersApi } from './orders.api';

jest.mock('./client', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));

const post = apiClient.post as jest.Mock;

const ORDER_ID = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  post.mockReset();
  post.mockResolvedValue({ data: { data: { id: 'q-1', status: 'SENT' } } });
});

describe('createQuotation labor-only proposal contract', () => {
  const payload = {
    items: [{ type: 'labor' as const, description: 'Thay tụ nguồn', quantity: 1, unitPrice: 180000 }],
  };

  it('POSTs the exact labor-only shape with no fee/deposit/payment fields', async () => {
    await ordersApi.createQuotation(ORDER_ID, payload);
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith(`/service-orders/${ORDER_ID}/quotations`, payload);
    const rendered = JSON.stringify(post.mock.calls[0][1]);
    expect(rendered).not.toMatch(/parts_equipment|fee|deposit|pay|approve|warranty/i);
  });

  it('forwards an optional note untouched', async () => {
    await ordersApi.createQuotation(ORDER_ID, { ...payload, note: 'Bao gồm công tháo lắp.' });
    expect(post).toHaveBeenCalledWith(
      `/service-orders/${ORDER_ID}/quotations`,
      { ...payload, note: 'Bao gồm công tháo lắp.' },
    );
  });

  it('returns the created quotation body for reconciliation', async () => {
    const result = await ordersApi.createQuotation(ORDER_ID, payload);
    expect(result).toEqual({ id: 'q-1', status: 'SENT' });
  });
});

describe('createQuotation multi-line labor + technician-parts contract', () => {
  const mixed = {
    items: [
      { type: 'labor' as const, description: 'Thay tụ nguồn', quantity: 2, unitPrice: 180000 },
      {
        type: 'parts_equipment' as const,
        description: 'Tụ 450V',
        quantity: 2,
        unitPrice: 25000,
        partSource: 'technician' as const,
        partWarrantyOption: 'no_warranty' as const,
      },
      {
        type: 'parts_equipment' as const,
        description: 'Bo mạch chính hãng',
        quantity: 1,
        unitPrice: 850000,
        partSource: 'technician' as const,
        partWarrantyOption: 'paid_warranty' as const,
        warrantyFee: 90000,
        warrantyTermDays: 180,
      },
    ],
    note: 'Giá dự kiến, chờ khách duyệt.',
  };

  it('POSTs mixed lines with no FixHome catalog fields and no labor warranty', async () => {
    await ordersApi.createQuotation(ORDER_ID, mixed);
    expect(post).toHaveBeenCalledWith(`/service-orders/${ORDER_ID}/quotations`, mixed);
    const rendered = JSON.stringify(post.mock.calls[0][1]);
    expect(rendered).not.toMatch(/partCatalogId|fixhome|deposit|pay|approve/i);
    expect(post.mock.calls[0][1].items[0]).not.toHaveProperty('partSource');
    expect(post.mock.calls[0][1].items[0]).not.toHaveProperty('warrantyFee');
    expect(post.mock.calls[0][1].items[1]).not.toHaveProperty('warrantyFee');
    expect(post.mock.calls[0][1].items[1]).not.toHaveProperty('warrantyTermDays');
  });
});
