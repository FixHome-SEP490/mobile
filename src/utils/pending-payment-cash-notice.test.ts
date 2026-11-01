import { pendingPaymentCashNotice } from './pending-payment-cash-notice';

const conflict = (message: unknown) => ({ response: { status: 409, data: { message } } });

describe('pendingPaymentCashNotice', () => {
  it('explains a 409 pending payment without encouraging a second cash payment', () => {
    const result = pendingPaymentCashNotice(conflict('Có giao dịch thanh toán đang xử lý. Vui lòng kiểm tra lại.'));
    expect(result).toContain('đối soát');
    expect(result).toContain('tránh trả hai lần');
  });

  it('recognizes the visit-group conflict message', () => {
    expect(pendingPaymentCashNotice(conflict('Lượt sửa có thanh toán đang xử lý.'))).toContain('đối soát');
  });

  it('recognizes several safe server messages', () => {
    expect(pendingPaymentCashNotice(conflict(['payment pending', 'check again']))).toContain('đối soát');
  });

  it('ignores unrelated conflicts', () => {
    expect(pendingPaymentCashNotice(conflict('Mã thao tác đã được dùng.'))).toBeNull();
    expect(pendingPaymentCashNotice(conflict('Invoice payment amount does not match.'))).toBeNull();
  });

  it('ignores non-409 and transport errors', () => {
    expect(pendingPaymentCashNotice({ response: { status: 503, data: { message: 'unavailable' } } })).toBeNull();
    expect(pendingPaymentCashNotice(new Error('offline'))).toBeNull();
    expect(pendingPaymentCashNotice(null)).toBeNull();
  });
});
