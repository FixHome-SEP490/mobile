import type { ReviewItem } from '../../api/orders.api';
import { orderDetailTarget } from './customer-order-detail';

export interface CustomerReviewOrderGate {
  id: string;
  status: unknown;
  historical?: unknown;
}

export interface CustomerOrderReviewState {
  loading: boolean;
  busy: boolean;
  error: string | null;
  needsVerify: boolean;
  review: ReviewItem | null;
  rating: number;
  comment: string;
}

export const initialCustomerOrderReviewState: CustomerOrderReviewState = {
  loading: false,
  busy: false,
  error: null,
  needsVerify: false,
  review: null,
  rating: 5,
  comment: '',
};

export interface CustomerOrderReviewDeps {
  getOrder: () => CustomerReviewOrderGate | null;
  getCustomerId: () => string | null;
  isFocused: () => boolean;
  getReview: (orderId: string) => Promise<ReviewItem | null>;
  submitReview: (
    orderId: string,
    body: { rating: number; comment?: string },
  ) => Promise<unknown>;
  onAccessDenied: () => void;
  notify: (title: string, message: string) => void;
}

function statusOf(error: unknown): number | undefined {
  return (error as { response?: { status?: number } } | null)?.response
    ?.status;
}

function isDefinitiveReviewRejection(error: unknown): boolean {
  const status = statusOf(error);
  return (
    status === 400 ||
    status === 401 ||
    status === 403 ||
    status === 404 ||
    status === 409 ||
    status === 422
  );
}

export function customerReviewTarget(
  order: CustomerReviewOrderGate | null,
): string | null {
  if (!order || order.historical === true) return null;
  const target = orderDetailTarget(order.id);
  if (!target) return null;
  return String(order.status).toUpperCase() === 'COMPLETED'
    ? target
    : null;
}

function normalizedReview(value: ReviewItem | null): ReviewItem | null {
  if (!value || typeof value.id !== 'string' || value.id.length === 0) {
    return null;
  }
  if (
    !Number.isInteger(value.rating) ||
    value.rating < 1 ||
    value.rating > 5
  ) {
    return null;
  }
  return value;
}

export function createCustomerOrderReviewController(
  deps: CustomerOrderReviewDeps,
  write: (state: CustomerOrderReviewState) => void,
) {
  let state = { ...initialCustomerOrderReviewState };
  let submitting = false;

  const publish = (patch: Partial<CustomerOrderReviewState>) => {
    state = { ...state, ...patch };
    write(state);
  };

  const currentContext = () => {
    const customerId = deps.getCustomerId();
    const order = deps.getOrder();
    const orderId = customerReviewTarget(order);
    if (!customerId || !orderId || !deps.isFocused()) return null;
    return { customerId, orderId };
  };

  const stillCurrent = (customerId: string, orderId: string) =>
    deps.isFocused() &&
    deps.getCustomerId() === customerId &&
    deps.getOrder()?.id === orderId &&
    customerReviewTarget(deps.getOrder()) === orderId;

  async function readReview(
    customerId: string,
    orderId: string,
  ): Promise<ReviewItem | null | undefined> {
    try {
      const result = normalizedReview(await deps.getReview(orderId));
      return stillCurrent(customerId, orderId) ? result : undefined;
    } catch (error) {
      if (!stillCurrent(customerId, orderId)) return undefined;
      const status = statusOf(error);
      if (status === 401 || status === 403) {
        deps.onAccessDenied();
      }
      return undefined;
    }
  }

  async function load(): Promise<void> {
    const context = currentContext();
    if (!context) {
      state = { ...initialCustomerOrderReviewState };
      write(state);
      return;
    }

    publish({ loading: true, error: null });
    try {
      const review = await deps.getReview(context.orderId);
      if (!stillCurrent(context.customerId, context.orderId)) return;
      publish({
        loading: false,
        review: normalizedReview(review),
        error: null,
        needsVerify: false,
      });
    } catch (error) {
      if (!stillCurrent(context.customerId, context.orderId)) return;
      const status = statusOf(error);
      if (status === 401 || status === 403) {
        state = { ...initialCustomerOrderReviewState };
        write(state);
        deps.onAccessDenied();
        return;
      }
      publish({
        loading: false,
        error: 'Không thể tải đánh giá của đơn. Hãy thử lại.',
      });
    }
  }

  function setRating(value: number) {
    if (state.busy || state.needsVerify || state.review) return;
    if (!Number.isInteger(value) || value < 1 || value > 5) return;
    publish({ rating: value, error: null });
  }

  function setComment(value: string) {
    if (state.busy || state.needsVerify || state.review) return;
    publish({ comment: value.slice(0, 2000), error: null });
  }

  async function reconcile(): Promise<void> {
    if (state.busy) return;
    const context = currentContext();
    if (!context) return;

    publish({ busy: true, error: null });
    const review = await readReview(
      context.customerId,
      context.orderId,
    );
    if (!stillCurrent(context.customerId, context.orderId)) return;

    if (review) {
      publish({
        busy: false,
        review,
        needsVerify: false,
        error: null,
      });
    } else {
      publish({
        busy: false,
        needsVerify: true,
        error:
          'Chưa tìm thấy đánh giá để xác minh lần gửi trước. Không gửi POST lại.',
      });
    }
  }

  async function submit(): Promise<void> {
    if (
      submitting ||
      state.busy ||
      state.needsVerify ||
      state.review
    ) {
      return;
    }

    const context = currentContext();
    if (!context) return;
    if (
      !Number.isInteger(state.rating) ||
      state.rating < 1 ||
      state.rating > 5
    ) {
      publish({ error: 'Vui lòng chọn mức đánh giá từ 1 đến 5 sao.' });
      return;
    }

    submitting = true;
    publish({ busy: true, error: null });

    try {
      // Fail closed before POST: if we cannot prove no existing review,
      // we do not risk a duplicate create attempt.
      let existing: ReviewItem | null;
      try {
        existing = normalizedReview(
          await deps.getReview(context.orderId),
        );
      } catch (error) {
        if (!stillCurrent(context.customerId, context.orderId)) return;
        const status = statusOf(error);
        if (status === 401 || status === 403) {
          state = { ...initialCustomerOrderReviewState };
          write(state);
          deps.onAccessDenied();
          return;
        }
        publish({
          busy: false,
          error:
            'Chưa kiểm tra được đánh giá hiện có nên chưa gửi đánh giá mới.',
        });
        return;
      }

      if (!stillCurrent(context.customerId, context.orderId)) return;
      if (existing) {
        publish({
          busy: false,
          review: existing,
          error: null,
          needsVerify: false,
        });
        return;
      }

      const body = {
        rating: state.rating,
        ...(state.comment.trim()
          ? { comment: state.comment.trim() }
          : {}),
      };

      try {
        await deps.submitReview(context.orderId, body);
      } catch (error) {
        if (!stillCurrent(context.customerId, context.orderId)) return;

        if (isDefinitiveReviewRejection(error)) {
          const status = statusOf(error);
          if (status === 401 || status === 403) {
            state = { ...initialCustomerOrderReviewState };
            write(state);
            deps.onAccessDenied();
            return;
          }

          // 409 can mean another review already exists; GET is authoritative.
          const review = await readReview(
            context.customerId,
            context.orderId,
          );
          if (!stillCurrent(context.customerId, context.orderId)) return;
          if (review) {
            publish({
              busy: false,
              review,
              needsVerify: false,
              error: null,
            });
            return;
          }

          publish({
            busy: false,
            needsVerify: false,
            error:
              'Backend đã từ chối đánh giá' +
              (typeof status === 'number'
                ? ' (mã ' + status + ')'
                : '') +
              '. Hãy kiểm tra lại đơn.',
          });
          return;
        }

        // Timeout/offline/5xx: POST may have committed. Lock against repost
        // and reconcile only by GET review.
        publish({
          busy: true,
          needsVerify: true,
          error: null,
        });
        const review = await readReview(
          context.customerId,
          context.orderId,
        );
        if (!stillCurrent(context.customerId, context.orderId)) return;
        if (review) {
          publish({
            busy: false,
            review,
            needsVerify: false,
            error: null,
          });
        } else {
          publish({
            busy: false,
            needsVerify: true,
            error:
              'Kết quả gửi đánh giá chưa xác định. Không gửi POST lại; hãy kiểm tra đánh giá bằng GET.',
          });
        }
        return;
      }

      if (!stillCurrent(context.customerId, context.orderId)) return;

      // A successful POST still requires the canonical GET readback.
      publish({
        busy: true,
        needsVerify: true,
        error: null,
      });
      const review = await readReview(
        context.customerId,
        context.orderId,
      );
      if (!stillCurrent(context.customerId, context.orderId)) return;

      if (review) {
        publish({
          busy: false,
          review,
          needsVerify: false,
          error: null,
        });
        deps.notify(
          'Đã gửi đánh giá',
          'Backend đã xác nhận đánh giá cho đúng ServiceOrder.',
        );
      } else {
        publish({
          busy: false,
          needsVerify: true,
          error:
            'POST đã phản hồi nhưng GET chưa xác nhận đánh giá. Không gửi POST lại.',
        });
      }
    } finally {
      submitting = false;
      if (
        state.busy &&
        deps.getCustomerId() === context.customerId
      ) {
        publish({ busy: false });
      }
    }
  }

  function reset() {
    state = { ...initialCustomerOrderReviewState };
    write(state);
  }

  return {
    load,
    setRating,
    setComment,
    submit,
    reconcile,
    reset,
  };
}
