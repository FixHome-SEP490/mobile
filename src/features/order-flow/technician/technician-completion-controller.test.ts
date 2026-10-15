import { createTechnicianCompletionController } from './technician-completion-controller';
import { m6Fixture, afterAsset, proof, deferred } from '../customer/m6-fixtures.test-utils';
import { createOrderCommandJournal } from '../runtime/order-command-journal';
jest.mock('../../../api/client', () => ({ __esModule: true, default: {} }));
function setup() {
  const f = m6Fixture('technician');
  const transport = { uploadAfter: jest.fn(async () => { f.server.evidence.push(proof('new-after')); return { id: 'new-after' }; }),
    deleteEvidence: jest.fn(async (_order: string, id: string) => { f.server.evidence = f.server.evidence.filter(e => e.id !== id); }),
    requestCompletion: jest.fn(async (_id: string, _dto: unknown) => { f.server.order.completionRequestedAt = '2026-10-14T01:00:00Z'; }) };
  const deps = { ...f.runtime, transport };
  return { ...f, transport, deps, c: createTechnicianCompletionController(deps) };
}
it('missing policy allows an explicit Backend attempt with real handover, no customer acceptance or fake completion', async () => {
  const f = setup(); await f.c.requestCompletion('  Bàn giao máy chạy ổn định  '); await f.c.submitConfirmation();
  expect(f.transport.requestCompletion).toHaveBeenCalledWith('order', { completionNote: 'Bàn giao máy chạy ổn định' });
  expect(f.c.getState().phase).toBe('resolved'); expect(f.server.order.status).toBe('UNDER_REPAIR');
  expect(f.server.invoice!.paymentStatus).toBe('unpaid');
});
it.each(['policy', 'parts', 'quote', 'extra', 'foreign-after', 'missing-parts'])('known blocker %s sends no completion', async blocker => {
  const f = setup();
  if (blocker === 'policy') f.coordinator.setProofPolicy(f.key, { beforeMinimum: 1, afterMinimum: 2 });
  if (blocker === 'parts') f.server.parts = [{ id: 'p', serviceOrderId: 'order', technicianId: 'tech', status: 'requested', items: [] }];
  if (blocker === 'quote') f.server.quotations = [{ id: 'q', serviceOrderId: 'order', technicianId: 'tech', status: 'SENT', items: [] }];
  if (blocker === 'extra') f.server.extras = [{ id: 'x', serviceOrderId: 'order', status: 'pending_approval' }];
  if (blocker === 'foreign-after') f.server.evidence = [proof('foreign', 'other')];
  if (blocker === 'missing-parts') f.server.failResource = 'parts';
  await f.c.requestCompletion(''); await f.c.submitConfirmation(); expect(f.transport.requestCompletion).not.toHaveBeenCalled();
});
it('AFTER upload confirms exact owned private GET asset and never chains completion', async () => {
  const f = setup(); await f.c.uploadAfter(afterAsset);
  expect(f.c.getState()).toMatchObject({ phase: 'resolved', confirmedUpload: { id: 'new-after', uploaderId: 'tech', type: 'AFTER' } });
  expect(f.transport.requestCompletion).not.toHaveBeenCalled(); expect([...f.disk.values()].join('')).not.toContain('file:');
});
it('lost upload response never matches unrelated AFTER; cold recovery requires returned exact ID', async () => {
  const f = setup(); f.transport.uploadAfter.mockImplementation(async () => { f.server.evidence.push(proof('concurrent')); throw Error('timeout'); });
  await f.c.uploadAfter(afterAsset); const c = createTechnicianCompletionController({ ...f.deps, journal: createOrderCommandJournal(f.storage) });
  await c.verify(); await c.uploadAfter(afterAsset); expect(c.getState().phase).toBe('unknown'); expect(f.transport.uploadAfter).toHaveBeenCalledTimes(1);
});
it('AFTER upload is denied EN_ROUTE, after request, and foreign session; M3 remains independent', async () => {
  const f = setup(); f.server.order.status = 'EN_ROUTE'; await f.c.uploadAfter(afterAsset);
  f.server.order.status = 'UNDER_REPAIR'; f.server.order.completionRequestedAt = '2026-10-14T00:00:00Z'; await f.c.uploadAfter(afterAsset);
  expect(f.transport.uploadAfter).not.toHaveBeenCalled();
});
it('delete needs explicit exact owned AFTER confirmation; delete unknown only resolves by fresh absence', async () => {
  const f = setup(); await f.c.requestDeleteAfter('after'); f.c.cancelConfirmation(); await f.c.submitConfirmation(); expect(f.transport.deleteEvidence).not.toHaveBeenCalled();
  await f.c.requestDeleteAfter('after'); await f.c.submitConfirmation(); expect(f.transport.deleteEvidence).toHaveBeenCalledWith('order', 'after'); expect(f.c.getState().phase).toBe('resolved');
  f.server.evidence = [{ ...proof('before'), type: 'BEFORE' }]; await f.c.requestDeleteAfter('before'); await f.c.submitConfirmation(); expect(f.transport.deleteEvidence).toHaveBeenCalledTimes(1);
});
it.each(['cancel', 'renew', 'reassign'])('storage await %s cannot dispatch captured handover', async change => {
  const f = setup(); await f.c.requestCompletion('Bàn giao'); const gate = deferred<void>(); f.deferStorage(() => gate.promise);
  const pending = f.c.submitConfirmation(); await Promise.resolve(); await Promise.resolve();
  if (change === 'cancel') f.c.cancelConfirmation(); if (change === 'renew') f.renew();
  if (change === 'reassign') f.coordinator.getSnapshot()!.order = { status: 'ready', requestSeq: 3, fetchedAt: 1000, data: { ...f.server.order, technician: { id: 'other' } } as never };
  gate.resolve(); await pending; expect(f.transport.requestCompletion).not.toHaveBeenCalled();
});
it('request plus unavailable invoice remains unknown, idle restored recovery is GET only and scoped', async () => {
  const f = setup(); f.transport.requestCompletion.mockImplementation(async () => { f.server.order.completionRequestedAt = '2026-10-14T01:00:00Z'; f.server.failResource = 'invoice'; });
  await f.c.requestCompletion(''); await f.c.submitConfirmation(); expect(f.c.getState().phase).toBe('unknown');
  f.server.failResource = ''; const c = createTechnicianCompletionController({ ...f.deps, journal: createOrderCommandJournal(f.storage) }); await c.verify();
  expect(c.getState().phase).toBe('resolved'); expect(f.transport.requestCompletion).toHaveBeenCalledTimes(1);
  const other = setup(); await other.journal.restore(); await other.journal.begin(other.key, { intentId: 'foreign', entityId: 'order', operation: 'quote-create' });
  await other.c.verify(); expect(other.reads).toEqual([]); expect(other.journal.list('tech')[0].status).toBe('submitting');
});
it('public/foreign asset with a returned ID cannot count as an own confirmed private upload', async () => {
  const f = setup(); f.transport.uploadAfter.mockImplementation(async () => { f.server.evidence.push({ ...proof('new-after'), mediaUrl: 'https://res.cloudinary.com/fixture/image/upload/public.jpg' }); return { id: 'new-after' }; });
  await f.c.uploadAfter(afterAsset); expect(f.c.getState()).toMatchObject({ phase: 'unknown', confirmedUpload: null });
});
it('handover is bound to its owner across revoked readback and cannot release from a foreign invoice', async () => {
  const f = setup(); f.transport.requestCompletion.mockRejectedValue(Error('timeout')); await f.c.requestCompletion('Bàn giao'); await f.c.submitConfirmation();
  f.server.order.technician.id = 'other'; f.server.order.completionRequestedAt = '2026-10-14T01:00:00Z'; await f.c.verify();
  expect(f.journal.list('tech')[0].status).toBe('unknown');
});
it('structured EVIDENCE_REQUIRED_AFTER rollback is known even if GET fails', async () => {
  const f = setup(); f.transport.requestCompletion.mockImplementation(async () => { f.server.failOrder = true;
    throw { response: { status: 409, data: { success: false, statusCode: 409, message: 'Thiếu ảnh sau sửa chữa.', error: { code: 'EVIDENCE_REQUIRED_AFTER', message: 'AFTER evidence required.' } } } }; });
  await f.c.requestCompletion(''); await f.c.submitConfirmation();
  expect(f.journal.list('tech')[0].status).toBe('failed-known'); expect(f.c.getState().phase).toBe('failed-known');
  expect(f.c.getState().message).toContain('ảnh sau sửa chữa');
  // Explicit supplement + fresh confirmation retries after the known rollback.
  f.server.failOrder = false;
  f.transport.requestCompletion.mockImplementation(async () => { f.server.order.completionRequestedAt = '2026-10-14T01:00:00Z'; });
  await f.c.uploadAfter(afterAsset);
  await f.c.requestCompletion(''); await f.c.submitConfirmation();
  expect(f.transport.requestCompletion).toHaveBeenCalledTimes(2); expect(f.c.getState().phase).toBe('resolved');
});
it.each([
  { response: { status: 409, data: { success: false, statusCode: 409, message: 'Lỗi.', error: { code: 'OTHER_CODE', message: 'Khác.' } } } },
  { response: { status: 409, data: { success: false, statusCode: 409, message: 'Lỗi.' } } },
  { response: { status: 409, data: { success: true, statusCode: 409, message: 'Lỗi.', error: { code: 'EVIDENCE_REQUIRED_AFTER' } } } },
  { response: { status: 422, data: { success: false, statusCode: 422, message: 'Lỗi.', error: { code: 'EVIDENCE_REQUIRED_AFTER' } } } },
  { response: { status: 400, data: { success: false, statusCode: 400, message: 'Lỗi.', error: { code: 'EVIDENCE_REQUIRED_AFTER' } } } },
  { response: { status: 401 } }, { response: { status: 500 } },
])('non-rollback completion failure remains unknown %p', async error => {
  const f = setup(); f.transport.requestCompletion.mockRejectedValue(error);
  await f.c.requestCompletion(''); await f.c.submitConfirmation();
  expect(f.journal.list('tech')[0].status).toBe('unknown'); expect(f.c.getState().phase).toBe('unknown');
});
it('completion rollback proof never releases upload or delete locks', async () => {
  const coded = { response: { status: 409, data: { success: false, statusCode: 409, message: 'Lỗi.', error: { code: 'EVIDENCE_REQUIRED_AFTER', message: 'AFTER evidence required.' } } } };
  const f = setup(); f.transport.uploadAfter.mockRejectedValue(coded);
  await f.c.uploadAfter(afterAsset); expect(f.journal.list('tech')[0].status).toBe('unknown');
  const g = setup(); g.transport.deleteEvidence.mockRejectedValue(coded);
  await g.c.requestDeleteAfter('after'); await g.c.submitConfirmation();
  expect(g.journal.list('tech')[0].status).toBe('unknown');
});
