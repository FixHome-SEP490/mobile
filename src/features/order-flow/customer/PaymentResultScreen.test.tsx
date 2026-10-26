import React from 'react';
import { act, create } from 'react-test-renderer';
import type { OrderSessionSnapshot } from '../domain/order-session.types';
import { createOrderSessionSnapshot, readyResource } from '../domain/order-session.types';
import PaymentResultScreen from './PaymentResultScreen';

let mockSnapshot: OrderSessionSnapshot;
let mockPaymentState: any;
const mockVerify: jest.Mock = jest.fn(async () => {});
const mockOpenPaymentUrl: jest.Mock = jest.fn(async () => {});
const mockNavigate: jest.Mock = jest.fn();
const mockGoBack: jest.Mock = jest.fn();
const mockRefresh: jest.Mock = jest.fn(async () => {});

jest.mock('../runtime/OrderSessionProvider', () => ({
  useOptionalOrderSession: () => null,
  useOrderSession: () => ({
    key: mockSnapshot.key,
    snapshot: mockSnapshot,
    refresh: (...args: unknown[]) => mockRefresh(...args),
    loadResource: jest.fn(async () => {}),
  }),
}));
jest.mock('./useCustomerOrderPayment', () => ({
  useCustomerOrderPayment: () => ({
    controller: {
      verify: (...args: unknown[]) => mockVerify(...args),
      openPaymentUrl: (...args: unknown[]) => mockOpenPaymentUrl(...args),
    },
    state: mockPaymentState,
  }),
}));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
}));
jest.mock('react-native-safe-area-context', () => {
  const Native = jest.requireActual('react-native');
  return { SafeAreaView: Native.View, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
});
jest.mock('../../../hooks/useKeyboardInset', () => ({ useKeyboardInset: () => 0 }));

const baseState = {
  phase: 'idle', method: null, target: null, confirmation: null, result: 'unpaid', message: null,
  wallet: { status: 'unloaded', requestSeq: 0 }, urlReady: false,
};

function snapshotWith(paymentStatus: string, pendingIntent = false): OrderSessionSnapshot {
  const key = { userId: 'customer-1', role: 'customer' as const, sessionGeneration: 1, serviceOrderId: 'order-1' };
  const snapshot = createOrderSessionSnapshot(key);
  snapshot.access = 'current';
  snapshot.order = readyResource({
    id: 'order-1', code: 'SO-1', bookingId: 'booking-1', serviceName: 'Sửa máy lạnh', status: 'UNDER_REPAIR',
    customerName: 'Khách hàng', customerPhone: '0900', addressSummary: 'Địa chỉ',
    scheduledAt: '2026-10-13T02:00:00.000Z', laborTotal: 0, partsTotal: 0, grandTotal: 120000,
    paymentStatus: 'UNPAID', createdAt: '2026-10-13T00:00:00.000Z',
    completionRequestedAt: '2026-10-13T03:00:00.000Z',
    technician: { id: 'tech-1', fullName: 'Kỹ thuật viên', phoneNumber: '0900', averageRating: null },
  } as any, 1, 1);
  snapshot.resources.invoice = readyResource({
    id: 'invoice-1', serviceOrderId: 'order-1', paymentStatus, grandTotal: '120000',
  } as any, 1, 1);
  snapshot.resources.cash = readyResource(null, 1, 1);
  if (pendingIntent) snapshot.pendingIntent = true;
  return snapshot;
}

beforeEach(() => {
  mockNavigate.mockClear(); mockVerify.mockClear(); mockOpenPaymentUrl.mockClear(); mockRefresh.mockClear();
  mockPaymentState = { ...baseState };
});

it('unknown offers GET-only verify; unpaid alone never claims failure', async () => {
  mockSnapshot = snapshotWith('unpaid', true);
  mockPaymentState = { ...baseState, phase: 'unknown' };
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<PaymentResultScreen />); });
  const text = JSON.stringify(renderer.toJSON());
  expect(text).toContain('Chưa xác nhận được kết quả');
  expect(text).toContain('không đồng nghĩa');
  expect(text).not.toContain('chưa được thực hiện');
  await act(async () => { renderer.root.findByProps({ testID: 'payment-verify' }).props.onPress(); });
  expect(mockVerify).toHaveBeenCalledTimes(1);
  await act(async () => renderer.unmount());
});

it('paid invoice with under-repair stays updating, never completed', async () => {
  mockSnapshot = snapshotWith('paid');
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<PaymentResultScreen />); });
  const text = JSON.stringify(renderer.toJSON());
  expect(text).toContain('chưa phải đơn hoàn thành');
  expect(text).not.toContain('Đơn hoàn thành');
  await act(async () => renderer.unmount());
});

it('pending browser return reuses one link; failed-known links back without resending', async () => {
  mockSnapshot = snapshotWith('unpaid');
  mockPaymentState = { ...baseState, phase: 'pending', urlReady: true };
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<PaymentResultScreen />); });
  await act(async () => { renderer.root.findByProps({ testID: 'payment-reopen-browser' }).props.onPress(); });
  expect(mockOpenPaymentUrl).toHaveBeenCalledTimes(1);
  await act(async () => renderer.unmount());

  mockPaymentState = { ...baseState, phase: 'failed-known' };
  await act(async () => { renderer = create(<PaymentResultScreen />); });
  await act(async () => { renderer.root.findByProps({ testID: 'payment-retry-link' }).props.onPress(); });
  expect(mockNavigate).toHaveBeenCalledWith('OrderTask');
  expect(mockVerify).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());
});
