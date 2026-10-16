import { paymentStatusLabel } from './payment-status-label';

it('maps known codes and never leaks a raw one', () => {
  expect(paymentStatusLabel('paid')).toBe('Đã thanh toán');
  expect(paymentStatusLabel('UNPAID')).toBe('Chưa thanh toán');
  expect(paymentStatusLabel('REFUNDED')).toBe('Đã hoàn tiền');
  expect(paymentStatusLabel('PENDING_X')).toBe('Chưa xác định');
  expect(paymentStatusLabel(undefined)).toBe('Chưa xác định');
});
