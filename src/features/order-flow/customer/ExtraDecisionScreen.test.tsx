import React from 'react';
import { act, create } from 'react-test-renderer';
import type { OrderSessionKey, OrderSessionSnapshot } from '../domain/order-session.types';
import { createOrderSessionSnapshot, readyResource } from '../domain/order-session.types';
import ExtraDecisionScreen from './ExtraDecisionScreen';
import { createCustomerExtraCostDecisionController } from './customer-extra-cost-controller';
import { createOrderCommandJournal } from '../runtime/order-command-journal';
let mockActualController: ReturnType<typeof createCustomerExtraCostDecisionController> | null = null;

const COST_ID_1 = 'extra-cost-1';
const COST_ID_2 = 'extra-cost-2';
const WARRANTY_ITEM_ID = 'item-warranty-1';

let mockKey: OrderSessionKey;
let mockSnapshot: OrderSessionSnapshot;
let mockJournalList: unknown[] = [];
let mockState: any;
const mockToggleWarranty = jest.fn();
const mockPrepareDecision = jest.fn();
const mockSubmitDecision = jest.fn();
const mockVerify = jest.fn();
const mockReset = jest.fn();
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

jest.mock('./useCustomerExtraCostDecision', () => ({
  useCustomerExtraCostDecision: () => ({
    controller: mockActualController ?? {
      toggleWarranty: (...args: unknown[]) => mockToggleWarranty(...args),
      prepareDecision: (...args: unknown[]) => mockPrepareDecision(...args),
      submitDecision: (...args: unknown[]) => mockSubmitDecision(...args),
      verify: (...args: unknown[]) => mockVerify(...args),
      reset: (...args: unknown[]) => mockReset(...args),
    },
    state: mockActualController?.getState() ?? mockState,
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

function createBaseSnapshot(extrasList: any[] = []) {
  const key: OrderSessionKey = { userId: 'cust-1', role: 'customer', sessionGeneration: 1, serviceOrderId: 'order-1' };
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
    } as any,
    1,
    1,
  );
  snapshot.resources.extras = readyResource(extrasList, 1, 1);
  return { key, snapshot };
}

describe('ExtraDecisionScreen (C07)', () => {
  it('real frozen controller preserves opt-in on first approval and can reject the next root without warranty', async () => {
    const itemId = '99999999-8888-4777-8666-000000000001';
    const costs = [COST_ID_1, COST_ID_2].map(id => ({ id, serviceOrderId: 'order-1', status: 'PENDING_APPROVAL', expiresAt: '2099-01-01', reason: 'Thay van', totalLaborDelta: 0, totalPartsDelta: 100000, items: [{ id: itemId, type: 'parts_equipment', description: 'Van', partSource: 'technician', partWarrantyOption: 'paid_warranty', warrantyFee: 20000, warrantyTermDays: 90, quantity: 2, unitPrice: 50000 }] }));
    ({ key: mockKey, snapshot: mockSnapshot } = createBaseSnapshot(costs));
    const journal = createOrderCommandJournal({ getItem: async () => null, setItem: async () => {} });
    await journal.restore();
    const approve = jest.fn(async (id: string, _ids?: string[]) => { costs.find(c => c.id === id)!.status = 'APPROVED'; });
    const reject = jest.fn(async (id: string) => { costs.find(c => c.id === id)!.status = 'REJECTED'; });
    mockActualController = createCustomerExtraCostDecisionController({ journal, isCurrent: () => true, readCoordinator: { getSnapshot: () => mockSnapshot, refreshOrderSession: async () => {}, loadResource: async () => {} } as any, transport: { approveCost: approve, rejectCost: reject, getAdditionalCosts: async () => costs as any } });
    let tree: any;
    act(() => { tree = create(<ExtraDecisionScreen />); });
    act(() => { tree.root.findByProps({ testID: `extra-toggle-warranty-${itemId}` }).props.onPress(); });
    act(() => { tree.root.findByProps({ testID: 'extra-approve' }).props.onPress(); });
    await act(async () => { await tree.root.findByProps({ testID: 'extra-confirm-submit' }).props.onPress(); });
    expect(approve).toHaveBeenCalledWith(COST_ID_1, [itemId]);
    expect(mockActualController.getState().phase).toBe('resolved');
    mockSnapshot = { ...mockSnapshot, resources: { ...mockSnapshot.resources, extras: readyResource([...costs] as any, 2, 2) } };
    act(() => { tree.update(<ExtraDecisionScreen />); });
    expect(tree.root.findByProps({ testID: 'extra-approve' }).props.disabled).toBe(false);
    expect(tree.root.findByProps({ testID: `extra-toggle-warranty-${itemId}` }).props.accessibilityState.checked).toBe(false);
    act(() => { tree.root.findByProps({ testID: 'extra-reject' }).props.onPress(); });
    await act(async () => { await tree.root.findByProps({ testID: 'extra-confirm-submit' }).props.onPress(); });
    expect(reject).toHaveBeenCalledWith(COST_ID_2, undefined);
    expect(mockActualController.getState().selectedWarrantyIds).toEqual([]);
  });
  it('preserves an eligible opt-in through prepare and rejects stale confirmed handlers', () => {
    const itemId = '99999999-8888-4777-8666-000000000001';
    const costs = [COST_ID_1, COST_ID_2].map(id => ({ id, serviceOrderId: 'order-1', status: 'PENDING_APPROVAL', reason: 'Thay linh kiện', expiresAt: '2099-01-01', totalLaborDelta: 0, totalPartsDelta: 100000, items: [{ id: itemId, type: 'parts_equipment', partSource: 'technician', partWarrantyOption: 'paid_warranty', warrantyTermDays: 90, warrantyFee: 20000, description: 'Tụ', quantity: 2, unitPrice: 50000 }] }));
    ({ key: mockKey, snapshot: mockSnapshot } = createBaseSnapshot(costs));
    let tree: any;
    act(() => { tree = create(<ExtraDecisionScreen />); });
    const toggle = tree.root.findByProps({ testID: `extra-toggle-warranty-${itemId}` });
    expect(toggle.props.accessibilityState.checked).toBe(false);
    act(() => { toggle.props.onPress(); });
    act(() => { tree.root.findByProps({ testID: 'extra-approve' }).props.onPress(); });
    expect(mockPrepareDecision).toHaveBeenCalledWith(mockKey, COST_ID_1, 'approve');
    expect(mockToggleWarranty).toHaveBeenCalledWith(itemId);
    const staleSubmit = tree.root.findByProps({ testID: 'extra-confirm-submit' }).props.onPress;
    act(() => { tree.root.findByProps({ testID: `extra-select-proposal-${COST_ID_2}` }).props.onPress(); });
    act(() => { staleSubmit(); });
    expect(mockSubmitDecision).not.toHaveBeenCalled();
  });

  it('does not label the next independent pending proposal as resolved', () => {
    ({ key: mockKey, snapshot: mockSnapshot } = createBaseSnapshot([{ id: COST_ID_2, serviceOrderId: 'order-1', status: 'PENDING_APPROVAL', reason: 'Công', expiresAt: '2099-01-01', items: [] }]));
    mockState = { ...mockState, phase: 'resolved', targetCostId: COST_ID_1, actionSuccess: 'Đã duyệt chi phí phát sinh thành công!' };
    let tree: any;
    act(() => { tree = create(<ExtraDecisionScreen />); });
    expect(tree.root.findByProps({ testID: 'extra-approve' }).props.disabled).toBe(false);
    expect(JSON.stringify(tree.toJSON())).not.toContain('Đã duyệt chi phí phát sinh thành công!');
  });
  beforeEach(() => {
    jest.clearAllMocks();
    mockActualController = null;
    mockJournalList = [];
    mockState = {
      phase: 'idle',
      operation: null,
      targetCostId: null,
      action: null,
      selectedWarrantyIds: [],
      eligibleWarrantyOptions: [],
      error: null,
      actionSuccess: null,
      resolvedEntityId: null,
    };
  });

  it('renders pending extra cost proposal with items and total', () => {
    const singleProposal = [
      {
        id: COST_ID_1,
        serviceOrderId: 'order-1',
        technicianId: 'tech-1',
        status: 'PENDING_APPROVAL',
        reason: 'Hỏng van áp suất gas',
        totalAmount: 350000,
        expiresAt: '2026-10-15T00:00:00Z',
        items: [
          {
            id: 'item-1',
            type: 'labor',
            description: 'Công thay van áp suất',
            quantity: 1,
            unitPrice: 150000,
            lineTotal: 150000,
          },
          {
            id: WARRANTY_ITEM_ID,
            type: 'parts_equipment',
            description: 'Van áp suất mới',
            quantity: 1,
            unitPrice: 200000,
            lineTotal: 200000,
            partWarrantyOption: 'paid_warranty',
            warrantyFee: 20000,
            warrantyDaysSnapshot: 90,
          },
        ],
      },
    ];

    const { key, snapshot } = createBaseSnapshot(singleProposal);
    mockKey = key;
    mockSnapshot = snapshot;

    let tree: any;
    act(() => {
      tree = create(<ExtraDecisionScreen />);
    });

    const root = tree.root;
    expect(root.findByProps({ testID: 'extra-approve' })).toBeTruthy();
    expect(root.findByProps({ testID: 'extra-reject' })).toBeTruthy();
    expect(root.findByProps({ testID: 'extra-total-amount' })).toBeTruthy();
  });

  it('supports selecting between multiple independent pending proposals', () => {
    const multipleProposals = [
      {
        id: COST_ID_1,
        serviceOrderId: 'order-1',
        technicianId: 'tech-1',
        status: 'PENDING_APPROVAL',
        reason: 'Phát sinh 1',
        totalAmount: 100000,
        expiresAt: '2026-10-15T00:00:00Z',
        items: [{ id: 'item-1', type: 'labor', description: 'Công 1', quantity: 1, unitPrice: 100000 }],
      },
      {
        id: COST_ID_2,
        serviceOrderId: 'order-1',
        technicianId: 'tech-1',
        status: 'PENDING_APPROVAL',
        reason: 'Phát sinh 2',
        totalAmount: 200000,
        expiresAt: '2026-10-15T00:00:00Z',
        items: [{ id: 'item-2', type: 'labor', description: 'Công 2', quantity: 1, unitPrice: 200000 }],
      },
    ];

    const { key, snapshot } = createBaseSnapshot(multipleProposals);
    mockKey = key;
    mockSnapshot = snapshot;

    let tree: any;
    act(() => {
      tree = create(<ExtraDecisionScreen />);
    });

    const root = tree.root;
    const selector = root.findByProps({ testID: 'extra-proposal-selector' });
    expect(selector).toBeTruthy();

    const selectBtn2 = root.findByProps({ testID: `extra-select-proposal-${COST_ID_2}` });
    act(() => {
      selectBtn2.props.onPress();
    });

    expect(mockReset).toHaveBeenCalled();
  });

  it('triggers prepareDecision and shows confirm sheet for approve', () => {
    const singleProposal = [
      {
        id: COST_ID_1,
        serviceOrderId: 'order-1',
        technicianId: 'tech-1',
        status: 'PENDING_APPROVAL',
        reason: 'Lý do hợp lý',
        totalAmount: 150000,
        expiresAt: '2026-10-15T00:00:00Z',
        items: [{ id: 'item-1', type: 'labor', description: 'Công', quantity: 1, unitPrice: 150000 }],
      },
    ];

    const { key, snapshot } = createBaseSnapshot(singleProposal);
    mockKey = key;
    mockSnapshot = snapshot;

    let tree: any;
    act(() => {
      tree = create(<ExtraDecisionScreen />);
    });

    const root = tree.root;
    const approveBtn = root.findByProps({ testID: 'extra-approve' });

    act(() => {
      approveBtn.props.onPress();
    });

    expect(mockPrepareDecision).toHaveBeenCalledWith(mockKey, COST_ID_1, 'approve');

    // Confirm sheet visible
    const confirmSubmit = root.findByProps({ testID: 'extra-confirm-submit' });
    expect(confirmSubmit).toBeTruthy();

    act(() => {
      confirmSubmit.props.onPress();
    });

    expect(mockSubmitDecision).toHaveBeenCalledWith(mockKey, COST_ID_1, 'approve');
  });

  it('triggers prepareDecision and shows reject sheet stating base repair is preserved', () => {
    const singleProposal = [
      {
        id: COST_ID_1,
        serviceOrderId: 'order-1',
        technicianId: 'tech-1',
        status: 'PENDING_APPROVAL',
        reason: 'Thay dây đồng',
        totalAmount: 120000,
        expiresAt: '2026-10-15T00:00:00Z',
        items: [{ id: 'item-1', type: 'labor', description: 'Công', quantity: 1, unitPrice: 120000 }],
      },
    ];

    const { key, snapshot } = createBaseSnapshot(singleProposal);
    mockKey = key;
    mockSnapshot = snapshot;

    let tree: any;
    act(() => {
      tree = create(<ExtraDecisionScreen />);
    });

    const root = tree.root;
    const rejectBtn = root.findByProps({ testID: 'extra-reject' });

    act(() => {
      rejectBtn.props.onPress();
    });

    expect(mockPrepareDecision).toHaveBeenCalledWith(mockKey, COST_ID_1, 'reject');

    const confirmSheet = root.findByProps({ testID: 'extra-confirm-sheet' });
    expect(confirmSheet).toBeTruthy();

    const confirmSubmit = root.findByProps({ testID: 'extra-confirm-submit' });
    act(() => {
      confirmSubmit.props.onPress();
    });

    expect(mockSubmitDecision).toHaveBeenCalledWith(mockKey, COST_ID_1, 'reject');
  });

  it('disables decision when proposal has expired on server', () => {
    const expiredProposal = [
      {
        id: COST_ID_1,
        serviceOrderId: 'order-1',
        technicianId: 'tech-1',
        status: 'PENDING_APPROVAL',
        reason: 'Hết hạn',
        totalAmount: 100000,
        expiresAt: '2020-01-01T00:00:00Z', // in the past
        items: [{ id: 'item-1', type: 'labor', description: 'Công', quantity: 1, unitPrice: 100000 }],
      },
    ];

    const { key, snapshot } = createBaseSnapshot(expiredProposal);
    mockKey = key;
    mockSnapshot = snapshot;

    let tree: any;
    act(() => {
      tree = create(<ExtraDecisionScreen />);
    });

    const root = tree.root;
    const approveBtn = root.findByProps({ testID: 'extra-approve' });
    expect(approveBtn.props.disabled).toBe(true);

    const rejectBtn = root.findByProps({ testID: 'extra-reject' });
    expect(rejectBtn.props.disabled).toBe(true);
  });

  it('cancels confirm sheet without posting', () => {
    const singleProposal = [
      {
        id: COST_ID_1,
        serviceOrderId: 'order-1',
        technicianId: 'tech-1',
        status: 'PENDING_APPROVAL',
        reason: 'Lý do',
        totalAmount: 150000,
        expiresAt: '2026-10-15T00:00:00Z',
        items: [{ id: 'item-1', type: 'labor', description: 'Công', quantity: 1, unitPrice: 150000 }],
      },
    ];

    const { key, snapshot } = createBaseSnapshot(singleProposal);
    mockKey = key;
    mockSnapshot = snapshot;

    let tree: any;
    act(() => {
      tree = create(<ExtraDecisionScreen />);
    });

    const root = tree.root;
    act(() => {
      root.findByProps({ testID: 'extra-approve' }).props.onPress();
    });

    const cancelBtn = root.findByProps({ testID: 'extra-confirm-cancel' });
    const cancelledSubmit = root.findByProps({ testID: 'extra-confirm-submit' }).props.onPress;
    act(() => {
      cancelBtn.props.onPress();
      cancelledSubmit();
    });

    expect(mockReset).toHaveBeenCalled();
    expect(mockSubmitDecision).not.toHaveBeenCalled();
  });

  it('renders read-only notice for historical or unverified access', () => {
    const { key, snapshot } = createBaseSnapshot([]);
    snapshot.access = 'historical';
    mockKey = key;
    mockSnapshot = snapshot;

    let tree: any;
    act(() => {
      tree = create(<ExtraDecisionScreen />);
    });

    const root = tree.root;
    expect(root.findAllByProps({ testID: 'extra-approve' }).length).toBe(0);
  });
});
