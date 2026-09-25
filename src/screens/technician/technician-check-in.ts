import type { ServiceOrderItem } from '../../api/orders.api';
import { orderDetailTarget } from '../customer/customer-order-detail';

/**
 * Bounded technician foreground GPS check-in.
 *
 * A check-in POST never changes ServiceOrder.status: a valid arrival keeps the
 * order EN_ROUTE. The only UI proof of arrival is a fresh authorized
 * ServiceOrder GET with arrivalVerified === true for the same active
 * technician assignment.
 */
export type CheckInResult =
  | 'valid'
  | 'low_accuracy'
  | 'out_of_geofence'
  | 'failed'
  | 'unknown';

export type PermissionDecision = 'granted' | 'denied' | 'unavailable';

export type ArrivalVerificationState = 'clear' | 'pending' | 'verified';

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
  /** Authoritative active-assignment readback after a POST or on re-entry. */
  getOrderDetail: (orderId: string) => Promise<ServiceOrderItem>;
  notify: (title: string, message: string) => void;
  /** GET-only Jobs refresh after a settled attempt or access change. */
  refreshJobs: () => Promise<void>;
  /** Account purge path (loader re-GET denies and clears account state). */
  onAccessDenied: () => void;
  /** Independent UI busy flag; cleared whenever the attempt settles. */
  setBusy: (orderId: string | null) => void;
  /** Screen projection only; contains no GPS or private payload. */
  onVerificationState?: (
    orderId: string,
    state: ArrivalVerificationState,
  ) => void;
}

type AttemptState = 'pending' | 'verified';

/**
 * Same-process no-repost guard, scoped by technician User ID + ServiceOrder.
 * IDs/state only: no coordinates, token, customer data or provider response.
 */
const attemptsByTechnician = new Map<string, Map<string, AttemptState>>();

function attemptsFor(technicianId: string): Map<string, AttemptState> {
  let attempts = attemptsByTechnician.get(technicianId);
  if (!attempts) {
    attempts = new Map<string, AttemptState>();
    attemptsByTechnician.set(technicianId, attempts);
  }
  return attempts;
}

export function checkInAttemptState(
  technicianId: string | null | undefined,
  orderId: string,
): ArrivalVerificationState {
  if (!technicianId) return 'clear';
  return attemptsFor(technicianId).get(orderId) ?? 'clear';
}

function statusOf(error: unknown): number | undefined {
  return (error as { response?: { status?: number } } | null)?.response
    ?.status;
}

function isDefinitivePostRejection(error: unknown): boolean {
  const status = statusOf(error);
  return (
    status === 400 ||
    status === 401 ||
    status === 403 ||
    status === 404 ||
    status === 409 ||
    status === 422
  );
}

/** Case-insensitive result; tolerates a {data} envelope. Unknown never succeeds. */
export function normalizeCheckInResult(response: unknown): CheckInResult {
  const body =
    response !== null &&
    typeof response === 'object' &&
    'data' in response &&
    (response as { data?: unknown }).data !== null &&
    typeof (response as { data?: unknown }).data === 'object'
      ? (response as { data: unknown }).data
      : response;
  const raw =
    body !== null && typeof body === 'object'
      ? String((body as Record<string, unknown>).result ?? '').toLowerCase()
      : '';
  return raw === 'valid' ||
    raw === 'low_accuracy' ||
    raw === 'out_of_geofence' ||
    raw === 'failed'
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
  return typeof distance === 'number' &&
    Number.isFinite(distance) &&
    distance >= 0
    ? ` Khoảng cách hiện tại khoảng ${Math.round(distance)} m (do máy chủ tính).`
    : null;
}

/**
 * Finite coordinates plus a genuine OS-reported accuracy. Missing/null/NaN
 * accuracy is rejected, never defaulted to fake precision.
 */
export function toCheckInCoords(
  reading: PositionReading,
): CheckInCoords | null {
  const { lat, lng, accuracy } = reading;
  if (typeof lat !== 'number' || !Number.isFinite(lat)) return null;
  if (typeof lng !== 'number' || !Number.isFinite(lng)) return null;
  if (
    typeof accuracy !== 'number' ||
    !Number.isFinite(accuracy) ||
    accuracy < 0
  ) {
    return null;
  }
  return { lat, lng, accuracyMeters: accuracy };
}

export function createCheckInController(deps: CheckInDeps) {
  let pending: string | null = null;

  const isActiveJob = (
    job: CheckInJobSnapshot | null | undefined,
  ): job is CheckInJobSnapshot =>
    !!job && (job as { historical?: unknown }).historical !== true;

  async function verifyArrival(
    orderId: string,
    technicianId: string,
    isCurrent: () => boolean,
  ): Promise<boolean> {
    const attempts = attemptsFor(technicianId);
    try {
      const detail = await deps.getOrderDetail(orderId);
      if (!isCurrent()) return false;

      const sameActiveAssignment =
        detail.id === orderId &&
        detail.historical !== true &&
        detail.technician?.id === technicianId;

      if (!sameActiveAssignment) {
        // Authorized GET proved this is not the current active assignment.
        attempts.delete(orderId);
        deps.onVerificationState?.(orderId, 'clear');
        return false;
      }

      if (detail.arrivalVerified === true) {
        attempts.set(orderId, 'verified');
        deps.onVerificationState?.(orderId, 'verified');
        return true;
      }

      // arrivalVerified=false is not proof that an ambiguous POST was never
      // committed. Keep an existing pending no-repost lock.
      if (attempts.get(orderId) === 'pending') {
        deps.onVerificationState?.(orderId, 'pending');
      } else {
        deps.onVerificationState?.(orderId, 'clear');
      }
      return false;
    } catch (error) {
      if (!isCurrent()) return false;
      const status = statusOf(error);
      if (status === 401 || status === 403) {
        deps.onAccessDenied();
      }
      if (attempts.get(orderId) === 'pending') {
        deps.onVerificationState?.(orderId, 'pending');
      }
      return false;
    }
  }

  /**
   * GET-only re-entry path. Safe to call for every visible EN_ROUTE job:
   * it never requests location permission and never sends check-in POST.
   */
  async function reconcile(orderId: string): Promise<void> {
    const target = orderDetailTarget(orderId);
    if (!target) return;
    const technicianId = deps.getTechnicianId();
    if (!technicianId) return;
    const isCurrent = deps.captureFocus();
    if (!isCurrent()) return;

    const attempts = attemptsFor(technicianId);
    const known = attempts.get(target);
    if (known) {
      deps.onVerificationState?.(target, known);
    }
    await verifyArrival(target, technicianId, () =>
      isCurrent() && deps.getTechnicianId() === technicianId,
    );
  }

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
    const sameSession = () =>
      isCurrent() && deps.getTechnicianId() === technicianId;

    const attempts = attemptsFor(technicianId);
    const priorAttempt = attempts.get(target);
    if (priorAttempt) {
      deps.setBusy(target);
      try {
        deps.onVerificationState?.(target, priorAttempt);
        const verified = await verifyArrival(
          target,
          technicianId,
          sameSession,
        );
        if (!sameSession()) return;
        deps.notify(
          verified ? 'Đã xác minh check-in' : 'Đang xác minh check-in',
          verified
            ? 'Máy chủ xác nhận bạn đã đến nơi. Đơn vẫn EN_ROUTE cho đến khi bắt đầu sửa chữa.'
            : 'Không gửi check-in lại. Hãy làm mới để đối chiếu trạng thái từ máy chủ.',
        );
      } finally {
        deps.setBusy(null);
      }
      return;
    }

    const job = deps.getJob(target);
    if (!isActiveJob(job)) {
      deps.notify('Không thể check-in.', 'Đơn lưu trữ không thể check-in.');
      return;
    }
    if (String(job.status).toUpperCase() !== 'EN_ROUTE') {
      deps.notify(
        'Không thể check-in.',
        'Đơn chưa ở trạng thái di chuyển nên không thể check-in.',
      );
      return;
    }

    pending = target;
    deps.setBusy(target);
    try {
      let permission: PermissionDecision;
      try {
        permission = await deps.requestPermission();
      } catch {
        permission = 'unavailable';
      }
      if (!sameSession()) return;

      if (permission === 'denied') {
        deps.notify(
          'Cần quyền vị trí',
          'Hãy cấp quyền vị trí khi dùng ứng dụng trong Cài đặt rồi quay lại thử check-in.',
        );
        return;
      }
      if (permission === 'unavailable') {
        deps.notify(
          'Không lấy được vị trí',
          'Hãy bật dịch vụ định vị (GPS) rồi thử lại.',
        );
        return;
      }

      const fresh = deps.getJob(target);
      if (
        !isActiveJob(fresh) ||
        String(fresh.status).toUpperCase() !== 'EN_ROUTE'
      ) {
        deps.notify(
          'Đơn đã thay đổi',
          'Trạng thái đơn đã thay đổi. Vui lòng làm mới danh sách rồi thử lại.',
        );
        return;
      }

      let reading: PositionReading;
      try {
        reading = await deps.getPosition();
      } catch {
        deps.notify(
          'Không lấy được vị trí',
          'Hãy bật dịch vụ định vị (GPS) rồi thử lại.',
        );
        return;
      }
      if (!sameSession()) return;

      const coords = toCheckInCoords(reading);
      if (!coords) {
        deps.notify(
          'Tọa độ chưa hợp lệ',
          'Không đọc được tọa độ GPS hợp lệ. Hãy ra nơi thoáng và thử lại.',
        );
        return;
      }

      // Acquire the account+order no-repost lock BEFORE dispatch.
      attempts.set(target, 'pending');
      deps.onVerificationState?.(target, 'pending');

      let response: unknown;
      try {
        response = await deps.postCheckIn(target, coords);
      } catch (error) {
        if (!sameSession()) return;

        if (isDefinitivePostRejection(error)) {
          attempts.delete(target);
          deps.onVerificationState?.(target, 'clear');
          const status = statusOf(error);
          if (status === 401 || status === 403) {
            deps.onAccessDenied();
            deps.notify(
              'Phiên đăng nhập đã hết',
              'Vui lòng đăng nhập lại để tiếp tục check-in.',
            );
            return;
          }
          if (status === 404) {
            deps.notify(
              'Không tìm thấy đơn',
              'Đơn có thể đã thay đổi hoặc bạn không còn quyền. Vui lòng làm mới danh sách.',
            );
            await deps.refreshJobs();
            return;
          }
          deps.notify(
            'Check-in bị từ chối',
            `Máy chủ từ chối check-in theo trạng thái hiện tại (mã ${status ?? 'không rõ'}). Hãy làm mới trước khi thử lại.`,
          );
          await deps.refreshJobs();
          return;
        }

        // Timeout/offline/5xx/lost ACK: never re-POST. Only a fresh detail GET
        // may positively prove arrival.
        const verified = await verifyArrival(
          target,
          technicianId,
          sameSession,
        );
        if (!sameSession()) return;
        deps.notify(
          verified ? 'Đã xác minh check-in' : 'Chưa xác nhận check-in',
          verified
            ? 'Máy chủ xác nhận bạn đã đến nơi. Đơn vẫn EN_ROUTE cho đến khi bắt đầu sửa chữa.'
            : 'Kết quả POST chưa xác định. Không gửi lại; hãy làm mới để kiểm tra arrivalVerified từ máy chủ.',
        );
        await deps.refreshJobs();
        return;
      }

      if (!sameSession()) return;
      const result = normalizeCheckInResult(response);

      if (
        result === 'low_accuracy' ||
        result === 'out_of_geofence' ||
        result === 'failed'
      ) {
        // Server positively reported non-arrival: this attempt is safe to release.
        attempts.delete(target);
        deps.onVerificationState?.(target, 'clear');
        if (result === 'low_accuracy') {
          deps.notify(
            'Vị trí chưa đủ chính xác',
            'Hệ thống chưa thể xác minh bạn đã đến. Hãy ra nơi thoáng, bật GPS chính xác cao rồi thử lại.',
          );
        } else if (result === 'out_of_geofence') {
          deps.notify(
            'Ngoài khu vực',
            `Bạn chưa ở trong khu vực địa chỉ sửa chữa.${serverDistanceText(response) ?? ''}`,
          );
        } else {
          deps.notify(
            'Check-in thất bại',
            'Không thể xác minh vị trí. Vui lòng thử lại khi đã đến địa chỉ sửa chữa.',
          );
        }
        return;
      }

      // valid or an unknown 2xx result: authoritative detail GET decides what
      // the UI may call "arrived". Unknown remains locked absent positive proof.
      const verified = await verifyArrival(
        target,
        technicianId,
        sameSession,
      );
      if (!sameSession()) return;

      if (verified) {
        deps.notify(
          'Đã xác minh check-in',
          'Máy chủ xác nhận bạn đã đến nơi. Đơn vẫn EN_ROUTE cho đến khi bắt đầu sửa chữa.',
        );
      } else {
        deps.notify(
          result === 'valid'
            ? 'Đang xác minh check-in'
            : 'Kết quả check-in chưa rõ',
          'Không gửi check-in lại. Hãy làm mới để đối chiếu arrivalVerified từ máy chủ.',
        );
      }
      await deps.refreshJobs();
    } finally {
      pending = null;
      deps.setBusy(null);
    }
  }

  return { checkIn, reconcile };
}
