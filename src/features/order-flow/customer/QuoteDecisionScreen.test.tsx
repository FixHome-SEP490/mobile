import React from 'react';
import { act, create } from 'react-test-renderer';
import type { OrderSessionKey, OrderSessionSnapshot } from '../domain/order-session.types';
import { createOrderSessionSnapshot, readyResource } from '../domain/order-session.types';
import QuoteDecisionScreen from './QuoteDecisionScreen';

const QUOTE_ID = 'quote-1';
const WARRANTY_ID = '66666666-7777-4888-8999-000000000000';

let mockKey: OrderSessionKey;
let mockSnapshot: OrderSessionSnapshot;
let mockJournalList: unknown[] = [];
let mockState: any;
const mockToggle = jest.fn();
const mockConfirm = jest.fn();
const mockCancelConfirm = jest.fn();
const mockSubmit = jest.fn();
const mockVerify = jest.fn();
const mockGetState = jest.fn();
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
jest.mock('./useCustomerQuotationDecision', () => ({
  useCustomerQuotationDecision: () => ({
    controller: {
      toggleWarrantyItem: (...args: unknown[]) => mockToggle(...args),
      confirm: (...args: unknown[]) => mockConfirm(...args),
      cancelConfirm: (...args: unknown[]) => mockCancelConfirm(...args),
      submit: (...args: unknown[]) => mockSubmit(...args),
      verify: (...args: unknown[]) => mockVerify(...args),
      getState: (...args: unknown[]) => mockGetState(...args),
    },
    state: mockState,
  }),
}));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: (...args: unknown[]) => mockNavigate(...args), goBack: (...args: unknown[]) => mockGoBack(...args) }),
  useIsFocused: () => true,
}));
jest.mock('react-native-safe-area-context', () => {
  const Native = jest.requireActual('react-native');
  return { SafeAreaView: Native.View, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
});
jest.mock('../../../hooks/useKeyboardInset', () => ({ useKeyboardInset: () => 0 }));

function decisionSnapshot(overrides: { pricingMode?: string; quoteVersion?: number; quoteStatus?: string } = {}) {
  const key: OrderSessionKey = { userId: 'cust-1', role: 'customer', sessionGeneration: 1, serviceOrderId: 'order-1' };
  const snapshot = createOrderSessionSnapshot(key);
  snapshot.access = 'current';
  snapshot.order = readyResource(
    {
      id: 'order-1',
      code: 'SO-1',
      bookingId: 'booking-1',
      serviceName: 'Sửa điều hòa',
      status: 'EN_ROUTE',
      pricingMode: overrides.pricingMode ?? 'INSPECTION_REQUIRED',
      customerName: 'Khách hàng',
      customerPhone: '0900000000',
      technician: { id: 'tech-1', fullName: 'Kỹ thuật viên' },
      laborTotal: 150000,
      partsTotal: 100000,
      grandTotal: 250000,
      paymentStatus: 'UNPAID',
      createdAt: '2026-10-13T00:00:00Z',
    } as any,
    1,
    1,
  );
  snapshot.resources.quotations = readyResource(
    [
      {
        id: QUOTE_ID,
        serviceOrderId: 'order-1',
        technicianId: 'tech-1',
        status: overrides.quoteStatus ?? 'SENT',
        version: overrides.quoteVersion ?? 1,
        laborTotal: 150000,
        partsTotal: 100000,
        items: [
          { id: 'labor-1', type: 'labor', description: 'Công thợ', quantity: 1, unitPrice: 150000 },
          {
            id: WARRANTY_ID,
            type: 'parts_equipment',
            partSource: 'technician',
            partWarrantyOption: 'paid_warranty',
            description: 'Tụ thợ',
            quantity: 1,
            unitPrice: 100000,
            warrantyFee: 25000,
            warrantyTermDays: 90,
          },
        ],
      },
    ] as any,
    1,
    1,
  );
  return { key, snapshot };
}

function idleState() {
  return { phase: 'idle', message: null, selectedWarrantyItemIds: [], confirmDraft: null };
}

function sheetCount(renderer: any): number {
  const ids = renderer.root
    .findAll((node: any) => node.props?.testID === 'quote-confirm-sheet')
    .map((node: any) => String(node.props.testID));
  return [...new Set(ids)].length;
}

beforeEach(() => {
  const fixture = decisionSnapshot();
  mockKey = fixture.key;
  mockSnapshot = fixture.snapshot;
  mockJournalList = [];
  mockState = idleState();
  mockGetState.mockImplementation(() => mockState);
  mockConfirm.mockImplementation((action: string) => {
    mockState = {
      ...mockState,
      confirmDraft: {
        owner: 'cust-1/1/order-1',
        target: { orderId: 'order-1', quoteId: QUOTE_ID, quoteVersion: 1, technicianId: 'tech-1' },
        action,
        selectedWarrantyItemIds: [],
      },
    };
    return true;
  });
  for (const mock of [mockToggle, mockConfirm, mockCancelConfirm, mockSubmit, mockVerify, mockNavigate, mockGoBack, mockRefresh, mockLoadResource]) {
    mock.mockClear();
  }
});

it('approve freezes the exact target in a sheet and posts once on explicit confirm', async () => {
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<QuoteDecisionScreen />);
  });
  const toggle = renderer.root.findByProps({ testID: `warranty-toggle-${WARRANTY_ID}` });
  expect(toggle.props.accessibilityState).toEqual({ checked: false });

  await act(async () => {
    renderer.root.findByProps({ testID: 'quote-approve' }).props.onPress();
  });
  expect(mockConfirm).toHaveBeenCalledWith('APPROVE');
  await act(async () => {
    renderer.update(<QuoteDecisionScreen />);
  });
  expect(sheetCount(renderer)).toBe(1);
  expect(JSON.stringify(renderer.toJSON())).toMatch(/quote-1/);
  expect(mockSubmit).not.toHaveBeenCalled();

  await act(async () => {
    renderer.root.findByProps({ testID: 'quote-confirm-submit' }).props.onPress();
  });
  expect(mockSubmit).toHaveBeenCalledTimes(1);
  await act(async () => renderer.unmount());
});

it('reject opens a separate destructive warning and cancel sends no POST', async () => {
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<QuoteDecisionScreen />);
  });
  await act(async () => {
    renderer.root.findByProps({ testID: 'quote-reject' }).props.onPress();
  });
  expect(mockConfirm).toHaveBeenCalledWith('REJECT');
  await act(async () => {
    renderer.update(<QuoteDecisionScreen />);
  });
  expect(JSON.stringify(renderer.toJSON())).toMatch(/hủy toàn bộ đơn/);

  await act(async () => {
    renderer.root.findByProps({ testID: 'quote-confirm-cancel' }).props.onPress();
  });
  expect(mockCancelConfirm).toHaveBeenCalledTimes(1);
  expect(mockSubmit).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());
});

it('unknown offers GET-only verify and back/detail never write', async () => {
  mockState = { ...idleState(), phase: 'unknown', message: 'Kết quả chưa xác định.' };
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<QuoteDecisionScreen />);
  });
  await act(async () => {
    renderer.root.findByProps({ testID: 'quote-verify' }).props.onPress();
  });
  expect(mockVerify).toHaveBeenCalledTimes(1);
  expect(mockSubmit).not.toHaveBeenCalled();

  await act(async () => {
    renderer.root.findByProps({ testID: 'task-detail-link' }).props.onPress();
  });
  expect(mockNavigate).toHaveBeenCalledWith('OrderInformation');
  expect(mockSubmit).not.toHaveBeenCalled();
  expect(mockRefresh).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());
});

it('fixed-price bypasses the quote UI without a quote prerequisite', async () => {
  const fixture = decisionSnapshot({ pricingMode: 'FIXED_PRICE' });
  mockKey = fixture.key;
  mockSnapshot = fixture.snapshot;
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<QuoteDecisionScreen />);
  });
  expect(JSON.stringify(renderer.toJSON())).toMatch(/giá cố định/);
  expect(renderer.root.findAllByProps({ testID: 'quote-approve' })).toHaveLength(0);
  await act(async () => {
    renderer.root.findByProps({ testID: 'quote-bypass-continue' }).props.onPress();
  });
  expect(mockNavigate).toHaveBeenCalledWith('OrderTask');
  expect(mockSubmit).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());
});

it('restored pending offers GET verify even when the fresh phase is idle', async () => {
  mockJournalList = [{
    userId: 'cust-1', role: 'customer', serviceOrderId: 'order-1', intentId: 'intent-1',
    entityId: QUOTE_ID, operation: 'quote-decision', dispatchedAt: Date.now(), status: 'unknown',
  }];
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<QuoteDecisionScreen />);
  });
  await act(async () => {
    renderer.root.findByProps({ testID: 'quote-recovery-verify' }).props.onPress();
  });
  expect(mockVerify).toHaveBeenCalledTimes(1);
  expect(mockSubmit).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());
});

it('quote version change invalidates the frozen sheet', async () => {
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<QuoteDecisionScreen />);
  });
  await act(async () => {
    renderer.root.findByProps({ testID: 'quote-approve' }).props.onPress();
  });
  await act(async () => {
    renderer.update(<QuoteDecisionScreen />);
  });
  expect(sheetCount(renderer)).toBe(1);

  const fixture = decisionSnapshot({ quoteVersion: 2 });
  mockSnapshot = fixture.snapshot;
  await act(async () => {
    renderer.update(<QuoteDecisionScreen />);
  });
  expect(sheetCount(renderer)).toBe(0);
  expect(mockSubmit).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());
});

function approvedScope(withPaid: boolean) {
  return {
    id: QUOTE_ID,
    serviceOrderId: 'order-1',
    technicianId: 'tech-1',
    status: 'APPROVED',
    version: 1,
    laborTotal: 150000,
    partsTotal: 100000,
    items: [
      { id: 'labor-1', type: 'labor', description: 'Công thợ', quantity: 1, unitPrice: 150000 },
      withPaid
        ? {
          id: WARRANTY_ID,
          type: 'parts_equipment',
          partSource: 'technician',
          partWarrantyOption: 'paid_warranty',
          description: 'Tụ thợ',
          quantity: 1,
          unitPrice: 100000,
          warrantyFee: 25000,
          warrantyTermDays: 90,
        }
        : {
          id: WARRANTY_ID,
          type: 'parts_equipment',
          partSource: 'technician',
          partWarrantyOption: 'no_warranty',
          description: 'Tụ thợ',
          quantity: 1,
          unitPrice: 100000,
        },
    ],
  };
}

it('resolved scope derives accepted warranties from persisted rows, not local selection', async () => {
  // Cold reload: local selection is empty and decidedAction undefined, yet the
  // persisted APPROVED rows still prove the accepted opt-in.
  mockState = {
    ...idleState(),
    phase: 'resolved',
    decidedAction: undefined,
    selectedWarrantyItemIds: [],
    resolvedQuotation: approvedScope(true),
  };
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<QuoteDecisionScreen />);
  });
  expect(JSON.stringify(renderer.toJSON())).toMatch(/Đã chọn bảo hành dòng này/);
  await act(async () => renderer.unmount());
});

it('a local choice differing from the actual scope is never shown as accepted', async () => {
  // Backend cleared the opt-in to no_warranty; stale local selection must not
  // render as accepted scope.
  mockState = {
    ...idleState(),
    phase: 'resolved',
    decidedAction: 'APPROVE',
    selectedWarrantyItemIds: [WARRANTY_ID],
    resolvedQuotation: approvedScope(false),
  };
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<QuoteDecisionScreen />);
  });
  expect(JSON.stringify(renderer.toJSON())).not.toMatch(/Đã chọn bảo hành dòng này/);
  await act(async () => renderer.unmount());
});

it('unknown freezes selection and destructive confirms while keeping GET verify', async () => {
  mockState = { ...idleState(), phase: 'unknown', message: 'Kết quả chưa xác định.' };
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<QuoteDecisionScreen />);
  });
  expect(renderer.root.findAll(node => String(node.props?.testID ?? '').startsWith('warranty-toggle-'))).toHaveLength(0);
  expect(renderer.root.findAllByProps({ testID: 'quote-reject' })).toHaveLength(0);
  expect(renderer.root.findAllByProps({ testID: 'quote-approve' })).toHaveLength(0);
  await act(async () => {
    renderer.root.findByProps({ testID: 'quote-verify' }).props.onPress();
  });
  expect(mockVerify).toHaveBeenCalledTimes(1);
  expect(mockSubmit).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());
});

it('back cancels the confirmation with zero POST', async () => {
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<QuoteDecisionScreen />);
  });
  await act(async () => {
    renderer.root.findByProps({ testID: 'quote-approve' }).props.onPress();
  });
  await act(async () => {
    renderer.update(<QuoteDecisionScreen />);
  });
  expect(sheetCount(renderer)).toBe(1);
  await act(async () => {
    renderer.root.findAll(node => node.props?.accessibilityLabel === 'Quay lại')[0].props.onPress();
  });
  expect(mockCancelConfirm).toHaveBeenCalledTimes(1);
  expect(mockSubmit).not.toHaveBeenCalled();
  expect(mockGoBack).not.toHaveBeenCalled();
  await act(async () => {
    renderer.update(<QuoteDecisionScreen />);
  });
  expect(sheetCount(renderer)).toBe(0);
  await act(async () => renderer.unmount());
});
