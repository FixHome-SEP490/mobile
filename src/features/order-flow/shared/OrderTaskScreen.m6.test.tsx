import { handoverSeenKey, markHandoverSeen, resetHandoverSeen } from '../customer/handover-seen';
import React from 'react';
import { act, create } from 'react-test-renderer';
import type { OrderSessionSnapshot } from '../domain/order-session.types';
import { createOrderSessionSnapshot, readyResource } from '../domain/order-session.types';
import OrderTaskScreen from './OrderTaskScreen';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));

let mockSnapshot: OrderSessionSnapshot | null;
let mockRole: 'customer' | 'technician' = 'customer';
let mockJournal: { list: (userId: string) => unknown[] } | null = null;
const mockSetParams = jest.fn();

jest.mock('../runtime/OrderSessionProvider', () => ({
  useOptionalOrderSession: () => null,
  useOrderSession: () => ({
    key: mockSnapshot?.key ?? null,
    snapshot: mockSnapshot,
    refresh: jest.fn(async () => {}),
    loadResource: jest.fn(async () => {}),
    journal: mockJournal ?? { list: () => [] },
  }),
}));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn(), setParams: (...args: unknown[]) => mockSetParams(...args) }),
  useRoute: () => ({ name: 'OrderTask', params: {} }),
  useIsFocused: () => true,
}));
jest.mock('react-native-safe-area-context', () => {
  const Native = jest.requireActual('react-native');
  return { SafeAreaView: Native.View, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
});
jest.mock('../../../hooks/useKeyboardInset', () => ({ useKeyboardInset: () => 0 }));

jest.mock('../customer/HandoverReviewScreen', () => {
  const ReactRuntime = jest.requireActual('react');
  const Native = jest.requireActual('react-native');
  function MockedC08() { return ReactRuntime.createElement(Native.Text, { testID: 'dispatched-C08' }, 'c08'); }
  return MockedC08;
});
jest.mock('../customer/PaymentMethodScreen', () => {
  const ReactRuntime = jest.requireActual('react');
  const Native = jest.requireActual('react-native');
  function MockedC09() { return ReactRuntime.createElement(Native.Text, { testID: 'dispatched-C09' }, 'c09'); }
  return MockedC09;
});
jest.mock('../customer/CashConfirmationScreen', () => {
  const ReactRuntime = jest.requireActual('react');
  const Native = jest.requireActual('react-native');
  function MockedC10() { return ReactRuntime.createElement(Native.Text, { testID: 'dispatched-C10' }, 'c10'); }
  return MockedC10;
});
jest.mock('../customer/PaymentResultScreen', () => {
  const ReactRuntime = jest.requireActual('react');
  const Native = jest.requireActual('react-native');
  function MockedC11() { return ReactRuntime.createElement(Native.Text, { testID: 'dispatched-C11' }, 'c11'); }
  return MockedC11;
});
jest.mock('../technician/PaymentWaitingScreen', () => {
  const ReactRuntime = jest.requireActual('react');
  const Native = jest.requireActual('react-native');
  function MockedT15() { return ReactRuntime.createElement(Native.Text, { testID: 'dispatched-T15' }, 't15'); }
  return MockedT15;
});
jest.mock('../technician/AfterEvidenceScreen', () => {
  const ReactRuntime = jest.requireActual('react');
  const Native = jest.requireActual('react-native');
  function MockedT13() { return ReactRuntime.createElement(Native.Text, { testID: 'dispatched-T13' }, 't13'); }
  return MockedT13;
});
jest.mock('../technician/CompletionRequestScreen', () => {
  const ReactRuntime = jest.requireActual('react');
  const Native = jest.requireActual('react-native');
  function MockedT14() { return ReactRuntime.createElement(Native.Text, { testID: 'dispatched-T14' }, 't14'); }
  return MockedT14;
});
jest.mock('../technician/CashDeclarationScreen', () => {
  const ReactRuntime = jest.requireActual('react');
  const Native = jest.requireActual('react-native');
  function MockedT15a() { return ReactRuntime.createElement(Native.Text, { testID: 'dispatched-T15a' }, 't15a'); }
  return MockedT15a;
});
jest.mock('../technician/RepairRecoveryScreen', () => {
  const ReactRuntime = jest.requireActual('react');
  const Native = jest.requireActual('react-native');
  function MockedTR() { return ReactRuntime.createElement(Native.Text, { testID: 'dispatched-TR' }, 'tr'); }
  return MockedTR;
});

function baseOrder(role: 'customer' | 'technician', status: string, extra: Record<string, unknown> = {}) {
  return {
    id: 'order-1', code: 'SO-1', bookingId: 'booking-1', serviceName: 'Sửa máy lạnh', status,
    customerName: 'Khách hàng', customerPhone: '0900', addressSummary: 'Địa chỉ',
    scheduledAt: '2026-10-13T02:00:00.000Z', laborTotal: 0, partsTotal: 0, grandTotal: 0,
    paymentStatus: 'UNPAID', createdAt: '2026-10-13T00:00:00.000Z',
    technician: { id: 'user-1', fullName: 'Thợ', phoneNumber: '0900', averageRating: null },
    ...extra,
  };
}

function snapshotFor(role: 'customer' | 'technician', order: Record<string, unknown>): OrderSessionSnapshot {
  const key = { userId: 'user-1', role, sessionGeneration: 1, serviceOrderId: 'order-1' };
  const snapshot = createOrderSessionSnapshot(key);
  snapshot.access = 'current';
  snapshot.order = readyResource(order as any, 1, 1);
  snapshot.resources.extras = readyResource([], 1, 1);
  snapshot.resources.evidence = readyResource([], 1, 1);
  snapshot.resources.quotations = readyResource([], 1, 1);
  snapshot.resources.invoice = readyResource(null, 1, 1);
  snapshot.resources.cash = readyResource(null, 1, 1);
  return snapshot;
}

const requested = { completionRequestedAt: '2026-10-13T01:00:00.000Z' };
const unpaidInvoice = { id: 'invoice-1', serviceOrderId: 'order-1', paymentStatus: 'unpaid', grandTotal: 120000 };
const paidInvoice = { id: 'invoice-1', serviceOrderId: 'order-1', paymentStatus: 'paid', grandTotal: 120000 };
const pendingCash = { id: 'cash-1', serviceOrderId: 'order-1', status: 'pending_confirmation', declaredAmount: 120000, declaredByTechnicianId: 'user-1', declaredAt: '2026-10-13T02:00:00.000Z' };

beforeEach(() => { mockSetParams.mockClear(); mockJournal = null; resetHandoverSeen(); });

it.each([
  ['C08', 'customer', baseOrder('customer', 'UNDER_REPAIR', requested), null, null, 'dispatched-C08'],
  ['C09', 'customer', baseOrder('customer', 'UNDER_REPAIR', requested), unpaidInvoice, null, 'dispatched-C09'],
  ['C10', 'customer', baseOrder('customer', 'UNDER_REPAIR', requested), unpaidInvoice, pendingCash, 'dispatched-C10'],
  ['C11', 'customer', baseOrder('customer', 'UNDER_REPAIR', requested), paidInvoice, null, 'dispatched-C11'],
  ['C12', 'customer', baseOrder('customer', 'COMPLETED'), null, null, 'completed-copy-order-code'],
  ['T15', 'technician', baseOrder('technician', 'UNDER_REPAIR', requested), unpaidInvoice, null, 'dispatched-T15'],
  ['T16', 'technician', baseOrder('technician', 'COMPLETED'), null, null, 'completed-back-home'],
] as const)('dispatches M6 task %s to its focused screen', async (_task, role, order, invoice, cash, testID) => {
  mockRole = role;
  // Payment (C09) and cash confirmation (C10) open once the customer has been through the handover.
  if (_task === 'C09' || _task === 'C10') markHandoverSeen(handoverSeenKey('order-1', requested.completionRequestedAt));
  mockSnapshot = snapshotFor(role, order);
  if (invoice) mockSnapshot.resources.invoice = readyResource(invoice as any, 1, 1);
  if (cash) mockSnapshot.resources.cash = readyResource(cash as any, 1, 1);
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<OrderTaskScreen role={mockRole} />); });
  expect(renderer.root.findByProps({ testID })).toBeTruthy();
  await act(async () => renderer.unmount());
});

it('shows the handover before payment or cash confirmation until the customer has reviewed it', async () => {
  for (const cash of [null, pendingCash]) {
    mockRole = 'customer';
    mockSnapshot = snapshotFor('customer', baseOrder('customer', 'UNDER_REPAIR', requested));
    mockSnapshot.resources.invoice = readyResource(unpaidInvoice as any, 1, 1);
    if (cash) mockSnapshot.resources.cash = readyResource(cash as any, 1, 1);
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<OrderTaskScreen role={mockRole} />); });
    expect(renderer.root.findByProps({ testID: 'dispatched-C08' })).toBeTruthy();
    expect(renderer.root.findAllByProps({ testID: cash ? 'dispatched-C10' : 'dispatched-C09' })).toHaveLength(0);
    await act(async () => { markHandoverSeen(handoverSeenKey('order-1', requested.completionRequestedAt)); });
    expect(renderer.root.findByProps({ testID: cash ? 'dispatched-C10' : 'dispatched-C09' })).toBeTruthy();
    await act(async () => renderer.unmount());
    resetHandoverSeen();
  }
});

it('paid invoice with under-repair never dispatches the completed screen', async () => {
  mockRole = 'customer';
  mockSnapshot = snapshotFor('customer', baseOrder('customer', 'UNDER_REPAIR', requested));
  mockSnapshot.resources.invoice = readyResource(paidInvoice as any, 1, 1);
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<OrderTaskScreen role={mockRole} />); });
  expect(renderer.root.findAllByProps({ testID: 'completed-copy-order-code' }).length).toBe(0);
  expect(renderer.root.findByProps({ testID: 'dispatched-C11' })).toBeTruthy();
  await act(async () => renderer.unmount());
});

it('scoped M6 recovery renders GET-only screens without touching other markers', async () => {
  mockRole = 'customer';
  mockSnapshot = snapshotFor('customer', baseOrder('customer', 'EN_ROUTE'));
  mockSnapshot.pendingIntent = true;
  mockJournal = {
    list: () => [{
      userId: 'user-1', role: 'customer', serviceOrderId: 'order-1', intentId: 'intent-pay-1',
      entityId: 'invoice-1', operation: 'wallet-pay', dispatchedAt: Date.now(), status: 'unknown',
    }],
  };
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<OrderTaskScreen role={mockRole} />); });
  expect(renderer.root.findByProps({ testID: 'dispatched-C11' })).toBeTruthy();
  await act(async () => renderer.unmount());

  mockRole = 'technician';
  // ACCEPTED + pending intent resolves TR so the scoped recovery block runs.
  mockSnapshot = snapshotFor('technician', baseOrder('technician', 'ACCEPTED'));
  mockSnapshot.pendingIntent = true;
  for (const [operation, testID, extra] of [
    ['after-upload', 'dispatched-T13', {}],
    ['request-completion', 'dispatched-T14', {}],
    ['cash-declare', 'dispatched-T15a', {}],
    ['evidence-delete', 'dispatched-T13', { stableKey: 'm6-after-delete' }],
  ] as const) {
    mockJournal = {
      list: () => [{
        userId: 'user-1', role: 'technician', serviceOrderId: 'order-1', intentId: `intent-${operation}`,
        entityId: 'order-1', operation, dispatchedAt: Date.now(), status: 'unknown', ...extra,
      }],
    };
    await act(async () => { renderer = create(<OrderTaskScreen role={mockRole} />); });
    expect(renderer.root.findByProps({ testID })).toBeTruthy();
    await act(async () => renderer.unmount());
  }
});

it('foreign-role markers and M3 before-deletion never hijack M6 recovery', async () => {
  mockRole = 'technician';
  mockSnapshot = snapshotFor('technician', baseOrder('technician', 'ACCEPTED'));
  mockSnapshot.pendingIntent = true;
  mockJournal = {
    list: () => [{
      userId: 'user-1', role: 'technician', serviceOrderId: 'order-1', intentId: 'intent-before-del',
      entityId: 'before-1', operation: 'evidence-delete', dispatchedAt: Date.now(), status: 'unknown',
    }],
  };
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<OrderTaskScreen role={mockRole} />); });
  expect(renderer.root.findAllByProps({ testID: 'dispatched-T13' }).length).toBe(0);
  await act(async () => renderer.unmount());
});
