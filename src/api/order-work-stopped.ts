// What the customer reads when the technician stopped the work on site (web order-work-stopped.ts + stopped-work-finance.api.ts).
// The order keeps its EN_ROUTE / UNDER_REPAIR status; only these fields say the work ended and the money is under review.

export interface FailedWorkFinance {
  version: 1;
  state: 'VERIFIED_WORK_STOPPED_UNBILLED' | 'FINANCIAL_REVIEW_REQUIRED';
  customerPayableVnd: null;
  newCollectionAllowed: false;
  historicalQuoteOnly: true;
  reviewRequired: true;
  refundState: 'NOT_DETERMINED';
  message: string;
}

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Strict like web: anything that is not exactly the documented shape is refused, never shown as a guess. */
export function readFailedWorkFinance(value: unknown): FailedWorkFinance {
  if (!record(value) || value.version !== 1 || !['VERIFIED_WORK_STOPPED_UNBILLED', 'FINANCIAL_REVIEW_REQUIRED'].includes(String(value.state))
    || value.customerPayableVnd !== null || value.newCollectionAllowed !== false || value.historicalQuoteOnly !== true
    || value.reviewRequired !== true || value.refundState !== 'NOT_DETERMINED' || typeof value.message !== 'string') {
    throw new Error('Chưa đọc được thông tin đối soát công việc gián đoạn.');
  }
  return {
    version: 1, state: value.state as FailedWorkFinance['state'], customerPayableVnd: null, newCollectionAllowed: false,
    historicalQuoteOnly: true, reviewRequired: true, refundState: 'NOT_DETERMINED', message: value.message,
  };
}

/** Same words as web `isOrderWorkStopped`: the work was stopped and the technician released, though the status is kept. */
export function isOrderWorkStopped(order: { workStopped?: boolean; operationalDisposition?: string | null } | null | undefined): boolean {
  return !!order && (order.workStopped === true || order.operationalDisposition === 'STOPPED');
}

/** The order is under money review: stopped work, or Backend sent the finance block. */
export const isOldFinanceReview = (order: { workStopped?: boolean; operationalDisposition?: string | null; failedWorkFinance?: unknown } | null | undefined): boolean =>
  isOrderWorkStopped(order) || !!order?.failedWorkFinance;

export const STOPPED_WORK_TITLE = 'Đã dừng công việc';
export const STOPPED_WORK_MESSAGE = 'Công việc đã dừng, phân công kỹ thuật viên đã được nhả. Trạng thái đơn cũ được giữ để xem lịch sử.';
export const STOPPED_FINANCE_TITLE = 'Báo giá cũ chỉ lưu để xem lịch sử, không phải yêu cầu thanh toán cho công việc đã dừng.';
export const STOPPED_FINANCE_NOTE = 'FixHome đang đối soát nghĩa vụ cũ. Đặt lịch mới độc lập với việc đối soát và nhận linh kiện cũ.';
