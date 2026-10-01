// Pure status → display mapping (DS §8.2). Domain-specific: Service Order only.
import type { ToneName } from '../../constants/theme';

export type StatusIcon =
  | 'ClipboardCheck'
  | 'Navigation'
  | 'Wrench'
  | 'CheckCircle2'
  | 'XCircle'
  | 'HelpCircle'
  | 'AlertTriangle'
  | 'ArrowDown'
  | 'Minus'
  | 'Clock';

export type StatusView = { label: string; tone: ToneName; icon: StatusIcon };

const UNKNOWN: StatusView = { label: 'Trạng thái chưa xác định', tone: 'neutral', icon: 'HelpCircle' };

// IN_PROGRESS is a legacy alias already treated as UNDER_REPAIR by the Jobs filter.
// PENDING_CONFIRMATION is not a ServiceOrderStatus, so it stays "unknown" (DS §8.2).
const SERVICE_ORDER: Record<string, StatusView> = {
  ACCEPTED: { label: 'Đã nhận đơn', tone: 'violet', icon: 'ClipboardCheck' },
  EN_ROUTE: { label: 'Đang di chuyển', tone: 'warning', icon: 'Navigation' },
  UNDER_REPAIR: { label: 'Đang sửa chữa', tone: 'repair', icon: 'Wrench' },
  IN_PROGRESS: { label: 'Đang sửa chữa', tone: 'repair', icon: 'Wrench' },
  COMPLETED: { label: 'Hoàn thành', tone: 'success', icon: 'CheckCircle2' },
  CANCELLED: { label: 'Đã hủy', tone: 'neutral', icon: 'XCircle' },
};

export function serviceOrderStatusView(status: unknown): StatusView {
  return SERVICE_ORDER[String(status ?? '').toUpperCase()] ?? UNKNOWN;
}

const URGENCY: Record<string, StatusView> = {
  EMERGENCY: { label: 'Khẩn cấp', tone: 'danger', icon: 'AlertTriangle' },
  HIGH: { label: 'Cao', tone: 'warning', icon: 'AlertTriangle' },
  NORMAL: { label: 'Bình thường', tone: 'info', icon: 'Minus' },
  MEDIUM: { label: 'Bình thường', tone: 'info', icon: 'Minus' },
  LOW: { label: 'Thấp', tone: 'neutral', icon: 'ArrowDown' },
};

/** Unknown urgency keeps the server text (never a raw-enum-as-success guess). */
export function urgencyView(urgency: unknown): StatusView {
  const raw = String(urgency ?? '');
  return URGENCY[raw.toUpperCase()] ?? { label: raw || 'Chưa xác định', tone: 'neutral', icon: 'HelpCircle' };
}
