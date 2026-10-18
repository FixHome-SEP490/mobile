import React from 'react';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import CustomerWithdrawScreen from './CustomerWithdrawScreen';
import { customerWithdrawalApi } from '../../api/customer-withdrawal.api';

const mockAuthState = { isAuthenticated: true, user: { id: 'customer-1', role: 'customer' }, sessionGeneration: 4 };
const mockNavigate = jest.fn();
const mockBank = { bin: '970436', code: 'VCB', shortName: 'Vietcombank', name: 'Ngân hàng TMCP Ngoại thương Việt Nam' };
const mockAccount = { bankBin: mockBank.bin, bankCode: mockBank.code, bankName: mockBank.shortName, accountNumber: '0123456789', accountName: 'NGUYEN VAN AN', updatedAt: '2026-10-17T00:00:00.000Z' };
const mockWithdrawal = {
  id: 'withdrawal-1', amount: 100000, status: 'PROCESSING', bankName: mockBank.shortName,
  bankAccountNumber: '••••6789', bankAccountName: mockAccount.accountName,
  requestedAt: '2026-10-17T00:00:00.000Z', payoutAttemptedAt: '2026-10-17T00:00:00.000Z',
  payoutBankReference: null, failureReason: null, refundTransactionId: null, updatedAt: '2026-10-17T00:00:00.000Z',
};
let mockKycStatus: 'none' | 'pending' | 'verified' | 'rejected' = 'verified';
let mockHasAccount = true;
let mockCanWithdraw = true;
let mockOpenWithdrawal: typeof mockWithdrawal | null = null;
let mockMaximum = 200000;
let mockCurrentAccount: typeof mockAccount | null = mockAccount;
let mockHistory = { data: [] as typeof mockWithdrawal[], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } };

jest.mock('@react-navigation/native', () => {
  const ReactActual = jest.requireActual('react');
  return {
    useFocusEffect: (effect: () => void | (() => void)) => ReactActual.useEffect(effect, [effect]),
    useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
  };
});
jest.mock('../../store/auth.store', () => ({ useAuthStore: (selector: (state: typeof mockAuthState) => unknown) => selector(mockAuthState) }));
jest.mock('../../components/BackButton', () => () => null);
jest.mock('lucide-react-native', () => ({ AlertTriangle: () => null, CheckCircle2: () => null, Clock3: () => null, Landmark: () => null }));
jest.mock('../../api/customer-withdrawal.api', () => ({
  customerWithdrawalApi: {
    getInfo: jest.fn(async () => ({
      kycStatus: mockKycStatus, kycRejectionReason: null, hasBankAccount: mockHasAccount,
      bankAccount: mockHasAccount ? mockCurrentAccount : null,
      minimumAmount: 10000, maximumAmount: mockMaximum, payoutAvailable: true,
      openWithdrawal: mockOpenWithdrawal, canWithdraw: mockCanWithdraw,
    })),
    getBanks: jest.fn(async () => [mockBank]),
    getBankAccount: jest.fn(async () => mockCurrentAccount),
    saveBankAccount: jest.fn(async () => mockAccount),
    createWithdrawal: jest.fn(async () => mockWithdrawal),
    getHistory: jest.fn(async ({ page = 1, limit = 20 }: { page?: number; limit?: number } = {}) => ({
      ...mockHistory, meta: { ...mockHistory.meta, page, limit },
    })),
  },
}));

const api = customerWithdrawalApi as jest.Mocked<typeof customerWithdrawalApi>;

describe('CustomerWithdrawScreen', () => {
  beforeEach(() => {
    mockKycStatus = 'verified';
    mockHasAccount = true;
    mockCanWithdraw = true;
    mockOpenWithdrawal = null;
    mockMaximum = 200000;
    mockCurrentAccount = mockAccount;
    mockHistory = { data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } };
    jest.clearAllMocks();
  });

  it('routes to customer KYC and never offers withdrawal before verification', async () => {
    mockKycStatus = 'pending';
    mockHasAccount = false;
    mockCanWithdraw = false;
    mockCurrentAccount = null;
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<CustomerWithdrawScreen />); });
    const text = renderer.root.findAllByType(Text).map(node => String(node.props.children)).join(' ');
    expect(text).toContain('Đang chờ duyệt');
    const progress = renderer.root.findByProps({ testID: 'withdrawal-progress' });
    expect(progress.findByProps({ testID: 'withdrawal-step-kyc' }).props.accessibilityLabel).toContain('Đang chờ duyệt');
    expect(progress.findByProps({ testID: 'withdrawal-step-bank' }).props.accessibilityState.disabled).toBe(true);
    expect(renderer.root.findByProps({ testID: 'withdrawal-kyc-open' })).toBeTruthy();
    expect(renderer.root.findAllByProps({ testID: 'withdrawal-prepare' })).toHaveLength(0);
    await act(async () => renderer.root.findByProps({ testID: 'withdrawal-kyc-open' }).props.onPress());
    expect(mockNavigate).toHaveBeenCalledWith('CustomerKyc');
    await act(async () => renderer.unmount());
  });

  it('shows the server maximum and moves from KYC to bank to withdrawal as each step is ready', async () => {
    mockKycStatus = 'none';
    mockHasAccount = false;
    mockCanWithdraw = false;
    mockCurrentAccount = null;
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<CustomerWithdrawScreen />); });
    const steps = renderer.root.findByProps({ testID: 'withdrawal-progress' });
    expect(steps.findByProps({ testID: 'withdrawal-step-kyc' }).props.accessibilityLabel).toContain('Xác minh: Cần xác minh');
    expect(steps.findByProps({ testID: 'withdrawal-step-bank' }).props.accessibilityLabel).toContain('Sau xác minh');
    expect(steps.findByProps({ testID: 'withdrawal-step-withdrawal' }).props.accessibilityLabel).toContain('Sau khi liên kết');
    let screenText = renderer.root.findAllByType(Text).map(node => String(node.props.children)).join(' ');
    expect(screenText).toContain('Mức rút tối đa');
    expect(screenText).not.toMatch(/\bKYC\b/);
    await act(async () => renderer.unmount());

    mockHasAccount = true;
    mockCurrentAccount = mockAccount;
    await act(async () => { renderer = create(<CustomerWithdrawScreen />); });
    const waitingSteps = renderer.root.findByProps({ testID: 'withdrawal-progress' });
    expect(waitingSteps.findByProps({ testID: 'withdrawal-step-withdrawal' }).props.accessibilityLabel).toContain('Sau xác minh');
    screenText = renderer.root.findAllByType(Text).map(node => String(node.props.children)).join(' ');
    expect(screenText).not.toMatch(/\bKYC\b/);
    await act(async () => renderer.unmount());

    mockKycStatus = 'verified';
    mockHasAccount = true;
    mockCanWithdraw = true;
    mockCurrentAccount = mockAccount;
    await act(async () => { renderer = create(<CustomerWithdrawScreen />); });
    const readySteps = renderer.root.findByProps({ testID: 'withdrawal-progress' });
    expect(readySteps.findByProps({ testID: 'withdrawal-step-kyc' }).props.accessibilityLabel).toContain('Đã xác minh');
    expect(readySteps.findByProps({ testID: 'withdrawal-step-bank' }).props.accessibilityLabel).toContain('Đã liên kết');
    expect(readySteps.findByProps({ testID: 'withdrawal-step-withdrawal' }).props.accessibilityLabel).toContain('Sẵn sàng');
    await act(async () => renderer.unmount());
  });

  it('uses Backend minimum/maximum, snapshots the bank and amount, then posts once', async () => {
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<CustomerWithdrawScreen />); });
    expect(renderer.root.findAllByType(Text).map(node => String(node.props.children)).join(' ')).toContain('200');
    await act(async () => renderer.root.findByProps({ testID: 'withdrawal-amount' }).props.onChangeText('100.000'));
    await act(async () => renderer.root.findByProps({ testID: 'withdrawal-prepare' }).props.onPress());
    expect(renderer.root.findByProps({ testID: 'withdrawal-confirm' })).toBeTruthy();
    expect(renderer.root.findAllByType(Text).map(node => String(node.props.children)).join(' ')).toContain('••••6789');
    await act(async () => renderer.root.findByProps({ testID: 'withdrawal-confirm' }).props.onPress());
    expect(api.createWithdrawal).toHaveBeenCalledTimes(1);
    expect(api.createWithdrawal).toHaveBeenCalledWith(100000);
    expect(renderer.root.findAllByType(Text).map(node => String(node.props.children)).join(' ')).toContain('Đang xử lý');
    await act(async () => renderer.unmount());
  });

  it('does not submit an amount above the server maximum', async () => {
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<CustomerWithdrawScreen />); });
    await act(async () => renderer.root.findByProps({ testID: 'withdrawal-amount' }).props.onChangeText('300000'));
    await act(async () => renderer.root.findByProps({ testID: 'withdrawal-prepare' }).props.onPress());
    expect(api.createWithdrawal).not.toHaveBeenCalled();
    expect(renderer.root.findAllByProps({ testID: 'withdrawal-confirm' })).toHaveLength(0);
    const text = renderer.root.findAllByType(Text).map(node => String(node.props.children)).join(' ');
    expect(text).toContain('200');
    await act(async () => renderer.unmount());
  });

  it('saves bank details and waits for the Backend readback before showing them as current', async () => {
    api.saveBankAccount.mockImplementationOnce(async dto => {
      mockCurrentAccount = { ...mockAccount, accountNumber: dto.accountNumber, accountName: dto.accountName };
      return mockCurrentAccount;
    });
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<CustomerWithdrawScreen />); });
    await act(async () => renderer.root.findByProps({ testID: 'withdrawal-bank-edit' }).props.onPress());
    await act(async () => renderer.root.findByProps({ testID: 'withdrawal-account-number' }).props.onChangeText('9876543210'));
    await act(async () => renderer.root.findByProps({ testID: 'withdrawal-bank-save' }).props.onPress());
    expect(api.saveBankAccount).toHaveBeenCalledWith({ bankBin: mockBank.bin, accountNumber: '9876543210', accountName: mockAccount.accountName });
    expect(api.getBankAccount).toHaveBeenLastCalledWith();
    expect(renderer.root.findAllByType(Text).map(node => String(node.props.children)).join(' ')).toContain('••••3210');
    await act(async () => renderer.unmount());
  });

  it('locks the withdrawal after unknown POST acknowledgement and only refreshes with GET', async () => {
    api.createWithdrawal.mockRejectedValueOnce(new Error('network unavailable'));
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<CustomerWithdrawScreen />); });
    await act(async () => renderer.root.findByProps({ testID: 'withdrawal-amount' }).props.onChangeText('100000'));
    await act(async () => renderer.root.findByProps({ testID: 'withdrawal-prepare' }).props.onPress());
    await act(async () => renderer.root.findByProps({ testID: 'withdrawal-confirm' }).props.onPress());
    expect(api.createWithdrawal).toHaveBeenCalledTimes(1);
    expect(renderer.root.findByProps({ testID: 'withdrawal-prepare' }).props.disabled).toBe(true);
    expect(renderer.root.findByProps({ testID: 'withdrawal-bank-edit' }).props.disabled).toBe(true);
    expect(renderer.root.findByProps({ testID: 'withdrawal-check-status' })).toBeTruthy();
    const before = api.createWithdrawal.mock.calls.length;
    await act(async () => renderer.root.findByProps({ testID: 'withdrawal-check-status' }).props.onPress());
    expect(api.createWithdrawal).toHaveBeenCalledTimes(before);
    expect(api.getHistory).toHaveBeenCalledWith({ page: 1, limit: 20 });
    expect(renderer.root.findAllByType(Text).map(node => String(node.props.children)).join(' ')).toContain('Không gửi lại');
    await act(async () => renderer.unmount());
  });

  it('shows PROCESSING, SUCCESS, and FAILED as separate history labels', async () => {
    mockHistory = { data: [
      mockWithdrawal,
      { ...mockWithdrawal, id: 'withdrawal-2', status: 'SUCCESS' },
      { ...mockWithdrawal, id: 'withdrawal-3', status: 'FAILED' },
    ], meta: { page: 1, limit: 20, total: 3, totalPages: 1 } };
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<CustomerWithdrawScreen />); });
    const text = renderer.root.findAllByType(Text).map(node => String(node.props.children)).join(' ');
    expect(text).toContain('Đang xử lý');
    expect(text).toContain('Thành công');
    expect(text).toContain('Thất bại');
    await act(async () => renderer.unmount());
  });

  it('loads the requested next page from the separate withdrawal history endpoint', async () => {
    mockHistory = { data: [mockWithdrawal], meta: { page: 1, limit: 20, total: 21, totalPages: 2 } };
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<CustomerWithdrawScreen />); });
    await act(async () => renderer.root.findByProps({ testID: 'withdrawal-page-next' }).props.onPress());
    expect(api.getHistory).toHaveBeenLastCalledWith({ page: 2, limit: 20 });
    expect(renderer.root.findAllByType(Text).some(node => Array.isArray(node.props.children) && node.props.children.join('') === 'Trang 2 / 2')).toBe(true);
    await act(async () => renderer.unmount());
  });
});
