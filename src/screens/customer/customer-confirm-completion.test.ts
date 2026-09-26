import {
  createCustomerConfirmCompletionController,
  customerConfirmCompletionTarget,
  initialCustomerConfirmCompletionState,
  CUSTOMER_CONFIRM_COMPLETION_COPY,
  type CustomerConfirmCompletionDeps,
  type CustomerConfirmCompletionState,
} from './customer-confirm-completion';

const ORDER_ID = '11111111-1111-4111-8111-111111111111';

const gate = (overrides: Record<string, unknown> = {}) => ({
  id: ORDER_ID,
  status: 'UNDER_REPAIR',
  completionRequestedAt: '2030-01-01T00:00:00Z',
  customerConfirmed: false,
  historical: false,
  ...overrides,
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function setup() {
  let order: ReturnType<typeof gate> | null = gate();
  let customerId: string | null = 'customer-a';
  let focused = true;
  const write = jest.fn<void, [CustomerConfirmCompletionState]>();

  const deps: CustomerConfirmCompletionDeps = {
    getOrder: () => order,
    getCustomerId: () => customerId,
    isFocused: () => focused,
    confirmCompletion: jest.fn().mockResolvedValue({}),
    refreshDetail: jest.fn().mockImplementation(async () => {
      if (order) order = gate({ ...order, customerConfirmed: true });
    }),
    refreshInvoice: jest.fn().mockResolvedValue(undefined),
    onAccessDenied: jest.fn(),
    notify: jest.fn(),
  };

  const controller = createCustomerConfirmCompletionController(deps, write);
  return {
    deps,
    controller,
    state: () => write.mock.calls[write.mock.calls.length - 1][0],
    setOrder: (value: ReturnType<typeof gate> | null) => {
      order = value;
    },
    setCustomerId: (value: string | null) => {
      customerId = value;
    },
    setFocused: (value: boolean) => {
      focused = value;
    },
  };
}

const post = (h: ReturnType<typeof setup>) =>
  h.deps.confirmCompletion as jest.Mock;
const refreshDetail = (h: ReturnType<typeof setup>) =>
  h.deps.refreshDetail as jest.Mock;
const refreshInvoice = (h: ReturnType<typeof setup>) =>
  h.deps.refreshInvoice as jest.Mock;
const notify = (h: ReturnType<typeof setup>) => h.deps.notify as jest.Mock;
const denied = (h: ReturnType<typeof setup>) =>
  h.deps.onAccessDenied as jest.Mock;

describe('customerConfirmCompletionTarget', () => {
  it('allows only active requested, not-yet-confirmed UNDER_REPAIR order', () => {
    expect(customerConfirmCompletionTarget(gate())).toBe(ORDER_ID);
    expect(
      customerConfirmCompletionTarget(gate({ status: 'EN_ROUTE' })),
    ).toBeNull();
    expect(
      customerConfirmCompletionTarget(gate({ completionRequestedAt: null })),
    ).toBeNull();
    expect(
      customerConfirmCompletionTarget(gate({ customerConfirmed: true })),
    ).toBeNull();
    expect(
      customerConfirmCompletionTarget(gate({ historical: true })),
    ).toBeNull();
  });
});

describe('customer confirm completion controller', () => {
  it('keeps work confirmation explicitly separate from payment', () => {
    expect(CUSTOMER_CONFIRM_COMPLETION_COPY).toMatch(/không đồng nghĩa.*thanh toán/i);
    expect(CUSTOMER_CONFIRM_COMPLETION_COPY).toMatch(/COMPLETED/);
  });

  it('requires explicit confirm before one POST', async () => {
    const h = setup();
    await h.controller.submit();
    expect(post(h)).not.toHaveBeenCalled();

    h.controller.requestConfirm();
    expect(h.state().confirming).toBe(true);
    await h.controller.submit();

    expect(post(h)).toHaveBeenCalledTimes(1);
    expect(post(h)).toHaveBeenCalledWith(ORDER_ID);
    expect(refreshDetail(h)).toHaveBeenCalledTimes(1);
    expect(refreshInvoice(h)).toHaveBeenCalledTimes(1);
    expect(h.state()).toMatchObject({
      confirmed: true,
      needsVerify: false,
      busy: false,
    });
  });

  it('keeps successful POST locked when GET does not confirm it', async () => {
    const h = setup();
    refreshDetail(h).mockResolvedValue(undefined);
    h.controller.requestConfirm();

    await h.controller.submit();

    expect(post(h)).toHaveBeenCalledTimes(1);
    expect(h.state().confirmed).toBe(false);
    expect(h.state().needsVerify).toBe(true);

    h.controller.requestConfirm();
    await h.controller.submit();
    expect(post(h)).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['timeout', new Error('timeout')],
    ['server 500', { response: { status: 500 } }],
  ])('reconciles ambiguous %s by GET without repost', async (_label, error) => {
    const h = setup();
    post(h).mockRejectedValue(error);
    h.controller.requestConfirm();

    await h.controller.submit();

    expect(post(h)).toHaveBeenCalledTimes(1);
    expect(refreshDetail(h)).toHaveBeenCalledTimes(1);
    expect(h.state().confirmed).toBe(true);
    expect(h.state().needsVerify).toBe(false);
  });

  it('keeps ambiguous result locked if fresh GET still lacks confirmation', async () => {
    const h = setup();
    post(h).mockRejectedValue(new Error('offline'));
    refreshDetail(h).mockResolvedValue(undefined);
    h.controller.requestConfirm();

    await h.controller.submit();

    expect(h.state().needsVerify).toBe(true);
    await h.controller.reconcile();
    expect(post(h)).toHaveBeenCalledTimes(1);
  });

  it.each([400, 404, 409, 422])(
    'treats %s as definitive rejection and does not keep unknown lock',
    async (status) => {
      const h = setup();
      post(h).mockRejectedValue({ response: { status } });
      refreshDetail(h).mockResolvedValue(undefined);
      h.controller.requestConfirm();

      await h.controller.submit();

      expect(post(h)).toHaveBeenCalledTimes(1);
      expect(h.state().needsVerify).toBe(false);
      expect(h.state().error).toContain(String(status));
    },
  );

  it.each([401, 403])('purges on access rejection %s', async (status) => {
    const h = setup();
    post(h).mockRejectedValue({ response: { status } });
    h.controller.requestConfirm();

    await h.controller.submit();

    expect(denied(h)).toHaveBeenCalledTimes(1);
    expect(h.state()).toEqual(initialCustomerConfirmCompletionState);
  });

  it('throttles duplicate submit taps', async () => {
    const h = setup();
    const pending = deferred<unknown>();
    post(h).mockReturnValueOnce(pending.promise);
    h.controller.requestConfirm();

    const a = h.controller.submit();
    const b = h.controller.submit();
    pending.resolve({});
    await Promise.all([a, b]);

    expect(post(h)).toHaveBeenCalledTimes(1);
  });

  it('drops stale response after account switch', async () => {
    const h = setup();
    const pending = deferred<unknown>();
    post(h).mockReturnValueOnce(pending.promise);
    h.controller.requestConfirm();
    const request = h.controller.submit();

    h.setCustomerId('customer-b');
    (notify(h) as jest.Mock).mockClear();
    pending.resolve({});
    await request;

    expect(notify(h)).not.toHaveBeenCalled();
    expect(refreshDetail(h)).not.toHaveBeenCalled();
    expect(refreshInvoice(h)).not.toHaveBeenCalled();
  });

  it('posts nothing when order is no longer eligible', async () => {
    const h = setup();
    h.setOrder(gate({ customerConfirmed: true }));
    h.controller.requestConfirm();
    await h.controller.submit();

    expect(post(h)).not.toHaveBeenCalled();
  });
});
