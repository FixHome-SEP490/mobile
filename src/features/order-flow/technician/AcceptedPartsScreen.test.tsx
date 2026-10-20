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
  it('catalog responses respect latest selection and source switch, including late failures', async () => {
    ({ key: mockKey, snapshot: mockSnapshot } = createBaseSnapshot());
    let first!: (part: any) => void;
    let second!: (part: any) => void;
    let fail!: (error: Error) => void;
    jest.mocked(fetchStrictPartById).mockImplementationOnce(() => new Promise(r => { first = r; })).mockImplementationOnce(() => new Promise(r => { second = r; })).mockImplementationOnce(() => new Promise((_r, reject) => { fail = reject; }));
    let tree: any;
    act(() => { tree = create(<AcceptedPartsScreen />); });
    let editor = tree.root.findByType(PartPickerRow);
    act(() => { editor.props.onChange({ ...editor.props.row, kind: 'parts_equipment', partSource: 'fixhome' }); });
    act(() => { tree.root.findByType(PartPickerRow).props.onSelectCatalogPart({ id: '99999999-8888-4777-8666-000000000001' }); });
    act(() => { tree.root.findByType(PartPickerRow).props.onSelectCatalogPart({ id: '99999999-8888-4777-8666-000000000002' }); });
    await act(async () => { second({ id: '99999999-8888-4777-8666-000000000002', name: 'Latest', sellingPrice: 200000 }); });
    await act(async () => { first({ id: '99999999-8888-4777-8666-000000000001', name: 'Old', sellingPrice: 100000 }); });
    expect(tree.root.findByType(PartPickerRow).props.row.partCatalogId).toBe('99999999-8888-4777-8666-000000000002');
    act(() => { tree.root.findByType(PartPickerRow).props.onSelectCatalogPart({ id: '99999999-8888-4777-8666-000000000003' }); });
    editor = tree.root.findByType(PartPickerRow);
    act(() => { editor.props.onChange({ ...editor.props.row, partSource: 'external', partCatalogId: '', unitPrice: '0' }); });
    await act(async () => { fail(new Error('Late failure')); });
    expect(tree.root.findByType(PartPickerRow).props.row.partSource).toBe('external');
    expect(tree.root.findByType(PartPickerRow).props.row.unitPrice).toBe('0');
    expect(JSON.stringify(tree.toJSON())).not.toContain('Không tải được linh kiện đã chọn');
  });

  it('catalog failure after a session switch cannot attach an error to the new draft', async () => {
    ({ key: mockKey, snapshot: mockSnapshot } = createBaseSnapshot());
    let fail!: (error: Error) => void;
    jest.mocked(fetchStrictPartById).mockImplementationOnce(() => new Promise((_r, reject) => { fail = reject; }));
    let tree: any;
    act(() => { tree = create(<AcceptedPartsScreen />); });
    const editor = tree.root.findByType(PartPickerRow);
    act(() => { editor.props.onChange({ ...editor.props.row, kind: 'parts_equipment', partSource: 'fixhome' }); });
    act(() => { tree.root.findByType(PartPickerRow).props.onSelectCatalogPart({ id: '99999999-8888-4777-8666-000000000001' }); });
    mockKey = { ...mockKey, sessionGeneration: 2 };
    mockSnapshot = { ...mockSnapshot, key: mockKey };
    act(() => { tree.update(<AcceptedPartsScreen />); });
    await act(async () => { fail(new Error('Old session')); });
    expect(tree.root.findByType(PartPickerRow).props.row.description).toBe('');
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
    const qtyInput = root.findByProps({ accessibilityLabel: 'Số lượng' });
    act(() => {
      qtyInput.props.onChangeText('2');
    });

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

  it('empty submit marks the row inline instead of failing silently', () => {
    ({ key: mockKey, snapshot: mockSnapshot } = createBaseSnapshot());
    let tree: any;
    act(() => { tree = create(<AcceptedPartsScreen />); });
    act(() => { tree.root.findByProps({ testID: 'pre-parts-submit' }).props.onPress(); });
    expect(tree.root.findAllByProps({ testID: 'pre-parts-confirm-sheet' })).toHaveLength(0);
    expect(JSON.stringify(tree.toJSON())).toContain('Chọn một linh kiện trong danh mục FixHome.');
    expect(JSON.stringify(tree.toJSON())).toContain('cần bổ sung thông tin');
  });

  it('confirmation lists the chosen part, quantity and receive method before sending', async () => {
    ({ key: mockKey, snapshot: mockSnapshot } = createBaseSnapshot());
    let tree: any;
    act(() => { tree = create(<AcceptedPartsScreen />); });
    await act(async () => { await new Promise(r => setTimeout(r, 50)); });
    await act(async () => { tree.root.find((n: any) => /catalog-option-99999999-8888-4777-8666-000000000001/.test(String(n.props.testID ?? ''))).props.onPress(); });
    await act(async () => { await new Promise(r => setTimeout(r, 50)); });
    act(() => { tree.root.findByProps({ accessibilityLabel: 'Số lượng' }).props.onChangeText('3'); });
    act(() => { tree.root.findByProps({ testID: 'pre-parts-submit' }).props.onPress(); });
    const out = JSON.stringify(tree.toJSON());
    expect(tree.root.findByProps({ testID: 'pre-parts-confirm-sheet' })).toBeTruthy();
    expect(out).toContain('Van cấp nước');
    expect(out).toContain('× 3');
    expect(out).toContain('Tự lấy tại kho');
  });
});
