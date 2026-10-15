import React from 'react';
import { act, create } from 'react-test-renderer';
import type { OrderSessionSnapshot } from '../domain/order-session.types';
import { createOrderSessionSnapshot, readyResource } from '../domain/order-session.types';
import CompletedOrderScreen from './CompletedOrderScreen';

let mockSnapshot: OrderSessionSnapshot;
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
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
}));
jest.mock('react-native-safe-area-context', () => {
  const Native = jest.requireActual('react-native');
  return { SafeAreaView: Native.View, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
});
jest.mock('../../../hooks/useKeyboardInset', () => ({ useKeyboardInset: () => 0 }));

function snapshotFor(role: 'customer' | 'technician', status: string): OrderSessionSnapshot {
  const key = { userId: 'user-1', role, sessionGeneration: 1, serviceOrderId: 'order-1' };
  const snapshot = createOrderSessionSnapshot(key);
  snapshot.access = 'current';
  snapshot.order = readyResource({
    id: 'order-1', code: 'SO-1', bookingId: 'booking-1', serviceName: 'Sửa máy lạnh', status,
    customerName: 'Khách hàng', customerPhone: '0900', addressSummary: 'Địa chỉ',
    scheduledAt: '2026-10-13T02:00:00.000Z', laborTotal: 0, partsTotal: 0, grandTotal: 120000,
    paymentStatus: 'PAID', createdAt: '2026-10-13T00:00:00.000Z',
    completionRequestedAt: '2026-10-13T03:00:00.000Z', completionNote: 'Đã bàn giao',
    technician: { id: role === 'technician' ? 'user-1' : 'tech-1', fullName: 'Kỹ thuật viên', phoneNumber: '0900', averageRating: null },
  } as any, 1, 1);
  snapshot.resources.invoice = readyResource({
    id: 'invoice-1', serviceOrderId: 'order-1', paymentStatus: 'paid', grandTotal: 120000,
  } as any, 1, 1);
  return snapshot;
}

beforeEach(() => { mockNavigate.mockClear(); mockGoBack.mockClear(); mockRefresh.mockClear(); });

it.each(['customer', 'technician'] as const)('completed order shows server facts and role-safe links without writes (%s)', async role => {
  mockSnapshot = snapshotFor(role, 'COMPLETED');
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<CompletedOrderScreen role={role} />); });
  const text = JSON.stringify(renderer.toJSON());
  expect(text).toContain('SO-1');
  expect(text).toContain('Đã bàn giao');
  expect(text).not.toMatch(/POST|GET/);
  for (const screen of ['ScopeDetail', 'InvoiceDetail', 'EvidenceGallery', 'OrderProgressHistory']) {
    await act(async () => { renderer.root.findByProps({ testID: `task-link-${screen}` }).props.onPress(); });
    expect(mockNavigate).toHaveBeenCalledWith(screen);
  }
  expect(mockRefresh).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());
});

it('non-completed order keeps an honest shell and back never writes', async () => {
  mockSnapshot = snapshotFor('customer', 'UNDER_REPAIR');
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<CompletedOrderScreen role="customer" />); });
  expect(JSON.stringify(renderer.toJSON())).toContain('máy chủ xác minh');
  expect(mockRefresh).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());
});
