import React from 'react';
import { act, create } from 'react-test-renderer';
import type { OrderSessionSnapshot } from '../domain/order-session.types';
import { createOrderSessionSnapshot, readyResource } from '../domain/order-session.types';
import PaymentWaitingScreen from './PaymentWaitingScreen';

let mockSnapshot: OrderSessionSnapshot;
let mockCashState: any;
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
    controller: { verify: (...args: unknown[]) => mockVerify(...args) },
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

const idleState = { phase: 'idle', confirmation: null, result: 'unpaid', message: null };

function snapshotWith(invoiceStatus: string, cash: unknown): OrderSessionSnapshot {
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
    id: 'invoice-1', serviceOrderId: 'order-1', paymentStatus: invoiceStatus, grandTotal: '120000',
  } as any, 1, 1);
  snapshot.resources.cash = readyResource(cash as any, 1, 1);
  return snapshot;
}

beforeEach(() => {
  mockNavigate.mockClear(); mockVerify.mockClear(); mockRefresh.mockClear();
  mockCashGet.mockReset().mockResolvedValue({ cashFirstEnabled: false, intent: null });
  mockCashReceive.mockReset();
  mockCashState = { ...idleState };
});

it('waiting shows who is awaited and honest status; verify is GET-only', async () => {
  mockSnapshot = snapshotWith('unpaid', null);
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<PaymentWaitingScreen />); });
  const text = JSON.stringify(renderer.toJSON());
  expect(text).toContain('Khách hàng thanh toán');
  expect(text).toContain('invoice-1');
  await act(async () => { renderer.root.findByProps({ testID: 'payment-waiting-verify' }).props.onPress(); });
  expect(mockVerify).toHaveBeenCalledTimes(1);
  await act(async () => { renderer.root.findByProps({ testID: 'task-link-CashDeclaration' }).props.onPress(); });
  expect(mockNavigate).toHaveBeenCalledWith('CashDeclaration');
  await act(async () => renderer.unmount());
});

it('paid invoice stays updating and hides the declaration entry', async () => {
  mockSnapshot = snapshotWith('paid', null);
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<PaymentWaitingScreen />); });
  const text = JSON.stringify(renderer.toJSON());
  expect(text).toContain('chưa phải đơn hoàn thành');
  expect(renderer.root.findAllByProps({ testID: 'task-link-CashDeclaration' }).length).toBe(0);
  await act(async () => renderer.unmount());
});

it('back and focus never write; no manual refresh button', async () => {
  mockSnapshot = snapshotWith('unpaid', null);
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<PaymentWaitingScreen />); });
  expect(renderer.root.findAllByProps({ testID: 'task-refresh' }).length).toBe(0);
  expect(mockVerify).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());
});

const intent = (status: 'pending' | 'received' | 'cancelled') => ({
  id: '11111111-1111-4111-8111-111111111111', scopeKind: 'SOLO', scopeId: 'order-1', status, grossVnd: 120000, customerDueVnd: 120000,
  technicianId: 'tech-1', createdAt: '2026-10-13T04:00:00.000Z', receivedAt: null, receiptId: null,
});

describe('cash first (web #184)', () => {
  it('links to the confirmation only while the customer has asked for cash', async () => {
    mockCashGet.mockResolvedValue({ cashFirstEnabled: true, intent: intent('pending') });
    mockSnapshot = snapshotWith('unpaid', null);
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<PaymentWaitingScreen />); });
    expect(JSON.stringify(renderer.toJSON())).toContain('Khách cần trả 120.000');
    expect(renderer.root.findAllByProps({ testID: 'task-link-CashDeclaration' }).length).toBeGreaterThan(0);
    await act(async () => renderer.unmount());
  });

  it('shows no link while the customer has not asked, and none for the old declaration', async () => {
    mockCashGet.mockResolvedValue({ cashFirstEnabled: true, intent: null });
    mockSnapshot = snapshotWith('unpaid', null);
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<PaymentWaitingScreen />); });
    expect(JSON.stringify(renderer.toJSON())).toContain('Chờ khách tạo yêu cầu');
    expect(renderer.root.findAllByProps({ testID: 'task-link-CashDeclaration' })).toHaveLength(0);
    await act(async () => renderer.unmount());
  });
});
