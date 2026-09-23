// Controller unit tests: real production orchestration, mocked transport only.
// Component rendering, device and HTTP E2E are NOT VERIFIED here.
import { createInvitationInbox, isActionable, type InboxState } from './invitation-inbox';
import type { InvitationItem } from '../../api/bookings.api';

const invitation: InvitationItem = {
  id: 'inv-1', bookingId: 'booking-1', priorityOrder: 1, status: 'PENDING',
  invitedAt: '2030-01-01T00:00:00Z', expiresAt: '2030-01-02T00:00:00Z',
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
let accountSequence = 0;
function session(userId: string | null = `technician-${++accountSequence}`) {
  let id = userId;
  const listeners = new Set<() => void>();
  return {
    getUserId: () => id,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    change(next: string | null) { id = next; listeners.forEach(listener => listener()); },
  };
}
function setup(allowed = true, auth = session(allowed ? `technician-${++accountSequence}` : null)) {
  const api = {
    getMyInvitations: jest.fn<Promise<InvitationItem[]>, []>().mockResolvedValue([invitation]),
    respondInvitation: jest.fn<Promise<{ serviceOrder?: { id: string } }>, [string, 'ACCEPT' | 'DECLINE']>().mockResolvedValue({}),
  };
  const write = jest.fn<void, [InboxState]>();
  const notify = jest.fn();
  const controller = createInvitationInbox(api, write, notify, auth);
  const state = () => write.mock.calls[write.mock.calls.length - 1][0];
  return { api, write, notify, controller, state, auth };
}
beforeEach(() => jest.useFakeTimers().setSystemTime(new Date('2030-01-01T12:00:00Z')));
afterEach(() => jest.useRealTimers());

it.each(['ACCEPT', 'DECLINE'] as const)('locks synchronous concurrent %s and opposite action before POST settles', async action => {
  const h = setup();
  await h.controller.focus();
  const post = deferred<{ serviceOrder?: { id: string } }>();
  h.api.respondInvitation.mockReturnValue(post.promise);
  const first = h.controller.respond(invitation.id, action);
  await h.controller.respond(invitation.id, action === 'ACCEPT' ? 'DECLINE' : 'ACCEPT');
  expect(h.api.respondInvitation).toHaveBeenCalledTimes(1);
  expect(h.state().actionInFlight[invitation.id]).toBe(action);
  post.resolve({});
  await first;
});
it.each([undefined, 500, 403, 409])('keeps lock after POST error %s, failed GET, and live PENDING reconciliation', async status => {
  const h = setup();
  await h.controller.focus();
  h.api.respondInvitation.mockRejectedValue({ response: { status, data: { message: 'PRIVATE' } } });
  h.api.getMyInvitations.mockRejectedValueOnce(new Error('offline'));
  await h.controller.respond(invitation.id, 'ACCEPT');
  await h.controller.respond(invitation.id, 'ACCEPT');
  await h.controller.load();
  await h.controller.respond(invitation.id, 'DECLINE');
  expect(h.api.respondInvitation).toHaveBeenCalledTimes(1);
  expect(h.state().actionInFlight[invitation.id]).toBe('ACCEPT');
  expect(JSON.stringify(h.notify.mock.calls)).not.toContain('PRIVATE');
  h.api.getMyInvitations.mockResolvedValue([]);
  await h.controller.load();
  expect(h.state().invitations).toEqual([]);
});
it.each(['success', 'error'])('ignores older GET %s including error/loading writes', async outcome => {
  const h = setup();
  const old = deferred<InvitationItem[]>();
  h.api.getMyInvitations.mockReturnValueOnce(old.promise);
  const initial = h.controller.focus();
  await h.controller.load();
  h.write.mockClear();
  if (outcome === 'success') old.resolve([]); else old.reject(new Error('stale'));
  await initial;
  expect(h.write).not.toHaveBeenCalled();
});
it.each(['success', 'error'])('ignores GET %s after blur/unmount and refocus', async outcome => {
  const h = setup();
  const old = deferred<InvitationItem[]>();
  h.api.getMyInvitations.mockReturnValueOnce(old.promise);
  const initial = h.controller.focus();
  h.controller.blur();
  await h.controller.focus();
  h.write.mockClear();
  if (outcome === 'success') old.resolve([]); else old.reject(new Error('stale'));
  await initial;
  expect(h.write).not.toHaveBeenCalled();
});
it.each([true, false])('suppresses late POST effects after blur (success=%s)', async success => {
  const h = setup();
  await h.controller.focus();
  const post = deferred<{ serviceOrder?: { id: string } }>();
  h.api.respondInvitation.mockReturnValue(post.promise);
  const request = h.controller.respond(invitation.id, 'ACCEPT');
  h.controller.blur();
  h.write.mockClear();
  if (success) post.resolve({ serviceOrder: { id: 'real-order' } }); else post.reject(new Error('offline'));
  await request;
  expect(h.write).not.toHaveBeenCalled();
  expect(h.notify).not.toHaveBeenCalled();
  await h.controller.focus();
  await h.controller.respond(invitation.id, 'ACCEPT');
  expect(h.api.respondInvitation).toHaveBeenCalledTimes(1);
});
it('invalidates GET started before POST so it cannot restore the responded row', async () => {
  const h = setup();
  await h.controller.focus();
  const old = deferred<InvitationItem[]>();
  h.api.getMyInvitations.mockReturnValueOnce(old.promise).mockResolvedValue([]);
  const refresh = h.controller.load();
  await h.controller.respond(invitation.id, 'DECLINE');
  h.write.mockClear();
  old.resolve([invitation]);
  await refresh;
  expect(h.write).not.toHaveBeenCalled();
});
it('fails closed for role, expiry and invitations absent from the current inbox', async () => {
  const denied = setup(false);
  await denied.controller.focus();
  await denied.controller.respond(invitation.id, 'ACCEPT');
  expect(denied.api.getMyInvitations).not.toHaveBeenCalled();
  expect(denied.api.respondInvitation).not.toHaveBeenCalled();
  for (const expiresAt of [null, 'invalid', '2030-01-01T12:00:00Z']) {
    expect(isActionable({ ...invitation, expiresAt })).toBe(false);
  }
  expect(isActionable({ ...invitation, status: 'ACCEPTED' })).toBe(false);
  const h = setup();
  await h.controller.focus();
  await h.controller.respond('missing', 'ACCEPT');
  expect(h.api.respondInvitation).not.toHaveBeenCalled();
});
it('handles GET 403 with a safe message and completes loading', async () => {
  const h = setup();
  h.api.getMyInvitations.mockRejectedValue({ response: { status: 403 } });
  await h.controller.focus();
  expect(h.state()).toMatchObject({ invitations: [], loading: false, refreshing: false });
  expect(h.state().error).toContain('quyền');
});
it.each([{}, { serviceOrder: { id: 'real-order' } }])('reports only a real returned order, with a focus-scoped callback guard', async result => {
  const h = setup();
  await h.controller.focus();
  h.api.respondInvitation.mockResolvedValue(result);
  await h.controller.respond(invitation.id, 'ACCEPT');
  expect(h.notify.mock.calls[0][0].orderId).toBe(result.serviceOrder?.id);
  const isCurrent = h.notify.mock.calls[0][1];
  expect(isCurrent()).toBe(true);
  h.controller.blur();
  await h.controller.focus();
  expect(isCurrent()).toBe(false);
});
it('does not let an old GET clear loading while the newest refresh is pending', async () => {
  const h = setup();
  const old = deferred<InvitationItem[]>();
  const newest = deferred<InvitationItem[]>();
  h.api.getMyInvitations.mockReturnValueOnce(old.promise).mockReturnValueOnce(newest.promise);
  const first = h.controller.focus();
  const second = h.controller.load();
  old.reject(new Error('old failure'));
  await first;
  expect(h.state()).toMatchObject({ refreshing: true, error: null });
  newest.resolve([]);
  await second;
  expect(h.state()).toMatchObject({ refreshing: false, loading: false, invitations: [] });
});
it('locks by invitation ID without blocking a different invitation', async () => {
  const h = setup();
  h.api.getMyInvitations.mockResolvedValue([invitation, { ...invitation, id: 'inv-2' }]);
  await h.controller.focus();
  const post = deferred<{ serviceOrder?: { id: string } }>();
  h.api.respondInvitation.mockReturnValue(post.promise);
  const first = h.controller.respond(invitation.id, 'ACCEPT');
  const second = h.controller.respond('inv-2', 'DECLINE');
  expect(h.api.respondInvitation.mock.calls).toEqual([['inv-1', 'ACCEPT'], ['inv-2', 'DECLINE']]);
  post.resolve({});
  await Promise.all([first, second]);
});
it('an old POST cannot affect a new focus session or its GET', async () => {
  const h = setup();
  await h.controller.focus();
  const post = deferred<{ serviceOrder?: { id: string } }>();
  h.api.respondInvitation.mockReturnValue(post.promise);
  const response = h.controller.respond(invitation.id, 'ACCEPT');
  h.controller.blur();
  await h.controller.focus();
  h.write.mockClear();
  post.resolve({ serviceOrder: { id: 'real-order' } });
  await response;
  expect(h.write).not.toHaveBeenCalled();
  expect(h.notify).not.toHaveBeenCalled();
});

it.each(['ACCEPT', 'DECLINE'] as const)('blocks %s from a second controller while the first POST is deferred', async action => {
  const first = setup();
  await first.controller.focus();
  const post = deferred<{ serviceOrder?: { id: string } }>();
  first.api.respondInvitation.mockReturnValue(post.promise);
  const pending = first.controller.respond(invitation.id, 'ACCEPT');
  first.controller.blur();
  const second = setup(true, first.auth);
  await second.controller.focus();
  expect(second.state().actionInFlight[invitation.id]).toBe('ACCEPT');
  await second.controller.respond(invitation.id, action);
  expect(second.api.respondInvitation).not.toHaveBeenCalled();
  post.reject(new Error('timeout'));
  await pending;
  await second.controller.load();
  await second.controller.respond(invitation.id, action);
  expect(second.api.respondInvitation).not.toHaveBeenCalled();
});
it('keeps an ambiguous lock across timeout, logout, remount and same-account login', async () => {
  const first = setup();
  const user = first.auth.getUserId();
  await first.controller.focus();
  first.api.respondInvitation.mockRejectedValue(new Error('timeout'));
  await first.controller.respond(invitation.id, 'ACCEPT');
  first.auth.change(null);
  expect(first.state().invitations).toEqual([]);
  first.controller.blur();
  first.auth.change(user);
  const second = setup(true, first.auth);
  await second.controller.focus();
  await second.controller.respond(invitation.id, 'DECLINE');
  expect(second.api.respondInvitation).not.toHaveBeenCalled();
});
it('isolates account locks and suppresses old-account GET, POST and notification effects', async () => {
  const first = setup();
  const user = first.auth.getUserId();
  await first.controller.focus();
  const post = deferred<{ serviceOrder?: { id: string } }>();
  const get = deferred<InvitationItem[]>();
  first.api.respondInvitation.mockReturnValue(post.promise);
  const response = first.controller.respond(invitation.id, 'ACCEPT');
  first.api.getMyInvitations.mockReturnValue(get.promise);
  const refresh = first.controller.load();
  first.auth.change(`other-${++accountSequence}`);
  expect(first.state().invitations).toEqual([]);
  const second = setup(true, first.auth);
  await second.controller.focus();
  expect(second.state().actionInFlight).toEqual({});
  second.api.respondInvitation.mockRejectedValue(new Error('timeout'));
  await second.controller.respond(invitation.id, 'DECLINE');
  expect(second.api.respondInvitation).toHaveBeenCalledTimes(1);
  first.write.mockClear();
  get.resolve([invitation]);
  post.resolve({ serviceOrder: { id: 'real-order' } });
  await Promise.all([response, refresh]);
  expect(first.write).not.toHaveBeenCalled();
  expect(first.notify).not.toHaveBeenCalled();
  expect(second.state().actionInFlight[invitation.id]).toBe('DECLINE');
  first.auth.change(user);
  const third = setup(true, first.auth);
  await third.controller.focus();
  expect(third.state().invitations).toEqual([]);
  await third.controller.respond(invitation.id, 'ACCEPT');
  expect(third.api.respondInvitation).not.toHaveBeenCalled();
});
it.each(['ACCEPT', 'DECLINE'] as const)('clears the waiting lock on proven %s result but retains a terminal replay guard', async action => {
  const first = setup();
  await first.controller.focus();
  first.api.respondInvitation.mockResolvedValue(action === 'ACCEPT' ? { serviceOrder: { id: 'real-order' } } : {});
  await first.controller.respond(invitation.id, action);
  const second = setup(true, first.auth);
  await second.controller.focus();
  expect(second.state().invitations).toEqual([]);
  expect(second.state().actionInFlight).toEqual({});
  await second.controller.respond(invitation.id, 'ACCEPT');
  expect(second.api.respondInvitation).not.toHaveBeenCalled();
});
it('does not clear ambiguity from an empty GET, failed GET, or ACCEPT lacking a real order ID', async () => {
  const first = setup();
  await first.controller.focus();
  first.api.respondInvitation.mockResolvedValue({});
  first.api.getMyInvitations.mockResolvedValue([]);
  await first.controller.respond(invitation.id, 'ACCEPT');
  first.controller.blur();
  const second = setup(true, first.auth);
  second.api.getMyInvitations.mockRejectedValueOnce(new Error('offline'));
  await second.controller.focus();
  await second.controller.load();
  expect(second.state().actionInFlight[invitation.id]).toBe('ACCEPT');
  await second.controller.respond(invitation.id, 'DECLINE');
  expect(second.api.respondInvitation).not.toHaveBeenCalled();
});

it('clears old-account previews when account changes while the controller is blurred', async () => {
  const h = setup();
  await h.controller.focus();
  h.controller.blur();
  h.auth.change(`other-${++accountSequence}`);
  const pending = deferred<InvitationItem[]>();
  h.api.getMyInvitations.mockReturnValue(pending.promise);
  const focus = h.controller.focus();
  expect(h.state()).toMatchObject({ invitations: [], actionInFlight: {}, loading: true });
  pending.resolve([]);
  await focus;
});
