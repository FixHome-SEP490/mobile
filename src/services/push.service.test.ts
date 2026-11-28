// The OneSignal wiring: account sign-in/out, what shows while the app is open, and where a tap goes.
type Handler = (event: any) => void;

// One mock module for the whole file (the service requires the SDK lazily, outside isolateModules); load() refills it.
const mockSdk: any = {};
jest.mock('react-native-onesignal', () => ({ OneSignal: mockSdk }));

function load(appId: string | undefined) {
  if (appId === undefined) delete process.env.EXPO_PUBLIC_ONESIGNAL_APP_ID;
  else process.env.EXPO_PUBLIC_ONESIGNAL_APP_ID = appId;
  const handlers: Record<string, Handler> = {};
  const sdk = Object.assign(mockSdk, {
    initialize: jest.fn(),
    login: jest.fn(),
    logout: jest.fn(),
    Notifications: {
      requestPermission: jest.fn(async () => true),
      addEventListener: jest.fn((name: string, handler: Handler) => { handlers[name] = handler; }),
    },
  });
  const navigate = jest.fn();
  const nav = { ready: true, routeNames: ['CustomerMain', 'TechnicianMain', 'ChatThread'] };
  let mod!: typeof import('./push.service');
  let auth!: typeof import('../store/auth.store');
  jest.isolateModules(() => {
    jest.doMock('../navigation/root-navigation', () => ({
      rootNavigationRef: { isReady: () => nav.ready, getRootState: () => ({ routeNames: nav.routeNames }), navigate },
    }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    auth = require('../store/auth.store');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('./push.service');
  });
  const signIn = (id: string, role: 'customer' | 'technician') =>
    auth.useAuthStore.getState().setAuth('token', { id, role, fullName: 'A', email: 'a@x.vn' } as never);
  const signOut = () => auth.useAuthStore.getState().logout();
  return { mod, sdk, handlers, navigate, nav, signIn, signOut };
}

const CONV = '44444444-4444-4444-8444-444444444444';
const click = (additionalData: object, title = 'Tiêu đề', body = 'Nội dung') => ({ notification: { additionalData, title, body } });

afterAll(() => { delete process.env.EXPO_PUBLIC_ONESIGNAL_APP_ID; });

it('does nothing without an app id', () => {
  const { mod, sdk } = load(undefined);
  mod.startPush();
  expect(sdk.initialize).not.toHaveBeenCalled();
});

it('starts once, then follows the account: login with the user id, logout on sign-out', () => {
  const { mod, sdk, signIn, signOut } = load('app-1');
  mod.startPush();
  mod.startPush();
  expect(sdk.initialize).toHaveBeenCalledTimes(1);
  expect(sdk.initialize).toHaveBeenCalledWith('app-1');

  signIn('u1', 'customer');
  expect(sdk.login).toHaveBeenCalledWith('u1');
  expect(sdk.Notifications.requestPermission).toHaveBeenCalledTimes(1);

  signOut();
  expect(sdk.logout).toHaveBeenCalledTimes(1);

  // Another account on the same phone takes the pushes over; permission is not asked again.
  signIn('u2', 'technician');
  expect(sdk.login).toHaveBeenLastCalledWith('u2');
  expect(sdk.Notifications.requestPermission).toHaveBeenCalledTimes(1);
});

it('a failing SDK never breaks sign-in', () => {
  const { mod, sdk, signIn } = load('app-1');
  sdk.login.mockImplementation(() => { throw new Error('native'); });
  mod.startPush();
  expect(() => signIn('u1', 'customer')).not.toThrow();
});

it('while open: hides calls and the open thread, shows the rest', () => {
  const { mod, handlers } = load('app-1');
  mod.startPush();
  const arrive = (additionalData: object) => {
    const event = { getNotification: () => ({ additionalData }), preventDefault: jest.fn() };
    handlers.foregroundWillDisplay(event);
    return event.preventDefault.mock.calls.length > 0;
  };
  mod.setOpenConversation(CONV);
  expect(arrive({ kind: 'chat', conversationId: CONV, messageId: 'm' })).toBe(true);
  expect(arrive({ kind: 'chat', conversationId: 'other', messageId: 'm' })).toBe(false);
  expect(arrive({ kind: 'call', conversationId: 'other', callId: 'c' })).toBe(true);
  expect(arrive({ kind: 'notification', notificationId: 'n', type: 'INFO' })).toBe(false);
  mod.setOpenConversation(null);
  expect(arrive({ kind: 'chat', conversationId: CONV, messageId: 'm' })).toBe(false);
});

it('a tap on a message opens its thread', () => {
  const { mod, handlers, navigate, signIn } = load('app-1');
  mod.startPush();
  signIn('u1', 'customer');
  handlers.click(click({ kind: 'chat', conversationId: CONV, messageId: 'm' }, 'Thợ Một'));
  expect(navigate).toHaveBeenCalledWith('ChatThread', { conversationId: CONV, counterpartName: 'Thợ Một' });
});

it('a tap that launched the app waits for sign-in and navigation, then opens once', () => {
  const { mod, handlers, navigate, nav, signIn } = load('app-1');
  nav.ready = false;
  mod.startPush();
  handlers.click(click({ kind: 'call', conversationId: CONV, callId: 'c' }));
  expect(navigate).not.toHaveBeenCalled();
  signIn('u1', 'technician');
  expect(navigate).not.toHaveBeenCalled();
  nav.ready = true;
  mod.flushPendingOpen();
  expect(navigate).toHaveBeenCalledWith('ChatThread', { conversationId: CONV, counterpartName: '' });
  mod.flushPendingOpen();
  expect(navigate).toHaveBeenCalledTimes(1);
});

it('a tapped notice goes to the role\'s notification tab, which takes it once', () => {
  const { mod, handlers, navigate, signIn } = load('app-1');
  mod.startPush();
  signIn('t1', 'technician');
  const listener = jest.fn();
  const stop = mod.onPendingNotice(listener);
  handlers.click(click({ kind: 'notification', notificationId: 'n1', type: 'BOOKING_INVITATION', referenceId: CONV, referenceType: 'BOOKING' }, 'Lời mời mới', 'Có việc'));
  expect(navigate).toHaveBeenCalledWith('TechnicianMain', { screen: 'Notifications' });
  expect(listener).toHaveBeenCalledTimes(1);
  expect(mod.takePendingNotice()).toMatchObject({ id: 'n1', type: 'BOOKING_INVITATION', referenceType: 'BOOKING', title: 'Lời mời mới', isRead: false });
  expect(mod.takePendingNotice()).toBeNull();
  stop();
});

it('a customer\'s notice opens the customer notification tab; unknown data is ignored', () => {
  const { mod, handlers, navigate, signIn } = load('app-1');
  mod.startPush();
  signIn('c1', 'customer');
  handlers.click(click({ kind: 'promo' }));
  expect(navigate).not.toHaveBeenCalled();
  handlers.click(click({ kind: 'notification', notificationId: 'n2', type: 'ORDER_COMPLETED' }));
  expect(navigate).toHaveBeenCalledWith('CustomerMain', { screen: 'Notifications' });
});
