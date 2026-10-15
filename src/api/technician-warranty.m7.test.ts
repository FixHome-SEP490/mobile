import apiClient from './client';
import { technicianWarrantyApi } from './technician-warranty.api';
import { ids, assignedClaim } from '../features/order-flow/aftercare/m7-fixtures.test-utils';
jest.mock('./client', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
const client = apiClient as unknown as { get: jest.Mock; post: jest.Mock };
beforeEach(() => jest.resetAllMocks());
it('reads exact assigned mine paging and sanitizes staff internals, no original repair lookup', async () => {
  client.get.mockResolvedValue({ data: { success: true, statusCode: 200, message: 'Success', data: [{ ...assignedClaim(), internalStaffNotes: 'PRIVATE' }], meta: { page: 1, pageSize: 100, total: 1 } } });
  const result = await technicianWarrantyApi.listMine(); expect(result.data[0].order.addressSummary).toBe('Địa chỉ mẫu'); expect(JSON.stringify(result)).not.toContain('PRIVATE');
  expect(client.get).toHaveBeenCalledWith('/warranty-claims/mine', { params: { page: 1, pageSize: 100 } });
});
it('exact claim lookup walks authorized mine pages only; does not invent a detail endpoint', async () => {
  client.get.mockResolvedValueOnce({ data: { data: [{ ...assignedClaim(), id: ids.coverage }], meta: { page: 1, pageSize: 1, total: 2 } } })
    .mockResolvedValueOnce({ data: { data: [assignedClaim()], meta: { page: 2, pageSize: 1, total: 2 } } });
  expect((await technicianWarrantyApi.findMine(ids.claim, { pageSize: 1 }))?.id).toBe(ids.claim);
  expect(client.get.mock.calls.map(c => c[0])).toEqual(['/warranty-claims/mine', '/warranty-claims/mine']);
});
it('malformed metadata and unsupported/staff query fields never become empty authorized results', async () => {
  client.get.mockResolvedValue({ data: { data: [], meta: {} } }); await expect(technicianWarrantyApi.listMine()).rejects.toThrow();
  await expect(technicianWarrantyApi.listMine({ technicianId: ids.tech } as never)).rejects.toThrow();
  await expect(technicianWarrantyApi.listMine({ page: 0 })).rejects.toThrow();
});
it.each(['accept', 'decline', 'check-in', 'propose', 'complete'] as const)('dispatches only the real %s route with whitelisted DTO', async operation => {
  client.post.mockResolvedValue({ data: { data: assignedClaim() } });
  const dto = operation === 'accept' || operation === 'check-in' ? {} : operation === 'decline' ? { reasonCode: 'busy' } : operation === 'propose' ? { result: 'covered_workmanship', findings: 'Kiểm tra lỗi thực tế' } : { notes: 'Đã xử lý lỗi thực tế' };
  await technicianWarrantyApi.command(ids.claim, operation, dto); expect(client.post).toHaveBeenCalledWith(`/warranty-claims/${ids.claim}/${operation}`, dto);
  await expect(technicianWarrantyApi.command(ids.claim, operation, { ...dto, approvedByManager: true })).rejects.toThrow(); expect(client.post).toHaveBeenCalledTimes(1);
});
