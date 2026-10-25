import { createArrivalProofController, type FreshOrderPosition } from './arrival-proof-controller';
import { createOrderReadCoordinator } from '../runtime/order-read-coordinator';
import { createOrderCommandJournal } from '../runtime/order-command-journal';
const key = { userId: 'tech', role: 'technician' as const, sessionGeneration: 1, serviceOrderId: 'order' };
const asset = { source: 'camera' as const, uri: 'file://private', name: 'capture.jpg', type: 'image/jpeg', sizeBytes: 123 };
const position: FreshOrderPosition = { source: 'os', permission: 'granted', lat: 10, lng: 106, accuracyMeters: 12, timestamp: 1000 };
const evidence = (id: string, type: string, uploaderId = 'tech', serviceOrderId = 'order') => ({ id, type, uploaderId, serviceOrderId, mediaUrl: 'https://example.test/private', createdAt: '' });
function fixture() {
  let raw: string | null = null, active = true;
  const storage = { getItem: async () => raw, setItem: async (_: string, value: string) => { raw = value; } };
  const journal = createOrderCommandJournal(storage);
  const server = { order: { id: 'order', status: 'EN_ROUTE', technician: { id: 'tech' }, arrivalVerified: true, pricingMode: 'fixed_price', fixedUnitPrice: 10, departAvailableAt: '1970-01-01T00:00:00Z' }, evidence: [evidence('face', 'CHECKIN_FACE')], failRead: false };
  const coordinator = createOrderReadCoordinator({ readOrder: async () => { if (server.failRead) throw Error('offline'); return server.order; }, readResource: async (_, kind) => kind === 'evidence' ? server.evidence : [] }); coordinator.activate(key);
  const transport = { depart: jest.fn(async () => { server.order.status = 'EN_ROUTE'; }), checkIn: jest.fn(async () => ({ result: 'VALID', serviceOrderId: 'order', technicianId: 'tech' })), uploadFace: jest.fn(async () => ({ id: 'uploaded' })), uploadBefore: jest.fn(async () => ({ id: 'uploaded' })), recoverRepair: jest.fn(async () => undefined), deleteEvidence: jest.fn(async () => undefined) };
  const deps = { coordinator, journal, transport, getKey: () => active ? key : null, isActive: () => active, now: () => 1000, newIntentId: () => `attempt-${journal.list('tech').length}` };
  return { deps, server, transport, storage, journal, coordinator, blur: () => { active = false; } };
}
it('departure refreshes canonical assignment/time, locks 409 instead of resending', async () => {
  const f = fixture(); f.server.order.status = 'ACCEPTED'; f.transport.depart.mockImplementation(async () => { throw { response: { status: 409 } }; });
  const c = createArrivalProofController(f.deps); await c.depart(); await c.depart();
  expect(f.transport.depart).toHaveBeenCalledTimes(1); expect(c.getState().phase).toBe('unknown');
  f.server.order.status = 'EN_ROUTE'; await c.verify(); expect(c.getState().phase).toBe('resolved');
});
it('future server departure time denies without hardcoded early-minutes', async () => {
  const f = fixture(); f.server.order.status = 'ACCEPTED'; f.server.order.departAvailableAt = '2099-01-01T00:00:00Z';
  const c = createArrivalProofController(f.deps); await c.depart(); expect(f.transport.depart).not.toHaveBeenCalled(); expect(c.getState().phase).toBe('denied');
});
const departureRejection = { response: { data: { success: false, error: { code: 'ORDER_INVALID_TRANSITION', message: 'Server guard' } } } };
it('structured enRoute precommit rejection releases only that attempt and next departure gets fresh canonical preflight', async () => {
  const f = fixture(); f.server.order.status = 'ACCEPTED';
  f.transport.depart.mockRejectedValueOnce(departureRejection);
  const c = createArrivalProofController(f.deps); await c.depart();
  expect(c.getState().phase).toBe('denied'); expect(f.journal.list('tech')[0].status).toBe('failed-known');
  f.server.order.departAvailableAt = '2099-01-01T00:00:00Z'; await c.depart();
  expect(f.transport.depart).toHaveBeenCalledTimes(1);
  f.server.order.departAvailableAt = '1970-01-01T00:00:00Z'; await c.depart();
  expect(f.transport.depart).toHaveBeenCalledTimes(2); expect(c.getState().phase).toBe('resolved');
});
it('validated precommit rejection proves unsent effect even if its later GET fails, without an absence heuristic', async () => {
  const f = fixture(); f.server.order.status = 'ACCEPTED';
  f.transport.depart.mockImplementationOnce(async () => { f.server.failRead = true; throw departureRejection; });
  await createArrivalProofController(f.deps).depart();
  expect(f.journal.list('tech')[0].status).toBe('failed-known');
});
it.each([new Error('offline'), { response: { status: 409 } }, { response: { data: { success: true, error: { code: 'ORDER_INVALID_TRANSITION' } } } }, { response: { data: { success: false, code: 'ORDER_INVALID_TRANSITION' } } }])('network/malformed departure response stays unknown %p', async error => {
  const f = fixture(); f.server.order.status = 'ACCEPTED'; f.transport.depart.mockRejectedValue(error);
  const c = createArrivalProofController(f.deps); await c.depart(); await c.depart();
  expect(f.journal.list('tech')[0].status).toBe('unknown'); expect(f.transport.depart).toHaveBeenCalledTimes(1);
});
it('same structured code from BEFORE cannot use the departure-only no-effect classifier', async () => {
  const f = fixture(); f.transport.uploadBefore.mockRejectedValue(departureRejection);
  const c = createArrivalProofController(f.deps); await c.uploadBefore(asset); await c.uploadBefore(asset);
  expect(f.journal.list('tech')[0].status).toBe('unknown'); expect(f.transport.uploadBefore).toHaveBeenCalledTimes(1);
});
it.each([400, 413, 422])('BEFORE upload rejected with HTTP %i proves no effect, so the next upload is allowed', async status => {
  const f = fixture(); f.transport.uploadBefore.mockRejectedValueOnce({ response: { status } });
  const c = createArrivalProofController(f.deps); await c.uploadBefore(asset);
  expect(c.getState().phase).toBe('denied'); expect(c.getState().message).toContain('chụp lại'); expect(f.journal.list('tech')[0].status).toBe('failed-known');
  await c.uploadBefore(asset); expect(f.transport.uploadBefore).toHaveBeenCalledTimes(2);
});
it.each([{ response: { status: 500 } }, { response: { status: 409 } }, new Error('timeout')])('BEFORE upload failing with %p stays unknown (no proof of no effect)', async error => {
  const f = fixture(); f.transport.uploadBefore.mockRejectedValue(error);
  const c = createArrivalProofController(f.deps); await c.uploadBefore(asset);
  expect(c.getState().phase).toBe('unknown'); expect(f.journal.list('tech')[0].status).toBe('unknown');
});
it.each([{ ...position, permission: 'denied' as const },{ ...position, timestamp: -30000 }, { ...position, accuracyMeters: Number.NaN }, { ...position, source: 'destination' }])('rejects permission/stale/invalid/non OS sample %p', async sample => {
  const f = fixture(); await createArrivalProofController(f.deps).checkIn(sample as FreshOrderPosition); expect(f.transport.checkIn).not.toHaveBeenCalled();
});
it.each(['low_accuracy', 'out_of_geofence'])('explicit own %s checkin allows a new sample, not same measurement', async result => {
  const f = fixture(); f.server.order.arrivalVerified = false;
  f.transport.checkIn.mockImplementation(async () => ({ result, serviceOrderId: 'order', technicianId: 'tech' }));
  const c = createArrivalProofController(f.deps); await c.checkIn(position);
  expect(c.getState().phase).toBe('denied'); expect(c.getState().message).toBeTruthy();
  await c.checkIn(position);
  expect(f.transport.checkIn).toHaveBeenCalledTimes(1);
  await c.checkIn({ ...position, timestamp: 1001 }); expect(f.transport.checkIn).toHaveBeenCalledTimes(2);
});
it('a rejection response from another technician cannot release the dispatched checkin lock', async () => {
  const f = fixture(); f.server.order.arrivalVerified = false;
  f.transport.checkIn.mockImplementation(async () => ({ result: 'low_accuracy', serviceOrderId: 'order', technicianId: 'other' }));
  const c = createArrivalProofController(f.deps); await c.checkIn(position); await c.checkIn({ ...position, timestamp: 1001 });
  expect(c.getState().phase).toBe('unknown'); expect(f.transport.checkIn).toHaveBeenCalledTimes(1);
});
it('own camera face requires exact order readback and no face/delete after repair', async () => {
  const f = fixture(); f.server.evidence = [];
  f.transport.uploadFace.mockImplementation(async () => { f.server.evidence.push(evidence('uploaded', 'CHECKIN_FACE', 'tech', 'wrong-order')); return { id: 'uploaded' }; });
  const c = createArrivalProofController(f.deps); await c.uploadFace(asset); expect(c.getState().phase).toBe('unknown');
  f.server.evidence[0] = evidence('uploaded', 'CHECKIN_FACE'); await c.verify(); expect(c.getState().phase).toBe('resolved');
  f.server.order.status = 'UNDER_REPAIR'; await c.uploadFace(asset); await c.deleteBefore('uploaded', true);
  expect(f.transport.uploadFace).toHaveBeenCalledTimes(1); expect(f.transport.deleteEvidence).not.toHaveBeenCalled();
});
it('reassignment after upload blocks old owner readback despite matching saved evidence', async () => {
  const f = fixture(); f.transport.uploadBefore.mockImplementation(async () => {
    f.server.evidence.push(evidence('uploaded', 'BEFORE')); f.server.order.technician.id = 'replacement'; return { id: 'uploaded' };
  });
  const c = createArrivalProofController(f.deps); await c.uploadBefore(asset);
  expect(f.journal.list('tech')[0].status).toBe('unknown'); await c.verify();
  expect(f.journal.list('tech')[0].status).toBe('unknown'); expect(f.transport.uploadBefore).toHaveBeenCalledTimes(1);
});
it('camera validation and corrupt durable storage deny dispatch without persisting assets', async () => {
  const f = fixture(), c = createArrivalProofController(f.deps);
  await c.uploadBefore({ ...asset, sizeBytes: 0 }); await c.uploadBefore({ ...asset, source: 'library' } as unknown as typeof asset);
  expect(f.transport.uploadBefore).not.toHaveBeenCalled();
  const corrupted = createOrderCommandJournal({ getItem: async () => '{bad', setItem: jest.fn() });
  await createArrivalProofController({ ...f.deps, journal: corrupted }).uploadBefore(asset);
  expect(f.transport.uploadBefore).not.toHaveBeenCalled();
});
it('recovery requires attested minimum of own proof and blocks any unresolved operation', async () => {
  const f = fixture(); f.server.evidence.push(evidence('before', 'BEFORE', 'prior-tech'));
  f.coordinator.setProofPolicy(key, { beforeMinimum: 1, afterMinimum: 1 });
  const c = createArrivalProofController(f.deps); await c.recoverRepair(true); expect(f.transport.recoverRepair).not.toHaveBeenCalled();
  f.server.evidence[1] = evidence('before', 'BEFORE'); await f.journal.restore();
  await f.journal.begin(key, { intentId: 'prior', entityId: 'order', operation: 'before-upload' }, 1);
  await c.recoverRepair(true); expect(f.transport.recoverRepair).not.toHaveBeenCalled(); expect(c.getState().phase).toBe('unknown');
});
it('VALID is not arrival proof without canonical own arrival GET', async () => {
  const f = fixture(); f.server.order.arrivalVerified = false;
  const c = createArrivalProofController(f.deps); await c.checkIn(position); expect(c.getState().phase).toBe('unknown');
});
it('camera upload saves exact returned ID; wrong uploader cannot confirm and process restart cannot resend', async () => {
  const f = fixture(); f.server.evidence.push(evidence('uploaded', 'BEFORE', 'old-tech'));
  const c = createArrivalProofController(f.deps); await c.uploadBefore(asset); expect(c.getState().phase).toBe('unknown');
  const resumed = createArrivalProofController({ ...f.deps, journal: createOrderCommandJournal(f.storage) });
  await resumed.uploadBefore(asset); expect(f.transport.uploadBefore).toHaveBeenCalledTimes(1);
  f.server.evidence[1] = evidence('uploaded', 'BEFORE'); await resumed.verify(); expect(resumed.getState().phase).toBe('resolved');
});
it('upload without returned ID never matches arbitrary newest evidence', async () => {
  const f = fixture(); f.transport.uploadBefore.mockImplementation(async () => ({} as { id: string })); f.server.evidence.push(evidence('newest', 'BEFORE'));
  const c = createArrivalProofController(f.deps); await c.uploadBefore(asset); await c.verify(); expect(c.getState().phase).toBe('unknown');
});
it('BEFORE requires own face and arrival, ignores aggregate counts', async () => {
  const f = fixture(); f.server.evidence = [evidence('face', 'CHECKIN_FACE', 'old-tech')];
  await createArrivalProofController(f.deps).uploadBefore(asset); expect(f.transport.uploadBefore).not.toHaveBeenCalled();
});
it('2xx plus GET failure remains unknown with known ID saved', async () => {
  const f = fixture(); f.transport.uploadBefore.mockImplementation(async () => { f.server.failRead = true; return { id: 'uploaded' }; });
  const c = createArrivalProofController(f.deps); await c.uploadBefore(asset); expect(c.getState().phase).toBe('unknown');
  expect(f.journal.list('tech')[0].resultEntityId).toBe('uploaded');
});
it('auto-start confirmed by GET does not send recovery and fixed scope needs no quote', async () => {
  const f = fixture(); f.transport.uploadBefore.mockImplementation(async () => { f.server.evidence.push(evidence('uploaded', 'BEFORE')); f.server.order.status = 'UNDER_REPAIR'; return { id: 'uploaded' }; });
  const c = createArrivalProofController(f.deps); await c.uploadBefore(asset); expect(c.getState().phase).toBe('resolved'); expect(f.transport.recoverRepair).not.toHaveBeenCalled();
});
it('recovery missing policy fails closed; attested own proof enables confirmed attempt but POST2xx EN_ROUTE stays locked', async () => {
  const f = fixture(); f.server.evidence.push(evidence('before', 'BEFORE'));
  const c = createArrivalProofController(f.deps); await c.recoverRepair(true); expect(f.transport.recoverRepair).not.toHaveBeenCalled();
  f.coordinator.setProofPolicy(key, { beforeMinimum: 1, afterMinimum: 1 });
  await c.recoverRepair(false); expect(f.transport.recoverRepair).not.toHaveBeenCalled();
  await c.recoverRepair(true); expect(f.transport.recoverRepair).toHaveBeenCalledTimes(1); expect(c.getState().phase).toBe('unknown');
  await c.recoverRepair(true); expect(f.transport.recoverRepair).toHaveBeenCalledTimes(1);
});
it('delete needs confirmation, own BEFORE EN_ROUTE; unknown presence never releases, fresh list absence resolves', async () => {
  const f = fixture(); f.server.evidence.push(evidence('before', 'BEFORE'));
  const c = createArrivalProofController(f.deps); await c.deleteBefore('face', true); await c.deleteBefore('before', false); expect(f.transport.deleteEvidence).not.toHaveBeenCalled();
  await c.deleteBefore('before', true); expect(c.getState().phase).toBe('unknown'); await c.deleteBefore('before', true); expect(f.transport.deleteEvidence).toHaveBeenCalledTimes(1);
  f.server.evidence = f.server.evidence.filter(e => e.id !== 'before'); await c.verify(); expect(c.getState().phase).toBe('resolved');
});
it('session or assignment changed during storage does not send late mutation', async () => {
  const f = fixture(), save = f.storage.setItem; f.storage.setItem = async (k, v) => { await save(k, v); f.blur(); };
  await createArrivalProofController(f.deps).uploadBefore(asset); expect(f.transport.uploadBefore).not.toHaveBeenCalled();
});
it('sends deferAutoStart to the BEFORE transport so several photos can follow each other while EN_ROUTE', async () => {
  const f = fixture(); let n = 0;
  f.transport.uploadBefore.mockImplementation(async () => { n += 1; f.server.evidence.push(evidence(`before-${n}`, 'BEFORE')); return { id: `before-${n}` }; });
  const c = createArrivalProofController(f.deps);
  await c.uploadBefore(asset, { deferAutoStart: true }); expect(c.getState().phase).toBe('resolved');
  await c.uploadBefore(asset, { deferAutoStart: false }); expect(c.getState().phase).toBe('resolved');
  expect(f.transport.uploadBefore.mock.calls.map((call) => (call as unknown[])[2])).toEqual([{ deferAutoStart: true }, { deferAutoStart: false }]);
});

