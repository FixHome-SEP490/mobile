import React from 'react';
import { act, create } from 'react-test-renderer';
import type { OrderSessionKey, OrderSessionSnapshot } from '../domain/order-session.types';
import { createOrderSessionSnapshot, readyResource } from '../domain/order-session.types';
import ExtraWaitingScreen from './ExtraWaitingScreen';

let mockKey: OrderSessionKey;
let mockSnapshot: OrderSessionSnapshot;
let mockJournalList: unknown[] = [];
let mockState: any;
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

jest.mock('./useTechnicianExtraCost', () => ({
  useTechnicianExtraCost: () => ({
    controller: {
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

function createBaseSnapshot(extrasList: any[] = []) {
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
      customerName: 'Nguyễn Văn Khách',
      technician: { id: 'tech-1', fullName: 'Thợ chính' },
      createdAt: '2026-10-14T00:00:00Z',
    } as any,
    1,
    1,
  );
  snapshot.resources.extras = readyResource(extrasList, 1, 1);
  return { key, snapshot };
}

describe('ExtraWaitingScreen (T11)', () => {
  it('selects an exact pending root for revision and continues to the base workspace', () => {
    ({ key: mockKey, snapshot: mockSnapshot } = createBaseSnapshot(['first', 'second'].map(id => ({ id, serviceOrderId: 'order-1', status: 'PENDING_APPROVAL', reason: id, expiresAt: '2099-01-01', items: [] }))));
    let tree: any;
    act(() => { tree = create(<ExtraWaitingScreen />); });
    act(() => { tree.root.findByProps({ testID: 'waiting-select-second' }).props.onPress(); });
    act(() => { tree.root.findByProps({ testID: 'waiting-revise-btn' }).props.onPress(); });
    expect(mockNavigate).toHaveBeenCalledWith('ExtraProposal', { proposalId: 'second' });
    act(() => { tree.root.findByProps({ testID: 'waiting-continue-base' }).props.onPress(); });
    expect(mockNavigate).toHaveBeenCalledWith('RepairWorkspace');
  });
  beforeEach(() => {
    jest.clearAllMocks();
    mockJournalList = [];
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

  it('renders waiting screen with awaited customer and cost info', () => {
    const cost = {
      id: 'cost-1',
      serviceOrderId: 'order-1',
      technicianId: 'tech-1',
      status: 'PENDING_APPROVAL',
      reason: 'Hỏng van ga',
      totalLaborDelta: 100000,
      totalPartsDelta: 200000,
      expiresAt: '2099-10-15T00:00:00Z',
    };
    const { key, snapshot } = createBaseSnapshot([cost]);
    mockKey = key;
    mockSnapshot = snapshot;

    let tree: any;
    act(() => {
      tree = create(<ExtraWaitingScreen />);
    });

    const root = tree.root;
    expect(root.findByProps({ testID: 'waiting-continue-base' })).toBeTruthy();
    expect(root.findByProps({ testID: 'waiting-revise-btn' })).toBeTruthy();
  });

  it('navigates to revise route when clicking revise button', () => {
    const cost = {
      id: 'cost-1',
      serviceOrderId: 'order-1',
      technicianId: 'tech-1',
      status: 'PENDING_APPROVAL',
      reason: 'Hỏng van ga',
      totalLaborDelta: 100000,
      totalPartsDelta: 200000,
      expiresAt: '2099-10-15T00:00:00Z',
    };
    const { key, snapshot } = createBaseSnapshot([cost]);
    mockKey = key;
    mockSnapshot = snapshot;

    let tree: any;
    act(() => {
      tree = create(<ExtraWaitingScreen />);
    });

    const root = tree.root;
    const reviseBtn = root.findByProps({ testID: 'waiting-revise-btn' });

    act(() => {
      reviseBtn.props.onPress();
    });

    expect(mockNavigate).toHaveBeenCalledWith('ExtraProposal', { proposalId: 'cost-1' });
  });

  it('hides revise button when proposal is expired', () => {
    const expiredCost = {
      id: 'cost-1',
      serviceOrderId: 'order-1',
      technicianId: 'tech-1',
      status: 'PENDING_APPROVAL',
      reason: 'Hết hạn',
      totalLaborDelta: 100000,
      totalPartsDelta: 200000,
      expiresAt: '2020-01-01T00:00:00Z',
    };
    const { key, snapshot } = createBaseSnapshot([expiredCost]);
    mockKey = key;
    mockSnapshot = snapshot;

    let tree: any;
    act(() => {
      tree = create(<ExtraWaitingScreen />);
    });

    const root = tree.root;
    expect(root.findAllByProps({ testID: 'waiting-revise-btn' }).length).toBe(0);
    expect(root.findByProps({ testID: 'task-refresh' })).toBeTruthy();
  });

  it('continues base repair scope when clicking primary continue button', () => {
    const cost = {
      id: 'cost-1',
      serviceOrderId: 'order-1',
      technicianId: 'tech-1',
      status: 'PENDING_APPROVAL',
      reason: 'Hỏng van ga',
      expiresAt: '2099-10-15T00:00:00Z',
    };
    const { key, snapshot } = createBaseSnapshot([cost]);
    mockKey = key;
    mockSnapshot = snapshot;

    let tree: any;
    act(() => {
      tree = create(<ExtraWaitingScreen />);
    });

    const root = tree.root;
    const continueBtn = root.findByProps({ testID: 'waiting-continue-base' });

    act(() => {
      continueBtn.props.onPress();
    });

    expect(mockNavigate).toHaveBeenCalledWith('RepairWorkspace');
  });

  it('renders read-only notice for historical order', () => {
    const { key, snapshot } = createBaseSnapshot();
    snapshot.access = 'historical';
    mockKey = key;
    mockSnapshot = snapshot;

    let tree: any;
    act(() => {
      tree = create(<ExtraWaitingScreen />);
    });

    const root = tree.root;
    expect(root.findAllByProps({ testID: 'waiting-continue-base' }).length).toBe(0);
  });
});
