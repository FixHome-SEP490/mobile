import { createBookingExceptionController } from './booking-exception-controller';
import { deferred, ids, m7Fixture } from '../aftercare/m7-fixtures.test-utils';
import { createEntryAttemptJournal } from '../runtime/entry-attempt-journal';
function setup() {
  const f = m7Fixture(), booking = { id: ids.booking, customerId: ids.customer, status: 'CLOSED', serviceOrderId: null as string | null, mediaUrls: ['existing-ref'] };
  const read = jest.fn(async (_id: string) => booking), cancel = jest.fn(async (_id: string, _reason: string) => { booking.status = 'CANCELLED'; return booking; });
  const deps = { journal: f.entry, getOwner: f.runtime.getKey, isActive: f.runtime.isActive, newIntentId: f.runtime.newIntentId, transport: { read, cancel } };
  const c = createBookingExceptionController(deps); c.selectBooking(ids.booking); return { ...f, deps, c, booking, read, cancel };
}
it('owned no-order Booking cancellation is explicit, exact-ID GET proven and has no synthetic order context', async () => {
  const f = setup(); await f.c.refresh(); expect(f.c.recovery()).toEqual({ kind: 'reselect', bookingId: ids.booking });
  expect(f.c.supportContext()).toMatchObject({ kind: 'booking', id: ids.booking, phase: 'no_order', authorizedRefs: ['existing-ref'] });
  await f.c.prepareCancellation(' X '); expect(f.cancel).not.toHaveBeenCalled(); await f.c.submitConfirmation(); expect(f.cancel).toHaveBeenCalledWith(ids.booking, 'X'); expect(f.c.getState().phase).toBe('resolved');
});
it('linked Booking routes to real order, blocks no-order cancellation/support; MATCHING recovery retains booking', async () => {
  const f = setup(); f.booking.serviceOrderId = ids.order; await f.c.refresh(); expect(f.c.recovery()).toEqual({ kind: 'order', serviceOrderId: ids.order });
  await f.c.prepareCancellation('X'); await f.c.submitConfirmation(); expect(f.cancel).not.toHaveBeenCalled(); expect(f.c.supportContext()?.linkedOrderId).toBe(ids.order);
  f.booking.serviceOrderId = null; f.booking.status = 'MATCHING'; await f.c.refresh(); expect(f.c.recovery()).toEqual({ kind: 'matching', bookingId: ids.booking });
});
it('unknown booking cancel survives restart and unchanged GET never replays', async () => {
  const f = setup(); f.cancel.mockRejectedValue(Error('timeout')); await f.c.prepareCancellation('X'); await f.c.submitConfirmation();
  const c = createBookingExceptionController({ ...f.deps, journal: createEntryAttemptJournal(f.storage) }); c.selectBooking(ids.booking); await c.verify(); await c.prepareCancellation('X'); await c.submitConfirmation(); expect(c.getState().phase).toBe('unknown'); expect(f.cancel).toHaveBeenCalledTimes(1);
});
it('late foreign-owner/403 reads purge media and linked routes', async () => {
  const f = setup(); await f.c.refresh(); f.booking.customerId = ids.tech; await f.c.refresh(); expect(f.c.supportContext()).toBeNull(); expect(f.c.recovery()).toEqual({ kind: 'unverified' }); expect(JSON.stringify(f.c.getState())).not.toContain('existing-ref');
  f.booking.customerId = ids.customer; await f.c.refresh(); f.read.mockRejectedValue({ response: { status: 403 } }); await f.c.refresh(); expect(f.c.getState().booking.status).toBe('unloaded');
});
it('session/target change during storage await prevents POST; allocator failure unlocks busy', async () => {
  const f = setup(); await f.c.prepareCancellation('X'); const gate = deferred<void>(); f.storageGate(() => gate.promise); const pending = f.c.submitConfirmation(); await Promise.resolve(); await Promise.resolve(); f.renew(); gate.resolve(); await pending; expect(f.cancel).not.toHaveBeenCalled();
  const g = setup(); let fail = true; const c = createBookingExceptionController({ ...g.deps, newIntentId: () => { if (fail) throw Error('allocation'); return 'retry'; } }); c.selectBooking(ids.booking); await c.prepareCancellation('X'); await c.submitConfirmation(); expect(c.getState().phase).toBe('failed-known'); fail = false; await c.prepareCancellation('X'); await c.submitConfirmation(); expect(g.cancel).toHaveBeenCalledTimes(1);
});
