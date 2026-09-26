import {
  createQuotationDecisionController,
  decisionMoneyText,
  eligibleWarrantyOptions,
  initialDecisionState,
  APPROVE_NOT_PAYMENT_NOTE,
  REJECT_WHOLE_ORDER_WARNING,
  type QuotationDecisionDeps,
  type DecisionState,
} from './customer-quotation-decision';
import { createOrderDetailLoader, writeDetailWithMirror } from './customer-order-detail';
import type { ServiceOrderItem } from '../../api/orders.api';

const ORDER_ID = '11111111-1111-4111-8111-111111111111';
const QUOTE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PART_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PART_ID_2 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const paidPart = (overrides: Record<string, unknown> = {}) => ({
  id: PART_ID,
  type: 'PARTS',
  description: 'Tụ 450V chính hãng',
  quantity: 2,
  unitPrice: 25000,
  lineTotal: 50000,
  partSource: 'technician',
  partWarrantyOption: 'paid_warranty',
  warrantyFee: 20000,
  warrantyTermDays: 90,
  ...overrides,
});

const laborLine = () => ({
  id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  type: 'LABOR',
  description: 'Thay tụ nguồn',
  quantity: 1,
  unitPrice: 180000,
  lineTotal: 180000,
});

const context = (overrides: Record<string, unknown> = {}) => ({
  orderId: ORDER_ID,
  orderStatus: 'EN_ROUTE',
  quoteId: QUOTE_ID,
  quoteStatus: 'SENT',
  items: [laborLine(), paidPart()],
  ...overrides,
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

interface Harness {
  deps: QuotationDecisionDeps;
  controller: ReturnType<typeof createQuotationDecisionController>;
  setContext: (ctx: ReturnType<typeof context> | null) => void;
  setCustomerId: (value: string | null) => void;
  setFocused: (value: boolean) => void;
  state: () => DecisionState;
}

/** Exercises the actual production controller the customer screen calls. */
function setup(): Harness {
  let ctx: ReturnType<typeof context> | null = context();
  let customerId: string | null = 'customer-1';
  let focused = true;
  const write = jest.fn<void, [DecisionState]>();
  const deps: QuotationDecisionDeps = {
    getContext: () => ctx,
    getCustomerId: () => customerId,
    isFocused: () => focused,
    approveQuotation: jest.fn().mockResolvedValue({ id: QUOTE_ID, status: 'APPROVED' }),
    rejectQuotation: jest.fn().mockResolvedValue({ id: QUOTE_ID, status: 'REJECTED' }),
    refreshDetail: jest.fn().mockResolvedValue(undefined),
    onAccessDenied: jest.fn(),
    notify: jest.fn(),
  };
  const controller = createQuotationDecisionController(deps, write);
  return {
    deps,
    controller,
    setContext: (value) => { ctx = value; },
    setCustomerId: (value) => { customerId = value; },
    setFocused: (value) => { focused = value; },
    state: () => write.mock.calls[write.mock.calls.length - 1][0],
  };
}

const approve = (h: Harness) => h.deps.approveQuotation as jest.Mock;
const reject = (h: Harness) => h.deps.rejectQuotation as jest.Mock;
const notified = (h: Harness) => h.deps.notify as jest.Mock;
const refreshed = (h: Harness) => h.deps.refreshDetail as jest.Mock;
const denied = (h: Harness) => h.deps.onAccessDenied as jest.Mock;

it('exposes only the decision surface: no pay/invoice/quote-create', () => {
  const { controller } = setup();
  expect(Object.keys(controller).sort()).toEqual(
    ['cancelConfirm', 'markReverified', 'requestConfirm', 'reset', 'submit', 'toggleWarranty'].sort(),
  );
});

it('pins the exact owner-approved whole-order-close warning copy', () => {
  expect(REJECT_WHOLE_ORDER_WARNING).toBe(
    'Từ chối báo giá sẽ hủy toàn bộ đơn dịch vụ, không chỉ báo giá',
  );
  expect(APPROVE_NOT_PAYMENT_NOTE).toBe('Duyệt báo giá chưa phải thanh toán.');
});

it('makes zero API calls before explicit confirm + submit', async () => {
  const h = setup();
  h.controller.toggleWarranty(PART_ID);
  h.controller.requestConfirm('approve');
  expect(approve(h)).not.toHaveBeenCalled();
  expect(reject(h)).not.toHaveBeenCalled();
});

it('approves with default-OFF empty warranty ids when nothing is toggled', async () => {
  const h = setup();
  h.controller.requestConfirm('approve');
  expect(h.state().confirming).toBe('approve');
  await h.controller.submit();
  expect(approve(h)).toHaveBeenCalledTimes(1);
  expect(approve(h)).toHaveBeenCalledWith(QUOTE_ID, []);
  expect(reject(h)).not.toHaveBeenCalled();
  expect(h.state()).toMatchObject({ decided: 'APPROVED', busy: false, confirming: null, selectedIds: [] });
  expect(notified(h).mock.calls[notified(h).mock.calls.length - 1]).toEqual(
    ['Đã duyệt báo giá', 'Đã ghi nhận duyệt báo giá. Đây chưa phải thanh toán.'],
  );
  expect(refreshed(h)).toHaveBeenCalledTimes(1);
});

it('sends only toggled eligible paid-warranty UUIDs on approve', async () => {
  const h = setup();
  h.setContext(context({ items: [laborLine(), paidPart(), paidPart({ id: PART_ID_2, warrantyFee: 30000 })] }));
  h.controller.toggleWarranty(PART_ID);
  h.controller.toggleWarranty(PART_ID_2);
  h.controller.toggleWarranty(PART_ID_2);
  expect(h.state().selectedIds).toEqual([PART_ID]);
  h.controller.requestConfirm('approve');
  await h.controller.submit();
  expect(approve(h)).toHaveBeenCalledWith(QUOTE_ID, [PART_ID]);
});

it('rejects with the existing reject client and whole-order copy, no warranty ids', async () => {
  const h = setup();
  h.controller.toggleWarranty(PART_ID);
  h.controller.requestConfirm('reject');
  expect(h.state().confirming).toBe('reject');
  await h.controller.submit();
  expect(reject(h)).toHaveBeenCalledTimes(1);
  expect(reject(h)).toHaveBeenCalledWith(QUOTE_ID);
  expect(approve(h)).not.toHaveBeenCalled();
  expect(h.state().decided).toBe('REJECTED');
  expect(notified(h).mock.calls[notified(h).mock.calls.length - 1][0]).toBe('Đã từ chối báo giá');
  expect(refreshed(h)).toHaveBeenCalledTimes(1);
});

it.each([
  ['wrong customer role (logged out)', { customer: null }, true],
  ['blurred screen', { focused: false }, true],
  ['missing context', { ctx: null }, false],
  ['malformed order id', { ctx: { orderId: 'not-a-uuid' } }, false],
  ['accepted order', { ctx: { orderStatus: 'ACCEPTED' } }, false],
  ['completed order', { ctx: { orderStatus: 'COMPLETED' } }, false],
  ['non-SENT quote', { ctx: { quoteStatus: 'APPROVED' } }, false],
  ['missing quote id', { ctx: { quoteId: null } }, false],
  ['malformed quote id', { ctx: { quoteId: 'q-1' } }, false],
])('blocks confirm/submit for %s without POST', async (_label, scenario, silent) => {
  const h = setup();
  if ('customer' in scenario) h.setCustomerId(scenario.customer as null);
  if ('focused' in scenario) h.setFocused(scenario.focused as boolean);
  if ('ctx' in scenario) {
    const value = scenario.ctx as null | Record<string, unknown>;
    h.setContext(value === null ? null : context(value));
  }
  h.controller.requestConfirm('approve');
  await h.controller.submit();
  expect(approve(h)).not.toHaveBeenCalled();
  expect(reject(h)).not.toHaveBeenCalled();
  const notices = (h.deps.notify as jest.Mock).mock.calls;
  if (silent) {
    expect(notices).toHaveLength(0);
  } else {
    expect(notices[notices.length - 1][0]).toBe('Báo giá đã thay đổi');
  }
});

it('notifies a changed quote instead of posting a stale decision', async () => {
  const h = setup();
  h.controller.requestConfirm('approve');
  h.setContext(context({ quoteStatus: 'APPROVED' }));
  await h.controller.submit();
  expect(approve(h)).not.toHaveBeenCalled();
  expect(notified(h).mock.calls[notified(h).mock.calls.length - 1][0]).toBe('Báo giá đã thay đổi');
});

it('ignores toggles for ineligible, unknown, or malformed ids', () => {
  const h = setup();
  h.controller.toggleWarranty('not-a-uuid');
  h.controller.toggleWarranty(QUOTE_ID);
  h.controller.toggleWarranty(laborLine().id);
  expect(approve(h)).not.toHaveBeenCalled();
  expect(reject(h)).not.toHaveBeenCalled();
  expect(notified(h)).not.toHaveBeenCalled();
  h.controller.toggleWarranty(PART_ID);
  expect(h.state().selectedIds).toEqual([PART_ID]);
});

it('throttles duplicate submits to a single POST', async () => {
  const h = setup();
  const gatePromise = deferred<unknown>();
  approve(h).mockReturnValueOnce(gatePromise.promise);
  h.controller.requestConfirm('approve');
  const first = h.controller.submit();
  const second = h.controller.submit();
  gatePromise.resolve({ id: QUOTE_ID });
  await Promise.all([first, second]);
  expect(approve(h)).toHaveBeenCalledTimes(1);
});

it('drops a stale approved response after logout without notify or refresh', async () => {
  const h = setup();
  const gatePromise = deferred<unknown>();
  approve(h).mockReturnValueOnce(gatePromise.promise);
  h.controller.requestConfirm('approve');
  const attempt = h.controller.submit();
  h.setCustomerId('other-customer');
  gatePromise.resolve({ id: QUOTE_ID });
  await attempt;
  expect(notified(h)).not.toHaveBeenCalled();
  expect(refreshed(h)).not.toHaveBeenCalled();
  expect(h.state().decided).toBeNull();
});

it.each([401, 403])('purges selection and confirmation on %s with re-login copy', async (status) => {
  const h = setup();
  h.controller.toggleWarranty(PART_ID);
  h.controller.requestConfirm('reject');
  reject(h).mockRejectedValue({ response: { status } });
  await h.controller.submit();
  expect(denied(h)).toHaveBeenCalledTimes(1);
  expect(h.state()).toMatchObject({ selectedIds: [], confirming: null, busy: false, decided: null });
  expect(notified(h).mock.calls[notified(h).mock.calls.length - 1][0]).toBe('Phiên đăng nhập đã hết');
});

it.each([409, 422])('shows backend contract status on %s and reloads without locking', async (status) => {
  const h = setup();
  h.controller.requestConfirm('approve');
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
])('locks on ambiguous failure %s: no repost until the detail reloads', async (_label, error) => {
  const h = setup();
  h.controller.requestConfirm('reject');
  reject(h).mockRejectedValue(error);
  await h.controller.submit();
  expect(reject(h)).toHaveBeenCalledTimes(1);
  expect(h.state().needsVerify).toBe(true);
  expect(h.state().error).toMatch(/tải lại chi tiết đơn/);
  expect(refreshed(h)).toHaveBeenCalledTimes(1);
  h.controller.requestConfirm('reject');
  await h.controller.submit();
  expect(reject(h)).toHaveBeenCalledTimes(1);
  h.controller.markReverified();
  expect(h.state().needsVerify).toBe(false);
});

it('reset clears selection and confirmation on blur/order change', () => {
  const h = setup();
  h.controller.toggleWarranty(PART_ID);
  h.controller.requestConfirm('approve');
  h.controller.reset();
  expect(h.state()).toMatchObject({ selectedIds: [], confirming: null, decided: null, needsVerify: false });
});

describe('eligibleWarrantyOptions (production helper)', () => {
  it('accepts a genuine technician paid-warranty line with fee and term', () => {
    expect(eligibleWarrantyOptions([laborLine(), paidPart()])).toMatchObject([
      { itemId: PART_ID, description: 'Tụ 450V chính hãng', fee: 20000, termDays: 90 },
    ]);
  });

  it('excludes FixHome INCLUDED catalog warranty and non-technician sources', () => {
    const items = [
      paidPart({ partWarrantyOption: 'included' }),
      paidPart({ partWarrantyOption: 'INCLUDED' }),
      paidPart({ partSource: 'fixhome' }),
      paidPart({ partSource: undefined }),
    ];
    expect(eligibleWarrantyOptions(items)).toEqual([]);
  });

  it('fails closed on malformed id, unsafe fee, or missing term', () => {
    const items = [
      paidPart({ id: 'p1' }),
      paidPart({ id: '' }),
      paidPart({ warrantyFee: NaN }),
      paidPart({ warrantyFee: -5 }),
      paidPart({ warrantyFee: '20000' }),
      paidPart({ warrantyTermDays: 0, warrantyDays: undefined }),
      paidPart({ warrantyTermDays: 1.5 }),
      paidPart({ warrantyTermDays: undefined, warrantyDays: undefined }),
      paidPart({ description: '   ' }),
      'not-an-object',
    ];
    expect(eligibleWarrantyOptions(items)).toEqual([]);
  });

  it('falls back to warrantyDays for the term and accepts zero fees', () => {
    expect(
      eligibleWarrantyOptions([paidPart({ warrantyTermDays: undefined, warrantyDays: 30, warrantyFee: 0 })]),
    ).toMatchObject([{ termDays: 30, fee: 0 }]);
  });

  it.each([[null], [undefined], ['items'], [{ items: [] }]])(
    'returns empty for non-array payload %s',
    (payload) => {
      expect(eligibleWarrantyOptions(payload)).toEqual([]);
    },
  );
});

it('formats decision money without float corruption', () => {
  expect(decisionMoneyText(20000)).toBe('20.000đ');
});

it('shares the initial state shape', () => {
  expect(initialDecisionState).toMatchObject({
    selectedIds: [],
    confirming: null,
    busy: false,
    error: null,
    needsVerify: false,
    decided: null,
  });
});

describe('ambiguous-retry screen path (review remediation)', () => {
  const detailOrder = (quoteStatus: string) => ({
    id: ORDER_ID,
    code: 'SO-1',
    bookingId: '22222222-2222-4222-8222-222222222222',
    serviceName: 'Tap repair',
    status: 'EN_ROUTE',
    customerName: 'An',
    customerPhone: '090',
    addressSummary: 'HCM',
    scheduledAt: '2030-10-21T10:00:00Z',
    laborTotal: 100000,
    partsTotal: 50000,
    grandTotal: 150000,
    paymentStatus: 'UNPAID',
    createdAt: '2030-10-20T09:00:00Z',
    quotation: {
      id: QUOTE_ID,
      status: quoteStatus,
      laborTotal: 180000,
      partsTotal: 0,
      items: [{ description: 'Thay tụ', quantity: 1, unitPrice: 180000, lineTotal: 180000, type: 'LABOR' }],
    },
  });

  interface ScreenHarness {
    loader: ReturnType<typeof createOrderDetailLoader>;
    getOrder: jest.Mock;
    controller: ReturnType<typeof createQuotationDecisionController>;
    approve: jest.Mock;
    reject: jest.Mock;
    notified: jest.Mock;
    refreshed: jest.Mock;
    state: () => DecisionState;
    setUserId: (value: string | null) => void;
    setFocused: (value: boolean) => void;
    /** Exact fixed onRefresh unlock sequence from the customer screen. */
    fixedOnRefresh: () => Promise<void>;
  }

  /** REAL detail loader + REAL decision controller, screen-identical wiring. */
  function screenSetup(): ScreenHarness {
    let userId: string | null = 'customer-1';
    const listeners = new Set<() => void>();
    const session = {
      getUserId: () => userId,
      subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    };
    let focused = true;
    const getOrder = jest.fn<Promise<ServiceOrderItem>, [string]>()
      .mockResolvedValue(detailOrder('SENT') as ServiceOrderItem);
    const writes: DecisionState[] = [];
    const approve = jest.fn().mockResolvedValue({ id: QUOTE_ID });
    const reject = jest.fn().mockResolvedValue({ id: QUOTE_ID });
    const refreshed = jest.fn().mockResolvedValue(undefined);
    const notified = jest.fn();
    // THE SAME production mirror path as the screen: the loader write
    // publishes into the ref synchronously, pre-commit, via the shared helper.
    const mirror: { current: { order: ServiceOrderItem | null; serviceOrderId: string } } = {
      current: { order: null, serviceOrderId: ORDER_ID },
    };
    const realLoader = createOrderDetailLoader(
      getOrder,
      writeDetailWithMirror(mirror, ORDER_ID, () => undefined),
      session,
    );
    const controller = createQuotationDecisionController(
      {
        getContext: () => {
          const latest = mirror.current;
          if (!latest.order || latest.order.id !== latest.serviceOrderId) return null;
          const quotation = (latest.order as unknown as Record<string, unknown>).quotation as Record<string, unknown> | undefined;
          return {
            orderId: latest.order.id,
            orderStatus: latest.order.status,
            quoteId: quotation ? quotation.id : null,
            quoteStatus: quotation ? quotation.status : null,
            items: quotation ? quotation.items : null,
          };
        },
        getCustomerId: () => userId,
        isFocused: () => focused,
        approveQuotation: approve,
        rejectQuotation: reject,
        refreshDetail: refreshed,
        onAccessDenied: jest.fn(),
        notify: notified,
      },
      (state) => { writes.push(state); },
    );
    return {
      loader: realLoader,
      getOrder,
      controller,
      approve,
      reject,
      notified: jest.fn(),
      refreshed,
      state: () => writes[writes.length - 1],
      setUserId: (value) => { userId = value; },
      setFocused: (value) => { focused = value; },
      fixedOnRefresh: async () => {
        const detailFresh = await realLoader.refreshVerified();
        const latest = mirror.current;
        const verifiedUnlock =
          detailFresh === true &&
          focused &&
          userId !== null &&
          !!latest.order &&
          latest.order.id === ORDER_ID &&
          latest.order.id === latest.serviceOrderId;
        if (verifiedUnlock) controller.markReverified();
      },
    };
  }

  async function lockAfterAmbiguous(s: ScreenHarness, kind: 'approve' | 'reject' = 'approve') {
    await s.loader.focus(ORDER_ID);
    s.controller.requestConfirm(kind);
    const post = kind === 'approve' ? s.approve : s.reject;
    post.mockRejectedValueOnce({ message: 'timeout' });
    await s.controller.submit();
    expect(s.state().needsVerify).toBe(true);
  }

  it('failed detail GET after ambiguous POST keeps the lock with zero repost', async () => {
    const s = screenSetup();
    await lockAfterAmbiguous(s);
    s.getOrder.mockRejectedValueOnce(new Error('offline'));
    await s.fixedOnRefresh();
    expect(s.state().needsVerify).toBe(true);
    s.controller.requestConfirm('approve');
    await s.controller.submit();
    expect(s.approve).toHaveBeenCalledTimes(1);
  });

  it('fresh GET still SENT unlocks a deliberate retry', async () => {
    const s = screenSetup();
    await lockAfterAmbiguous(s, 'reject');
    s.getOrder.mockResolvedValueOnce(detailOrder('SENT') as ServiceOrderItem);
    await s.fixedOnRefresh();
    expect(s.state().needsVerify).toBe(false);
    s.controller.requestConfirm('reject');
    await s.controller.submit();
    expect(s.reject).toHaveBeenCalledTimes(2);
  });

  it('fresh GET showing APPROVED never enables a stale action', async () => {
    const s = screenSetup();
    await lockAfterAmbiguous(s);
    s.getOrder.mockResolvedValueOnce(detailOrder('APPROVED') as ServiceOrderItem);
    await s.fixedOnRefresh();
    s.controller.requestConfirm('approve');
    await s.controller.submit();
    expect(s.approve).toHaveBeenCalledTimes(1);
  });

  it('account switch during the verifying GET keeps the lock silently', async () => {
    const s = screenSetup();
    await lockAfterAmbiguous(s);
    const gate = deferred<ServiceOrderItem>();
    s.getOrder.mockReturnValueOnce(gate.promise);
    const attempt = s.fixedOnRefresh();
    s.setUserId('other-customer');
    gate.resolve(detailOrder('SENT') as ServiceOrderItem);
    await attempt;
    expect(s.state().needsVerify).toBe(true);
  });
});

describe('stale pre-commit mirror (review FAIL1 remediation)', () => {
  const staleOrder = (quoteStatus: string) => ({
    id: ORDER_ID,
    code: 'SO-1',
    bookingId: '22222222-2222-4222-8222-222222222222',
    serviceName: 'Tap repair',
    status: 'EN_ROUTE',
    customerName: 'An',
    customerPhone: '090',
    addressSummary: 'HCM',
    scheduledAt: '2030-10-21T10:00:00Z',
    laborTotal: 100000,
    partsTotal: 50000,
    grandTotal: 150000,
    paymentStatus: 'UNPAID',
    createdAt: '2030-10-20T09:00:00Z',
    quotation: {
      id: QUOTE_ID,
      status: quoteStatus,
      laborTotal: 180000,
      partsTotal: 0,
      items: [{ description: 'Thay tụ', quantity: 1, unitPrice: 180000, lineTotal: 180000, type: 'LABOR' }],
    },
  });

  function helperHarness() {
    let userId: string | null = 'customer-1';
    const focused = true;
    const getOrder = jest.fn<Promise<ServiceOrderItem>, [string]>()
      .mockResolvedValue(staleOrder('SENT') as ServiceOrderItem);
    // THE SAME production helper the screen wires into its loader: the ref
    // mirror updates in the same tick as the state write, pre-commit.
    const mirror: { current: { order: ServiceOrderItem | null; serviceOrderId: string } } = {
      current: { order: null, serviceOrderId: ORDER_ID },
    };
    let committedOrder: ServiceOrderItem | null = null;
    const loader = createOrderDetailLoader(
      getOrder,
      writeDetailWithMirror(mirror, ORDER_ID, (state) => {
        committedOrder = state.order;
      }),
      {
        getUserId: () => userId,
        subscribe: () => () => undefined,
      },
    );
    const writes: DecisionState[] = [];
    const approve = jest.fn().mockResolvedValue({ id: QUOTE_ID });
    const reject = jest.fn().mockResolvedValue({ id: QUOTE_ID });
    const controller = createQuotationDecisionController(
      {
        getContext: () => {
          const latest = mirror.current;
          if (!latest.order || latest.order.id !== latest.serviceOrderId) return null;
          const quotation = (latest.order as unknown as Record<string, unknown>).quotation as Record<string, unknown> | undefined;
          return {
            orderId: latest.order.id,
            orderStatus: latest.order.status,
            quoteId: quotation ? quotation.id : null,
            quoteStatus: quotation ? quotation.status : null,
            items: quotation ? quotation.items : null,
          };
        },
        getCustomerId: () => userId,
        isFocused: () => focused,
        approveQuotation: approve,
        rejectQuotation: reject,
        refreshDetail: jest.fn().mockResolvedValue(undefined),
        onAccessDenied: jest.fn(),
        notify: jest.fn(),
      },
      (state) => { writes.push(state); },
    );
    return {
      loader, getOrder, controller, approve, reject,
      mirror, committed: () => committedOrder,
      state: () => writes[writes.length - 1],
      setUserId: (value: string | null) => { userId = value; },
    };
  }

  it('sync mirror publishes APPROVED pre-commit while the committed view lags', async () => {
    const h = helperHarness();
    await h.loader.focus(ORDER_ID);
    h.getOrder.mockResolvedValueOnce(staleOrder('APPROVED') as ServiceOrderItem);
    const detailFresh = await h.loader.refreshVerified();
    expect(detailFresh).toBe(true);
    // Same tick, before any React commit/passive effect: the production
    // mirror already carries APPROVED.
    const quoted = (h.mirror.current.order as unknown as Record<string, unknown> | null)
      ?.quotation as Record<string, unknown> | undefined;
    expect(quoted?.status).toBe('APPROVED');
    expect(h.mirror.current.serviceOrderId).toBe(ORDER_ID);
  });

  it('opposite REJECT sends zero posts after server APPROVED, pre-commit', async () => {
    const h = helperHarness();
    await h.loader.focus(ORDER_ID);
    h.controller.requestConfirm('approve');
    h.approve.mockRejectedValueOnce({ message: 'timeout' });
    await h.controller.submit();
    expect(h.state().needsVerify).toBe(true);
    // Fresh GET reports server APPROVED; no commit/effect flush follows.
    h.getOrder.mockResolvedValueOnce(staleOrder('APPROVED') as ServiceOrderItem);
    const detailFresh = await h.loader.refreshVerified();
    expect(detailFresh).toBe(true);
    h.controller.markReverified();
    // Opposite REJECT against the synchronously mirrored APPROVED state.
    h.controller.requestConfirm('reject');
    await h.controller.submit();
    expect(h.reject).not.toHaveBeenCalled();
    expect(h.approve).toHaveBeenCalledTimes(1);
  });

  it('deliberate retry still works when the fresh GET confirms SENT', async () => {
    const h = helperHarness();
    await h.loader.focus(ORDER_ID);
    h.controller.requestConfirm('approve');
    h.approve.mockRejectedValueOnce({ message: 'timeout' });
    await h.controller.submit();
    h.getOrder.mockResolvedValueOnce(staleOrder('SENT') as ServiceOrderItem);
    const detailFresh = await h.loader.refreshVerified();
    expect(detailFresh).toBe(true);
    h.controller.markReverified();
    h.controller.requestConfirm('approve');
    h.approve.mockResolvedValue({ id: QUOTE_ID });
    await h.controller.submit();
    expect(h.approve).toHaveBeenCalledTimes(2);
  });
});
