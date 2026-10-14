import React from 'react';
import { act, create } from 'react-test-renderer';
import type { OrderSessionKey, OrderSessionSnapshot, OrderPartReadModel } from '../domain/order-session.types';
import { createOrderSessionSnapshot, readyResource } from '../domain/order-session.types';
import PartsLifecycleScreen from './PartsLifecycleScreen';

let mockKey: OrderSessionKey;
let mockSnapshot: OrderSessionSnapshot;
let mockJournalList: unknown[] = [];
let mockState: any;
const mockReceiveByQr = jest.fn();
const mockUpdateItemUsage = jest.fn();
const mockCancelPartRequest = jest.fn();
const mockVerify = jest.fn();
const mockRefresh: jest.Mock = jest.fn(async () => {});
const mockLoadResource: jest.Mock = jest.fn(async () => {});
const mockNavigate: jest.Mock = jest.fn();
const mockGoBack: jest.Mock = jest.fn();
let mockFocused = true;
let mockCameraPermission = { granted: false, canAskAgain: true };
const mockRequestCameraPermission = jest.fn(async () => ({ granted: true, canAskAgain: true }));
jest.mock('expo-camera', () => ({
  CameraView: jest.requireActual('react-native').View,
  useCameraPermissions: () => [mockCameraPermission, mockRequestCameraPermission],
}));

jest.mock('../runtime/OrderSessionProvider', () => ({
  useOrderSession: () => ({
    key: mockKey,
    snapshot: mockSnapshot,
    refresh: (...args: unknown[]) => mockRefresh(...args),
    loadResource: (...args: unknown[]) => mockLoadResource(...args),
    journal: { list: () => mockJournalList },
  }),
}));

jest.mock('./useTechnicianParts', () => ({
  useTechnicianParts: () => ({
    controller: {
      receiveByQr: (...args: unknown[]) => mockReceiveByQr(...args),
      updateItemUsage: (...args: unknown[]) => mockUpdateItemUsage(...args),
      cancelPartRequest: (...args: unknown[]) => mockCancelPartRequest(...args),
      verify: (...args: unknown[]) => mockVerify(...args),
    },
    state: mockState,
  }),
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: (...args: unknown[]) => mockNavigate(...args),
    goBack: (...args: unknown[]) => mockGoBack(...args),
  }),
  useIsFocused: () => mockFocused,
}));

jest.mock('react-native-safe-area-context', () => {
  const Native = jest.requireActual('react-native');
  return { SafeAreaView: Native.View, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
});

jest.mock('../../../hooks/useKeyboardInset', () => ({ useKeyboardInset: () => 0 }));

function createBaseSnapshot(partsList: OrderPartReadModel[] = []) {
  const key: OrderSessionKey = { userId: 'tech-1', role: 'technician', sessionGeneration: 1, serviceOrderId: 'order-1' };
  const snapshot = createOrderSessionSnapshot(key);
  snapshot.access = 'current';
  snapshot.order = readyResource(
    {
      id: 'order-1',
      code: 'SO-1',
      serviceName: 'Sửa điều hòa',
      status: 'UNDER_REPAIR',
      pricingMode: 'INSPECTION_REQUIRED',
      technician: { id: 'tech-1', fullName: 'Thợ chính' },
      createdAt: '2026-10-14T00:00:00Z',
    } as any,
    1,
    1,
  );
  snapshot.resources.parts = readyResource(partsList, 1, 1);
  return { key, snapshot };
}

describe('PartsLifecycleScreen (T12)', () => {
  it('camera denial keeps manual entry available and cancellation sends no receive', async () => {
    ({ key: mockKey, snapshot: mockSnapshot } = createBaseSnapshot([{ id: 'pr-denied', serviceOrderId: 'order-1', technicianId: 'tech-1', status: 'ready', fulfillmentMethod: 'pickup', items: [] }]));
    mockRequestCameraPermission.mockResolvedValueOnce({ granted: false, canAskAgain: false });
    let tree: any;
    act(() => { tree = create(<PartsLifecycleScreen />); });
    act(() => { tree.root.findByProps({ testID: 'parts-receive-btn-pr-denied' }).props.onPress(); });
    act(() => { tree.root.findByProps({ testID: 'parts-qr-scan' }).props.onPress(); });
    await act(async () => { await tree.root.findByProps({ testID: 'parts-camera-permission' }).props.onPress(); });
    expect(JSON.stringify(tree.toJSON())).toContain('Bạn có thể nhập mã nhận hàng');
    act(() => { tree.root.findByProps({ testID: 'parts-camera-cancel' }).props.onPress(); });
    expect(tree.root.findByProps({ testID: 'parts-qr-input' })).toBeTruthy();
    act(() => { tree.root.findByProps({ testID: 'parts-draft-cancel' }).props.onPress(); });
    expect(mockReceiveByQr).not.toHaveBeenCalled();
  });
  it('scans a real camera token but sends only from the footer, then purges on blur', async () => {
    ({ key: mockKey, snapshot: mockSnapshot } = createBaseSnapshot([{ id: 'pr-scan', serviceOrderId: 'order-1', technicianId: 'tech-1', status: 'ready', fulfillmentMethod: 'pickup', items: [] }]));
    let tree: any;
    act(() => { tree = create(<PartsLifecycleScreen />); });
    act(() => { tree.root.findByProps({ testID: 'parts-receive-btn-pr-scan' }).props.onPress(); });
    act(() => { tree.root.findByProps({ testID: 'parts-qr-scan' }).props.onPress(); });
    await act(async () => { await tree.root.findByProps({ testID: 'parts-camera-permission' }).props.onPress(); });
    expect(mockRequestCameraPermission).toHaveBeenCalledTimes(1);
    mockCameraPermission = { granted: true, canAskAgain: true };
    act(() => { tree.update(<PartsLifecycleScreen />); });
    act(() => { tree.root.findByProps({ testID: 'parts-camera-view' }).props.onBarcodeScanned({ data: 'actual-token' }); });
    expect(tree.root.findByProps({ testID: 'parts-qr-input' }).props.value).toBe('actual-token');
    expect(mockReceiveByQr).not.toHaveBeenCalled();
    const stale = tree.root.findByProps({ testID: 'parts-qr-submit' }).props.onPress;
    mockFocused = false;
    act(() => { tree.update(<PartsLifecycleScreen />); });
    act(() => { stale(); });
    expect(mockReceiveByQr).not.toHaveBeenCalled();
    expect(JSON.stringify(tree.toJSON())).not.toContain('actual-token');
  });

  it('unknown recovery locks receive, cancellation and usage handlers', () => {
    ({ key: mockKey, snapshot: mockSnapshot } = createBaseSnapshot([{ id: 'pr-unknown', serviceOrderId: 'order-1', technicianId: 'tech-1', status: 'received', items: [{ id: 'item-u', quantity: 1, partNameSnapshot: 'Tụ', usageStatus: 'pending' }] }]));
    mockState = { ...mockState, phase: 'unknown' };
    let tree: any;
    act(() => { tree = create(<PartsLifecycleScreen />); });
    act(() => { tree.root.findByProps({ testID: 'parts-usage-used-item-u' }).props.onPress(); });
    expect(mockUpdateItemUsage).not.toHaveBeenCalled();
  });
  beforeEach(() => {
    jest.clearAllMocks();
    mockFocused = true;
    mockCameraPermission = { granted: false, canAskAgain: true };
    mockJournalList = [];
    mockState = {
      phase: 'idle',
      operation: null,
      targetId: null,
      error: null,
      actionSuccess: null,
      resolvedEntityId: null,
    };
  });

  it('renders parts requests list and items', () => {
    const parts: OrderPartReadModel[] = [
      {
        id: 'pr-1',
        serviceOrderId: 'order-1',
        technicianId: 'tech-1',
        status: 'ready',
        fulfillmentMethod: 'pickup',
        requestType: 'additional',
        items: [
          {
            id: 'item-1',
            partNameSnapshot: 'Gas R32',
            quantity: 2,
            usageStatus: 'pending',
          },
        ],
      },
    ];

    const { key, snapshot } = createBaseSnapshot(parts);
    mockKey = key;
    mockSnapshot = snapshot;

    let tree: any;
    act(() => {
      tree = create(<PartsLifecycleScreen />);
    });

    const root = tree.root;
    expect(root.findByProps({ testID: 'parts-request-pr-1' })).toBeTruthy();
    expect(root.findByProps({ testID: 'parts-receive-btn-pr-1' })).toBeTruthy();
  });

  it('opens QR modal and receives parts with qrToken', () => {
    const parts: OrderPartReadModel[] = [
      {
        id: 'pr-1',
        serviceOrderId: 'order-1',
        technicianId: 'tech-1',
        status: 'ready',
        fulfillmentMethod: 'pickup',
        requestType: 'additional',
        items: [{ id: 'item-1', partNameSnapshot: 'Gas R32', quantity: 2, usageStatus: 'pending' }],
      },
    ];

    const { key, snapshot } = createBaseSnapshot(parts);
    mockKey = key;
    mockSnapshot = snapshot;

    let tree: any;
    act(() => {
      tree = create(<PartsLifecycleScreen />);
    });

    const root = tree.root;
    const receiveBtn = root.findByProps({ testID: 'parts-receive-btn-pr-1' });

    act(() => {
      receiveBtn.props.onPress();
    });

    expect(root.findByProps({ testID: 'parts-qr-modal' })).toBeTruthy();

    const input = root.findByProps({ testID: 'parts-qr-input' });
    act(() => {
      input.props.onChangeText('QR_SECRET_TOKEN_123');
    });

    const submitBtn = root.findByProps({ testID: 'parts-qr-submit' });
    act(() => {
      submitBtn.props.onPress();
    });

    expect(mockReceiveByQr).toHaveBeenCalledWith(mockKey, 'pr-1', 'QR_SECRET_TOKEN_123');
    expect(root.findAllByProps({ testID: 'parts-qr-modal' }).length).toBe(0);
  });

  it('allows cancelling a request when status is requested', () => {
    const parts: OrderPartReadModel[] = [
      {
        id: 'pr-requested-1',
        serviceOrderId: 'order-1',
        technicianId: 'tech-1',
        status: 'requested',
        fulfillmentMethod: 'pickup',
        requestType: 'additional',
        items: [{ id: 'item-1', partNameSnapshot: 'Van ga', quantity: 1, usageStatus: 'pending' }],
      },
    ];

    const { key, snapshot } = createBaseSnapshot(parts);
    mockKey = key;
    mockSnapshot = snapshot;

    let tree: any;
    act(() => {
      tree = create(<PartsLifecycleScreen />);
    });

    const root = tree.root;
    const cancelBtn = root.findByProps({ testID: 'parts-cancel-btn-pr-requested-1' });

    act(() => {
      cancelBtn.props.onPress();
    });

    expect(root.findByProps({ testID: 'parts-cancel-modal' })).toBeTruthy();

    const reasonInput = root.findByProps({ testID: 'parts-cancel-reason-input' });
    act(() => {
      reasonInput.props.onChangeText('Khách đổi ý không thay');
    });

    const confirmCancelBtn = root.findByProps({ testID: 'parts-cancel-confirm' });
    act(() => {
      confirmCancelBtn.props.onPress();
    });

    expect(mockCancelPartRequest).toHaveBeenCalledWith(mockKey, 'pr-requested-1', 'Khách đổi ý không thay');
  });

  it('updates item usage (used / returned) when request is received and order is under repair', () => {
    const parts: OrderPartReadModel[] = [
      {
        id: 'pr-received-1',
        serviceOrderId: 'order-1',
        technicianId: 'tech-1',
        status: 'received',
        fulfillmentMethod: 'pickup',
        requestType: 'additional',
        items: [
          {
            id: 'item-gas-1',
            partNameSnapshot: 'Bình gas mini',
            quantity: 1,
            usageStatus: 'pending',
          },
        ],
      },
    ];

    const { key, snapshot } = createBaseSnapshot(parts);
    mockKey = key;
    mockSnapshot = snapshot;

    let tree: any;
    act(() => {
      tree = create(<PartsLifecycleScreen />);
    });

    const root = tree.root;
    const usedBtn = root.findByProps({ testID: 'parts-usage-used-item-gas-1' });

    act(() => {
      usedBtn.props.onPress();
    });

    expect(mockUpdateItemUsage).not.toHaveBeenCalled();
    act(() => { root.findByProps({ testID: 'parts-usage-confirm' }).props.onPress(); });
    expect(mockUpdateItemUsage).toHaveBeenCalledWith(mockKey, 'pr-received-1', 'item-gas-1', 'used');

    const returnedBtn = root.findByProps({ testID: 'parts-usage-returned-item-gas-1' });
    act(() => {
      returnedBtn.props.onPress();
    });

    act(() => { root.findByProps({ testID: 'parts-usage-confirm' }).props.onPress(); });
    expect(mockUpdateItemUsage).toHaveBeenCalledWith(mockKey, 'pr-received-1', 'item-gas-1', 'returned');
  });

  it('renders read-only notice for historical access', () => {
    const { key, snapshot } = createBaseSnapshot([]);
    snapshot.access = 'historical';
    mockKey = key;
    mockSnapshot = snapshot;

    let tree: any;
    act(() => {
      tree = create(<PartsLifecycleScreen />);
    });

    const root = tree.root;
    expect(root.findAllByProps({ testID: 'parts-back-task' }).length).toBe(0);
  });
});
