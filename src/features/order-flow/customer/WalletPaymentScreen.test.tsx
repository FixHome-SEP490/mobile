import React from 'react';
import { act, create } from 'react-test-renderer';
import type { OrderSessionSnapshot } from '../domain/order-session.types';
import { createOrderSessionSnapshot, readyResource } from '../domain/order-session.types';
import WalletPaymentScreen from './WalletPaymentScreen';

let mockSnapshot: OrderSessionSnapshot;
let mockPaymentState: any;
const mockRequestPayment: jest.Mock = jest.fn(async () => {});
const mockSubmitConfirmation: jest.Mock = jest.fn(async () => {});
const mockCancelConfirmation: jest.Mock = jest.fn();
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

function snapshotFor(): OrderSessionSnapshot {
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
  snapshot.resources.cash = readyResource(null, 1, 1);
  return snapshot;
}

beforeEach(() => {
  mockNavigate.mockClear(); mockGoBack.mockClear(); mockRefresh.mockClear();
  mockRequestPayment.mockClear(); mockSubmitConfirmation.mockClear(); mockCancelConfirmation.mockClear();
  mockSnapshot = snapshotFor();
  mockPaymentState = { ...baseState };
});

it('request checks the wallet without sending a debit; confirm sheet freezes exact target', async () => {
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<WalletPaymentScreen />); });
  await act(async () => { renderer.root.findByProps({ testID: 'wallet-request' }).props.onPress(); });
  expect(mockRequestPayment).toHaveBeenCalledWith('wallet');
  expect(mockSubmitConfirmation).not.toHaveBeenCalled();

  mockPaymentState = {
    ...baseState,
    phase: 'confirming',
    confirmation: { key: mockSnapshot.key, invoiceId: 'invoice-1', amount: 120000, method: 'wallet' },
    wallet: { status: 'ready', requestSeq: 1, fetchedAt: 1, data: { balance: '200000', transactions: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } } },
  };
  await act(async () => { renderer.update(<WalletPaymentScreen />); });
  await act(async () => { renderer.root.findByProps({ testID: 'wallet-open-sheet' }).props.onPress(); });
  expect(renderer.root.findByProps({ testID: 'wallet-confirm-sheet' })).toBeTruthy();
  await act(async () => { renderer.root.findByProps({ testID: 'wallet-confirm-submit' }).props.onPress(); });
  expect(mockSubmitConfirmation).toHaveBeenCalledTimes(1);
  await act(async () => renderer.unmount());
});

it('insufficient balance is distinct and never auto-debits; failed wallet GET is never zero', async () => {
  mockPaymentState = {
    ...baseState,
    wallet: { status: 'ready', requestSeq: 1, fetchedAt: 1, data: { balance: '1000', transactions: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } } },
  };
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<WalletPaymentScreen />); });
  expect(JSON.stringify(renderer.toJSON())).toContain('chưa đủ');
  expect(mockSubmitConfirmation).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());

  mockPaymentState = { ...baseState, wallet: { status: 'error', requestSeq: 1, error: 'unavailable' } };
  await act(async () => { renderer = create(<WalletPaymentScreen />); });
  const text = JSON.stringify(renderer.toJSON());
  expect(text).toContain('Chưa tải được số dư');
  expect(text).not.toContain('0 ₫');
  await act(async () => renderer.unmount());
});

it('cancel and back never send; unknown offers only server check', async () => {
  mockPaymentState = { ...baseState, phase: 'unknown' };
  mockSnapshot.pendingIntent = true;
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<WalletPaymentScreen />); });
  expect(renderer.root.findAllByProps({ testID: 'wallet-request' }).length).toBe(0);
  await act(async () => { renderer.root.findByProps({ testID: 'wallet-check-result' }).props.onPress(); });
  expect(mockNavigate).toHaveBeenCalledWith('OrderTask');
  expect(mockRequestPayment).not.toHaveBeenCalled();
  expect(mockSubmitConfirmation).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());
});
