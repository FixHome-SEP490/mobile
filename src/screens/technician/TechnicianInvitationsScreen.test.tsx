// Controller unit tests: real production orchestration, mocked transport only.
// Component rendering, device and HTTP E2E are NOT VERIFIED here.
import { createInvitationInbox, isActionable, type InboxState } from './invitation-inbox';
import type { InvitationItem } from '../../api/bookings.api';
import type { OrdersPage, ServiceOrderItem } from '../../api/orders.api';

const BOOKING_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ORDER_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const OTHER_ORDER_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

const invitation: InvitationItem = {
  id: 'inv-1', bookingId: BOOKING_ID, priorityOrder: 1, status: 'PENDING',
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
function makeOrder(
  id: string,
  technicianId: string,
  overrides: Partial<ServiceOrderItem> = {},
): ServiceOrderItem {
  return {
    id,
    code: 'SO-TEST',
    bookingId: BOOKING_ID,
    serviceName: 'Điều hòa',
    status: 'ACCEPTED',
    customerName: 'Customer',
    customerPhone: '',
    addressSummary: '',
    scheduledAt: '2030-01-02T00:00:00Z',
    technician: {
      id: technicianId,
      fullName: 'Technician',
      phoneNumber: '',
      averageRating: 0,
    },
    laborTotal: 0,
    partsTotal: 0,
    grandTotal: 0,
    paymentStatus: 'UNPAID',
    createdAt: '2030-01-01T00:00:00Z',
    ...overrides,
  };
}

function setup(
  allowed = true,
  auth = session(allowed ? 'technician-' + ++accountSequence : null),
) {
  const api = {
    getMyInvitations: jest
      .fn<Promise<InvitationItem[]>, []>()
      .mockResolvedValue([invitation]),
    respondInvitation: jest
      .fn<
        Promise<{ serviceOrder?: { id: string } }>,
        [string, 'ACCEPT' | 'DECLINE']
      >()
      .mockResolvedValue({}),
  };
  const orders = {
    getMyOrdersPage: jest
      .fn<Promise<OrdersPage>, [number?, number?]>()
      .mockResolvedValue({ data: [], total: 0 }),
    getOrder: jest
      .fn<Promise<ServiceOrderItem>, [string]>()
      .mockImplementation(async (id) =>
        makeOrder(id, auth.getUserId() ?? 'logged-out'),
      ),
  };
  const write = jest.fn<void, [InboxState]>();
  const notify = jest.fn();
  const controller = createInvitationInbox(api, orders, write, notify, auth);
  const state = () => write.mock.calls[write.mock.calls.length - 1][0];
  return { api, orders, write, notify, controller, state, auth };
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
it.each([undefined, 500])(
  'keeps lock after ambiguous POST error %s, failed GET, and live PENDING reconciliation',
  async status => {
    const h = setup();
    await h.controller.focus();
    h.api.respondInvitation.mockRejectedValue({
      response: { status, data: { message: 'PRIVATE' } },
    });
    h.api.getMyInvitations.mockRejectedValueOnce(new Error('offline'));
    await h.controller.respond(invitation.id, 'ACCEPT');
    await h.controller.respond(invitation.id, 'ACCEPT');
    await h.controller.load();
    await h.controller.respond(invitation.id, 'DECLINE');
    expect(h.api.respondInvitation).toHaveBeenCalledTimes(1);
    expect(h.state().actionInFlight[invitation.id]).toBe('ACCEPT');
    expect(h.state().recoveryPending).toBe(true);
    expect(JSON.stringify(h.notify.mock.calls)).not.toContain('PRIVATE');
    h.api.getMyInvitations.mockResolvedValue([]);
    await h.controller.load();
    expect(h.state().invitations).toEqual([]);
    expect(h.state().recoveryPending).toBe(true);
  },
);

it.each([400, 401, 403, 404, 409, 422])(
  'treats server rejection %s as terminal and never exposes an accepted order',
  async status => {
    const h = setup();
    await h.controller.focus();
    h.api.respondInvitation.mockRejectedValue({ response: { status } });
    await h.controller.respond(invitation.id, 'ACCEPT');
    expect(h.api.respondInvitation).toHaveBeenCalledTimes(1);
    expect(h.state().acceptedOrderId).toBeNull();
    expect(h.state().actionInFlight).toEqual({});
    expect(h.state().recoveryPending).toBe(false);
    await h.controller.respond(invitation.id, 'ACCEPT');
    expect(h.api.respondInvitation).toHaveBeenCalledTimes(1);
  },
);
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
  if (success) post.resolve({ serviceOrder: { id: ORDER_ID } }); else post.reject(new Error('offline'));
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
it.each([{}, { serviceOrder: { id: ORDER_ID } }])(
  'reports only a GET-verified current order, with a focus-scoped callback guard',
  async result => {
    const h = setup();
    await h.controller.focus();
    h.api.respondInvitation.mockResolvedValue(result);
    await h.controller.respond(invitation.id, 'ACCEPT');
    const orderNotice = h.notify.mock.calls.find(
      ([notice]) => notice.orderId === ORDER_ID,
    );
    expect(orderNotice?.[0].orderId).toBe(result.serviceOrder?.id);
    if (result.serviceOrder?.id) {
      expect(h.orders.getOrder).toHaveBeenCalledWith(ORDER_ID);
      expect(h.state().acceptedOrderId).toBe(ORDER_ID);
      const isCurrent = orderNotice?.[1];
      expect(isCurrent()).toBe(true);
      h.controller.blur();
      await h.controller.focus();
      expect(isCurrent()).toBe(false);
    } else {
      expect(h.state().acceptedOrderId).toBeNull();
      expect(h.state().recoveryPending).toBe(true);
    }
  },
);
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
  post.resolve({ serviceOrder: { id: ORDER_ID } });
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
  post.resolve({ serviceOrder: { id: ORDER_ID } });
  await Promise.all([response, refresh]);
  expect(first.write).not.toHaveBeenCalled();
  expect(first.notify).not.toHaveBeenCalled();
  expect(second.state().actionInFlight[invitation.id]).toBe('DECLINE');
  first.auth.change(user);
  const third = setup(true, first.auth);
  await third.controller.focus();
  expect(third.state().invitations.map((item) => item.id)).toEqual([invitation.id]);
  expect(third.state().actionInFlight[invitation.id]).toBe('ACCEPT');
  await third.controller.respond(invitation.id, 'ACCEPT');
  expect(third.api.respondInvitation).not.toHaveBeenCalled();
});
it.each(['ACCEPT', 'DECLINE'] as const)('clears the waiting lock on proven %s result but retains a terminal replay guard', async action => {
  const first = setup();
  await first.controller.focus();
  first.api.respondInvitation.mockResolvedValue(action === 'ACCEPT' ? { serviceOrder: { id: ORDER_ID } } : {});
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

it('recovers lost ACCEPT ACK from paginated own Jobs and verifies exact active assignment', async () => {
  const h = setup();
  const owner = h.auth.getUserId()!;
  await h.controller.focus();

  h.api.respondInvitation.mockRejectedValue(new Error('timeout'));
  h.orders.getMyOrdersPage
    .mockResolvedValueOnce({
      data: [makeOrder(OTHER_ORDER_ID, owner, { bookingId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' })],
      total: 2,
    })
    .mockResolvedValueOnce({
      data: [makeOrder(ORDER_ID, owner)],
      total: 2,
    });
  h.orders.getOrder.mockResolvedValue(makeOrder(ORDER_ID, owner));

  await h.controller.respond(invitation.id, 'ACCEPT');

  expect(h.api.respondInvitation).toHaveBeenCalledTimes(1);
  expect(h.orders.getMyOrdersPage.mock.calls).toEqual([
    [1, 100],
    [2, 100],
  ]);
  expect(h.orders.getOrder).toHaveBeenCalledWith(ORDER_ID);
  expect(h.state().acceptedOrderId).toBe(ORDER_ID);
  expect(h.state().recoveryPending).toBe(false);

  await h.controller.respond(invitation.id, 'ACCEPT');
  expect(h.api.respondInvitation).toHaveBeenCalledTimes(1);
});

it('does not treat disappearing inbox item or incomplete Jobs scan as proof of ACCEPT', async () => {
  const h = setup();
  await h.controller.focus();
  h.api.respondInvitation.mockRejectedValue(new Error('timeout'));
  h.api.getMyInvitations.mockResolvedValue([]);
  h.orders.getMyOrdersPage.mockResolvedValue({ data: [], total: 0 });

  await h.controller.respond(invitation.id, 'ACCEPT');

  expect(h.state().acceptedOrderId).toBeNull();
  expect(h.state().recoveryPending).toBe(true);
  await h.controller.respond(invitation.id, 'DECLINE');
  expect(h.api.respondInvitation).toHaveBeenCalledTimes(1);
});

it('rejects wrong-booking, historical, or other-technician detail as accepted CTA proof', async () => {
  const h = setup();
  const owner = h.auth.getUserId()!;
  await h.controller.focus();

  h.api.respondInvitation.mockResolvedValue({
    serviceOrder: { id: ORDER_ID },
  });
  h.orders.getOrder.mockResolvedValue(
    makeOrder(ORDER_ID, owner, {
      bookingId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    }),
  );
  await h.controller.respond(invitation.id, 'ACCEPT');
  expect(h.state().acceptedOrderId).toBeNull();

  const h2 = setup();
  const owner2 = h2.auth.getUserId()!;
  await h2.controller.focus();
  h2.api.respondInvitation.mockResolvedValue({
    serviceOrder: { id: ORDER_ID },
  });
  h2.orders.getOrder.mockResolvedValue(
    makeOrder(ORDER_ID, owner2, { historical: true }),
  );
  await h2.controller.respond(invitation.id, 'ACCEPT');
  expect(h2.state().acceptedOrderId).toBeNull();

  const h3 = setup();
  await h3.controller.focus();
  h3.api.respondInvitation.mockResolvedValue({
    serviceOrder: { id: ORDER_ID },
  });
  h3.orders.getOrder.mockResolvedValue(
    makeOrder(ORDER_ID, 'different-technician'),
  );
  await h3.controller.respond(invitation.id, 'ACCEPT');
  expect(h3.state().acceptedOrderId).toBeNull();
});

it('ignores stale order reconciliation after account switch', async () => {
  const h = setup();
  const owner = h.auth.getUserId()!;
  await h.controller.focus();
  const page = deferred<OrdersPage>();
  h.api.respondInvitation.mockRejectedValue(new Error('timeout'));
  h.orders.getMyOrdersPage.mockReturnValue(page.promise);

  const request = h.controller.respond(invitation.id, 'ACCEPT');
  h.auth.change('other-' + ++accountSequence);
  h.write.mockClear();
  h.notify.mockClear();

  page.resolve({ data: [makeOrder(ORDER_ID, owner)], total: 1 });
  await request;

  expect(h.write).not.toHaveBeenCalled();
  expect(h.notify).not.toHaveBeenCalled();
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
