/**
 * Pure display helper for the Customer order-detail top summary.
 *
 * Maps already-decided facts (canonical status + existing eligibility outcomes)
 * into user-facing Vietnamese copy. It never decides eligibility itself and
 * never triggers network or state changes.
 */
export type OrderNextActionKind =
  | 'track'
  | 'decide_quote'
  | 'decide_cost'
  | 'confirm_completion'
  | 'pay'
  | 'review'
  | 'none';

export interface OrderNextActionInput {
  status: string;
  quoteAwaitingDecision: boolean;
  additionalCostPending: boolean;
  completionRequested: boolean;
  paymentPending: boolean;
  reviewable: boolean;
}

export interface OrderNextAction {
  statusLabel: string;
  title: string;
  detail: string;
  kind: OrderNextActionKind;
}

export function orderStatusLabel(status: string): string {
  switch (String(status).toUpperCase()) {
    case 'ACCEPTED':
      return 'Đã nhận đơn';
    case 'EN_ROUTE':
      return 'Đang di chuyển';
    case 'UNDER_REPAIR':
    case 'IN_PROGRESS':
      return 'Đang sửa chữa';
    case 'COMPLETED':
      return 'Hoàn thành';
    case 'CANCELLED':
      return 'Đã hủy';
    default:
      return 'Đang xử lý';
  }
}

export function orderNextAction(input: OrderNextActionInput): OrderNextAction {
  const status = String(input.status).toUpperCase();
  const statusLabel = orderStatusLabel(status);

  if (status === 'CANCELLED') {
    return {
      statusLabel,
      title: 'Đơn đã hủy',
      detail: 'Đơn sửa chữa này đã kết thúc. Bạn có thể đặt lịch mới khi cần.',
      kind: 'none',
    };
  }
  if (status === 'COMPLETED' && input.reviewable) {
    return {
      statusLabel,
      title: 'Hãy đánh giá dịch vụ',
      detail: 'Đơn đã hoàn thành. Bạn hãy gửi đánh giá ở mục “Đánh giá dịch vụ” bên dưới.',
      kind: 'review',
    };
  }
  if (status === 'COMPLETED') {
    return {
      statusLabel,
      title: 'Đơn đã hoàn thành',
      detail: 'Cảm ơn bạn đã dùng FixHome. Bạn không cần làm gì thêm.',
      kind: 'none',
    };
  }
  if (input.paymentPending) {
    return {
      statusLabel: 'Chờ thanh toán',
      title: 'Bạn cần thanh toán',
      detail: 'Công việc đã được nghiệm thu. Bạn hãy hoàn tất thanh toán ở mục “Thanh toán” bên dưới.',
      kind: 'pay',
    };
  }
  if (input.completionRequested) {
    return {
      statusLabel: 'Chờ nghiệm thu',
      title: 'Hãy nghiệm thu công việc',
      detail: 'Kỹ thuật viên báo đã xong việc. Bạn hãy kiểm tra và xác nhận ở mục nghiệm thu bên dưới.',
      kind: 'confirm_completion',
    };
  }
  if (input.additionalCostPending) {
    return {
      statusLabel,
      title: 'Hãy duyệt chi phí phát sinh',
      detail: 'Có chi phí phát sinh đang chờ bạn duyệt. Bạn hãy phản hồi ở mục “Chi phí phát sinh” bên dưới.',
      kind: 'decide_cost',
    };
  }
  if (input.quoteAwaitingDecision) {
    return {
      statusLabel,
      title: 'Hãy duyệt báo giá',
      detail: 'Báo giá đang chờ quyết định của bạn. Bạn hãy duyệt hoặc từ chối ở mục “Báo giá” bên dưới.',
      kind: 'decide_quote',
    };
  }
  if (status === 'UNDER_REPAIR' || status === 'IN_PROGRESS') {
    return {
      statusLabel,
      title: 'Đang sửa chữa',
      detail: 'Kỹ thuật viên đang thực hiện công việc. Bạn không cần làm gì lúc này.',
      kind: 'track',
    };
  }
  if (status === 'EN_ROUTE') {
    return {
      statusLabel,
      title: 'Đang di chuyển',
      detail: 'Kỹ thuật viên đang trên đường đến địa chỉ của bạn. Bạn không cần làm gì lúc này.',
      kind: 'track',
    };
  }
  if (status === 'ACCEPTED') {
    return {
      statusLabel,
      title: 'Đã nhận đơn',
      detail: 'Kỹ thuật viên đã nhận đơn và sẽ sớm di chuyển. Bạn không cần làm gì lúc này.',
      kind: 'track',
    };
  }
  return {
    statusLabel,
    title: 'Đang xử lý yêu cầu',
    detail: 'Bạn hãy làm mới để xem trạng thái mới nhất.',
    kind: 'track',
  };
}

const KNOWN_TIMELINE_TITLES: Record<string, string> = {
  'Technician accepted invitation': 'Kỹ thuật viên đã nhận lời mời',
  'Technician en route': 'Kỹ thuật viên đang di chuyển',
  'Technician checked in': 'Kỹ thuật viên đã đến nơi',
  'Repair started': 'Đã bắt đầu sửa chữa',
  'Repair completed': 'Đã sửa chữa xong',
  'Customer confirmed completion': 'Bạn đã nghiệm thu công việc',
  'Quotation sent': 'Đã gửi báo giá',
  'Quotation approved': 'Bạn đã duyệt báo giá',
  'Quotation rejected': 'Bạn đã từ chối báo giá',
  'Payment verified': 'Đã xác minh thanh toán',
  'Order cancelled': 'Đơn đã hủy',
  'Order completed': 'Đơn đã hoàn thành',
};

/**
 * Translates a known server timeline label into Vietnamese display copy.
 * Unknown labels fall back to the raw title, then a status-based label,
 * so no timeline row ever renders empty.
 */
export function timelineEntryLabel(
  title: string | null | undefined,
  status: string,
): string {
  const raw = (title ?? '').trim();
  if (raw && KNOWN_TIMELINE_TITLES[raw]) return KNOWN_TIMELINE_TITLES[raw];
  if (raw) {
    const lower = raw.toLowerCase();
    const partial = Object.keys(KNOWN_TIMELINE_TITLES).find((key) =>
      lower.includes(key.toLowerCase()),
    );
    if (partial) return KNOWN_TIMELINE_TITLES[partial];
    return raw;
  }
  return orderStatusLabel(status);
}
