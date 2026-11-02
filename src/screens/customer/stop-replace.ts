// The customer's request to stop the repair or change the technician (web #183, backend #168), kept apart from the
// sheet so it is tested on its own. It is only a request: the server holds completion and a manager decides.

import type { MySupportCase, SupportCaseStatus } from '../../api/support-cases.api';

export const STOP_REASON_MIN = 10;
export const STOP_REASON_MAX = 2000;

/** Only while the repair is under way and the technician has not yet asked to hand over. */
export function canRequestStopReplace(order: { status?: string | null; completionRequestedAt?: string | null } | null | undefined): boolean {
  return String(order?.status ?? '').toUpperCase() === 'UNDER_REPAIR' && !order?.completionRequestedAt;
}

/** The customer's own request for this order, newest first as the server lists them. */
export function findStopRequest(cases: MySupportCase[], orderId: string): MySupportCase | null {
  return cases.find((item) => item.requestIntent === 'stop_or_replace' && item.serviceOrderId === orderId) ?? null;
}

export const isActiveStopRequest = (item: MySupportCase | null): boolean => item?.status === 'open' || item?.status === 'in_review';

const STATUS_TEXT: Record<SupportCaseStatus, string> = {
  open: 'Đã gửi yêu cầu',
  in_review: 'Quản lý đang xem xét',
  resolved: 'Quản lý đã xử lý yêu cầu',
  rejected: 'Yêu cầu không được chấp nhận',
};
export const stopRequestStatusText = (item: MySupportCase | null): string => (item ? STATUS_TEXT[item.status] : '');

/** Null when the reason can go, otherwise what to tell the customer. */
export function stopReasonProblem(reason: string): string | null {
  const length = reason.trim().length;
  if (length < STOP_REASON_MIN) return `Hãy ghi lý do ít nhất ${STOP_REASON_MIN} ký tự.`;
  if (length > STOP_REASON_MAX) return `Lý do tối đa ${STOP_REASON_MAX.toLocaleString('vi-VN')} ký tự.`;
  return null;
}

/** A refusal the server gave on purpose (4xx): the request was not recorded, so nothing needs checking. A timeout or lost answer is not one. */
export function isDefiniteRefusal(error: unknown): boolean {
  const status = (error as { response?: { status?: number } } | null)?.response?.status;
  return status !== undefined && status >= 400 && status < 500 && status !== 408;
}

export const STOP_REQUEST_NOTE = 'Đây là yêu cầu để quản lý xem xét. Đơn chưa bị hủy và chưa có cam kết về thợ mới; trong lúc chờ, kỹ thuật viên chưa thể bàn giao đơn.';
export const STOP_UNCLEAR = 'Chưa xác nhận được kết quả gửi yêu cầu. Hãy kiểm tra trạng thái trước khi gửi lại.';
