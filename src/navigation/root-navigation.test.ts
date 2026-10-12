import { flushAuthHandoff, handoffAuthenticatedRoute } from './root-navigation';
const mockReset = jest.fn();
let mockRouteNames = ['Auth'];
let mockSession = { isAuthenticated: true, user: { id: 'fixture-customer', role: 'customer' }, sessionGeneration: 1 };
jest.mock('@react-navigation/native', () => ({ createNavigationContainerRef: () => ({ isReady: () => true, getRootState: () => ({ routeNames: mockRouteNames }), resetRoot: (...args: unknown[]) => mockReset(...args) }) }));
jest.mock('../store/auth.store', () => ({ useAuthStore: { getState: () => mockSession } }));
beforeEach(() => { mockReset.mockClear(); mockRouteNames = ['Auth']; mockSession = { isAuthenticated: true, user: { id: 'fixture-customer', role: 'customer' }, sessionGeneration: 1 }; flushAuthHandoff(); });
test('waits for authenticated route registration before handoff and consumes it once', () => {
  handoffAuthenticatedRoute('CustomerMain'); expect(mockReset).not.toHaveBeenCalled();
  mockRouteNames = ['CustomerMain']; flushAuthHandoff(); flushAuthHandoff();
  expect(mockReset).toHaveBeenCalledTimes(1); expect(mockReset).toHaveBeenCalledWith({ index: 0, routes: [{ name: 'CustomerMain' }] });
});
test('drops pending handoff if user logs out or session changes', () => {
  handoffAuthenticatedRoute('CustomerMain'); mockSession.sessionGeneration++; mockRouteNames = ['CustomerMain']; flushAuthHandoff(); expect(mockReset).not.toHaveBeenCalled();
});
test('rejects cross-role target', () => {
  mockRouteNames = ['TechnicianMain']; handoffAuthenticatedRoute('TechnicianMain'); flushAuthHandoff(); expect(mockReset).not.toHaveBeenCalled();
});
test('technician OTP retains onboarding destination on the new role stack', () => {
  mockSession.user = { id: 'fixture-tech', role: 'technician' }; handoffAuthenticatedRoute('TechnicianOnboarding');
  mockRouteNames = ['TechnicianMain', 'TechnicianOnboarding']; flushAuthHandoff(); expect(mockReset).toHaveBeenCalledWith({ index: 0, routes: [{ name: 'TechnicianOnboarding' }] });
});
