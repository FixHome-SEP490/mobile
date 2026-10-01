import React from 'react';
import { Alert, Text, TextInput, TouchableOpacity } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { UserRole, type UserInfo } from '../../types';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockResetNavigation = jest.fn();
const mockForgotPassword = jest.fn();
const mockResetPassword = jest.fn();
const mockRevokeAllSessions = jest.fn();
const mockLogoutApi = jest.fn();
const mockLogoutStore = jest.fn();
const mockBeginSessionTransition = jest.fn();
const mountedTrees: ReactTestRenderer[] = [];

const customer: UserInfo = {
  id: 'customer-security-1',
  email: 'customer.security@example.test',
  fullName: 'Customer Security',
  role: UserRole.CUSTOMER,
};

let mockAuthState = {
  user: customer as UserInfo | null,
  isAuthenticated: true,
  sessionGeneration: 7,
  logout: mockLogoutStore,
  beginSessionTransition: mockBeginSessionTransition,
};

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: mockGoBack,
    reset: mockResetNavigation,
  }),
}));

jest.mock('react-native-safe-area-context', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Native = require('react-native');
  return { SafeAreaView: Native.View };
});

jest.mock('@expo/vector-icons', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactModule = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Native = require('react-native');
  return {
    Ionicons: ({ name }: { name: string }) =>
      ReactModule.createElement(Native.Text, { testID: `icon-${name}` }, name),
  };
});

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(),
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Medium: 'medium', Heavy: 'heavy' },
}));

jest.mock('../../constants/theme', () => ({
  useAppTheme: () => ({
    isDark: false,
    colors: {
      primary: '#2563EB',
      primaryStrong: '#1D4ED8',
      primarySoft: '#EFF6FF',
      background: '#F8FAFC',
      surface: '#FFFFFF',
      text: '#0F172A',
      textSecondary: '#64748B',
      muted: '#94A3B8',
      border: '#E2E8F0',
      success: '#059669',
      error: '#DC2626',
    },
  }),
}));

jest.mock('../../store/auth.store', () => ({
  useAuthStore: Object.assign(
    (selector: (state: typeof mockAuthState) => unknown) => selector(mockAuthState),
    {
      getState: () => mockAuthState,
    },
  ),
}));

jest.mock('../../api/auth.api', () => ({
  authApi: {
    forgotPassword: (...args: unknown[]) => mockForgotPassword(...args),
    resetPassword: (...args: unknown[]) => mockResetPassword(...args),
    revokeAllSessions: (...args: unknown[]) => mockRevokeAllSessions(...args),
    logout: (...args: unknown[]) => mockLogoutApi(...args),
  },
}));

function screenElement() {
  const { default: CustomerSecurityScreen } = jest.requireActual('./CustomerSecurityScreen') as {
    default: React.ComponentType;
  };
  return React.createElement(CustomerSecurityScreen);
}

async function mountScreen(): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(screenElement());
    await Promise.resolve();
  });
  mountedTrees.push(tree);
  return tree;
}

function findButton(tree: ReactTestRenderer, label: string) {
  return tree.root.findAllByType(TouchableOpacity).find(
    (node) => node.props.accessibilityLabel === label,
  );
}

function hasText(tree: ReactTestRenderer, value: string): boolean {
  return tree.root.findAllByType(Text).some((node) => {
    const children = node.props.children;
    if (Array.isArray(children)) return children.join('') === value;
    return children === value;
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockAuthState = {
    user: customer,
    isAuthenticated: true,
    sessionGeneration: 7,
    logout: mockLogoutStore,
    beginSessionTransition: mockBeginSessionTransition,
  };
  mockForgotPassword.mockResolvedValue({ message: 'OTP sent' });
  mockResetPassword.mockResolvedValue({ message: 'Password reset' });
  mockRevokeAllSessions.mockResolvedValue(undefined);
  mockLogoutApi.mockResolvedValue(undefined);
});

afterEach(() => {
  act(() => {
    while (mountedTrees.length) mountedTrees.pop()?.unmount();
  });
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('CustomerSecurityScreen', () => {
  it('renders only real supported security/session actions for the signed-in customer', async () => {
    const tree = await mountScreen();

    expect(hasText(tree, 'Bảo mật tài khoản')).toBe(true);
    expect(hasText(tree, customer.email)).toBe(true);
    expect(hasText(tree, 'Đăng xuất tất cả thiết bị')).toBe(true);
    expect(hasText(tree, 'Hệ thống hiện hỗ trợ kết thúc phiên, chưa cung cấp danh sách chi tiết từng thiết bị.')).toBe(true);
  });

  it('requests OTP for the current account email and opens the password form', async () => {
    const tree = await mountScreen();
    const send = findButton(tree, 'Gửi mã OTP để đổi mật khẩu');
    expect(send).toBeDefined();

    await act(async () => {
      send?.props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockForgotPassword).toHaveBeenCalledWith(customer.email);
    expect(tree.root.findAllByType(TextInput).some(
      (node) => node.props.accessibilityLabel === 'Mã OTP đổi mật khẩu',
    )).toBe(true);
    expect(hasText(tree, 'Mã OTP đã được gửi đến email tài khoản của bạn.')).toBe(true);
  });

  it('resets the password then clears the current local session', async () => {
    const tree = await mountScreen();
    await act(async () => {
      findButton(tree, 'Gửi mã OTP để đổi mật khẩu')?.props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });

    const inputs = tree.root.findAllByType(TextInput);
    const otp = inputs.find((node) => node.props.accessibilityLabel === 'Mã OTP đổi mật khẩu');
    const password = inputs.find((node) => node.props.accessibilityLabel === 'Mật khẩu mới');
    const confirm = inputs.find((node) => node.props.accessibilityLabel === 'Xác nhận mật khẩu mới');

    act(() => {
      otp?.props.onChangeText('123456');
      password?.props.onChangeText('SecurePassword1!');
      confirm?.props.onChangeText('SecurePassword1!');
    });

    await act(async () => {
      findButton(tree, 'Xác nhận đổi mật khẩu')?.props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockResetPassword).toHaveBeenCalledWith(
      customer.email,
      '123456',
      'SecurePassword1!',
    );
    expect(mockLogoutApi).toHaveBeenCalledTimes(1);
    expect(mockLogoutStore).toHaveBeenCalledTimes(1);
    expect(mockResetNavigation).toHaveBeenCalledWith({
      index: 0,
      routes: [{ name: 'Auth' }],
    });
  });

  it('keeps the local session when revoke-all fails and reports the failure', async () => {
    mockRevokeAllSessions.mockRejectedValueOnce(new Error('offline'));
    const tree = await mountScreen();
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

    act(() => findButton(tree, 'Đăng xuất tất cả thiết bị')?.props.onPress());

    const buttons = alertSpy.mock.calls[0]?.[2] ?? [];
    const destructive = buttons.find((button) => button.style === 'destructive');
    await act(async () => {
      await destructive?.onPress?.();
      await Promise.resolve();
    });

    expect(mockRevokeAllSessions).toHaveBeenCalledTimes(1);
    expect(mockLogoutApi).not.toHaveBeenCalled();
    expect(mockLogoutStore).not.toHaveBeenCalled();
    expect(hasText(tree, 'Chưa thể đăng xuất các thiết bị khác. Phiên hiện tại vẫn được giữ.')).toBe(true);
  });

  it('does not clear a newer session when an old revoke-all request resolves late', async () => {
    let resolveRevoke: (() => void) | undefined;
    mockRevokeAllSessions.mockImplementationOnce(
      () => new Promise<void>((resolve) => { resolveRevoke = resolve; }),
    );
    const tree = await mountScreen();
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

    act(() => findButton(tree, 'Đăng xuất tất cả thiết bị')?.props.onPress());
    const destructive = (alertSpy.mock.calls[0]?.[2] ?? []).find(
      (button) => button.style === 'destructive',
    );

    act(() => {
      destructive?.onPress?.();
    });
    mockAuthState = { ...mockAuthState, sessionGeneration: 8 };
    await act(async () => {
      resolveRevoke?.();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockLogoutApi).not.toHaveBeenCalled();
    expect(mockLogoutStore).not.toHaveBeenCalled();
    expect(mockResetNavigation).not.toHaveBeenCalled();
  });
});
