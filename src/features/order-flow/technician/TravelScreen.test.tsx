import React from 'react';
import { act, create } from 'react-test-renderer';
import type { OrderSessionSnapshot } from '../domain/order-session.types';
import { createOrderSessionSnapshot, readyResource } from '../domain/order-session.types';
import TravelScreen from './TravelScreen';

let mockSnapshot: OrderSessionSnapshot;
let mockRefresh: jest.Mock;
const mockLoadResource = jest.fn();
const mockNavigate = jest.fn();
const mockArrivalHook = jest.fn();

jest.mock('../runtime/OrderSessionProvider', () => ({
  useOrderSession: () => ({
    key: mockSnapshot.key,
    snapshot: mockSnapshot,
    refresh: (...args: unknown[]) => mockRefresh(...args),
    loadResource: mockLoadResource,
  }),
}));
jest.mock('./useTechnicianArrivalProof', () => ({
  useTechnicianArrivalProof: (args?: unknown) => {
    mockArrivalHook(args);
    return { controller: {}, state: { phase: 'idle', message: null } };
  },
}));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
}));
jest.mock('react-native-safe-area-context', () => {
  const Native = jest.requireActual('react-native');
  return { SafeAreaView: Native.View, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
});
jest.mock('../../../hooks/useKeyboardInset', () => ({ useKeyboardInset: () => 0 }));

function travelSnapshot(): OrderSessionSnapshot {
  const key = { userId: 'tech-1', role: 'technician' as const, sessionGeneration: 1, serviceOrderId: 'order-1' };
  const snapshot = createOrderSessionSnapshot(key);
  snapshot.access = 'current';
  snapshot.order = readyResource(
    {
      id: key.serviceOrderId,
      code: 'SO-1',
      bookingId: 'booking-1',
      serviceName: 'Sửa máy lạnh',
      status: 'EN_ROUTE',
      arrivalVerified: false,
      customerName: 'Khách hàng',
      customerPhone: '0900',
      addressSummary: '123 Đường Mẫu',
      scheduledAt: '2026-10-13T02:00:00.000Z',
      technician: { id: 'tech-1', fullName: 'Thợ', phoneNumber: '0900', averageRating: null },
      laborTotal: 0,
      partsTotal: 0,
      grandTotal: 0,
      paymentStatus: 'UNPAID',
      createdAt: '2026-10-13T00:00:00.000Z',
    },
    1,
    1,
  );
  return snapshot;
}

beforeEach(() => {
  mockRefresh = jest.fn(async () => {});
  mockNavigate.mockClear();
  mockArrivalHook.mockClear();
});

it('opts into foreground tracking only on Travel and navigates to manual check-in with zero mutation', async () => {
  mockSnapshot = travelSnapshot();
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<TravelScreen />);
  });
  expect(mockArrivalHook).toHaveBeenCalledWith({ trackLocation: true });
  const tree = renderer.toJSON() as any;
  const children: any[] = tree?.children ?? [];
  const scrollIndex = children.findIndex(c => c && typeof c === 'object' && c.type === 'RCTScrollView');
  const footerIndex = children.findIndex(c => c && typeof c === 'object' && c.props?.testID === 'order-flow-fixed-footer');
  expect(scrollIndex).toBeGreaterThan(-1);
  expect(footerIndex).toBeGreaterThan(scrollIndex);
  expect(JSON.stringify(tree)).not.toMatch(/trực tiếp|live|CHECKIN_FACE/);
  await act(async () => {
    renderer.root.findByProps({ testID: 'goto-checkin' }).props.onPress();
  });
  expect(mockNavigate).toHaveBeenCalledWith('ArrivalCheckIn');
  expect(mockRefresh).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());
});
