import { createOrderReadCoordinator } from './order-read-coordinator';
import { readyResource } from '../domain/order-session.types';
import type { OrderSessionKey } from '../domain/order-session.types';
const key: OrderSessionKey = { userId: 'tech', role: 'technician', sessionGeneration: 1, serviceOrderId: 'o' };
const row = { id: 'o', status: 'EN_ROUTE', technician: { id: 'tech' } };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
it('deduplicates readers and discards late GET after entity/session switch', async () => {
  const late = deferred<unknown>(); let calls = 0;
  const c = createOrderReadCoordinator({ readOrder: async () => { calls++; return late.promise; }, readResource: async () => [] });
  c.activate(key); const a = c.refreshOrderSession(key, 'focus'); const b = c.refreshOrderSession(key, 'focus');
  expect(calls).toBe(1);
  c.activate({ ...key, sessionGeneration: 2, serviceOrderId: 'other' });
  late.resolve(row); await Promise.all([a, b]);
  expect(c.getSnapshot()?.key.serviceOrderId).toBe('other');
  expect(c.getSnapshot()?.order.status).toBe('unloaded');
});
it('historical allowlist forbids full resource requests', async () => {
  let calls = 0;
  const c = createOrderReadCoordinator({ readOrder: async () => ({ id: 'o', code: 'TEST', historical: true, status: 'COMPLETED', createdAt: '', customerPhone: 'PRIVATE' }), readResource: async () => { calls++; return []; } });
  c.activate(key); await c.refreshOrderSession(key, 'focus'); await c.loadResource(key, 'evidence');
  expect(c.getSnapshot()?.access).toBe('historical'); expect(calls).toBe(0);
  expect(c.getSnapshot()?.order).toEqual(readyResource({ id: 'o', code: 'TEST', historical: true, status: 'COMPLETED', createdAt: '', completedAt: null, cancelledAt: null }, 1, expect.any(Number)));
});
it('customer face is removed at read boundary before subscribers see data', async () => {
  const customer = { ...key, userId: 'customer', role: 'customer' as const };
  const c = createOrderReadCoordinator({ readOrder: async () => row, readResource: async () => [
    { id: 'face', serviceOrderId: 'o', type: 'checkin_face', mediaUrl: 'PRIVATE' },
    { id: 'before', serviceOrderId: 'o', type: 'before', mediaUrl: 'https://example.test/fixture' },
  ] });
  c.activate(customer); await c.refreshOrderSession(customer, 'focus'); await c.loadResource(customer, 'evidence');
  const evidence = c.getSnapshot()?.resources.evidence;
  expect(evidence?.status).toBe('ready');
  if (evidence?.status === 'ready') expect(evidence.data).toEqual([expect.objectContaining({ id: 'before', type: 'BEFORE' })]);
});
it('403 purges all private data and invalidates concurrent resource GET', async () => {
  const late = deferred<unknown>(); let denied = false;
  const c = createOrderReadCoordinator({ readOrder: async () => { if (denied) throw { response: { status: 403 } }; return row; }, readResource: async () => late.promise });
  c.activate(key); await c.refreshOrderSession(key, 'focus'); const read = c.loadResource(key, 'evidence');
  denied = true; await c.refreshOrderSession(key, 'refresh'); late.resolve([{ id: 'e', type: 'before', serviceOrderId: 'o', mediaUrl: 'PRIVATE' }]); await read;
  expect(c.getSnapshot()?.access).toBe('revoked');
  expect(c.getSnapshot()?.order.status).toBe('unloaded');
  expect(c.getSnapshot()?.resources.evidence.status).toBe('unloaded');
});
it('reassignment discards private resources and denies old technician', async () => {
  let assigned = 'tech';
  const c = createOrderReadCoordinator({ readOrder: async () => ({ ...row, technician: { id: assigned } }), readResource: async () => [] });
  c.activate(key); await c.refreshOrderSession(key, 'focus'); await c.loadResource(key, 'evidence');
  assigned = 'new'; await c.refreshOrderSession(key, 'refresh');
  expect(c.getSnapshot()?.access).toBe('revoked'); expect(c.getSnapshot()?.resources.evidence.status).toBe('unloaded');
});
it('invalid or missing resource is error rather than empty, and invoice null is ready', async () => {
  let payload: unknown = null;
  const c = createOrderReadCoordinator({ readOrder: async () => row, readResource: async () => payload });
  c.activate(key); await c.refreshOrderSession(key, 'focus'); await c.loadResource(key, 'extras');
  expect(c.getSnapshot()?.resources.extras.status).toBe('error');
  await c.loadResource(key, 'invoice'); expect(c.getSnapshot()?.resources.invoice).toMatchObject({ status: 'ready', data: null });
  payload = { id: 'invoice', serviceOrderId: 'other', paymentStatus: 'paid', grandTotal: 1 };
  await c.loadResource(key, 'invoice'); expect(c.getSnapshot()?.resources.invoice.status).toBe('error');
});
it('cached terminal cannot regress from a later stale nonterminal response', async () => {
  let status = 'COMPLETED';
  const c = createOrderReadCoordinator({ readOrder: async () => ({ ...row, status }), readResource: async () => [] });
  c.activate(key); await c.refreshOrderSession(key, 'focus'); status = 'UNDER_REPAIR'; await c.refreshOrderSession(key, 'refresh');
  const o = c.getSnapshot()?.order; if (o?.status === 'ready') expect(o.data.status).toBe('COMPLETED');
});
it('customer reassignment purges private resources while preserving durable intent lock and policy', async () => {
  const customer = { ...key, role: 'customer' as const, userId: 'customer' }; let assigned = 'tech';
  const c = createOrderReadCoordinator({ readOrder: async () => ({ ...row, technician: { id: assigned } }), readResource: async () => [] });
  c.activate(customer); await c.refreshOrderSession(customer, 'focus'); c.setPendingIntent(customer, true);
  c.setProofPolicy(customer, { beforeMinimum: 2, afterMinimum: 2 }); await c.loadResource(customer, 'evidence');
  assigned = 'replacement'; await c.refreshOrderSession(customer, 'refresh');
  expect(c.getSnapshot()?.pendingIntent).toBe(true); expect(c.getSnapshot()?.proofPolicy?.beforeMinimum).toBe(2);
  expect(c.getSnapshot()?.resources.evidence.status).toBe('unloaded');
});
it('manual refresh reloads previously opened extras and blocks stale decisions during readback', async () => {
  let status = 'pending_approval'; let extraReads = 0;
  const customer = { ...key, role: 'customer' as const, userId: 'customer' };
  const c = createOrderReadCoordinator({ readOrder: async () => ({ ...row, status: 'UNDER_REPAIR' }), readResource: async () => {
    extraReads++; return [{ id: 'extra', serviceOrderId: 'o', status }];
  } });
  c.activate(customer); await c.refreshOrderSession(customer, 'focus'); await c.loadResource(customer, 'extras');
  status = 'approved'; const refresh = c.refreshOrderSession(customer, 'refresh');
  expect(c.getSnapshot()?.resources.extras.status).not.toBe('ready');
  await refresh;
  expect(extraReads).toBe(2);
  const extras = c.getSnapshot()?.resources.extras; if (extras?.status === 'ready') expect(extras.data[0].status).toBe('approved');
});
it('command read-back keeps the order and opened parts on screen while it reloads, then swaps in the new data', async () => {
  let parts = 0; let release!: () => void;
  const gate = new Promise<void>(r => { release = r; });
  const c = createOrderReadCoordinator({ readOrder: async () => row, readResource: async () => { parts++; if (parts > 1) await gate; return []; } });
  c.activate(key); await c.refreshOrderSession(key, 'focus'); await c.loadResource(key, 'parts');
  const readback = c.refreshOrderSession(key, 'command-readback');
  await Promise.resolve();
  expect(c.getSnapshot()?.order.status).toBe('ready');
  expect(c.getSnapshot()?.resources.parts.status).toBe('ready');
  release(); await readback;
  expect(c.getSnapshot()?.resources.parts.status).toBe('ready');
});
it('foreground reloads invoice and cash without fetching unopened resources', async () => {
  let paid = false; const calls: string[] = [];
  const customer = { ...key, role: 'customer' as const, userId: 'customer' };
  const c = createOrderReadCoordinator({ readOrder: async () => ({ ...row, status: 'UNDER_REPAIR', completionRequestedAt: 'fixture' }), readResource: async (_key, kind) => {
    calls.push(kind);
    if (kind === 'invoice') return { id: 'i', serviceOrderId: 'o', paymentStatus: paid ? 'paid' : 'unpaid', grandTotal: 1 };
    if (kind === 'cash') return { id: 'cash', serviceOrderId: 'o', status: paid ? 'disputed' : 'pending_confirmation', declaredAmount: 1 };
    throw new Error('Unopened resource');
  } });
  c.activate(customer); await c.refreshOrderSession(customer, 'focus'); await c.loadResource(customer, 'invoice'); await c.loadResource(customer, 'cash');
  paid = true; await c.refreshOrderSession(customer, 'foreground');
  const invoice = c.getSnapshot()?.resources.invoice, cash = c.getSnapshot()?.resources.cash;
  expect(invoice?.status).toBe('ready'); expect(cash?.status).toBe('ready');
  if (invoice?.status === 'ready') expect(invoice.data?.paymentStatus).toBe('paid');
  if (cash?.status === 'ready') expect(cash.data?.status).toBe('disputed');
  expect(calls.sort()).toEqual(['cash', 'cash', 'invoice', 'invoice']);
});
it('refresh discards pre-refresh in-flight extras even if the new read fails', async () => {
  const stale = deferred<unknown>(); let reads = 0;
  const c = createOrderReadCoordinator({ readOrder: async () => ({ ...row, status: 'UNDER_REPAIR' }), readResource: async () => {
    reads++; if (reads === 1) return stale.promise; throw new Error('offline');
  } });
  c.activate(key); await c.refreshOrderSession(key, 'focus'); const oldRead = c.loadResource(key, 'extras');
  await c.refreshOrderSession(key, 'foreground');
  stale.resolve([{ id: 'extra', serviceOrderId: 'o', status: 'pending_approval' }]); await oldRead;
  expect(reads).toBe(2); expect(c.getSnapshot()?.resources.extras.status).toBe('error');
});
it('failed order refresh keeps previously opened facts unavailable rather than stale or stuck loading', async () => {
  let offline = false;
  const c = createOrderReadCoordinator({ readOrder: async () => { if (offline) throw new Error('offline'); return row; }, readResource: async () => [] });
  c.activate(key); await c.refreshOrderSession(key, 'focus'); await c.loadResource(key, 'extras');
  offline = true; await c.refreshOrderSession(key, 'refresh');
  expect(c.getSnapshot()?.order.status).toBe('error'); expect(c.getSnapshot()?.resources.extras.status).toBe('error');
});
it('live refresh is quiet: ready data stays visible while reading and survives a failed read', async () => {
  const late = deferred<unknown>(); let fail = false;
  const c = createOrderReadCoordinator({ readOrder: async () => { if (fail) throw new Error('offline'); return late.promise; }, readResource: async () => [] });
  c.activate(key); const first = c.refreshOrderSession(key, 'focus'); late.resolve(row); await first;
  await c.loadResource(key, 'evidence');
  const seen: string[] = []; c.subscribe(() => seen.push(`${c.getSnapshot()?.order.status}/${c.getSnapshot()?.resources.evidence.status}`));
  await c.refreshOrderSession(key, 'live');
  expect(seen.every(s => s === 'ready/ready')).toBe(true);
  fail = true; await c.refreshOrderSession(key, 'live');
  expect(c.getSnapshot()?.order.status).toBe('ready'); expect(c.getSnapshot()?.resources.evidence.status).toBe('ready');
});
