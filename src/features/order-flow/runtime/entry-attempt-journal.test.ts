import { createEntryAttemptJournal } from './entry-attempt-journal';
function storage(raw: string | null = null) { let data = raw; return { getItem: async () => data, setItem: async (_: string, value: string) => { data = value; }, value: () => data }; }
const booking = { ownerUserId: 'customer', intentId: 'intent', kind: 'booking-create' as const, createdAt: 1, baselineIds: ['old'] };
it('reserves before storage await and blocks double tap/restart without persisting payload', async () => {
  const s = storage(); const j = createEntryAttemptJournal(s); await j.restore();
  expect(await Promise.all([j.begin({ ...booking, description: 'PRIVATE', photos: ['file://face'] } as typeof booking), j.begin(booking)])).toEqual([true, false]);
  const resumed = createEntryAttemptJournal(s); await resumed.restore();
  expect(resumed.blocked('customer', 'booking-create')).toBe(true);
  expect(s.value()).not.toMatch(/PRIVATE|file:|description|photos/);
});
it.each(['broken', '{}', '[{"ownerUserId":"customer"}]'])('corrupt %s never enables writes', async raw => {
  const j = createEntryAttemptJournal(storage(raw)); await expect(j.restore()).rejects.toThrow();
  await expect(j.begin(booking)).rejects.toThrow();
});
it('records exact known ID durably and leaves other user/unknown intents locked', async () => {
  const s = storage(); const j = createEntryAttemptJournal(s); await j.restore(); await j.begin(booking);
  await j.recordId('customer', 'intent', 'known');
  const resumed = createEntryAttemptJournal(s); await resumed.restore();
  expect(resumed.list('customer')[0].confirmedId).toBe('known');
  await expect(resumed.recordId('other', 'intent', 'wrong')).rejects.toThrow();
  await expect(resumed.recordId('customer', 'intent', 'different')).rejects.toThrow();
  expect(resumed.blocked('customer', 'booking-create')).toBe(true);
});
it('write failure fails closed before dispatch eligibility', async () => {
  const j = createEntryAttemptJournal({ getItem: async () => null, setItem: async () => { throw Error('disk'); } }); await j.restore();
  await expect(j.begin(booking)).rejects.toThrow(); expect(j.blocked('customer', 'booking-create')).toBe(true);
});
