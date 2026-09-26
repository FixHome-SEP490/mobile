import {
  costDecisionTarget,
  createCostDecisionController,
  initialCostDecisionState,
  isCostDecisionBlocked,
  isLaborOnlyItems,
  APPROVE_COST_NOT_PAYMENT_NOTE,
  REJECT_COST_ONLY_WARNING,
  type CostDecisionDeps,
  type CostDecisionState,
} from './customer-additional-cost-decision';
import { createAdditionalCostsController } from './order-additional-costs';

const ORDER_ID = '11111111-1111-4111-8111-111111111111';
const COST_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_COST_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const laborItems = () => [{ itemType: 'labor' }];

const context = (overrides: Record<string, unknown> = {}) => ({
  orderId: ORDER_ID,
  orderStatus: 'UNDER_REPAIR',
  completionRequestedAt: null,
  costId: COST_ID,
  costStatus: 'PENDING_APPROVAL',
  costExpiresAt: new Date(Date.now() + 3600000).toISOString(),
  costItems: laborItems(),
  ...overrides,
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

interface Harness {
  deps: CostDecisionDeps;
  controller: ReturnType<typeof createCostDecisionController>;
  setContext: (ctx: ReturnType<typeof context> | null) => void;
  setCustomerId: (value: string | null) => void;
  setFocused: (value: boolean) => void;
  state: () => CostDecisionState;
}

/** Exercises the actual production controller the customer screen calls. */
function setup(): Harness {
  let ctx: ReturnType<typeof context> | null = context();
  let customerId: string | null = 'customer-1';
  let focused = true;
  const write = jest.fn<void, [CostDecisionState]>();
  const deps: CostDecisionDeps = {
    getContext: () => ctx,
    getCustomerId: () => customerId,
    isFocused: () => focused,
    approveCost: jest.fn().mockResolvedValue({ id: COST_ID, status: 'APPROVED' }),
    rejectCost: jest.fn().mockResolvedValue({ id: COST_ID, status: 'REJECTED' }),
    refreshCosts: jest.fn().mockResolvedValue(undefined),
    onAccessDenied: jest.fn(),
    notify: jest.fn(),
  };
  const controller = createCostDecisionController(deps, write);
  return {
    deps,
    controller,
    setContext: (value) => { ctx = value; },
    setCustomerId: (value) => { customerId = value; },
    setFocused: (value) => { focused = value; },
    state: () => write.mock.calls[write.mock.calls.length - 1][0],
  };
}

const approve = (h: Harness) => h.deps.approveCost as jest.Mock;
const reject = (h: Harness) => h.deps.rejectCost as jest.Mock;
const notified = (h: Harness) => h.deps.notify as jest.Mock;
const refreshed = (h: Harness) => h.deps.refreshCosts as jest.Mock;
const denied = (h: Harness) => h.deps.onAccessDenied as jest.Mock;

it('exposes only the cost decision surface: no pay/quote/revise', () => {
  const { controller } = setup();
  expect(Object.keys(controller).sort()).toEqual(
    ['cancelConfirm', 'markReverified', 'requestConfirm', 'reset', 'submit'].sort(),
  );
});

it('pins the exact owner-approved copy: reject never cancels the order', () => {
  expect(REJECT_COST_ONLY_WARNING).toBe(
    'Từ chối chỉ áp dụng cho yêu cầu chi phí này, đơn dịch vụ vẫn tiếp tục sửa chữa.',
  );
  expect(APPROVE_COST_NOT_PAYMENT_NOTE).toBe('Duyệt chi phí chưa phải thanh toán.');
});

it('makes zero API calls before explicit confirm + submit', async () => {
  const h = setup();
  h.controller.requestConfirm(COST_ID, 'approve');
  expect(approve(h)).not.toHaveBeenCalled();
  expect(reject(h)).not.toHaveBeenCalled();
});

it('approves a labor-only request with the exact cost id and no warranty ids', async () => {
  const h = setup();
  h.controller.requestConfirm(COST_ID, 'approve');
  expect(h.state().confirming).toMatchObject({ costId: COST_ID, kind: 'approve' });
  await h.controller.submit();
  expect(approve(h)).toHaveBeenCalledTimes(1);
  expect(approve(h)).toHaveBeenCalledWith(COST_ID);
  expect(reject(h)).not.toHaveBeenCalled();
  expect(h.state()).toMatchObject({
    decided: { costId: COST_ID, action: 'APPROVED' },
    busy: false,
    confirming: null,
  });
  expect(notified(h).mock.calls[notified(h).mock.calls.length - 1]).toEqual(
    ['Đã duyệt chi phí phát sinh', 'Chi phí đã được duyệt và cộng vào tổng đơn. Đây chưa phải thanh toán.'],
  );
  const copy = notified(h).mock.calls.map((call) => String(call[1])).join(' ');
  expect(copy).not.toMatch(/đã thanh toán|PAID|hủy toàn bộ đơn|CANCELLED/i);
  expect(refreshed(h)).toHaveBeenCalledTimes(1);
});

it('rejects only the cost request and keeps the repair order alive in copy', async () => {
  const h = setup();
  h.controller.requestConfirm(COST_ID, 'reject');
  await h.controller.submit();
  expect(reject(h)).toHaveBeenCalledTimes(1);
  expect(reject(h)).toHaveBeenCalledWith(COST_ID);
  expect(approve(h)).not.toHaveBeenCalled();
  expect(h.state().decided).toMatchObject({ costId: COST_ID, action: 'REJECTED' });
  expect(notified(h).mock.calls[notified(h).mock.calls.length - 1]).toEqual(
    ['Đã từ chối chi phí phát sinh', 'Yêu cầu chi phí đã bị từ chối. Đơn dịch vụ vẫn tiếp tục sửa chữa.'],
  );
  expect(refreshed(h)).toHaveBeenCalledTimes(1);
});

it.each([
  ['parts line fails closed', [{ itemType: 'parts_equipment' }]],
  ['uppercase PARTS fails closed', [{ itemType: 'PARTS' }]],
  ['missing item type fails closed', [{}]],
  ['non-object line fails closed', ['labor']],
  ['empty line set fails closed', []],
])('%s instead of approving blindly', async (_label, items) => {
  const h = setup();
  h.setContext(context({ costItems: items }));
  h.controller.requestConfirm(COST_ID, 'approve');
  await h.controller.submit();
  expect(approve(h)).not.toHaveBeenCalled();
  expect(reject(h)).not.toHaveBeenCalled();
  expect(notified(h).mock.calls[0][0]).toBe('Yêu cầu đã thay đổi');
});

it('blocks an expired request even while Backend still lists it pending', async () => {
  const h = setup();
  h.setContext(context({ costExpiresAt: new Date(Date.now() - 60000).toISOString() }));
  h.controller.requestConfirm(COST_ID, 'approve');
  await h.controller.submit();
  expect(approve(h)).not.toHaveBeenCalled();
  expect(notified(h).mock.calls[0][0]).toBe('Yêu cầu đã thay đổi');
});

it('allows a future expiry timestamp', async () => {
  const h = setup();
  h.setContext(context({ costExpiresAt: new Date(Date.now() + 3600000).toISOString() }));
  h.controller.requestConfirm(COST_ID, 'approve');
  expect(h.state().confirming).not.toBeNull();
});

it.each([
  ['wrong customer (logged out)', { customer: null }],
  ['blurred screen', { focused: false }],
  ['missing context', { ctx: null }],
  ['malformed order id', { ctx: { orderId: 'not-a-uuid' } }],
  ['EN_ROUTE order', { ctx: { orderStatus: 'EN_ROUTE' } }],
  ['completed order', { ctx: { orderStatus: 'COMPLETED' } }],
  ['completion requested', { ctx: { completionRequestedAt: '2030-10-21T12:00:00Z' } }],
  ['already approved cost', { ctx: { costStatus: 'APPROVED' } }],
  ['rejected cost', { ctx: { costStatus: 'REJECTED' } }],
  ['expired status', { ctx: { costStatus: 'EXPIRED' } }],
  ['missing cost id', { ctx: { costId: null } }],
  ['malformed cost id', { ctx: { costId: 'ac-1' } }],
])('blocks confirm/submit for %s without POST', async (_label, scenario) => {
  const h = setup();
  if ('customer' in scenario) h.setCustomerId(scenario.customer as null);
  if ('focused' in scenario) h.setFocused(scenario.focused as boolean);
  if ('ctx' in scenario) {
    const value = scenario.ctx as null | Record<string, unknown>;
    h.setContext(value === null ? null : context(value));
  }
  h.controller.requestConfirm(COST_ID, 'approve');
  await h.controller.submit();
  expect(approve(h)).not.toHaveBeenCalled();
  expect(reject(h)).not.toHaveBeenCalled();
});

it('stays silent without POST when logged out or blurred at confirm', async () => {
  const loggedOut = setup();
  loggedOut.setCustomerId(null);
  loggedOut.controller.requestConfirm(COST_ID, 'approve');
  expect(notified(loggedOut)).not.toHaveBeenCalled();

  const blurred = setup();
  blurred.setFocused(false);
  blurred.controller.requestConfirm(COST_ID, 'reject');
  expect(notified(blurred)).not.toHaveBeenCalled();
});

it('notifies a changed cost instead of posting a stale decision', async () => {
  const h = setup();
  h.controller.requestConfirm(COST_ID, 'approve');
  h.setContext(context({ costId: OTHER_COST_ID }));
  await h.controller.submit();
  expect(approve(h)).not.toHaveBeenCalled();
  expect(notified(h).mock.calls[notified(h).mock.calls.length - 1][0]).toBe('Yêu cầu đã thay đổi');
});

it('throttles duplicate submits to a single POST', async () => {
  const h = setup();
  const gatePromise = deferred<unknown>();
  approve(h).mockReturnValueOnce(gatePromise.promise);
  h.controller.requestConfirm(COST_ID, 'approve');
  const first = h.controller.submit();
  const second = h.controller.submit();
  gatePromise.resolve({ id: COST_ID });
  await Promise.all([first, second]);
  expect(approve(h)).toHaveBeenCalledTimes(1);
});

it('drops a stale approved response after logout without notify or refresh', async () => {
  const h = setup();
  const gatePromise = deferred<unknown>();
  approve(h).mockReturnValueOnce(gatePromise.promise);
  h.controller.requestConfirm(COST_ID, 'approve');
  const attempt = h.controller.submit();
  h.setCustomerId('other-customer');
  gatePromise.resolve({ id: COST_ID });
  await attempt;
  expect(notified(h)).not.toHaveBeenCalled();
  expect(refreshed(h)).not.toHaveBeenCalled();
  expect(h.state().decided).toBeNull();
});

it.each([401, 403])('purges confirmation on %s with re-login copy', async (status) => {
  const h = setup();
  h.controller.requestConfirm(COST_ID, 'reject');
  reject(h).mockRejectedValue({ response: { status } });
  await h.controller.submit();
  expect(denied(h)).toHaveBeenCalledTimes(1);
  expect(h.state()).toMatchObject({ confirming: null, busy: false, decided: null });
  expect(notified(h).mock.calls[notified(h).mock.calls.length - 1][0]).toBe('Phiên đăng nhập đã hết');
});

it.each([409, 422])('shows backend contract status on %s and reloads without locking', async (status) => {
  const h = setup();
  h.controller.requestConfirm(COST_ID, 'approve');
  approve(h).mockRejectedValue({ response: { status } });
  await h.controller.submit();
  expect(approve(h)).toHaveBeenCalledTimes(1);
  expect(h.state().error).toMatch(new RegExp(`mã ${status}`));
  expect(h.state().needsVerify).toBe(false);
  expect(refreshed(h)).toHaveBeenCalledTimes(1);
});

it.each([
  ['timeout with no status', { message: 'timeout' }],
  ['server 500', { response: { status: 500 } }],
  ['offline', new Error('Network request failed')],
])('locks on ambiguous failure %s: no repost until costs GET reloads', async (_label, error) => {
  const h = setup();
  h.controller.requestConfirm(COST_ID, 'reject');
  reject(h).mockRejectedValue(error);
  await h.controller.submit();
  expect(reject(h)).toHaveBeenCalledTimes(1);
  expect(h.state().needsVerify).toBe(true);
  expect(h.state().error).toMatch(/tải lại chi phí phát sinh/);
  expect(refreshed(h)).toHaveBeenCalledTimes(1);
  h.controller.requestConfirm(COST_ID, 'reject');
  await h.controller.submit();
  expect(reject(h)).toHaveBeenCalledTimes(1);
  h.controller.markReverified();
  expect(h.state().needsVerify).toBe(false);
});

it('reset clears confirmation on blur/order change', () => {
  const h = setup();
  h.controller.requestConfirm(COST_ID, 'approve');
  h.controller.reset();
  expect(h.state()).toMatchObject({ confirming: null, decided: null, needsVerify: false, busy: false });
});

describe('costDecisionTarget (production gate)', () => {
  it.each([
    [{ orderStatus: 'under_repair', costStatus: 'pending_approval' }, true],
    [{ orderStatus: 'EN_ROUTE' }, false],
    [{ completionRequestedAt: '2030-10-21T12:00:00Z' }, false],
    [{ costStatus: 'APPROVED' }, false],
    [{ costItems: [{ itemType: 'parts_equipment' }] }, false],
    [{ costItems: [] }, false],
    [{ costExpiresAt: null }, false],
    [{ costExpiresAt: 'not-a-date' }, false],
    [null, false],
  ])('gate %s', (overrides, expected) => {
    const ctx = overrides === null ? null : context(overrides as Record<string, unknown>);
    expect(costDecisionTarget(ctx)?.costId ?? null).toBe(expected ? COST_ID : null);
  });
});

describe('isLaborOnlyItems (production helper)', () => {
  it.each([
    [[{ itemType: 'labor' }], true],
    [[{ itemType: 'LABOR' }], true],
    [[{ itemType: 'labor' }, { itemType: 'labor' }], true],
    [[{ itemType: 'parts_equipment' }], false],
    [[{ itemType: null }], false],
    [[{}], false],
    [[], false],
    [null, false],
    ['items', false],
  ])('items %s', (items, expected) => {
    expect(isLaborOnlyItems(items)).toBe(expected);
  });
});

describe('isCostDecisionBlocked (fail-closed expiry helper)', () => {
  it.each([[null], [undefined], [''], ['not-a-date'], [123]])(
    'blocks unverifiable expiry %s instead of failing open',
    (expiresAt) => {
      expect(isCostDecisionBlocked(expiresAt)).toBe(true);
    },
  );

  it('blocks a past deadline and allows a future one', () => {
    expect(isCostDecisionBlocked(new Date(Date.now() - 1000).toISOString())).toBe(true);
    expect(isCostDecisionBlocked(new Date(Date.now() + 3600000).toISOString())).toBe(false);
  });
});

it('shares the initial state shape', () => {
  expect(initialCostDecisionState).toMatchObject({
    confirming: null,
    busy: false,
    error: null,
    needsVerify: false,
    decided: null,
  });
});

describe('ambiguous-lock freshness path (review blocker remediation)', () => {
  it('screen path unlocks only after a fresh authorized costs success, never on a failed GET', async () => {
    const costRecord = {
      id: COST_ID,
      serviceOrderId: ORDER_ID,
      status: 'PENDING_APPROVAL',
      reason: 'Gia cố mối hàn',
      totalLaborDelta: 120000,
      totalPartsDelta: 0,
      createdAt: '2030-10-21T10:00:00Z',
      expiresAt: null,
      items: [{ id: 'li-1', type: 'labor', description: 'Gia cố', quantity: 1, unitPrice: 120000, lineTotal: 120000 }],
    };
    let readable = true;
    const isReadable = () => readable;
    const getAdditionalCosts = jest.fn().mockResolvedValue([costRecord]);
    const costsWrite = jest.fn();
    const costs = createAdditionalCostsController(getAdditionalCosts, costsWrite);
    await costs.focusCosts(ORDER_ID, isReadable);

    const h = setup();
    h.setContext(context({ costExpiresAt: new Date(Date.now() + 3600000).toISOString() }));
    h.controller.requestConfirm(COST_ID, 'approve');
    approve(h).mockRejectedValue({ message: 'timeout' });
    await h.controller.submit();
    expect(h.state().needsVerify).toBe(true);

    // Fixed onRefresh path, costs GET failing: no unlock, still one POST.
    getAdditionalCosts.mockRejectedValueOnce({ response: { status: 503 } });
    const staleFresh = await costs.refreshCosts(isReadable);
    expect(staleFresh).toBe(false);
    // Screen must NOT call markReverified here.
    h.controller.requestConfirm(COST_ID, 'approve');
    await h.controller.submit();
    expect(approve(h)).toHaveBeenCalledTimes(1);
    expect(h.state().needsVerify).toBe(true);

    // Fixed onRefresh path, fresh authorized success: unlock, deliberate retry allowed.
    getAdditionalCosts.mockResolvedValueOnce([costRecord]);
    const fresh = await costs.refreshCosts(isReadable);
    expect(fresh).toBe(true);
    h.controller.markReverified();
    expect(h.state().needsVerify).toBe(false);
    h.controller.requestConfirm(COST_ID, 'approve');
    approve(h).mockResolvedValue({ id: COST_ID, status: 'APPROVED' });
    await h.controller.submit();
    expect(approve(h)).toHaveBeenCalledTimes(2);
  });
});
