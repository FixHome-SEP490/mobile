import { canDeclareVisitCash, nextOpenVisitDevice, repairFailedAllowed, visitCashStatus, visitDeviceLabel } from './technician-visit';

const dev = (sequence: number, serviceOrderId: string | null, state: 'open' | 'succeeded' | 'failed' = 'open') =>
  ({ sequence, deviceLabel: null, bookingId: `b${sequence}`, serviceName: 'A', serviceOrderId, orderCode: null, state, invoiceId: null, amount: 0, paid: false });

describe('technician visit rules', () => {
  it('suggests another open device only after the current one has its outcome', () => {
    const devices = [dev(1, 'o1', 'succeeded'), dev(2, 'o2'), dev(3, null)];
    expect(nextOpenVisitDevice(devices, 'o1')?.sequence).toBe(2);
    expect(nextOpenVisitDevice([dev(1, 'o1'), dev(2, 'o2')], 'o1')).toBeNull();
    expect(nextOpenVisitDevice(devices, 'missing')).toBeNull();
  });
  it('allows "Không sửa được" only while a visit device is under repair and not handed over', () => {
    expect(repairFailedAllowed({ visitGroupId: 'v', status: 'UNDER_REPAIR' })).toBe(true);
    expect(repairFailedAllowed({ visitGroupId: null, status: 'UNDER_REPAIR' })).toBe(false);
    expect(repairFailedAllowed({ visitGroupId: 'v', status: 'EN_ROUTE' })).toBe(false);
    expect(repairFailedAllowed({ visitGroupId: 'v', status: 'UNDER_REPAIR', completionRequestedAt: 'x' })).toBe(false);
  });
  it('declares the visit cash only once every device has its result and nothing is pending', () => {
    const base = { paid: false, waiting: 0, ready: true, pendingCash: null, total: 100 };
    expect(visitCashStatus({ ...base, waiting: 1 })).toBe('waiting');
    expect(visitCashStatus({ ...base, ready: false })).toBe('waiting');
    expect(visitCashStatus({ ...base, paid: true })).toBe('paid');
    expect(visitCashStatus({ ...base, pendingCash: { id: 'c', amount: 100, declaredAt: 'x' } })).toBe('pending_cash');
    expect(visitCashStatus({ ...base, total: 0 })).toBe('zero_due');
    expect(canDeclareVisitCash(base)).toBe(true);
    expect(canDeclareVisitCash({ ...base, waiting: 2 })).toBe(false);
  });
  it('labels a device from what is known', () => {
    expect(visitDeviceLabel({ serviceName: 'Điều hòa', deviceLabel: 'Phòng ngủ' })).toBe('Điều hòa · Phòng ngủ');
    expect(visitDeviceLabel({ serviceName: null, deviceLabel: null })).toBe('Thiết bị');
  });
});
