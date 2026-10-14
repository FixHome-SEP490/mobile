import { createTechnicianCashController } from './technician-cash-controller';
import { m6Fixture, deferred } from '../customer/m6-fixtures.test-utils';
import { createOrderCommandJournal } from '../runtime/order-command-journal';
jest.mock('../../../api/client', () => ({ __esModule: true, default: {} }));
function setup() {
  const f = m6Fixture('technician'); f.server.order.completionRequestedAt = '2026-10-14T00:00:00Z';
  const transport = { declareCash: jest.fn(async (_id: string, dto: { declaredAmount: number }) => {
    f.server.cash = {declaredAt: '2026-10-14T00:00:00Z', technicianNotes: null,  id: 'cash', serviceOrderId: 'order', declaredByTechnicianId: 'tech', declaredAmount: dto.declaredAmount, status: 'pending_confirmation' };
    return f.server.cash;
  }) };
  const deps = { ...f.runtime, transport }; return { ...f, transport, deps, c: createTechnicianCashController(deps) };
}
it('explicit receipt amount is captured once, no prefill and no duplicate declaration from Back', async () => {
  const f = setup(); await f.c.submitConfirmation(); expect(f.transport.declareCash).not.toHaveBeenCalled();
  await f.c.requestDeclaration({ declaredAmount: 120000, technicianNotes: '  Đã nhận tiền  ' });
  await Promise.all([f.c.submitConfirmation(), f.c.submitConfirmation()]);
  expect(f.transport.declareCash).toHaveBeenCalledWith('order', { declaredAmount: 120000, technicianNotes: 'Đã nhận tiền' });
  expect(f.c.getState()).toMatchObject({ phase: 'resolved', result: 'cash-pending' }); expect(f.server.invoice!.paymentStatus).toBe('unpaid');
  await f.c.requestDeclaration({ declaredAmount: 120000 }); await f.c.submitConfirmation(); expect(f.transport.declareCash).toHaveBeenCalledTimes(1);
});
it('409 can persist disputed declaration; without causal ID remains locked and does not pretend failed', async () => {
  const f = setup(); f.transport.declareCash.mockImplementation(async () => { f.server.cash = {declaredByTechnicianId: 'tech', declaredAt: '2026-10-14T00:00:00Z', technicianNotes: null,  id: 'cash', serviceOrderId: 'order', declaredAmount: 119000, status: 'disputed' }; throw { response: { status: 409 } }; });
  await f.c.requestDeclaration({ declaredAmount: 119000 }); await f.c.submitConfirmation();
  expect(f.c.getState()).toMatchObject({ phase: 'unknown', result: 'cash-disputed' });
  const c = createTechnicianCashController({ ...f.deps, journal: createOrderCommandJournal(f.storage) }); await c.verify();
  await c.requestDeclaration({ declaredAmount: 120000 }); await c.submitConfirmation(); expect(f.transport.declareCash).toHaveBeenCalledTimes(1); expect(c.getState().phase).toBe('unknown');
});
it.each([-1, 1.1, 1000000000000, NaN])('invalid cash amount %p never sends', async declaredAmount => {
  const f = setup(); await f.c.requestDeclaration({ declaredAmount }); await f.c.submitConfirmation(); expect(f.transport.declareCash).not.toHaveBeenCalled();
});
it('requestedAt is the narrower Mobile gate, missing/malformed invoice and cash do not become zero or absence', async () => {
  const f = setup(); f.server.order.completionRequestedAt = ''; await f.c.requestDeclaration({ declaredAmount: 0 }); await f.c.submitConfirmation();
  f.server.order.completionRequestedAt = '2026-10-14T00:00:00Z'; f.server.cash = {};
  await f.c.requestDeclaration({ declaredAmount: 120000 }); await f.c.submitConfirmation(); expect(f.transport.declareCash).not.toHaveBeenCalled();
});
it('returned settlement ID survives GET failure and cold recovery checks exact invoice+cash IDs', async () => {
  const f = setup(); f.transport.declareCash.mockImplementation(async () => {
    f.server.cash = {declaredAt: '2026-10-14T00:00:00Z', technicianNotes: null,  id: 'cash', serviceOrderId: 'order', declaredByTechnicianId: 'tech', declaredAmount: 120000, status: 'pending_confirmation' };
    f.server.failResource = 'invoice'; return f.server.cash;
  });
  await f.c.requestDeclaration({ declaredAmount: 120000 }); await f.c.submitConfirmation(); expect(f.c.getState().phase).toBe('unknown');
  f.server.failResource = ''; const c = createTechnicianCashController({ ...f.deps, journal: createOrderCommandJournal(f.storage) });
  f.server.cash!.id = 'other-cash'; await c.verify(); expect(c.getState().phase).toBe('unknown');
  f.server.cash!.id = 'cash'; await c.verify(); expect(c.getState().phase).toBe('resolved');
});
it.each(['cancel', 'invoice', 'renew'])('cash target %s changes during storage await prevent POST', async action => {
  const f = setup(); await f.c.requestDeclaration({ declaredAmount: 120000 }); const gate = deferred<void>(); f.deferStorage(() => gate.promise);
  const pending = f.c.submitConfirmation(); await Promise.resolve(); await Promise.resolve();
  if (action === 'cancel') f.c.cancelConfirmation(); if (action === 'renew') f.renew();
  if (action === 'invoice') f.coordinator.getSnapshot()!.resources.invoice = { status: 'ready', requestSeq: 2, fetchedAt: 1000, data: { id: 'invoice', serviceOrderId: 'order', grandTotal: 130000, paymentStatus: 'unpaid' } };
  gate.resolve(); await pending; expect(f.transport.declareCash).not.toHaveBeenCalled();
});
it('foreign operations never use cash recovery and revoked holder cannot resolve a pending marker', async () => {
  const f = setup(); await f.journal.restore(); await f.journal.begin(f.key, { intentId: 'quote', entityId: 'order', operation: 'quote-create' });
  await f.c.verify(); expect(f.reads).toEqual([]); expect(f.journal.list('tech')[0].status).toBe('submitting');
});
