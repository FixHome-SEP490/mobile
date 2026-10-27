import React from 'react';
import { act, create } from 'react-test-renderer';
import type { OrderSessionKey, OrderSessionSnapshot, OrderPartReadModel } from '../domain/order-session.types';
import { createOrderSessionSnapshot, readyResource } from '../domain/order-session.types';
import { PartPickerRow } from '../shared/PartPickerRow';
import { fetchStrictPartById, fetchStrictCatalog } from './parts-catalog-adapter';
import AcceptedPartsScreen from './AcceptedPartsScreen';

let mockKey: OrderSessionKey;
let mockSnapshot: OrderSessionSnapshot;
let mockJournalList: unknown[] = [];
let mockState: any;
const mockCreatePreRepair = jest.fn();
const mockVerify = jest.fn();
const mockRefresh: jest.Mock = jest.fn(async () => {});
const mockLoadResource: jest.Mock = jest.fn(async () => {});
const mockNavigate: jest.Mock = jest.fn();
const mockGoBack: jest.Mock = jest.fn();

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
      createPreRepair: (...args: unknown[]) => mockCreatePreRepair(...args),
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
  useIsFocused: () => true,
}));

jest.mock('react-native-safe-area-context', () => {
  const Native = jest.requireActual('react-native');
  return { SafeAreaView: Native.View, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
});

jest.mock('../../../hooks/useKeyboardInset', () => ({ useKeyboardInset: () => 0 }));

jest.mock('./parts-catalog-adapter', () => ({
  fetchStrictCatalog: jest.fn(async () => ({
    data: [
      {
        id: '99999999-8888-4777-8666-000000000001',
        name: 'Van cấp nước',
        sellingPrice: 150000,
        warrantyDays: 90,
        warrantyPolicy: null,
        sku: 'VAN-01',
      },
    ],
    meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
  })),
  fetchStrictPartById: jest.fn(async (id: string) => ({
    id,
    name: 'Van cấp nước',
    sellingPrice: 150000,
    warrantyDays: 90,
    warrantyPolicy: null,
    sku: 'VAN-01',
  })),
}));

function createBaseSnapshot(partsList: OrderPartReadModel[] = [], orderStatus: string = 'ACCEPTED') {
  const key: OrderSessionKey = { userId: 'tech-1', role: 'technician', sessionGeneration: 1, serviceOrderId: 'order-1' };
  const snapshot = createOrderSessionSnapshot(key);
  snapshot.access = 'current';
  snapshot.order = readyResource(
    {
      id: 'order-1',
      code: 'SO-1',
      serviceName: 'Sửa máy giặt',
      status: orderStatus,
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

describe('AcceptedPartsScreen (T02a)', () => {
  const A = '99999999-8888-4777-8666-000000000001';
  const B = '99999999-8888-4777-8666-000000000002';
  const picked = (tree: any) => tree.root.findByType(PartPickerRow).props.picked.map((r: any) => r.partCatalogId);

  it('several parts can be picked, and a part unticked before its read returns never appears', async () => {
    ({ key: mockKey, snapshot: mockSnapshot } = createBaseSnapshot());
    let first!: (part: any) => void;
    let second!: (part: any) => void;
    let third!: (part: any) => void;
    jest.mocked(fetchStrictPartById).mockImplementationOnce(() => new Promise(r => { first = r; })).mockImplementationOnce(() => new Promise(r => { second = r; })).mockImplementationOnce(() => new Promise(r => { third = r; }));
    let tree: any;
    act(() => { tree = create(<AcceptedPartsScreen />); });
    const toggle = (id: string) => act(() => { tree.root.findByType(PartPickerRow).props.onToggle({ id }); });
    toggle(A); toggle(B);
    await act(async () => { second({ id: B, name: 'B', sellingPrice: 200000 }); });
    await act(async () => { first({ id: A, name: 'A', sellingPrice: 100000 }); });
    expect(picked(tree).sort()).toEqual([A, B]);
    toggle(A);
    expect(picked(tree)).toEqual([B]);
    toggle(A); toggle(A);
    await act(async () => { third({ id: A, name: 'A', sellingPrice: 100000 }); });
    expect(picked(tree)).toEqual([B]);
  });

  it('a failed read after a session switch cannot attach an error to the new draft', async () => {
    ({ key: mockKey, snapshot: mockSnapshot } = createBaseSnapshot());
    let fail!: (error: Error) => void;
    jest.mocked(fetchStrictPartById).mockImplementationOnce(() => new Promise((_r, reject) => { fail = reject; }));
    let tree: any;
    act(() => { tree = create(<AcceptedPartsScreen />); });
    act(() => { tree.root.findByType(PartPickerRow).props.onToggle({ id: A }); });
    mockKey = { ...mockKey, sessionGeneration: 2 };
    mockSnapshot = { ...mockSnapshot, key: mockKey };
    act(() => { tree.update(<AcceptedPartsScreen />); });
    await act(async () => { fail(new Error('Old session')); });
    expect(picked(tree)).toEqual([]);
    expect(JSON.stringify(tree.toJSON())).not.toContain('Không tải được linh kiện đã chọn');
  });
  it('settled parts-create does not lock fresh preparation', () => {
    ({ key: mockKey, snapshot: mockSnapshot } = createBaseSnapshot());
    mockJournalList = [{ userId: 'tech-1', role: 'technician', serviceOrderId: 'order-1', operation: 'parts-create', intentId: 'old', entityId: 'order-1', status: 'resolved' }];
    let tree: any;
    act(() => { tree = create(<AcceptedPartsScreen />); });
    expect(tree.root.findByProps({ testID: 'pre-parts-submit' }).props.disabled).toBe(false);
  });
  beforeEach(() => {
    jest.clearAllMocks();
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

  it('renders pre-repair parts screen with fulfillment methods', () => {
    const { key, snapshot } = createBaseSnapshot();
    mockKey = key;
    mockSnapshot = snapshot;

    let tree: any;
    act(() => {
      tree = create(<AcceptedPartsScreen />);
    });

    const root = tree.root;
    expect(root.findByProps({ testID: 'pre-parts-method-pickup' })).toBeTruthy();
    expect(root.findByProps({ testID: 'pre-parts-method-delivery' })).toBeTruthy();
    expect(root.findByProps({ testID: 'pre-parts-submit' })).toBeTruthy();
  });

  it('toggles fulfillment method between pickup and delivery', () => {
    const { key, snapshot } = createBaseSnapshot();
    mockKey = key;
    mockSnapshot = snapshot;

    let tree: any;
    act(() => {
      tree = create(<AcceptedPartsScreen />);
    });

    const root = tree.root;
    const deliveryBtn = root.findByProps({ testID: 'pre-parts-method-delivery' });

    act(() => {
      deliveryBtn.props.onPress();
    });

    expect(deliveryBtn.props.accessibilityState.selected).toBe(true);
  });

  it('blocks submission when part is not selected from catalog', () => {
    const { key, snapshot } = createBaseSnapshot();
    mockKey = key;
    mockSnapshot = snapshot;

    let tree: any;
    act(() => {
      tree = create(<AcceptedPartsScreen />);
    });

    const root = tree.root;
    const submitBtn = root.findByProps({ testID: 'pre-parts-submit' });

    act(() => {
      submitBtn.props.onPress();
    });

    expect(root.findAllByProps({ testID: 'pre-parts-confirm-sheet' }).length).toBe(0);
    expect(mockCreatePreRepair).not.toHaveBeenCalled();
  });

  it('submits pre-repair request after selecting part and confirming', async () => {
    const { key, snapshot } = createBaseSnapshot();
    mockKey = key;
    mockSnapshot = snapshot;

    let tree: any;
    act(() => {
      tree = create(<AcceptedPartsScreen />);
    });

    const root = tree.root;

    // Catalog loads on its own when the row opens: no "load" button to find.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(fetchStrictCatalog).toHaveBeenCalled();

    // Pick option
    const pickBtn = root.find((node: any) => node.props.testID && /catalog-option-99999999-8888-4777-8666-000000000001/.test(node.props.testID));
    expect(pickBtn).toBeTruthy();
    await act(async () => {
      pickBtn.props.onPress();
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    // Enter quantity
    const qtyInput = root.findByProps({ testID: 'pick-qty-99999999-8888-4777-8666-000000000001' });
    act(() => {
      qtyInput.props.onChangeText('2');
    });
    act(() => { root.findByProps({ testID: 'pre-parts-add-item' }).props.onPress(); });
    expect(JSON.stringify(tree.toJSON())).toContain('Van cấp nước');

    const submitBtn = root.findByProps({ testID: 'pre-parts-submit' });
    act(() => {
      submitBtn.props.onPress();
    });

    expect(root.findByProps({ testID: 'pre-parts-confirm-sheet' })).toBeTruthy();

    const confirmSubmitBtn = root.findByProps({ testID: 'pre-parts-confirm-submit' });
    act(() => {
      confirmSubmitBtn.props.onPress();
    });

    expect(mockCreatePreRepair).toHaveBeenCalledWith(
      mockKey,
      expect.objectContaining({
        fulfillmentMethod: 'pickup',
        items: [
          expect.objectContaining({
            partCatalogId: '99999999-8888-4777-8666-000000000001',
            quantity: 2,
          }),
        ],
      }),
    );
  });

  it('renders read-only notice when order is not ACCEPTED', () => {
    const { key, snapshot } = createBaseSnapshot([], 'EN_ROUTE');
    mockKey = key;
    mockSnapshot = snapshot;

    let tree: any;
    act(() => {
      tree = create(<AcceptedPartsScreen />);
    });

    const root = tree.root;
    expect(root.findAllByProps({ testID: 'pre-parts-submit' }).length).toBe(0);
  });

  it('blocks creating if active pre-repair already exists', () => {
    const activePreRepair: OrderPartReadModel = {
      id: 'pr-active',
      serviceOrderId: 'order-1',
      technicianId: 'tech-1',
      status: 'requested',
      requestType: 'pre_repair',
      items: [],
    };
    const { key, snapshot } = createBaseSnapshot([activePreRepair]);
    mockKey = key;
    mockSnapshot = snapshot;

    let tree: any;
    act(() => {
      tree = create(<AcceptedPartsScreen />);
    });

    const root = tree.root;
    const submitBtn = root.findByProps({ testID: 'pre-parts-submit' });
    expect(submitBtn.props.disabled).toBe(true);
  });
});

describe('AcceptedPartsScreen UX', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockJournalList = [];
    mockState = { phase: 'idle', operation: null, targetId: null, error: null, actionSuccess: null, resolvedEntityId: null };
  });

  it('empty submit says a part must be added instead of failing silently', () => {
    ({ key: mockKey, snapshot: mockSnapshot } = createBaseSnapshot());
    let tree: any;
    act(() => { tree = create(<AcceptedPartsScreen />); });
    act(() => { tree.root.findByProps({ testID: 'pre-parts-submit' }).props.onPress(); });
    expect(tree.root.findAllByProps({ testID: 'pre-parts-confirm-sheet' })).toHaveLength(0);
    expect(JSON.stringify(tree.toJSON())).toContain('Thêm ít nhất một linh kiện');
  });

  it('add stays disabled until a part is picked and the list shows its empty state', async () => {
    ({ key: mockKey, snapshot: mockSnapshot } = createBaseSnapshot());
    let tree: any;
    act(() => { tree = create(<AcceptedPartsScreen />); });
    expect(tree.root.findByProps({ testID: 'pre-parts-add-item' }).props.disabled).toBe(true);
    expect(tree.root.findByProps({ testID: 'pre-parts-empty' })).toBeTruthy();
  });

  it('adding the same part twice adds up its quantity and a part can be removed', async () => {
    ({ key: mockKey, snapshot: mockSnapshot } = createBaseSnapshot());
    let tree: any;
    act(() => { tree = create(<AcceptedPartsScreen />); });
    await act(async () => { await new Promise(r => setTimeout(r, 50)); });
    for (const qty of ['2', '3']) {
      await act(async () => { tree.root.find((n: any) => /catalog-option-99999999-8888-4777-8666-000000000001/.test(String(n.props.testID ?? ''))).props.onPress(); });
      await act(async () => { await new Promise(r => setTimeout(r, 50)); });
      act(() => { tree.root.findByProps({ testID: 'pick-qty-99999999-8888-4777-8666-000000000001' }).props.onChangeText(qty); });
      act(() => { tree.root.findByProps({ testID: 'pre-parts-add-item' }).props.onPress(); });
    }
    expect(tree.root.findAll((n: any) => /^pre-parts-item-/.test(String(n.props.testID ?? ''))).length).toBeGreaterThan(0);
    expect(JSON.stringify(tree.toJSON())).toContain('750.000');
    expect(tree.root.findByProps({ testID: 'pre-parts-summary' })).toBeTruthy();
    act(() => { tree.root.find((n: any) => /^pre-parts-remove-/.test(String(n.props.testID ?? ''))).props.onPress(); });
    expect(tree.root.findAll((n: any) => /^pre-parts-item-/.test(String(n.props.testID ?? '')))).toHaveLength(0);
  });

  it('confirmation lists the chosen part, quantity and receive method before sending', async () => {
    ({ key: mockKey, snapshot: mockSnapshot } = createBaseSnapshot());
    let tree: any;
    act(() => { tree = create(<AcceptedPartsScreen />); });
    await act(async () => { await new Promise(r => setTimeout(r, 50)); });
    await act(async () => { tree.root.find((n: any) => /catalog-option-99999999-8888-4777-8666-000000000001/.test(String(n.props.testID ?? ''))).props.onPress(); });
    await act(async () => { await new Promise(r => setTimeout(r, 50)); });
    act(() => { tree.root.findByProps({ testID: 'pick-qty-99999999-8888-4777-8666-000000000001' }).props.onChangeText('3'); });
    act(() => { tree.root.findByProps({ testID: 'pre-parts-add-item' }).props.onPress(); });
    act(() => { tree.root.findByProps({ testID: 'pre-parts-submit' }).props.onPress(); });
    const out = JSON.stringify(tree.toJSON());
    expect(tree.root.findByProps({ testID: 'pre-parts-confirm-sheet' })).toBeTruthy();
    expect(out).toContain('Van cấp nước');
    expect(out).toContain('× 3');
    expect(out).toContain('Tự lấy tại kho');
  });
});
