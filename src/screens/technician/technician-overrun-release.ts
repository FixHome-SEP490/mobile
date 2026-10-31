import { isHistoricalOrder, type DelayReasonCode, type OverrunReleaseBlock, type OverrunReleaseStatus, type ServiceOrderItem, type TechnicianOrderItem } from '../../api/orders.api';
import { extractApiErrorMessage } from '../../utils/input-validation';

/** BE 20/10/2026, PO 31/10/2026: a technician still on another job tells the customer of the next order it will be late; the customer decides. */
const BLOCK_TEXT: Record<OverrunReleaseBlock, string> = {
  NOT_ASSIGNED: 'Bạn không còn được giao đơn này.',
  ORDER_NOT_WAITING: 'Đơn này không còn ở trạng thái chờ thực hiện.',
  ALREADY_ARRIVED: 'Bạn đã check-in tại nhà khách nên không thể báo trễ đơn này.',
  NO_CURRENT_JOB: 'Bạn chưa có đơn nào đang làm dở.',
  NOT_STARTING_SOON: 'Đơn này chưa sắp tới giờ hẹn.',
};

export function overrunBlockText(block: OverrunReleaseBlock | null | undefined): string {
  return (block && BLOCK_TEXT[block]) || 'Đơn này chưa thể báo trễ.';
}

/** Only an active order still waiting for the technician can be reported late. */
export function isReleaseCandidate(job: TechnicianOrderItem): job is ServiceOrderItem {
  return !isHistoricalOrder(job) && ['ACCEPTED', 'EN_ROUTE'].includes(String(job.status).toUpperCase());
}

export interface ReleasableJob {
  job: ServiceOrderItem;
  status: OverrunReleaseStatus;
}

export interface ReleasableResult {
  items: ReleasableJob[];
  /** Orders whose eligibility could not be read; shown honestly instead of as "not eligible". */
  failed: number;
}

export async function loadReleasable(
  jobs: readonly TechnicianOrderItem[],
  getStatus: (orderId: string) => Promise<OverrunReleaseStatus>,
): Promise<ReleasableResult> {
  const candidates = jobs.filter(isReleaseCandidate);
  const settled = await Promise.allSettled(candidates.map((job) => getStatus(job.id)));
  const items: ReleasableJob[] = [];
  let failed = 0;
  settled.forEach((result, index) => {
    if (result.status === 'rejected') failed += 1;
    else if (result.value.eligible) items.push({ job: candidates[index], status: result.value });
  });
  return { items, failed };
}

/** PO 31/10/2026: a report of a late or released next order needs these; Backend checks them again. */
export const DELAY_REASONS: { code: DelayReasonCode; label: string }[] = [
  { code: 'new_fault_found', label: 'Phát sinh lỗi thêm' },
  { code: 'waiting_parts', label: 'Chờ linh kiện' },
  { code: 'repair_longer', label: 'Sửa lâu hơn dự kiến' },
  { code: 'other', label: 'Lý do khác' },
];
export const DELAY_MINUTES = [30, 60, 90, 120] as const;
export const DELAY_PHOTO_MAX = 3;
export const DELAY_REASON_MIN = 10;
export const DELAY_REASON_MAX = 2000;

export interface DelayDraft {
  orderId: string | null;
  reasonCode: DelayReasonCode | null;
  reason: string;
  photoCount: number;
  confirmed: boolean;
  minutes: number | null;
}

export type DelayField = 'order' | 'reasonCode' | 'reason' | 'minutes' | 'photos' | 'confirm';

/** What is still missing from a delay report, per field and in Vietnamese, so each message sits next to the field it is about. Empty when complete. */
export function delayDraftErrors(draft: DelayDraft): Partial<Record<DelayField, string>> {
  const errors: Partial<Record<DelayField, string>> = {};
  const length = draft.reason.trim().length;
  if (!draft.orderId) errors.order = 'Chọn đơn kế tiếp.';
  if (!draft.reasonCode) errors.reasonCode = 'Chọn nhóm lý do.';
  if (length < DELAY_REASON_MIN || length > DELAY_REASON_MAX) errors.reason = `Mô tả từ ${DELAY_REASON_MIN} đến 2.000 ký tự.`;
  if (!(DELAY_MINUTES as readonly number[]).includes(draft.minutes ?? -1)) errors.minutes = 'Chọn số phút trễ dự kiến.';
  if (draft.photoCount < 1) errors.photos = 'Chụp ít nhất 1 ảnh bằng chứng của đơn đang sửa.';
  else if (draft.photoCount > DELAY_PHOTO_MAX) errors.photos = `Tối đa ${DELAY_PHOTO_MAX} ảnh.`;
  if (!draft.confirmed) errors.confirm = 'Hãy xác nhận thông tin là thật.';
  return errors;
}

export function delayReportErrorText(err: unknown): string {
  const block = (err as { response?: { data?: { error?: { details?: { block?: OverrunReleaseBlock } } } } })
    ?.response?.data?.error?.details?.block;
  return block ? overrunBlockText(block) : extractApiErrorMessage(err, 'Chưa gửi được báo trễ. Vui lòng thử lại.');
}
