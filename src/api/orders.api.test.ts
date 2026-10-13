import apiClient from './client';
import { ordersApi } from './orders.api';

jest.mock('./client', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));

const api = apiClient as unknown as { get: jest.Mock };
const order = {
  id: 'order-1', code: 'TEST-1', bookingId: 'booking-1',
  status: 'accepted', paymentStatus: 'unpaid',
  createdAt: '2026-10-09T00:00:00.000Z',
  laborTotal: 0, partsTotal: 0, grandTotal: 0,
};
beforeEach(() => jest.resetAllMocks());

const history = {
  id: 'history-1', code: 'TEST-H', status: 'completed',
  createdAt: '2026-10-09T00:00:00.000Z', historical: true,
};
const sanitizedHistory = { ...history, status: 'COMPLETED', completedAt: null, cancelledAt: null };
const technicianReaders = [
  { name: 'list', list: true, read: () => ordersApi.getTechnicianJobs() },
  { name: 'page', list: true, read: async () => (await ordersApi.getTechnicianJobsPage()).data },
  { name: 'detail', list: false, read: async () => [await ordersApi.getTechnicianOrder('history-1')] },
];
describe.each(technicianReaders)('Technician $name history privacy', ({ list, read }) => {
  it.each(['raw', 'wrapped'])('accepts %s history without monetary fields', async shape => {
    const value = list ? [history] : history;
    api.get.mockResolvedValueOnce({ data: shape === 'wrapped' ? { data: value } : value });
    expect(await read()).toEqual([sanitizedHistory]);
  });
  it('projects only the allowlist even when the server adds private fields', async () => {
    const row = { ...history, customerName: 'PRIVATE', customerPhone: 'PRIVATE',
      bookingId: 'PRIVATE', addressSummary: 'PRIVATE', scheduledAt: 'PRIVATE',
      laborTotal: null, partsTotal: NaN, grandTotal: 999,
      quotation: { items: ['PRIVATE'] }, destination: { lat: 1, lng: 2 }, media: ['PRIVATE'] };
    api.get.mockResolvedValueOnce({ data: { data: list ? [row] : row } });
    expect(await read()).toEqual([sanitizedHistory]);
  });
});
it('preserves mixed page rows and server total', async () => {
  api.get.mockResolvedValueOnce({ data: { data: [order, history], meta: { total: 42 } } });
  expect(await ordersApi.getTechnicianJobsPage(2, 20)).toEqual({
    data: [expect.objectContaining({ laborTotal: 0, status: 'ACCEPTED' }), sanitizedHistory], total: 42,
  });
  expect(api.get).toHaveBeenCalledWith('/service-orders/my', { params: { page: 2, pageSize: 20 } });
});
// T-API-LIST technician-only malformed success: RED before parser change.
// These are offline API-client mocks, not evidence of a live Backend defect.
describe('getTechnicianJobsPage fail-closed list envelope', () => {
  it.each([
    ['null body', null],
    ['undefined body', undefined],
    ['scalar body', 9],
    ['missing data', {}],
    ['null data', { data: null }],
    ['object data', { data: {} }],
    ['text data', { data: 'not-an-array' }],
    ['nested envelope', { data: { data: [] } }],
  ])('rejects HTTP success with %s instead of showing an empty list', async (_name, payload) => {
    api.get.mockResolvedValueOnce({ data: payload });
    await expect(ordersApi.getTechnicianJobsPage()).rejects.toThrow('Danh sách');
  });

  it.each([
    ['raw', []],
    ['wrapped', { data: [] }],
    ['wrapped with count', { data: [], meta: { total: 7 } }],
  ])('preserves a legitimate %s empty array', async (_name, payload) => {
    api.get.mockResolvedValueOnce({ data: payload });
    const page = await ordersApi.getTechnicianJobsPage();
    expect(page).toEqual({
      data: [],
      total: _name === 'wrapped with count' ? 7 : 0,
    });
  });
});