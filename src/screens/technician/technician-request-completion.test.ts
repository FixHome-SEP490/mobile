import {
  createRequestCompletionController,
  describeCompletionBlockers,
  initialRequestCompletionState,
  requestCompletionTarget,
  REQUEST_COMPLETION_CONFIRM_COPY,
  type RequestCompletionDeps,
  type RequestCompletionState,
} from './technician-request-completion';

const ORDER_ID = '11111111-1111-4111-8111-111111111111';

const gate = (overrides: Record<string, unknown> = {}) => ({
  id: ORDER_ID,
  status: 'UNDER_REPAIR',
  completionRequestedAt: null,
  historical: false,
  afterEvidenceCount: 2,
  pricingMode: 'inspection_required',
  quotationStatus: 'APPROVED',
  hasPendingCosts: false,
  ...overrides,
});

const fixedGate = (overrides: Record<string, unknown> = {}) => gate({
  pricingMode: 'fixed_price',
  quotationStatus: null,
  ...overrides,
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

interface Harness {
  deps: RequestCompletionDeps;
  controller: ReturnType<typeof createRequestCompletionController>;
  setOrder: (order: ReturnType<typeof gate> | null) => void;
  setTechnicianId: (value: string | null) => void;
  setFocused: (value: boolean) => void;
  setDevBuild: (value: boolean) => void;
  removeDevBuild: () => void;
  state: () => RequestCompletionState;
}

/** Exercises the actual production controller the detail screen calls. */
function setup(orderOverrides: Record<string, unknown> = {}): Harness {
  let order: ReturnType<typeof gate> | null = gate(orderOverrides);
  let technicianId: string | null = 'tech-1';
  let focused = true;
  let devBuild = true;
  const write = jest.fn<void, [RequestCompletionState]>();
  const deps: RequestCompletionDeps = {
    getOrder: () => order,
    getTechnicianId: () => technicianId,
    isFocused: () => focused,
    isDevBuild: () => devBuild,
    requestCompletion: jest.fn().mockResolvedValue({ id: ORDER_ID }),
    refreshDetail: jest.fn().mockResolvedValue(undefined),
    onAccessDenied: jest.fn(),
    notify: jest.fn(),
  };
  const controller = createRequestCompletionController(deps, write);
  return {
    deps,
    controller,
    setOrder: (value) => { order = value; },
    setTechnicianId: (value) => { technicianId = value; },
    setFocused: (value) => { focused = value; },
    setDevBuild: (value) => { devBuild = value; },
    removeDevBuild: () => { delete (deps as Partial<RequestCompletionDeps>).isDevBuild; },
    state: () => write.mock.calls[write.mock.calls.length - 1][0],
  };
}

const post = (h: Harness) => h.deps.requestCompletion as jest.Mock;
const notified = (h: Harness) => h.deps.notify as jest.Mock;
const refreshed = (h: Harness) => h.deps.refreshDetail as jest.Mock;
const denied = (h: Harness) => h.deps.onAccessDenied as jest.Mock;

it('exposes only the request-completion surface: no complete/pay/approve', () => {
  const { controller } = setup();
  expect(Object.keys(controller).sort()).toEqual(
    ['cancelConfirm', 'markReverified', 'requestConfirm', 'reset', 'submit'].sort(),
  );
});

it('pins the exact two-tap confirmation copy (UNPAID invoice, not COMPLETED)', () => {
  expect(REQUEST_COMPLETION_CONFIRM_COPY).toContain('UNPAID');
  expect(REQUEST_COMPLETION_CONFIRM_COPY).not.toMatch(/đã thanh toán|\bPAID\b|\bCOMPLETED\b|đã hoàn thành đơn/i);
});

it('posts nothing before an explicit confirm + submit', async () => {
  const h = setup();
  await h.controller.submit();
  expect(post(h)).not.toHaveBeenCalled();
  h.controller.requestConfirm();
  expect(post(h)).not.toHaveBeenCalled();
});

it('requests completion once and shows waiting-for-customer state', async () => {
  const h = setup();
  h.controller.requestConfirm();
  expect(h.state()).toMatchObject({ confirming: true });
  await h.controller.submit();
  expect(post(h)).toHaveBeenCalledTimes(1);
  expect(post(h)).toHaveBeenCalledWith(ORDER_ID);
  expect(h.state()).toMatchObject({ requested: true, busy: false, confirming: false, error: null });
  expect(notified(h).mock.calls[notified(h).mock.calls.length - 1]).toEqual(
    ['Đã gửi yêu cầu hoàn thành', 'Đã yêu cầu hoàn thành, chờ khách nghiệm thu và thanh toán.'],
  );
  const copy = notified(h).mock.calls.map((call) => String(call[1])).join(' ');
  expect(copy).not.toMatch(/đã thanh toán|\bPAID\b|\bCOMPLETED\b|đánh dấu hoàn thành/i);
  expect(refreshed(h)).toHaveBeenCalledTimes(1);
});

it('accepts fixed_price with AFTER photos and no quote', async () => {
  const h = setup();
  h.setOrder(fixedGate());
  h.controller.requestConfirm();
  expect(h.state().confirming).toBe(true);
  await h.controller.submit();
  expect(post(h)).toHaveBeenCalledWith(ORDER_ID);
});

it.each([
  ['wrong technician (logged out)', { tech: null }],
  ['blurred screen', { focused: false }],
  ['missing order', { order: null }],
  ['malformed order id', { order: { id: 'not-a-uuid' } }],
  ['historical summary', { order: { historical: true } }],
  ['EN_ROUTE order', { order: { status: 'EN_ROUTE' } }],
  ['already requested', { order: { completionRequestedAt: '2030-10-21T12:00:00Z' } }],
  ['no AFTER photos', { order: { afterEvidenceCount: 0 } }],
  ['missing AFTER count', { order: { afterEvidenceCount: null } }],
  ['pending additional costs', { order: { hasPendingCosts: true } }],
  ['pending SENT quote', { order: { quotationStatus: 'SENT' } }],
  ['inspection without approved quote', { order: { quotationStatus: null } }],
  ['inspection with rejected quote', { order: { quotationStatus: 'REJECTED' } }],
  ['unknown pricing mode', { order: { pricingMode: 'other', quotationStatus: null } }],
])('blocks submit for %s without POST', async (_label, scenario) => {
  const h = setup();
  if ('tech' in scenario) h.setTechnicianId(scenario.tech as null);
  if ('focused' in scenario) h.setFocused(scenario.focused as boolean);
  if ('order' in scenario) {
    const value = scenario.order as null | Record<string, unknown>;
    h.setOrder(value === null ? null : gate(value));
  }
  h.controller.requestConfirm();
  await h.controller.submit();
  expect(post(h)).not.toHaveBeenCalled();
});

it('stays silent without POST when logged out or blurred at confirm', async () => {
  const loggedOut = setup();
  loggedOut.setTechnicianId(null);
  loggedOut.controller.requestConfirm();
  expect(notified(loggedOut)).not.toHaveBeenCalled();

  const blurred = setup();
  blurred.setFocused(false);
  blurred.controller.requestConfirm();
  expect(notified(blurred)).not.toHaveBeenCalled();
});

it('notifies a changed order instead of posting a stale request', async () => {
  const h = setup();
  h.controller.requestConfirm();
  h.setOrder(gate({ status: 'COMPLETED', completionRequestedAt: '2030-10-21T12:00:00Z' }));
  await h.controller.submit();
  expect(post(h)).not.toHaveBeenCalled();
  expect(notified(h).mock.calls[notified(h).mock.calls.length - 1][0]).toBe('Chưa thể yêu cầu hoàn thành');
});

it('throttles duplicate submits to a single POST', async () => {
  const h = setup();
  const gatePromise = deferred<unknown>();
  post(h).mockReturnValueOnce(gatePromise.promise);
  h.controller.requestConfirm();
  const first = h.controller.submit();
  const second = h.controller.submit();
  gatePromise.resolve({ id: ORDER_ID });
  await Promise.all([first, second]);
  expect(post(h)).toHaveBeenCalledTimes(1);
});

it('drops a stale success response after logout without notify or refresh', async () => {
  const h = setup();
  const gatePromise = deferred<unknown>();
  post(h).mockReturnValueOnce(gatePromise.promise);
  h.controller.requestConfirm();
  const attempt = h.controller.submit();
  h.setTechnicianId(null);
  gatePromise.resolve({ id: ORDER_ID });
  await attempt;
  expect(notified(h)).not.toHaveBeenCalled();
  expect(refreshed(h)).not.toHaveBeenCalled();
  expect(h.state().requested).toBe(false);
});

it.each([401, 403])('purges and resets on %s with re-login copy', async (status) => {
  const h = setup();
  h.controller.requestConfirm();
  post(h).mockRejectedValue({ response: { status } });
  await h.controller.submit();
  expect(denied(h)).toHaveBeenCalledTimes(1);
  expect(h.state()).toMatchObject({ confirming: false, busy: false, requested: false });
  expect(notified(h).mock.calls[notified(h).mock.calls.length - 1][0]).toBe('Phiên đăng nhập đã hết');
});

it.each([409, 422])('shows truthful Backend rejection on %s and reloads without locking', async (status) => {
  const h = setup();
  h.controller.requestConfirm();
  post(h).mockRejectedValue({ response: { status } });
  await h.controller.submit();
  expect(post(h)).toHaveBeenCalledTimes(1);
  expect(h.state().error).toMatch(new RegExp(`mã ${status}`));
  expect(h.state().needsVerify).toBe(false);
  expect(refreshed(h)).toHaveBeenCalledTimes(1);
});

it.each([
  ['timeout with no status', { message: 'timeout' }],
  ['server 500', { response: { status: 500 } }],
  ['offline', new Error('Network request failed')],
])('locks on ambiguous failure %s: no repost until the detail reloads', async (_label, error) => {
  const h = setup();
  h.controller.requestConfirm();
  post(h).mockRejectedValue(error);
  await h.controller.submit();
  expect(post(h)).toHaveBeenCalledTimes(1);
  expect(h.state().needsVerify).toBe(true);
  expect(h.state().error).toMatch(/tải lại chi tiết đơn/);
  expect(refreshed(h)).toHaveBeenCalledTimes(1);
  h.controller.requestConfirm();
  await h.controller.submit();
  expect(post(h)).toHaveBeenCalledTimes(1);
  h.controller.markReverified();
  expect(h.state().needsVerify).toBe(false);
});

it('fresh completion already requested prevents replay pre-commit', async () => {
  const h = setup();
  h.controller.requestConfirm();
  post(h).mockRejectedValue({ message: 'timeout' });
  await h.controller.submit();
  expect(h.state().needsVerify).toBe(true);
  // The ambiguous POST actually registered server-side: re-gating against a
  // freshly fetched order with completionRequestedAt blocks any replay.
  h.setOrder(gate({ completionRequestedAt: '2030-10-21T12:00:00Z' }));
  h.controller.markReverified();
  h.controller.requestConfirm();
  await h.controller.submit();
  expect(post(h)).toHaveBeenCalledTimes(1);
});

it('reset clears confirmation on blur/order change', () => {
  const h = setup();
  h.controller.requestConfirm();
  h.controller.reset();
  expect(h.state()).toMatchObject({ confirming: false, requested: false, needsVerify: false, busy: false });
});

describe('requestCompletionTarget (production gate)', () => {
  it.each([
    [{ pricingMode: 'Inspection_Required', quotationStatus: 'approved' }, true],
    [{ pricingMode: 'FIXED_PRICE', fixedUnitPrice: 0, quotationStatus: null }, true],
    [{ status: 'EN_ROUTE' }, false],
    [{ completionRequestedAt: '2030-10-21T12:00:00Z' }, false],
    [{ afterEvidenceCount: 0 }, false],
    [{ afterEvidenceCount: NaN }, false],
    [{ hasPendingCosts: true }, false],
    [{ quotationStatus: 'SENT' }, false],
    [{ pricingMode: 'inspection_required', quotationStatus: null }, false],
    [{ historical: true }, false],
    [null, false],
  ])('gate %s', (overrides, expected) => {
    const order = overrides === null ? null : gate(overrides as Record<string, unknown>);
    const target = requestCompletionTarget(order);
    expect(target?.orderId ?? null).toBe(expected ? ORDER_ID : null);
  });
});

describe('describeCompletionBlockers (eligibility indicator)', () => {
  it('returns empty for a fully eligible order', () => {
    expect(describeCompletionBlockers(gate())).toEqual([]);
    expect(describeCompletionBlockers(fixedGate())).toEqual([]);
  });

  it('lists each unmet preliminary condition honestly', () => {
    expect(describeCompletionBlockers(gate({ status: 'EN_ROUTE' }))).toContain('Đơn chưa ở trạng thái đang sửa chữa.');
    expect(describeCompletionBlockers(gate({ completionRequestedAt: '2030-10-21T12:00:00Z' }))).toContain('Đơn đã được yêu cầu hoàn thành.');
    expect(describeCompletionBlockers(gate({ afterEvidenceCount: 0 }))).toContain(
      'Cần ảnh sau sửa chữa, số lượng yêu cầu do hệ thống kiểm tra.',
    );
    expect(describeCompletionBlockers(gate({ hasPendingCosts: true }))).toContain('Còn yêu cầu chi phí chờ duyệt.');
    expect(describeCompletionBlockers(gate({ quotationStatus: 'SENT' }))).toContain('Còn báo giá chờ khách duyệt.');
    expect(describeCompletionBlockers(null)).toEqual([]);
  });
});

it('shares the initial state shape', () => {
  expect(initialRequestCompletionState).toMatchObject({
    confirming: false,
    busy: false,
    error: null,
    needsVerify: false,
    requested: false,
  });
});

describe('dev-release gate (review P1 remediation)', () => {
  it('RED: rejects confirmation and submit when the build is not dev', async () => {
    const h = setup();
    h.setDevBuild(false);
    h.controller.requestConfirm();
    await h.controller.submit();
    expect(post(h)).not.toHaveBeenCalled();
  });

  it('RED: drops a stale dev-time confirmation when the flag flips false', async () => {
    const h = setup();
    h.controller.requestConfirm();
    expect(h.state().confirming).toBe(true);
    h.setDevBuild(false);
    await h.controller.submit();
    expect(post(h)).not.toHaveBeenCalled();
    expect(h.state().confirming).toBe(false);
  });

  it('RED: fails closed when the dev predicate is omitted', async () => {
    const h = setup();
    h.removeDevBuild();
    h.controller.requestConfirm();
    await h.controller.submit();
    expect(post(h)).not.toHaveBeenCalled();
  });
});
