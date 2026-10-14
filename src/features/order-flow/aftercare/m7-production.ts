import { ordersApi } from '../../../api/orders.api';
import { bookingsApi } from '../../../api/bookings.api';
import { supportCasesApi } from '../../../api/support-cases.api';
import { technicianWarrantyApi } from '../../../api/technician-warranty.api';
import { useAuthStore } from '../../../store/auth.store';
import { authenticatedM6Key, type M6OrderRuntime } from '../customer/order-payment-production';
import { m6Order } from '../customer/payment-facts';
import { entryAttemptJournal, newEntryIntentId } from '../runtime/entry-attempt-production';
import { createCustomerAftercareController } from './customer-aftercare-controller';
import { createOrderExceptionController } from './order-exception-controller';
import { createSupportController, type AftercareOwner, type SupportContext } from './support-controller';
import { createBookingExceptionController } from '../customer/booking-exception-controller';
import { createTechnicianWarrantyController } from '../technician/technician-warranty-controller';
export interface IndependentAftercareRuntime { getOwner: () => AftercareOwner | null; isActive: () => boolean }
export function authenticatedAftercareOwner(runtime: IndependentAftercareRuntime, role: AftercareOwner['role']) {
  const owner = runtime.getOwner(), auth = useAuthStore.getState();
  return runtime.isActive() && owner?.role === role && auth.isAuthenticated && auth.user?.role === role && auth.user.id === owner.userId
    && auth.sessionGeneration === owner.sessionGeneration ? owner : null;
}
function currentOrderKey(runtime: M6OrderRuntime) { const role = runtime.getKey()?.role; return role ? authenticatedM6Key(runtime, role) : null; }
export function createProductionCustomerAftercare(runtime: M6OrderRuntime) {
  return createCustomerAftercareController({ ...runtime, getKey: () => authenticatedM6Key(runtime, 'customer'), newIntentId: newEntryIntentId,
    transport: { getReview: ordersApi.getOrderReview, getCoverages: ordersApi.getOrderWarranties, getClaims: ordersApi.getOrderWarrantyClaims,
      submitReview: ordersApi.submitReview, createClaim: ordersApi.createWarrantyClaim, respondClaim: ordersApi.respondWarrantyClaim } });
}
export function createProductionOrderException(runtime: M6OrderRuntime) {
  return createOrderExceptionController({ ...runtime, getKey: () => currentOrderKey(runtime), newIntentId: newEntryIntentId, cancel: ordersApi.cancelOrder });
}
export function createProductionOrderSupport(runtime: M6OrderRuntime, journal = entryAttemptJournal) {
  function context(): SupportContext | null {
    const key = currentOrderKey(runtime), s = runtime.coordinator.getSnapshot(), order = key ? m6Order(s, key) : null;
    if (!key || !order) return null;
    return { kind: 'order', id: key.serviceOrderId, phase: order.status, completedAt: order.completedAt, arrivalVerified: order.arrivalVerified,
      authorizedRefs: s?.resources.evidence.status === 'ready' ? s.resources.evidence.data.filter(e => e.type !== 'CHECKIN_FACE'
        && e.serviceOrderId === key.serviceOrderId && (key.role === 'customer' || e.uploaderId === key.userId)).map(e => e.mediaUrl) : [] };
  }
  return createSupportController({ journal, getOwner: () => currentOrderKey(runtime), isActive: runtime.isActive, getContext: context,
    isContextRevoked: () => { const key = currentOrderKey(runtime), s = runtime.coordinator.getSnapshot(); return !key || !s || s.key.serviceOrderId !== key.serviceOrderId || ['historical', 'revoked'].includes(s.access); },
    refreshContext: async () => { const key = currentOrderKey(runtime); if (key) await runtime.coordinator.refreshOrderSession(key, 'support-context'); return context(); },
    newIntentId: newEntryIntentId, onAccessDenied: () => runtime.coordinator.invalidate(),
    transport: { listMine: supportCasesApi.listMine, getMine: supportCasesApi.getMine, create: supportCasesApi.createCase } });
}
export function createProductionBookingAftercare(runtime: IndependentAftercareRuntime, journal = entryAttemptJournal) {
  const getOwner = () => authenticatedAftercareOwner(runtime, 'customer');
  const booking = createBookingExceptionController({ journal, getOwner, isActive: runtime.isActive, newIntentId: newEntryIntentId,
    transport: { read: bookingsApi.getBooking, cancel: bookingsApi.cancelBooking } });
  const support = createSupportController({ journal, getOwner, isActive: runtime.isActive, getContext: booking.supportContext,
    isContextRevoked: () => !getOwner() || booking.getState().booking.status === 'unloaded',
    refreshContext: async () => { await booking.refresh(); return booking.supportContext(); }, newIntentId: newEntryIntentId,
    onAccessDenied: booking.invalidatePresentation, transport: { listMine: supportCasesApi.listMine, getMine: supportCasesApi.getMine, create: supportCasesApi.createCase } });
  return { booking, support };
}
export function createProductionTechnicianWarranty(runtime: IndependentAftercareRuntime, journal = entryAttemptJournal) {
  return createTechnicianWarrantyController({ journal, getOwner: () => authenticatedAftercareOwner(runtime, 'technician'), isActive: runtime.isActive, newIntentId: newEntryIntentId,
    transport: { listMine: technicianWarrantyApi.listMine, findMine: (id, isCurrent) => technicianWarrantyApi.findMine(id, { isCurrent }), command: technicianWarrantyApi.command } });
}
