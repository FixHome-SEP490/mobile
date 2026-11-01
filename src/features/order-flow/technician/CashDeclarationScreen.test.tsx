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
const mockCheckVoucher: jest.Mock = jest.fn(async () => {});

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
      checkVoucher: (...args: unknown[]) => mockCheckVoucher(...args),
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
jest.mock('../../../hooks/useLiveRefresh', () => ({ useLiveRefresh: jest.fn() }));
const mockCashGet: jest.Mock = jest.fn();
const mockCashReceive: jest.Mock = jest.fn();
jest.mock('../../../api/cash-intents.api', () => ({
  cashIntentsApi: { get: (...args: unknown[]) => mockCashGet(...args), receive: (...args: unknown[]) => mockCashReceive(...args) },
}));

const idleState = { phase: 'idle', confirmation: null, result: 'unpaid', message: null, voucher: { status: 'none' } };

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
  mockCashGet.mockReset().mockResolvedValue({ cashFirstEnabled: false, intent: null });
  mockCashReceive.mockReset();
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

it('asks the server about the customer voucher when the order can take a declaration', async () => {
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<CashDeclarationScreen />); });
  expect(mockCheckVoucher).toHaveBeenCalled();
  await act(async () => renderer.unmount());
});

it('shows the amount to collect when the customer holds a voucher', async () => {
  mockCashState = { ...idleState, voucher: { status: 'held', reservationId: 'hold-1', dueVnd: 70000 } };
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<CashDeclarationScreen />); });
  expect(JSON.stringify(renderer.toJSON())).toContain('Khách đang dùng voucher');
  expect(JSON.stringify(renderer.toJSON())).toContain('70.000');
  await act(async () => renderer.unmount());
});

it('collects nothing while the voucher is unknown or could not be read', async () => {
  for (const status of ['error', 'checking', 'unchecked']) {
    mockCashState = { ...idleState, voucher: { status } };
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<CashDeclarationScreen />); });
    await act(async () => { renderer.root.findByProps({ testID: 'cash-declare-amount' }).props.onChangeText('120000'); });
    expect(renderer.root.findByProps({ testID: 'cash-declare-open-sheet' }).props.disabled).toBe(true);
    await act(async () => renderer.unmount());
  }
});

const intent = (status: 'pending' | 'received' | 'cancelled') => ({
  id: '11111111-1111-4111-8111-111111111111', scopeKind: 'SOLO', scopeId: 'order-1', status, grossVnd: 120000, customerDueVnd: 120000,
  technicianId: 'tech-1', createdAt: '2026-10-13T04:00:00.000Z', receivedAt: null, receiptId: null,
});

describe('cash first (web #184)', () => {
  it('confirms receipt of the amount the server fixed, with no amount to type', async () => {
    mockCashGet.mockResolvedValue({ cashFirstEnabled: true, intent: intent('pending') });
    mockCashReceive.mockResolvedValue({ ...intent('pending'), status: 'received' });
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<CashDeclarationScreen />); });
    expect(renderer.root.findAllByProps({ testID: 'cash-declare-amount' })).toHaveLength(0);
    expect(JSON.stringify(renderer.toJSON())).toContain('120.000');
    await act(async () => { renderer.root.findByProps({ testID: 'cash-intent-receive-open' }).props.onPress(); });
    expect(mockCashReceive).not.toHaveBeenCalled();
    expect(renderer.root.findAllByProps({ testID: 'cash-intent-receive-sheet' }).length).toBeGreaterThan(0);
    await act(async () => { renderer.root.findByProps({ testID: 'cash-intent-receive-submit' }).props.onPress(); });
    expect(mockCashReceive).toHaveBeenCalledWith('SOLO', 'order-1', {
      intentId: intent('pending').id, commandId: expect.stringMatching(/^[0-9a-f-]{36}$/), receivedAmountVnd: 120000,
    });
    expect(mockRequestDeclaration).not.toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('OrderTask');
    await act(async () => renderer.unmount());
  });

  it('waits for the customer when there is no request, and never declares', async () => {
    mockCashGet.mockResolvedValue({ cashFirstEnabled: true, intent: null });
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<CashDeclarationScreen />); });
    expect(JSON.stringify(renderer.toJSON())).toContain('Chỉ nhận tiền sau khi khách gửi yêu cầu');
    expect(renderer.root.findAllByProps({ testID: 'cash-intent-receive-open' })).toHaveLength(0);
    expect(renderer.root.findAllByProps({ testID: 'cash-declare-open-sheet' })).toHaveLength(0);
    await act(async () => renderer.unmount());
  });

  it('shows the server error and stays on the screen when receipt is not confirmed', async () => {
    mockCashGet.mockResolvedValue({ cashFirstEnabled: true, intent: intent('pending') });
    mockCashReceive.mockRejectedValue({ response: { data: { message: 'Thông tin tiền mặt đã thay đổi. Vui lòng kiểm tra lại.' } } });
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<CashDeclarationScreen />); });
    await act(async () => { renderer.root.findByProps({ testID: 'cash-intent-receive-open' }).props.onPress(); });
    await act(async () => { renderer.root.findByProps({ testID: 'cash-intent-receive-submit' }).props.onPress(); });
    expect(JSON.stringify(renderer.toJSON())).toContain('đã thay đổi');
    expect(mockNavigate).not.toHaveBeenCalledWith('OrderTask');
    await act(async () => renderer.unmount());
  });

  it('does not offer the declaration until the server says which flow is on', async () => {
    mockCashGet.mockReturnValue(new Promise(() => {}));
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<CashDeclarationScreen />); });
    expect(renderer.root.findAllByProps({ testID: 'cash-declare-amount' })).toHaveLength(0);
    expect(renderer.root.findByProps({ testID: 'cash-intent-checking' }).props.disabled).toBe(true);
    await act(async () => renderer.unmount());
  });
});
