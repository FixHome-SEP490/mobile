import React from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import LoginScreen from './LoginScreen';
const mockBack = jest.fn(), mockReset = jest.fn();
let mockPrevious = 'CustomerGuestHome';
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ getParent: () => ({ canGoBack: () => true, goBack: mockBack, reset: mockReset, getState: () => ({ index: 1, routes: [{ name: mockPrevious }, { name: 'Auth' }] }) }) }) }));
jest.mock('../../navigation/root-navigation', () => ({ handoffAuthenticatedRoute: jest.fn() }));
jest.mock('../../store', () => ({ useAuthStore: Object.assign(() => ({ setAuth: jest.fn() }), { getState: () => ({ user: null }) }) }));
jest.mock('../../api/auth.api', () => ({ authApi: { login: jest.fn() } }));
jest.mock('../../services/google-auth.service', () => ({ GoogleSignInCancelled: class extends Error {}, startGoogleSignIn: jest.fn() }));
jest.mock('../technician/technician-onboarding', () => ({ technicianLandingRoute: jest.fn() }));
jest.mock('../../services/customer-first-run', () => ({ markCustomerFirstRunSeen: jest.fn(async () => undefined) }));
jest.mock('../../components/GoogleSignInButton', () => () => null);
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), ImpactFeedbackStyle: { Medium: 1 } }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => { const Native = jest.requireActual<typeof import('react-native')>('react-native'); return { SafeAreaView: Native.View }; });
async function render() { let tree!: ReactTestRenderer; await act(async () => { tree = create(<LoginScreen />); }); return tree; }
beforeEach(() => { jest.clearAllMocks(); mockPrevious = 'CustomerGuestHome'; });
test('Login Back returns to existing Guest route without resetting Intro', async () => {
  const tree = await render(); await act(async () => tree.root.findByProps({ accessibilityLabel: 'Quay lại' }).props.onPress());
  expect(mockBack).toHaveBeenCalledTimes(1); expect(mockReset).not.toHaveBeenCalled();
  await act(async () => tree.unmount());
});
test('Explore from any login entry resets to Guest Home', async () => {
  mockPrevious = 'CustomerServiceDetail'; const tree = await render();
  await act(async () => tree.root.findByProps({ accessibilityLabel: 'Khám phá dịch vụ trước khi đăng nhập' }).props.onPress());
  expect(mockReset).toHaveBeenCalledWith({ index: 0, routes: [{ name: 'CustomerGuestHome' }] });
  expect(tree.root.findAllByType(Text).some(item => item.props.children === 'Khám phá')).toBe(true);
  await act(async () => tree.unmount());
});
test('Back from role entry goes to Guest and form accurately accepts backend identifier', async () => {
  mockPrevious = 'CustomerRoleChoice'; const tree = await render();
  await act(async () => tree.root.findByProps({ accessibilityLabel: 'Quay lại' }).props.onPress());
  expect(mockReset).toHaveBeenCalledWith({ index: 0, routes: [{ name: 'CustomerGuestHome' }] });
  expect(tree.root.findByProps({ accessibilityLabel: 'Email hoặc Số điện thoại' })).toBeDefined();
  await act(async () => tree.unmount());
});
