import { createOrderExceptionController, orderExceptionView } from './order-exception-controller';
import { m7Fixture, ids, deferred } from './m7-fixtures.test-utils';
import { createOrderCommandJournal } from '../runtime/order-command-journal';
jest.mock('../../../api/client', () => ({ __esModule: true, default: {} }));
function setup(role: 'customer' | 'technician' = 'customer') {
  const f = m7Fixture(role); f.server.order.status = 'EN_ROUTE';
  const cancel = jest.fn(async (_id: string, _reason: string) => { if (role === 'customer') f.server.order.status = 'CANCELLED'; else f.server.order.historical = true; });
  const deps = { ...f.runtime, cancel }; return { ...f, cancel, deps, c: createOrderExceptionController(deps) };
}
it('Customer cancellation reads actual CANCELLED, while Tech withdrawal retains original status and returns assignment recovery', async () => {
  const c = setup(); await c.c.prepareCancellation('  Không tiếp tục  '); await c.c.submitConfirmation(); expect(c.cancel).toHaveBeenCalledWith(ids.order, 'Không tiếp tục'); expect(c.c.getState()).toMatchObject({ phase: 'resolved', result: 'cancelled' });
  const t = setup('technician'); await t.c.prepareCancellation('Không tiếp tục'); await t.c.submitConfirmation(); expect(t.server.order.status).toBe('EN_ROUTE'); expect(t.c.getState()).toMatchObject({ phase: 'resolved', result: 'no-longer-assigned' });
  expect(t.coordinator.getSnapshot()!.resources.evidence.status).toBe('unloaded');
});
it('Customer UNDER_REPAIR and Tech after own arrival require support, no direct cancel', async () => {
  const c = setup(); c.server.order.status = 'UNDER_REPAIR'; await c.c.prepareCancellation('Không tiếp tục'); await c.c.submitConfirmation(); expect(c.cancel).not.toHaveBeenCalled();
  const t = setup('technician'); t.server.order.arrivalVerified = true; await t.c.prepareCancellation('Không tiếp tục'); await t.c.submitConfirmation(); expect(t.cancel).not.toHaveBeenCalled();
});
it('historical/revoked viewmodel is seven fields only and grants no cascading private GET or write', async () => {
  const f = setup('technician'); f.server.order.historical = true; await f.coordinator.refreshOrderSession(f.key, 'history');
  const view = orderExceptionView(f.coordinator.getSnapshot()); expect(Object.keys(view.summary!)).toEqual(['id', 'code', 'status', 'createdAt', 'completedAt', 'cancelledAt', 'historical']); expect(JSON.stringify(view)).not.toContain('bookingId');
  await f.c.prepareCancellation('Không tiếp tục'); await f.c.submitConfirmation(); expect(f.cancel).not.toHaveBeenCalled(); expect(f.reads).not.toContain('evidence');
});
it('unknown cancel survives restart and cannot infer failure from unchanged phase, nor replay', async () => {
  const f = setup(); f.cancel.mockRejectedValue(Error('timeout')); await f.c.prepareCancellation('Không tiếp tục'); await f.c.submitConfirmation();
  const c = createOrderExceptionController({ ...f.deps, journal: createOrderCommandJournal(f.storage) }); await c.verify(); await c.prepareCancellation('Không tiếp tục'); await c.submitConfirmation(); expect(f.cancel).toHaveBeenCalledTimes(1); expect(c.getState().phase).toBe('unknown');
});
it('cancellation target/full session changes after durable reservation prevent dispatch', async () => {
  const f = setup(); await f.c.prepareCancellation('Không tiếp tục'); const gate = deferred<void>(); f.storageGate(() => gate.promise);
  const pending = f.c.submitConfirmation(); await Promise.resolve(); await Promise.resolve(); f.renew(); gate.resolve(); await pending; expect(f.cancel).not.toHaveBeenCalled();
});
it('allocation throw never dispatches cancellation and releases busy for explicit retry', async () => {
  const f = setup(), allocate = jest.fn().mockImplementationOnce(() => { throw Error('allocation'); }).mockReturnValue('retry-cancel');
  const c = createOrderExceptionController({ ...f.deps, newIntentId: allocate }); await c.prepareCancellation('X'); await c.submitConfirmation(); expect(c.getState().phase).toBe('failed-known'); expect(f.cancel).not.toHaveBeenCalled();
  await c.prepareCancellation('X'); await c.submitConfirmation(); expect(f.cancel).toHaveBeenCalledTimes(1);
});
