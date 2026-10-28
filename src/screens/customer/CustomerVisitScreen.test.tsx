import React from 'react';
import { Alert, Text, TouchableOpacity } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import CustomerVisitScreen from './CustomerVisitScreen';

const mockNavigate = jest.fn();
const mockVisit = { get: jest.fn(), getCheckout: jest.fn(), payWithWallet: jest.fn(), cancel: jest.fn(), confirmCash: jest.fn(), createVnpayUrl: jest.fn(), reschedule: jest.fn() };
const mockOrder = jest.fn();
const mockWallet = jest.fn();

jest.mock('@react-navigation/native', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactModule = require('react');
  return {
    useFocusEffect: (callback: () => void) => ReactModule.useEffect(callback, [callback]),
    useNavigation: () => ({ navigate: (...args: unknown[]) => mockNavigate(...args), goBack: jest.fn() }),
    useRoute: () => ({ params: { visitGroupId: 'v1' } }),
  };
});
jest.mock('react-native-safe-area-context', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Native = require('react-native');
  return { SafeAreaView: Native.View };
});
jest.mock('../../components/BackButton', () => ({ __esModule: true, default: () => null }));
jest.mock('../../components/BookingRescheduleSheet', () => ({ __esModule: true, default: () => null }));
jest.mock('../../components/customer/CustomerSkeleton', () => ({ __esModule: true, default: () => null }));
jest.mock('../../hooks/useLiveRefresh', () => ({ useLiveRefresh: jest.fn() }));
jest.mock('../../hooks/useReduceMotion', () => ({ useReduceMotion: () => false }));
jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn(async () => ({})) }));
jest.mock('../../constants/theme', () => {
  const tone = { bg: '#eee', fg: '#111', text: '#222' };
  return {
    useAppTheme: () => ({
      colors: {
        primary: '#2563EB', primaryStrong: '#1D4ED8', primarySoft: '#EFF6FF', background: '#F8FAFC', surface: '#FFFFFF',
        text: '#0F172A', textSecondary: '#64748B', border: '#E2E8F0',
        tone: { success: tone, warning: tone, danger: tone, info: tone, violet: tone, repair: tone, neutral: tone },
      },
    }),
  };
});
// Lazy lookups: the jest.mock factories run before the const above is initialised.
jest.mock('../../api/visit-groups.api', () => ({
  visitGroupsApi: new Proxy({}, { get: (_t, name: string) => (...args: unknown[]) => (mockVisit as Record<string, (...a: unknown[]) => unknown>)[name](...args) }),
}));
const mockFunded = { wallet: jest.fn(), vnpay: jest.fn(), zero: jest.fn(), confirmCash: jest.fn() };
jest.mock('../../api/funded-checkout.api', () => ({
  fundedCheckoutApi: new Proxy({}, { get: (_t, name: string) => (...args: unknown[]) => (mockFunded as Record<string, (...a: unknown[]) => unknown>)[name](...args) }),
}));
let mockHeld: Record<string, unknown> = {};
// The real section is tested with the order payment screens; here it only reports a held voucher.
jest.mock('../../features/order-flow/customer/VoucherCheckoutSection', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { TouchableOpacity } = require('react-native');
  return {
    __esModule: true,
    default: ({ onApplied, onReleased }: { onApplied: (v: unknown) => void; onReleased: () => void }) => (
      <>
        <TouchableOpacity testID="mock-voucher-apply" onPress={() => onApplied(mockHeld)} />
        <TouchableOpacity testID="mock-voucher-release" onPress={() => onReleased()} />
      </>
    ),
  };
});
jest.mock('../../api/orders.api', () => ({ ordersApi: { getOrder: (...args: unknown[]) => mockOrder(...args) } }));
jest.mock('../../api/customer-wallet.api', () => ({
  customerWalletApi: { getSummary: (...args: unknown[]) => mockWallet(...args) },
  wholeVnd: (value: unknown) => (typeof value === 'number' ? value : null),
}));


const booking = (id: string, status = 'SUBMITTED') => ({ id, status, description: `mô tả ${id}`, serviceName: `Dịch vụ ${id}`, rescheduleCount: 0 });
const baseVisit = (status = 'SUBMITTED') => ({
  id: 'v1', status: 'submitted', bookingMode: 'scheduled', slot: 'morning',
  preferredStartAt: '2026-10-26T01:00:00.000Z', preferredEndAt: '2026-10-26T05:00:00.000Z', leadBookingId: 'b1',
  items: [
    { id: 'i1', sequence: 1, serviceId: 's1', deviceLabel: null, booking: booking('b1', status) },
    { id: 'i2', sequence: 2, serviceId: 's2', deviceLabel: null, booking: booking('b2', status) },
  ],
});
const device = (sequence: number, over: Record<string, unknown> = {}) => ({
  sequence, deviceLabel: null, bookingId: `b${sequence}`, serviceName: `Dịch vụ b${sequence}`, serviceOrderId: null, orderCode: null,
  state: 'open', invoiceId: null, amount: 0, paid: false, ...over,
});
const baseCheckout = (over: Record<string, unknown> = {}) => ({
  visitGroupId: 'v1', total: 300000, waiting: 0, ready: false, paid: false, pendingCash: null,
  devices: [device(1), device(2)], ...over,
});

const texts = (tree: ReactTestRenderer) => tree.root.findAllByType(Text).map((node) => [node.props.children].flat().join('').replace(/ /g, ' '));
const press = (tree: ReactTestRenderer, testID: string) => tree.root.findAll((n) => n.props.testID === testID && typeof n.props.onPress === 'function')[0];
async function mount() {
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(<CustomerVisitScreen />); });
  await act(async () => { await Promise.resolve(); });
  return tree;
}

beforeEach(() => {
  jest.resetAllMocks();
  mockHeld = { reservationId: 'hold-1', claimId: 'claim-1', scopeId: 'v1', expiresAt: new Date(Date.now() + 600_000).toISOString(), originalGrossVnd: 300000, discountVnd: 100000, customerDueVnd: 200000 };
  mockWallet.mockResolvedValue({ balance: 1_000_000 });
  mockOrder.mockImplementation(async (id: string) => ({ id, status: 'ACCEPTED' }));
});

it('lists every device with its own status and lets the customer pick a technician', async () => {
  mockVisit.get.mockResolvedValue(baseVisit());
  mockVisit.getCheckout.mockResolvedValue(baseCheckout());
  const tree = await mount();
  const all = texts(tree);
  expect(all).toContain('Thiết bị trong lượt (2)');
  expect(all.filter((t) => t === 'Chưa chọn thợ')).toHaveLength(2);
  expect(all).toContain('Kết quả 0/2 máy');
  expect(all.some((t) => t.startsWith('Chờ kết quả các thiết bị'))).toBe(true);
  act(() => { press(tree, 'visit-choose-technician').props.onPress(); });
  expect(mockNavigate).toHaveBeenCalledWith('CustomerMatching', { bookingId: 'b1', visitGroupId: 'v1' });
});

it('hides actions that are not allowed once repair has started', async () => {
  mockVisit.get.mockResolvedValue(baseVisit('MATCHED'));
  mockVisit.getCheckout.mockResolvedValue(baseCheckout({ devices: [device(1, { serviceOrderId: 'o1' }), device(2, { serviceOrderId: 'o2' })] }));
  mockOrder.mockImplementation(async (id: string) => ({ id, status: 'UNDER_REPAIR' }));
  const tree = await mount();
  expect(press(tree, 'visit-choose-technician')).toBeUndefined();
  expect(press(tree, 'visit-reschedule')).toBeUndefined();
  expect(press(tree, 'visit-cancel')).toBeUndefined();
});

it('points to a quotation that waits for the customer', async () => {
  mockVisit.get.mockResolvedValue(baseVisit('MATCHED'));
  mockVisit.getCheckout.mockResolvedValue(baseCheckout({ devices: [device(1, { serviceOrderId: 'o1' }), device(2, { serviceOrderId: 'o2' })] }));
  mockOrder.mockImplementation(async (id: string) => ({ id, status: 'EN_ROUTE', quotation: id === 'o2' ? { status: 'SENT' } : undefined }));
  const tree = await mount();
  expect(texts(tree)).toContain('Máy 2 chờ bạn duyệt báo giá');
  act(() => { press(tree, 'visit-quote-shortcut').props.onPress(); });
  expect(mockNavigate).toHaveBeenCalledWith('CustomerOrderDetail', { serviceOrderId: 'o2' });
});

it('pays the whole visit from the wallet once every device has a result, then reads the visit again', async () => {
  mockVisit.get.mockResolvedValue(baseVisit('MATCHED'));
  mockVisit.getCheckout.mockResolvedValue(baseCheckout({ ready: true, devices: [device(1, { serviceOrderId: 'o1', state: 'succeeded', amount: 300000 }), device(2, { serviceOrderId: 'o2', state: 'failed' })] }));
  mockVisit.payWithWallet.mockResolvedValue({ amount: 300000, balance: 700000 });
  const tree = await mount();
  expect(texts(tree)).toContain('Số dư 1.000.000 ₫');
  await act(async () => { press(tree, 'visit-pay-submit').props.onPress(); });
  await act(async () => { await Promise.resolve(); });
  expect(mockVisit.payWithWallet).toHaveBeenCalledWith('v1');
  expect(texts(tree).some((t) => t.startsWith('Đã thanh toán 300.000'))).toBe(true);
  expect(mockVisit.getCheckout.mock.calls.length).toBeGreaterThan(1);
});

it('does not start a wallet payment the wallet cannot cover', async () => {
  mockWallet.mockResolvedValue({ balance: 1000 });
  mockVisit.get.mockResolvedValue(baseVisit('MATCHED'));
  mockVisit.getCheckout.mockResolvedValue(baseCheckout({ ready: true, devices: [device(1, { serviceOrderId: 'o1', state: 'succeeded', amount: 300000 }), device(2, { serviceOrderId: 'o2', state: 'failed' })] }));
  const tree = await mount();
  expect(texts(tree).some((t) => t.startsWith('Ví chưa đủ'))).toBe(true);
  const submit = tree.root.findAll((n) => n.props.testID === 'visit-pay-submit')[0];
  expect(submit.props.disabled).toBe(true);
  expect(mockVisit.payWithWallet).not.toHaveBeenCalled();
});

it('answers a declared cash amount for the whole visit', async () => {
  mockVisit.get.mockResolvedValue(baseVisit('MATCHED'));
  mockVisit.getCheckout.mockResolvedValue(baseCheckout({ ready: true, pendingCash: { id: 'c1', amount: 300000, declaredAt: 'x' }, devices: [device(1, { serviceOrderId: 'o1', state: 'succeeded' }), device(2, { serviceOrderId: 'o2', state: 'failed' })] }));
  mockVisit.confirmCash.mockResolvedValue(undefined);
  const tree = await mount();
  const yes = tree.root.findAllByType(TouchableOpacity).find((b) => texts({ root: b } as unknown as ReactTestRenderer).includes('Đúng, tôi đã trả'))!;
  await act(async () => { yes.props.onPress(); });
  expect(mockVisit.confirmCash).toHaveBeenCalledWith('v1', true, undefined);
});

it('asks before cancelling the whole visit and reads again if the cancel fails', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  mockVisit.get.mockResolvedValue(baseVisit());
  mockVisit.getCheckout.mockResolvedValue(baseCheckout());
  mockVisit.cancel.mockRejectedValue(new Error('boom'));
  const tree = await mount();
  act(() => { press(tree, 'visit-cancel').props.onPress(); });
  const buttons = alert.mock.calls[0][2]!;
  expect(alert.mock.calls[0][0]).toBe('Hủy cả lượt sửa?');
  expect(mockVisit.cancel).not.toHaveBeenCalled();
  const readsBefore = mockVisit.get.mock.calls.length;
  await act(async () => { buttons.find((b) => b.text === 'Hủy lượt sửa')!.onPress!(); });
  await act(async () => { await Promise.resolve(); });
  expect(mockVisit.cancel).toHaveBeenCalledWith('v1', 'Khách hủy lượt sửa');
  expect(mockVisit.get.mock.calls.length).toBeGreaterThan(readsBefore);
  alert.mockRestore();
});

it('shows a retry when the visit cannot be loaded', async () => {
  mockVisit.get.mockRejectedValue(new Error('offline'));
  const tree = await mount();
  expect(texts(tree)).toContain('Thử lại');
});

const readyCheckout = () => baseCheckout({ ready: true, devices: [device(1, { serviceOrderId: 'o1', state: 'succeeded', amount: 300000 }), device(2, { serviceOrderId: 'o2', state: 'failed' })] });

it('pays the whole visit through the funded wallet route at the held due', async () => {
  mockWallet.mockResolvedValue({ balance: 250000 });
  mockVisit.get.mockResolvedValue(baseVisit('MATCHED'));
  mockVisit.getCheckout.mockResolvedValue(readyCheckout());
  mockFunded.wallet.mockResolvedValue({ amount: 200000, balance: 50000 });
  const tree = await mount();
  expect(texts(tree).some((t) => t.startsWith('Ví chưa đủ'))).toBe(true);
  await act(async () => { press(tree, 'mock-voucher-apply').props.onPress(); });
  expect(texts(tree).some((t) => t.startsWith('Ví chưa đủ'))).toBe(false);
  expect(String(tree.root.findAll((n) => n.props.testID === 'visit-due')[0].props.children).replace(/\s/g, ' ')).toBe('200.000 ₫');
  await act(async () => { press(tree, 'visit-pay-submit').props.onPress(); });
  await act(async () => { await Promise.resolve(); });
  expect(mockFunded.wallet).toHaveBeenCalledWith({ kind: 'VISIT_GROUP', id: 'v1' }, 'hold-1');
  expect(mockVisit.payWithWallet).not.toHaveBeenCalled();
});

it('closes a fully funded visit in one funded call and offers no other method', async () => {
  mockHeld = { ...mockHeld, discountVnd: 300000, customerDueVnd: 0 };
  mockVisit.get.mockResolvedValue(baseVisit('MATCHED'));
  mockVisit.getCheckout.mockResolvedValue(readyCheckout());
  mockFunded.zero.mockResolvedValue(undefined);
  const tree = await mount();
  await act(async () => { press(tree, 'mock-voucher-apply').props.onPress(); });
  expect(press(tree, 'visit-pay-wallet')).toBeUndefined();
  expect(press(tree, 'visit-pay-vnpay')).toBeUndefined();
  await act(async () => { press(tree, 'visit-pay-submit').props.onPress(); });
  await act(async () => { await Promise.resolve(); });
  expect(mockFunded.zero).toHaveBeenCalledWith({ kind: 'VISIT_GROUP', id: 'v1' }, 'hold-1');
  expect(mockVisit.payWithWallet).not.toHaveBeenCalled();
});

it('goes back to the full total when the voucher is released', async () => {
  mockVisit.get.mockResolvedValue(baseVisit('MATCHED'));
  mockVisit.getCheckout.mockResolvedValue(readyCheckout());
  mockVisit.payWithWallet.mockResolvedValue({ amount: 300000, balance: 700000 });
  const tree = await mount();
  await act(async () => { press(tree, 'mock-voucher-apply').props.onPress(); });
  await act(async () => { press(tree, 'mock-voucher-release').props.onPress(); });
  expect(tree.root.findAll((n) => n.props.testID === 'visit-due')).toHaveLength(0);
  await act(async () => { press(tree, 'visit-pay-submit').props.onPress(); });
  await act(async () => { await Promise.resolve(); });
  expect(mockVisit.payWithWallet).toHaveBeenCalledWith('v1');
  expect(mockFunded.wallet).not.toHaveBeenCalled();
});

it('confirms the technician cash through the hold when a voucher is held', async () => {
  mockVisit.get.mockResolvedValue(baseVisit('MATCHED'));
  mockVisit.getCheckout.mockResolvedValue(baseCheckout({ ready: true, pendingCash: { amount: 200000 }, devices: [device(1, { serviceOrderId: 'o1', state: 'succeeded', amount: 300000 })] }));
  mockFunded.confirmCash.mockResolvedValue(undefined);
  const tree = await mount();
  await act(async () => { press(tree, 'mock-voucher-apply').props.onPress(); });
  const yes = tree.root.findAll((n) => n.props.accessibilityRole === 'button' && [n.props.children].flat().some((c: unknown) => typeof c === 'object' && c !== null && 'props' in (c as object) && (c as { props: { children?: unknown } }).props.children === 'Đúng, tôi đã trả'))[0];
  await act(async () => { yes.props.onPress(); });
  await act(async () => { await Promise.resolve(); });
  expect(mockFunded.confirmCash).toHaveBeenCalledWith({ kind: 'VISIT_GROUP', id: 'v1' }, 'hold-1', { agreed: true });
  expect(mockVisit.confirmCash).not.toHaveBeenCalled();
});
