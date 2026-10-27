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

const mockGetReturns: jest.Mock = jest.fn();
const mockDeclare: jest.Mock = jest.fn(async () => {});
const mockApiUsage: jest.Mock = jest.fn(async () => ({}));
jest.mock('../../../api/part-requests.api', () => {
  const actual = jest.requireActual('../../../api/part-requests.api');
  return {
    ...actual,
    partReturnsApi: { ...actual.partReturnsApi, getByOrderId: (...args: unknown[]) => mockGetReturns(...args), declare: (...args: unknown[]) => mockDeclare(...args) },
    partRequestsApi: { ...actual.partRequestsApi, updateItemUsage: (...args: unknown[]) => mockApiUsage(...args) },
  };
});

jest.mock('../runtime/OrderSessionProvider', () => ({
  useOptionalOrderSession: () => null,
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
    mockGetReturns.mockResolvedValue([]);
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

describe('PartsLifecycleScreen UX', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFocused = true;
    mockJournalList = [];
    mockState = { phase: 'idle', operation: null, targetId: null, error: null, actionSuccess: null, resolvedEntityId: null };
  });

  it('QR code is masked by default and can be revealed to check it', () => {
    ({ key: mockKey, snapshot: mockSnapshot } = createBaseSnapshot([{ id: 'pr-q', serviceOrderId: 'order-1', technicianId: 'tech-1', status: 'ready', fulfillmentMethod: 'pickup', items: [] }]));
    let tree: any;
    act(() => { tree = create(<PartsLifecycleScreen />); });
    act(() => { tree.root.findByProps({ testID: 'parts-receive-btn-pr-q' }).props.onPress(); });
    expect(tree.root.findByProps({ testID: 'parts-qr-input' }).props.secureTextEntry).toBe(true);
    act(() => { tree.root.findByProps({ testID: 'parts-qr-reveal' }).props.onPress(); });
    expect(tree.root.findByProps({ testID: 'parts-qr-input' }).props.secureTextEntry).toBe(false);
  });

  it('usage confirmation names the item and the draft button reads Quay lại', () => {
    ({ key: mockKey, snapshot: mockSnapshot } = createBaseSnapshot([{ id: 'pr-u', serviceOrderId: 'order-1', technicianId: 'tech-1', status: 'received', items: [{ id: 'it-1', quantity: 1, partNameSnapshot: 'Tụ khởi động', usageStatus: 'pending' }] }]));
    let tree: any;
    act(() => { tree = create(<PartsLifecycleScreen />); });
    act(() => { tree.root.findByProps({ testID: 'parts-usage-used-it-1' }).props.onPress(); });
    expect(JSON.stringify(tree.toJSON()).replace(/","/g, '')).toContain('Xác nhận đã dùng: Tụ khởi động');
    expect(JSON.stringify(tree.toJSON())).toContain('Quay lại');
  });

  it('groups requests by where the parts come from, extra-cost parts under their own heading', () => {
    const request = (id: string, requestType: string) => ({ id, serviceOrderId: 'order-1', technicianId: 'tech-1', requestType, status: 'received', fulfillmentMethod: 'delivery',
      items: [{ id: `${id}-i`, partNameSnapshot: `Part ${id}`, quantity: 1, usageStatus: 'pending' }] }) as unknown as OrderPartReadModel;
    ({ key: mockKey, snapshot: mockSnapshot } = createBaseSnapshot([request('p1', 'pre_repair'), request('q1', 'quotation'), request('a1', 'additional'), request('a2', 'additional')]));
    let tree: any;
    act(() => { tree = create(<PartsLifecycleScreen />); });
    const out = JSON.stringify(tree.toJSON()).replace(/","/g, '');
    expect(out).toContain('Yêu cầu trước khi sửa');
    expect(out).toContain('Theo báo giá');
    expect(out).toContain('Chi phí phát sinh');
    expect(out).toContain('Lần 1 · Giao tận nơi');
    expect(out).toContain('Lần 2 · Giao tận nơi');
    const extra = tree.root.findByProps({ testID: 'parts-group-additional' });
    expect(extra.findAllByProps({ testID: 'parts-item-a1-i' }).length).toBeGreaterThan(0);
    expect(extra.findAllByProps({ testID: 'parts-item-p1-i' })).toHaveLength(0);
  });

  it('shows a short request code instead of the raw id and offers a way forward when empty', () => {
    ({ key: mockKey, snapshot: mockSnapshot } = createBaseSnapshot([{ id: 'aaaaaaaa-bbbb-cccc-dddd-123456abcdef', serviceOrderId: 'order-1', technicianId: 'tech-1', status: 'requested', items: [] }]));
    let tree: any;
    act(() => { tree = create(<PartsLifecycleScreen />); });
    expect(JSON.stringify(tree.toJSON())).toContain('#ABCDEF');
    ({ key: mockKey, snapshot: mockSnapshot } = createBaseSnapshot([]));
    act(() => { tree.update(<PartsLifecycleScreen />); });
    act(() => { tree.root.findByProps({ testID: 'parts-empty-cta' }).props.onPress(); });
    expect(mockNavigate).toHaveBeenCalledWith('ExtraProposal');
  });

  describe('custody and handover blockers', () => {
    const received = (usageStatus: 'pending' | 'used' | 'returned') => ({ id: 'pr-c', serviceOrderId: 'order-1', technicianId: 'tech-1', requestType: 'pre_repair', status: 'received', fulfillmentMethod: 'pickup', items: [{ id: 'it-1', partNameSnapshot: 'Bo mạch', quantity: 3, usageStatus }] }) as unknown as OrderPartReadModel;
    const record = (over: Record<string, unknown> = {}) => ({ partRequestId: 'pr-c', partRequestItemId: 'it-1', partNameSnapshot: 'Bo mạch', issuedQty: 3, usedQty: 0, declaredQty: 0, managerAcceptedQty: 0, outstandingQty: 3, version: 4, usageRecorded: false, ...over });
    const render = async () => { let tree: any; await act(async () => { tree = create(<PartsLifecycleScreen />); }); return tree; };
    const press = async (tree: any, match: (node: any) => boolean) => { await act(async () => { tree.root.find(match).props.onPress(); }); };
    const byId = (id: string) => (node: any) => node.props?.testID === id && typeof node.props.onPress === 'function';
    const byLabel = (label: string) => (node: any) => node.props?.accessibilityLabel === label && typeof node.props.onPress === 'function';

    it('says what blocks the handover and clears once every line is settled', async () => {
      ({ key: mockKey, snapshot: mockSnapshot } = createBaseSnapshot([received('pending')]));
      let tree = await render();
      expect(JSON.stringify(tree.toJSON())).toMatch(/Chưa thể gửi bàn giao:.*1 linh kiện chưa ghi dùng hoặc trả/);
      await act(async () => tree.unmount());
      ({ key: mockKey, snapshot: mockSnapshot } = createBaseSnapshot([received('used')]));
      tree = await render();
      expect(JSON.stringify(tree.toJSON())).toMatch(/không còn gì chặn gửi bàn giao/);
      await act(async () => tree.unmount());
    });

    it('records the exact used quantity of a custody line with its ledger version', async () => {
      mockGetReturns.mockResolvedValue([record()]);
      ({ key: mockKey, snapshot: mockSnapshot } = createBaseSnapshot([received('pending')]));
      const tree = await render();
      expect(JSON.stringify(tree.toJSON())).toMatch(/Số lượng 3/);
      expect(tree.root.findAll(byId('parts-usage-used-it-1'))).toHaveLength(0);
      await press(tree, byId('part-usage-open-it-1'));
      await press(tree, byLabel('Tăng số lượng đã dùng'));
      await press(tree, byLabel('Tăng số lượng đã dùng'));
      await press(tree, byId('part-usage-save-it-1'));
      expect(mockApiUsage).toHaveBeenCalledWith('pr-c', 'it-1', { usageStatus: 'used', usedQty: 2, expectedVersion: 4, idempotencyKey: expect.any(String) });
      expect(mockRefresh).toHaveBeenCalledWith('command-readback');
      await act(async () => tree.unmount());
    });

    it('declares a return of what is still owed and refuses more than that', async () => {
      mockGetReturns.mockResolvedValue([record({ usedQty: 1, outstandingQty: 2, usageRecorded: true })]);
      ({ key: mockKey, snapshot: mockSnapshot } = createBaseSnapshot([received('used')]));
      const tree = await render();
      await press(tree, byId('part-declare-open-it-1'));
      await press(tree, byLabel('Tăng số lượng trả'));
      await press(tree, byLabel('Tăng số lượng trả'));
      expect(tree.root.findAll(byLabel('Tăng số lượng trả'))[0].props.accessibilityState.disabled).toBe(true);
      await press(tree, byId('part-declare-send-it-1'));
      expect(mockDeclare).toHaveBeenCalledWith('pr-c', 'it-1', { quantity: 2, expectedVersion: 4, idempotencyKey: expect.any(String) });
      await act(async () => tree.unmount());
    });

    it('keeps the whole-line buttons when the custody ledger is unavailable', async () => {
      mockGetReturns.mockRejectedValue({ response: { status: 404 } });
      ({ key: mockKey, snapshot: mockSnapshot } = createBaseSnapshot([received('pending')]));
      const tree = await render();
      expect(tree.root.findAll(byId('parts-usage-used-it-1')).length).toBeGreaterThan(0);
      expect(JSON.stringify(tree.toJSON())).not.toMatch(/Chưa tải được số liệu hoàn trả/);
      await act(async () => tree.unmount());
    });
  });
});
