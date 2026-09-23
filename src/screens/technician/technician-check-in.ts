import { orderDetailTarget } from '../customer/customer-order-detail';

/**
 * P3B4 bounded technician foreground GPS check-in. Everything here runs only
 * after an explicit user tap on a real active EN_ROUTE job: OS permission is
 * requested on tap (never on focus), one fresh position is read, and the
 * existing check-in POST fires only with finite coordinates plus a genuine
 * OS-reported accuracy. HTTP 200 is NOT arrival — only a normalized `valid`
 * result counts; every other outcome shows an honest message and never marks
 * arrival or advances order state. No background tracking, watch, map, upload,
 * payment, or persisted coordinates live here.
 */

export type CheckInResult = 'valid' | 'low_accuracy' | 'out_of_geofence' | 'failed' | 'unknown';

export type PermissionDecision = 'granted' | 'denied' | 'unavailable';

export interface CheckInJobSnapshot {
  id: string;
  status: unknown;
  historical?: unknown;
}

export interface PositionReading {
  lat: unknown;
  lng: unknown;
  accuracy: unknown;
}

export interface CheckInCoords {
  lat: number;
  lng: number;
  accuracyMeters: number;
}

export interface CheckInDeps {
  getJob: (orderId: string) => CheckInJobSnapshot | null | undefined;
  getTechnicianId: () => string | null;
  /** Snapshot the current focus generation; stale taps must never POST/notify. */
  captureFocus: () => () => boolean;
  requestPermission: () => Promise<PermissionDecision>;
  getPosition: () => Promise<PositionReading>;
  postCheckIn: (orderId: string, coords: CheckInCoords) => Promise<unknown>;
  notify: (title: string, message: string) => void;
  /** GET-only reconciliation after a verified arrival, ambiguous POST, or 404. */
  refreshJobs: () => Promise<void>;
  /** Account purge path (loader re-GET denies and clears account state). */
  onAccessDenied: () => void;
  /** Independent UI busy flag; cleared whenever the attempt settles. */
  setBusy: (orderId: string | null) => void;
}

function statusOf(error: unknown): number | undefined {
  return (error as { response?: { status?: number } } | null)?.response?.status;
}

/** Case-insensitive result; tolerates a `{data}` envelope. Unknown never succeeds. */
export function normalizeCheckInResult(response: unknown): CheckInResult {
  const body =
    response !== null && typeof response === 'object' && 'data' in response
      && (response as { data?: unknown }).data !== null
      && typeof (response as { data?: unknown }).data === 'object'
      ? (response as { data: unknown }).data
      : response;
  const raw =
    body !== null && typeof body === 'object'
      ? String((body as Record<string, unknown>).result ?? '').toLowerCase()
      : '';
  return raw === 'valid' || raw === 'low_accuracy' || raw === 'out_of_geofence' || raw === 'failed'
    ? raw
    : 'unknown';
}

/** Server-derived distance only: finite, nonnegative, rounded. Never computed locally. */
export function serverDistanceText(response: unknown): string | null {
  const body =
    response !== null && typeof response === 'object' && 'data' in response
      ? (response as { data?: unknown }).data
      : response;
  const distance =
    body !== null && typeof body === 'object'
      ? (body as Record<string, unknown>).distanceMeters
      : undefined;
  return typeof distance === 'number' && Number.isFinite(distance) && distance >= 0
    ? ` Khoảng cách hiện tại khoảng ${Math.round(distance)} m (do máy chủ tính).`
    : null;
}

/**
 * Finite coordinates plus a genuine OS-reported accuracy. Missing/null/NaN
 * accuracy is rejected — never defaulted to 0, which would fake precision.
 */
export function toCheckInCoords(reading: PositionReading): CheckInCoords | null {
  const { lat, lng, accuracy } = reading;
  if (typeof lat !== 'number' || !Number.isFinite(lat)) return null;
  if (typeof lng !== 'number' || !Number.isFinite(lng)) return null;
  if (typeof accuracy !== 'number' || !Number.isFinite(accuracy) || accuracy < 0) return null;
  return { lat, lng, accuracyMeters: accuracy };
}

export function createCheckInController(deps: CheckInDeps) {
  let pending: string | null = null;

  const isActiveJob = (job: CheckInJobSnapshot | null | undefined): job is CheckInJobSnapshot =>
    !!job && (job as { historical?: unknown }).historical !== true;

  async function checkIn(orderId: string): Promise<void> {
    if (pending) return;
    const target = orderDetailTarget(orderId);
    if (!target) {
      deps.notify('Mã đơn không hợp lệ.', 'Không thể check-in với mã đơn này.');
      return;
    }
    const technicianId = deps.getTechnicianId();
    if (!technicianId) return;
    const isCurrent = deps.captureFocus();
    if (!isCurrent()) return;
    const job = deps.getJob(target);
    if (!isActiveJob(job)) {
      deps.notify('Không thể check-in.', 'Đơn lưu trữ không thể check-in.');
      return;
    }
    if (String(job.status).toUpperCase() !== 'EN_ROUTE') {
      deps.notify('Không thể check-in.', 'Đơn chưa ở trạng thái di chuyển nên không thể check-in.');
      return;
    }
    pending = target;
    deps.setBusy(target);
    const sameSession = () => isCurrent() && deps.getTechnicianId() === technicianId;
    try {
      let permission: PermissionDecision;
      try {
        permission = await deps.requestPermission();
      } catch {
        permission = 'unavailable';
      }
      if (!sameSession()) return;
      if (permission === 'denied') {
        deps.notify('Cần quyền vị trí', 'Hãy cấp quyền vị trí khi dùng ứng dụng trong Cài đặt rồi quay lại thử check-in.');
        return;
      }
      if (permission === 'unavailable') {
        deps.notify('Không lấy được vị trí', 'Hãy bật dịch vụ định vị (GPS) rồi thử lại.');
        return;
      }
      // Re-confirm the same active assignment after the permission gap.
      const fresh = deps.getJob(target);
      if (!isActiveJob(fresh) || String(fresh.status).toUpperCase() !== 'EN_ROUTE') {
        deps.notify('Đơn đã thay đổi', 'Trạng thái đơn đã thay đổi. Vui lòng làm mới danh sách rồi thử lại.');
        return;
      }
      let reading: PositionReading;
      try {
        reading = await deps.getPosition();
      } catch {
        deps.notify('Không lấy được vị trí', 'Hãy bật dịch vụ định vị (GPS) rồi thử lại.');
        return;
      }
      if (!sameSession()) return;
      const coords = toCheckInCoords(reading);
      if (!coords) {
        deps.notify('Tọa độ chưa hợp lệ', 'Không đọc được tọa độ GPS hợp lệ. Hãy ra nơi thoáng và thử lại.');
        return;
      }
      let response: unknown;
      try {
        response = await deps.postCheckIn(target, coords);
      } catch (error) {
        if (!sameSession()) return;
        const status = statusOf(error);
        if (status === 401 || status === 403) {
          deps.onAccessDenied();
          deps.notify('Phiên đăng nhập đã hết', 'Vui lòng đăng nhập lại để tiếp tục check-in.');
          return;
        }
        if (status === 404) {
          deps.notify('Không tìm thấy đơn', 'Đơn có thể đã bị xóa hoặc bạn không còn quyền. Vui lòng làm mới danh sách.');
          await deps.refreshJobs();
          return;
        }
        // Ambiguous POST (timeout/offline/5xx/lost response): never repost.
        deps.notify(
          'Chưa xác nhận check-in',
          'Không rõ yêu cầu đã được xử lý hay chưa. Vui lòng làm mới và kiểm tra trạng thái trước khi thử lại; không bấm liên tiếp.',
        );
        await deps.refreshJobs();
        return;
      }
      if (!sameSession()) return;
      const result = normalizeCheckInResult(response);
      switch (result) {
        case 'valid':
          deps.notify('Đã check-in', 'Đã xác minh bạn đã đến địa chỉ sửa chữa. Danh sách sẽ được làm mới để hiển thị trạng thái thực tế.');
          await deps.refreshJobs();
          break;
        case 'low_accuracy':
          deps.notify('Vị trí chưa đủ chính xác', 'Hệ thống chưa thể xác minh bạn đã đến. Hãy ra nơi thoáng, bật GPS chính xác cao rồi thử lại.');
          break;
        case 'out_of_geofence':
          deps.notify(
            'Ngoài khu vực',
            `Bạn chưa ở trong khu vực địa chỉ sửa chữa.${serverDistanceText(response) ?? ''}`,
          );
          break;
        case 'failed':
          deps.notify('Check-in thất bại', 'Không thể xác minh vị trí. Vui lòng thử lại khi đã đến địa chỉ sửa chữa.');
          break;
        default:
          deps.notify('Kết quả chưa rõ', 'Máy chủ trả kết quả chưa xác định. Chưa ghi nhận đã đến — vui lòng làm mới và kiểm tra trạng thái trước khi thử lại.');
          break;
      }
    } finally {
      pending = null;
      deps.setBusy(null);
    }
  }

  return { checkIn };
}
