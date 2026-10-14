import { createOrderCommandJournal } from './order-command-journal';
import { createOrderCommandAdapter, type CommandReadbackVerdict } from './order-controller-adapters';
const key = { userId: 'user', role: 'customer' as const, sessionGeneration: 1, serviceOrderId: 'order' };
function storage() { let data: string | null = null; return { getItem: async () => data, setItem: async (_key: string, value: string) => { data = value; }, value: () => data }; }
const intent = { intentId: 'intent', entityId: 'invoice', operation: 'vnpay-url' as const };
it('records exact upload entity durably without releasing the lock or permitting conflicting IDs', async () => {
  const s = storage(); const j = createOrderCommandJournal(s); await j.restore();
  await j.begin(key, { intentId: 'upload', entityId: 'upload', operation: 'face-upload' }, 100);
  await j.recordEntity('user', 'upload', 'evidence');
  await expect(j.recordEntity('other', 'upload', 'wrong')).rejects.toThrow();
  await expect(j.recordEntity('user', 'upload', 'different')).rejects.toThrow();
  await expect(j.recordEntity('user', 'upload', 'file://private')).rejects.toThrow();
  const resumed = createOrderCommandJournal(s); await resumed.restore();
  expect(resumed.list('user')[0]).toMatchObject({ entityId: 'upload', resultEntityId: 'evidence', status: 'unknown' });
  expect(resumed.hasUnresolved(key)).toBe(true);
});
it.each(['repair-recovery', 'evidence-delete'] as const)('durably restores the explicit %s operation', async operation => {
  const s = storage(); const j = createOrderCommandJournal(s); await j.restore();
  await j.begin(key, { ...intent, operation }, 100);
  const resumed = createOrderCommandJournal(s); await resumed.restore();
  expect(resumed.list('user')[0]).toMatchObject({ operation, status: 'unknown' });
});
it('unknown survives process resume and auth renewal; absent GET never unlocks', async () => {
  const s = storage(); const j = createOrderCommandJournal(s); await j.restore();
  await j.begin(key, intent, 100); await j.mark(key.userId, intent.intentId, 'unknown');
  const resumed = createOrderCommandJournal(s); await resumed.restore();
  expect(resumed.hasUnresolved({ ...key, sessionGeneration: 2 }, 'invoice')).toBe(true);
  expect(resumed.list('user')[0].status).toBe('unknown');
  expect(resumed.list('another')).toEqual([]);
});
it('serializes only minimal allowlisted marker and rejects malformed restore', async () => {
  const s = storage(); const j = createOrderCommandJournal(s); await j.restore();
  await j.begin(key, { ...intent, token: 'SECRET', mediaUrl: 'PRIVATE', note: 'PII' } as typeof intent, 100);
  expect(s.value()).not.toMatch(/SECRET|PRIVATE|PII|token|mediaUrl|note/);
  const broken = createOrderCommandJournal({ getItem: async () => 'not json', setItem: async () => undefined });
  await expect(broken.restore()).rejects.toThrow();
  await expect(broken.begin(key, intent, 100)).rejects.toThrow();
});
it('double tap cannot dispatch twice even while durable write is pending', async () => {
  const s = storage(); const j = createOrderCommandJournal(s); await j.restore();
  let calls = 0; const a = createOrderCommandAdapter(j, { isCurrent: () => true, refresh: async () => undefined });
  await Promise.all([a.dispatch(key, intent, async () => { calls++; }, () => 'unresolved'), a.dispatch(key, intent, async () => { calls++; }, () => 'unresolved')]);
  expect(calls).toBe(1); expect(j.list('user')[0].status).toBe('unknown');
});
it.each([401, 403, 409, 500])('POST %s stays locked without explicit readback proof', async status => {
  const j = createOrderCommandJournal(storage()); await j.restore();
  const a = createOrderCommandAdapter(j, { isCurrent: () => true, refresh: async () => undefined });
  await a.dispatch(key, intent, async () => { throw { response: { status } }; }, () => 'unresolved');
  expect(j.hasUnresolved(key, 'invoice')).toBe(true);
});
it('2xx followed by GET failure is unknown rather than failed-known or success', async () => {
  const j = createOrderCommandJournal(storage()); await j.restore();
  const a = createOrderCommandAdapter(j, { isCurrent: () => true, refresh: async () => { throw new Error('offline'); } });
  await a.dispatch(key, intent, async () => ({ status: 'PAID' }), () => 'resolved');
  expect(j.list('user')[0].status).toBe('unknown');
});
it('session change after dispatch preserves marker and never reads another session', async () => {
  const j = createOrderCommandJournal(storage()); await j.restore(); let current = true; let reads = 0;
  const a = createOrderCommandAdapter(j, { isCurrent: () => current, refresh: async () => { reads++; } });
  await a.dispatch(key, intent, async () => { current = false; }, () => 'resolved');
  expect(reads).toBe(0); expect(j.list('user')[0].status).toBe('unknown');
});
it('only explicit readback effect or definitive server failure releases write lock', async () => {
  const j = createOrderCommandJournal(storage()); await j.restore();
  const a = createOrderCommandAdapter(j, { isCurrent: () => true, refresh: async () => undefined });
  await a.dispatch(key, intent, async () => undefined, () => 'resolved');
  expect(j.hasUnresolved(key, 'invoice')).toBe(false);
  expect(j.list('user')[0].status).toBe('resolved');
});
it('accepts generic payment stable keys with dots/colon but excludes PII and URL keys', async () => {
  const j = createOrderCommandJournal(storage()); await j.restore();
  await expect(j.begin(key, { ...intent, stableKey: 'invoice.pay:fixture-123' }, 100)).resolves.toBe(true);
  const bad = createOrderCommandJournal(storage()); await bad.restore();
  await expect(bad.begin(key, { ...intent, stableKey: 'https://example.test/private' }, 100)).rejects.toThrow();
  await expect(bad.begin(key, { ...intent, stableKey: 'fixture@example.test' }, 100)).rejects.toThrow();
});

it('adapter supports async readback and stays unknown if session revoked during awaited readback', async () => {
  const j = createOrderCommandJournal(storage()); await j.restore();
  let current = true;
  const a = createOrderCommandAdapter(j, { isCurrent: () => current, refresh: async () => undefined });

  // Async readback works when session remains current
  await a.dispatch(key, intent, async () => undefined, async (): Promise<CommandReadbackVerdict> => 'resolved');
  expect(j.list('user')[0].status).toBe('resolved');

  // New intent: session revoked during awaited async readback
  const intent2 = { ...intent, intentId: 'intent-2' };
  await a.dispatch(key, intent2, async () => undefined, async (): Promise<CommandReadbackVerdict> => {
    current = false; // session changes while readback network call is awaiting
    return 'resolved';
  });
  // Marker must remain unknown, never cleared or marked resolved
  expect(j.list('user').find(m => m.intentId === 'intent-2')?.status).toBe('unknown');

  // Verify: session revoked during awaited readback does not clear lock
  const j2 = createOrderCommandJournal(storage()); await j2.restore();
  let current2 = true;
  const a2 = createOrderCommandAdapter(j2, { isCurrent: () => current2, refresh: async () => undefined });
  const intent3 = { ...intent, intentId: 'intent-3' };
  await a2.dispatch(key, intent3, async () => { throw new Error('timeout'); }, async (): Promise<CommandReadbackVerdict> => 'unresolved');
  expect(j2.list('user').find(m => m.intentId === 'intent-3')?.status).toBe('unknown');

  await a2.verify(key, 'intent-3', async (): Promise<CommandReadbackVerdict> => {
    current2 = false;
    return 'resolved';
  });
  // Must NOT have transitioned to resolved
  expect(j2.list('user').find(m => m.intentId === 'intent-3')?.status).toBe('unknown');
});
