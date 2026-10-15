import { createSupportController } from './support-controller';
import { createEntryAttemptJournal } from '../runtime/entry-attempt-journal';
import { ids, m7Fixture, caseRow, deferred } from './m7-fixtures.test-utils';
jest.mock('../../../api/client', () => ({ __esModule: true, default: {} }));
function setup(kind: 'order' | 'booking' = 'order', role: 'customer' | 'technician' = 'customer') {
  const f = m7Fixture(role); const context = { kind, id: kind === 'order' ? ids.order : ids.booking, phase: kind === 'order' ? 'COMPLETED' : 'no_order', completedAt: '2026-10-14T00:00:00Z', arrivalVerified: false, authorizedRefs: ['existing-ref'] };
  const cases = [] as ReturnType<typeof caseRow>[]; let owner = { userId: f.key.userId, role, sessionGeneration: 1 };
  const transport = { listMine: jest.fn(async (_query: unknown) => ({ data: cases, total: cases.length, page: 1, limit: 100, totalPages: cases.length ? 1 : 0 })),
    getMine: jest.fn(async (id: string) => cases.find(r => r.id === id)), create: jest.fn(async (_dto: unknown) => { const row = { ...caseRow(), id: cases.length ? ids.review : ids.case, ...(kind === 'booking' ? { bookingId: ids.booking, serviceOrderId: null } : {}) }; cases.push(row); return row; }) };
  const deps = { journal: f.entry, transport, getOwner: () => owner, isActive: () => true, getContext: () => context,
    refreshContext: async () => context, newIntentId: f.runtime.newIntentId, now: () => Date.parse('2026-10-14T12:00:00Z'), onAccessDenied: jest.fn() };
  return { ...f, context, cases, transport, deps, c: createSupportController(deps), renew: () => { owner = { ...owner, sessionGeneration: 2 }; } };
}
it.each(['order', 'booking'] as const)('support %s creates one exact case and permits another independent case after confirmed readback', async kind => {
  const f = setup(kind); await f.c.prepare({ caseType: 'other', reason: ' a ', evidenceRefs: ['existing-ref'] }); await f.c.submitConfirmation();
  expect(f.transport.create).toHaveBeenCalledWith({ caseType: 'other', reason: 'a', evidenceRefs: ['existing-ref'], [kind === 'order' ? 'serviceOrderId' : 'bookingId']: f.context.id });
  expect(f.c.getState().phase).toBe('resolved'); await f.c.prepare({ caseType: 'other', reason: 'b' }); await f.c.submitConfirmation(); expect(f.transport.create).toHaveBeenCalledTimes(2);
});
it('support lost case ID is never correlated from matching reason/another case; cold restart cannot replay', async () => {
  const f = setup(); f.transport.create.mockImplementation(async () => { f.cases.push(caseRow()); throw Error('timeout'); });
  await f.c.prepare({ caseType: 'other', reason: 'Lỗi thực tế' }); await f.c.submitConfirmation();
  const c = createSupportController({ ...f.deps, journal: createEntryAttemptJournal(f.storage) }); await c.verify(); await c.prepare({ caseType: 'other', reason: 'Lỗi thực tế' }); await c.submitConfirmation();
  expect(c.getState().phase).toBe('unknown'); expect(f.transport.getMine).not.toHaveBeenCalled(); expect(f.transport.create).toHaveBeenCalledTimes(1);
});
it('known case ID verifies only authorized mine detail, never staff detail or another context', async () => {
  const f = setup(); f.transport.getMine.mockRejectedValueOnce(Error('offline')); await f.c.prepare({ caseType: 'other', reason: 'a' }); await f.c.submitConfirmation(); expect(f.c.getState().phase).toBe('unknown');
  await f.c.verify(); expect(f.c.getState().phase).toBe('resolved'); expect(f.transport.getMine).toHaveBeenCalledWith(ids.case);
});
it('phase/role/window and own arrival guards reject forbidden support; missing completedAt delegates validation without invented date', async () => {
  const f = setup('booking', 'technician'); await f.c.prepare({ caseType: 'other', reason: 'a' }); await f.c.submitConfirmation(); expect(f.transport.create).not.toHaveBeenCalled();
  const tech = setup('order', 'technician'); tech.context.phase = 'EN_ROUTE'; await tech.c.prepare({ caseType: 'technician_replacement', reason: 'a' }); await tech.c.submitConfirmation(); expect(tech.transport.create).not.toHaveBeenCalled();
  const old = setup(); old.context.completedAt = '2026-10-01T00:00:00Z'; await old.c.prepare({ caseType: 'other', reason: 'a' }); await old.c.submitConfirmation(); expect(old.transport.create).not.toHaveBeenCalled();
  old.context.completedAt = ''; await old.c.prepare({ caseType: 'other', reason: 'a' }); await old.c.submitConfirmation(); expect(old.transport.create).toHaveBeenCalledTimes(1);
});
it('three proven actor-created OPEN/IN_REVIEW cases block locally; other party cases are not mistaken for that count', async () => {
  const f = setup(); await f.entry.restore();
  for (const [index, id] of [ids.case, ids.review, ids.claim].entries()) {
    await f.entry.begin({ kind: 'support-create', role: 'customer', contextKind: 'order', contextId: ids.order, ownerUserId: ids.customer, intentId: `old-${index}`, confirmedId: id, createdAt: 1 }); await f.entry.resolve(ids.customer, `old-${index}`); f.cases.push({ ...caseRow(), id });
  }
  await f.c.prepare({ caseType: 'other', reason: 'a' }); await f.c.submitConfirmation(); expect(f.transport.create).not.toHaveBeenCalled();
  const other = setup(); other.cases.push(caseRow(), { ...caseRow(), id: ids.review }, { ...caseRow(), id: ids.claim }); await other.c.prepare({ caseType: 'other', reason: 'a' }); expect(other.c.getState().confirmation).not.toBeNull();
});
it.each(['cancel', 'renew', 'context'])('support %s while durable storage awaits does not dispatch', async action => {
  const f = setup(); await f.c.prepare({ caseType: 'other', reason: 'a' }); const gate = deferred<void>(); f.storageGate(() => gate.promise);
  const pending = f.c.submitConfirmation(); await Promise.resolve(); await Promise.resolve();
  if (action === 'cancel') f.c.cancelConfirmation(); if (action === 'renew') f.renew(); if (action === 'context') f.context.id = ids.booking;
  gate.resolve(); await pending; expect(f.transport.create).not.toHaveBeenCalled(); if (action === 'cancel') expect(f.c.getState().phase).toBe('failed-known');
});
it('support404/403 clears private detail/confirmation and cannot cascade GETs; uploads are absent', async () => {
  const f = setup(); f.transport.getMine.mockRejectedValue({ response: { status: 403 } }); await f.c.loadDetail(ids.case);
  expect(f.c.getState().detail.status).not.toBe('ready'); expect(f.deps.onAccessDenied).toHaveBeenCalled(); expect(f.c.getState().confirmation).toBeNull(); expect(f.transport.create).not.toHaveBeenCalled();
});
it('local allocation failure is known unsent and does not leave support busy forever', async () => {
  const f = setup(), allocate = jest.fn().mockImplementationOnce(() => { throw Error('allocation'); }).mockReturnValue('retry-support');
  const c = createSupportController({ ...f.deps, newIntentId: allocate }); await c.prepare({ caseType: 'other', reason: 'a' }); await expect(c.submitConfirmation()).resolves.toBeUndefined();
  expect(f.transport.create).not.toHaveBeenCalled(); expect(f.entry.list(ids.customer)).toEqual([]);
  await c.prepare({ caseType: 'other', reason: 'a' }); await c.submitConfirmation(); expect(f.transport.create).toHaveBeenCalledTimes(1);
});
it('malformed participant detail never becomes a ready support resource', async () => {
  const f = setup(); f.transport.getMine.mockResolvedValue({ ...caseRow(), caseType: 'invented', evidenceRefs: [42] } as never);
  await f.c.loadDetail(ids.case); expect(f.c.getState().detail.status).toBe('error');
});
it('revoked context clears already-loaded support details even without an open confirmation', async () => {
  const f = setup(); f.cases.push(caseRow()); const c = createSupportController({ ...f.deps, isContextRevoked: () => f.context.phase === 'revoked' });
  await c.loadDetail(ids.case); expect(c.getState().detail.status).toBe('ready'); f.context.phase = 'revoked'; c.revalidateConfirmation(); expect(c.getState().detail.status).toBe('unloaded');
});
