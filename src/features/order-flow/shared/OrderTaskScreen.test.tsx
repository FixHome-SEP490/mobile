import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
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
let mockRouteName = 'OrderTask';
let mockParams: Record<string, unknown> = {};
let mockJournal: { list: (userId: string) => unknown[] } | null = null;
const mockSetParams = jest.fn();
const mockRefresh = jest.fn(async () => {});

jest.mock('../runtime/OrderSessionProvider', () => ({
  useOrderSession: () => ({
    key: mockSnapshot?.key ?? null,
    snapshot: mockSnapshot,
    refresh: mockRefresh,
    loadResource: jest.fn(async () => {}),
    journal: mockJournal ?? { list: () => [] },
  }),
}));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn(), setParams: (...args: unknown[]) => mockSetParams(...args) }),
  useRoute: () => ({ name: mockRouteName, params: mockParams }),
  useIsFocused: () => true,
}));
jest.mock('react-native-safe-area-context', () => {
  const Native = jest.requireActual('react-native');
  return { SafeAreaView: Native.View, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
});
jest.mock('../../../hooks/useKeyboardInset', () => ({ useKeyboardInset: () => 0 }));
jest.mock('../customer/AssignedOrderScreen', () => {
  const ReactRuntime = jest.requireActual('react');
  const Native = jest.requireActual('react-native');
  function MockedAssigned() { return ReactRuntime.createElement(Native.Text, { testID: 'dispatched-C03' }, 'assigned'); }
  return MockedAssigned;
});
jest.mock('../customer/ArrivalStatusScreen', () => {
  const ReactRuntime = jest.requireActual('react');
  const Native = jest.requireActual('react-native');
  function MockedArrival() { return ReactRuntime.createElement(Native.Text, { testID: 'dispatched-C04' }, 'arrival'); }
  return MockedArrival;
});
jest.mock('../customer/QuoteDecisionScreen', () => {
  const ReactRuntime = jest.requireActual('react');
  const Native = jest.requireActual('react-native');
  function MockedQuoteDecision() { return ReactRuntime.createElement(Native.Text, { testID: 'dispatched-C05' }, 'quote-decision'); }
  return MockedQuoteDecision;
});
jest.mock('../customer/RepairStatusScreen', () => {
  const ReactRuntime = jest.requireActual('react');
  const Native = jest.requireActual('react-native');
  function MockedRepair() { return ReactRuntime.createElement(Native.Text, { testID: 'dispatched-C06' }, 'repair'); }
  return MockedRepair;
});
jest.mock('../technician/AcceptedJobScreen', () => {
  const ReactRuntime = jest.requireActual('react');
  const Native = jest.requireActual('react-native');
  function MockedAccepted() { return ReactRuntime.createElement(Native.Text, { testID: 'dispatched-T02' }, 'accepted'); }
  return MockedAccepted;
});
jest.mock('../technician/TravelScreen', () => {
  const ReactRuntime = jest.requireActual('react');
  const Native = jest.requireActual('react-native');
  function MockedTravel() { return ReactRuntime.createElement(Native.Text, { testID: 'dispatched-T03' }, 'travel'); }
  return MockedTravel;
});
jest.mock('../technician/FaceCheckInScreen', () => {
  const ReactRuntime = jest.requireActual('react');
  const Native = jest.requireActual('react-native');
  function MockedFace() { return ReactRuntime.createElement(Native.Text, { testID: 'dispatched-T05' }, 'face'); }
  return MockedFace;
});
jest.mock('../technician/BeforeEvidenceScreen', () => {
  const ReactRuntime = jest.requireActual('react');
  const Native = jest.requireActual('react-native');
  function MockedBefore() { return ReactRuntime.createElement(Native.Text, { testID: 'dispatched-T06' }, 'before'); }
  return MockedBefore;
});
jest.mock('../technician/QuotationFormScreen', () => {
  const ReactRuntime = jest.requireActual('react');
  const Native = jest.requireActual('react-native');
  function MockedQuotationForm() { return ReactRuntime.createElement(Native.Text, { testID: 'dispatched-T07' }, 'quotation-form'); }
  return MockedQuotationForm;
});
jest.mock('../technician/QuotationWaitingScreen', () => {
  const ReactRuntime = jest.requireActual('react');
  const Native = jest.requireActual('react-native');
  function MockedQuotationWaiting() { return ReactRuntime.createElement(Native.Text, { testID: 'dispatched-T08' }, 'quotation-waiting'); }
  return MockedQuotationWaiting;
});
jest.mock('../technician/RepairRecoveryScreen', () => {
  const ReactRuntime = jest.requireActual('react');
  const Native = jest.requireActual('react-native');
  function MockedRecovery() { return ReactRuntime.createElement(Native.Text, { testID: 'dispatched-TR' }, 'recovery'); }
  return MockedRecovery;
});
jest.mock('../technician/RepairWorkspaceScreen', () => {
  const ReactRuntime = jest.requireActual('react');
  const Native = jest.requireActual('react-native');
  function MockedWorkspace() { return ReactRuntime.createElement(Native.Text, { testID: 'dispatched-T09' }, 'workspace'); }
  return MockedWorkspace;
});
jest.mock('../customer/ExtraDecisionScreen', () => {
  const ReactRuntime = jest.requireActual('react');
  const Native = jest.requireActual('react-native');
  function MockedExtraDecision() { return ReactRuntime.createElement(Native.Text, { testID: 'dispatched-C07' }, 'extra-decision'); }
  return MockedExtraDecision;
});
jest.mock('../technician/ExtraWaitingScreen', () => {
  const ReactRuntime = jest.requireActual('react');
  const Native = jest.requireActual('react-native');
  function MockedExtraWaiting() { return ReactRuntime.createElement(Native.Text, { testID: 'dispatched-T11' }, 'extra-waiting'); }
  return MockedExtraWaiting;
});

function baseOrder(status: string, extra: Record<string, unknown> = {}) {
  return {
    id: 'order-1',
    code: 'SO-1',
    bookingId: 'booking-1',
    serviceName: 'Sửa máy lạnh',
    status,
    customerName: 'Khách hàng',
    customerPhone: '0900',
    addressSummary: 'Địa chỉ',
    scheduledAt: '2026-10-13T02:00:00.000Z',
    laborTotal: 0,
    partsTotal: 0,
    grandTotal: 0,
    paymentStatus: 'UNPAID',
    createdAt: '2026-10-13T00:00:00.000Z',
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

beforeEach(() => {
  mockSetParams.mockClear();
  mockRouteName = 'OrderTask';
  mockParams = {};
  mockJournal = null;
});

it('says a failed order read failed and offers a read-only retry instead of loading forever', async () => {
  mockRole = 'customer';
  mockSnapshot = snapshotFor('customer', baseOrder('ACCEPTED'));
  mockSnapshot.order = { status: 'error', requestSeq: 1, error: 'unavailable' } as any;
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<OrderTaskScreen role={mockRole} />); });
  const texts = renderer.root.findAllByType(Text).map((n: any) => n.props.children).flat().join(' ');
  expect(texts).toContain('Chưa tải được thông tin đơn');
  expect(texts).not.toContain('Đang xác minh quyền truy cập');
  const retry = renderer.root.findAllByType(TouchableOpacity).find((b: any) => b.findAllByType(Text).some((t: any) => t.props.children === 'Thử lại'))!;
  await act(async () => { retry.props.onPress(); });
  expect(mockRefresh).toHaveBeenCalledWith('manual');
  await act(async () => renderer.unmount());
});

it('dispatches one focused body per U1 task and never sets an automatic T04', async () => {
  mockRole = 'customer';
  mockSnapshot = snapshotFor('customer', baseOrder('ACCEPTED'));
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<OrderTaskScreen role={mockRole} />);
  });
  expect(renderer.root.findByProps({ testID: 'dispatched-C03' })).toBeTruthy();
  expect(mockSetParams).not.toHaveBeenCalledWith(expect.objectContaining({ taskId: 'T04' }));
  await act(async () => renderer.unmount());

  mockSnapshot = snapshotFor('customer', baseOrder('EN_ROUTE'));
  await act(async () => {
    renderer = create(<OrderTaskScreen role={mockRole} />);
  });
  expect(renderer.root.findByProps({ testID: 'dispatched-C04' })).toBeTruthy();
  await act(async () => renderer.unmount());

  mockRole = 'technician';
  mockSnapshot = snapshotFor('technician', baseOrder('ACCEPTED'));
  await act(async () => {
    renderer = create(<OrderTaskScreen role={mockRole} />);
  });
  expect(renderer.root.findByProps({ testID: 'dispatched-T02' })).toBeTruthy();
  await act(async () => renderer.unmount());
});

it('manual arrival route is held and later milestones keep an honest waiting shell', async () => {
  mockRole = 'technician';
  mockRouteName = 'ArrivalCheckIn';
  mockSnapshot = snapshotFor('technician', baseOrder('EN_ROUTE', { arrivalVerified: false }));
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<OrderTaskScreen role={mockRole} />);
  });
  expect(mockSetParams).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());

  mockRouteName = 'BeforeCapture';
  mockSnapshot = snapshotFor('technician', baseOrder('EN_ROUTE', { arrivalVerified: true }));
  await act(async () => {
    renderer = create(<OrderTaskScreen role={mockRole} />);
  });
  expect(mockSetParams).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());

  mockRouteName = 'OrderTask';
  mockSnapshot = snapshotFor('technician', baseOrder('UNDER_REPAIR'));
  mockSnapshot.resources.extras = readyResource([{
    id: 'extra-1', serviceOrderId: 'order-1', status: 'pending_approval', reason: 'Thêm linh kiện',
    totalLaborDelta: 0, totalPartsDelta: 10, createdAt: '', items: [],
  }] as any, 1, 1);
  await act(async () => {
    renderer = create(<OrderTaskScreen role={mockRole} />);
  });
  expect(renderer.root.findByProps({ testID: 'dispatched-T11' })).toBeTruthy();
  await act(async () => renderer.unmount());
});

it('dispatches one focused body per U2 task', async () => {
  mockRole = 'technician';
  mockRouteName = 'OrderTask';
  let renderer!: ReturnType<typeof create>;
  mockSnapshot = snapshotFor('technician', baseOrder('EN_ROUTE', { arrivalVerified: true }));
  await act(async () => {
    renderer = create(<OrderTaskScreen role={mockRole} />);
  });
  expect(renderer.root.findByProps({ testID: 'dispatched-T05' })).toBeTruthy();
  await act(async () => renderer.unmount());

  mockSnapshot = snapshotFor('technician', baseOrder('UNDER_REPAIR'));
  await act(async () => {
    renderer = create(<OrderTaskScreen role={mockRole} />);
  });
  expect(renderer.root.findByProps({ testID: 'dispatched-T09' })).toBeTruthy();
  await act(async () => renderer.unmount());
});

it('dispatches M4 quotation bodies C05/T07/T08 by server state', async () => {
  mockRole = 'customer';
  mockSnapshot = snapshotFor('customer', baseOrder('EN_ROUTE', { pricingMode: 'INSPECTION_REQUIRED' }));
  mockSnapshot.resources.quotations = readyResource([{
    id: 'q-1', serviceOrderId: 'order-1', technicianId: 'tech-1', status: 'SENT', version: 1,
  }] as any, 1, 1);
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<OrderTaskScreen role={mockRole} />);
  });
  expect(renderer.root.findByProps({ testID: 'dispatched-C05' })).toBeTruthy();
  await act(async () => renderer.unmount());

  mockRole = 'technician';
  const techOrder = () => baseOrder('EN_ROUTE', { arrivalVerified: true, pricingMode: 'INSPECTION_REQUIRED', technician: { id: 'user-1', fullName: 'Thợ', phoneNumber: '0900', averageRating: null } });
  mockSnapshot = snapshotFor('technician', techOrder());
  mockSnapshot.resources.evidence = readyResource([
    { id: 'e-face', serviceOrderId: 'order-1', type: 'CHECKIN_FACE', uploaderId: 'user-1', mediaUrl: 'http://x/face.jpg', createdAt: '2026-10-13T00:00:00Z' },
    { id: 'e-before', serviceOrderId: 'order-1', type: 'BEFORE', uploaderId: 'user-1', mediaUrl: 'http://x/before.jpg', createdAt: '2026-10-13T00:00:00Z' },
  ] as any, 1, 1);
  await act(async () => {
    renderer = create(<OrderTaskScreen role={mockRole} />);
  });
  expect(renderer.root.findByProps({ testID: 'dispatched-T07' })).toBeTruthy();
  await act(async () => renderer.unmount());

  mockSnapshot = snapshotFor('technician', techOrder());
  mockSnapshot.resources.evidence = readyResource([
    { id: 'e-face', serviceOrderId: 'order-1', type: 'CHECKIN_FACE', uploaderId: 'user-1', mediaUrl: 'http://x/face.jpg', createdAt: '2026-10-13T00:00:00Z' },
    { id: 'e-before', serviceOrderId: 'order-1', type: 'BEFORE', uploaderId: 'user-1', mediaUrl: 'http://x/before.jpg', createdAt: '2026-10-13T00:00:00Z' },
  ] as any, 1, 1);
  mockSnapshot.resources.quotations = readyResource([{
    id: 'q-1', serviceOrderId: 'order-1', technicianId: 'user-1', status: 'SENT', version: 1,
  }] as any, 1, 1);
  await act(async () => {
    renderer = create(<OrderTaskScreen role={mockRole} />);
  });
  expect(renderer.root.findByProps({ testID: 'dispatched-T08' })).toBeTruthy();
  await act(async () => renderer.unmount());
});

it('scoped quotation recovery overrides the generic CX/TR fallback with GET-only screens', async () => {
  mockRole = 'customer';
  mockSnapshot = snapshotFor('customer', baseOrder('EN_ROUTE', { pricingMode: 'INSPECTION_REQUIRED' }));
  mockSnapshot.pendingIntent = true;
  mockJournal = {
    list: () => [{
      userId: 'user-1', role: 'customer', serviceOrderId: 'order-1', intentId: 'intent-1',
      entityId: 'q-1', operation: 'quote-decision', dispatchedAt: Date.now(), status: 'unknown',
    }],
  };
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<OrderTaskScreen role={mockRole} />);
  });
  expect(renderer.root.findByProps({ testID: 'dispatched-C05' })).toBeTruthy();
  await act(async () => renderer.unmount());

  mockRole = 'technician';
  mockSnapshot = snapshotFor('technician', baseOrder('EN_ROUTE', { arrivalVerified: true, pricingMode: 'INSPECTION_REQUIRED', technician: { id: 'user-1', fullName: 'Thợ', phoneNumber: '0900', averageRating: null } }));
  mockSnapshot.pendingIntent = true;
  mockJournal = {
    list: () => [{
      userId: 'user-1', role: 'technician', serviceOrderId: 'order-1', intentId: 'intent-1',
      entityId: 'order-1', operation: 'quote-create', dispatchedAt: Date.now(), status: 'unknown',
    }],
  };
  await act(async () => {
    renderer = create(<OrderTaskScreen role={mockRole} />);
  });
  expect(renderer.root.findByProps({ testID: 'dispatched-T07' })).toBeTruthy();
  await act(async () => renderer.unmount());
});

it('dispatches M5 customer C07 extra decision and scoped recovery', async () => {
  mockRole = 'customer';
  mockRouteName = 'OrderTask';
  mockSnapshot = snapshotFor('customer', baseOrder('UNDER_REPAIR'));
  mockSnapshot.resources.extras = readyResource([{
    id: 'extra-1', serviceOrderId: 'order-1', status: 'pending_approval', reason: 'Thêm linh kiện',
    totalLaborDelta: 0, totalPartsDelta: 10, createdAt: '', items: [],
  }] as any, 1, 1);
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<OrderTaskScreen role={mockRole} />);
  });
  expect(renderer.root.findByProps({ testID: 'dispatched-C07' })).toBeTruthy();
  await act(async () => renderer.unmount());

  mockSnapshot.pendingIntent = true;
  mockJournal = {
    list: () => [{
      userId: 'user-1', role: 'customer', serviceOrderId: 'order-1', intentId: 'intent-extra-1',
      entityId: 'extra-1', operation: 'extra-decision', dispatchedAt: Date.now(), status: 'unknown',
    }],
  };
  await act(async () => {
    renderer = create(<OrderTaskScreen role={mockRole} />);
  });
  expect(renderer.root.findByProps({ testID: 'dispatched-C07' })).toBeTruthy();
  await act(async () => renderer.unmount());
});

it('keeps the current task mounted while a refresh drops the order to loading', async () => {
  mockRole = 'technician';
  let renderer!: ReturnType<typeof create>;
  mockSnapshot = snapshotFor('technician', baseOrder('EN_ROUTE', { arrivalVerified: true }));
  await act(async () => { renderer = create(<OrderTaskScreen role={mockRole} />); });
  const mounted = renderer.root.findByProps({ testID: 'dispatched-T05' });

  mockSnapshot = { ...mockSnapshot, order: { status: 'loading', requestSeq: 2 } };
  await act(async () => { renderer.update(<OrderTaskScreen role={mockRole} />); });
  // Same instance: unmounting here destroys the controller that is mid-command.
  expect(renderer.root.findByProps({ testID: 'dispatched-T05' })).toBe(mounted);
  await act(async () => renderer.unmount());
});
