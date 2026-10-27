import React from 'react';
import { act, create } from 'react-test-renderer';
import type { OrderSessionSnapshot } from '../domain/order-session.types';
import { createOrderSessionSnapshot, readyResource } from '../domain/order-session.types';
import CashDeclarationScreen from './CashDeclarationScreen';

let mockSnapshot: OrderSessionSnapshot;
let mockCashState: any;
const mockRequestDeclaration: jest.Mock = jest.fn(async () => {});
const mockSubmitConfirmation: jest.Mock = jest.fn(async () => {});
const mockCancelConfirmation: jest.Mock = jest.fn();
const mockVerify: jest.Mock = jest.fn(async () => {});
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
jest.mock('./useTechnicianCashDeclaration', () => ({
  useTechnicianCashDeclaration: () => ({
    controller: {
      requestDeclaration: (...args: unknown[]) => mockRequestDeclaration(...args),
      submitConfirmation: (...args: unknown[]) => mockSubmitConfirmation(...args),
      cancelConfirmation: (...args: unknown[]) => mockCancelConfirmation(...args),
      verify: (...args: unknown[]) => mockVerify(...args),
    },
    state: mockCashState,
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

const idleState = { phase: 'idle', confirmation: null, result: 'unpaid', message: null };

function snapshotWith(cash: unknown): OrderSessionSnapshot {
  const key = { userId: 'tech-1', role: 'technician' as const, sessionGeneration: 1, serviceOrderId: 'order-1' };
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
  mockNavigate.mockClear(); mockRequestDeclaration.mockClear(); mockSubmitConfirmation.mockClear(); mockRefresh.mockClear();
  mockSnapshot = snapshotWith(null);
  mockCashState = { ...idleState };
});

it('invoice total is reference only; empty amount never declares', async () => {
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<CashDeclarationScreen />); });
  expect(JSON.stringify(renderer.toJSON())).toContain('tham khảo');
  expect(renderer.root.findByProps({ testID: 'cash-declare-amount' }).props.value).toBe('');
  await act(async () => { renderer.root.findByProps({ testID: 'cash-declare-open-sheet' }).props.onPress(); });
  expect(mockRequestDeclaration).not.toHaveBeenCalled();
  expect(JSON.stringify(renderer.toJSON())).toContain('Không để trống');
  await act(async () => renderer.unmount());
});

it('explicit zero is allowed while decimals and blanks never declare', async () => {
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<CashDeclarationScreen />); });
  await act(async () => { renderer.root.findByProps({ testID: 'cash-declare-amount' }).props.onChangeText('120000.5'); });
  await act(async () => { renderer.root.findByProps({ testID: 'cash-declare-open-sheet' }).props.onPress(); });
  expect(mockRequestDeclaration).not.toHaveBeenCalled();
  await act(async () => { renderer.root.findByProps({ testID: 'cash-declare-amount' }).props.onChangeText('0'); });
  await act(async () => { renderer.root.findByProps({ testID: 'cash-declare-open-sheet' }).props.onPress(); });
  expect(mockRequestDeclaration).toHaveBeenCalledWith({ declaredAmount: 0 });
  await act(async () => renderer.unmount());
});

it('explicit amount confirmation sends once with the exact received value', async () => {
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<CashDeclarationScreen />); });
  await act(async () => { renderer.root.findByProps({ testID: 'cash-declare-amount' }).props.onChangeText('120000'); });
  await act(async () => { renderer.root.findByProps({ testID: 'cash-declare-open-sheet' }).props.onPress(); });
  expect(mockRequestDeclaration).toHaveBeenCalledWith({ declaredAmount: 120000 });
  mockCashState = { ...idleState, phase: 'confirming',
    confirmation: { key: mockSnapshot.key, invoiceId: 'invoice-1', invoiceAmount: 120000, dto: { declaredAmount: 120000 } } };
  await act(async () => { renderer.update(<CashDeclarationScreen />); });
  await act(async () => { renderer.root.findByProps({ testID: 'cash-declare-submit' }).props.onPress(); });
  expect(mockSubmitConfirmation).toHaveBeenCalledTimes(1);
  await act(async () => renderer.unmount());
});

it('existing declaration is read-only; no overwrite path is offered', async () => {
  mockSnapshot = snapshotWith({ id: 'cash-1', serviceOrderId: 'order-1', status: 'pending_confirmation', declaredAmount: 120000, declaredByTechnicianId: 'tech-1', declaredAt: '2026-10-13T04:00:00.000Z' });
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<CashDeclarationScreen />); });
  expect(JSON.stringify(renderer.toJSON())).toContain('không ghi đè');
  expect(renderer.root.findAllByProps({ testID: 'cash-declare-amount' }).length).toBe(0);
  expect(mockRequestDeclaration).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());
});
