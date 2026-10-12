import { customerActiveOrderSection, customerOrderTimeline } from './customer-order-timeline';

test('active Customer content follows the eligible action and otherwise one current stage', () => {
  expect(customerActiveOrderSection({ status: 'EN_ROUTE', paymentStatus: 'UNPAID', quotation: { status: 'SENT' } }, 'decide_quote')).toBe('quote');
  expect(customerActiveOrderSection({ status: 'ACCEPTED', paymentStatus: 'UNPAID' })).toBe('technician');
  expect(customerActiveOrderSection({ status: 'EN_ROUTE', paymentStatus: 'UNPAID', arrivalVerified: true })).toBe('evidence');
});

test('accepted order has no fabricated check-in, quotation or evidence milestones', () => {
  const steps = customerOrderTimeline({ status: 'ACCEPTED', paymentStatus: 'UNPAID' });
  expect(steps.find(step => step.key === 'status')?.label).toBe('Đã nhận đơn');
  expect(steps.filter(step => step.state === 'done')).toHaveLength(0);
  expect(steps.some(step => step.section === 'quote' || step.section === 'evidence')).toBe(false);
});
test('completed status never implies missing earlier evidence or paid invoice', () => {
  const steps = customerOrderTimeline({ status: 'COMPLETED', paymentStatus: 'UNPAID' });
  expect(steps.some(step => step.key === 'payment')).toBe(false);
  expect(steps.some(step => step.key === 'arrival')).toBe(false);
  expect(steps.some(step => step.state === 'upcoming')).toBe(false);
});
test('paid repair remains under repair and a SENT quote is not approved', () => {
  const steps = customerOrderTimeline({ status: 'UNDER_REPAIR', paymentStatus: 'PAID', quotation: { status: 'SENT' } });
  expect(steps.find(step => step.key === 'payment')?.state).toBe('done');
  expect(steps.find(step => step.key === 'status')?.label).toBe('Đang sửa chữa');
  expect(steps.find(step => step.key === 'quotation')?.label).toBe('Báo giá: Đã gửi (chờ quyết định)');
  expect(steps.find(step => step.key === 'quotation')?.state).toBe('current');
  expect(steps.some(step => step.label === 'Hoàn thành')).toBe(false);
});
test('confirmed facts and current eligible action remain distinct', () => {
  const steps = customerOrderTimeline({ status: 'UNDER_REPAIR', paymentStatus: 'UNPAID', arrivalVerified: true, beforeEvidenceCount: 2, afterEvidenceCount: 1, completionRequestedAt: '2026-10-13T10:00:00+07:00', customerConfirmed: false }, 'confirm_completion');
  expect(steps.find(step => step.key === 'arrival')?.state).toBe('done');
  expect(steps.some(step => step.key === 'customer-confirmed')).toBe(false);
  expect(steps.find(step => step.key === 'action')?.section).toBe('completion');
});
test('cancelled and historical records never imply upcoming work or eligible actions', () => {
  for (const order of [{ status: 'CANCELLED', paymentStatus: 'UNPAID' }, { status: 'COMPLETED', paymentStatus: 'PAID', historical: true }]) {
    const steps = customerOrderTimeline(order, 'pay');
    expect(steps.some(step => step.state === 'upcoming' || step.key === 'action')).toBe(false);
  }
});
test('server events are chronological and invalid timestamps cannot manufacture a milestone', () => {
  const steps = customerOrderTimeline({ status: 'UNDER_REPAIR', paymentStatus: 'UNPAID', timeline: [
    { status: 'EN_ROUTE', title: 'Di chuyển', timestamp: '2026-10-13T09:00:00Z', actor: 'TECHNICIAN' },
    { status: 'ACCEPTED', title: 'Nhận đơn', timestamp: '2026-10-13T08:00:00Z', actor: 'TECHNICIAN' },
    { status: 'COMPLETED', title: 'Bad event', timestamp: 'invalid', actor: 'TECHNICIAN' },
  ] });
  expect(steps.filter(step => step.key.startsWith('event-')).map(step => step.label)).toEqual(['Nhận đơn', 'Di chuyển']);
  expect(steps.some(step => step.label === 'Bad event')).toBe(false);
});
