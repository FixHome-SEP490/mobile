import React from 'react';
import { act, create } from 'react-test-renderer';
import type { OrderSessionSnapshot } from '../domain/order-session.types';
import { createOrderSessionSnapshot, readyResource } from '../domain/order-session.types';
import RepairWorkspaceScreen from './RepairWorkspaceScreen';

let mockSnapshot: OrderSessionSnapshot;
let mockRefresh: jest.Mock;
const mockNavigate = jest.fn();

jest.mock('../runtime/OrderSessionProvider', () => ({
  useOrderSession: () => ({
    key: mockSnapshot.key,
    snapshot: mockSnapshot,
    refresh: (...args: unknown[]) => mockRefresh(...args),
  }),
}));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
}));
jest.mock('react-native-safe-area-context', () => {
  const Native = jest.requireActual('react-native');
  return { SafeAreaView: Native.View, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
});
jest.mock('../../../hooks/useKeyboardInset', () => ({ useKeyboardInset: () => 0 }));

function workspaceSnapshot(): OrderSessionSnapshot {
  const key = { userId: 'tech-1', role: 'technician' as const, sessionGeneration: 1, serviceOrderId: 'order-1' };
  const snapshot = createOrderSessionSnapshot(key);
  snapshot.access = 'current';
  snapshot.order = readyResource(
    {
      id: key.serviceOrderId,
      code: 'SO-1',
      bookingId: 'booking-1',
      serviceName: 'Sửa máy lạnh',
      status: 'UNDER_REPAIR',
      pricingMode: 'FIXED_PRICE',
      fixedUnitPrice: 150000,
      quantity: 1,
      scopeDescription: 'Vệ sinh dàn lạnh',
      customerName: 'Khách hàng',
      customerPhone: '0900',
      addressSummary: '123 Đường Mẫu',
      scheduledAt: '2026-10-13T02:00:00.000Z',
      technician: { id: 'tech-1', fullName: 'Thợ', phoneNumber: '0900', averageRating: null },
      laborTotal: 150000,
      partsTotal: 0,
      grandTotal: 150000,
      paymentStatus: 'UNPAID',
      createdAt: '2026-10-13T00:00:00.000Z',
    } as never,
    1,
    1,
  );
  snapshot.resources.extras = readyResource([], 1, 1);
  return snapshot;
}

beforeEach(() => {
  mockRefresh = jest.fn(async () => {});
  mockNavigate.mockClear();
});

it('shows the current repair scope with detail links and no premature completion', async () => {
  mockSnapshot = workspaceSnapshot();
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<RepairWorkspaceScreen />);
  });
  const text = JSON.stringify(renderer.toJSON());
  expect(text).toMatch(/Vệ sinh dàn lạnh/);
  expect(text).toMatch(/bước tiếp theo/);
  expect(text).not.toMatch(/Hoàn tất|Yêu cầu hoàn tất|Xác nhận hoàn tất/);
  const tree = renderer.toJSON() as any;
  const children: any[] = tree?.children ?? [];
  const scrollIndex = children.findIndex(c => c && typeof c === 'object' && c.type === 'RCTScrollView');
  const footerIndex = children.findIndex(c => c && typeof c === 'object' && c.props?.testID === 'order-flow-fixed-footer');
  expect(scrollIndex).toBeGreaterThan(-1);
  expect(footerIndex).toBeGreaterThan(scrollIndex);
  await act(async () => {
    renderer.root.findByProps({ testID: 'task-gallery-link' }).props.onPress();
    renderer.root.findByProps({ testID: 'task-link-ScopeDetail' }).props.onPress();
    renderer.root.findByProps({ testID: 'task-link-PersonalOrderNotes' }).props.onPress();
  });
  expect(mockNavigate).toHaveBeenNthCalledWith(1, 'EvidenceGallery');
  expect(mockNavigate).toHaveBeenNthCalledWith(2, 'ScopeDetail');
  expect(mockNavigate).toHaveBeenNthCalledWith(3, 'PersonalOrderNotes');
  await act(async () => renderer.unmount());
});

it('revoked assignment disables detail links and refresh stays honest', async () => {
  mockSnapshot = workspaceSnapshot();
  mockSnapshot.access = 'revoked';
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<RepairWorkspaceScreen />);
  });
  expect(renderer.root.findByProps({ testID: 'task-gallery-link' }).props.disabled).toBe(true);
  await act(async () => {
    renderer.root.findByProps({ testID: 'task-gallery-link' }).props.onPress();
  });
  expect(mockNavigate).not.toHaveBeenCalled();
  expect(mockRefresh).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());
});
