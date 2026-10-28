import type { MySupportCase } from '../../api/support-cases.api';
import { canRequestStopReplace, findStopRequest, isActiveStopRequest, isDefiniteRefusal, stopReasonProblem, stopRequestStatusText } from './stop-replace';

const kase = (over: Partial<MySupportCase> = {}): MySupportCase => ({
  id: 'c1', caseType: 'mid_job_interruption', status: 'open', requestIntent: 'stop_or_replace', bookingId: 'b1', serviceOrderId: 'o1',
  reason: 'Thợ chưa xử lý được', description: null, resolutionReason: null, evidenceRefs: null, isUrgent: false, respondBy: null, resolvedAt: null,
  createdAt: '2026-10-28T00:00:00Z', updatedAt: '2026-10-28T00:00:00Z', ...over,
});

it('offers the request only while the repair is under way and not yet handed over', () => {
  expect(canRequestStopReplace({ status: 'UNDER_REPAIR' })).toBe(true);
  expect(canRequestStopReplace({ status: 'under_repair', completionRequestedAt: null })).toBe(true);
  expect(canRequestStopReplace({ status: 'UNDER_REPAIR', completionRequestedAt: '2026-10-28T01:00:00Z' })).toBe(false);
  for (const status of ['ACCEPTED', 'EN_ROUTE', 'COMPLETED', 'CANCELLED']) expect(canRequestStopReplace({ status })).toBe(false);
  expect(canRequestStopReplace(null)).toBe(false);
});

it('finds the stop request of this order among the customer cases', () => {
  const other = kase({ id: 'c2', requestIntent: null, caseType: 'quality' });
  expect(findStopRequest([other, kase()], 'o1')?.id).toBe('c1');
  expect(findStopRequest([kase()], 'o2')).toBeNull();
  expect(findStopRequest([other], 'o1')).toBeNull();
});

it('words every status and treats only open and in-review as active', () => {
  expect(stopRequestStatusText(kase({ status: 'open' }))).toBe('Đã gửi yêu cầu');
  expect(stopRequestStatusText(kase({ status: 'in_review' }))).toBe('Quản lý đang xem xét');
  expect(stopRequestStatusText(kase({ status: 'resolved' }))).toBe('Quản lý đã xử lý yêu cầu');
  expect(stopRequestStatusText(kase({ status: 'rejected' }))).toBe('Yêu cầu không được chấp nhận');
  expect(stopRequestStatusText(null)).toBe('');
  expect([isActiveStopRequest(kase({ status: 'open' })), isActiveStopRequest(kase({ status: 'in_review' })), isActiveStopRequest(kase({ status: 'resolved' })), isActiveStopRequest(null)]).toEqual([true, true, false, false]);
});

it('keeps the reason between 10 and 2000 characters', () => {
  expect(stopReasonProblem('ngắn')).toMatch(/ít nhất 10/);
  expect(stopReasonProblem('123456789')).not.toBeNull();
  expect(stopReasonProblem('Kỹ thuật viên chưa làm được')).toBeNull();
  expect(stopReasonProblem('a'.repeat(2001))).toMatch(/tối đa/);
});

it('knows a refusal from a lost answer', () => {
  expect(isDefiniteRefusal({ response: { status: 403 } })).toBe(true);
  expect(isDefiniteRefusal({ response: { status: 409 } })).toBe(true);
  expect(isDefiniteRefusal({ response: { status: 408 } })).toBe(false);
  expect(isDefiniteRefusal({ response: { status: 503 } })).toBe(false);
  expect(isDefiniteRefusal(new Error('offline'))).toBe(false);
});
