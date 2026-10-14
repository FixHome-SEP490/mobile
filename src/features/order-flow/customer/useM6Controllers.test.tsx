import React from 'react';
import { AppState, View } from 'react-native';
import { useAuthStore } from '../../../store/auth.store';
import { ordersApi } from '../../../api/orders.api';
import { customerWalletApi } from '../../../api/customer-wallet.api';
import { useCustomerOrderPayment } from './useCustomerOrderPayment';
import { useCustomerWallet } from './useCustomerWallet';
import { useTechnicianCompletion } from '../technician/useTechnicianCompletion';
import { useTechnicianCashDeclaration } from '../technician/useTechnicianCashDeclaration';
import { m6Fixture, deferred } from './m6-fixtures.test-utils';
import { createWalletTopUpJournal } from './wallet-top-up-journal';
let mockFixture: ReturnType<typeof m6Fixture>;
let mockFocused = true;
jest.mock('@react-navigation/native', () => ({ useIsFocused: () => mockFocused }));
jest.mock('../runtime/OrderSessionProvider', () => ({ useOrderSession: () => ({ ...mockFixture.runtime, key: mockFixture.key, snapshot: mockFixture.coordinator.getSnapshot() }) }));
jest.mock('../../../api/client', () => ({ __esModule: true, default: {} }));
jest.mock('@react-native-async-storage/async-storage', () => ({ __esModule: true, default: { getItem: async () => null, setItem: async () => {} } }));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(async () => ({})) }));
const { act, create } = jest.requireActual('react-test-renderer');
it.each(['completion', 'cash', 'payment'] as const)('real %s hook fences unmount during durable reservation; lifecycle sends zero mutations', async kind => {
  const role = kind === 'payment' ? 'customer' : 'technician'; mockFixture = m6Fixture(role); mockFixture.server.order.completionRequestedAt = kind === 'completion' ? '' : '2026-10-14T00:00:00Z';
  useAuthStore.setState({ isAuthenticated: true, user: { id: mockFixture.key.userId, role } as never, sessionGeneration: 1 });
  Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
  const payment = jest.spyOn(ordersApi, 'payInvoiceWithWallet').mockResolvedValue({});
  const completion = jest.spyOn(ordersApi, 'requestCompletion').mockResolvedValue({});
  const cash = jest.spyOn(ordersApi, 'declareCashSettlement').mockResolvedValue({});
  jest.spyOn(customerWalletApi, 'getSummary').mockImplementation(async () => mockFixture.server.wallet as never);
  let controller: ReturnType<typeof useCustomerOrderPayment>['controller'] | ReturnType<typeof useTechnicianCompletion>['controller'] | ReturnType<typeof useTechnicianCashDeclaration>['controller'];
  function CompletionHarness() { controller = useTechnicianCompletion().controller; return <View />; }
  function CashHarness() { controller = useTechnicianCashDeclaration().controller; return <View />; }
  function PaymentHarness() { controller = useCustomerOrderPayment().controller; return <View />; }
  const Harness = kind === 'completion' ? CompletionHarness : kind === 'cash' ? CashHarness : PaymentHarness;
  let tree: { unmount: () => void }; await act(async () => { tree = create(<Harness />); });
  await act(async () => {
    if ('requestCompletion' in controller) await controller.requestCompletion('Bàn giao');
    else if ('requestDeclaration' in controller) await controller.requestDeclaration({ declaredAmount: 120000 });
    else await controller.requestPayment('wallet');
  });
  const gate = deferred<void>(), reserved = deferred<void>(); mockFixture.deferStorage(() => { reserved.resolve(); return gate.promise; });
  let pending!: Promise<void>; await act(async () => { pending = controller.submitConfirmation(); await reserved.promise; });
  await act(async () => tree.unmount()); gate.resolve(); await pending;
  expect(payment).not.toHaveBeenCalled(); expect(completion).not.toHaveBeenCalled(); expect(cash).not.toHaveBeenCalled(); jest.restoreAllMocks();
});
it('wallet hook GETs on foreground but blur/renew invalidates confirmation and never POSTs', async () => {
  useAuthStore.setState({ isAuthenticated: true, user: { id: 'customer', role: 'customer' } as never, sessionGeneration: 1 });
  Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
  jest.spyOn(customerWalletApi, 'getSummary').mockResolvedValue({ balance: 0, transactions: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } });
  const post = jest.spyOn(customerWalletApi, 'topUp').mockResolvedValue({ paymentId: 'payment', paymentUrl: 'https://payments.example.test/start' });
  const journal = createWalletTopUpJournal({ getItem: async () => null, setItem: async () => {} });
  let hook!: ReturnType<typeof useCustomerWallet>;
  function Harness() { hook = useCustomerWallet(journal); return <View />; }
  let tree: { update: (node: React.ReactElement) => void; unmount: () => void };
  await act(async () => { tree = create(<Harness />); });
  await act(async () => { await hook.controller.requestTopUp(10000); }); expect(hook.state.phase).toBe('confirming');
  mockFocused = false; await act(async () => tree.update(<Harness />)); await hook.controller.submitConfirmation(); expect(post).not.toHaveBeenCalled();
  await act(async () => { useAuthStore.setState({ sessionGeneration: 2 }); }); expect(hook.state.confirmation).toBeNull();
  await act(async () => tree.unmount()); mockFocused = true; jest.restoreAllMocks();
});
it('an immediate background/active pair still revokes a captured payment confirmation', async () => {
  mockFixture = m6Fixture(); useAuthStore.setState({ isAuthenticated: true, user: { id: 'customer', role: 'customer' } as never, sessionGeneration: 1 });
  Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
  const listeners: ((value: 'active' | 'background') => void)[] = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => { listeners.push(listener); return { remove: () => {} }; });
  const post = jest.spyOn(ordersApi, 'payInvoiceWithWallet').mockResolvedValue({});
  jest.spyOn(customerWalletApi, 'getSummary').mockImplementation(async () => mockFixture.server.wallet as never);
  let hook!: ReturnType<typeof useCustomerOrderPayment>;
  function Harness() { hook = useCustomerOrderPayment(); return <View />; }
  let tree: { unmount: () => void }; await act(async () => { tree = create(<Harness />); });
  await act(async () => { await hook.controller.requestPayment('wallet'); });
  await act(async () => { listeners.forEach(f => f('background')); listeners.forEach(f => f('active')); });
  await act(async () => { await hook.controller.submitConfirmation(); }); expect(post).not.toHaveBeenCalled();
  await act(async () => tree.unmount()); jest.restoreAllMocks();
});
it('fresh invoice replacement invalidates the hook confirmation before a stale modal can submit', async () => {
  mockFixture = m6Fixture(); useAuthStore.setState({ isAuthenticated: true, user: { id: 'customer', role: 'customer' } as never, sessionGeneration: 1 });
  Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
  jest.spyOn(customerWalletApi, 'getSummary').mockImplementation(async () => mockFixture.server.wallet as never);
  const post = jest.spyOn(ordersApi, 'payInvoiceWithWallet').mockResolvedValue({});
  let hook!: ReturnType<typeof useCustomerOrderPayment>;
  function Harness() { hook = useCustomerOrderPayment(); return <View />; }
  let tree: { unmount: () => void; update: (node: React.ReactElement) => void }; await act(async () => { tree = create(<Harness />); });
  await act(async () => { await hook.controller.requestPayment('wallet'); }); expect(hook.state.confirmation).not.toBeNull();
  mockFixture.server.invoice!.id = 'replacement'; await mockFixture.coordinator.loadResource(mockFixture.key, 'invoice');
  await act(async () => tree.update(<Harness />));
  const captured = hook.state.confirmation; await act(async () => { await hook.controller.submitConfirmation(); tree.unmount(); });
  expect(captured).toBeNull(); expect(post).not.toHaveBeenCalled(); jest.restoreAllMocks();
});
