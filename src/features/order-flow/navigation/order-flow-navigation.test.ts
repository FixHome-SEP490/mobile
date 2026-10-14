import { createOrderSessionSnapshot, readyResource } from '../domain/order-session.types';
import type { OrderSessionSnapshot, OrderTaskResolution } from '../domain/order-session.types';
import { keepManualArrivalCheckIn, keepManualBeforeCapture, MANUAL_ARRIVAL_CHECK_IN_ROUTE, MANUAL_BEFORE_CAPTURE_ROUTE, requiredTaskResources, taskRouteTransition } from './order-flow-navigation';

const key = { userId: 'customer-1', role: 'customer' as const, sessionGeneration: 4, serviceOrderId: 'order-1' };

function currentSnapshot(status: string): OrderSessionSnapshot {
  const snapshot = createOrderSessionSnapshot(key);
  snapshot.access = 'current';
  snapshot.order = readyResource({
    id: key.serviceOrderId,
    code: 'SO-1',
    bookingId: 'booking-1',
    serviceName: 'Sửa máy lạnh',
    status: status as 'ACCEPTED',
    customerName: 'Khách hàng',
    customerPhone: '0900000000',
    addressSummary: 'Địa chỉ mẫu',
    scheduledAt: '2026-10-13T02:00:00.000Z',
    laborTotal: 0,
    partsTotal: 0,
    grandTotal: 0,
    paymentStatus: 'UNPAID',
    createdAt: '2026-10-13T00:00:00.000Z',
  }, 1, 1);
  return snapshot;
}

function resolution(taskId: OrderTaskResolution['taskId'], blockers: OrderTaskResolution['blockers'] = []): OrderTaskResolution {
  return { taskId, stage: taskId === 'C11' ? 4 : 3, readOnly: true, blockers };
}

describe('order-flow task route synchronization', () => {
  it('loads only state-dependent task reads and never details for historical technician orders', () => {
    const customer = currentSnapshot('UNDER_REPAIR');
    expect(requiredTaskResources(customer)).toEqual(['extras']);
    const technician = currentSnapshot('EN_ROUTE');
    technician.key.role = 'technician';
    expect(requiredTaskResources(technician)).toEqual([]);
    const historical = currentSnapshot('COMPLETED');
    historical.key.role = 'technician'; historical.access = 'historical';
    expect(requiredTaskResources(historical)).toEqual([]);
  });
  it('keeps the established task route while a newly required resource is loading', () => {
    const snapshot = currentSnapshot('UNDER_REPAIR');

    expect(taskRouteTransition('C09', resolution('C08', ['resource']), snapshot)).toEqual({ kind: 'hold' });
  });

  it('replaces the task route after a meaningful ready resolution', () => {
    const snapshot = currentSnapshot('UNDER_REPAIR');

    expect(taskRouteTransition('C06', resolution('C09'), snapshot)).toEqual({ kind: 'replace', taskId: 'C09' });
  });

  it('moves immediately to payment unknown recovery when an unresolved intent is restored', () => {
    const snapshot = currentSnapshot('UNDER_REPAIR');
    const order = snapshot.order;
    if (order.status !== 'ready') throw new Error('fixture order must be ready');
    snapshot.order = readyResource({ ...order.data, completionRequestedAt: '2026-10-13T01:00:00.000Z' }, 1, 2);

    expect(taskRouteTransition('C09', resolution('C11', ['unknown-command']), snapshot)).toEqual({ kind: 'replace', taskId: 'C11' });
  });

  it('allows terminal and revoked facts to take priority over the previous route', () => {
    const terminal = currentSnapshot('COMPLETED');
    terminal.access = 'current';
    const revoked = currentSnapshot('ACCEPTED');
    revoked.access = 'revoked';

    expect(taskRouteTransition('C09', resolution('C12'), terminal)).toEqual({ kind: 'replace', taskId: 'C12' });
    expect(taskRouteTransition('C09', resolution('CX', ['access']), revoked)).toEqual({ kind: 'replace', taskId: 'CX' });
  });

  it('does not replace for the same task or before order access is verified', () => {
    const snapshot = currentSnapshot('ACCEPTED');
    const unverified = createOrderSessionSnapshot(key);

    expect(taskRouteTransition('C03', resolution('C03'), snapshot)).toEqual({ kind: 'hold' });
    expect(taskRouteTransition(undefined, resolution('C03'), unverified)).toEqual({ kind: 'hold' });
  });

  it('holds the distinct manual arrival route so automatic T03 never bounces it', () => {
    expect(MANUAL_ARRIVAL_CHECK_IN_ROUTE).toBe('ArrivalCheckIn');
    expect(keepManualArrivalCheckIn('ArrivalCheckIn')).toBe(true);
    expect(keepManualArrivalCheckIn('OrderTask')).toBe(false);
    expect(keepManualArrivalCheckIn(undefined)).toBe(false);
  });

  it('holds the distinct manual BEFORE route so automatic readbacks never bounce it', () => {
    expect(MANUAL_BEFORE_CAPTURE_ROUTE).toBe('BeforeCapture');
    expect(keepManualBeforeCapture('BeforeCapture')).toBe(true);
    expect(keepManualBeforeCapture('OrderTask')).toBe(false);
    expect(keepManualBeforeCapture(undefined)).toBe(false);
  });
});
