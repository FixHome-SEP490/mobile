import React from 'react';
import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import CustomerWalletScreen from './CustomerWalletScreen';
import { handleWalletUrl } from '../../../navigation/customer-wallet-return';
const dump = (r: { toJSON: () => unknown }) => JSON.stringify(r.toJSON(), (k, v) => (k === 'refreshControl' ? undefined : v));

let mockWalletState: any;
const mockRequestTopUp: jest.Mock = jest.fn(async () => {});
const mockSubmitConfirmation: jest.Mock = jest.fn(async () => {});
const mockCancelConfirmation: jest.Mock = jest.fn();
const mockVerify: jest.Mock = jest.fn(async () => {});
const mockOpenPaymentUrl: jest.Mock = jest.fn(async () => {});
const mockHandleReturn: jest.Mock = jest.fn(async () => {});
const mockGoBack: jest.Mock = jest.fn();
const mockNavigate: jest.Mock = jest.fn();
let mockAuthenticated = true;
let mockRole: string | null = 'customer';

jest.mock('./useCustomerWallet', () => ({
  useCustomerWallet: () => ({
    controller: {
      requestTopUp: (...args: unknown[]) => mockRequestTopUp(...args),
      submitConfirmation: (...args: unknown[]) => mockSubmitConfirmation(...args),
      cancelConfirmation: (...args: unknown[]) => mockCancelConfirmation(...args),
      verify: (...args: unknown[]) => mockVerify(...args),
      openPaymentUrl: (...args: unknown[]) => mockOpenPaymentUrl(...args),
      handleReturn: (...args: unknown[]) => mockHandleReturn(...args),
    },
    state: mockWalletState,
  }),
}));
jest.mock('../../../store/auth.store', () => ({
  useAuthStore: (selector: (s: { isAuthenticated: boolean; user: { role: string } | null }) => unknown) =>
    selector({ isAuthenticated: mockAuthenticated, user: mockRole ? { role: mockRole } : null }),
}));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: mockGoBack, navigate: mockNavigate }),
  useIsFocused: () => true,
}));
jest.mock('react-native-safe-area-context', () => {
  const Native = jest.requireActual('react-native');
  return { SafeAreaView: Native.View, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
});
jest.mock('../../../hooks/useKeyboardInset', () => ({ useKeyboardInset: () => 0 }));

const baseState = {
  phase: 'idle', confirmation: null, summary: { status: 'unloaded', requestSeq: 0 }, urlReady: false, message: null,
};

beforeEach(() => {
  mockRequestTopUp.mockClear(); mockSubmitConfirmation.mockClear(); mockVerify.mockClear();
  mockOpenPaymentUrl.mockClear(); mockHandleReturn.mockClear(); mockGoBack.mockClear(); mockNavigate.mockClear();
  mockAuthenticated = true; mockRole = 'customer';
  mockWalletState = { ...baseState };
});

async function expandTopUp(renderer: ReturnType<typeof create>) {
  await act(async () => { renderer.root.findByProps({ testID: 'wallet-topup-expand' }).props.onPress(); });
}

it('presents the balance as a blue hero with adjacent top-up and withdrawal actions', async () => {
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<CustomerWalletScreen />); });
  const hero = renderer.root.findByProps({ testID: 'wallet-balance-hero' });
  const heroStyle = Array.isArray(hero.props.style) ? Object.assign({}, ...hero.props.style) : hero.props.style;
  expect(heroStyle.backgroundColor).toBe('#193E70');
  const actions = renderer.root.findByProps({ testID: 'wallet-primary-actions' });
  const labels = actions.findAllByType(Text).map(node => String(node.props.children));
  expect(labels).toEqual(expect.arrayContaining(['Nạp tiền', 'Rút tiền']));
  expect(actions.findByProps({ testID: 'wallet-topup-expand' }).props.accessibilityRole).toBe('button');
  expect(actions.findByProps({ testID: 'wallet-withdraw-open' }).props.accessibilityLabel).toBe('Rút tiền');
  expect(renderer.root.findAllByProps({ testID: 'wallet-topup-amount' })).toHaveLength(0);
  await act(async () => renderer.unmount());
});

it('expands top-up in place and keeps the request action beside its form', async () => {
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<CustomerWalletScreen />); });
  await expandTopUp(renderer);
  const panel = renderer.root.findByProps({ testID: 'wallet-topup-panel' });
  expect(panel.findByProps({ testID: 'wallet-topup-amount' })).toBeTruthy();
  expect(panel.findByProps({ testID: 'wallet-topup-request' })).toBeTruthy();
  expect(renderer.root.findAllByProps({ testID: 'wallet-topup-open-sheet' })).toHaveLength(0);
  await act(async () => renderer.unmount());
});

it('failed summary GET is never zero; invalid top-up amounts never request', async () => {
  mockWalletState = { ...baseState, summary: { status: 'error', requestSeq: 1, error: 'unavailable' } };
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<CustomerWalletScreen />); });
  const text = dump(renderer);
  expect(text).toContain('Chưa tải được số dư');
  expect(text).not.toContain('"0 ₫"');
  await expandTopUp(renderer);
  await act(async () => { renderer.root.findByProps({ testID: 'wallet-topup-amount' }).props.onChangeText('5000'); });
  await act(async () => { renderer.root.findByProps({ testID: 'wallet-topup-request' }).props.onPress(); });
  expect(mockRequestTopUp).not.toHaveBeenCalled();
  expect(dump(renderer)).toContain('10.000');
  await act(async () => renderer.unmount());
});

it('opens the customer-only bank and withdrawal route from the wallet without adding a tab', async () => {
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<CustomerWalletScreen />); });
  await act(async () => renderer.root.findByProps({ testID: 'wallet-withdraw-open' }).props.onPress());
  expect(mockNavigate).toHaveBeenCalledWith('CustomerWithdraw');
  await act(async () => renderer.unmount());
});

it('labels all seven ledger rows and shows their authoritative incoming or outgoing direction', async () => {
  mockWalletState = {
    ...baseState,
    summary: {
      status: 'ready', requestSeq: 1, fetchedAt: 1,
      data: {
        balance: 10000,
        transactions: [
          { id: 'top-up-1', type: 'top_up', amount: '10000', balanceAfter: '10000', description: null, referenceType: null, referenceId: null, createdAt: '2026-10-14T00:00:00Z' },
          { id: 'invoice-payment-1', type: 'invoice_payment', amount: '10000', balanceAfter: '10000', description: null, referenceType: null, referenceId: null, createdAt: '2026-10-14T00:00:00Z' },
          { id: 'refund-1', type: 'refund', amount: '10000', balanceAfter: '10000', description: null, referenceType: null, referenceId: null, createdAt: '2026-10-14T00:00:00Z' },
          { id: 'adjustment-credit-1', type: 'adjustment_credit', amount: '10000', balanceAfter: '10000', description: null, referenceType: null, referenceId: null, createdAt: '2026-10-14T00:00:00Z' },
          { id: 'adjustment-debit-1', type: 'adjustment_debit', amount: '10000', balanceAfter: '10000', description: null, referenceType: null, referenceId: null, createdAt: '2026-10-14T00:00:00Z' },
          { id: 'withdrawal-1', type: 'withdrawal', amount: '10000', balanceAfter: '10000', description: null, referenceType: null, referenceId: null, createdAt: '2026-10-14T00:00:00Z' },
          { id: 'withdrawal-refund-1', type: 'withdrawal_refund', amount: '10000', balanceAfter: '10000', description: null, referenceType: null, referenceId: null, createdAt: '2026-10-14T00:01:00Z' },
        ],
        meta: { page: 1, limit: 20, total: 7, totalPages: 1 },
      },
    },
  };
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<CustomerWalletScreen />); });
  const expected = new Map([
    ['top_up', ['Nạp tiền', '+10.000']],
    ['invoice_payment', ['Thanh toán hóa đơn', '-10.000']],
    ['refund', ['Hoàn tiền', '+10.000']],
    ['adjustment_credit', ['Điều chỉnh cộng', '+10.000']],
    ['adjustment_debit', ['Điều chỉnh trừ', '-10.000']],
    ['withdrawal', ['Rút tiền', '-10.000']],
    ['withdrawal_refund', ['Hoàn tiền rút tiền', '+10.000']],
  ]);
  for (const [type, [label, signedAmount]] of expected) {
    const row = renderer.root.findByProps({ testID: `wallet-tx-${type.replace('_', '-')}-1` });
    const rowText = row.findAllByType(Text).map((node: any) => String(node.props.children)).join(' ');
    expect(rowText).toContain(label);
    expect(rowText).toContain(signedAmount);
  }
  await act(async () => renderer.unmount());
});

it('never shows the raw transaction reference', async () => {
  const referenceId = 'b43eb49e-3921-4df0-a556-a110d8610123';
  mockWalletState = {
    ...baseState,
    summary: {
      status: 'ready', requestSeq: 1, fetchedAt: 1,
      data: {
        balance: '20000',
        transactions: [{ id: 'top-up-ref', type: 'top_up', amount: '20000', balanceAfter: '20000', description: null, referenceType: 'PAYMENT', referenceId, createdAt: '2026-10-14T00:00:00Z' }],
        meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
      },
    },
  };
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<CustomerWalletScreen />); });
  const row = renderer.root.findByProps({ testID: 'wallet-tx-top-up-ref' });
  expect(row.findAllByType(Text).map(node => String(node.props.children)).join(' ')).not.toContain(referenceId);
  expect(dump(renderer)).not.toContain(referenceId);
  expect(renderer.root.findAllByProps({ testID: 'wallet-tx-details-top-up-ref' })).toHaveLength(0);
  await act(async () => renderer.unmount());
});

it('keeps top-up locked after an unknown result until the ledger is reconciled', async () => {
  mockWalletState = {
    ...baseState,
    phase: 'unknown',
    summary: { status: 'ready', requestSeq: 1, fetchedAt: 1, data: { balance: '50000', transactions: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } } },
  };
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<CustomerWalletScreen />); });
  await expandTopUp(renderer);
  const amount = renderer.root.findByProps({ testID: 'wallet-topup-amount' });
  expect(amount.props.editable).toBe(false);
  const action = renderer.root.findByProps({ testID: 'wallet-topup-request' });
  expect(action.props.disabled).toBe(true);
  await act(async () => action.props.onPress());
  expect(mockRequestTopUp).not.toHaveBeenCalled();
  expect(dump(renderer)).toContain('chưa rõ kết quả');
  await act(async () => renderer.unmount());
});

it('decimal or malformed grouping never requests; well-formed groups stay exact', async () => {
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<CustomerWalletScreen />); });
  await expandTopUp(renderer);
  for (const text of ['10000.5', '10.000.5', '1.00.000']) {
    await act(async () => { renderer.root.findByProps({ testID: 'wallet-topup-amount' }).props.onChangeText(text); });
    await act(async () => { renderer.root.findByProps({ testID: 'wallet-topup-request' }).props.onPress(); });
  }
  expect(mockRequestTopUp).not.toHaveBeenCalled();
  await act(async () => { renderer.root.findByProps({ testID: 'wallet-topup-amount' }).props.onChangeText('100.000'); });
  await act(async () => { renderer.root.findByProps({ testID: 'wallet-topup-request' }).props.onPress(); });
  expect(mockRequestTopUp).toHaveBeenCalledWith(100000);
  await act(async () => renderer.unmount());
});

it('valid amount freezes an explicit confirmation; root-held forged return only triggers GET', async () => {
  mockWalletState = {
    ...baseState,
    summary: { status: 'ready', requestSeq: 1, fetchedAt: 1, data: { balance: '50000', transactions: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } } },
  };
  // The root gate keeps a canonical signal only; the screen spends it GET-only.
  handleWalletUrl('fixhome://app/wallet?payment=success&amount=50000000&paymentId=forged',
    { authenticated: true, role: 'customer' }, { ready: false, hasWalletRoute: true, navigate: () => {} });
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<CustomerWalletScreen />); });
  await expandTopUp(renderer);
  await act(async () => {});
  expect(mockVerify).toHaveBeenCalled();
  expect(mockHandleReturn).not.toHaveBeenCalled();
  expect(mockSubmitConfirmation).not.toHaveBeenCalled();
  await act(async () => { renderer.root.findByProps({ testID: 'wallet-topup-amount' }).props.onChangeText('100000'); });
  await act(async () => { renderer.root.findByProps({ testID: 'wallet-topup-request' }).props.onPress(); });
  expect(mockRequestTopUp).toHaveBeenCalledWith(100000);
  mockWalletState = {
    ...mockWalletState,
    phase: 'confirming',
    confirmation: { owner: { userId: 'customer', role: 'customer', sessionGeneration: 1 }, dto: { amount: 100000, idempotencyKey: 'key-1' } },
  };
  await act(async () => { renderer.update(<CustomerWalletScreen />); });
  await act(async () => { renderer.root.findByProps({ testID: 'wallet-topup-open-sheet' }).props.onPress(); });
  await act(async () => { renderer.root.findByProps({ testID: 'wallet-topup-submit' }).props.onPress(); });
  expect(mockSubmitConfirmation).toHaveBeenCalledTimes(1);
  await act(async () => renderer.unmount());
});

it('non-customer roles see no wallet content and send nothing', async () => {
  mockRole = 'technician';
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<CustomerWalletScreen />); });
  expect(dump(renderer)).toContain('không có quyền');
  expect(mockVerify).not.toHaveBeenCalled();
  expect(mockRequestTopUp).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());
});
