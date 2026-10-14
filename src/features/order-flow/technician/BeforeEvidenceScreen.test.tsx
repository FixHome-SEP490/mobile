import React from 'react';
import { act, create } from 'react-test-renderer';
import type { OrderSessionSnapshot } from '../domain/order-session.types';
import { createOrderSessionSnapshot, readyResource } from '../domain/order-session.types';
import BeforeEvidenceScreen from './BeforeEvidenceScreen';

let mockSnapshot: OrderSessionSnapshot;
let mockRefresh: jest.Mock;
let mockLoadResource: jest.Mock;
const mockUploadBefore = jest.fn();
const mockDeleteBefore = jest.fn();
const mockVerify = jest.fn();
let mockPhase: string = 'idle';
let mockMessage: string | null = null;
const mockCapturePhoto = jest.fn();
const mockConfirmPermission = jest.fn();
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
    return {
      controller: { uploadBefore: mockUploadBefore, deleteBefore: mockDeleteBefore, verify: mockVerify },
      state: { phase: mockPhase, message: mockMessage },
    };
  },
}));
jest.mock('./camera-capture', () => ({
  captureCameraPhoto: (...args: unknown[]) => mockCapturePhoto(...args),
  confirmCameraPermission: (...args: unknown[]) => mockConfirmPermission(...args),
}));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
}));
jest.mock('react-native-safe-area-context', () => {
  const Native = jest.requireActual('react-native');
  return { SafeAreaView: Native.View, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
});
jest.mock('../../../hooks/useKeyboardInset', () => ({ useKeyboardInset: () => 0 }));

const asset = { source: 'camera' as const, uri: 'file:///cache/before.jpg', name: 'before.jpg', type: 'image/jpeg', sizeBytes: 300000 };
const face = { id: 'face-1', serviceOrderId: 'order-1', type: 'CHECKIN_FACE', uploaderId: 'tech-1', mediaUrl: 'https://x', createdAt: '' };
const before = { id: 'before-1', serviceOrderId: 'order-1', type: 'BEFORE', uploaderId: 'tech-1', mediaUrl: 'https://x', createdAt: '' };

function beforeSnapshot(evidence: unknown[], pricingMode = 'FIXED_PRICE'): OrderSessionSnapshot {
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
      pricingMode,
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
  snapshot.resources.evidence = readyResource(evidence as never[], 1, 1);
  return snapshot;
}

beforeEach(() => {
  mockRefresh = jest.fn(async () => {});
  mockLoadResource = jest.fn(async () => {});
  mockUploadBefore.mockClear().mockResolvedValue(undefined);
  mockDeleteBefore.mockClear().mockResolvedValue(undefined);
  mockVerify.mockClear().mockResolvedValue(undefined);
  mockNavigate.mockClear();
  mockPhase = 'idle';
  mockMessage = null;
  mockCapturePhoto.mockReset().mockResolvedValue({ ok: true, asset });
  mockConfirmPermission.mockReset().mockResolvedValue(true);
});

it('requires complete evidence before decisions and sends the exact captured asset', async () => {
  mockSnapshot = beforeSnapshot([face]);
  mockSnapshot.resources.evidence = { status: 'loading', requestSeq: 2 };
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<BeforeEvidenceScreen />);
  });
  expect(renderer.root.findByProps({ testID: 'before-capture' }).props.disabled).toBe(true);
  expect(JSON.stringify(renderer.toJSON())).toMatch(/đang tải danh sách ảnh/i);
  await act(async () => renderer.unmount());

  mockSnapshot = beforeSnapshot([face]);
  await act(async () => {
    renderer = create(<BeforeEvidenceScreen />);
  });
  expect(renderer.root.findByProps({ testID: 'before-capture' }).props.disabled).toBe(false);
  await act(async () => {
    await renderer.root.findByProps({ testID: 'before-capture' }).props.onPress();
  });
  expect(renderer.root.findByProps({ testID: 'before-preview' }).props.source).toEqual({ uri: asset.uri });
  expect(renderer.root.findByProps({ testID: 'before-cancel' })).toBeTruthy();
  await act(async () => {
    renderer.root.findByProps({ testID: 'before-cancel' }).props.onPress();
  });
  expect(renderer.root.findAllByProps({ testID: 'before-preview' })).toHaveLength(0);
  await act(async () => {
    await renderer.root.findByProps({ testID: 'before-capture' }).props.onPress();
  });
  await act(async () => {
    await renderer.root.findByProps({ testID: 'before-send' }).props.onPress();
  });
  expect(mockUploadBefore).toHaveBeenCalledTimes(1);
  expect(mockUploadBefore.mock.calls[0][0]).toEqual(asset);
  await act(async () => renderer.unmount());
});

it('confirmed BEFORE deletion needs explicit target confirm and unknown only verifies', async () => {
  mockSnapshot = beforeSnapshot([face, before]);
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<BeforeEvidenceScreen />);
  });
  await act(async () => {
    renderer.root.findByProps({ testID: 'before-delete-before-1' }).props.onPress();
  });
  expect(mockDeleteBefore).not.toHaveBeenCalled();
  await act(async () => {
    renderer.root.findByProps({ testID: 'before-delete-confirm-before-1' }).props.onPress();
  });
  expect(mockDeleteBefore).toHaveBeenCalledTimes(1);
  expect(mockDeleteBefore).toHaveBeenCalledWith('before-1', true);
  await act(async () => renderer.unmount());

  mockPhase = 'unknown';
  mockSnapshot.resources.evidence = { status: 'error', requestSeq: 2, error: 'unavailable' };
  await act(async () => {
    renderer = create(<BeforeEvidenceScreen />);
  });
  const verifyBtn = renderer.root.findByProps({ testID: 'before-verify' });
  expect(verifyBtn.props.disabled).toBe(false);
  await act(async () => {
    verifyBtn.props.onPress();
  });
  expect(mockVerify).toHaveBeenCalledTimes(1);
  expect(mockUploadBefore).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());
});

it('safe Next and resume never POST and one upload never claims the minimum', async () => {
  mockSnapshot = beforeSnapshot([face]);
  mockPhase = 'resolved';
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<BeforeEvidenceScreen />);
  });
  expect(JSON.stringify(renderer.toJSON())).toMatch(/số ảnh yêu cầu do máy chủ quyết định/);
  await act(async () => {
    renderer.root.findByProps({ testID: 'task-scope-link' }).props.onPress();
  });
  expect(mockNavigate).toHaveBeenCalledWith('ScopeDetail');
  expect(mockUploadBefore).not.toHaveBeenCalled();
  expect(mockDeleteBefore).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());
});

it.each([
  ['ready', beforeSnapshot([face])],
  ['error', (() => {
    const snap = beforeSnapshot([face]);
    snap.resources.evidence = { status: 'error', requestSeq: 2, error: 'unavailable' };
    return snap;
  })()],
])('pendingIntent with idle phase shows enabled verify and no camera/upload (%s)', async (_name, snap) => {
  mockSnapshot = snap;
  mockSnapshot.pendingIntent = true;
  mockPhase = 'idle';

  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<BeforeEvidenceScreen />);
  });

  const verifyBtn = renderer.root.findByProps({ testID: 'before-verify' });
  expect(verifyBtn.props.disabled).toBe(false);
  expect(renderer.root.findAllByProps({ testID: 'before-capture' })).toHaveLength(0);
  expect(renderer.root.findAllByProps({ testID: 'before-send' })).toHaveLength(0);

  await act(async () => {
    verifyBtn.props.onPress();
  });
  expect(mockVerify).toHaveBeenCalledTimes(1);
  expect(mockCapturePhoto).not.toHaveBeenCalled();
  expect(mockUploadBefore).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());
});
