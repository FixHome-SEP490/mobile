import type { ServiceOrderItem } from '../../api/orders.api';
import { quoteStatusLabel } from '../../utils/quote-status';
import { orderStatusLabel, timelineEntryLabel, type OrderNextActionKind } from './customer-order-next-action';

export type OrderDetailSection = 'overview' | 'technician' | 'quote' | 'cost' | 'evidence' | 'completion' | 'payment' | 'review' | 'warranty' | 'cancel' | 'support';
export type OrderMilestone = { key: string; label: string; detail: string; timestamp?: string; state: 'done' | 'current' | 'upcoming'; section: OrderDetailSection };
type TimelineOrder = { status: string; paymentStatus: string; quotation?: { status: string } } & Partial<Pick<ServiceOrderItem,
  'timeline' | 'arrivalVerified' | 'beforeEvidenceCount' | 'afterEvidenceCount' | 'completionRequestedAt' | 'customerConfirmed' | 'historical'>>;

export function actionDetailSection(kind: OrderNextActionKind): OrderDetailSection {
  switch (kind) {
    case 'decide_quote': return 'quote';
    case 'decide_cost': return 'cost';
    case 'confirm_completion': return 'completion';
    case 'pay': return 'payment';
    case 'review': return 'review';
    default: return 'overview';
  }
}

/** Selects one presentation section from current server facts and the existing eligible action. */
export function customerActiveOrderSection(order: TimelineOrder, action: OrderNextActionKind = 'none'): OrderDetailSection {
  if (action !== 'none' && action !== 'track') return actionDetailSection(action);
  const status = String(order.status).toUpperCase();
  if (status === 'CANCELLED') return 'cancel';
  if (status === 'COMPLETED') return 'review';
  if (status === 'ACCEPTED') return 'technician';
  if (status === 'EN_ROUTE') return order.arrivalVerified === true ? 'evidence' : 'technician';
  if (status === 'UNDER_REPAIR' || status === 'IN_PROGRESS') return 'evidence';
  return 'overview';
}

/** Display only: recorded facts never imply missing earlier steps or permission to mutate. */
export function customerOrderTimeline(order: TimelineOrder, action: OrderNextActionKind = 'none'): OrderMilestone[] {
  const status = String(order.status).toUpperCase();
  if (order.historical) return [{ key: 'historical', label: 'Lịch sử đơn', detail: 'Chỉ hiển thị dữ liệu lịch sử được hệ thống cung cấp.', state: 'done', section: 'overview' }];
  const events = (order.timeline ?? []).filter(event => Number.isFinite(Date.parse(event.timestamp)))
    .slice().sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  const steps: OrderMilestone[] = events.filter(event => String(event.status).toUpperCase() !== status).map((event, index) => ({
    key: `event-${index}`, label: timelineEntryLabel(event.title, event.status), timestamp: event.timestamp,
    detail: 'Sự kiện được ghi nhận trên hệ thống.', state: 'done', section: 'overview',
  }));
  const fact = (key: string, label: string, section: OrderDetailSection, detail: string, timestamp?: string) =>
    steps.push({ key, label, section, detail, timestamp, state: 'done' });
  if (order.arrivalVerified === true) fact('arrival', 'Đã xác nhận đến nơi', 'technician', 'Vị trí đến nơi đã được hệ thống xác nhận.');
  if (typeof order.beforeEvidenceCount === 'number' && order.beforeEvidenceCount > 0) fact('before-evidence', 'Ảnh trước sửa chữa', 'evidence', `${order.beforeEvidenceCount} ảnh được ghi nhận.`);
  if (order.quotation?.status) steps.push({ key: 'quotation', label: `Báo giá: ${quoteStatusLabel(order.quotation.status)}`, section: 'quote', detail: 'Trạng thái báo giá hiện tại từ hệ thống; duyệt báo giá không đồng nghĩa thanh toán.', state: String(order.quotation.status).toUpperCase() === 'SENT' ? 'current' : 'done' });
  if (typeof order.afterEvidenceCount === 'number' && order.afterEvidenceCount > 0) fact('after-evidence', 'Ảnh sau sửa chữa', 'evidence', `${order.afterEvidenceCount} ảnh được ghi nhận.`);
  if (order.completionRequestedAt && Number.isFinite(Date.parse(order.completionRequestedAt))) fact('completion-request', 'Kỹ thuật viên đề nghị hoàn tất', 'completion', 'Đề nghị hoàn tất đã được ghi nhận.', order.completionRequestedAt);
  if (order.customerConfirmed === true) fact('customer-confirmed', 'Khách hàng đã xác nhận công việc', 'completion', 'Xác nhận của khách hàng từ hệ thống.');
  if (order.paymentStatus === 'PAID') fact('payment', 'Đã thanh toán', 'payment', 'Thanh toán đã được hệ thống xác nhận.');
  const latestStatus = events.filter(event => String(event.status).toUpperCase() === status).at(-1);
  steps.push({ key: 'status', label: orderStatusLabel(status), detail: 'Trạng thái hiện tại của đơn trên hệ thống.', timestamp: latestStatus?.timestamp, state: status === 'COMPLETED' || status === 'CANCELLED' ? 'done' : 'current', section: status === 'CANCELLED' ? 'cancel' : 'overview' });
  if (status !== 'CANCELLED' && action !== 'none' && action !== 'track') {
    steps.push({ key: 'action', label: 'Bước cần bạn xử lý', detail: 'Mở chi tiết để kiểm tra trước khi xác nhận.', state: 'current', section: actionDetailSection(action) });
  } else if (status !== 'COMPLETED' && status !== 'CANCELLED') {
    steps.push({ key: 'next', label: 'Chờ cập nhật tiếp theo', detail: 'Tiến độ sẽ cập nhật theo dữ liệu hệ thống.', state: 'upcoming', section: 'overview' });
  }
  return steps;
}
