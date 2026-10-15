import React from 'react';
import { act, create } from 'react-test-renderer';
import type { OrderSessionSnapshot } from '../domain/order-session.types';
import { createOrderSessionSnapshot, readyResource } from '../domain/order-session.types';
import PaymentMethodScreen from './PaymentMethodScreen';

let mockSnapshot: OrderSessionSnapshot;
let mockPaymentState: any;
const mockRequestPayment: jest.Mock = jest.fn(async () => {});
const mockSubmitConfirmation: jest.Mock = jest.fn(async () => {});
const mockCancelConfirmation: jest.Mock = jest.fn();
const mockOpenPaymentUrl: jest.Mock = jest.fn(async () => {});
const mockNavigate: jest.Mock = jest.fn();
const mockGoBack: jest.Mock = jest.fn();
const mockRefresh: jest.Mock = jest.fn(async () => {});

jest.mock('../runtime/OrderSessionProvider', () => ({
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
      requestPayment: (...args: unknown[]) => mockRequestPayment(...args),
      submitConfirmation: (...args: unknown[]) => mockSubmitConfirmation(...args),
      cancelConfirmation: (...args: unknown[]) => mockCancelConfirmation(...args),
      openPaymentUrl: (...args: unknown[]) => mockOpenPaymentUrl(...args),
      verify: async () => {},
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

const idleState = {
  phase: 'idle', method: null, target: null, confirmation: null, result: 'unpaid', message: null,
  wallet: { status: 'unloaded', requestSeq: 0 }, urlReady: false,
};

function snapshotWith(cash: unknown): OrderSessionSnapshot {
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
    id: 'invoice-1', serviceOrderId: 'order-1', paymentStatus: 'unpaid', grandTotal: '120000',
  } as any, 1, 1);
  snapshot.resources.cash = readyResource(cash as any, 1, 1);
  return snapshot;
}

beforeEach(() => {
  mockNavigate.mockClear(); mockGoBack.mockClear(); mockRefresh.mockClear();
  mockRequestPayment.mockClear(); mockSubmitConfirmation.mockClear(); mockCancelConfirmation.mockClear();
  mockPaymentState = { ...idleState };
});

it('wallet choice is navigation-only; vnpay/cash need an explicit frozen confirmation', async () => {
  mockSnapshot = snapshotWith(null);
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<PaymentMethodScreen />); });
  expect(JSON.stringify(renderer.toJSON())).toContain('invoice-1');
  await act(async () => { renderer.root.findByProps({ testID: 'payment-method-wallet' }).props.onPress(); });
  expect(mockNavigate).toHaveBeenCalledWith('WalletPayment');
  expect(mockRequestPayment).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());
});

it('unknown lock disables every method and offers only server check', async () => {
  mockSnapshot = snapshotWith(null);
  mockSnapshot.pendingIntent = true;
  mockPaymentState = { ...idleState, phase: 'unknown' };
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<PaymentMethodScreen />); });
  expect(renderer.root.findByProps({ testID: 'payment-method-wallet' }).props.disabled).toBe(true);
  expect(renderer.root.findByProps({ testID: 'payment-method-vnpay' }).props.disabled).toBe(true);
  await act(async () => { renderer.root.findByProps({ testID: 'payment-method-wallet' }).props.onPress(); });
  expect(mockNavigate).not.toHaveBeenCalledWith('WalletPayment');
  await act(async () => { renderer.root.findByProps({ testID: 'payment-check-result' }).props.onPress(); });
  expect(mockNavigate).toHaveBeenCalledWith('OrderTask');
  expect(mockRequestPayment).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());
});

it('cash without a technician declaration stays blocked with an honest note', async () => {
  mockSnapshot = snapshotWith(null);
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<PaymentMethodScreen />); });
  expect(renderer.root.findByProps({ testID: 'payment-method-cash' }).props.disabled).toBe(true);
  expect(JSON.stringify(renderer.toJSON())).toContain('khai báo');
  await act(async () => renderer.unmount());
});

it('handover review stays reachable from payment for inspection before paying', async () => {
  mockSnapshot = snapshotWith(null);
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<PaymentMethodScreen />); });
  await act(async () => { renderer.root.findByProps({ testID: 'payment-handover-link' }).props.onPress(); });
  expect(mockNavigate).toHaveBeenCalledWith('HandoverReview');
  expect(mockRequestPayment).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());
});
