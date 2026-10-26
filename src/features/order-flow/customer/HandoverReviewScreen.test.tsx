import React from 'react';
import { act, create } from 'react-test-renderer';
import type { OrderSessionSnapshot } from '../domain/order-session.types';
import { createOrderSessionSnapshot, readyResource } from '../domain/order-session.types';
import HandoverReviewScreen from './HandoverReviewScreen';

let mockSnapshot: OrderSessionSnapshot;
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
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
}));
jest.mock('react-native-safe-area-context', () => {
  const Native = jest.requireActual('react-native');
  return { SafeAreaView: Native.View, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
});
jest.mock('../../../hooks/useKeyboardInset', () => ({ useKeyboardInset: () => 0 }));

function snapshotWith(invoice: unknown): OrderSessionSnapshot {
  const key = { userId: 'customer-1', role: 'customer' as const, sessionGeneration: 1, serviceOrderId: 'order-1' };
  const snapshot = createOrderSessionSnapshot(key);
  snapshot.access = 'current';
  snapshot.order = readyResource({
    id: 'order-1', code: 'SO-1', bookingId: 'booking-1', serviceName: 'Sửa máy lạnh', status: 'UNDER_REPAIR',
    customerName: 'Khách hàng', customerPhone: '0900', addressSummary: 'Địa chỉ',
    scheduledAt: '2026-10-13T02:00:00.000Z', laborTotal: 0, partsTotal: 0, grandTotal: 120000,
    paymentStatus: 'UNPAID', createdAt: '2026-10-13T00:00:00.000Z',
    completionRequestedAt: '2026-10-13T03:00:00.000Z', completionNote: 'Đã thay linh kiện',
    technician: { id: 'tech-1', fullName: 'Kỹ thuật viên', phoneNumber: '0900', averageRating: null },
  } as any, 1, 1);
  snapshot.resources.evidence = readyResource([
    { id: 'after-1', serviceOrderId: 'order-1', type: 'AFTER', uploaderId: 'tech-1', mediaUrl: 'https://res.cloudinary.com/demo/image/authenticated/s--sig--/v1/after-1.jpg', createdAt: '2026-10-13T03:00:00.000Z' },
  ] as any, 1, 1);
  snapshot.resources.invoice = readyResource(invoice as any, 1, 1);
  snapshot.resources.cash = readyResource(null, 1, 1);
  return snapshot;
}

const invoice = { id: 'invoice-1', serviceOrderId: 'order-1', paymentStatus: 'unpaid', grandTotal: '120000' };

beforeEach(() => { mockNavigate.mockClear(); mockGoBack.mockClear(); mockRefresh.mockClear(); });

it('handover shows actual after, note and server invoice; continue is navigation-only', async () => {
  mockSnapshot = snapshotWith(invoice);
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<HandoverReviewScreen />); });
  const text = JSON.stringify(renderer.toJSON());
  expect(text).toContain('Đã thay linh kiện');
  expect(text).toContain('1 ảnh từ máy chủ');
  expect(text).toContain('#INVOICE-');
  expect(text).not.toMatch(/POST|GET/);
  await act(async () => { renderer.root.findByProps({ testID: 'handover-continue-payment' }).props.onPress(); });
  expect(mockNavigate).toHaveBeenCalledWith('OrderTask');
  expect(mockRefresh).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());
});

it('missing invoice keeps handover inspectable and continue returns to the live task', async () => {
  mockSnapshot = snapshotWith(null);
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<HandoverReviewScreen />); });
  expect(renderer.root.findByProps({ testID: 'handover-continue-payment' }).props.disabled).toBe(false);
  await act(async () => { renderer.root.findByProps({ testID: 'handover-continue-payment' }).props.onPress(); });
  expect(mockNavigate).toHaveBeenCalledWith('OrderTask');
  expect(renderer.root.findAllByProps({ testID: 'task-refresh' }).length).toBe(0);
  await act(async () => renderer.unmount());
});
