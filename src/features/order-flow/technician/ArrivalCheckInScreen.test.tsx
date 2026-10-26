import React from 'react';
import { act, create } from 'react-test-renderer';
import type { OrderSessionSnapshot } from '../domain/order-session.types';
import { createOrderSessionSnapshot, readyResource } from '../domain/order-session.types';
import ArrivalCheckInScreen from './ArrivalCheckInScreen';

let mockSnapshot: OrderSessionSnapshot;
let mockRefresh: jest.Mock;
const mockCheckIn = jest.fn();
const mockVerify = jest.fn();
let mockPhase: string = 'idle';
let mockMessage: string | null = null;
let mockCapture: jest.Mock;
const mockNavigate = jest.fn();

jest.mock('../runtime/OrderSessionProvider', () => ({
  useOptionalOrderSession: () => null,
  useOrderSession: () => ({
    key: mockSnapshot.key,
    snapshot: mockSnapshot,
    refresh: (...args: unknown[]) => mockRefresh(...args),
  }),
}));
jest.mock('./useTechnicianArrivalProof', () => ({
  useTechnicianArrivalProof: (args?: unknown) => {
    expect(args ?? {}).toEqual({});
    return { controller: { checkIn: mockCheckIn, verify: mockVerify }, state: { phase: mockPhase, message: mockMessage } };
  },
}));
jest.mock('./arrival-proof-production', () => ({
  captureFreshOrderPosition: (...args: unknown[]) => mockCapture(...args),
}));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
}));
jest.mock('react-native-safe-area-context', () => {
  const Native = jest.requireActual('react-native');
  return { SafeAreaView: Native.View, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
});
jest.mock('../../../hooks/useKeyboardInset', () => ({ useKeyboardInset: () => 0 }));

function checkinSnapshot(): OrderSessionSnapshot {
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

const freshSample = {
  source: 'os' as const,
  permission: 'granted' as const,
  lat: 10.1,
  lng: 106.2,
  accuracyMeters: 12,
  timestamp: Date.now(),
};

beforeEach(() => {
  mockRefresh = jest.fn(async () => {});
  mockCheckIn.mockClear().mockResolvedValue(undefined);
  mockVerify.mockClear().mockResolvedValue(undefined);
  mockNavigate.mockClear();
  mockPhase = 'idle';
  mockMessage = null;
  mockCapture = jest.fn(async () => ({ ...freshSample }));
});

it('permission denial never POSTs and fresh sample confirms with real payload', async () => {
  mockSnapshot = checkinSnapshot();
  mockCapture.mockResolvedValueOnce({
    source: 'os',
    permission: 'denied',
    lat: Number.NaN,
    lng: Number.NaN,
    accuracyMeters: Number.NaN,
    timestamp: Date.now(),
  });
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<ArrivalCheckInScreen />);
  });
  await act(async () => {
    await renderer.root.findByProps({ testID: 'capture-position' }).props.onPress();
  });
  expect(mockCheckIn).not.toHaveBeenCalled();
  expect(JSON.stringify(renderer.toJSON())).toMatch(/quyền vị trí/);
  await act(async () => {
    await renderer.root.findByProps({ testID: 'capture-position' }).props.onPress();
  });
  await act(async () => {
    renderer.root.findByProps({ testID: 'confirm-checkin' }).props.onPress();
  });
  expect(mockCheckIn).toHaveBeenCalledTimes(1);
  expect(mockCheckIn.mock.calls[0][0]).toMatchObject({ lat: 10.1, lng: 106.2, accuracyMeters: 12 });
  await act(async () => renderer.unmount());
});

it('low accuracy denial asks for a new sample and unknown only verifies without resend', async () => {
  mockSnapshot = checkinSnapshot();
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<ArrivalCheckInScreen />);
  });
  await act(async () => {
    await renderer.root.findByProps({ testID: 'capture-position' }).props.onPress();
  });
  mockPhase = 'denied';
  mockMessage = 'GPS chưa đủ chính xác. Hãy ra vị trí thoáng và lấy mẫu vị trí mới.';
  await act(async () => {
    renderer.update(<ArrivalCheckInScreen />);
  });
  expect(JSON.stringify(renderer.toJSON())).toMatch(/mẫu vị trí mới/);
  await act(async () => renderer.unmount());

  mockPhase = 'unknown';
  mockMessage = null;
  await act(async () => {
    renderer = create(<ArrivalCheckInScreen />);
  });
  await act(async () => {
    renderer.root.findByProps({ testID: 'confirm-checkin' }).props.onPress();
  });
  expect(mockVerify).toHaveBeenCalledTimes(1);
  expect(mockCheckIn).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());
});

it('resolved never claims order advancement and revoked clears draft without POST', async () => {
  mockSnapshot = checkinSnapshot();
  mockPhase = 'resolved';
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<ArrivalCheckInScreen />);
  });
  const text = JSON.stringify(renderer.toJSON());
  expect(text).toMatch(/chờ máy chủ xác minh/);
  expect(text).not.toMatch(/đã chuyển|UNDER_REPAIR|COMPLETED/);
  await act(async () => renderer.unmount());

  mockPhase = 'idle';
  mockSnapshot = checkinSnapshot();
  mockSnapshot.access = 'revoked';
  await act(async () => {
    renderer = create(<ArrivalCheckInScreen />);
  });
  expect(renderer.root.findByProps({ testID: 'confirm-checkin' }).props.disabled).toBe(true);
  await act(async () => {
    renderer.root.findByProps({ testID: 'confirm-checkin' }).props.onPress();
  });
  expect(mockCheckIn).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());
});

it('canonical own arrivalVerified true or UNDER_REPAIR shows Tiếp tục and navigates to OrderTask with zero checkIn POST', async () => {
  mockSnapshot = checkinSnapshot();
  const order = mockSnapshot.order;
  if (order.status !== 'ready') throw new Error('fixture must be ready');
  mockSnapshot.order = readyResource({ ...order.data, arrivalVerified: true }, 1, 2);

  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<ArrivalCheckInScreen />);
  });
  const button = renderer.root.findByProps({ testID: 'confirm-checkin' });
  expect(button.props.disabled).toBe(false);
  const text = JSON.stringify(renderer.toJSON());
  expect(text).toMatch(/Tiếp tục/);
  expect(text).toMatch(/Vị trí đã được máy chủ xác minh/);
  await act(async () => {
    button.props.onPress();
  });
  expect(mockCheckIn).not.toHaveBeenCalled();
  expect(mockNavigate).toHaveBeenCalledWith('OrderTask');
  await act(async () => renderer.unmount());

  mockSnapshot.order = readyResource({ ...order.data, status: 'UNDER_REPAIR', arrivalVerified: true }, 1, 3);
  mockNavigate.mockClear();
  await act(async () => {
    renderer = create(<ArrivalCheckInScreen />);
  });
  const underRepairBtn = renderer.root.findByProps({ testID: 'confirm-checkin' });
  expect(underRepairBtn.props.disabled).toBe(false);
  await act(async () => {
    underRepairBtn.props.onPress();
  });
  expect(mockCheckIn).not.toHaveBeenCalled();
  expect(mockNavigate).toHaveBeenCalledWith('OrderTask');
  await act(async () => renderer.unmount());
});
