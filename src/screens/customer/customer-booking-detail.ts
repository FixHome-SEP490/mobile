import type { BookingItem } from '../../api/bookings.api';
import { orderDetailTarget } from './customer-order-detail';

interface BookingDetailSession {
  getUserId: () => string | null;
  subscribe: (listener: () => void) => () => void;
}

export interface BookingDetailState {
  booking: BookingItem | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
}

export const initialBookingDetailState: BookingDetailState = {
  booking: null,
  loading: true,
  refreshing: false,
  error: null,
};

const BOOKING_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const deniedMessage = 'Bạn không có quyền xem yêu cầu đặt lịch này.';
const notFoundMessage = 'Không tìm thấy yêu cầu đặt lịch hoặc bạn không có quyền xem.';
const invalidIdMessage = 'Mã yêu cầu đặt lịch không hợp lệ.';

function statusOf(error: unknown): number | undefined {
  return (error as { response?: { status?: number } } | null)?.response?.status;
}

export function bookingDetailTarget(bookingId: unknown): string | null {
  return typeof bookingId === 'string' && BOOKING_UUID.test(bookingId) ? bookingId : null;
}

export function bookingStatusLabel(status: unknown): string {
  switch (String(status).toUpperCase()) {
    case 'SUBMITTED':
      return 'Đã gửi yêu cầu';
    case 'MATCHING':
      return 'Đang tìm kỹ thuật viên';
    case 'MATCHED':
      return 'Đã ghép kỹ thuật viên';
    case 'CONFIRMED':
      return 'Đã xác nhận';
    case 'CLOSED':
      return 'Vòng tìm kỹ thuật viên đã kết thúc';
    case 'CANCELLED':
      return 'Đã hủy';
    default:
      return 'Đang xử lý';
  }
}

export type BookingNextActionKind = 'choose_technician' | 'open_order' | 'wait' | 'none';

export interface BookingNextAction {
  kind: BookingNextActionKind;
  title: string;
  detail: string;
  primaryLabel: string | null;
  serviceOrderId: string | null;
}

export function bookingNextAction(booking: BookingItem): BookingNextAction {
  const status = String(booking.status).toUpperCase();
  const serviceOrderId = orderDetailTarget(booking.serviceOrderId);

  if (status === 'CLOSED') {
    return {
      kind: 'choose_technician',
      title: 'Chọn lại kỹ thuật viên',
      detail: 'Vòng mời trước đã kết thúc. Bạn có thể chọn lại kỹ thuật viên; hệ thống sẽ kiểm tra điều kiện mới nhất trước khi gửi lời mời.',
      primaryLabel: 'Chọn lại kỹ thuật viên',
      serviceOrderId,
    };
  }

  if (serviceOrderId) {
    return {
      kind: 'open_order',
      title: 'Đơn sửa chữa đã được tạo',
      detail: 'Yêu cầu đặt lịch đã chuyển sang đơn sửa chữa. Mở đơn để xem kỹ thuật viên, tiến độ và việc bạn cần làm tiếp theo.',
      primaryLabel: 'Xem đơn sửa chữa',
      serviceOrderId,
    };
  }

  if (status === 'SUBMITTED') {
    return {
      kind: 'choose_technician',
      title: 'Chọn kỹ thuật viên',
      detail: 'Yêu cầu đã được ghi nhận. Hãy chọn 1 hoặc 2 kỹ thuật viên theo thứ tự ưu tiên để tiếp tục.',
      primaryLabel: 'Chọn kỹ thuật viên',
      serviceOrderId: null,
    };
  }

  if (status === 'MATCHING') {
    return {
      kind: 'wait',
      title: 'Đang chờ kỹ thuật viên phản hồi',
      detail: 'Lời mời đang được xử lý theo thứ tự ưu tiên. Bạn không cần gửi lại yêu cầu; kéo xuống để làm mới khi cần.',
      primaryLabel: null,
      serviceOrderId: null,
    };
  }

  if (status === 'MATCHED' || status === 'CONFIRMED') {
    return {
      kind: 'wait',
      title: 'Đang hoàn tất ghép kỹ thuật viên',
      detail: 'Hệ thống đang hoàn tất liên kết đơn sửa chữa. Làm mới để xem trạng thái mới nhất.',
      primaryLabel: null,
      serviceOrderId: null,
    };
  }

  if (status === 'CANCELLED') {
    return {
      kind: 'none',
      title: 'Yêu cầu đã hủy',
      detail: 'Yêu cầu đặt lịch này đã kết thúc. Bạn có thể tạo yêu cầu mới khi cần.',
      primaryLabel: null,
      serviceOrderId: null,
    };
  }

  return {
    kind: 'wait',
    title: 'Đang xử lý yêu cầu',
    detail: 'Làm mới để xem trạng thái mới nhất.',
    primaryLabel: null,
    serviceOrderId: null,
  };
}

export function createBookingDetailLoader(
  getBooking: (id: string) => Promise<BookingItem>,
  write: (state: BookingDetailState) => void,
  session: BookingDetailSession,
) {
  let state = initialBookingDetailState;
  let active = false;
  let ownerId: string | null = null;
  let bookingId: string | null = null;
  let requestGeneration = 0;
  let loaded = false;
  let inFlight: Promise<void> | null = null;
  let unsubscribe: (() => void) | undefined;

  const authorized = () => ownerId !== null && session.getUserId() === ownerId;
  const publish = (patch: Partial<BookingDetailState>) => {
    state = { ...state, ...patch };
    if (active) write(state);
  };
  const invalidate = () => {
    ++requestGeneration;
    inFlight = null;
  };
  const clearWith = (message: string) => {
    invalidate();
    loaded = false;
    publish({ ...initialBookingDetailState, loading: false, error: message });
  };
  const denyAccess = () => clearWith(deniedMessage);

  function refresh(force = false): Promise<void> {
    if (!active || !authorized() || !bookingId) return Promise.resolve();
    const target = bookingDetailTarget(bookingId);
    if (!target) {
      clearWith(invalidIdMessage);
      return Promise.resolve();
    }
    if (inFlight && !force) return inFlight;

    const generation = ++requestGeneration;
    const valid = () => active && authorized() && generation === requestGeneration;
    publish({ loading: !loaded, refreshing: loaded, error: null });

    const request = (async () => {
      try {
        const fetched = await getBooking(target);
        if (!valid()) return;
        if (!fetched || fetched.id !== target || fetched.customerId !== ownerId) {
          clearWith(notFoundMessage);
          return;
        }
        loaded = true;
        publish({ booking: fetched, error: null });
      } catch (error) {
        if (!valid()) return;
        const status = statusOf(error);
        if (status === 401 || status === 403) {
          denyAccess();
          return;
        }
        if (status === 400) {
          clearWith(invalidIdMessage);
          return;
        }
        if (status === 404) {
          clearWith(notFoundMessage);
          return;
        }
        publish({ error: 'Không thể tải chi tiết yêu cầu đặt lịch. Vui lòng thử lại.' });
      } finally {
        if (valid()) publish({ loading: false, refreshing: false });
      }
    })();

    inFlight = request;
    void request.then(() => {
      if (valid()) inFlight = null;
    });
    return request;
  }

  function blur() {
    active = false;
    invalidate();
    unsubscribe?.();
    unsubscribe = undefined;
  }

  return {
    refresh,
    blur,
    focus(id: string) {
      blur();
      const nextOwner = session.getUserId();
      if (nextOwner !== ownerId || id !== bookingId) {
        state = initialBookingDetailState;
        loaded = false;
      }
      ownerId = nextOwner;
      bookingId = id;
      active = true;
      unsubscribe = session.subscribe(() => {
        if (session.getUserId() === ownerId) return;
        ownerId = null;
        denyAccess();
      });
      if (!authorized()) {
        denyAccess();
        return Promise.resolve();
      }
      return refresh();
    },
  };
}
