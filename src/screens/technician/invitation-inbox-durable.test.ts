import { createInvitationInbox, type InboxState } from './invitation-inbox';
import { createEntryAttemptJournal } from '../../features/order-flow/runtime/entry-attempt-journal';
jest.mock('../../features/order-flow/runtime/entry-attempt-production', () => {
  let sequence = 0;
  return { entryAttemptJournal: {}, newEntryIntentId: () => `intent-${++sequence}` };
});
const invitation = { id: 'invite', bookingId: 'booking', priorityOrder: 1, status: 'PENDING' as const, invitedAt: '', expiresAt: '2099-01-01T00:00:00Z' };
const orderId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
function fixture() {
  let raw: string | null = null, owner: string | null = `tech-${Math.random().toString(36).slice(2)}`;
  const storage = { getItem: async () => raw, setItem: async (_: string, v: string) => { raw = v; } };
  const auth = { getUserId: () => owner, subscribe: () => () => undefined };
  const api = { getMyInvitations: async () => [invitation], respondInvitation: jest.fn(async () => ({ serviceOrder: { id: orderId } })) };
  const orders = { getMyOrdersPage: async () => ({ data: [], total: 0 }), getOrder: async () => ({ id: orderId, status: 'ACCEPTED' as const, bookingId: 'booking', technician: { id: owner } }) as never };
  const write = jest.fn<void, [InboxState]>(), notify = jest.fn();
  const controller = () => createInvitationInbox(api, orders, write, notify, auth, createEntryAttemptJournal(storage));
  return { controller, api, orders, storage, write, notify, auth, change: () => { owner = 'other'; } };
}
it('uncertainty remains locked after a process-local cache cannot be relied on', async () => {
  const f = fixture(); f.api.respondInvitation.mockRejectedValue(Error('timeout'));
  let c = f.controller(); await c.focus(); await c.respond('invite', 'ACCEPT'); c.blur();
  c = f.controller(); await c.focus(); await c.respond('invite', 'ACCEPT'); expect(f.api.respondInvitation).toHaveBeenCalledTimes(1);
});
it('durable restored invitation alone prevents POST; missing linked order never unlocks', async () => {
  const f = fixture(), j = createEntryAttemptJournal(f.storage); await j.restore();
  await j.begin({ kind: 'invitation', invitationId: 'invite', bookingId: 'booking', action: 'ACCEPT', ownerUserId: f.auth.getUserId()!, intentId: 'prior', createdAt: 1 });
  const c = f.controller(); await c.focus(); await c.respond('invite', 'DECLINE'); expect(f.api.respondInvitation).not.toHaveBeenCalled();
});
it('captures original owner and rechecks session after durable storage before POST', async () => {
  const f = fixture(), save = f.storage.setItem;
  f.storage.setItem = async (key, v) => { await save(key, v); f.change(); };
  const c = f.controller(); await c.focus(); await c.respond('invite', 'ACCEPT'); expect(f.api.respondInvitation).not.toHaveBeenCalled();
});
it('actual serviceOrder.id envelope only navigates after own linked-order GET', async () => {
  const f = fixture(), c = f.controller(); await c.focus(); await c.respond('invite', 'ACCEPT');
  expect(f.notify).toHaveBeenCalledWith(expect.objectContaining({ orderId }), expect.any(Function));
});
it('GET autoaccept race uses real current linked order without sending stale ACCEPT', async () => {
  const f = fixture(), c = f.controller(); await c.focus();
  f.api.getMyInvitations = async () => [];
  f.orders.getMyOrdersPage = async () => ({ data: [await f.orders.getOrder()], total: 1 });
  await c.respond('invite', 'ACCEPT'); expect(f.api.respondInvitation).not.toHaveBeenCalled();
  expect(f.notify).toHaveBeenCalledWith(expect.objectContaining({ orderId }), expect.any(Function));
});
it('returned order ID survives restart and exact GET works without newest/jobs-row heuristics', async () => {
  const f = fixture(), j = createEntryAttemptJournal(f.storage); await j.restore();
  await j.begin({ kind: 'invitation', invitationId: 'invite', bookingId: 'booking', action: 'ACCEPT', ownerUserId: f.auth.getUserId()!, intentId: 'prior', createdAt: 1 });
  await j.recordId(f.auth.getUserId()!, 'prior', orderId);
  await f.controller().focus(); expect(f.notify).toHaveBeenCalledWith(expect.objectContaining({ orderId }), expect.any(Function));
});
it('blur/refocus during held preflight GET clears only the never-dispatched attempt and allows one later POST', async () => {
  const f = fixture(), c = f.controller(); await c.focus();
  let release!: (value: typeof invitation[]) => void, entered!: () => void;
  const waiting = new Promise<void>(resolve => { entered = resolve; });
  let first = true;
  f.api.getMyInvitations = async () => {
    if (first) { first = false; entered(); return await new Promise<typeof invitation[]>(resolve => { release = resolve; }); }
    return [invitation];
  };
  const request = c.respond('invite', 'ACCEPT'); await waiting;
  c.blur(); await c.focus(); release([invitation]); await request;
  expect(f.api.respondInvitation).not.toHaveBeenCalled();
  await c.respond('invite', 'ACCEPT'); expect(f.api.respondInvitation).toHaveBeenCalledTimes(1);
});
it('failed preflight GET never POSTs and is eligible again after a fresh successful GET', async () => {
  const f = fixture(), c = f.controller(); await c.focus();
  f.api.getMyInvitations = async () => { throw Error('preflight offline'); };
  await c.respond('invite', 'ACCEPT'); expect(f.api.respondInvitation).not.toHaveBeenCalled();
  f.api.getMyInvitations = async () => [invitation]; await c.load();
  await c.respond('invite', 'ACCEPT'); expect(f.api.respondInvitation).toHaveBeenCalledTimes(1);
});
it('unsent cleanup persistence failure retains the durable barrier across restart', async () => {
  const f = fixture(), save = f.storage.setItem; let writes = 0;
  f.storage.setItem = async (key, value) => { if (++writes === 2) throw Error('cleanup storage offline'); await save(key, value); };
  const c = f.controller(); await c.focus();
  f.api.getMyInvitations = async () => { throw Error('preflight offline'); };
  await c.respond('invite', 'ACCEPT'); expect(f.api.respondInvitation).not.toHaveBeenCalled();
  const restored = createEntryAttemptJournal(f.storage); await restored.restore();
  expect(restored.blocked(f.auth.getUserId()!, 'invitation', 'invite')).toBe(true);
  f.api.getMyInvitations = async () => [invitation]; await f.controller().focus(); await c.respond('invite', 'ACCEPT');
  expect(f.api.respondInvitation).not.toHaveBeenCalled();
});
it('dispatched DECLINE timeout stays locked after refresh and never uses unsent cleanup', async () => {
  const f = fixture(), c = f.controller(); f.api.respondInvitation.mockRejectedValueOnce(Error('response lost'));
  await c.focus(); await c.respond('invite', 'DECLINE'); await c.load(); await c.respond('invite', 'DECLINE');
  expect(f.api.respondInvitation).toHaveBeenCalledTimes(1);
  const restored = createEntryAttemptJournal(f.storage); await restored.restore();
  expect(restored.blocked(f.auth.getUserId()!, 'invitation', 'invite')).toBe(true);
});
