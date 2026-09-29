import {
  orderNextAction,
  orderNextActionButtonLabel,
  orderStatusLabel,
  timelineEntryLabel,
} from './customer-order-next-action';

describe('orderStatusLabel', () => {
  it.each([
    ['ACCEPTED', 'Đã nhận đơn'],
    ['EN_ROUTE', 'Đang di chuyển'],
    ['UNDER_REPAIR', 'Đang sửa chữa'],
    ['COMPLETED', 'Hoàn thành'],
    ['CANCELLED', 'Đã hủy'],
  ])('maps %s without raw enum text', (status, label) => {
    expect(orderStatusLabel(status)).toBe(label);
  });

  it('falls back to a neutral label for unknown status', () => {
    expect(orderStatusLabel('WHATEVER')).toBe('Đang xử lý');
  });
});

describe('orderNextAction', () => {
  const base = {
    status: 'EN_ROUTE',
    quoteAwaitingDecision: false,
    additionalCostPending: false,
    completionRequested: false,
    paymentPending: false,
    reviewable: false,
  };

  it('summarizes EN_ROUTE as no customer action', () => {
    const action = orderNextAction(base);
    expect(action).toEqual({
      statusLabel: 'Đang di chuyển',
      title: 'Đang di chuyển',
      detail: expect.stringContaining('không cần làm gì'),
      kind: 'track',
    });
  });

  it('summarizes ACCEPTED and UNDER_REPAIR without inventing actions', () => {
    expect(orderNextAction({ ...base, status: 'ACCEPTED' }).title).toBe('Đã nhận đơn');
    expect(orderNextAction({ ...base, status: 'UNDER_REPAIR' }).title).toBe('Đang sửa chữa');
  });

  it('prioritizes pending additional cost over the base status', () => {
    const action = orderNextAction({ ...base, status: 'UNDER_REPAIR', additionalCostPending: true });
    expect(action.kind).toBe('decide_cost');
    expect(action.title).toContain('chi phí phát sinh');
  });

  it('prioritizes completion request over repair status', () => {
    const action = orderNextAction({ ...base, status: 'UNDER_REPAIR', completionRequested: true });
    expect(action.kind).toBe('confirm_completion');
  });

  it('prioritizes payment over completion request', () => {
    const action = orderNextAction({
      ...base,
      status: 'UNDER_REPAIR',
      completionRequested: true,
      paymentPending: true,
    });
    expect(action.kind).toBe('pay');
  });

  it('asks for review only when a completed order is reviewable', () => {
    expect(
      orderNextAction({ ...base, status: 'COMPLETED', reviewable: true }).kind,
    ).toBe('review');
    expect(
      orderNextAction({ ...base, status: 'COMPLETED', reviewable: false }).kind,
    ).toBe('none');
  });

  it('summarizes cancelled orders as terminal', () => {
    const action = orderNextAction({ ...base, status: 'CANCELLED' });
    expect(action.kind).toBe('none');
    expect(action.title).toBe('Đơn đã hủy');
  });

  it('prioritizes awaiting quotation decision', () => {
    const action = orderNextAction({ ...base, status: 'EN_ROUTE', quoteAwaitingDecision: true });
    expect(action.kind).toBe('decide_quote');
  });
});

describe('orderNextActionButtonLabel', () => {
  it.each([
    ['decide_quote', 'Xem báo giá'],
    ['decide_cost', 'Xem chi phí phát sinh'],
    ['confirm_completion', 'Nghiệm thu công việc'],
    ['pay', 'Đi đến thanh toán'],
    ['review', 'Đánh giá dịch vụ'],
    ['track', null],
    ['none', null],
  ] as const)('maps %s to the action-first CTA', (kind, label) => {
    expect(orderNextActionButtonLabel(kind)).toBe(label);
  });
});

describe('timelineEntryLabel', () => {
  it('translates known English timeline titles', () => {
    expect(timelineEntryLabel('Technician accepted invitation', 'ACCEPTED')).toBe(
      'Kỹ thuật viên đã nhận lời mời',
    );
    expect(timelineEntryLabel('Technician en route', 'EN_ROUTE')).toBe(
      'Kỹ thuật viên đang di chuyển',
    );
  });

  it('keeps unknown titles instead of blanking the row', () => {
    expect(timelineEntryLabel('Một nhãn lạ', 'EN_ROUTE')).toBe('Một nhãn lạ');
  });

  it('falls back to the status label when the title is missing', () => {
    expect(timelineEntryLabel('', 'COMPLETED')).toBe('Hoàn thành');
    expect(timelineEntryLabel(null, 'EN_ROUTE')).toBe('Đang di chuyển');
  });
});
