import React from 'react';
import { act, create } from 'react-test-renderer';
import { CustomerOrderDetailEntry, TechnicianOrderDetailEntry, orderDetailSession } from './OrderDetailEntry';

let mockAuth: { isAuthenticated: boolean; user: { role: string } | null } = { isAuthenticated: true, user: { role: 'customer' } };
let mockParams: Record<string, unknown> | undefined = { serviceOrderId: 'order-1' };
jest.mock('@react-navigation/native', () => ({ useRoute: () => ({ params: mockParams }), useNavigation: () => ({ goBack: jest.fn() }) }));
jest.mock('../../../store/auth.store', () => ({ useAuthStore: () => mockAuth }));
jest.mock('../runtime/OrderSessionProvider', () => {
  const ReactRuntime = jest.requireActual('react');
  const Native = jest.requireActual('react-native');
  return { OrderSessionProvider: ({ serviceOrderId, children }: { serviceOrderId: string; children: React.ReactNode }) => ReactRuntime.createElement(Native.View, { testID: 'session', serviceOrderId }, children) };
});
jest.mock('./OrderFlowNavigator', () => {
  const Native = jest.requireActual('react-native');
  const ReactRuntime = jest.requireActual('react');
  return { __esModule: true, default: ({ role }: { role: string }) => ReactRuntime.createElement(Native.Text, { testID: 'role' }, role) };
});
jest.mock('@react-navigation/bottom-tabs', () => {
  const ReactRuntime = jest.requireActual('react');
  const Native = jest.requireActual('react-native');
  return {
    createBottomTabNavigator: () => ({
      Navigator: ({ children }: { children: React.ReactNode }) => ReactRuntime.createElement(Native.View, null, ReactRuntime.Children.toArray(children)[0]),
      Screen: ({ component: Component }: { component: React.ComponentType }) => ReactRuntime.createElement(Component),
    }),
  };
});
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: jest.requireActual('react-native').View }));

const render = async (Entry: React.ComponentType) => {
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<Entry />); });
  return renderer;
};

describe('production order detail entry', () => {
  beforeEach(() => { mockAuth = { isAuthenticated: true, user: { role: 'customer' } }; mockParams = { serviceOrderId: 'order-1' }; });

  it('mounts one session for the matching role and order', async () => {
    const r = await render(CustomerOrderDetailEntry);
    expect(r.root.findByProps({ testID: 'session' }).props.serviceOrderId).toBe('order-1');
    expect(r.root.findByProps({ testID: 'role' }).props.children).toBe('customer');
  });

  it('fails closed on role mismatch, signed-out or missing order id', async () => {
    for (const [Entry, auth, params] of [
      [TechnicianOrderDetailEntry, mockAuth, mockParams],
      [CustomerOrderDetailEntry, { isAuthenticated: false, user: null }, mockParams],
      [CustomerOrderDetailEntry, mockAuth, { serviceOrderId: '  ' }],
      [CustomerOrderDetailEntry, mockAuth, undefined],
    ] as const) {
      mockAuth = auth as typeof mockAuth; mockParams = params as typeof mockParams;
      const r = await render(Entry);
      expect(r.root.findAllByProps({ testID: 'session' })).toHaveLength(0);
    }
  });

  it('puts the technician order in its own device tab', async () => {
    mockAuth = { isAuthenticated: true, user: { role: 'technician' } };
    const r = await render(TechnicianOrderDetailEntry);
    expect(r.root.findByProps({ testID: 'session' }).props.serviceOrderId).toBe('order-1');
    expect(r.root.findByProps({ testID: 'role' }).props.children).toBe('technician');
  });

  it('orderDetailSession trims the id', () => {
    expect(orderDetailSession('technician', true, 'technician', ' o1 ')).toEqual({ role: 'technician', serviceOrderId: 'o1' });
    expect(orderDetailSession('technician', true, 'customer', 'o1')).toBeNull();
  });
});
