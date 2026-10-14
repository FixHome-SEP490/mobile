import React from 'react';
import { act, create } from 'react-test-renderer';
import type { OrderSessionSnapshot } from '../domain/order-session.types';
import { createOrderSessionSnapshot, readyResource } from '../domain/order-session.types';
import RepairRecoveryScreen from './RepairRecoveryScreen';

let mockSnapshot: OrderSessionSnapshot;
let mockRefresh: jest.Mock;
let mockLoadResource: jest.Mock;
const mockRecoverRepair = jest.fn();
const mockVerify = jest.fn();
let mockPhase: string = 'idle';
let mockMessage: string | null = null;
const mockNavigate = jest.fn();

jest.mock('../runtime/OrderSessionProvider', () => ({
  useOrderSession: () => ({
    key: mockSnapshot.key,
    snapshot: mockSnapshot,
    refresh: (...args: unknown[]) => mockRefresh(...args),
    loadResource: (...args: unknown[]) => mockLoadResource(...args),
  }),
}));
jest.mock('./useTechnicianArrivalProof', () => ({
  useTechnicianArrivalProof: (args?: unknown) => {
    expect(args ?? {}).toEqual({});
    return { controller: { recoverRepair: mockRecoverRepair, verify: mockVerify }, state: { phase: mockPhase, message: mockMessage } };
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

const face = { id: 'face-1', serviceOrderId: 'order-1', type: 'CHECKIN_FACE', uploaderId: 'tech-1', mediaUrl: 'https://x', createdAt: '' };
const before = { id: 'before-1', serviceOrderId: 'order-1', type: 'BEFORE', uploaderId: 'tech-1', mediaUrl: 'https://x', createdAt: '' };

function recoverySnapshot(withPolicy: boolean): OrderSessionSnapshot {
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
      arrivalVerified: true,
      pricingMode: 'FIXED_PRICE',
      fixedUnitPrice: 100,
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
    } as never,
    1,
    1,
  );
  snapshot.resources.evidence = readyResource([face, before] as never[], 1, 1);
  snapshot.resources.extras = readyResource([], 1, 1);
  snapshot.resources.parts = readyResource([], 1, 1);
  snapshot.resources.quotations = readyResource([], 1, 1);
  if (withPolicy) snapshot.proofPolicy = { beforeMinimum: 1, afterMinimum: 1 };
  return snapshot;
}

beforeEach(() => {
  mockRefresh = jest.fn(async () => {});
  mockLoadResource = jest.fn(async () => {});
  mockRecoverRepair.mockClear().mockResolvedValue(undefined);
  mockVerify.mockClear().mockResolvedValue(undefined);
  mockNavigate.mockClear();
  mockPhase = 'idle';
  mockMessage = null;
});

it('absent attested policy keeps recovery disabled with capture guidance and no POST', async () => {
  mockSnapshot = recoverySnapshot(false);
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<RepairRecoveryScreen />);
  });
  expect(renderer.root.findByProps({ testID: 'recovery-confirm' }).props.disabled).toBe(true);
  expect(JSON.stringify(renderer.toJSON())).toMatch(/số ảnh hệ thống yêu cầu/);
  await act(async () => {
    renderer.root.findByProps({ testID: 'recovery-confirm' }).props.onPress();
  });
  expect(mockRecoverRepair).not.toHaveBeenCalled();
  await act(async () => {
    renderer.root.findByProps({ testID: 'recovery-capture-link' }).props.onPress();
  });
  expect(mockNavigate).toHaveBeenCalledWith('BeforeCapture');
  expect(mockRecoverRepair).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());
});

it('confirmed recovery POSTs once through the frozen controller; unknown only verifies', async () => {
  mockSnapshot = recoverySnapshot(true);
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<RepairRecoveryScreen />);
  });
  await act(async () => {
    renderer.root.findByProps({ testID: 'recovery-confirm' }).props.onPress();
  });
  expect(mockRecoverRepair).not.toHaveBeenCalled();
  await act(async () => {
    renderer.root.findByProps({ testID: 'recovery-confirm' }).props.onPress();
  });
  expect(mockRecoverRepair).toHaveBeenCalledTimes(1);
  expect(mockRecoverRepair).toHaveBeenCalledWith(true);
  await act(async () => renderer.unmount());

  mockPhase = 'unknown';
  await act(async () => {
    renderer = create(<RepairRecoveryScreen />);
  });
  await act(async () => {
    renderer.root.findByProps({ testID: 'recovery-confirm' }).props.onPress();
  });
  expect(mockVerify).toHaveBeenCalledTimes(1);
  expect(mockRecoverRepair).toHaveBeenCalledTimes(1);
  await act(async () => renderer.unmount());
});

it('revoked assignment clears the draft and disables recovery without writes', async () => {
  mockSnapshot = recoverySnapshot(true);
  mockSnapshot.access = 'revoked';
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<RepairRecoveryScreen />);
  });
  expect(renderer.root.findByProps({ testID: 'recovery-confirm' }).props.disabled).toBe(true);
  await act(async () => {
    renderer.root.findByProps({ testID: 'recovery-confirm' }).props.onPress();
  });
  expect(mockRecoverRepair).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());
});

it('restored journal pendingIntent with idle controller enables verify and never calls recoverRepair', async () => {
  mockSnapshot = recoverySnapshot(true);
  mockSnapshot.pendingIntent = true;
  mockSnapshot.resources.evidence = { status: 'error', requestSeq: 1, error: 'unavailable' };
  mockPhase = 'idle';

  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<RepairRecoveryScreen />);
  });

  const confirmBtn = renderer.root.findByProps({ testID: 'recovery-confirm' });
  expect(confirmBtn.props.disabled).toBe(false);
  expect(confirmBtn.props.children.props.children).toBe('Kiểm tra lại');

  await act(async () => {
    confirmBtn.props.onPress();
  });
  expect(mockVerify).toHaveBeenCalledTimes(1);
  expect(mockRecoverRepair).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());
});

it('restored journal pendingIntent with ACCEPTED order status enables GET-only verify without EN_ROUTE gate', async () => {
  mockSnapshot = recoverySnapshot(true);
  mockSnapshot.pendingIntent = true;
  (mockSnapshot.order as { status: 'ready'; data: any }).data.status = 'ACCEPTED';
  mockPhase = 'idle';

  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<RepairRecoveryScreen />);
  });

  const confirmBtn = renderer.root.findByProps({ testID: 'recovery-confirm' });
  expect(confirmBtn.props.disabled).toBe(false);
  expect(confirmBtn.props.children.props.children).toBe('Kiểm tra lại');

  await act(async () => {
    confirmBtn.props.onPress();
  });
  expect(mockVerify).toHaveBeenCalledTimes(1);
  expect(mockRecoverRepair).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());
});
