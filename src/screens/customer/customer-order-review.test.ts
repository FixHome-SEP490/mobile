import type { ReviewItem } from '../../api/orders.api';
import {
  createCustomerOrderReviewController,
  customerReviewTarget,
  initialCustomerOrderReviewState,
  type CustomerOrderReviewDeps,
  type CustomerOrderReviewState,
} from './customer-order-review';

const ORDER_ID = '11111111-1111-4111-8111-111111111111';

const completedOrder = (overrides: Record<string, unknown> = {}) => ({
  id: ORDER_ID,
  status: 'COMPLETED',
  historical: false,
  ...overrides,
});

const review = (overrides: Partial<ReviewItem> = {}): ReviewItem => ({
  id: 'review-1',
  rating: 5,
  comment: 'Tốt',
  createdAt: '2030-01-01T00:00:00Z',
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
  let order: ReturnType<typeof completedOrder> | null = completedOrder();
  let customerId: string | null = 'customer-a';
  let focused = true;
  const write = jest.fn<void, [CustomerOrderReviewState]>();

  const deps: CustomerOrderReviewDeps = {
    getOrder: () => order,
    getCustomerId: () => customerId,
    isFocused: () => focused,
    getReview: jest.fn().mockResolvedValue(null),
    submitReview: jest.fn().mockResolvedValue({ id: 'review-1' }),
    onAccessDenied: jest.fn(),
    notify: jest.fn(),
  };

  const controller = createCustomerOrderReviewController(deps, write);
  return {
    deps,
    controller,
    state: () => write.mock.calls[write.mock.calls.length - 1][0],
    setOrder: (value: ReturnType<typeof completedOrder> | null) => {
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

const getReview = (h: ReturnType<typeof setup>) =>
  h.deps.getReview as jest.Mock;
const submitReview = (h: ReturnType<typeof setup>) =>
  h.deps.submitReview as jest.Mock;
const denied = (h: ReturnType<typeof setup>) =>
  h.deps.onAccessDenied as jest.Mock;
const notify = (h: ReturnType<typeof setup>) =>
  h.deps.notify as jest.Mock;

describe('customerReviewTarget', () => {
  it('allows only a real active COMPLETED order', () => {
    expect(customerReviewTarget(completedOrder())).toBe(ORDER_ID);
    expect(
      customerReviewTarget(completedOrder({ status: 'UNDER_REPAIR' })),
    ).toBeNull();
    expect(
      customerReviewTarget(completedOrder({ historical: true })),
    ).toBeNull();
    expect(
      customerReviewTarget(completedOrder({ id: 'not-a-uuid' })),
    ).toBeNull();
  });
});

describe('customer order review controller', () => {
  it('loads an existing review and prevents duplicate POST', async () => {
    const h = setup();
    getReview(h).mockResolvedValue(review());

    await h.controller.load();
    h.controller.setRating(1);
    await h.controller.submit();

    expect(h.state().review).toMatchObject({ id: 'review-1', rating: 5 });
    expect(h.state().rating).toBe(5);
    expect(submitReview(h)).not.toHaveBeenCalled();
  });

  it('fails closed before POST when existing-review GET fails', async () => {
    const h = setup();
    getReview(h).mockRejectedValue(new Error('offline'));

    await h.controller.submit();

    expect(submitReview(h)).not.toHaveBeenCalled();
    expect(h.state().error).toMatch(/chưa gửi đánh giá mới/i);
  });

  it('submits once then requires GET readback before success', async () => {
    const h = setup();
    getReview(h)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(review({ rating: 4, comment: 'Ổn' }));
    h.controller.setRating(4);
    h.controller.setComment('  Ổn  ');

    await h.controller.submit();

    expect(submitReview(h)).toHaveBeenCalledTimes(1);
    expect(submitReview(h)).toHaveBeenCalledWith(ORDER_ID, {
      rating: 4,
      comment: 'Ổn',
    });
    expect(h.state()).toMatchObject({
      review: expect.objectContaining({ rating: 4 }),
      needsVerify: false,
      busy: false,
    });
    expect(notify(h)).toHaveBeenCalledWith(
      'Đã gửi đánh giá',
      expect.any(String),
    );
  });

  it('locks successful POST if GET cannot prove the review', async () => {
    const h = setup();
    getReview(h).mockResolvedValue(null);

    await h.controller.submit();
    await h.controller.submit();

    expect(submitReview(h)).toHaveBeenCalledTimes(1);
    expect(h.state().needsVerify).toBe(true);
  });

  it.each([
    ['timeout', new Error('timeout')],
    ['server 500', { response: { status: 500 } }],
  ])('reconciles ambiguous %s only by GET', async (_label, error) => {
    const h = setup();
    getReview(h)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(review());
    submitReview(h).mockRejectedValue(error);

    await h.controller.submit();

    expect(submitReview(h)).toHaveBeenCalledTimes(1);
    expect(h.state().review).toMatchObject({ id: 'review-1' });
    expect(h.state().needsVerify).toBe(false);
  });

  it('keeps ambiguous result locked if GET still returns no review', async () => {
    const h = setup();
    getReview(h).mockResolvedValue(null);
    submitReview(h).mockRejectedValue(new Error('offline'));

    await h.controller.submit();
    await h.controller.submit();

    expect(submitReview(h)).toHaveBeenCalledTimes(1);
    expect(h.state().needsVerify).toBe(true);
  });

  it('uses GET to recover a duplicate/conflict review without repost', async () => {
    const h = setup();
    getReview(h)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(review());
    submitReview(h).mockRejectedValue({ response: { status: 409 } });

    await h.controller.submit();

    expect(submitReview(h)).toHaveBeenCalledTimes(1);
    expect(h.state().review).toMatchObject({ id: 'review-1' });
  });

  it.each([400, 404, 422])(
    'surfaces definitive rejection %s without unknown lock',
    async (status) => {
      const h = setup();
      getReview(h).mockResolvedValue(null);
      submitReview(h).mockRejectedValue({ response: { status } });

      await h.controller.submit();

      expect(h.state().needsVerify).toBe(false);
      expect(h.state().error).toContain(String(status));
    },
  );

  it.each([401, 403])('purges on access rejection %s', async (status) => {
    const h = setup();
    getReview(h).mockResolvedValueOnce(null);
    submitReview(h).mockRejectedValue({ response: { status } });

    await h.controller.submit();

    expect(denied(h)).toHaveBeenCalledTimes(1);
    expect(h.state()).toEqual(initialCustomerOrderReviewState);
  });

  it('trims comment to Backend max length and validates rating', () => {
    const h = setup();
    h.controller.setRating(3);
    h.controller.setComment('x'.repeat(2500));

    expect(h.state().rating).toBe(3);
    expect(h.state().comment).toHaveLength(2000);

    h.controller.setRating(0);
    expect(h.state().rating).toBe(3);
  });

  it('throttles rapid duplicate submit taps', async () => {
    const h = setup();
    const gate = deferred<unknown>();
    getReview(h).mockResolvedValue(null);
    submitReview(h).mockReturnValueOnce(gate.promise);

    const a = h.controller.submit();
    const b = h.controller.submit();
    gate.resolve({});
    await Promise.all([a, b]);

    expect(submitReview(h)).toHaveBeenCalledTimes(1);
  });

  it('drops stale response after account switch', async () => {
    const h = setup();
    const gate = deferred<unknown>();
    getReview(h).mockResolvedValueOnce(null);
    submitReview(h).mockReturnValueOnce(gate.promise);

    const request = h.controller.submit();
    await Promise.resolve();
    h.setCustomerId('customer-b');
    (notify(h) as jest.Mock).mockClear();
    gate.resolve({});
    await request;

    expect(notify(h)).not.toHaveBeenCalled();
  });

  it('does not load or submit for non-COMPLETED order', async () => {
    const h = setup();
    h.setOrder(completedOrder({ status: 'UNDER_REPAIR' }));

    await h.controller.load();
    await h.controller.submit();

    expect(getReview(h)).not.toHaveBeenCalled();
    expect(submitReview(h)).not.toHaveBeenCalled();
  });
});
