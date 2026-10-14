import { useAuthStore } from '../../../store/auth.store';
import { ordersApi } from '../../../api/orders.api';
import { bookingsApi } from '../../../api/bookings.api';
import { supportCasesApi } from '../../../api/support-cases.api';
import { technicianWarrantyApi } from '../../../api/technician-warranty.api';
import { createProductionCustomerAftercare, createProductionOrderSupport, createProductionOrderException, createProductionBookingAftercare, createProductionTechnicianWarranty } from './m7-production';
import { assignedClaim, ids, m7Fixture } from './m7-fixtures.test-utils';
jest.mock('../../../api/client', () => ({ __esModule: true, default: {} }));
jest.mock('@react-native-async-storage/async-storage', () => ({ __esModule: true, default: { getItem: async () => null, setItem: async () => {} } }));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }));
function auth(role: 'customer' | 'technician', generation = 1) { useAuthStore.setState({ user: { id: ids[role === 'customer' ? 'customer' : 'tech'], role } as never, isAuthenticated: true, sessionGeneration: generation }); }
afterEach(() => jest.restoreAllMocks());
it('real nested review adapter omits redundant ID and auth renewal rejects captured submit', async () => {
  auth('customer'); const f = m7Fixture(); jest.spyOn(ordersApi, 'getOrderReview').mockResolvedValue(null); const submit = jest.spyOn(ordersApi, 'submitReview').mockResolvedValue({} as never);
  const c = createProductionCustomerAftercare(f.runtime); await c.prepareReview({ rating: 5 }); auth('customer', 2); await c.submitConfirmation(); expect(submit).not.toHaveBeenCalled();
  auth('customer'); await c.prepareReview({ rating: 4, comment: 'Tốt' }); await c.submitConfirmation(); expect(submit).toHaveBeenCalledWith(ids.order, { rating: 4, comment: 'Tốt' });
});
it('historical original order forbids support, cancellation and cascading private APIs', async () => {
  auth('technician'); const f = m7Fixture('technician'); f.server.order.historical = true; await f.coordinator.refreshOrderSession(f.key, 'history');
  const list = jest.spyOn(supportCasesApi, 'listMine'), cancel = jest.spyOn(ordersApi, 'cancelOrder');
  const support = createProductionOrderSupport(f.runtime, f.entry), exception = createProductionOrderException(f.runtime);
  await support.prepare({ caseType: 'other', reason: 'X' }); await exception.prepareCancellation('X'); await exception.submitConfirmation(); expect(list).not.toHaveBeenCalled(); expect(cancel).not.toHaveBeenCalled(); expect(f.reads).not.toContain('evidence');
});
it('booking production uses owned real Booking and rejects actor change before POST', async () => {
  auth('customer'); const f = m7Fixture(); const owner = { userId: ids.customer, role: 'customer' as const, sessionGeneration: 1 };
  const read = jest.spyOn(bookingsApi, 'getBooking').mockResolvedValue({ id: ids.booking, customerId: ids.customer, status: 'SUBMITTED', mediaUrls: [] } as never);
  const cancel = jest.spyOn(bookingsApi, 'cancelBooking'); const c = createProductionBookingAftercare({ getOwner: () => owner, isActive: () => true }, f.entry);
  c.booking.selectBooking(ids.booking); await c.booking.prepareCancellation('X'); auth('technician'); await c.booking.submitConfirmation(); expect(read).toHaveBeenCalledWith(ids.booking); expect(cancel).not.toHaveBeenCalled();
});
it('assigned warranty factory uses mine only and does not require original repair session', async () => {
  auth('technician'); const f = m7Fixture('technician'), owner = { userId: ids.tech, role: 'technician' as const, sessionGeneration: 1 };
  const find = jest.spyOn(technicianWarrantyApi, 'findMine').mockResolvedValue(assignedClaim()); const order = jest.spyOn(ordersApi, 'getTechnicianOrder');
  const c = createProductionTechnicianWarranty({ getOwner: () => owner, isActive: () => true }, f.entry); c.selectClaim(ids.claim); await c.refreshClaim(); expect(find).toHaveBeenCalledWith(ids.claim, { isCurrent: expect.any(Function) }); expect(order).not.toHaveBeenCalled();
});
