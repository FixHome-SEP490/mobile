import { createOrderSessionSnapshot, readyResource } from './order-session.types';
import { resolveCustomerTask, resolveTechnicianTask } from './order-task-resolver';
import type { ServiceOrderItem } from '../../../api/orders.api';

const key = { userId: 'tech', role: 'technician' as const, sessionGeneration: 1, serviceOrderId: 'order' };
const order = (patch: Partial<ServiceOrderItem> = {}): ServiceOrderItem => ({
  id: 'order', code: 'TEST', bookingId: 'booking', serviceName: 'Test', status: 'EN_ROUTE',
  customerName: 'Fixture', customerPhone: '', addressSummary: '', scheduledAt: '',
  laborTotal: 0, partsTotal: 0, grandTotal: 0, paymentStatus: 'UNPAID', createdAt: '',
  technician: { id: 'tech', fullName: 'Fixture', phoneNumber: '', averageRating: null },
  pricingMode: 'fixed_price', arrivalVerified: true, ...patch,
});
function snapshot(patch: Partial<ServiceOrderItem> = {}, customer = false) {
  const s = createOrderSessionSnapshot(customer ? { ...key, userId: 'customer', role: 'customer' } : key);
  s.access = 'current'; s.order = readyResource(order(patch), 1, 1);
  s.proofPolicy = { beforeMinimum: 1, afterMinimum: 1 };
  s.resources.evidence = readyResource([
    { id: 'face', serviceOrderId: 'order', uploaderId: 'tech', type: 'CHECKIN_FACE', mediaUrl: 'https://example.test/private', createdAt: '' },
    { id: 'before', serviceOrderId: 'order', uploaderId: 'tech', type: 'BEFORE', mediaUrl: 'https://example.test/private', createdAt: '' },
  ], 1, 1);
  s.resources.extras = readyResource([], 1, 1);
  return s;
}
it('fixed own proof waits for server UNDER_REPAIR without fake start', () => {
  expect(resolveTechnicianTask(snapshot()).taskId).toBe('TR');
  expect(resolveTechnicianTask(snapshot({ status: 'UNDER_REPAIR' })).taskId).toBe('T09');
});
it('aggregate counters and another uploader never count as own face or BEFORE', () => {
  const s = snapshot({ beforeEvidenceCount: 99 });
  if (s.resources.evidence.status === 'ready') s.resources.evidence.data = s.resources.evidence.data.map(e => ({ ...e, uploaderId: 'old-tech' }));
  expect(resolveTechnicianTask(s).taskId).toBe('T05');
});
it('missing threshold cannot unlock recovery', () => {
  const s = snapshot(); s.proofPolicy = undefined;
  expect(resolveTechnicianTask(s).readOnly).toBe(true);
  expect(resolveTechnicianTask(s).blockers).toContain('proof-policy');
});
it('terminal wins over pending extras, unknown payment and missing resources', () => {
  const s = snapshot({ status: 'COMPLETED' }, true); s.pendingIntent = true;
  expect(resolveCustomerTask(s).taskId).toBe('C12');
  expect(resolveTechnicianTask(snapshot({ status: 'CANCELLED' })).taskId).toBe('TX');
});
it('historical, revoked, wrong role and changed assignment fail closed', () => {
  const s = snapshot(); s.access = 'historical';
  expect(resolveTechnicianTask(s)).toMatchObject({ taskId: 'TH', readOnly: true });
  s.access = 'revoked'; expect(resolveTechnicianTask(s).taskId).toBe('TX');
  expect(resolveCustomerTask(snapshot()).taskId).toBe('CX');
  expect(resolveTechnicianTask(snapshot({ technician: { id: 'replacement', fullName: '', phoneNumber: '', averageRating: null } })).taskId).toBe('TX');
});
it('inspection decisions retain current ID/version and ignore superseded quotes', () => {
  const s = snapshot({ pricingMode: 'inspection_required' }, true);
  s.resources.quotations = readyResource([
    { id: 'old', serviceOrderId: 'order', status: 'superseded', version: 1, items: [] },
    { id: 'new', serviceOrderId: 'order', status: 'sent', version: 2, items: [] },
  ], 1, 1);
  expect(resolveCustomerTask(s)).toMatchObject({ taskId: 'C05', target: { id: 'new', version: 2 } });
  if (s.resources.quotations.status === 'ready') s.resources.quotations.data[1].status = 'approved';
  expect(resolveCustomerTask(s).taskId).toBe('C04');
});
it('extra wire pending_approval selects current revision only', () => {
  const s = snapshot({ status: 'UNDER_REPAIR' }, true);
  s.resources.extras = readyResource([
    { id: 'old', serviceOrderId: 'order', status: 'pending_approval', version: 1, reason: '', totalLaborDelta: 0, totalPartsDelta: 0, createdAt: '', items: [] },
    { id: 'new', serviceOrderId: 'order', status: 'pending_approval', version: 2, supersedesId: 'old', reason: '', totalLaborDelta: 0, totalPartsDelta: 0, createdAt: '', items: [] },
  ], 1, 1);
  expect(resolveCustomerTask(s)).toMatchObject({ taskId: 'C07', target: { id: 'new', version: 2 } });
});
it('handover and payment do not require customerConfirmed; paid does not mean completed', () => {
  const s = snapshot({ status: 'UNDER_REPAIR', completionRequestedAt: '2026-10-13T00:00:00Z', customerConfirmed: false }, true);
  expect(resolveCustomerTask(s).taskId).toBe('C08');
  s.resources.invoice = readyResource({ id: 'invoice', serviceOrderId: 'order', paymentStatus: 'unpaid', grandTotal: '10000' }, 1, 1);
  expect(resolveCustomerTask(s)).toMatchObject({ taskId: 'C11', readOnly: true });
  s.resources.cash = readyResource(null, 1, 1);
  expect(resolveCustomerTask(s).taskId).toBe('C09');
  if (s.resources.invoice.status === 'ready' && s.resources.invoice.data) s.resources.invoice.data.paymentStatus = 'paid';
  expect(resolveCustomerTask(s).taskId).toBe('C11');
});
it('independent approved extras do not compete with one actionable pending chain', () => {
  const s = snapshot({ status: 'UNDER_REPAIR' }, true);
  const extra = (id: string, status: string) => ({ id, serviceOrderId: 'order', status, reason: '', totalLaborDelta: 0, totalPartsDelta: 0, createdAt: '', items: [] });
  s.resources.extras = readyResource([extra('approved-one', 'approved'), extra('approved-two', 'approved'), extra('pending', 'pending_approval')], 1, 1);
  expect(resolveCustomerTask(s)).toMatchObject({ taskId: 'C07', target: { id: 'pending' } });
  s.resources.extras = readyResource([extra('approved-one', 'approved'), extra('approved-two', 'approved')], 1, 1);
  expect(resolveCustomerTask(s).taskId).toBe('C06');
});
it('disputed cash is read-only and multiple pending proposals require explicit selection', () => {
  const s = snapshot({ status: 'UNDER_REPAIR', completionRequestedAt: 'fixture' }, true);
  s.resources.invoice = readyResource({ id: 'i', serviceOrderId: 'order', paymentStatus: 'unpaid', grandTotal: 1 }, 1, 1);
  s.resources.cash = readyResource({ id: 'c', serviceOrderId: 'order', status: 'DISPUTED', declaredAmount: 1 }, 1, 1);
  expect(resolveCustomerTask(s)).toMatchObject({ taskId: 'C10', readOnly: true });
  const proposals = snapshot({ status: 'UNDER_REPAIR' }, true);
  proposals.resources.extras = readyResource(['a', 'b'].map(id => ({ id, serviceOrderId: 'order', status: 'pending_approval', reason: '', totalLaborDelta: 0, totalPartsDelta: 0, createdAt: '', items: [] })), 1, 1);
  expect(resolveCustomerTask(proposals)).toMatchObject({ taskId: 'C07', readOnly: true, targets: [{ id: 'a' }, { id: 'b' }] });
});
it('optional branches never become mandatory workflow steps', () => {
  const s = snapshot({ status: 'UNDER_REPAIR' }, true);
  expect(resolveCustomerTask(s).taskId).toBe('C06');
  expect(resolveTechnicianTask(snapshot({ status: 'ACCEPTED' })).taskId).toBe('T02');
});
it('cash pending_confirmation is actionable only from explicit current server settlement', () => {
  const s = snapshot({ status: 'UNDER_REPAIR', completionRequestedAt: 'fixture' }, true);
  s.resources.invoice = readyResource({ id: 'i', serviceOrderId: 'order', paymentStatus: 'unpaid', grandTotal: 1 }, 1, 1);
  s.resources.cash = readyResource({ id: 'c', serviceOrderId: 'order', status: 'pending_confirmation', declaredAmount: 1 }, 1, 1);
  expect(resolveCustomerTask(s)).toMatchObject({ taskId: 'C10', readOnly: false });
});
it('no policy still exposes BEFORE capture and inspection quote; own quote provenance is required', () => {
  const s = snapshot({ pricingMode: 'inspection_required' }); s.proofPolicy = undefined;
  s.resources.evidence = readyResource([{ id: 'face', serviceOrderId: 'order', uploaderId: 'tech', type: 'CHECKIN_FACE', mediaUrl: '', createdAt: '' }], 1, 1);
  expect(resolveTechnicianTask(s).taskId).toBe('T06');
  s.resources.evidence = snapshot().resources.evidence;
  s.resources.quotations = readyResource([], 1, 1);
  expect(resolveTechnicianTask(s).taskId).toBe('T07');
  s.resources.quotations = readyResource([{ id: 'q', serviceOrderId: 'order', technicianId: 'old', status: 'sent', items: [] }], 1, 1);
  expect(resolveTechnicianTask(s).taskId).toBe('T07');
});
it('travel remains preparation and server-verified arrival moves customer stage to at-home', () => {
  expect(resolveCustomerTask(snapshot({ arrivalVerified: false }, true))).toMatchObject({ taskId: 'C04', stage: 1 });
  expect(resolveCustomerTask(snapshot({ arrivalVerified: true }, true))).toMatchObject({ taskId: 'C04', stage: 2 });
});
