import apiClient from './client';
import { ordersApi } from './orders.api';
jest.mock('./client', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), patch: jest.fn() } }));
const api = apiClient as unknown as { get: jest.Mock; post: jest.Mock; patch: jest.Mock };
beforeEach(() => jest.resetAllMocks());
it('preserves uploader and exact face normalization from envelope', async () => {
  api.get.mockResolvedValue({ data: { success: true, data: [{ id: 'e', type: 'checkin_face', uploaderId: 'tech' }] } });
  expect(await ordersApi.getEvidence('o')).toEqual([{ id: 'e', type: 'CHECKIN_FACE', uploaderId: 'tech' }]);
});
it('uploads exact checkin_face multipart with metadata and existing private transport', async () => {
  api.post.mockResolvedValue({ data: { data: { id: 'e' } } });
  const original = globalThis.FormData;
  const fields: unknown[][] = [];
  globalThis.FormData = class { append(...args: unknown[]) { fields.push(args); } } as unknown as typeof FormData;
  try {
    await ordersApi.uploadCheckInFace('o', { uri: 'file://fixture', name: 'fixture.jpg', type: 'image/jpeg' }, { capturedAt: '2026-10-13T00:00:00Z', note: 'Fixture' });
    expect(fields).toContainEqual(['type', 'checkin_face']);
    expect(fields).toContainEqual(['capturedAt', '2026-10-13T00:00:00Z']);
    expect(api.post).toHaveBeenCalledWith('/service-orders/o/evidence', expect.anything(), { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 60000 });
  } finally { globalThis.FormData = original; }
});
it('tracking uses PATCH and exact UpdateLocationDto', async () => {
  api.patch.mockResolvedValue({ data: { data: { updatedAt: 'fixture' } } });
  expect(await ordersApi.updateOrderLocation('o', { lat: 10, lng: 106 })).toEqual({ updatedAt: 'fixture' });
  expect(api.patch).toHaveBeenCalledWith('/service-orders/o/location', { lat: 10, lng: 106 });
});
it('check-in sends valid object device metadata unchanged in the exact POST body', async () => {
  api.post.mockResolvedValue({ data: { data: { result: 'valid' } } });
  const payload = { lat: 10, lng: 106, accuracyMeters: 12, deviceInfo: { platform: 'android', measurementSource: 'foreground', fixture: true } };
  expect(await ordersApi.checkIn('o', payload)).toEqual({ result: 'valid' });
  expect(api.post).toHaveBeenCalledWith('/service-orders/o/check-in', payload);
});
it('revision is POST to proposal ID; completionNote and warranty selection retain exact DTO names', async () => {
  api.post.mockResolvedValue({ data: { data: { id: 'new' } } });
  const payload = { reason: 'Fixture', items: [{ type: 'labor' as const, description: 'Fixture', quantity: 1, unitPrice: 0 }] };
  await ordersApi.reviseAdditionalCost('old', payload);
  expect(api.post).toHaveBeenLastCalledWith('/additional-costs/old/revise', payload);
  await ordersApi.requestCompletion('o', { completionNote: 'Fixture' });
  expect(api.post).toHaveBeenLastCalledWith('/service-orders/o/request-completion', { completionNote: 'Fixture' });
  await ordersApi.decideAdditionalCost('new', 'APPROVE', ['item']);
  expect(api.post).toHaveBeenLastCalledWith('/additional-costs/new/decision', { action: 'APPROVE', paidWarrantyItemIds: ['item'] });
});
it('invoice and cash null remain null', async () => {
  api.get.mockResolvedValue({ data: { success: true, data: null } });
  expect(await ordersApi.getInvoice('o')).toBeNull();
  expect(await ordersApi.getCashSettlement('o')).toBeNull();
});
const report = { reasonCode: 'new_fault_found' as const, reason: 'Phát sinh lỗi thêm cần thay linh kiện', evidenceIds: ['e1'], confirm: true as const };
it('reads whether the next order can be reported late, with the job the technician is on', async () => {
  const status = { eligible: true, block: null, currentOrderCode: 'C1', currentOrderId: 'c1', currentOrderStatus: 'under_repair', windowMinutes: 180,
    delayNotice: { minutes: 60, noticedAt: '2026-10-31T03:00:00Z', decision: null, reasonCode: 'new_fault_found' } };
  api.get.mockResolvedValue({ data: { data: status } });
  expect(await ordersApi.overrunReleaseStatus('o')).toEqual(status);
  expect(api.get).toHaveBeenCalledWith('/service-orders/o/overrun-release');
  api.get.mockResolvedValue({ data: { data: null } });
  expect((await ordersApi.overrunReleaseStatus('o')).eligible).toBe(false);
});
it('delay notice and the customer decision post to their own routes', async () => {
  api.post.mockResolvedValue({ data: { data: { id: 'o' } } });
  await ordersApi.sendDelayNotice('o', { ...report, delayMinutes: 60 });
  expect(api.post).toHaveBeenLastCalledWith('/service-orders/o/delay-notice', { ...report, delayMinutes: 60 });
  await ordersApi.decideDelay('o', 'switch');
  expect(api.post).toHaveBeenLastCalledWith('/service-orders/o/delay-decision', { decision: 'switch' });
});
it('an ADDITIONAL photo upload returns the evidence id and refuses a reply without one', async () => {
  api.post.mockResolvedValue({ data: { data: { id: 'ev-1' } } });
  expect(await ordersApi.uploadEvidenceAdditional('o', { uri: 'file:///a.jpg', name: 'a.jpg', type: 'image/jpeg' })).toEqual({ id: 'ev-1' });
  expect(api.post.mock.calls.at(-1)![0]).toBe('/service-orders/o/evidence');
  api.post.mockResolvedValue({ data: { data: {} } });
  await expect(ordersApi.uploadEvidenceAdditional('o', { uri: 'file:///a.jpg', name: 'a.jpg', type: 'image/jpeg' })).rejects.toThrow('ảnh');
});
it('asks Backend to filter the technician list by status before it builds each order', async () => {
  api.get.mockResolvedValue({ data: { data: [] } });
  await ordersApi.getTechnicianJobs({ excludeVisitGroups: true, statuses: ['accepted', 'en_route'] });
  expect(api.get).toHaveBeenLastCalledWith('/service-orders/my', { params: { excludeVisitGroups: 'true', statuses: 'accepted,en_route' } });
  await ordersApi.getTechnicianJobs({ excludeVisitGroups: true });
  expect(api.get).toHaveBeenLastCalledWith('/service-orders/my', { params: { excludeVisitGroups: 'true' } });
});
