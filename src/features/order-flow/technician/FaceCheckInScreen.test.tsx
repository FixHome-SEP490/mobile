import React from 'react';
import { act, create } from 'react-test-renderer';
import type { OrderSessionSnapshot } from '../domain/order-session.types';
import { createOrderSessionSnapshot, readyResource } from '../domain/order-session.types';
import FaceCheckInScreen from './FaceCheckInScreen';
import { ordersApi } from '../../../api/orders.api';

let mockSnapshot: OrderSessionSnapshot;
let mockRefresh: jest.Mock;
let mockLoadResource: jest.Mock;
const mockUploadFace = jest.fn();
const mockVerify = jest.fn();
let mockPhase: string = 'idle';
let mockMessage: string | null = null;
const mockCapturePhoto = jest.fn();
const mockConfirmPermission = jest.fn();
const mockNavigate = jest.fn();

jest.mock('../runtime/OrderSessionProvider', () => ({
  useOptionalOrderSession: () => null,
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
    return { controller: { uploadFace: mockUploadFace, verify: mockVerify }, state: { phase: mockPhase, message: mockMessage } };
  },
}));
jest.mock('./FaceLivenessCamera', () => {
  const R = jest.requireActual<typeof import('react')>('react');
  const View = jest.requireActual<typeof import('react-native')>('react-native').View;
  return {
    __esModule: true,
    default: (props: object) => R.createElement(View, { testID: 'live-camera-mock', ...props }),
    FACE_STEP_TEXT: { plain: 'Nhìn thẳng', turn_left: 'Quay trái', turn_right: 'Quay phải', look_up: 'Ngẩng lên', look_down: 'Cúi xuống' },
  };
});
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

const asset = { source: 'camera' as const, uri: 'file:///cache/face.jpg', name: 'face.jpg', type: 'image/jpeg', sizeBytes: 200000 };

function faceSnapshot(evidence: unknown[]): OrderSessionSnapshot {
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
  mockUploadFace.mockClear().mockResolvedValue(undefined);
  mockVerify.mockClear().mockResolvedValue(undefined);
  mockNavigate.mockClear();
  mockPhase = 'idle';
  mockMessage = null;
  mockCapturePhoto.mockReset().mockResolvedValue({ ok: true, asset });
  mockConfirmPermission.mockReset().mockResolvedValue(true);
});

it('capture provenance flows to upload with the exact asset; permission failure never POSTs', async () => {
  mockSnapshot = faceSnapshot([]);
  mockCapturePhoto.mockResolvedValueOnce({ ok: false, reason: 'permission', message: 'Bạn chưa cho phép dùng camera.' });
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<FaceCheckInScreen />);
  });
  await act(async () => {
    await renderer.root.findByProps({ testID: 'face-capture' }).props.onPress();
  });
  expect(mockUploadFace).not.toHaveBeenCalled();
  expect(JSON.stringify(renderer.toJSON())).toMatch(/chưa cho phép dùng camera/);
  await act(async () => {
    await renderer.root.findByProps({ testID: 'face-capture' }).props.onPress();
  });
  expect(renderer.root.findByProps({ testID: 'face-retake' })).toBeTruthy();
  expect(renderer.root.findByProps({ testID: 'face-preview' }).props.source).toEqual({ uri: asset.uri });
  expect(renderer.root.findByProps({ testID: 'face-cancel' })).toBeTruthy();
  await act(async () => {
    renderer.root.findByProps({ testID: 'face-cancel' }).props.onPress();
  });
  expect(renderer.root.findAllByProps({ testID: 'face-preview' })).toHaveLength(0);
  await act(async () => {
    await renderer.root.findByProps({ testID: 'face-capture' }).props.onPress();
  });
  await act(async () => {
    await renderer.root.findByProps({ testID: 'face-send' }).props.onPress();
  });
  expect(mockConfirmPermission).toHaveBeenCalledTimes(1);
  expect(mockUploadFace).toHaveBeenCalledTimes(1);
  expect(mockUploadFace.mock.calls[0][0]).toEqual(asset);
  await act(async () => renderer.unmount());
});

it('revoked permission before upload clears the draft and never POSTs', async () => {
  mockSnapshot = faceSnapshot([]);
  mockConfirmPermission.mockResolvedValueOnce(false);
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<FaceCheckInScreen />);
  });
  await act(async () => {
    await renderer.root.findByProps({ testID: 'face-capture' }).props.onPress();
  });
  await act(async () => {
    await renderer.root.findByProps({ testID: 'face-send' }).props.onPress();
  });
  expect(mockUploadFace).not.toHaveBeenCalled();
  expect(JSON.stringify(renderer.toJSON())).toMatch(/thu hồi/);
  await act(async () => renderer.unmount());
});

it('unknown outcome only verifies and confirmed face disables capture without resend', async () => {
  mockSnapshot = faceSnapshot([]);
  mockPhase = 'unknown';
  mockSnapshot.resources.evidence = { status: 'error', requestSeq: 2, error: 'unavailable' };
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<FaceCheckInScreen />);
  });
  const verifyBtn = renderer.root.findByProps({ testID: 'face-verify' });
  expect(verifyBtn.props.disabled).toBe(false);
  await act(async () => {
    verifyBtn.props.onPress();
  });
  expect(mockVerify).toHaveBeenCalledTimes(1);
  expect(mockUploadFace).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());

  mockPhase = 'idle';
  mockSnapshot = faceSnapshot([{ id: 'face-1', serviceOrderId: 'order-1', type: 'CHECKIN_FACE', uploaderId: 'tech-1', mediaUrl: 'https://x', createdAt: '' }]);
  await act(async () => {
    renderer = create(<FaceCheckInScreen />);
  });
  expect(renderer.root.findByProps({ testID: 'face-capture' }).props.disabled).toBe(true);
  expect(JSON.stringify(renderer.toJSON())).toMatch(/đã được máy chủ xác nhận/);
  await act(async () => renderer.unmount());
});

it('revoked assignment disables actions and back/detail never write', async () => {
  mockSnapshot = faceSnapshot([]);
  mockSnapshot.access = 'revoked';
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<FaceCheckInScreen />);
  });
  expect(renderer.root.findByProps({ testID: 'face-capture' }).props.disabled).toBe(true);
  await act(async () => {
    await renderer.root.findByProps({ testID: 'face-capture' }).props.onPress();
  });
  expect(mockCapturePhoto).not.toHaveBeenCalled();
  expect(mockNavigate).not.toHaveBeenCalled();
  expect(mockUploadFace).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());
});

it.each([
  ['ready', faceSnapshot([])],
  ['error', (() => {
    const snap = faceSnapshot([]);
    snap.resources.evidence = { status: 'error', requestSeq: 2, error: 'unavailable' };
    return snap;
  })()],
])('pendingIntent with idle phase shows enabled verify and no camera/upload (%s)', async (_name, snap) => {
  mockSnapshot = snap;
  mockSnapshot.pendingIntent = true;
  mockPhase = 'idle';

  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<FaceCheckInScreen />);
  });

  const verifyBtn = renderer.root.findByProps({ testID: 'face-verify' });
  expect(verifyBtn.props.disabled).toBe(false);
  expect(renderer.root.findAllByProps({ testID: 'face-capture' })).toHaveLength(0);
  expect(renderer.root.findAllByProps({ testID: 'face-send' })).toHaveLength(0);

  await act(async () => {
    verifyBtn.props.onPress();
  });
  expect(mockVerify).toHaveBeenCalledTimes(1);
  expect(mockCapturePhoto).not.toHaveBeenCalled();
  expect(mockUploadFace).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());
});

it('with a server challenge it opens one in-app camera for both photos and uploads them together with the token', async () => {
  mockSnapshot = faceSnapshot([]);
  const spy = jest.spyOn(ordersApi, 'getCheckInFaceChallenge').mockResolvedValue({ challenge: 'look_up', token: 'tok' });
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<FaceCheckInScreen />); });
  await act(async () => { await renderer.root.findByProps({ testID: 'face-capture' }).props.onPress(); });
  expect(mockCapturePhoto).not.toHaveBeenCalled(); // the system camera is not used for the challenge flow
  const cam = renderer.root.findByProps({ testID: 'live-camera-mock' });
  expect(cam.props.challenge).toBe('look_up');

  const second = { ...asset, uri: 'file://second.jpg', name: 'second.jpg' };
  await act(async () => { cam.props.onDone({ plain: asset, second }); });
  expect(renderer.root.findAllByProps({ testID: 'live-camera-mock' })).toHaveLength(0);
  await act(async () => { await renderer.root.findByProps({ testID: 'face-send' }).props.onPress(); });
  expect(mockUploadFace).toHaveBeenCalledTimes(1);
  expect(mockUploadFace.mock.calls[0][0]).toMatchObject({
    uri: asset.uri,
    liveness: { token: 'tok', image: { uri: 'file://second.jpg', name: 'second.jpg', type: asset.type } },
  });
  spy.mockRestore();
  await act(async () => renderer.unmount());
});

it('each of the two photos has its own retake button that retakes only that photo', async () => {
  mockSnapshot = faceSnapshot([]);
  const spy = jest.spyOn(ordersApi, 'getCheckInFaceChallenge').mockResolvedValue({ challenge: 'turn_left', token: 'tok' });
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<FaceCheckInScreen />); });
  await act(async () => { await renderer.root.findByProps({ testID: 'face-capture' }).props.onPress(); });
  const second = { ...asset, uri: 'file://second.jpg', name: 'second.jpg' };
  await act(async () => { renderer.root.findByProps({ testID: 'live-camera-mock' }).props.onDone({ plain: asset, second }); });

  await act(async () => { renderer.root.findByProps({ testID: 'face-retake-2' }).props.onPress(); });
  expect(renderer.root.findByProps({ testID: 'live-camera-mock' }).props.mode).toBe('challenge');
  const redone = { ...asset, uri: 'file://second-b.jpg', name: 'second-b.jpg' };
  await act(async () => { renderer.root.findByProps({ testID: 'live-camera-mock' }).props.onDone({ second: redone }); });
  expect(renderer.root.findByProps({ testID: 'face-preview' }).props.source).toEqual({ uri: asset.uri });
  expect(renderer.root.findByProps({ testID: 'face-preview-second' }).props.source).toEqual({ uri: 'file://second-b.jpg' });

  await act(async () => { renderer.root.findByProps({ testID: 'face-retake-1' }).props.onPress(); });
  expect(renderer.root.findByProps({ testID: 'live-camera-mock' }).props.mode).toBe('plain');
  const redone1 = { ...asset, uri: 'file://first-b.jpg', name: 'first-b.jpg' };
  await act(async () => { renderer.root.findByProps({ testID: 'live-camera-mock' }).props.onDone({ plain: redone1 }); });
  expect(renderer.root.findByProps({ testID: 'face-preview' }).props.source).toEqual({ uri: 'file://first-b.jpg' });
  expect(renderer.root.findByProps({ testID: 'face-preview-second' }).props.source).toEqual({ uri: 'file://second-b.jpg' });
  spy.mockRestore();
  await act(async () => renderer.unmount());
});

it('dev builds show a skip button before a photo is taken, and it goes away once a photo exists', async () => {
  mockSnapshot = faceSnapshot([]);
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<FaceCheckInScreen />); });
  expect(renderer.root.findAllByProps({ testID: 'face-dev-skip' }).length).toBeGreaterThan(0);
  await act(async () => { await renderer.root.findByProps({ testID: 'face-capture' }).props.onPress(); });
  expect(renderer.root.findAllByProps({ testID: 'face-dev-skip' })).toHaveLength(0);
  await act(async () => renderer.unmount());
});
