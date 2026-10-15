import React from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useAuthStore } from '../../../store/auth.store';
import { ordersApi } from '../../../api/orders.api';
import { bookingsApi } from '../../../api/bookings.api';
import { technicianWarrantyApi } from '../../../api/technician-warranty.api';
import { useCustomerAftercare } from '../customer/useCustomerAftercare';
import { useBookingAftercare } from '../customer/useBookingAftercare';
import { useTechnicianWarranty } from '../technician/useTechnicianWarranty';
import { assignedClaim, deferred, ids, m7Fixture } from './m7-fixtures.test-utils';
const { act, create } = jest.requireActual('react-test-renderer');
type Tree = { unmount: () => void; update: (element: React.ReactElement) => void };
let mockSession: ReturnType<typeof m7Fixture>['runtime'] & { key: ReturnType<typeof m7Fixture>['key']; snapshot: unknown };
jest.mock('../runtime/OrderSessionProvider', () => ({ useOrderSession: () => mockSession }));
jest.mock('@react-navigation/native', () => ({ useIsFocused: () => true }));
jest.mock('../../../api/client', () => ({ __esModule: true, default: {} }));
jest.mock('@react-native-async-storage/async-storage', () => ({ __esModule: true, default: { getItem: async () => null, setItem: async () => {} } }));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }));
const auth = (role: 'customer' | 'technician') => useAuthStore.setState({ isAuthenticated: true, user: { id: role === 'customer' ? ids.customer : ids.tech, role } as never, sessionGeneration: 1 });
beforeEach(() => Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true }));
afterEach(() => jest.restoreAllMocks());
it('order aftercare native blur clears confirmation, foreground reads only selected section and never submits', async () => {
  auth('customer'); const f = m7Fixture(); mockSession = { ...f.runtime, key: f.key, snapshot: f.coordinator.getSnapshot() };
  const review = jest.spyOn(ordersApi, 'getOrderReview').mockResolvedValue(null), claims = jest.spyOn(ordersApi, 'getOrderWarrantyClaims'), submit = jest.spyOn(ordersApi, 'submitReview');
  const listeners: ((s: AppStateStatus) => void)[] = []; jest.spyOn(AppState, 'addEventListener').mockImplementation((_name, cb) => { listeners.push(cb); return { remove: jest.fn() }; });
  let hook!: ReturnType<typeof useCustomerAftercare>; function Host() { hook = useCustomerAftercare('review'); return null; }
  let view!: Tree; await act(async () => { view = create(<Host />); }); expect(review).toHaveBeenCalledTimes(1); expect(claims).not.toHaveBeenCalled();
  await act(async () => { await hook.controller.prepareReview({ rating: 5 }); }); expect(hook.state.confirmation).not.toBeNull();
  await act(async () => { listeners.forEach(l => l('background')); listeners.forEach(l => l('active')); }); expect(hook.state.confirmation).toBeNull();
  await act(async () => { await hook.controller.submitConfirmation(); }); expect(submit).not.toHaveBeenCalled(); await act(async () => view.unmount());
});
it('booking target switch rejects late owned GET and clears support context without fetching original order', async () => {
  auth('customer'); const f = m7Fixture(), gate = deferred<never>(); const read = jest.spyOn(bookingsApi, 'getBooking').mockImplementationOnce(() => gate.promise).mockResolvedValue({ id: ids.review, customerId: ids.customer, status: 'SUBMITTED', mediaUrls: [] } as never);
  const order = jest.spyOn(ordersApi, 'getOrder'); let hook!: ReturnType<typeof useBookingAftercare>;
  function Host({ id }: { id: string }) { hook = useBookingAftercare(id, f.entry); return null; }
  let view!: Tree; await act(async () => { view = create(<Host id={ids.booking} />); }); await act(async () => view.update(<Host id={ids.review} />));
  await act(async () => { gate.resolve({ id: ids.booking, customerId: ids.customer, status: 'CLOSED', mediaUrls: ['private-old'] } as never); });
  expect(hook.bookingState.selectedBookingId).toBe(ids.review); expect(JSON.stringify(hook.bookingState)).not.toContain('private-old'); expect(order).not.toHaveBeenCalled(); expect(read).toHaveBeenCalledWith(ids.booking); await act(async () => view.unmount());
});
it('warranty hook reads assigned mine context only and purges PII on logout/unmount', async () => {
  auth('technician'); const f = m7Fixture('technician'); const find = jest.spyOn(technicianWarrantyApi, 'findMine').mockResolvedValue(assignedClaim()), inbox = jest.spyOn(technicianWarrantyApi, 'listMine');
  const command = jest.spyOn(technicianWarrantyApi, 'command'); let hook!: ReturnType<typeof useTechnicianWarranty>;
  function Host() { hook = useTechnicianWarranty(ids.claim, f.entry); return null; }
  let view!: Tree; await act(async () => { view = create(<Host />); }); expect(find).toHaveBeenCalledTimes(1); expect(inbox).not.toHaveBeenCalled(); expect(JSON.stringify(hook.state)).toContain('Địa chỉ mẫu');
  const old = hook.controller; await act(async () => useAuthStore.setState({ isAuthenticated: false, user: null, sessionGeneration: 2 })); expect(JSON.stringify(old.getState())).not.toContain('Địa chỉ mẫu'); expect(command).not.toHaveBeenCalled(); await act(async () => view.unmount());
});
