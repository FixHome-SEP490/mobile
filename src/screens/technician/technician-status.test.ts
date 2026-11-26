import { serviceOrderDisplayView, serviceOrderStatusView, urgencyView } from './technician-status';

describe('serviceOrderDisplayView', () => {
  it('says "Đã dừng công việc" for stopped work whatever status the server kept', () => {
    expect(serviceOrderDisplayView({ status: 'UNDER_REPAIR', workStopped: true }).label).toBe('Đã dừng công việc');
    expect(serviceOrderDisplayView({ status: 'EN_ROUTE', operationalDisposition: 'STOPPED' }).label).toBe('Đã dừng công việc');
  });
  it('keeps the plain labels for running and handed-over orders', () => {
    expect(serviceOrderDisplayView({ status: 'UNDER_REPAIR' }).label).toBe('Đang sửa chữa');
    expect(serviceOrderDisplayView({ status: 'UNDER_REPAIR', completionRequestedAt: '2026-11-23T01:00:00Z' }).label).toBe('Chờ thanh toán');
  });
});

describe('serviceOrderStatusView', () => {
  it.each([
    ['ACCEPTED', 'Đã nhận đơn', 'violet'],
    ['en_route', 'Đang di chuyển', 'warning'],
    ['UNDER_REPAIR', 'Đang sửa chữa', 'repair'],
    ['IN_PROGRESS', 'Đang sửa chữa', 'repair'],
    ['completed', 'Hoàn thành', 'success'],
    ['CANCELLED', 'Đã hủy', 'neutral'],
  ])('%s → %s (%s)', (status, label, tone) => {
    expect(serviceOrderStatusView(status)).toMatchObject({ label, tone });
  });

  it.each(['PENDING_CONFIRMATION', 'foo', '', null, undefined])('%p is unknown, not success', (status) => {
    expect(serviceOrderStatusView(status)).toMatchObject({
      label: 'Trạng thái chưa xác định',
      tone: 'neutral',
    });
  });
});

describe('urgencyView', () => {
  it('maps known levels case-insensitively', () => {
    expect(urgencyView('emergency')).toMatchObject({ label: 'Khẩn cấp', tone: 'danger' });
    expect(urgencyView('NORMAL')).toMatchObject({ label: 'Bình thường', tone: 'info' });
    expect(urgencyView('MEDIUM').label).toBe('Bình thường');
    // Backend UrgencyLevel emits critical, never emergency.
    expect(urgencyView('critical')).toMatchObject({ label: 'Khẩn cấp', tone: 'danger' });
  });

  it('keeps unknown server text neutral', () => {
    expect(urgencyView('URGENT_PLUS')).toMatchObject({ label: 'URGENT_PLUS', tone: 'neutral' });
    expect(urgencyView(undefined).label).toBe('Chưa xác định');
  });
});
