import React from 'react';
import { act, create } from 'react-test-renderer';
import type { OrderSessionSnapshot } from '../domain/order-session.types';
import { createOrderSessionSnapshot, readyResource } from '../domain/order-session.types';
import CompletionRequestScreen from './CompletionRequestScreen';

let mockSnapshot: OrderSessionSnapshot;
let mockCompletionState: any;
const mockRequestCompletion: jest.Mock = jest.fn(async () => {});
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
jest.mock('./useTechnicianCompletion', () => ({
  useTechnicianCompletion: () => ({
    controller: {
      requestCompletion: (...args: unknown[]) => mockRequestCompletion(...args),
      submitConfirmation: (...args: unknown[]) => mockSubmitConfirmation(...args),
      cancelConfirmation: (...args: unknown[]) => mockCancelConfirmation(...args),
      verify: (...args: unknown[]) => mockVerify(...args),
    },
    state: mockCompletionState,
    captureAfter: jest.fn(async () => ({ ok: false, message: 'x' })),
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

const idleState = { phase: 'idle', operation: null, confirmation: null, confirmedUpload: null, message: null };

function snapshotWith(extras: unknown[], quotations: unknown[]): OrderSessionSnapshot {
  const key = { userId: 'tech-1', role: 'technician' as const, sessionGeneration: 1, serviceOrderId: 'order-1' };
  const snapshot = createOrderSessionSnapshot(key);
  snapshot.access = 'current';
  snapshot.order = readyResource({
    id: 'order-1', code: 'SO-1', bookingId: 'booking-1', serviceName: 'Sửa máy lạnh', status: 'UNDER_REPAIR',
    customerName: 'Khách hàng', customerPhone: '0900', addressSummary: 'Địa chỉ',
    scheduledAt: '2026-10-13T02:00:00.000Z', laborTotal: 0, partsTotal: 0, grandTotal: 120000,
    paymentStatus: 'UNPAID', createdAt: '2026-10-13T00:00:00.000Z', pricingMode: 'FIXED_PRICE', fixedUnitPrice: 120000,
    technician: { id: 'tech-1', fullName: 'Kỹ thuật viên', phoneNumber: '0900', averageRating: null },
  } as any, 1, 1);
  snapshot.resources.evidence = readyResource([
    { id: 'after-1', serviceOrderId: 'order-1', type: 'AFTER', uploaderId: 'tech-1', mediaUrl: 'https://res.cloudinary.com/demo/image/authenticated/s--sig--/v1/after-1.jpg', createdAt: '2026-10-13T03:00:00.000Z' },
  ] as any, 1, 1);
  snapshot.resources.quotations = readyResource(quotations as any, 1, 1);
  snapshot.resources.extras = readyResource(extras as any, 1, 1);
  snapshot.resources.parts = readyResource([] as any, 1, 1);
  snapshot.resources.invoice = readyResource({ id: 'invoice-1', serviceOrderId: 'order-1', paymentStatus: 'unpaid', grandTotal: 120000 } as any, 1, 1);
  return snapshot;
}

beforeEach(() => {
  mockNavigate.mockClear(); mockRequestCompletion.mockClear(); mockSubmitConfirmation.mockClear(); mockRefresh.mockClear();
  mockSnapshot = snapshotWith([], []);
  mockCompletionState = { ...idleState };
});

it('known blockers disable sending with zero writes', async () => {
  mockSnapshot = snapshotWith([{
    id: 'extra-1', serviceOrderId: 'order-1', status: 'pending_approval', reason: 'Thêm linh kiện',
    totalLaborDelta: 0, totalPartsDelta: 10, createdAt: '', items: [],
  }], []);
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<CompletionRequestScreen />); });
  expect(renderer.root.findByProps({ testID: 'completion-open-sheet' }).props.disabled).toBe(true);
  expect(JSON.stringify(renderer.toJSON())).toContain('chi phí phát sinh');
  await act(async () => { renderer.root.findByProps({ testID: 'completion-open-sheet' }).props.onPress(); });
  expect(mockRequestCompletion).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());
});

it('names the parts that block the handover and links to parts management', async () => {
  mockSnapshot = snapshotWith([], []);
  mockSnapshot.resources.parts = readyResource([
    { id: 'pr-1', serviceOrderId: 'order-1', technicianId: 'tech-1', status: 'received', items: [{ id: 'i1', partNameSnapshot: 'Tụ', quantity: 1, usageStatus: 'pending' }] },
    { id: 'pr-2', serviceOrderId: 'order-1', technicianId: 'tech-1', status: 'ready', items: [{ id: 'i2', partNameSnapshot: 'Van', quantity: 1, usageStatus: 'pending' }] },
  ] as any, 1, 1);
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<CompletionRequestScreen />); });
  expect(renderer.root.findByProps({ testID: 'completion-open-sheet' }).props.disabled).toBe(true);
  const text = JSON.stringify(renderer.toJSON());
  expect(text).toContain('1 linh kiện đã nhận chưa ghi dùng hoặc trả');
  expect(text).toContain('1 yêu cầu linh kiện chưa nhận');
  await act(async () => { renderer.root.findByProps({ testID: 'completion-open-parts' }).props.onPress(); });
  expect(mockNavigate).toHaveBeenCalledWith('PartsLifecycle');
  await act(async () => renderer.unmount());
});

it('manual after next never requests; explicit confirm sends once', async () => {
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<CompletionRequestScreen />); });
  expect(mockRequestCompletion).not.toHaveBeenCalled();
  await act(async () => { renderer.root.findByProps({ testID: 'completion-note' }).props.onChangeText('Đã thay xong'); });
  await act(async () => { renderer.root.findByProps({ testID: 'completion-open-sheet' }).props.onPress(); });
  expect(mockRequestCompletion).toHaveBeenCalledWith('Đã thay xong');
  expect(mockSubmitConfirmation).not.toHaveBeenCalled();
  mockCompletionState = { ...idleState, phase: 'confirming', confirmation: { key: mockSnapshot.key, operation: 'request-completion', entityId: 'order-1', completionNote: 'Đã thay xong' } };
  await act(async () => { renderer.update(<CompletionRequestScreen />); });
  await act(async () => { renderer.root.findByProps({ testID: 'completion-confirm-submit' }).props.onPress(); });
  expect(mockSubmitConfirmation).toHaveBeenCalledTimes(1);
  await act(async () => renderer.unmount());
});

it('oversized note is denied locally and cancel sends nothing', async () => {
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<CompletionRequestScreen />); });
  await act(async () => { renderer.root.findByProps({ testID: 'completion-note' }).props.onChangeText('x'.repeat(2001)); });
  expect(renderer.root.findByProps({ testID: 'completion-open-sheet' }).props.disabled).toBe(true);
  expect(mockRequestCompletion).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());
});
