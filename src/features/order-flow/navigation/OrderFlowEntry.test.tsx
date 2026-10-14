import React from 'react';
import { act, create } from 'react-test-renderer';
import OrderFlowEntry from './OrderFlowEntry';

let mockRouteParams: Record<string, unknown> = { serviceOrderId: 'order-1', role: 'technician' };
jest.mock('@react-navigation/native', () => ({ useRoute: () => ({ params: mockRouteParams }) }));
jest.mock('../../../store/auth.store', () => ({ useAuthStore: () => ({ isAuthenticated: true, user: { id: 'customer-1', role: 'customer' } }) }));
jest.mock('../runtime/OrderSessionProvider', () => ({ OrderSessionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
jest.mock('./OrderFlowNavigator', () => {
  const Native = jest.requireActual('react-native');
  const ReactRuntime = jest.requireActual('react');
  return { __esModule: true, default: ({ role }: { role: string }) => ReactRuntime.createElement(Native.Text, { testID: 'authenticated-role' }, role) };
});
jest.mock('react-native-safe-area-context', () => {
  const Native = jest.requireActual('react-native');
  return { SafeAreaView: Native.View };
});

it('derives the preview reader role from authenticated state and ignores route role fields', async () => {
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<OrderFlowEntry />); });
  expect(renderer.root.findByProps({ testID: 'authenticated-role' }).props.children).toBe('customer');
  await act(async () => renderer.unmount());
});
