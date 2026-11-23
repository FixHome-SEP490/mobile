// Copy for the "no technician" state of the matching screen; mirrors web BookingCandidatesPage so both apps say the same thing.
import type { CandidateEmptyReason } from '../../api/bookings.api';

export type MatchingEmptyAction = 'detail' | 'rebook';

export interface MatchingEmptyView {
  title: string;
  description: string;
  /** Label of the main button. */
  action: string;
  actionKind: MatchingEmptyAction;
  /** Only for an address outside the service area: the way back to the existing request. */
  secondaryAction?: string;
}

export function matchingEmptyView(reason: CandidateEmptyReason | null, isVisit: boolean): MatchingEmptyView {
  const request = isVisit ? 'lượt sửa' : 'yêu cầu';
  const Request = isVisit ? 'Lượt sửa' : 'Yêu cầu';
  const view = `Xem ${request}`;
  switch (reason) {
    case 'OUTSIDE_COVERAGE':
      return {
        title: 'Địa chỉ nằm ngoài khu vực phục vụ',
        description: `FixHome chưa có kỹ thuật viên phục vụ tại địa chỉ đã đặt. Bạn có thể đặt lại ${request} này với một địa chỉ khác.`,
        action: 'Đặt lại với địa chỉ khác',
        actionKind: 'rebook',
        secondaryAction: view,
      };
    case 'BOOKING_LOCATION_MISSING':
      return {
        title: 'Chưa xác định được vị trí đặt lịch',
        description: `${Request} chưa có vị trí chính xác đã xác nhận. Vui lòng kiểm tra lại địa chỉ và đặt lại với vị trí đầy đủ.`,
        action: view,
        actionKind: 'detail',
      };
    case 'TIME_UNAVAILABLE':
      return {
        title: 'Chưa có thợ rảnh trong giờ hẹn này',
        description: 'Các thợ phù hợp với địa chỉ đều bận hoặc không làm việc trong giờ hẹn đã chọn. Hãy xem lại lịch hẹn.',
        action: 'Xem lịch hẹn',
        actionKind: 'detail',
      };
    default:
      return {
        title: 'Chưa có kỹ thuật viên phù hợp',
        description: isVisit
          ? 'Hiện chưa tìm được thợ nhận sửa được mọi máy trong lượt này. Bạn có thể kiểm tra lại địa chỉ, các máy và thời gian.'
          : 'Hiện chưa tìm được thợ đáp ứng đầy đủ điều kiện của yêu cầu này. Bạn có thể kiểm tra lại địa chỉ, dịch vụ và thời gian.',
        action: view,
        actionKind: 'detail',
      };
  }
}
