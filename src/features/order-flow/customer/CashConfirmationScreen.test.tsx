import React from 'react';
import { act, create } from 'react-test-renderer';
import type { OrderSessionSnapshot } from '../domain/order-session.types';
import { createOrderSessionSnapshot, readyResource } from '../domain/order-session.types';
import CashConfirmationScreen from './CashConfirmationScreen';

let mockSnapshot: OrderSessionSnapshot;
let mockPaymentState: any;
const mockRequestCashConfirmation: jest.Mock = jest.fn(async () => {});
const mockSubmitConfirmation: jest.Mock = jest.fn(async () => {});
const mockCancelConfirmation: jest.Mock = jest.fn();
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
      requestCashConfirmation: (...args: unknown[]) => mockRequestCashConfirmation(...args),
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
  phase: 'idle', method: null, target: null, confirmation: null, result: 'cash-pending', message: null,
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

const cashRow = {
  id: 'cash-1', serviceOrderId: 'order-1', status: 'pending_confirmation', declaredAmount: 120000,
  declaredByTechnicianId: 'tech-1', declaredAt: '2026-10-13T04:00:00.000Z', confirmedAmount: null, technicianNotes: null,
};

beforeEach(() => {
  mockNavigate.mockClear(); mockGoBack.mockClear(); mockRefresh.mockClear();
  mockRequestCashConfirmation.mockClear(); mockSubmitConfirmation.mockClear(); mockCancelConfirmation.mockClear();
  mockSnapshot = snapshotWith(cashRow);
  mockPaymentState = { ...baseState };
});

it('agree with exact declaration sends one confirmation and never declares twice', async () => {
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<CashConfirmationScreen />); });
  expect(JSON.stringify(renderer.toJSON())).toContain('cash-1');
  await act(async () => { renderer.root.findByProps({ testID: 'cash-open-sheet' }).props.onPress(); });
  expect(mockRequestCashConfirmation).toHaveBeenCalledWith({ agreed: true });
  mockPaymentState = { ...baseState, phase: 'confirming', confirmation: { key: mockSnapshot.key, invoiceId: 'invoice-1', amount: 120000, method: 'cash', settlementId: 'cash-1', cashDto: { agreed: true } } };
  await act(async () => { renderer.update(<CashConfirmationScreen />); });
  await act(async () => { renderer.root.findByProps({ testID: 'cash-confirm-submit' }).props.onPress(); });
  expect(mockSubmitConfirmation).toHaveBeenCalledTimes(1);
  await act(async () => renderer.unmount());
});

it('dispute without a reason is blocked with zero writes; preserved disputed stays read-only', async () => {
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<CashConfirmationScreen />); });
  await act(async () => { renderer.root.findByProps({ testID: 'cash-choice-dispute' }).props.onPress(); });
  await act(async () => { renderer.root.findByProps({ testID: 'cash-open-sheet' }).props.onPress(); });
  expect(mockRequestCashConfirmation).not.toHaveBeenCalled();
  expect(JSON.stringify(renderer.toJSON())).toContain('lý do chênh lệch');
  await act(async () => renderer.unmount());

  mockSnapshot = snapshotWith({ ...cashRow, status: 'disputed' });
  await act(async () => { renderer = create(<CashConfirmationScreen />); });
  const text = JSON.stringify(renderer.toJSON());
  expect(text).toContain('chênh lệch');
  expect(renderer.root.findAllByProps({ testID: 'cash-open-sheet' }).length).toBe(0);
  expect(mockRequestCashConfirmation).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());
});

it('mismatch amount text is rejected locally and back never writes', async () => {
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<CashConfirmationScreen />); });
  await act(async () => { renderer.root.findByProps({ testID: 'cash-confirmed-amount' }).props.onChangeText('12ab'); });
  await act(async () => { renderer.root.findByProps({ testID: 'cash-open-sheet' }).props.onPress(); });
  expect(mockRequestCashConfirmation).not.toHaveBeenCalled();
  expect(JSON.stringify(renderer.toJSON())).toContain('số nguyên');
  await act(async () => { renderer.root.findByProps({ testID: 'cash-confirmed-amount' }).props.onChangeText('120000.5'); });
  await act(async () => { renderer.root.findByProps({ testID: 'cash-open-sheet' }).props.onPress(); });
  expect(mockRequestCashConfirmation).not.toHaveBeenCalled();
  await act(async () => { renderer.root.findByProps({ testID: 'cash-confirmed-amount' }).props.onChangeText('120.000'); });
  await act(async () => { renderer.root.findByProps({ testID: 'cash-open-sheet' }).props.onPress(); });
  expect(mockRequestCashConfirmation).toHaveBeenCalledWith({ agreed: true, confirmedAmount: 120000 });
  await act(async () => renderer.unmount());
});
