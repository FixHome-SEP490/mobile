import React from 'react';
import { Linking, Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { OrderSessionSnapshot } from '../domain/order-session.types';
import { createOrderSessionSnapshot, readyResource } from '../domain/order-session.types';
import { CustomerOrderContextProvider } from './CustomerOrderContext';
import { OrderContextSlot } from '../shared/order-context-slot';

let mockSnapshot: OrderSessionSnapshot;
let mockBlur: (() => void) | undefined;
const mockNavigate = jest.fn();

jest.mock('../runtime/OrderSessionProvider', () => ({
  useOptionalOrderSession: () => ({ key: mockSnapshot.key, snapshot: mockSnapshot }),
}));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    addListener: (_event: string, handler: () => void) => { mockBlur = handler; return () => undefined; },
  }),
}));
jest.mock('../shared/OrderInformationScreen', () => ({ __esModule: true, default: () => jest.requireActual('react').createElement(jest.requireActual('react-native').Text, { testID: 'sheet-detail' }, 'detail') }));
jest.mock('../shared/OrderProgressHistoryScreen', () => ({ __esModule: true, default: () => jest.requireActual('react').createElement(jest.requireActual('react-native').Text, { testID: 'sheet-progress' }, 'progress') }));
jest.mock('../../../screens/technician/technician-chat-shortcut', () => ({ findChatForBooking: jest.fn(async () => null) }));

function snapshotFor(role: 'customer' | 'technician', status: string, quotation?: object): OrderSessionSnapshot {
  const key = { userId: 'u1', role, sessionGeneration: 1, serviceOrderId: 'order-1' };
  const snapshot = createOrderSessionSnapshot(key);
  snapshot.access = 'current';
  snapshot.order = readyResource({
    id: 'order-1', code: 'SO-1', bookingId: 'booking-1', serviceName: 'Sửa máy lạnh', status,
    customerName: 'Khách', customerPhone: '', addressSummary: '123 Đường Mẫu', scheduledAt: '2026-10-13T02:00:00.000Z',
    laborTotal: 0, partsTotal: 0, grandTotal: 0, paymentStatus: 'UNPAID', createdAt: '2026-10-13T00:00:00.000Z',
    technician: { id: 't1', fullName: 'Kỹ thuật viên A', phoneNumber: '0900', averageRating: null },
    ...(quotation ? { quotation } : {}),
  } as never, 1, 1);
  return snapshot;
}

const Frame = () => <CustomerOrderContextProvider>
  <OrderContextSlot.Consumer>{(slot) => slot ? <><slot.Stepper /><slot.Summary /></> : null}</OrderContextSlot.Consumer>
</CustomerOrderContextProvider>;

async function mount() {
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<Frame />); });
  return renderer;
}
const byId = (r: ReturnType<typeof create>, testID: string) => r.root.findAllByProps({ testID }).filter(n => typeof n.type === 'string' || n.props.onPress);

beforeEach(() => { mockNavigate.mockClear(); mockBlur = undefined; });

it('shows the five steps with the current one, from the shared stage', async () => {
  mockSnapshot = snapshotFor('customer', 'EN_ROUTE');
  const r = await mount();
  expect(r.root.findByProps({ accessibilityLabel: 'Tiến độ bước 3 trên 5: Kỹ thuật viên đến' })).toBeTruthy();
  await act(async () => r.unmount());
});

it('summarises the order and calls the technician', async () => {
  mockSnapshot = snapshotFor('customer', 'UNDER_REPAIR');
  const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  const r = await mount();
  const text = r.root.findAllByType(Text).map(n => String(n.props.children)).join('|');
  expect(text).toContain('Kỹ thuật viên A');
  expect(text).toContain('123 Đường Mẫu');
  await act(async () => { r.root.findByProps({ testID: 'order-call-technician' }).props.onPress(); });
  expect(openURL).toHaveBeenCalledWith('tel:0900');
  openURL.mockRestore();
  await act(async () => r.unmount());
});

it('opens detail and progress as sheets over the order, and closes them when the order loses focus', async () => {
  mockSnapshot = snapshotFor('customer', 'EN_ROUTE', { id: 'q1', status: 'SENT', laborTotal: 150000, partsTotal: 100000, items: [] });
  const r = await mount();
  expect(r.root.findAllByProps({ testID: 'sheet-detail' })).toHaveLength(0);
  await act(async () => { r.root.findByProps({ testID: 'order-quote-chip' }).props.onPress(); });
  expect(r.root.findAllByProps({ testID: 'sheet-detail' }).length).toBeGreaterThan(0);
  expect(mockNavigate).not.toHaveBeenCalled();
  await act(async () => { mockBlur?.(); });
  expect(r.root.findAllByProps({ testID: 'sheet-detail' })).toHaveLength(0);
  await act(async () => { r.root.findByProps({ testID: 'order-open-progress' }).props.onPress(); });
  expect(r.root.findAllByProps({ testID: 'sheet-progress' }).length).toBeGreaterThan(0);
  await act(async () => r.unmount());
});

it('shows the quotation total and state on the order, and nothing for a technician', async () => {
  mockSnapshot = snapshotFor('customer', 'EN_ROUTE', { id: 'q1', status: 'SENT', laborTotal: 150000, partsTotal: 100000, items: [] });
  let r = await mount();
  expect(r.root.findAllByType(Text).map(n => n.props.children).flat().join('')).toContain('Chờ duyệt');
  await act(async () => r.unmount());
  mockSnapshot = snapshotFor('technician', 'EN_ROUTE');
  r = await mount();
  expect(byId(r, 'customer-order-summary')).toHaveLength(0);
  await act(async () => r.unmount());
});
