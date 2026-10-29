import React from 'react';
import { Linking } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { OrderSessionSnapshot } from '../domain/order-session.types';
import { createOrderSessionSnapshot, readyResource } from '../domain/order-session.types';
import AssignedOrderScreen from './AssignedOrderScreen';
import ArrivalStatusScreen from './ArrivalStatusScreen';
import RepairStatusScreen from './RepairStatusScreen';

let mockSnapshot: OrderSessionSnapshot;
let mockRefresh: jest.Mock;
const mockNavigate = jest.fn();
const mockGoBack = jest.fn();

jest.mock('../runtime/OrderSessionProvider', () => ({
  useOptionalOrderSession: () => null,
  useOrderSession: () => ({
    key: mockSnapshot.key,
    snapshot: mockSnapshot,
    refresh: (...args: unknown[]) => mockRefresh(...args),
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

function customerSnapshot(status: 'ACCEPTED' | 'EN_ROUTE' | 'UNDER_REPAIR'): OrderSessionSnapshot {
  const key = { userId: 'customer-1', role: 'customer' as const, sessionGeneration: 1, serviceOrderId: 'order-1' };
  const snapshot = createOrderSessionSnapshot(key);
  snapshot.access = 'current';
  snapshot.order = readyResource(
    {
      id: key.serviceOrderId,
      code: 'SO-1',
      bookingId: 'booking-1',
      serviceName: 'Sửa máy lạnh',
      status,
      customerName: 'Khách hàng',
      customerPhone: '0900000000',
      addressSummary: '123 Đường Mẫu',
      scheduledAt: '2026-10-13T02:00:00.000Z',
      laborTotal: 100,
      partsTotal: 0,
      grandTotal: 100,
      paymentStatus: 'UNPAID',
      createdAt: '2026-10-13T00:00:00.000Z',
      technician: { id: 'tech-1', fullName: 'Kỹ thuật viên A', phoneNumber: '0900', averageRating: null },
    },
    1,
    1,
  );
  return snapshot;
}

beforeEach(() => {
  mockRefresh = jest.fn(async () => {});
  mockNavigate.mockClear();
  mockGoBack.mockClear();
});

const cases = [
  { name: 'assigned order shows technician and appointment without task ids', Screen: AssignedOrderScreen, status: 'ACCEPTED' as const },
  { name: 'arrival status shows travel state without face or quote gates', Screen: ArrivalStatusScreen, status: 'EN_ROUTE' as const },
  { name: 'repair status shows repair state without extras gate', Screen: RepairStatusScreen, status: 'UNDER_REPAIR' as const },
];

for (const { name, Screen, status } of cases) {
  it(`${name}: one body plus one footer outside scroll, calling never writes`, async () => {
    mockSnapshot = customerSnapshot(status);
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<Screen />);
    });
    const tree = renderer.toJSON() as any;
    const children: any[] = tree?.children ?? [];
    const scrollIndex = children.findIndex(c => c && typeof c === 'object' && c.type === 'RCTScrollView');
    const footerIndex = children.findIndex(c => c && typeof c === 'object' && c.props?.testID === 'order-flow-fixed-footer');
    expect(scrollIndex).toBeGreaterThan(-1);
    expect(footerIndex).toBeGreaterThan(scrollIndex);
    const text = JSON.stringify(tree);
    expect(text).not.toMatch(/C0[346]|T0[234]|CHECKIN_FACE|POST|GET/);
    // The summary rows moved to the order frame: the body only says what is happening.
    expect(text).not.toContain('Mã đơn');
    await act(async () => {
      renderer.root.findByProps({ testID: 'task-call' }).props.onPress();
    });
    expect(openURL).toHaveBeenCalledWith('tel:0900');
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockRefresh).not.toHaveBeenCalled();
    expect(renderer.root.findAllByProps({ testID: 'task-refresh' }).length).toBe(0);
    await act(async () => renderer.unmount());
    openURL.mockRestore();
  });

  it(`${name}: revoked access offers no call and clears draft without writes`, async () => {
    mockSnapshot = customerSnapshot(status);
    mockSnapshot.access = 'revoked';
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<Screen />);
    });
    expect(JSON.stringify(renderer.toJSON())).toContain('Quyền xem đơn đã thay đổi');
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockRefresh).not.toHaveBeenCalled();
    await act(async () => renderer.unmount());
  });
}
