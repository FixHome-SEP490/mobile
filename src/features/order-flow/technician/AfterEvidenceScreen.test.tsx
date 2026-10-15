import React from 'react';
import { act, create } from 'react-test-renderer';
import type { OrderSessionSnapshot } from '../domain/order-session.types';
import { createOrderSessionSnapshot, readyResource } from '../domain/order-session.types';
import AfterEvidenceScreen from './AfterEvidenceScreen';

let mockSnapshot: OrderSessionSnapshot;
let mockCompletionState: any;
let mockRouteParams: any = {};
let mockNavState: any = { routes: [{ key: 'extra-parent-key', name: 'ExtraProposal', params: { proposalId: 'extra-1' } }, { key: 'after-key', name: 'AfterEvidence', params: { fromProposal: true, proposalId: 'extra-1' } }] };
const mockUploadAfter: jest.Mock = jest.fn(async () => {});
const mockRequestDeleteAfter: jest.Mock = jest.fn(async () => {});
const mockSubmitConfirmation: jest.Mock = jest.fn(async () => {});
const mockVerify: jest.Mock = jest.fn(async () => {});
const mockGetState = jest.fn();
const mockNavigate: jest.Mock = jest.fn();
const mockGoBack: jest.Mock = jest.fn();
const mockRefresh: jest.Mock = jest.fn(async () => {});
const mockCaptureCameraPhoto: jest.Mock = jest.fn();
const mockConfirmCameraPermission: jest.Mock = jest.fn(async () => true);

jest.mock('../runtime/OrderSessionProvider', () => ({
  useOrderSession: () => ({
    key: mockSnapshot.key,
    snapshot: mockSnapshot,
    refresh: (...args: unknown[]) => mockRefresh(...args),
    loadResource: jest.fn(async () => {}),
  }),
}));
jest.mock('./useTechnicianCompletion', () => ({
  useTechnicianCompletion: () => ({
    controller: {
      uploadAfter: (...args: unknown[]) => mockUploadAfter(...args),
      requestDeleteAfter: (...args: unknown[]) => mockRequestDeleteAfter(...args),
      submitConfirmation: (...args: unknown[]) => mockSubmitConfirmation(...args),
      verify: (...args: unknown[]) => mockVerify(...args),
      getState: (...args: unknown[]) => mockGetState(...args),
    },
    state: mockCompletionState,
    captureAfter: jest.fn(async () => ({ ok: false, message: 'x' })),
  }),
}));
jest.mock('./camera-capture', () => ({
  captureCameraPhoto: (...args: unknown[]) => mockCaptureCameraPhoto(...args),
  confirmCameraPermission: (...args: unknown[]) => mockConfirmCameraPermission(...args),
}));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack, getState: () => mockNavState }),
  useRoute: () => ({ params: mockRouteParams }),
  useIsFocused: () => true,
}));
jest.mock('react-native-safe-area-context', () => {
  const Native = jest.requireActual('react-native');
  return { SafeAreaView: Native.View, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
});
jest.mock('../../../hooks/useKeyboardInset', () => ({ useKeyboardInset: () => 0 }));

const idleState = { phase: 'idle', operation: null, confirmation: null, confirmedUpload: null, message: null };
const afterRow = {
  id: 'after-1', serviceOrderId: 'order-1', type: 'AFTER', uploaderId: 'tech-1',
  mediaUrl: 'https://res.cloudinary.com/demo/image/authenticated/s--sig--/v1/after-1.jpg',
  createdAt: '2026-10-13T03:00:00.000Z',
};

function snapshotFor(status: string, completionRequestedAt?: string): OrderSessionSnapshot {
  const key = { userId: 'tech-1', role: 'technician' as const, sessionGeneration: 1, serviceOrderId: 'order-1' };
  const snapshot = createOrderSessionSnapshot(key);
  snapshot.access = 'current';
  snapshot.order = readyResource({
    id: 'order-1', code: 'SO-1', bookingId: 'booking-1', serviceName: 'Sửa máy lạnh', status,
    customerName: 'Khách hàng', customerPhone: '0900', addressSummary: 'Địa chỉ',
    scheduledAt: '2026-10-13T02:00:00.000Z', laborTotal: 0, partsTotal: 0, grandTotal: 120000,
    paymentStatus: 'UNPAID', createdAt: '2026-10-13T00:00:00.000Z',
    ...(completionRequestedAt ? { completionRequestedAt } : {}),
    technician: { id: 'tech-1', fullName: 'Kỹ thuật viên', phoneNumber: '0900', averageRating: null },
  } as any, 1, 1);
  snapshot.resources.evidence = readyResource([afterRow] as any, 1, 1);
  return snapshot;
}

beforeEach(() => {
  mockNavigate.mockClear(); mockUploadAfter.mockClear(); mockRequestDeleteAfter.mockClear();
  mockSubmitConfirmation.mockClear(); mockVerify.mockClear(); mockRefresh.mockClear();
  mockCaptureCameraPhoto.mockReset(); mockConfirmCameraPermission.mockReset();
  mockConfirmCameraPermission.mockResolvedValue(true);
  mockGetState.mockImplementation(() => mockCompletionState);
  mockRouteParams = {};
  mockNavState = { routes: [{ key: 'extra-parent-key', name: 'ExtraProposal', params: { proposalId: 'extra-1' } }, { key: 'after-key', name: 'AfterEvidence', params: { fromProposal: true, proposalId: 'extra-1' } }] };
  mockSnapshot = snapshotFor('UNDER_REPAIR');
  mockCompletionState = { ...idleState };
});

it('confirmed after from server is shown; handover link is navigation-only', async () => {
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<AfterEvidenceScreen />); });
  expect(JSON.stringify(renderer.toJSON())).toContain('1');
  await act(async () => { renderer.root.findByProps({ testID: 'task-handover-link' }).props.onPress(); });
  expect(mockNavigate).toHaveBeenCalledWith('CompletionRequest');
  expect(mockUploadAfter).not.toHaveBeenCalled();
  expect(mockSubmitConfirmation).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());
});

it('delete needs an explicit two-step confirm and sends once', async () => {
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<AfterEvidenceScreen />); });
  await act(async () => { renderer.root.findByProps({ testID: 'after-delete-after-1' }).props.onPress(); });
  expect(mockRequestDeleteAfter).toHaveBeenCalledWith('after-1');
  expect(mockSubmitConfirmation).not.toHaveBeenCalled();
  await act(async () => { renderer.root.findByProps({ testID: 'after-delete-confirm-after-1' }).props.onPress(); });
  expect(mockSubmitConfirmation).toHaveBeenCalledTimes(1);
  await act(async () => renderer.unmount());
});

it('revoked assignment clears drafts and disables capture without writes', async () => {
  mockSnapshot = snapshotFor('UNDER_REPAIR');
  mockSnapshot.access = 'revoked';
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<AfterEvidenceScreen />); });
  expect(renderer.root.findByProps({ testID: 'after-capture' }).props.disabled).toBe(true);
  expect(JSON.stringify(renderer.toJSON())).toContain('Bản nháp ảnh đã được xóa');
  await act(async () => { renderer.root.findByProps({ testID: 'after-capture' }).props.onPress(); });
  expect(mockUploadAfter).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());
});

it('confirmed upload clears the local asset so the same photo cannot resubmit', async () => {
  mockCaptureCameraPhoto.mockResolvedValue({ ok: true, asset: { source: 'camera', uri: 'file://after.jpg', name: 'after.jpg', type: 'image/jpeg', sizeBytes: 1024 } });
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<AfterEvidenceScreen />); });
  await act(async () => { renderer.root.findByProps({ testID: 'after-capture' }).props.onPress(); });
  await act(async () => {});
  expect(renderer.root.findByProps({ testID: 'after-preview' })).toBeTruthy();
  await act(async () => { renderer.root.findByProps({ testID: 'after-send' }).props.onPress(); });
  await act(async () => {});
  expect(mockUploadAfter).toHaveBeenCalledTimes(1);
  mockCompletionState = { ...idleState, phase: 'resolved', confirmedUpload: { ...afterRow } };
  await act(async () => { renderer.update(<AfterEvidenceScreen />); });
  expect(renderer.root.findAllByProps({ testID: 'after-preview' }).length).toBe(0);
  expect(renderer.root.findAllByProps({ testID: 'after-send' }).length).toBe(0);
  expect(renderer.root.findByProps({ testID: 'task-handover-next' })).toBeTruthy();
  await act(async () => renderer.unmount());
});

it('double-tap during the permission await sends only once', async () => {
  let release!: (value: boolean) => void;
  mockConfirmCameraPermission.mockImplementation(() => new Promise<boolean>(resolve => { release = resolve; }));
  mockCaptureCameraPhoto.mockResolvedValue({ ok: true, asset: { source: 'camera', uri: 'file://after.jpg', name: 'after.jpg', type: 'image/jpeg', sizeBytes: 1024 } });
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<AfterEvidenceScreen />); });
  await act(async () => { renderer.root.findByProps({ testID: 'after-capture' }).props.onPress(); });
  await act(async () => {});
  await act(async () => {
    renderer.root.findByProps({ testID: 'after-send' }).props.onPress();
    renderer.root.findByProps({ testID: 'after-send' }).props.onPress();
    release(true);
  });
  await act(async () => {});
  expect(mockUploadAfter).toHaveBeenCalledTimes(1);
  await act(async () => renderer.unmount());
});

it('revoke during the permission await drops the draft without sending', async () => {
  let release!: (value: boolean) => void;
  mockConfirmCameraPermission.mockImplementation(() => new Promise<boolean>(resolve => { release = resolve; }));
  mockCaptureCameraPhoto.mockResolvedValue({ ok: true, asset: { source: 'camera', uri: 'file://after.jpg', name: 'after.jpg', type: 'image/jpeg', sizeBytes: 1024 } });
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<AfterEvidenceScreen />); });
  await act(async () => { renderer.root.findByProps({ testID: 'after-capture' }).props.onPress(); });
  await act(async () => {});
  await act(async () => { renderer.root.findByProps({ testID: 'after-send' }).props.onPress(); });
  await act(async () => {
    mockSnapshot.access = 'revoked';
    await renderer.update(<AfterEvidenceScreen />);
  });
  await act(async () => { release(true); });
  await act(async () => {});
  expect(mockUploadAfter).not.toHaveBeenCalled();
  expect(renderer.root.findAllByProps({ testID: 'after-preview' }).length).toBe(0);
  await act(async () => renderer.unmount());
});

it('known-insufficient policy blocks handover; proposal return carries only typed mode and id', async () => {
  mockSnapshot = snapshotFor('UNDER_REPAIR');
  mockSnapshot.proofPolicy = { beforeMinimum: 1, afterMinimum: 2 };
  mockRouteParams = { fromProposal: true, proposalId: 'extra-1' };
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<AfterEvidenceScreen />); });
  expect(renderer.root.findByProps({ testID: 'task-handover-link' }).props.disabled).toBe(true);
  expect(renderer.root.findAllByProps({ testID: 'task-handover-next' }).length).toBe(0);
  expect(JSON.stringify(renderer.toJSON())).toContain('chưa đạt yêu cầu đã biết');
  await act(async () => { renderer.root.findByProps({ testID: 'after-return-proposal' }).props.onPress(); });
  expect(mockNavigate).toHaveBeenCalledWith('ExtraProposal', { proposalId: 'extra-1', capturedAfter: true }, { pop: true, merge: true });
  expect(mockNavigate).not.toHaveBeenCalledWith('CompletionRequest', expect.anything());
  await act(async () => renderer.unmount());
});

it('return with no mounted parent never creates a blank proposal', async () => {
  mockSnapshot = snapshotFor('UNDER_REPAIR');
  mockRouteParams = { fromProposal: true, proposalId: 'extra-1' };
  mockNavState = { routes: [{ key: 'after-key', name: 'AfterEvidence', params: { fromProposal: true } }] };
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<AfterEvidenceScreen />); });
  await act(async () => { renderer.root.findByProps({ testID: 'after-return-proposal' }).props.onPress(); });
  expect(mockNavigate).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());
});
