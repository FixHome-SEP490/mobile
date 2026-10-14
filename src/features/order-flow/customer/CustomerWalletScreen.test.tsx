import React from 'react';
import { act, create } from 'react-test-renderer';
import CustomerWalletScreen from './CustomerWalletScreen';
import { handleWalletUrl } from '../../../navigation/customer-wallet-return';

let mockWalletState: any;
const mockRequestTopUp: jest.Mock = jest.fn(async () => {});
const mockSubmitConfirmation: jest.Mock = jest.fn(async () => {});
const mockCancelConfirmation: jest.Mock = jest.fn();
const mockVerify: jest.Mock = jest.fn(async () => {});
const mockOpenPaymentUrl: jest.Mock = jest.fn(async () => {});
const mockHandleReturn: jest.Mock = jest.fn(async () => {});
const mockGoBack: jest.Mock = jest.fn();
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
  useNavigation: () => ({ goBack: mockGoBack }),
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
  mockOpenPaymentUrl.mockClear(); mockHandleReturn.mockClear(); mockGoBack.mockClear();
  mockAuthenticated = true; mockRole = 'customer';
  mockWalletState = { ...baseState };
});

it('failed summary GET is never zero; invalid top-up amounts never request', async () => {
  mockWalletState = { ...baseState, summary: { status: 'error', requestSeq: 1, error: 'unavailable' } };
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<CustomerWalletScreen />); });
  const text = JSON.stringify(renderer.toJSON());
  expect(text).toContain('Chưa tải được số dư');
  expect(text).not.toContain('"0 ₫"');
  await act(async () => { renderer.root.findByProps({ testID: 'wallet-topup-amount' }).props.onChangeText('5000'); });
  await act(async () => { renderer.root.findByProps({ testID: 'wallet-topup-request' }).props.onPress(); });
  expect(mockRequestTopUp).not.toHaveBeenCalled();
  expect(JSON.stringify(renderer.toJSON())).toContain('10.000');
  await act(async () => renderer.unmount());
});

it('decimal or malformed grouping never requests; well-formed groups stay exact', async () => {
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<CustomerWalletScreen />); });
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
  expect(JSON.stringify(renderer.toJSON())).toContain('không có quyền');
  expect(mockVerify).not.toHaveBeenCalled();
  expect(mockRequestTopUp).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());
});
