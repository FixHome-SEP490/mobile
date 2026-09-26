import apiClient from './client';
import { partRequestsApi } from './part-requests.api';

jest.mock('./client', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
  },
}));

const mockGet = apiClient.get as jest.Mock;
const mockPost = apiClient.post as jest.Mock;
const mockPatch = apiClient.patch as jest.Mock;

describe('partRequestsApi', () => {
  const ORDER_ID = 'order-123';
  const REQUEST_ID = 'req-456';

  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
    mockPatch.mockReset();
  });

  it('getByOrderId requests /service-orders/:orderId/part-requests', async () => {
    const mockList = [
      {
        id: REQUEST_ID,
        serviceOrderId: ORDER_ID,
        technicianId: 'tech-1',
        requestType: 'pre_repair',
        fulfillmentMethod: 'pickup',
        status: 'ready',
        shippingFee: 0,
        items: [],
      },
    ];
    mockGet.mockResolvedValueOnce({ data: { data: mockList } });

    const res = await partRequestsApi.getByOrderId(ORDER_ID);
    expect(mockGet).toHaveBeenCalledWith(`/service-orders/${ORDER_ID}/part-requests`);
    expect(res).toEqual(mockList);
  });

  it('createPreRepair posts items, fulfillmentMethod, and reason', async () => {
    const payload = {
      items: [{ partCatalogId: 'fh-part-1', quantity: 2, note: 'Thay tụ' }],
      fulfillmentMethod: 'pickup' as const,
      reason: 'Cần linh kiện trước khi sửa',
    };
    const mockCreated = { id: REQUEST_ID, status: 'requested', ...payload };
    mockPost.mockResolvedValueOnce({ data: { data: mockCreated } });

    const res = await partRequestsApi.createPreRepair(ORDER_ID, payload);
    expect(mockPost).toHaveBeenCalledWith(
      `/service-orders/${ORDER_ID}/part-requests`,
      payload,
    );
    expect(res).toEqual(mockCreated);
  });

  it('receiveByQr posts qrToken to /part-requests/:id/receive', async () => {
    const mockReceived = { id: REQUEST_ID, status: 'received' };
    mockPost.mockResolvedValueOnce({ data: { data: mockReceived } });

    const res = await partRequestsApi.receiveByQr(REQUEST_ID, { qrToken: 'TOKEN_123' });
    expect(mockPost).toHaveBeenCalledWith(
      `/part-requests/${REQUEST_ID}/receive`,
      { qrToken: 'TOKEN_123' },
    );
    expect(res).toEqual(mockReceived);
  });

  it('updateItemUsage patches usageStatus to /part-requests/:id/items/:itemId/usage', async () => {
    const ITEM_ID = 'item-789';
    const mockUpdatedItem = { id: ITEM_ID, usageStatus: 'used' };
    mockPatch.mockResolvedValueOnce({ data: { data: mockUpdatedItem } });

    const res = await partRequestsApi.updateItemUsage(REQUEST_ID, ITEM_ID, {
      usageStatus: 'used',
    });
    expect(mockPatch).toHaveBeenCalledWith(
      `/part-requests/${REQUEST_ID}/items/${ITEM_ID}/usage`,
      { usageStatus: 'used' },
    );
    expect(res).toEqual(mockUpdatedItem);
  });

  it('cancel patches to /part-requests/:id/cancel', async () => {
    const mockCancelled = { id: REQUEST_ID, status: 'cancelled' };
    mockPatch.mockResolvedValueOnce({ data: { data: mockCancelled } });

    const res = await partRequestsApi.cancel(REQUEST_ID);
    expect(mockPatch).toHaveBeenCalledWith(`/part-requests/${REQUEST_ID}/cancel`);
    expect(res).toEqual(mockCancelled);
  });
});
