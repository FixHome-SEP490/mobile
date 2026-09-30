import apiClient from './client';
import { supportCasesApi } from './support-cases.api';

jest.mock('./client', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), delete: jest.fn() },
}));

const api = apiClient as unknown as { get: jest.Mock; post: jest.Mock };
const ORDER_ID = '11111111-1111-4111-8111-111111111111';
const CASE_ID = '22222222-2222-4222-8222-222222222222';

const row = {
  id: CASE_ID,
  caseType: 'quality',
  status: 'open',
  bookingId: null,
  serviceOrderId: ORDER_ID,
  reason: 'Chất lượng sửa chữa chưa đạt yêu cầu.',
  description: null,
  resolutionReason: null,
  evidenceRefs: null,
  isUrgent: false,
  respondBy: null,
  resolvedAt: null,
  createdAt: '2026-09-30T00:00:00.000Z',
  updatedAt: '2026-09-30T00:00:00.000Z',
};

beforeEach(() => jest.resetAllMocks());

describe('Customer support-case API contract', () => {
  it('lists only the signed-in actor support cases for one service order', async () => {
    api.get.mockResolvedValue({
      data: { data: [row], meta: { page: 1, limit: 20, total: 1, totalPages: 1 } },
    });
    const result = await supportCasesApi.listMine({ page: 1, limit: 20, serviceOrderId: ORDER_ID });
    expect(api.get).toHaveBeenCalledWith('/support/cases/mine', {
      params: { page: 1, limit: 20, serviceOrderId: ORDER_ID },
    });
    expect(result.data).toMatchObject([{ id: CASE_ID, serviceOrderId: ORDER_ID }]);
  });

  it('loads actor-safe detail from mine/:id rather than the manager detail endpoint', async () => {
    api.get.mockResolvedValue({ data: { data: { ...row, status: 'in_review' } } });
    const result = await supportCasesApi.getMine(CASE_ID);
    expect(api.get).toHaveBeenCalledWith(`/support/cases/mine/${CASE_ID}`);
    expect(api.get.mock.calls[0][0]).not.toBe(`/support/cases/${CASE_ID}`);
    expect(result.status).toBe('in_review');
  });

  it('creates a case with only the bounded customer payload', async () => {
    const payload = {
      caseType: 'quality' as const,
      reason: 'Chất lượng sửa chữa chưa đạt yêu cầu.',
      serviceOrderId: ORDER_ID,
      isUrgent: true,
    };
    api.post.mockResolvedValue({ data: { data: { ...row, ...payload, isUrgent: true } } });
    await supportCasesApi.createCase(payload);
    expect(api.post).toHaveBeenCalledWith('/support/cases', payload);
    expect(api.post.mock.calls[0][1]).not.toHaveProperty('customerId');
    expect(api.post.mock.calls[0][1]).not.toHaveProperty('technicianId');
    expect(api.post.mock.calls[0][1]).not.toHaveProperty('status');
    expect(api.post.mock.calls[0][1]).not.toHaveProperty('resolutionReason');
  });

  it('rejects unsupported server categories instead of rendering invented copy', async () => {
    api.get.mockResolvedValue({
      data: { data: [{ ...row, caseType: 'unknown_type' }], meta: { page: 1, limit: 20, total: 1, totalPages: 1 } },
    });
    await expect(supportCasesApi.listMine({ serviceOrderId: ORDER_ID })).rejects.toThrow(/không được hỗ trợ/);
  });
});
