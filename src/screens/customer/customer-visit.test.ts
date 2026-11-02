import type { Visit, VisitCheckout } from '../../api/visit-groups.api';
import {
  canStartVisitPayment,
  needsQuoteDecision,
  resolveVisitCheckoutState,
  visitActions,
  visitDeviceStatusText,
  visitGrandTotal,
  visitPayMethods,
  visitStatusView,
  visitStep,
} from './customer-visit';

const visit = (over: Partial<Visit> = {}, leadStatus = 'SUBMITTED', rescheduleCount = 0): Visit => ({
  id: 'v1', status: 'submitted', bookingMode: 'scheduled', slot: 'morning',
  preferredStartAt: '2026-10-26T01:00:00.000Z', preferredEndAt: '2026-10-26T05:00:00.000Z', leadBookingId: 'b1',
  items: [
    { id: 'i1', sequence: 1, serviceId: 's1', deviceLabel: null, booking: { id: 'b1', status: leadStatus, rescheduleCount } as never },
    { id: 'i2', sequence: 2, serviceId: 's2', deviceLabel: null, booking: { id: 'b2', status: leadStatus, rescheduleCount } as never },
  ],
  ...over,
});
const checkout = (over: Partial<VisitCheckout> = {}): VisitCheckout => ({
  visitGroupId: 'v1', total: 300000, waiting: 0, ready: true, paid: false, pendingCash: null,
  devices: [
    { sequence: 1, deviceLabel: null, bookingId: 'b1', serviceName: 'A', serviceOrderId: null, orderCode: null, state: 'open', invoiceId: null, amount: 0, paid: false },
    { sequence: 2, deviceLabel: null, bookingId: 'b2', serviceName: 'B', serviceOrderId: null, orderCode: null, state: 'open', invoiceId: null, amount: 0, paid: false },
  ],
  ...over,
});
const held = (state: 'open' | 'succeeded' = 'open') => checkout({
  devices: checkout().devices.map((d) => ({ ...d, serviceOrderId: `o${d.sequence}`, state })),
});

describe('visitStatusView', () => {
  it('uses the shared wording and never shows a raw status', () => {
    expect(visitStatusView('failed')).toEqual({ label: 'Có thiết bị chưa sửa', tone: 'danger' });
    expect(visitStatusView('whatever').label).toBe('Trạng thái chưa xác định');
  });
});

describe('visitActions', () => {
  const ok = { orderStatuses: {}, orderReadIncomplete: false };
  it('lets the customer choose a technician, move and cancel before anyone holds the visit', () => {
    expect(visitActions({ visit: visit(), checkout: checkout(), ...ok })).toEqual({ held: false, canChooseTechnician: true, canReschedule: true, canCancel: true });
  });
  it('stops choosing once a technician holds it but still allows one reschedule and cancel', () => {
    expect(visitActions({ visit: visit({}, 'MATCHED'), checkout: held(), ...ok })).toEqual({ held: true, canChooseTechnician: false, canReschedule: true, canCancel: true });
  });
  it('allows the reschedule once only', () => {
    expect(visitActions({ visit: visit({}, 'SUBMITTED', 1), checkout: checkout(), ...ok }).canReschedule).toBe(false);
  });
  it('blocks both when repair started, a device has an outcome, or order progress is unknown', () => {
    const base = { visit: visit({}, 'MATCHED'), checkout: held() };
    expect(visitActions({ ...base, orderStatuses: { o1: 'UNDER_REPAIR' }, orderReadIncomplete: false })).toMatchObject({ canReschedule: false, canCancel: false });
    expect(visitActions({ visit: visit({}, 'MATCHED'), checkout: held('succeeded'), ...ok })).toMatchObject({ canReschedule: false, canCancel: false });
    expect(visitActions({ ...base, orderStatuses: null, orderReadIncomplete: false })).toMatchObject({ canReschedule: false, canCancel: false });
    expect(visitActions({ ...base, orderStatuses: {}, orderReadIncomplete: true })).toMatchObject({ canReschedule: false, canCancel: false });
  });
  it('offers nothing on a cancelled visit', () => {
    expect(visitActions({ visit: visit({ status: 'cancelled' }), checkout: checkout(), ...ok })).toEqual({ held: false, canChooseTechnician: false, canReschedule: false, canCancel: false });
  });
  it('lets the customer choose again when matching closed without a technician', () => {
    expect(visitActions({ visit: visit({}, 'CLOSED'), checkout: checkout(), ...ok }).canChooseTechnician).toBe(true);
  });
});

describe('visitDeviceStatusText', () => {
  const base = { visit: visit(), hasOrder: false, quoteWaiting: false, leadStatus: 'SUBMITTED' };
  it('prefers the device outcome over the parent', () => {
    expect(visitDeviceStatusText({ ...base, deviceState: 'failed' })).toBe('Không sửa được, không tính tiền sửa');
    expect(visitDeviceStatusText({ ...base, deviceState: 'quote_declined', visit: visit({ status: 'cancelled' }) })).toBe('Bạn không duyệt báo giá, không tính tiền');
  });
  it('flags a quotation waiting for the customer', () => {
    expect(visitDeviceStatusText({ ...base, deviceState: 'open', quoteWaiting: true, hasOrder: true })).toBe('Chờ bạn duyệt báo giá');
  });
  it('describes matching before an order exists', () => {
    expect(visitDeviceStatusText({ ...base, deviceState: 'open', leadStatus: 'MATCHING' })).toBe('Đang chờ thợ nhận');
    expect(visitDeviceStatusText({ ...base, deviceState: 'open', leadStatus: 'CLOSED' })).toBe('Chưa có thợ nhận');
    expect(visitDeviceStatusText({ ...base, deviceState: 'open', leadStatus: 'MATCHED' })).toBe('Đã ghép kỹ thuật viên cho lượt');
    expect(visitDeviceStatusText({ ...base, deviceState: 'open' })).toBe('Chưa chọn thợ');
    expect(visitDeviceStatusText({ ...base, deviceState: 'open', hasOrder: true })).toBe('Đang xử lý');
    expect(visitDeviceStatusText({ ...base, deviceState: undefined, visit: visit({ status: 'cancelled' }) })).toBe('Đã hủy');
  });
});

describe('needsQuoteDecision', () => {
  it('needs an en-route order with a sent quotation', () => {
    expect(needsQuoteDecision({ status: 'EN_ROUTE', quotation: { status: 'SENT' } })).toBe(true);
    expect(needsQuoteDecision({ status: 'ACCEPTED', quotation: { status: 'SENT' } })).toBe(false);
    expect(needsQuoteDecision({ status: 'EN_ROUTE', quotation: { status: 'DRAFT' } })).toBe(false);
    expect(needsQuoteDecision(null)).toBe(false);
  });
});

describe('payment', () => {
  it('hides VNPay under 5.000 ₫', () => {
    expect(visitPayMethods(4999)).toEqual(['wallet', 'cash']);
    expect(visitPayMethods(5000)).toEqual(['wallet', 'vnpay', 'cash']);
  });
  it('waits until every device has its result', () => {
    expect(resolveVisitCheckoutState(null, 'wallet', 1)).toBe('waiting');
    expect(resolveVisitCheckoutState(checkout({ waiting: 1 }), 'wallet', 1e9)).toBe('waiting');
    expect(resolveVisitCheckoutState(checkout({ ready: false }), 'wallet', 1e9)).toBe('waiting');
  });
  it('resolves paid, pending cash, zero due, short wallet, vnpay and ready', () => {
    expect(resolveVisitCheckoutState(checkout({ paid: true, waiting: 2 }), 'wallet', 0)).toBe('paid');
    expect(resolveVisitCheckoutState(checkout({ pendingCash: { id: 'c', amount: 300000, declaredAt: 'x' } }), 'wallet', 1e9)).toBe('pending_cash');
    expect(resolveVisitCheckoutState(checkout({ total: 0 }), 'wallet', 0)).toBe('zero_due');
    expect(resolveVisitCheckoutState(checkout(), 'wallet', 1000)).toBe('wallet_short');
    expect(resolveVisitCheckoutState(checkout(), 'wallet', null)).toBe('ready');
    expect(resolveVisitCheckoutState(checkout(), 'vnpay', 0)).toBe('vnpay');
    expect(resolveVisitCheckoutState(checkout({ total: 4000 }), 'vnpay', 0)).toBe('ready');
    expect(resolveVisitCheckoutState(checkout(), 'cash', 0)).toBe('ready');
  });
  it('starts a payment only in a payable state', () => {
    expect(canStartVisitPayment('ready')).toBe(true);
    expect(canStartVisitPayment('waiting')).toBe(false);
    expect(canStartVisitPayment('paid')).toBe(false);
    expect(canStartVisitPayment('pending_cash')).toBe(false);
    expect(canStartVisitPayment('zero_due')).toBe(false);
  });
});

describe('visitStep', () => {
  it('walks from choosing the technician to paying once for the whole visit', () => {
    expect(visitStep({ payState: 'waiting', orderStatuses: {} })).toBe(2);
    expect(visitStep({ payState: 'waiting', orderStatuses: { a: 'ACCEPTED', b: 'EN_ROUTE' } })).toBe(3);
    expect(visitStep({ payState: 'waiting', orderStatuses: { a: 'EN_ROUTE', b: 'UNDER_REPAIR' } })).toBe(4);
    expect(visitStep({ payState: 'ready', orderStatuses: { a: 'UNDER_REPAIR' } })).toBe(5);
    expect(visitStep({ payState: 'paid', orderStatuses: null })).toBe(5);
  });
});

describe('visitGrandTotal', () => {
  const devices = [
    { state: 'succeeded', amount: 360000 }, { state: 'succeeded', amount: 219000 }, { state: 'failed', amount: 0 },
  ] as never;
  it('is what is still due before payment, and the repaired devices once paid (the server total is then 0)', () => {
    expect(visitGrandTotal({ paid: false, total: 579000, devices })).toBe(579000);
    expect(visitGrandTotal({ paid: true, total: 0, devices })).toBe(579000);
  });
});
