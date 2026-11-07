import { claimsOfFilter, filterCounts, groupOfClaim, isWarrantyInvitation, nextWarrantyStep, technicianClaimLabel } from './technician-warranty-groups';

const claim = (status: string, extra: Record<string, unknown> = {}) => ({ id: status, status, visit: null, customerResponse: null, ...extra }) as any;
const all = ['resolved', 'submitted', 'inspected', 'accepted', 'rejected', 'awaiting_customer', 'in_progress', 'disputed'].map(status => claim(status));

it('puts every status in the same group as the web, and counts them', () => {
  expect(['submitted', 'accepted', 'in_progress'].map(groupOfClaim)).toEqual(['todo', 'todo', 'todo']);
  expect(['inspected', 'awaiting_customer', 'disputed'].map(groupOfClaim)).toEqual(['waiting', 'waiting', 'waiting']);
  expect(['resolved', 'rejected'].map(groupOfClaim)).toEqual(['closed', 'closed']);
  expect(filterCounts(all)).toEqual({ all: 8, todo: 3, waiting: 3, closed: 2 });
});

it('lists "all" with the claims to do first and keeps the server order inside a group', () => {
  expect(claimsOfFilter(all, 'all').map(c => c.status)).toEqual(['submitted', 'accepted', 'in_progress', 'inspected', 'awaiting_customer', 'disputed', 'resolved', 'rejected']);
  expect(claimsOfFilter(all, 'closed').map(c => c.status)).toEqual(['resolved', 'rejected']);
});

it('tells a new claim as one waiting for the technician, and an agreed one as waiting for the manager', () => {
  expect(technicianClaimLabel(claim('submitted'))).toEqual({ label: 'Chờ bạn nhận', tone: 'warning' });
  expect(technicianClaimLabel(claim('accepted')).label).toBe('Bạn đã nhận');
  expect(technicianClaimLabel(claim('awaiting_customer', { customerResponse: 'agreed' })).label).toContain('chờ quản lý dịch vụ đóng');
  expect(technicianClaimLabel(claim('in_progress')).label).toBe('Đang bảo hành');
  expect(technicianClaimLabel(claim('mystery')).label).toBe('Trạng thái chưa xác định');
});

it('offers the next step of the claim, and none while someone else has to act', () => {
  expect(nextWarrantyStep(claim('submitted'))).toEqual({ step: 'accept', label: 'Nhận yêu cầu' });
  expect(nextWarrantyStep(claim('accepted'))?.step).toBe('check-in');
  expect(nextWarrantyStep(claim('accepted', { visit: { status: 'checked_in' } }))?.step).toBe('propose');
  expect(nextWarrantyStep(claim('in_progress'))?.step).toBe('complete');
  for (const status of ['inspected', 'awaiting_customer', 'disputed', 'resolved', 'rejected']) expect(nextWarrantyStep(claim(status))).toBeNull();
  expect(isWarrantyInvitation(claim('submitted'))).toBe(true);
  expect(isWarrantyInvitation(claim('accepted'))).toBe(false);
});
