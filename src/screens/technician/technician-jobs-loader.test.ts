import { createJobsLoader, technicianJobsUserId, type JobsState } from './technician-jobs-loader';
import { UserRole, type UserInfo } from '../../types/auth.types';
import type { OrdersPage, ServiceOrderItem } from '../../api/orders.api';

const order = { id: 'real-order-1', status: 'ACCEPTED' } as ServiceOrderItem;
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
let userSequence = 0;
function setup(pagedJobs = false) {
  let userId: string | null = `technician-${++userSequence}`;
  const listeners = new Set<() => void>();
  const session = {
    getUserId: () => userId,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    change(id: string | null) { userId = id; listeners.forEach(listener => listener()); },
  };
  const enRoute = jest.fn<Promise<unknown>, [string]>().mockResolvedValue({});
  const notify = jest.fn();
  const get = jest.fn<Promise<ServiceOrderItem[]>, []>().mockResolvedValue([]);
  const getOrdersPage = jest.fn<Promise<OrdersPage>, [number, number]>()
    .mockResolvedValue({ data: [], total: 0 });
  const write = jest.fn<void, [JobsState]>();
  const loader = pagedJobs
    ? createJobsLoader(get, write, enRoute, session, notify, { getOrdersPage })
    : createJobsLoader(get, write, enRoute, session, notify);
  const state = () => write.mock.calls[write.mock.calls.length - 1][0];
  return { get, getOrdersPage, write, loader, state, enRoute, session, notify };
}
it('fetches again when an existing Jobs tab regains focus after invitation acceptance', async () => {
  const h = setup();
  await h.loader.focus();
  expect(h.state()).toMatchObject({ jobs: [], loading: false, error: null });
  h.loader.blur();
  h.get.mockResolvedValue([order]);
  await h.loader.focus();
  expect(h.get).toHaveBeenCalledTimes(2);
  expect(h.state().jobs).toEqual([order]);
});
it('supports manual refresh from an empty result and coalesces rapid refresh calls', async () => {
  const h = setup();
  await h.loader.focus();
  const request = deferred<ServiceOrderItem[]>();
  h.get.mockReturnValue(request.promise);
  const first = h.loader.refresh();
  const second = h.loader.refresh();
  expect(h.get).toHaveBeenCalledTimes(2);
  expect(h.state().refreshing).toBe(true);
  request.resolve([order]);
  await Promise.all([first, second]);
  expect(h.state()).toMatchObject({ jobs: [order], refreshing: false });
});
it('distinguishes initial loading, error and successful empty data, with retry', async () => {
  const h = setup();
  h.get.mockRejectedValueOnce(new Error('private transport details'));
  const initial = h.loader.focus();
  expect(h.state().loading).toBe(true);
  await initial;
  expect(h.state()).toMatchObject({ loading: false, jobs: [] });
  expect(h.state().error).toBeTruthy();
  expect(h.state().error).not.toContain('private');
  await h.loader.refresh();
  expect(h.state()).toMatchObject({ jobs: [], error: null, refreshing: false });
});
it('preserves previous good orders on transient refresh failure', async () => {
  const h = setup();
  h.get.mockResolvedValueOnce([order]);
  await h.loader.focus();
  h.get.mockRejectedValueOnce(new Error('offline'));
  await h.loader.refresh();
  expect(h.state()).toMatchObject({ jobs: [order], loading: false, refreshing: false });
  expect(h.state().error).toBeTruthy();
});
it.each(['success', 'error'])('ignores old GET %s after blur and refocus', async outcome => {
  const h = setup();
  const old = deferred<ServiceOrderItem[]>();
  h.get.mockReturnValueOnce(old.promise).mockResolvedValue([order]);
  const first = h.loader.focus();
  h.loader.blur();
  await h.loader.focus();
  h.write.mockClear();
  if (outcome === 'success') old.resolve([]); else old.reject(new Error('stale'));
  await first;
  expect(h.write).not.toHaveBeenCalled();
});
it.each(['success', 'error'])('does not write after blur/unmount on GET %s', async outcome => {
  const h = setup();
  const request = deferred<ServiceOrderItem[]>();
  h.get.mockReturnValue(request.promise);
  const first = h.loader.focus();
  const isCurrent = h.loader.captureFocus();
  h.loader.blur();
  h.write.mockClear();
  if (outcome === 'success') request.resolve([order]); else request.reject(new Error('offline'));
  await first;
  await h.loader.refresh();
  expect(h.write).not.toHaveBeenCalled();
  expect(isCurrent()).toBe(false);
  expect(h.get).toHaveBeenCalledTimes(1);
});
it.each(['success', 'error'])('post-action refresh supersedes old GET %s without stale writes', async outcome => {
  const h = setup();
  await h.loader.focus();
  const old = deferred<ServiceOrderItem[]>();
  const newest = deferred<ServiceOrderItem[]>();
  h.get.mockReturnValueOnce(old.promise).mockReturnValueOnce(newest.promise);
  const first = h.loader.refresh();
  const second = h.loader.refresh(true);
  h.write.mockClear();
  if (outcome === 'success') old.resolve([]); else old.reject(new Error('stale'));
  await first;
  expect(h.write).not.toHaveBeenCalled();
  newest.resolve([order]);
  await second;
  expect(h.state()).toMatchObject({ jobs: [order], refreshing: false, error: null });
});
it('invalidates action callbacks from an earlier focus even after re-entry', async () => {
  const h = setup();
  await h.loader.focus();
  const oldAction = h.loader.captureFocus();
  h.loader.blur();
  await h.loader.focus();
  expect(oldAction()).toBe(false);
  expect(h.loader.captureFocus()()).toBe(true);
});

it.each(['success', 'error'])('newest result remains intact when superseded GET settles later with %s', async outcome => {
  const h = setup();
  await h.loader.focus();
  const old = deferred<ServiceOrderItem[]>();
  h.get.mockReturnValueOnce(old.promise).mockResolvedValue([order]);
  const first = h.loader.refresh();
  await h.loader.refresh(true);
  h.write.mockClear();
  if (outcome === 'success') old.resolve([]); else old.reject(new Error('stale'));
  await first;
  expect(h.write).not.toHaveBeenCalled();
});
it.each([401, 403])('clears private cached orders on explicit access rejection %s', async status => {
  const h = setup();
  h.get.mockResolvedValueOnce([order]);
  await h.loader.focus();
  h.get.mockRejectedValue({ response: { status } });
  await h.loader.refresh();
  expect(h.state().jobs).toEqual([]);
  expect(h.state().error).toContain('quyền');
});

it('production EnRoute handler reloads after mutation succeeds across blur/refocus', async () => {
  const h = setup();
  h.get.mockResolvedValue([order]);
  await h.loader.focus();
  const post = deferred<unknown>();
  h.enRoute.mockReturnValue(post.promise);
  const action = h.loader.handleEnRoute(order.id);
  h.loader.blur();
  await h.loader.focus(); // GET still ACCEPTED before POST has committed.
  expect(h.state().jobs[0].status).toBe('ACCEPTED');
  h.get.mockResolvedValue([{ ...order, status: 'EN_ROUTE' }]);
  post.resolve({});
  await action;
  expect(h.get).toHaveBeenCalledTimes(3);
  expect(h.state().jobs[0].status).toBe('EN_ROUTE');
  expect(h.notify).not.toHaveBeenCalled();
});
it.each([401, 403])('EnRoute %s clears cache and invalidates an outstanding GET', async status => {
  const h = setup();
  h.get.mockResolvedValue([order]);
  await h.loader.focus();
  const get = deferred<ServiceOrderItem[]>();
  h.get.mockReturnValue(get.promise);
  const refresh = h.loader.refresh();
  h.enRoute.mockRejectedValue({ response: { status } });
  await h.loader.handleEnRoute(order.id);
  expect(h.state().jobs).toEqual([]);
  expect(h.state().error).toContain('quyền');
  h.write.mockClear();
  get.resolve([order]);
  await refresh;
  expect(h.write).not.toHaveBeenCalled();
});
it('denies GET and EnRoute without an authenticated technician identity', async () => {
  const h = setup();
  h.session.change(null);
  await h.loader.focus();
  await h.loader.handleEnRoute(order.id);
  await h.loader.refresh();
  expect(h.get).not.toHaveBeenCalled();
  expect(h.enRoute).not.toHaveBeenCalled();
});
it.each([true, false])('old-account mutation completion cannot refresh, clear or notify a new account (success=%s)', async success => {
  const h = setup();
  h.get.mockResolvedValue([order]);
  await h.loader.focus();
  const post = deferred<unknown>();
  h.enRoute.mockReturnValue(post.promise);
  const action = h.loader.handleEnRoute(order.id);
  h.session.change('other-technician');
  expect(h.state().jobs).toEqual([]);
  h.get.mockResolvedValue([{ ...order, id: 'other-account-order' }]);
  await h.loader.focus();
  const calls = h.get.mock.calls.length;
  h.write.mockClear();
  if (success) post.resolve({}); else post.reject({ response: { status: 403 } });
  await action;
  expect(h.get).toHaveBeenCalledTimes(calls);
  expect(h.write).not.toHaveBeenCalled();
  expect(h.notify).not.toHaveBeenCalled();
});
it('does not duplicate EnRoute on rapid taps or ambiguous failure after re-entry', async () => {
  const h = setup();
  h.get.mockResolvedValue([order]);
  await h.loader.focus();
  const post = deferred<unknown>();
  h.enRoute.mockReturnValue(post.promise);
  const first = h.loader.handleEnRoute(order.id);
  const second = h.loader.handleEnRoute(order.id);
  expect(h.enRoute).toHaveBeenCalledTimes(1);
  post.reject(new Error('timeout'));
  await Promise.all([first, second]);
  h.loader.blur();
  await h.loader.focus();
  await h.loader.handleEnRoute(order.id);
  expect(h.enRoute).toHaveBeenCalledTimes(1);
});

it.each([UserRole.CUSTOMER, UserRole.ADMIN, UserRole.SERVICE_MANAGER])('production session selector rejects role %s before any GET/POST', async role => {
  const user = { id: 'user-1', role } as UserInfo;
  const h = setup();
  h.session.change(technicianJobsUserId({ isAuthenticated: true, user }));
  await h.loader.focus();
  await h.loader.handleEnRoute(order.id);
  expect(h.get).not.toHaveBeenCalled();
  expect(h.enRoute).not.toHaveBeenCalled();
  expect(technicianJobsUserId({ isAuthenticated: false, user: { ...user, role: UserRole.TECHNICIAN } })).toBeNull();
  expect(technicianJobsUserId({ isAuthenticated: true, user: { ...user, role: UserRole.TECHNICIAN } })).toBe('user-1');
});
it('mutation finishing while blurred writes nothing; next focus reloads actual status', async () => {
  const h = setup();
  h.get.mockResolvedValue([order]);
  await h.loader.focus();
  const post = deferred<unknown>();
  h.enRoute.mockReturnValue(post.promise);
  const action = h.loader.handleEnRoute(order.id);
  h.loader.blur();
  h.write.mockClear();
  post.resolve({});
  await action;
  expect(h.write).not.toHaveBeenCalled();
  expect(h.notify).not.toHaveBeenCalled();
  expect(h.get).toHaveBeenCalledTimes(1);
  h.get.mockResolvedValue([{ ...order, status: 'EN_ROUTE' }]);
  await h.loader.focus();
  expect(h.state().jobs[0].status).toBe('EN_ROUTE');
});
it('account switch invalidates a GET and hides the previous account cache', async () => {
  const h = setup();
  h.get.mockResolvedValueOnce([order]);
  await h.loader.focus();
  const old = deferred<ServiceOrderItem[]>();
  h.get.mockReturnValueOnce(old.promise);
  const request = h.loader.refresh();
  h.session.change(null);
  expect(h.state().jobs).toEqual([]);
  h.session.change('other-user');
  h.get.mockResolvedValue([]);
  await h.loader.focus();
  h.write.mockClear();
  old.resolve([order]);
  await request;
  expect(h.write).not.toHaveBeenCalled();
});
it('ambiguous EnRoute stays locked in a new controller for the same user', async () => {
  const h = setup();
  h.get.mockResolvedValue([order]);
  await h.loader.focus();
  h.enRoute.mockRejectedValue(new Error('timeout'));
  await h.loader.handleEnRoute(order.id);
  h.loader.blur();
  const next = createJobsLoader(h.get, h.write, h.enRoute, h.session, h.notify);
  await next.focus();
  await next.handleEnRoute(order.id);
  expect(h.enRoute).toHaveBeenCalledTimes(1);
});
it('EnRoute denial after refocus clears newer cached data and supersedes pending GET', async () => {
  const h = setup();
  h.get.mockResolvedValue([order]);
  await h.loader.focus();
  const post = deferred<unknown>();
  h.enRoute.mockReturnValue(post.promise);
  const action = h.loader.handleEnRoute(order.id);
  h.loader.blur();
  await h.loader.focus();
  const get = deferred<ServiceOrderItem[]>();
  h.get.mockReturnValue(get.promise);
  const request = h.loader.refresh();
  post.reject({ response: { status: 403 } });
  await action;
  expect(h.state().jobs).toEqual([]);
  h.write.mockClear();
  get.resolve([order]);
  await request;
  expect(h.write).not.toHaveBeenCalled();
  expect(h.notify).not.toHaveBeenCalled();
});

describe('independent jobs pagination (P3B2b production loader)', () => {
  const job = (id: string, status = 'ACCEPTED'): ServiceOrderItem =>
    ({ id, code: `SO-${id}`, status } as ServiceOrderItem);
  const pageOfJobs = (count: number, prefix = 'job') =>
    Array.from({ length: count }, (_, index) => job(`${prefix}-${index}`));

  it('loads page 1 then appends an actionable page-2 job', async () => {
    const h = setup(true);
    h.getOrdersPage
      .mockResolvedValueOnce({ data: pageOfJobs(20), total: 40 })
      .mockResolvedValue({ data: pageOfJobs(20), total: 40 });
    await h.loader.focus();
    expect(h.getOrdersPage).toHaveBeenCalledWith(1, 20);
    expect(h.state()).toMatchObject({ jobsPage: 1, jobsTotal: 40 });
    h.getOrdersPage.mockResolvedValueOnce({ data: [job('job-target')], total: 40 });
    await h.loader.loadMoreJobs();
    expect(h.getOrdersPage).toHaveBeenLastCalledWith(2, 20);
    expect(h.state().jobs.map((row) => row.id)).toContain('job-target');
    await h.loader.handleEnRoute('job-target');
    expect(h.enRoute).toHaveBeenCalledTimes(1);
    expect(h.enRoute).toHaveBeenCalledWith('job-target');
  });

  it('never posts EnRoute for a historical ACCEPTED row even when invoked directly', async () => {
    const h = setup(true);
    h.getOrdersPage
      .mockResolvedValueOnce({ data: pageOfJobs(5), total: 40 })
      .mockResolvedValue({ data: pageOfJobs(5), total: 40 });
    await h.loader.focus();
    h.getOrdersPage.mockResolvedValueOnce({
      data: [{ ...job('job-old'), historical: true }],
      total: 40,
    });
    await h.loader.loadMoreJobs();
    expect(h.state().jobs.map((row) => row.id)).toContain('job-old');
    await h.loader.handleEnRoute('job-old');
    expect(h.enRoute).not.toHaveBeenCalled();
  });

  it('dedupes repeated job ids and coalesces duplicate load-more taps', async () => {
    const h = setup(true);
    h.getOrdersPage.mockResolvedValue({ data: pageOfJobs(20), total: 40 });
    await h.loader.focus();
    const next = deferred<OrdersPage>();
    h.getOrdersPage.mockReturnValueOnce(next.promise);
    const first = h.loader.loadMoreJobs();
    const second = h.loader.loadMoreJobs();
    expect(h.getOrdersPage).toHaveBeenCalledTimes(2);
    next.resolve({ data: [...pageOfJobs(20), job('job-new')], total: 40 });
    await Promise.all([first, second]);
    const ids = h.state().jobs.map((row) => row.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('job-new');
  });

  it('stops on the terminal jobs page', async () => {
    const h = setup(true);
    h.getOrdersPage.mockResolvedValue({ data: pageOfJobs(20), total: 20 });
    await h.loader.focus();
    h.write.mockClear();
    await h.loader.loadMoreJobs();
    expect(h.getOrdersPage).toHaveBeenCalledTimes(1);
    expect(h.write).not.toHaveBeenCalled();
  });

  it('clamps inconsistent metadata when a page returns zero rows', async () => {
    const h = setup(true);
    h.getOrdersPage.mockResolvedValue({ data: [], total: 50 });
    await h.loader.focus();
    expect(h.state().jobs).toEqual([]);
    h.write.mockClear();
    await h.loader.loadMoreJobs();
    expect(h.getOrdersPage).toHaveBeenCalledTimes(1);
    expect(h.write).not.toHaveBeenCalled();
  });

  it('keeps page-1 jobs on transient page-2 failure and clears the error on retry', async () => {
    const h = setup(true);
    h.getOrdersPage.mockResolvedValue({ data: pageOfJobs(20), total: 40 });
    await h.loader.focus();
    h.getOrdersPage.mockRejectedValueOnce(new Error('offline'));
    await h.loader.loadMoreJobs();
    expect(h.state().jobs).toHaveLength(20);
    expect(h.state().error).toBeTruthy();
    expect(h.state().jobsPage).toBe(1);
    h.getOrdersPage.mockResolvedValue({
      data: Array.from({ length: 5 }, (_, index) => job(`job-p2-${index}`)),
      total: 40,
    });
    await h.loader.loadMoreJobs();
    expect(h.state().jobs).toHaveLength(25);
    expect(h.state().error).toBeNull();
  });

  it.each([401, 403])('purges private jobs on page-2 denial %s', async (status) => {
    const h = setup(true);
    h.getOrdersPage.mockResolvedValue({ data: pageOfJobs(20), total: 40 });
    await h.loader.focus();
    h.getOrdersPage.mockRejectedValue({ response: { status } });
    await h.loader.loadMoreJobs();
    expect(h.state().jobs).toEqual([]);
    expect(h.state().error).toContain('quyền');
  });

  it('discards a stale loadMoreJobs response after blur and refocus', async () => {
    const h = setup(true);
    h.getOrdersPage.mockResolvedValue({ data: pageOfJobs(20), total: 40 });
    await h.loader.focus();
    const pending = deferred<OrdersPage>();
    h.getOrdersPage.mockReturnValueOnce(pending.promise);
    const request = h.loader.loadMoreJobs();
    h.loader.blur();
    await h.loader.focus();
    h.write.mockClear();
    pending.resolve({ data: pageOfJobs(5, 'stale'), total: 40 });
    await request;
    expect(h.write).not.toHaveBeenCalled();
  });

  it('account switch clears paged jobs and invalidates the pending page', async () => {
    const h = setup(true);
    h.getOrdersPage.mockResolvedValue({ data: pageOfJobs(20), total: 40 });
    await h.loader.focus();
    const pending = deferred<OrdersPage>();
    h.getOrdersPage.mockReturnValueOnce(pending.promise);
    const request = h.loader.loadMoreJobs();
    h.session.change(null);
    expect(h.state().jobs).toEqual([]);
    h.session.change('other-technician');
    h.getOrdersPage.mockResolvedValue({ data: [], total: 0 });
    await h.loader.focus();
    h.write.mockClear();
    pending.resolve({ data: pageOfJobs(5, 'stale'), total: 40 });
    await request;
    expect(h.write).not.toHaveBeenCalled();
  });

  it('successful EnRoute refreshes page 1 without a second POST', async () => {
    const h = setup(true);
    h.getOrdersPage.mockResolvedValue({ data: [order], total: 40 });
    await h.loader.focus();
    await h.loader.handleEnRoute(order.id);
    expect(h.enRoute).toHaveBeenCalledTimes(1);
    expect(h.getOrdersPage).toHaveBeenCalledWith(1, 20);
    expect(h.state().jobsPage).toBe(1);
  });
});
