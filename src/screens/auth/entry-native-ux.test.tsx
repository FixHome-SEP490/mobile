import React from 'react';
import { Alert, TextInput } from 'react-native';
import LoginScreen from './LoginScreen';
import RegisterScreen from './RegisterScreen';
import VerifyRegisterOtpScreen from './VerifyRegisterOtpScreen';
import ForgotPasswordScreen from './ForgotPasswordScreen';
import ResetPasswordScreen from './ResetPasswordScreen';
import CustomerRoleChoiceScreen from '../onboarding/CustomerRoleChoiceScreen';

const mockNavigate = jest.fn();
const mockReset = jest.fn();
const mockSetAuth = jest.fn();
const mockMarkSeen = jest.fn(async () => undefined);
const mockApi = {
  login: jest.fn(), register: jest.fn(), verifyRegisterOtp: jest.fn(),
  resendRegisterOtp: jest.fn(), forgotPassword: jest.fn(), resetPassword: jest.fn(),
  exchangeGoogleCode: jest.fn(),
};
jest.mock('../../api/auth.api', () => ({ get authApi() { return mockApi; } }));
jest.mock('../../store', () => ({ useAuthStore: () => ({ setAuth: mockSetAuth }) }));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, reset: mockReset, goBack: jest.fn() }),
  useRoute: () => ({ params: { email: 'native-test@example.com', password: 'NativeTest!123' } }),
}));
jest.mock('../../services/customer-first-run', () => ({ markCustomerFirstRunSeen: () => mockMarkSeen() }));
jest.mock('../../services/google-auth.service', () => ({
  startGoogleSignIn: jest.fn(), GoogleSignInCancelled: class extends Error {},
}));
jest.mock('../technician/technician-onboarding', () => ({ technicianLandingRoute: async () => 'TechnicianOnboarding' }));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), selectionAsync: jest.fn(), ImpactFeedbackStyle: { Medium: 'medium' } }));
jest.mock('react-native-safe-area-context', () => {
  const Native = jest.requireActual('react-native');
  return { SafeAreaView: Native.View };
});
jest.mock('@expo/vector-icons', () => {
  const Native = jest.requireActual('react-native');
  return { Ionicons: Native.View };
});
jest.mock('lucide-react-native', () => {
  const Native = jest.requireActual('react-native');
  return new Proxy({}, { get: () => Native.View });
});

type Node = { props: Record<string, any> };
type Tree = { root: { findByProps: (props: Record<string, unknown>) => Node; findAllByType: (type: unknown) => Node[] }; unmount: () => void };
const { act, create } = jest.requireActual('react-test-renderer') as {
  act: (callback: () => void | Promise<void>) => Promise<void>;
  create: (element: React.ReactElement) => Tree;
};
let tree: Tree;
async function render(element: React.ReactElement) { await act(async () => { tree = create(element); }); }
async function fill(label: string, value: string) {
  await act(async () => { tree.root.findByProps({ accessibilityLabel: label }).props.onChangeText(value); });
}
async function press(label: string) {
  await act(async () => { await tree.root.findByProps({ accessibilityLabel: label }).props.onPress(); });
}
beforeEach(() => { jest.clearAllMocks(); jest.spyOn(Alert, 'alert').mockImplementation(() => {}); });
afterEach(async () => { if (tree) await act(async () => tree.unmount()); jest.restoreAllMocks(); });

it.each([LoginScreen, RegisterScreen, VerifyRegisterOtpScreen, ForgotPasswordScreen, ResetPasswordScreen])('%p never authenticates or sends OTP at mount', async (Screen) => {
  await render(<Screen />);
  Object.values(mockApi).forEach((request) => expect(request).not.toHaveBeenCalled());
  expect(mockSetAuth).not.toHaveBeenCalled();
});

it('keeps Customer onboarding and Technician Auth routes', async () => {
  await render(<CustomerRoleChoiceScreen />);
  await press('Tiếp tục với vai trò khách hàng');
  expect(mockNavigate).toHaveBeenCalledWith('CustomerOnboarding');
  await press('Tiếp tục với vai trò kỹ thuật viên');
  expect(mockReset).toHaveBeenCalledWith({ index: 0, routes: [{ name: 'Auth' }] });
  expect(mockMarkSeen).not.toHaveBeenCalled();
});

it('gives registration role choices a clear prompt, labels and selected state', async () => {
  await render(<RegisterScreen />);

  const prompt = tree.root.findByProps({ accessibilityLabel: 'Vai trò tài khoản' });
  const customer = tree.root.findByProps({ accessibilityLabel: 'Khách hàng, Đặt lịch sửa chữa' });
  const technician = tree.root.findByProps({ accessibilityLabel: 'Kỹ thuật viên, Gia nhập FixHome' });

  expect(prompt).toBeDefined();
  expect(customer.props.accessibilityRole).toBe('radio');
  expect(customer.props.accessibilityState).toEqual({ checked: true, selected: true });
  expect(customer.props['aria-checked']).toBe(true);
  expect(technician.props.accessibilityRole).toBe('radio');
  expect(technician.props.accessibilityState).toEqual({ checked: false, selected: false });
  expect(technician.props['aria-checked']).toBe(false);

  await press('Kỹ thuật viên, Gia nhập FixHome');
  expect(customer.props.accessibilityState).toEqual({ checked: false, selected: false });
  expect(customer.props['aria-checked']).toBe(false);
  expect(technician.props.accessibilityState).toEqual({ checked: true, selected: true });
  expect(technician.props['aria-checked']).toBe(true);
});

it('logs in through the existing API and routes by the returned role', async () => {
  mockApi.login.mockResolvedValue({ accessToken: 'mock-token', user: { id: 'mock-customer', role: 'customer' } });
  await render(<LoginScreen />);
  await fill('Email', 'native-test@example.com');
  await fill('Mật khẩu', 'NativeTest!123');
  await press('Đăng nhập');
  expect(mockApi.login).toHaveBeenCalledWith({ email: 'native-test@example.com', password: 'NativeTest!123' });
  expect(mockReset).toHaveBeenCalledWith({ index: 0, routes: [{ name: 'CustomerMain' }] });
});

it('registers without opening a session, then requires email OTP', async () => {
  mockApi.register.mockResolvedValue({ email: 'native-test@example.com' });
  await render(<RegisterScreen />);
  await fill('Họ và tên', 'Native Test');
  await fill('Email', 'native-test@example.com');
  await fill('Mật khẩu', 'NativeTest!123');
  await fill('Xác nhận mật khẩu', 'NativeTest!123');
  await fill('Số điện thoại', '0901234567');
  await press('Đăng ký tài khoản');
  expect(mockApi.register).toHaveBeenCalledWith({ fullName: 'Native Test', email: 'native-test@example.com', password: 'NativeTest!123', phoneNumber: '0901234567', role: 'customer' });
  expect(mockReset).toHaveBeenCalledWith({ index: 0, routes: [{ name: 'VerifyRegisterOtp', params: { email: 'native-test@example.com', password: 'NativeTest!123' } }] });
  expect(mockSetAuth).not.toHaveBeenCalled();
});

it('rejects short OTP and preserves resend cooldown after the backend deadline', async () => {
  mockApi.resendRegisterOtp.mockResolvedValue({ resendAvailableAt: new Date(Date.now() + 60000).toISOString() });
  await render(<VerifyRegisterOtpScreen />);
  await fill('Mã OTP gồm 6 số', '123');
  await press('Xác nhận OTP');
  expect(mockApi.verifyRegisterOtp).not.toHaveBeenCalled();
  expect(mockApi.login).not.toHaveBeenCalled();
  await press('Gửi lại OTP');
  expect(mockApi.resendRegisterOtp).toHaveBeenCalledWith('native-test@example.com');
  expect(tree.root.findByProps({ accessibilityLabel: 'Gửi lại OTP' }).props.disabled).toBe(true);
});

it('only moves to ResetPassword after forgotPassword succeeds', async () => {
  mockApi.forgotPassword.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({});
  await render(<ForgotPasswordScreen />);
  await fill('Email', ' native-test@example.com ');
  await press('Gửi mã OTP');
  expect(mockNavigate).not.toHaveBeenCalled();
  await press('Gửi mã OTP');
  expect(mockApi.forgotPassword).toHaveBeenCalledWith('native-test@example.com');
  expect(mockNavigate).toHaveBeenCalledWith('ResetPassword', { email: 'native-test@example.com' });
});

it('shows and hides reset passwords without sending a request and rejects missing OTP', async () => {
  await render(<ResetPasswordScreen />);
  await fill('Mật khẩu mới', 'NativeTest!123');
  await fill('Xác nhận mật khẩu mới', 'NativeTest!123');
  expect(tree.root.findByProps({ accessibilityLabel: 'Mật khẩu mới' }).props.secureTextEntry).toBe(true);
  await press('Hiện mật khẩu mới');
  expect(tree.root.findByProps({ accessibilityLabel: 'Mật khẩu mới' }).props.secureTextEntry).toBe(false);
  await press('Ẩn mật khẩu mới');
  await press('Đặt lại mật khẩu');
  expect(mockApi.resetPassword).not.toHaveBeenCalled();
  expect(tree.root.findAllByType(TextInput)).toHaveLength(3);
});

it('resets through the real OTP contract and waits for success before the login handoff', async () => {
  mockApi.resetPassword.mockResolvedValue({});
  await render(<ResetPasswordScreen />);
  await fill('Mã OTP gồm 6 số', '123456');
  await fill('Mật khẩu mới', 'NativeTest!123');
  await fill('Xác nhận mật khẩu mới', 'NativeTest!123');
  await press('Đặt lại mật khẩu');
  expect(mockApi.resetPassword).toHaveBeenCalledWith('native-test@example.com', '123456', 'NativeTest!123');
  expect(mockSetAuth).not.toHaveBeenCalled();
  expect(Alert.alert).toHaveBeenCalledWith('Thành công', expect.any(String), expect.any(Array));
});

it.each(['customer', 'technician'])('verifies email OTP before the %s session handoff', async (role) => {
  mockApi.verifyRegisterOtp.mockResolvedValue({ accessToken: 'mock-token', user: { id: 'mock-user', role } });
  await render(<VerifyRegisterOtpScreen />);
  await fill('Mã OTP gồm 6 số', '123456');
  expect(mockApi.verifyRegisterOtp).toHaveBeenCalledWith('native-test@example.com', '123456');
  expect(mockApi.login).not.toHaveBeenCalled();
  expect(mockSetAuth).toHaveBeenCalledWith('mock-token', { id: 'mock-user', role });
  expect(mockReset).toHaveBeenCalledWith({ index: 0, routes: [{ name: role === 'technician' ? 'TechnicianOnboarding' : 'CustomerMain' }] });
});

it('blocks keyboard resubmission and Google while email login is pending', async () => {
  let resolve!: (value: unknown) => void;
  mockApi.login.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
  await render(<LoginScreen />);
  await fill('Email', 'native-test@example.com');
  await fill('Mật khẩu', 'NativeTest!123');
  await act(async () => { void tree.root.findByProps({ accessibilityLabel: 'Đăng nhập' }).props.onPress(); });
  expect(tree.root.findByProps({ accessibilityLabel: 'Đăng nhập' }).props.disabled).toBe(true);
  expect(tree.root.findByProps({ accessibilityLabel: 'Đăng nhập với Google' }).props.disabled).toBe(true);
  await act(async () => { tree.root.findByProps({ accessibilityLabel: 'Mật khẩu' }).props.onSubmitEditing(); });
  expect(mockApi.login).toHaveBeenCalledTimes(1);
  await act(async () => { resolve({ accessToken: 'mock-token', user: { id: 'mock-customer', role: 'customer' } }); });
});


it('locks password, keyboard and Google login synchronously before React renders loading', async () => {
  let releaseLogin!: (value: unknown) => void;
  mockApi.login.mockImplementationOnce(() => new Promise((resolve) => { releaseLogin = resolve; }));
  await render(<LoginScreen />);
  await fill('Email', 'native-test@example.com');
  await fill('Mật khẩu', 'NativeTest!123');
  const googleStart = jest.requireMock('../../services/google-auth.service').startGoogleSignIn as jest.Mock;
  await act(async () => {
    void tree.root.findByProps({ accessibilityLabel: 'Đăng nhập' }).props.onPress();
    void tree.root.findByProps({ accessibilityLabel: 'Đăng nhập' }).props.onPress();
    void tree.root.findByProps({ accessibilityLabel: 'Mật khẩu' }).props.onSubmitEditing();
    void tree.root.findByProps({ accessibilityLabel: 'Đăng nhập với Google' }).props.onPress();
  });
  expect(mockApi.login).toHaveBeenCalledTimes(1);
  expect(googleStart).not.toHaveBeenCalled();
  expect(mockApi.exchangeGoogleCode).not.toHaveBeenCalled();
  await act(async () => { releaseLogin({ accessToken: 'mock-token', user: { id: 'mock-customer', role: 'customer' } }); });
  expect(mockSetAuth).toHaveBeenCalledTimes(1);
});

it('locks password login while Google authentication starts in the same event turn', async () => {
  let releaseGoogle!: (value: string) => void;
  const googleStart = jest.requireMock('../../services/google-auth.service').startGoogleSignIn as jest.Mock;
  googleStart.mockImplementationOnce(() => new Promise((resolve) => { releaseGoogle = resolve; }));
  mockApi.exchangeGoogleCode.mockResolvedValue({ accessToken: 'google-mock-token', user: { id: 'mock-customer', role: 'customer' } });
  await render(<LoginScreen />);
  await fill('Email', 'native-test@example.com');
  await fill('Mật khẩu', 'NativeTest!123');
  await act(async () => {
    void tree.root.findByProps({ accessibilityLabel: 'Đăng nhập với Google' }).props.onPress();
    void tree.root.findByProps({ accessibilityLabel: 'Đăng nhập' }).props.onPress();
    void tree.root.findByProps({ accessibilityLabel: 'Đăng nhập với Google' }).props.onPress();
  });
  expect(googleStart).toHaveBeenCalledTimes(1);
  expect(mockApi.login).not.toHaveBeenCalled();
  await act(async () => { releaseGoogle('mock-code'); });
  expect(mockApi.exchangeGoogleCode).toHaveBeenCalledWith('mock-code');
  expect(mockSetAuth).toHaveBeenCalledTimes(1);
});

it('keeps server rate-limit errors visible without navigating or creating a session', async () => {
  mockApi.forgotPassword.mockRejectedValueOnce({ response: { status: 429, data: { error: { message: 'Vui lòng thử lại sau.' } } } });
  await render(<ForgotPasswordScreen />);
  await fill('Email', 'native-test@example.com');
  await press('Gửi mã OTP');
  expect(mockNavigate).not.toHaveBeenCalled();
  expect(mockSetAuth).not.toHaveBeenCalled();
  expect(tree.root.findByProps({ accessibilityRole: 'alert' })).toBeDefined();
  expect(tree.root.findByProps({ accessibilityLabel: 'Gửi mã OTP' }).props.disabled).toBe(false);
});
