import React from 'react';
import { act, create } from 'react-test-renderer';
import type { OrderSessionSnapshot } from '../domain/order-session.types';
import { createOrderSessionSnapshot, readyResource } from '../domain/order-session.types';
import AcceptedJobScreen from './AcceptedJobScreen';

let mockSnapshot: OrderSessionSnapshot;
let mockRefresh: jest.Mock;
const mockLoadResource = jest.fn();
const mockDepart = jest.fn();
const mockVerify = jest.fn();
let mockPhase: string = 'idle';
let mockMessage: string | null = null;
const mockNavigate = jest.fn();

jest.mock('../runtime/OrderSessionProvider', () => ({
  useOptionalOrderSession: () => null,
  useOrderSession: () => ({
    key: mockSnapshot.key,
    snapshot: mockSnapshot,
    refresh: (...args: unknown[]) => mockRefresh(...args),
    loadResource: mockLoadResource,
  }),
}));
jest.mock('./useTechnicianArrivalProof', () => ({
  useTechnicianArrivalProof: () => ({
    controller: { depart: mockDepart, verify: mockVerify },
    state: { phase: mockPhase, message: mockMessage },
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

function acceptedSnapshot(departAvailableAt: string | null): OrderSessionSnapshot {
  const key = { userId: 'tech-1', role: 'technician' as const, sessionGeneration: 1, serviceOrderId: 'order-1' };
  const snapshot = createOrderSessionSnapshot(key);
  snapshot.access = 'current';
  snapshot.order = readyResource(
    {
      id: key.serviceOrderId,
      code: 'SO-1',
      bookingId: 'booking-1',
      serviceName: 'Sửa máy lạnh',
      status: 'ACCEPTED',
      customerName: 'Khách hàng',
      customerPhone: '0900',
      addressSummary: '123 Đường Mẫu',
      scheduledAt: '2026-10-13T02:00:00.000Z',
      departAvailableAt,
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
  mockDepart.mockClear().mockResolvedValue(undefined);
  mockVerify.mockClear().mockResolvedValue(undefined);
  mockNavigate.mockClear();
  mockPhase = 'idle';
  mockMessage = null;
});

it('future server departure time denies without POST and back/detail never write', async () => {
  mockSnapshot = acceptedSnapshot('2099-01-01T00:00:00.000Z');
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<AcceptedJobScreen />);
  });
  expect(renderer.root.findByProps({ testID: 'depart-confirm' }).props.disabled).toBe(true);
  await act(async () => {
    renderer.root.findByProps({ testID: 'depart-confirm' }).props.onPress();
  });
  expect(mockDepart).not.toHaveBeenCalled();
  expect(mockDepart).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());
});

it('explicit two-step confirm departs once with canonical readback; unknown only verifies', async () => {
  mockSnapshot = acceptedSnapshot('2020-01-01T00:00:00.000Z');
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<AcceptedJobScreen />);
  });
  await act(async () => {
    renderer.root.findByProps({ testID: 'depart-confirm' }).props.onPress();
  });
  expect(mockDepart).not.toHaveBeenCalled();
  await act(async () => {
    renderer.root.findByProps({ testID: 'depart-confirm' }).props.onPress();
  });
  expect(mockDepart).toHaveBeenCalledTimes(1);
  await act(async () => renderer.unmount());

  mockPhase = 'unknown';
  await act(async () => {
    renderer = create(<AcceptedJobScreen />);
  });
  await act(async () => {
    renderer.root.findByProps({ testID: 'depart-confirm' }).props.onPress();
  });
  expect(mockVerify).toHaveBeenCalledTimes(1);
  expect(mockDepart).toHaveBeenCalledTimes(1);
  await act(async () => renderer.unmount());
});

it('known precommit denial shows recovery text and revoked clears draft without POST', async () => {
  mockSnapshot = acceptedSnapshot('2020-01-01T00:00:00.000Z');
  mockPhase = 'denied';
  mockMessage = 'Hệ thống chưa cho phép xuất phát. Hãy làm mới giờ được phép và phân công trước khi thử lại.';
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<AcceptedJobScreen />);
  });
  expect(JSON.stringify(renderer.toJSON())).toMatch(/Hệ thống chưa cho phép xuất phát/);
  await act(async () => renderer.unmount());

  mockPhase = 'idle';
  mockMessage = null;
  mockSnapshot = acceptedSnapshot('2020-01-01T00:00:00.000Z');
  mockSnapshot.access = 'revoked';
  await act(async () => {
    renderer = create(<AcceptedJobScreen />);
  });
  expect(renderer.root.findByProps({ testID: 'depart-confirm' }).props.disabled).toBe(true);
  await act(async () => {
    renderer.root.findByProps({ testID: 'depart-confirm' }).props.onPress();
  });
  expect(mockDepart).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());
});
