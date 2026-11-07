import type { TechnicianWarrantyClaim } from '../../../api/technician-warranty.api';

/** The same split as the web "Bảo hành" page of the technician. */
export type WarrantyGroupKey = 'todo' | 'waiting' | 'closed';
export type WarrantyFilter = 'all' | WarrantyGroupKey;
export type WarrantyTone = 'info' | 'warning' | 'repair' | 'success' | 'neutral';

export const warrantyGroupStatuses: Record<WarrantyGroupKey, string[]> = {
  todo: ['submitted', 'accepted', 'in_progress'],
  waiting: ['inspected', 'awaiting_customer', 'disputed'],
  closed: ['resolved', 'rejected'],
};
export const warrantyGroupTitles: Record<WarrantyGroupKey, string> = { todo: 'Cần xử lý', waiting: 'Đang chờ phản hồi', closed: 'Đã đóng' };
export const warrantyFilters: { key: WarrantyFilter; label: string }[] = [
  { key: 'all', label: 'Tất cả' }, { key: 'todo', label: warrantyGroupTitles.todo }, { key: 'waiting', label: warrantyGroupTitles.waiting }, { key: 'closed', label: warrantyGroupTitles.closed },
];

export function groupOfClaim(status: string): WarrantyGroupKey {
  return (Object.keys(warrantyGroupStatuses) as WarrantyGroupKey[]).find(key => warrantyGroupStatuses[key].includes(status)) ?? 'waiting';
}

/** The claims of one filter. "All" keeps the order of the groups (to do first), and the server order inside a group. */
export function claimsOfFilter<T extends { status: string }>(claims: T[], filter: WarrantyFilter): T[] {
  const keys: WarrantyGroupKey[] = filter === 'all' ? ['todo', 'waiting', 'closed'] : [filter];
  return keys.flatMap(key => claims.filter(claim => groupOfClaim(claim.status) === key));
}

export function filterCounts(claims: { status: string }[]): Record<WarrantyFilter, number> {
  return { all: claims.length, todo: claimsOfFilter(claims, 'todo').length, waiting: claimsOfFilter(claims, 'waiting').length, closed: claimsOfFilter(claims, 'closed').length };
}

/** A claim waiting for the technician to take it (the "invitation"). */
export const isWarrantyInvitation = (claim: { status: string }) => claim.status === 'submitted';

const claimStatus: Record<string, { label: string; tone: WarrantyTone }> = {
  submitted: { label: 'Đã gửi yêu cầu', tone: 'info' },
  accepted: { label: 'Kỹ thuật viên đã nhận', tone: 'info' },
  inspected: { label: 'Chờ quản lý dịch vụ duyệt', tone: 'warning' },
  in_progress: { label: 'Đang bảo hành', tone: 'repair' },
  awaiting_customer: { label: 'Chờ khách hàng phản hồi', tone: 'warning' },
  disputed: { label: 'Đang xem xét phản đối', tone: 'info' },
  resolved: { label: 'Đã hoàn tất bảo hành', tone: 'success' },
  rejected: { label: 'Không được bảo hành', tone: 'neutral' },
};
const technicianLabels: Record<string, { label: string; tone: WarrantyTone }> = {
  submitted: { label: 'Chờ bạn nhận', tone: 'warning' },
  accepted: { label: 'Bạn đã nhận', tone: 'info' },
  inspected: { label: 'Chờ quản lý duyệt', tone: 'warning' },
  awaiting_customer: { label: 'Chờ khách phản hồi', tone: 'warning' },
};

/** The status told from the technician's side: what the customer sees as "sent" is a claim waiting for the technician. */
export function technicianClaimLabel(claim: Pick<TechnicianWarrantyClaim, 'status' | 'customerResponse'>): { label: string; tone: WarrantyTone } {
  if (claim.status === 'awaiting_customer' && claim.customerResponse === 'agreed') return { label: 'Đã đồng ý, chờ quản lý dịch vụ đóng', tone: 'info' };
  return technicianLabels[claim.status] ?? claimStatus[claim.status] ?? { label: 'Trạng thái chưa xác định', tone: 'neutral' };
}

/** The next step of a claim, as the primary action of its row; `null` when the technician has nothing to do. */
export type WarrantyStep = 'accept' | 'check-in' | 'propose' | 'complete';
export function nextWarrantyStep(claim: Pick<TechnicianWarrantyClaim, 'status' | 'visit'>): { step: WarrantyStep; label: string } | null {
  if (claim.status === 'submitted') return { step: 'accept', label: 'Nhận yêu cầu' };
  if (claim.status === 'accepted') return claim.visit?.status === 'checked_in' ? { step: 'propose', label: 'Gửi kết luận kiểm tra' } : { step: 'check-in', label: 'Đã đến nơi' };
  if (claim.status === 'in_progress') return { step: 'complete', label: 'Báo đã bảo hành xong' };
  return null;
}
