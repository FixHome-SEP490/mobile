import { createBookingAttemptController } from './booking-create-attempt';
import { createEntryAttemptJournal } from '../runtime/entry-attempt-journal';
const dto = { serviceId: 's', addressId: 'a', description: 'PRIVATE', preferredStartAt: '', preferredEndAt: '', urgency: 'NORMAL' as const };
function fixture() {
  let raw: string | null = null, current = true, posts = 0;
  const storage = { getItem: async () => raw, setItem: async (_: string, value: string) => { raw = value; } };
  const journal = createEntryAttemptJournal(storage);
  const api = { createBooking: async () => { posts++; return { id: 'known', customerId: 'owner' }; }, getBooking: async () => ({ id: 'known', customerId: 'owner' }) };
  const deps = { journal, api, isCurrent: () => current, newIntentId: () => 'intent' };
  return { deps, api, storage, posts: () => posts, switch: () => { current = false; } };
}
it('2xx is confirmed by exact owned ID GET; duplicate same-intent cannot create again', async () => {
  const f = fixture(), c = createBookingAttemptController(f.deps);
  expect(await c.create('owner', dto, null)).toMatchObject({ phase: 'resolved', bookingId: 'known' });
  await c.create('owner', dto, null); expect(f.posts()).toBe(1);
});
it('unknown survives fresh controller/process and matching history cannot release it', async () => {
  const f = fixture(); f.api.createBooking = async () => { throw Error('timeout'); };
  const c = createBookingAttemptController(f.deps); expect((await c.create('owner', dto, ['old'])).phase).toBe('unknown');
  const next = createBookingAttemptController({ ...f.deps, journal: createEntryAttemptJournal(f.storage), newIntentId: () => 'another' });
  expect((await next.verify('owner')).phase).toBe('unknown'); await next.create('owner', dto, []); expect(f.posts()).toBe(0);
});
it('known ID is saved before failing GET and restart can reconcile it', async () => {
  const f = fixture(); f.api.getBooking = async () => { throw Error('offline'); };
  const c = createBookingAttemptController(f.deps); expect((await c.create('owner', dto, [])).phase).toBe('unknown');
  f.api.getBooking = async () => ({ id: 'known', customerId: 'owner' });
  expect(await createBookingAttemptController({ ...f.deps, journal: createEntryAttemptJournal(f.storage) }).verify('owner')).toMatchObject({ phase: 'resolved', bookingId: 'known' });
});
it('auth changes while durable marker is being saved prevent POST', async () => {
  const f = fixture(), save = f.storage.setItem;
  f.storage.setItem = async (key, value) => { await save(key, value); f.switch(); };
  expect(await createBookingAttemptController(f.deps).create('owner', dto, [])).toMatchObject({ phase: 'denied', provenUnsent: true });
  expect(f.posts()).toBe(0); expect(f.deps.journal.blocked('owner', 'booking-create')).toBe(false);
});
it('failed storage or a preexisting intent never returns proven-unsent cleanup authority', async () => {
  const failed = fixture(); failed.storage.setItem = async () => { throw Error('storage offline'); };
  const result = await createBookingAttemptController(failed.deps).create('owner', dto, []);
  expect(result).not.toHaveProperty('provenUnsent'); expect(failed.deps.journal.blocked('owner', 'booking-create')).toBe(true);
  const blocked = fixture(); await blocked.deps.journal.restore();
  await blocked.deps.journal.begin({ kind: 'booking-create', ownerUserId: 'owner', intentId: 'prior', createdAt: 1, baselineIds: null });
  expect(await createBookingAttemptController(blocked.deps).create('owner', dto, [])).toEqual({ phase: 'unknown' });
  expect(blocked.posts()).toBe(0);
});
it('wrong GET owner cannot resolve creation', async () => {
  const f = fixture(); f.api.getBooking = async () => ({ id: 'known', customerId: 'other' });
  expect((await createBookingAttemptController(f.deps).create('owner', dto, [])).phase).toBe('unknown');
});
