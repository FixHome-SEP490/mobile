import apiClient from './client';
import { ordersApi } from './orders.api';

jest.mock('./client', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), delete: jest.fn() },
}));

const api = apiClient as unknown as { get: jest.Mock; post: jest.Mock; delete: jest.Mock };
const ORDER_ID = '11111111-1111-4111-8111-111111111111';
const COVERAGE_ID = '22222222-2222-4222-8222-222222222222';
const CLAIM_ID = '33333333-3333-4333-8333-333333333333';

beforeEach(() => jest.resetAllMocks());

describe('Customer warranty API contract', () => {
  it('loads warranty coverages from the order-scoped authority', async () => {
    api.get.mockResolvedValue({ data: { data: [{
      id: COVERAGE_ID,
      serviceOrderId: ORDER_ID,
      warrantyDaysSnapshot: 30,
      note: 'Công sửa chữa',
      startsAt: '2026-09-01T00:00:00.000Z',
      expiresAt: '2026-10-01T00:00:00.000Z',
      status: 'ACTIVE',
    }] } });
    const rows = await ordersApi.getOrderWarranties(ORDER_ID);
    expect(api.get).toHaveBeenCalledWith(`/service-orders/${ORDER_ID}/warranties`);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: COVERAGE_ID, status: 'ACTIVE' });
  });

  it('loads warranty claims from the same order and does not use a staff queue', async () => {
    api.get.mockResolvedValue({ data: { data: [{
      id: CLAIM_ID,
      serviceOrderId: ORDER_ID,
      warrantyCoverageId: COVERAGE_ID,
      status: 'submitted',
    }] } });
    const rows = await ordersApi.getOrderWarrantyClaims(ORDER_ID);
    expect(api.get).toHaveBeenCalledWith(`/service-orders/${ORDER_ID}/warranty-claims`);
    expect(api.get.mock.calls[0][0]).not.toMatch(/service-manager|\/mine/);
    expect(rows[0]).toMatchObject({ id: CLAIM_ID, warrantyCoverageId: COVERAGE_ID });
  });

  it('creates a claim with only the customer contract fields supplied by the caller', async () => {
    const payload = {
      warrantyCoverageId: COVERAGE_ID,
      description: 'Thiết bị bị lỗi trở lại sau sửa chữa.',
    };
    api.post.mockResolvedValue({ data: { data: {
      id: CLAIM_ID,
      serviceOrderId: ORDER_ID,
      ...payload,
      status: 'submitted',
    } } });
    await ordersApi.createWarrantyClaim(ORDER_ID, payload);
    expect(api.post).toHaveBeenCalledWith(
      `/service-orders/${ORDER_ID}/warranty-claims`,
      payload,
    );
    expect(api.post.mock.calls[0][1]).not.toHaveProperty('evidenceRefs');
  });

  it('sends an exact agree response with no invented note', async () => {
    api.post.mockResolvedValue({ data: { data: { id: CLAIM_ID, customerResponse: 'agreed' } } });
    await ordersApi.respondWarrantyClaim(ORDER_ID, CLAIM_ID, { decision: 'agree' });
    expect(api.post).toHaveBeenCalledWith(
      `/service-orders/${ORDER_ID}/warranty-claims/${CLAIM_ID}/respond`,
      { decision: 'agree' },
    );
  });

  it('sends the customer dispute note to the order-scoped claim response endpoint', async () => {
    const payload = { decision: 'dispute' as const, note: 'Lỗi vẫn còn sau khi kỹ thuật viên xử lý.' };
    api.post.mockResolvedValue({ data: { data: { id: CLAIM_ID, status: 'disputed' } } });
    await ordersApi.respondWarrantyClaim(ORDER_ID, CLAIM_ID, payload);
    expect(api.post).toHaveBeenCalledWith(
      `/service-orders/${ORDER_ID}/warranty-claims/${CLAIM_ID}/respond`,
      payload,
    );
  });
});
