import { createTechnicianWarrantyController } from './technician-warranty-controller';
import { createEntryAttemptJournal } from '../runtime/entry-attempt-journal';
import { ids, m7Fixture, assignedClaim, visitRow, deferred } from '../aftercare/m7-fixtures.test-utils';
jest.mock('../../../api/client', () => ({ __esModule: true, default: {} }));
function setup() {
  const f = m7Fixture('technician'); let owner = { userId: ids.tech, role: 'technician' as const, sessionGeneration: 1 }, row: ReturnType<typeof assignedClaim> | null = assignedClaim();
  const transport = { findMine: jest.fn(async (_id: string, _current: () => boolean) => row), listMine: jest.fn(async (_query: unknown) => ({ data: row ? [row] : [], meta: { page: 1, pageSize: 100, total: row ? 1 : 0 } })),
    command: jest.fn(async (_id: string, op: string, _dto: unknown, _refs: readonly string[]) => {
      if (!row) throw Error('missing');
      if (op === 'accept') { row.status = 'accepted'; row.visit = visitRow(); }
      if (op === 'check-in') { row.visit!.status = 'checked_in'; row.visit!.checkedInAt = '2026-10-14T01:00:00Z'; }
      if (op === 'propose') { row.status = 'inspected'; row.visit!.status = 'inspected'; row.visit!.proposedResult = 'covered_workmanship'; }
      if (op === 'complete') { row.status = 'awaiting_customer'; row.awaitingPrompt = 'completion'; row.visit!.status = 'completed'; row.visit!.completedAt = '2026-10-14T02:00:00Z'; }
      if (op === 'decline') { const result = { ...row, technician: null }; row = null; return result; }
      return row;
    }) };
  const deps = { journal: f.entry, getOwner: () => owner, isActive: () => true, transport, newIntentId: f.runtime.newIntentId };
  const c = createTechnicianWarrantyController(deps); c.selectClaim(ids.claim);
  return { ...f, c, deps, transport, row: () => row, remove: () => { row = null; }, renew: () => { owner = { ...owner, sessionGeneration: 2 }; } };
}
it('separate assigned warranty accepts despite unrelated original repair assignment, check-in changes visit only', async () => {
  const f = setup(); f.server.order.technician.id = ids.customer;
  await f.c.prepare('accept', {}); await f.c.submitConfirmation(); expect(f.row()!.status).toBe('accepted'); expect(f.c.getState().task).toBe('TW03');
  await f.c.prepare('check-in', {}); await f.c.submitConfirmation(); expect(f.transport.command).toHaveBeenLastCalledWith(ids.claim, 'check-in', {}, ['existing-ref']);
  expect(f.row()!.status).toBe('accepted'); expect(f.row()!.visit!.status).toBe('checked_in'); expect(f.c.getState().task).toBe('TW04'); expect(f.reads).toEqual([]);
});
it('proposal requires checked-in visit, not_covered existing evidence; completion requires actual manager IN_PROGRESS', async () => {
  const f = setup(); await f.c.prepare('propose', { result: 'covered_workmanship', findings: 'Kiểm tra lỗi thực tế' }); await f.c.submitConfirmation(); expect(f.transport.command).not.toHaveBeenCalled();
  await f.c.prepare('accept', {}); await f.c.submitConfirmation(); await f.c.prepare('check-in', {}); await f.c.submitConfirmation();
  await f.c.prepare('propose', { result: 'not_covered', notCoveredReasonCode: 'expired', findings: 'Kiểm tra lỗi thực tế', evidenceRefs: [] }); await f.c.submitConfirmation(); expect(f.transport.command).toHaveBeenCalledTimes(2);
  await f.c.prepare('propose', { result: 'covered_workmanship', findings: 'Kiểm tra lỗi thực tế' }); await f.c.submitConfirmation(); expect(f.row()!.status).toBe('inspected');
  await f.c.prepare('complete', { notes: 'Đã xử lý lỗi thực tế' }); await f.c.submitConfirmation(); expect(f.transport.command).toHaveBeenCalledTimes(3);
  f.row()!.status = 'in_progress'; await f.c.prepare('complete', { notes: 'Đã xử lý lỗi thực tế' }); await f.c.submitConfirmation(); expect(f.c.getState()).toMatchObject({ phase: 'resolved', task: 'TW06' }); expect(f.row()!.status).toBe('awaiting_customer');
});
it('known decline acknowledgement plus authorized mine absence resolves; lost response absence cannot prove outcome', async () => {
  const f = setup(); await f.c.prepare('decline', { reasonCode: 'busy' }); await f.c.submitConfirmation(); expect(f.c.getState()).toMatchObject({ phase: 'resolved', access: 'not-assigned' }); const claim = f.c.getState().claim; expect(claim.status === 'ready' && claim.data).toBeNull();
  const other = setup(); other.transport.command.mockImplementation(async () => { other.remove(); throw Error('timeout'); });
  await other.c.prepare('decline', { reasonCode: 'busy' }); await other.c.submitConfirmation();
  const c = createTechnicianWarrantyController({ ...other.deps, journal: createEntryAttemptJournal(other.storage) }); c.selectClaim(ids.claim); await c.verify();
  expect(c.getState().phase).toBe('unknown'); await c.prepare('accept', {}); await c.submitConfirmation(); expect(other.transport.command).toHaveBeenCalledTimes(1);
});
it('GET403 and foreign assignment purge claim contact/URLs, reject stale in-flight read, no original-order fallback', async () => {
  const f = setup(); await f.c.refreshClaim(); expect(JSON.stringify(f.c.getState())).toContain('Địa chỉ mẫu');
  f.transport.findMine.mockRejectedValue({ response: { status: 403 } }); await f.c.refreshClaim(); expect(JSON.stringify(f.c.getState())).not.toContain('Địa chỉ mẫu'); expect(f.c.getState().access).toBe('revoked');
  const other = setup(), gate = deferred<ReturnType<typeof assignedClaim> | null>(); other.transport.findMine.mockImplementation(() => gate.promise);
  const pending = other.c.refreshClaim(); other.c.selectClaim(ids.coverage); gate.resolve(assignedClaim()); await pending; expect(JSON.stringify(other.c.getState())).not.toContain('Địa chỉ mẫu'); expect(other.reads).toEqual([]);
});
it.each(['cancel', 'renew', 'visit', 'owner'])('warranty captured %s changes during marker storage, no command', async action => {
  const f = setup(); await f.c.prepare('accept', {}); const gate = deferred<void>(); f.storageGate(() => gate.promise);
  const pending = f.c.submitConfirmation(); await Promise.resolve(); await Promise.resolve();
  if (action === 'cancel') f.c.cancelConfirmation(); if (action === 'renew') f.renew();
  const claim = f.c.getState().claim;
  if (claim.status === 'ready' && claim.data) { if (action === 'visit') claim.data.status = 'accepted'; if (action === 'owner') claim.data.technician = null; }
  gate.resolve(); await pending; expect(f.transport.command).not.toHaveBeenCalled(); if (action === 'cancel') expect(f.c.getState().phase).toBe('failed-known');
});
it('cold check-in recovery binds exact visit ID and never routes foreign journal operations', async () => {
  const f = setup(); await f.c.prepare('accept', {}); await f.c.submitConfirmation(); f.transport.command.mockRejectedValue(Error('timeout')); await f.c.prepare('check-in', {}); await f.c.submitConfirmation();
  f.row()!.visit!.status = 'checked_in'; f.row()!.visit!.checkedInAt = '2026-10-14T01:00:00Z';
  const c = createTechnicianWarrantyController({ ...f.deps, journal: createEntryAttemptJournal(f.storage) }); c.selectClaim(ids.claim); await c.verify(); expect(c.getState().phase).toBe('resolved'); expect(f.transport.command).toHaveBeenCalledTimes(2);
});
it('allocation throw is known unsent and releases busy for explicit confirmation retry', async () => {
  const f = setup(), allocate = jest.fn().mockImplementationOnce(() => { throw Error('allocation'); }).mockReturnValue('retry-warranty');
  const c = createTechnicianWarrantyController({ ...f.deps, newIntentId: allocate }); c.selectClaim(ids.claim);
  await c.prepare('accept', {}); await c.submitConfirmation(); expect(c.getState().phase).toBe('failed-known'); expect(f.transport.command).not.toHaveBeenCalled();
  await c.prepare('accept', {}); await c.submitConfirmation(); expect(f.transport.command).toHaveBeenCalledTimes(1);
});
it('lost accept cannot identify an older visit as the new accepted visit; manager state exposes only complete', async () => {
  const f = setup(); f.row()!.visit = { ...visitRow(), status: 'cancelled' }; f.transport.command.mockRejectedValue(Error('timeout'));
  await f.c.prepare('accept', {}); await f.c.submitConfirmation(); f.row()!.status = 'accepted'; f.row()!.visit!.status = 'scheduled'; await f.c.verify(); expect(f.c.getState().phase).toBe('unknown');
  f.row()!.visit!.id = ids.review; await f.c.verify(); expect(f.c.getState().phase).toBe('resolved');
  f.row()!.status = 'in_progress'; f.row()!.visit!.status = 'inspected'; await f.c.refreshClaim(); expect(f.c.availableCommands()).toEqual(['complete']);
});
