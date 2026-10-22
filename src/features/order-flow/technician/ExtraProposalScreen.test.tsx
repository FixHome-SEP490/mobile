import React from 'react';
import { act, create } from 'react-test-renderer';
import type { OrderSessionKey, OrderSessionSnapshot } from '../domain/order-session.types';
import { createOrderSessionSnapshot, readyResource } from '../domain/order-session.types';
import ExtraProposalScreen from './ExtraProposalScreen';
import { PartPickerRow } from '../shared/PartPickerRow';
import { HeldPartCard, LaborCard } from './QuotationItemCards';
import { fetchStrictPartById } from './parts-catalog-adapter';
jest.mock('./parts-catalog-adapter', () => ({ fetchStrictCatalog: jest.fn(async () => ({ data: [] })), fetchStrictPartById: jest.fn() }));

let mockKey: OrderSessionKey;
let mockSnapshot: OrderSessionSnapshot;
let mockJournalList: unknown[] = [];
let mockState: any;
let mockRouteParams: any = {};
const mockCreateProposal: jest.Mock = jest.fn();
const mockReviseProposal: jest.Mock = jest.fn();
const mockVerify: jest.Mock = jest.fn();
const mockReset: jest.Mock = jest.fn();
const mockRefresh: jest.Mock = jest.fn(async () => {});
const mockLoadResource: jest.Mock = jest.fn(async () => {});
const mockNavigate: jest.Mock = jest.fn();
const mockGoBack: jest.Mock = jest.fn();
const mockSetParams: jest.Mock = jest.fn();

jest.mock('../runtime/OrderSessionProvider', () => ({
  useOrderSession: () => ({
    key: mockKey,
    snapshot: mockSnapshot,
    refresh: (...args: unknown[]) => mockRefresh(...args),
    loadResource: (...args: unknown[]) => mockLoadResource(...args),
    journal: { list: () => mockJournalList },
  }),
}));

jest.mock('./useTechnicianExtraCost', () => ({
  useTechnicianExtraCost: () => ({
    controller: {
      createProposal: (...args: unknown[]) => mockCreateProposal(...args),
      reviseProposal: (...args: unknown[]) => mockReviseProposal(...args),
      verify: (...args: unknown[]) => mockVerify(...args),
      reset: (...args: unknown[]) => mockReset(...args),
    },
    state: mockState,
  }),
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: (...args: unknown[]) => mockNavigate(...args),
    goBack: (...args: unknown[]) => mockGoBack(...args),
    setParams: (...args: unknown[]) => mockSetParams(...args),
  }),
  useRoute: () => ({ params: mockRouteParams }),
  useIsFocused: () => true,
}));

jest.mock('react-native-safe-area-context', () => {
  const Native = jest.requireActual('react-native');
  return { SafeAreaView: Native.View, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
});

jest.mock('../../../hooks/useKeyboardInset', () => ({ useKeyboardInset: () => 0 }));

function createBaseSnapshot(extrasList: any[] = [], orderOverrides: any = {}) {
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
      customerName: 'Khách hàng',
      technician: { id: 'tech-1', fullName: 'Thợ chính' },
      createdAt: '2026-10-14T00:00:00Z',
      ...orderOverrides,
    } as any,
    1,
    1,
  );
  snapshot.resources.extras = readyResource(extrasList, 1, 1);
  return { key, snapshot };
}

describe('ExtraProposalScreen (T10)', () => {
  const PART_A = '99999999-8888-4777-8666-000000000001';
  const PART_B = '99999999-8888-4777-8666-000000000002';
  const part = (id: string, name: string, sellingPrice: number) => ({ id, name, sellingPrice });
  const picker = (tree: any) => tree.root.findByType(PartPickerRow);
  /** Picks a stock part in the sheet, moves it into the proposal and drops the empty first labor row. */
  const addStockPart = async (tree: any, fixture: ReturnType<typeof part>, quantity = '1') => {
    jest.mocked(fetchStrictPartById).mockResolvedValueOnce(fixture as any);
    await act(async () => { picker(tree).props.onToggle({ id: fixture.id }); });
    const picked = picker(tree).props.picked[0];
    act(() => { picker(tree).props.onQuantity(picked.key, quantity); });
    act(() => { picker(tree).props.onAdd(); });
    act(() => { tree.root.findByType(LaborCard).props.onRemove(); });
  };

  it('a stock part unticked while loading never reaches the proposal, even when it fails late', async () => {
    ({ key: mockKey, snapshot: mockSnapshot } = createBaseSnapshot());
    let first!: (value: any) => void;
    let fail!: (error: Error) => void;
    jest.mocked(fetchStrictPartById)
      .mockImplementationOnce(() => new Promise(r => { first = r; }))
      .mockImplementationOnce(() => new Promise((_r, reject) => { fail = reject; }));
    let tree: any;
    act(() => { tree = create(<ExtraProposalScreen />); });
    act(() => { picker(tree).props.onToggle({ id: PART_A }); });
    act(() => { picker(tree).props.onToggle({ id: PART_A }); });
    act(() => { picker(tree).props.onToggle({ id: PART_B }); });
    act(() => { picker(tree).props.onToggle({ id: PART_B }); });
    await act(async () => { first(part(PART_A, 'Cũ', 100000)); });
    await act(async () => { fail(new Error('Late failure')); });
    expect(picker(tree).props.picked).toHaveLength(0);
    expect(JSON.stringify(tree.toJSON())).not.toContain('Không tải được linh kiện đã chọn');
  });

  it('a part failure after a session switch cannot attach an error to the new draft', async () => {
    ({ key: mockKey, snapshot: mockSnapshot } = createBaseSnapshot());
    let fail!: (error: Error) => void;
    jest.mocked(fetchStrictPartById).mockImplementationOnce(() => new Promise((_r, reject) => { fail = reject; }));
    let tree: any;
    act(() => { tree = create(<ExtraProposalScreen />); });
    act(() => { picker(tree).props.onToggle({ id: PART_A }); });
    mockKey = { ...mockKey, sessionGeneration: 2 };
    mockSnapshot = { ...mockSnapshot, key: mockKey };
    act(() => { tree.update(<ExtraProposalScreen />); });
    await act(async () => { fail(new Error('Old session')); });
    expect(tree.root.findByType(LaborCard).props.row.description).toBe('');
    expect(JSON.stringify(tree.toJSON())).not.toContain('Không tải được linh kiện đã chọn');
  });

  it('FixHome delivery rejects blank shipping and sends numeric fee and only owned private evidence', async () => {
    ({ key: mockKey, snapshot: mockSnapshot } = createBaseSnapshot());
    mockSnapshot.resources.evidence = readyResource([
      { id: 'own', serviceOrderId: 'order-1', uploaderId: 'tech-1', type: 'BEFORE', mediaUrl: 'https://res.cloudinary.com/fixture/image/authenticated/s--signature--/v1/own.jpg', createdAt: '' },
      { id: 'face', serviceOrderId: 'order-1', uploaderId: 'tech-1', type: 'CHECKIN_FACE', mediaUrl: 'https://res.cloudinary.com/fixture/image/authenticated/s--signature--/v1/face.jpg', createdAt: '' },
      { id: 'foreign', serviceOrderId: 'order-1', uploaderId: 'other', type: 'AFTER', mediaUrl: 'https://res.cloudinary.com/fixture/image/authenticated/s--signature--/v1/other.jpg', createdAt: '' },
      { id: 'public', serviceOrderId: 'order-1', uploaderId: 'tech-1', type: 'AFTER', mediaUrl: 'https://public.example/photo.jpg', createdAt: '' },
    ], 1, 1);
    let tree: any;
    act(() => { tree = create(<ExtraProposalScreen />); });
    act(() => { tree.root.findByProps({ testID: 'proposal-reason-input' }).props.onChangeText('Thay linh kiện'); });
    await addStockPart(tree, part(PART_A, 'Van', 100000), '2');
    act(() => { tree.root.findByProps({ testID: 'proposal-method-delivery' }).props.onPress(); });
    act(() => { tree.root.findByProps({ testID: 'proposal-submit' }).props.onPress(); });
    expect(tree.root.findAllByProps({ testID: 'proposal-confirm-sheet' })).toHaveLength(0);
    expect(tree.root.findAllByProps({ testID: 'proposal-evidence-face' })).toHaveLength(0);
    expect(tree.root.findAllByProps({ testID: 'proposal-evidence-foreign' })).toHaveLength(0);
    expect(tree.root.findAllByProps({ testID: 'proposal-evidence-public' })).toHaveLength(0);
    act(() => { tree.root.findByProps({ testID: 'proposal-shipping-fee' }).props.onChangeText('25000'); });
    act(() => { tree.root.findByProps({ testID: 'proposal-evidence-own' }).props.onPress(); });
    act(() => { tree.root.findByProps({ testID: 'proposal-submit' }).props.onPress(); });
    expect(tree.root.findByProps({ testID: 'proposal-confirm-submit' }).props.disabled).toBe(false);
    act(() => { tree.root.findByProps({ testID: 'proposal-confirm-submit' }).props.onPress(); });
    expect(mockCreateProposal).toHaveBeenCalledWith(mockKey, expect.objectContaining({ fulfillmentMethod: 'delivery', shippingFee: 25000, evidenceUrls: [mockSnapshot.resources.evidence.status === 'ready' ? mockSnapshot.resources.evidence.data[0].mediaUrl : ''] }));
  });

  it('a late part response cannot change a captured confirmation payload', async () => {
    ({ key: mockKey, snapshot: mockSnapshot } = createBaseSnapshot());
    let tree: any;
    act(() => { tree = create(<ExtraProposalScreen />); });
    act(() => { tree.root.findByProps({ testID: 'proposal-reason-input' }).props.onChangeText('Thay van'); });
    await addStockPart(tree, part(PART_A, 'Van gốc', 100000));
    let resolve!: (value: any) => void;
    jest.mocked(fetchStrictPartById).mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    act(() => { picker(tree).props.onToggle({ id: PART_B }); });
    act(() => { tree.root.findByProps({ testID: 'proposal-submit' }).props.onPress(); });
    await act(async () => { resolve(part(PART_B, 'Van mới', 999000)); });
    act(() => { tree.root.findByProps({ testID: 'proposal-confirm-submit' }).props.onPress(); });
    expect(mockCreateProposal).toHaveBeenCalledWith(mockKey, expect.objectContaining({ items: [expect.objectContaining({ unitPrice: 100000, partCatalogId: PART_A })] }));
  });

  it('a confirmed payload cannot be sent into a new session scope', () => {
    ({ key: mockKey, snapshot: mockSnapshot } = createBaseSnapshot());
    let tree: any;
    act(() => { tree = create(<ExtraProposalScreen />); });
    act(() => { tree.root.findByProps({ testID: 'proposal-reason-input' }).props.onChangeText('Công phát sinh'); });
    const labor = tree.root.findByType(LaborCard);
    act(() => { labor.props.onChange({ ...labor.props.row, description: 'Công', quantity: '1', unitPrice: '0' }); });
    act(() => { tree.root.findByProps({ testID: 'proposal-submit' }).props.onPress(); });
    const stale = tree.root.findByProps({ testID: 'proposal-confirm-submit' }).props.onPress;
    mockKey = { ...mockKey, sessionGeneration: 2 };
    mockSnapshot = { ...mockSnapshot, key: mockKey };
    act(() => { tree.update(<ExtraProposalScreen />); });
    act(() => { stale(); });
    expect(mockCreateProposal).not.toHaveBeenCalled();
    expect(tree.root.findByProps({ testID: 'proposal-reason-input' }).props.value).toBe('');
  });
  it('a settled creation marker does not freeze a fresh proposal', () => {
    ({ key: mockKey, snapshot: mockSnapshot } = createBaseSnapshot());
    mockJournalList = [{ userId: 'tech-1', role: 'technician', serviceOrderId: 'order-1', operation: 'extra-create', intentId: 'old', entityId: 'order-1', status: 'resolved' }];
    let tree: any;
    act(() => { tree = create(<ExtraProposalScreen />); });
    expect(tree.root.findByProps({ testID: 'proposal-reason-input' }).props.editable).toBe(true);
    expect(tree.root.findAllByProps({ testID: 'proposal-verify' })).toHaveLength(0);
  });

  it('keeps only digits in the labor price field', () => {
    ({ key: mockKey, snapshot: mockSnapshot } = createBaseSnapshot());
    let tree: any;
    act(() => { tree = create(<ExtraProposalScreen />); });
    act(() => { tree.root.findByProps({ accessibilityLabel: 'Đơn giá' }).props.onChangeText('1.5e3'); });
    expect(tree.root.findByProps({ accessibilityLabel: 'Đơn giá' }).props.value).toBe('153');
  });

  it.each(['', '1000000000'])('rejects invalid money %p without creating a confirm', price => {
    ({ key: mockKey, snapshot: mockSnapshot } = createBaseSnapshot());
    let tree: any;
    act(() => { tree = create(<ExtraProposalScreen />); });
    act(() => { tree.root.findByProps({ testID: 'proposal-reason-input' }).props.onChangeText('Cần thay'); });
    act(() => { tree.root.findByProps({ accessibilityLabel: 'Nội dung công việc' }).props.onChangeText('Tiền công'); });
    act(() => { tree.root.findByProps({ accessibilityLabel: 'Số lượng' }).props.onChangeText('1'); });
    act(() => { tree.root.findByProps({ accessibilityLabel: 'Đơn giá' }).props.onChangeText(price); });
    act(() => { tree.root.findByProps({ testID: 'proposal-submit' }).props.onPress(); });
    expect(tree.root.findAllByProps({ testID: 'proposal-confirm-sheet' })).toHaveLength(0);
    expect(mockCreateProposal).not.toHaveBeenCalled();
  });

  it('prefills only the exact revision and preserves valid metadata', () => {
    mockRouteParams = { proposalId: 'cost-exact' };
    ({ key: mockKey, snapshot: mockSnapshot } = createBaseSnapshot([{ id: 'cost-exact', serviceOrderId: 'order-1', technicianId: 'tech-1', status: 'PENDING_APPROVAL', expiresAt: '2099-01-01', reason: 'Lý do gốc', items: [{ id: 'line', type: 'labor', description: 'Tiền công gốc', quantity: 2, unitPrice: 150000, warrantyDays: 90 }] }]));
    let tree: any;
    act(() => { tree = create(<ExtraProposalScreen />); });
    expect(tree.root.findByProps({ testID: 'proposal-reason-input' }).props.value).toBe('Lý do gốc');
    expect(tree.root.findByProps({ accessibilityLabel: 'Nội dung công việc' }).props.value).toBe('Tiền công gốc');
  });

  it('a missing revision target never becomes an editable blank revision', () => {
    mockRouteParams = { proposalId: 'missing' };
    ({ key: mockKey, snapshot: mockSnapshot } = createBaseSnapshot());
    let tree: any;
    act(() => { tree = create(<ExtraProposalScreen />); });
    expect(tree.root.findAllByProps({ testID: 'proposal-reason-input' })).toHaveLength(0);
  });
  beforeEach(() => {
    jest.clearAllMocks();
    mockJournalList = [];
    mockRouteParams = {};
    mockState = {
      phase: 'idle',
      operation: null,
      targetId: null,
      revisingId: null,
      error: null,
      actionSuccess: null,
      resolvedEntityId: null,
    };
  });

  it('renders extra proposal form with initial labor row and estimate', () => {
    const { key, snapshot } = createBaseSnapshot();
    mockKey = key;
    mockSnapshot = snapshot;

    let tree: any;
    act(() => {
      tree = create(<ExtraProposalScreen />);
    });

    const root = tree.root;
    expect(root.findByProps({ testID: 'proposal-reason-input' })).toBeTruthy();
    expect(root.findByProps({ testID: 'proposal-submit' })).toBeTruthy();
    expect(root.findByProps({ testID: 'proposal-estimate-total' })).toBeTruthy();
  });

  it('validates empty reason and blocks submission', () => {
    const { key, snapshot } = createBaseSnapshot();
    mockKey = key;
    mockSnapshot = snapshot;

    let tree: any;
    act(() => {
      tree = create(<ExtraProposalScreen />);
    });

    const root = tree.root;
    const submitBtn = root.findByProps({ testID: 'proposal-submit' });

    act(() => {
      submitBtn.props.onPress();
    });

    // Confirmation should not appear because reason is empty
    expect(root.findAllByProps({ testID: 'proposal-confirm-sheet' }).length).toBe(0);
    expect(mockCreateProposal).not.toHaveBeenCalled();
  });

  it('submits new proposal after confirming', () => {
    const { key, snapshot } = createBaseSnapshot();
    mockKey = key;
    mockSnapshot = snapshot;

    let tree: any;
    act(() => {
      tree = create(<ExtraProposalScreen />);
    });

    const root = tree.root;
    const reasonInput = root.findByProps({ testID: 'proposal-reason-input' });

    act(() => {
      reasonInput.props.onChangeText('Cần thay tụ điện bị chập cháy');
    });

    // Row description & price
    const descInput = root.findByProps({ accessibilityLabel: 'Nội dung công việc' });
    const priceInput = root.findByProps({ accessibilityLabel: 'Đơn giá' });
    const qtyInput = root.findByProps({ accessibilityLabel: 'Số lượng' });

    act(() => {
      descInput.props.onChangeText('Công thay tụ');
    });
    act(() => {
      priceInput.props.onChangeText('150000');
    });
    act(() => {
      qtyInput.props.onChangeText('1');
    });

    const submitBtn = root.findByProps({ testID: 'proposal-submit' });
    act(() => {
      submitBtn.props.onPress();
    });

    // Confirm sheet visible
    expect(root.findByProps({ testID: 'proposal-confirm-sheet' })).toBeTruthy();

    const confirmSubmitBtn = root.findByProps({ testID: 'proposal-confirm-submit' });
    act(() => {
      confirmSubmitBtn.props.onPress();
    });

    expect(mockCreateProposal).toHaveBeenCalledWith(
      mockKey,
      expect.objectContaining({
        reason: 'Cần thay tụ điện bị chập cháy',
        items: expect.arrayContaining([
          expect.objectContaining({
            description: 'Công thay tụ',
            unitPrice: 150000,
          }),
        ]),
      }),
    );
  });

  it('submits revision when route param has proposalId and target is valid', () => {
    const existingCost = {
      id: 'cost-pending-1',
      serviceOrderId: 'order-1',
      technicianId: 'tech-1',
      status: 'PENDING_APPROVAL',
      reason: 'Bản cũ',
      expiresAt: '2099-10-15T00:00:00Z',
      items: [],
    };
    const { key, snapshot } = createBaseSnapshot([existingCost]);
    mockKey = key;
    mockSnapshot = snapshot;
    mockRouteParams = { proposalId: 'cost-pending-1' };

    let tree: any;
    act(() => {
      tree = create(<ExtraProposalScreen />);
    });

    const root = tree.root;
    const reasonInput = root.findByProps({ testID: 'proposal-reason-input' });
    act(() => {
      reasonInput.props.onChangeText('Sửa lý do và thêm linh kiện');
    });

    const descInput = root.findByProps({ accessibilityLabel: 'Nội dung công việc' });
    const priceInput = root.findByProps({ accessibilityLabel: 'Đơn giá' });
    const qtyInput = root.findByProps({ accessibilityLabel: 'Số lượng' });
    act(() => {
      descInput.props.onChangeText('Công kiểm tra lại');
    });
    act(() => {
      priceInput.props.onChangeText('100000');
    });
    act(() => {
      qtyInput.props.onChangeText('1');
    });

    const submitBtn = root.findByProps({ testID: 'proposal-submit' });
    act(() => {
      submitBtn.props.onPress();
    });

    const confirmSubmitBtn = root.findByProps({ testID: 'proposal-confirm-submit' });
    act(() => {
      confirmSubmitBtn.props.onPress();
    });

    expect(mockReviseProposal).toHaveBeenCalledWith(
      mockKey,
      'cost-pending-1',
      expect.objectContaining({
        reason: 'Sửa lý do và thêm linh kiện',
      }),
    );
  });

  it('blocks revision if target cost is expired or not pending', () => {
    const expiredCost = {
      id: 'cost-expired-1',
      serviceOrderId: 'order-1',
      technicianId: 'tech-1',
      status: 'PENDING_APPROVAL',
      reason: 'Hết hạn',
      expiresAt: '2020-01-01T00:00:00Z',
      items: [],
    };
    const { key, snapshot } = createBaseSnapshot([expiredCost]);
    mockKey = key;
    mockSnapshot = snapshot;
    mockRouteParams = { proposalId: 'cost-expired-1' };

    let tree: any;
    act(() => {
      tree = create(<ExtraProposalScreen />);
    });

    const root = tree.root;
    expect(root.findAllByProps({ testID: 'proposal-submit' }).length).toBe(0);
  });

  it('cancels confirmation without sending', () => {
    const { key, snapshot } = createBaseSnapshot();
    mockKey = key;
    mockSnapshot = snapshot;

    let tree: any;
    act(() => {
      tree = create(<ExtraProposalScreen />);
    });

    const root = tree.root;
    act(() => {
      root.findByProps({ testID: 'proposal-reason-input' }).props.onChangeText('Lý do');
    });
    act(() => {
      root.findByProps({ accessibilityLabel: 'Nội dung công việc' }).props.onChangeText('Mô tả');
    });
    act(() => {
      root.findByProps({ accessibilityLabel: 'Đơn giá' }).props.onChangeText('100000');
    });
    act(() => {
      root.findByProps({ accessibilityLabel: 'Số lượng' }).props.onChangeText('1');
    });

    act(() => {
      root.findByProps({ testID: 'proposal-submit' }).props.onPress();
    });

    expect(root.findByProps({ testID: 'proposal-confirm-sheet' })).toBeTruthy();

    const cancelBtn = root.findByProps({ testID: 'proposal-confirm-cancel' });
    act(() => {
      cancelBtn.props.onPress();
    });

    expect(root.findAllByProps({ testID: 'proposal-confirm-sheet' }).length).toBe(0);
    expect(mockCreateProposal).not.toHaveBeenCalled();
  });

  it('after-capture entry carries typed proposal mode and reloads owned evidence on return', () => {
    mockRouteParams = {};
    ({ key: mockKey, snapshot: mockSnapshot } = createBaseSnapshot());
    mockSnapshot.resources.evidence = readyResource([], 1, 1);
    let tree: any;
    act(() => { tree = create(<ExtraProposalScreen />); });
    act(() => { tree.root.findByProps({ testID: 'proposal-reason-input' }).props.onChangeText('Thay van sau sửa chữa'); });
    act(() => { tree.root.findByProps({ testID: 'proposal-capture-after' }).props.onPress(); });
    expect(mockNavigate).toHaveBeenCalledWith('AfterEvidence', { fromProposal: true });
    expect(mockCreateProposal).not.toHaveBeenCalled();
    // Explicit return from capture: draft reason survives, evidence reloads once.
    mockLoadResource.mockClear();
    mockSetParams.mockClear();
    mockRouteParams = { capturedAfter: true };
    act(() => { tree.update(<ExtraProposalScreen />); });
    expect(mockLoadResource).toHaveBeenCalledWith('evidence');
    expect(mockSetParams).toHaveBeenCalledWith({ capturedAfter: undefined });
    expect(tree.root.findByProps({ testID: 'proposal-reason-input' }).props.value).toBe('Thay van sau sửa chữa');
    expect(mockCreateProposal).not.toHaveBeenCalled();
  });

  it('returned evidence admits only authorized before/after server assets', () => {
    mockRouteParams = { capturedAfter: true };
    ({ key: mockKey, snapshot: mockSnapshot } = createBaseSnapshot());
    mockSnapshot.resources.evidence = readyResource([
      { id: 'new-after', serviceOrderId: 'order-1', uploaderId: 'tech-1', type: 'AFTER', mediaUrl: 'https://res.cloudinary.com/fixture/image/authenticated/s--new--/v1/new-after.jpg', createdAt: '' },
      { id: 'face', serviceOrderId: 'order-1', uploaderId: 'tech-1', type: 'CHECKIN_FACE', mediaUrl: 'https://res.cloudinary.com/fixture/image/authenticated/s--signature--/v1/face.jpg', createdAt: '' },
    ], 1, 1);
    let tree: any;
    act(() => { tree = create(<ExtraProposalScreen />); });
    expect(tree.root.findByProps({ testID: 'proposal-evidence-new-after' })).toBeTruthy();
    expect(tree.root.findAllByProps({ testID: 'proposal-evidence-face' })).toHaveLength(0);
  });
});

describe('ExtraProposalScreen UX', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockJournalList = [];
    mockRouteParams = {};
    mockState = { phase: 'idle', operation: null, targetId: null, revisingId: null, error: null, actionSuccess: null, resolvedEntityId: null };
  });

  it('shows the missing reason and bad rows inline and keeps the total unknown until rows are valid', () => {
    ({ key: mockKey, snapshot: mockSnapshot } = createBaseSnapshot());
    let tree: any;
    act(() => { tree = create(<ExtraProposalScreen />); });
    expect(tree.root.findByProps({ testID: 'proposal-estimate-total' }).props.accessibilityLabel).toContain('chưa xác định');
    act(() => { tree.root.findByProps({ testID: 'proposal-submit' }).props.onPress(); });
    expect(tree.root.findByProps({ testID: 'proposal-reason-error' })).toBeTruthy();
    expect(JSON.stringify(tree.toJSON())).toContain('Nhập mô tả hạng mục.');
    expect(tree.root.findAllByProps({ testID: 'proposal-confirm-sheet' })).toHaveLength(0);
  });

  it('total follows the rows and the confirmation reads back every line', () => {
    ({ key: mockKey, snapshot: mockSnapshot } = createBaseSnapshot());
    let tree: any;
    act(() => { tree = create(<ExtraProposalScreen />); });
    act(() => { tree.root.findByProps({ testID: 'proposal-reason-input' }).props.onChangeText('Thay tụ'); });
    act(() => { tree.root.findByProps({ accessibilityLabel: 'Nội dung công việc' }).props.onChangeText('Công thay tụ'); });
    act(() => { tree.root.findByProps({ accessibilityLabel: 'Số lượng' }).props.onChangeText('2'); });
    act(() => { tree.root.findByProps({ accessibilityLabel: 'Đơn giá' }).props.onChangeText('150000'); });
    expect(tree.root.findByProps({ testID: 'proposal-estimate-total' }).props.accessibilityLabel).toContain('300.000');
    act(() => { tree.root.findByProps({ testID: 'proposal-submit' }).props.onPress(); });
    const out = JSON.stringify(tree.toJSON());
    expect(out).toContain('Công thay tụ');
    expect(out).toContain('Thay tụ');
    expect(tree.root.findAllByProps({ testID: 'proposal-reason-input' })).toHaveLength(0);
  });

  it('lists received FixHome parts that are not used yet, and hides used or returned ones', () => {
    ({ key: mockKey, snapshot: mockSnapshot } = createBaseSnapshot());
    mockSnapshot.resources.parts = readyResource([
      { id: 'pr-1', serviceOrderId: 'order-1', technicianId: 'tech-1', requestType: 'pre_repair', status: 'received', items: [
        { id: 'i-1', partNameSnapshot: 'Co đồng 90° Φ10', quantity: 2, partSource: 'fixhome', usageStatus: 'pending' },
        { id: 'i-2', partNameSnapshot: 'Co đồng 90° Φ12', quantity: 2, partSource: 'fixhome', usageStatus: 'used' },
        { id: 'i-3', partNameSnapshot: 'Ống đồng', quantity: 1, partSource: 'fixhome', usageStatus: 'returned' },
      ] },
      { id: 'pr-2', serviceOrderId: 'order-1', technicianId: 'tech-1', requestType: 'quotation', status: 'requested', items: [
        { id: 'i-4', partNameSnapshot: 'Chưa nhận', quantity: 1, partSource: 'fixhome', usageStatus: 'pending' },
      ] },
    ] as any, 1, 1);
    mockSnapshot.resources.quotations = readyResource([], 1, 1);
    let tree: any;
    act(() => { tree = create(<ExtraProposalScreen />); });
    const rows = tree.root.findAllByProps({ testID: 'held-part-row' }).filter((n: any) => typeof n.type === 'string' || n.props.accessibilityLabel);
    const labels = JSON.stringify(tree.toJSON());
    expect(labels).toContain('Co đồng 90° Φ10');
    expect(labels).not.toContain('Co đồng 90° Φ12');
    expect(labels).not.toContain('Ống đồng');
    expect(labels).not.toContain('Chưa nhận');
    expect(rows.length).toBeGreaterThan(0);
  });

  it('lets the technician tick a part they still hold and sends it with the quantity left', async () => {
    const PART_A = '99999999-8888-4777-8666-000000000001';
    const part = (id: string, name: string, sellingPrice: number) => ({ id, name, sellingPrice });
    ({ key: mockKey, snapshot: mockSnapshot } = createBaseSnapshot());
    mockSnapshot.resources.parts = readyResource([
      { id: 'pr-1', serviceOrderId: 'order-1', technicianId: 'tech-1', requestType: 'pre_repair', status: 'received', items: [
        { id: 'i-1', partCatalogId: PART_A, partNameSnapshot: 'Co đồng 90° Φ10', quantity: 2, partSource: 'fixhome', usageStatus: 'pending' },
      ] },
    ] as any, 1, 1);
    mockSnapshot.resources.quotations = readyResource([
      { id: 'q-1', serviceOrderId: 'order-1', status: 'APPROVED', items: [{ type: 'PARTS', description: 'x', quantity: 1, unitPrice: 1, partSource: 'fixhome', partCatalogId: PART_A }] },
    ] as any, 1, 1);
    jest.mocked(fetchStrictPartById).mockResolvedValueOnce(part(PART_A, 'Co đồng 90° Φ10', 30000) as any);
    let tree: any;
    act(() => { tree = create(<ExtraProposalScreen />); });
    expect(tree.root.findByType(HeldPartCard).props.available).toBe(1);
    act(() => { tree.root.findByProps({ testID: 'proposal-reason-input' }).props.onChangeText('Thay co'); });
    await act(async () => { tree.root.findByType(HeldPartCard).props.onToggle(); });
    act(() => { tree.root.findByType(LaborCard).props.onRemove(); });
    act(() => { tree.root.findByProps({ testID: 'proposal-submit' }).props.onPress(); });
    act(() => { tree.root.findByProps({ testID: 'proposal-confirm-submit' }).props.onPress(); });
    expect(mockCreateProposal).toHaveBeenCalledWith(mockKey, expect.objectContaining({
      items: [expect.objectContaining({ partCatalogId: PART_A, quantity: 1, unitPrice: 30000, partSource: 'fixhome' })],
    }));
  });

  it('adds labor rows in the list and opens the stock picker for parts', () => {
    ({ key: mockKey, snapshot: mockSnapshot } = createBaseSnapshot());
    let tree: any;
    act(() => { tree = create(<ExtraProposalScreen />); });
    expect(tree.root.findAllByType(LaborCard)).toHaveLength(1);
    act(() => { tree.root.findByProps({ testID: 'proposal-add-labor' }).props.onPress(); });
    expect(tree.root.findAllByType(LaborCard)).toHaveLength(2);
    expect(tree.root.findAllByType(PartPickerRow)).toHaveLength(1);
    act(() => { tree.root.findByProps({ testID: 'proposal-add-parts' }).props.onPress(); });
    expect(tree.root.findAllByType(LaborCard)).toHaveLength(2);
  });
});
