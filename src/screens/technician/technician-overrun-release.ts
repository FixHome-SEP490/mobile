import { isHistoricalOrder, type OverrunReleaseBlock, type OverrunReleaseStatus, type ServiceOrderItem, type TechnicianOrderItem } from '../../api/orders.api';
import { extractApiErrorMessage } from '../../utils/input-validation';

/** BE 20/10/2026: a technician still on another job may step off the next order without losing reputation points. */
const BLOCK_TEXT: Record<OverrunReleaseBlock, string> = {
  NOT_ASSIGNED: 'Bạn không còn được giao đơn này.',
  ORDER_NOT_WAITING: 'Đơn này không còn ở trạng thái chờ thực hiện.',
  ALREADY_ARRIVED: 'Bạn đã check-in tại nhà khách nên không thể nhả đơn.',
  NO_CURRENT_JOB: 'Bạn chưa có đơn nào đang làm dở.',
  NOT_STARTING_SOON: 'Đơn này chưa sắp tới giờ hẹn.',
};

export function overrunBlockText(block: OverrunReleaseBlock | null | undefined): string {
  return (block && BLOCK_TEXT[block]) || 'Đơn này chưa thể nhả.';
}

/** Only an active order still waiting for the technician can ever be released. */
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

export function releaseConfirmText(code: string, currentOrderCode: string | null): string {
  const reason = currentOrderCode ? `Bạn đang làm đơn #${currentOrderCode}. ` : '';
  return `${reason}Nhả đơn #${code} sẽ không bị trừ điểm uy tín. Khách sẽ được báo để chọn thợ khác, giá và lịch hẹn giữ nguyên.`;
}

export function releaseErrorText(err: unknown): string {
  const block = (err as { response?: { data?: { error?: { details?: { block?: OverrunReleaseBlock } } } } })
    ?.response?.data?.error?.details?.block;
  return block ? overrunBlockText(block) : extractApiErrorMessage(err, 'Không thể nhả đơn lúc này. Vui lòng thử lại.');
}
