import apiClient from './client';
import { visitGroupsApi } from './visit-groups.api';
import { bookingsApi } from './bookings.api';
import { ordersApi } from './orders.api';

jest.mock('./client', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));

const api = apiClient as unknown as { get: jest.Mock; post: jest.Mock };
const TECH_A = '11111111-1111-4111-8111-111111111111';
const TECH_B = '22222222-2222-4222-8222-222222222222';

beforeEach(() => jest.resetAllMocks());

describe('visitGroupsApi', () => {
  it('reads contact settings and falls back to the 3-device limit', async () => {
    api.get.mockResolvedValue({ data: { data: { enabled: true, hotline: ' 1900 ' } } });
    await expect(visitGroupsApi.contact()).resolves.toEqual({ enabled: true, deviceLimit: 3, hotline: '1900' });
    api.get.mockResolvedValue({ data: { data: {} } });
    await expect(visitGroupsApi.contact()).resolves.toEqual({ enabled: false, deviceLimit: 3, hotline: null });
  });

  it('maps urgency and sends the idempotency key when creating a visit', async () => {
    api.post.mockResolvedValue({ data: { data: { id: 'v1', status: 'submitted', items: [{ id: 'i1', sequence: 1, booking: { id: 'b1', status: 'submitted', urgency: 'medium' } }] } } });
    const visit = await visitGroupsApi.create({ addressId: 'a', mode: 'scheduled', urgency: 'NORMAL', idempotencyKey: 'k1', items: [{ serviceId: 's1' }, { serviceId: 's2' }] });
    expect(api.post).toHaveBeenCalledWith('/visit-groups', expect.objectContaining({ urgency: 'medium', idempotencyKey: 'k1' }));
    expect(visit.items[0].booking?.status).toBe('SUBMITTED');
  });

  it('pages the customer list with a capped page size and optional filters', async () => {
    api.get.mockResolvedValue({ data: { data: [{ id: 'v1' }], meta: { total: 7 } } });
    await expect(visitGroupsApi.getMyPage(0, 500, { status: 'completed', q: ' máy ' })).resolves.toEqual({ data: [{ id: 'v1' }], total: 7 });
    expect(api.get).toHaveBeenCalledWith('/visit-groups/my-page', { params: { page: 1, pageSize: 100, status: 'completed', q: 'máy' } });
  });

  it('rejects a list body without rows instead of showing an empty list', async () => {
    api.get.mockResolvedValue({ data: { data: { nope: true } } });
    await expect(visitGroupsApi.getAssignedPage(1, 20, 'all')).rejects.toThrow('Danh sách lượt sửa');
  });

  it('keeps only candidates with a valid technician user id', async () => {
    api.get.mockResolvedValue({ data: { data: [{ userId: TECH_A, fullName: 'A' }] } });
    await expect(visitGroupsApi.getCandidates('v1')).resolves.toEqual([{ userId: TECH_A, fullName: 'A', id: TECH_A }]);
    api.get.mockResolvedValue({ data: { data: [{ userId: 'x', fullName: 'A' }] } });
    await expect(visitGroupsApi.getCandidates('v1')).rejects.toThrow('User ID');
  });

  it('shortlists one or two different technicians in order', async () => {
    api.post.mockResolvedValue({ data: {} });
    await visitGroupsApi.sendShortlist('v1', [TECH_A, TECH_B]);
    expect(api.post).toHaveBeenCalledWith('/visit-groups/v1/shortlist', { technicianIds: [TECH_A, TECH_B] });
    await expect(visitGroupsApi.sendShortlist('v1', [TECH_A, TECH_A])).rejects.toThrow('different');
    await expect(visitGroupsApi.sendShortlist('v1', ['bad'] as never)).rejects.toThrow('different');
  });

  it('asks VNPay for the whole visit as the mobile app and requires an https url', async () => {
    api.post.mockResolvedValue({ data: { data: { paymentUrl: ' https://pay.example/x ' } } });
    await expect(visitGroupsApi.createVnpayUrl('v1')).resolves.toBe('https://pay.example/x');
    expect(api.post).toHaveBeenCalledWith('/visit-groups/v1/checkout/vnpay', {}, { headers: { 'x-client-platform': 'mobile' } });
    api.post.mockResolvedValue({ data: { data: { paymentUrl: 'http://pay.example/x' } } });
    await expect(visitGroupsApi.createVnpayUrl('v1')).rejects.toThrow('VNPay');
  });

  it('sends the cash confirmation either as agreed or as a dispute', async () => {
    api.post.mockResolvedValue({ data: {} });
    await visitGroupsApi.confirmCash('v1', true);
    expect(api.post).toHaveBeenLastCalledWith('/visit-groups/v1/checkout/cash/confirm', { agreed: true });
    await visitGroupsApi.confirmCash('v1', false, 'sai');
    expect(api.post).toHaveBeenLastCalledWith('/visit-groups/v1/checkout/cash/confirm', { agreed: false, disputeReason: 'sai' });
  });
});

describe('legacy lists opt out of visit-group devices', () => {
  it.each([
    ['bookings', () => bookingsApi.getMyBookingsPage(1, 20, { excludeVisitGroups: true }), '/bookings/my'],
    ['orders', () => ordersApi.getMyOrdersPage(1, 20, { excludeVisitGroups: true }), '/service-orders/my'],
    ['technician jobs', () => ordersApi.getTechnicianJobsPage(1, 20, { excludeVisitGroups: true }), '/service-orders/my'],
  ])('%s send excludeVisitGroups only when asked', async (_name, read, path) => {
    api.get.mockResolvedValue({ data: { data: [], meta: { total: 0 } } });
    await read();
    expect(api.get).toHaveBeenLastCalledWith(path, { params: { page: 1, pageSize: 20, excludeVisitGroups: 'true' } });
  });

  it('repair history passes the filter and leaves it out by default', async () => {
    api.get.mockResolvedValue({ data: { data: [], meta: { total: 0 } } });
    await ordersApi.getRepairHistory(1, 20, 'completed', { excludeVisitGroups: true });
    expect(api.get).toHaveBeenLastCalledWith('/repair-history', { params: { page: 1, pageSize: 20, status: 'completed', excludeVisitGroups: 'true' } });
    await ordersApi.getRepairHistory(1, 20);
    expect(api.get).toHaveBeenLastCalledWith('/repair-history', { params: { page: 1, pageSize: 20, status: undefined } });
  });
});

describe('visit device orders', () => {
  it('treats a listed-price device of a visit as an inspection order, keeping its listed price', async () => {
    api.get.mockResolvedValue({ data: { data: { id: 'o', status: 'accepted', paymentStatus: 'unpaid', pricingMode: 'FIXED_PRICE', fixedUnitPrice: 300000, visitGroupId: 'v1' } } });
    expect(await ordersApi.getOrder('o')).toMatchObject({ pricingMode: 'INSPECTION_REQUIRED', fixedUnitPrice: 300000 });
    api.get.mockResolvedValue({ data: { data: { id: 'o', status: 'accepted', paymentStatus: 'unpaid', pricingMode: 'FIXED_PRICE', fixedUnitPrice: 300000 } } });
    expect((await ordersApi.getOrder('o')).pricingMode).toBe('FIXED_PRICE');
  });
});
