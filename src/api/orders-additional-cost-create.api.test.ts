import apiClient from './client';
import { ordersApi } from './orders.api';

jest.mock('./client', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));

const post = apiClient.post as jest.Mock;

const ORDER_ID = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  post.mockReset();
  post.mockResolvedValue({ data: { data: { id: 'ac-1', status: 'PENDING_APPROVAL' } } });
});

describe('createAdditionalCostProposal labor-only proposal contract', () => {
  const payload = {
    reason: 'Phát hiện thêm mối hàn hở cần gia cố',
    items: [{ type: 'labor' as const, description: 'Gia cố mối hàn', quantity: 1, unitPrice: 120000 }],
  };

  it('POSTs the exact proposal shape with no payment/decision fields', async () => {
    await ordersApi.createAdditionalCostProposal(ORDER_ID, payload);
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith(`/service-orders/${ORDER_ID}/additional-costs`, payload);
    const rendered = JSON.stringify(post.mock.calls[0][1]);
    expect(rendered).not.toMatch(/paidWarranty|pay|commission|approve|reject|revise|deposit/i);
  });

  it('forwards an optional note untouched', async () => {
    await ordersApi.createAdditionalCostProposal(ORDER_ID, { ...payload, note: 'Khách nên biết.' });
    expect(post).toHaveBeenCalledWith(
      `/service-orders/${ORDER_ID}/additional-costs`,
      { ...payload, note: 'Khách nên biết.' },
    );
  });

  it('returns the created pending proposal body for reconciliation', async () => {
    const result = await ordersApi.createAdditionalCostProposal(ORDER_ID, payload);
    expect(result).toEqual({ id: 'ac-1', status: 'PENDING_APPROVAL' });
  });

  it('never touches the decision endpoint', async () => {
    await ordersApi.createAdditionalCostProposal(ORDER_ID, payload);
    expect(post.mock.calls[0][0]).not.toMatch(/decision/);
  });
});
