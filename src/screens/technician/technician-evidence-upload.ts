import type { EvidenceResponse, EvidenceUploadImage } from '../../api/orders.api';
import { orderDetailTarget } from '../customer/customer-order-detail';

/**
 * Bounded BEFORE-evidence upload for the assigned technician.
 *
 * A POST acknowledgement is not enough to call an image verified. The controller
 * captures an authoritative BEFORE-evidence baseline before dispatch and only
 * releases an uncertain attempt after a fresh GET proves the expected/new row.
 * No payment, quotation, repair-state or completion behavior lives here.
 */

export const BEFORE_EVIDENCE_MAX_BYTES = 10 * 1024 * 1024;

const MIME_EXTENSION: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

export type PickerSource = 'camera' | 'gallery';
export type PickerPermission = 'granted' | 'denied' | 'unavailable';

export interface PickerAsset {
  uri: unknown;
  mimeType: unknown;
  fileSize: unknown;
}

export type PickerOutcome =
  | { canceled: true }
  | { canceled: false; asset: PickerAsset };

export interface PendingUpload {
  uri: string;
  name: string;
  mime: string;
  sizeBytes: number;
}

export interface UploadOrderGate {
  id: string;
  status: unknown;
  arrivalVerified: unknown;
  historical?: unknown;
}

export interface UploadState {
  pending: PendingUpload | null;
  busy: boolean;
  error: string | null;
  /** The previous POST may have committed. GET verification is required first. */
  needsVerify: boolean;
}

export const initialUploadState: UploadState = {
  pending: null,
  busy: false,
  error: null,
  needsVerify: false,
};

export interface EvidenceUploadDeps {
  getOrder: () => UploadOrderGate | null;
  getTechnicianId: () => string | null;
  isFocused: () => boolean;
  requestPermission: (source: PickerSource) => Promise<PickerPermission>;
  launchPicker: (source: PickerSource) => Promise<PickerOutcome>;
  uploadBefore: (
    orderId: string,
    image: EvidenceUploadImage,
  ) => Promise<unknown>;
  /** Authoritative read used for pre-POST baseline and post-POST reconciliation. */
  getEvidence: (orderId: string) => Promise<EvidenceResponse[]>;
  /** Refresh signed photos + detail after positive evidence is established. */
  refreshEvidence: () => Promise<void>;
  onAccessDenied: () => void;
  notify: (title: string, message: string) => void;
}

interface BeforeUploadAttempt {
  baselineIds: string[];
  expectedId: string | null;
}

/**
 * Same-process no-repost guard, scoped by technician User ID + ServiceOrder.
 * Stores IDs only: never file URI, token, customer data or provider response.
 */
const attemptsByTechnician = new Map<
  string,
  Map<string, BeforeUploadAttempt>
>();

function attemptsFor(
  technicianId: string,
): Map<string, BeforeUploadAttempt> {
  let attempts = attemptsByTechnician.get(technicianId);
  if (!attempts) {
    attempts = new Map<string, BeforeUploadAttempt>();
    attemptsByTechnician.set(technicianId, attempts);
  }
  return attempts;
}

function statusOf(error: unknown): number | undefined {
  return (error as { response?: { status?: number } } | null)?.response
    ?.status;
}

function isDefinitiveUploadRejection(error: unknown): boolean {
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

function beforeEvidenceIds(
  rows: readonly EvidenceResponse[],
  orderId: string,
): string[] {
  return rows
    .filter(
      (row) =>
        row &&
        row.serviceOrderId === orderId &&
        String(row.type).toUpperCase() === 'BEFORE' &&
        typeof row.id === 'string' &&
        row.id.length > 0,
    )
    .map((row) => row.id);
}

function responseEvidenceId(response: unknown): string | null {
  if (!response || typeof response !== 'object') return null;
  const id = (response as { id?: unknown }).id;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

function mimeFor(asset: PickerAsset): string | null {
  const raw =
    typeof asset.mimeType === 'string'
      ? asset.mimeType.toLowerCase().split(';')[0].trim()
      : '';
  if (MIME_EXTENSION[raw]) return raw;

  // Extension fallback only when the OS provides no MIME.
  if (raw !== '') return null;
  const uri = typeof asset.uri === 'string' ? asset.uri : '';
  const ext = uri.split('?')[0].split('.').pop()?.toLowerCase();
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return null;
}

function fileNameFor(uri: string, mime: string): string {
  const base = uri.split('?')[0].split('/').pop() ?? '';
  if (/\.(jpe?g|png|webp)$/i.test(base)) return base;
  return `before-evidence${MIME_EXTENSION[mime] ?? '.jpg'}`;
}

/**
 * Fail closed: exactly one known image with a genuine OS-reported size in
 * (0, 10 MiB]. Unknown type/size never reaches POST.
 */
export function validateEvidenceAsset(
  asset: PickerAsset,
): PendingUpload | { error: string } {
  const uri =
    typeof asset.uri === 'string' && asset.uri.length > 0 ? asset.uri : null;
  if (!uri) {
    return {
      error: 'Không đọc được ảnh đã chọn. Vui lòng thử lại.',
    };
  }

  const mime = mimeFor(asset);
  if (!mime) {
    return {
      error: 'Ảnh không đúng định dạng JPEG/PNG/WebP. Vui lòng chọn ảnh khác.',
    };
  }

  if (
    typeof asset.fileSize !== 'number' ||
    !Number.isFinite(asset.fileSize) ||
    asset.fileSize <= 0
  ) {
    return {
      error: 'Không đọc được dung lượng ảnh. Vui lòng chụp/chọn ảnh khác.',
    };
  }

  if (asset.fileSize > BEFORE_EVIDENCE_MAX_BYTES) {
    return {
      error: 'Ảnh vượt quá 10 MB. Vui lòng chụp/chọn ảnh nhỏ hơn.',
    };
  }

  return {
    uri,
    name: fileNameFor(uri, mime),
    mime,
    sizeBytes: asset.fileSize,
  };
}

export function createEvidenceUploadController(
  deps: EvidenceUploadDeps,
  write: (state: UploadState) => void,
) {
  let state: UploadState = { ...initialUploadState };
  let uploading = false;
  let pendingOwner: { technicianId: string; orderId: string } | null = null;

  const publish = (patch: Partial<UploadState>) => {
    state = { ...state, ...patch };
    write(state);
  };

  function uploadTarget(): string | null {
    if (!deps.getTechnicianId() || !deps.isFocused()) return null;
    const order = deps.getOrder();
    if (!order || order.historical === true) return null;
    const target = orderDetailTarget(order.id);
    if (!target) return null;
    if (String(order.status).toUpperCase() !== 'EN_ROUTE') return null;
    if (order.arrivalVerified !== true) return null;
    return target;
  }

  function discardSelection() {
    pendingOwner = null;
    if (
      state.pending === null &&
      state.error === null &&
      state.needsVerify === false
    ) {
      return;
    }
    state = {
      ...state,
      pending: null,
      error: null,
      needsVerify: false,
    };
    write(state);
  }

  async function pick(source: PickerSource): Promise<void> {
    if (uploading) return;
    const technicianId = deps.getTechnicianId();
    if (!technicianId || !deps.isFocused()) return;

    const initialTarget = uploadTarget();
    if (!initialTarget) {
      deps.notify(
        'Chưa thể tải ảnh',
        'Cần check-in hợp lệ trước khi tải ảnh.',
      );
      return;
    }

    if (attemptsFor(technicianId).has(initialTarget)) {
      publish({
        needsVerify: true,
        error:
          'Có ảnh trước sửa chữa đang chờ xác minh. Không chọn hoặc gửi ảnh mới.',
      });
      deps.notify(
        'Đang xác minh ảnh',
        'Không gửi ảnh mới. Hãy kiểm tra bằng chứng hiện tại trước.',
      );
      return;
    }

    const sameSession = () =>
      deps.getTechnicianId() === technicianId && deps.isFocused();

    let permission: PickerPermission;
    try {
      permission = await deps.requestPermission(source);
    } catch {
      permission = 'unavailable';
    }
    if (!sameSession()) return;

    if (permission === 'denied') {
      deps.notify(
        source === 'camera'
          ? 'Cần quyền camera'
          : 'Cần quyền thư viện ảnh',
        'Hãy cấp quyền trong Cài đặt rồi quay lại thử chụp/chọn ảnh.',
      );
      return;
    }
    if (permission === 'unavailable') {
      deps.notify(
        'Không mở được ảnh',
        'Thiết bị chưa sẵn sàng cho camera/thư viện. Vui lòng thử lại.',
      );
      return;
    }

    let outcome: PickerOutcome;
    try {
      outcome = await deps.launchPicker(source);
    } catch {
      deps.notify(
        'Không mở được ảnh',
        'Không thể mở camera/thư viện lúc này. Vui lòng thử lại.',
      );
      return;
    }
    if (!sameSession() || outcome.canceled) return;

    const pickTarget = uploadTarget();
    if (!pickTarget || deps.getOrder()?.id !== pickTarget) {
      deps.notify(
        'Chưa thể tải ảnh',
        'Cần check-in hợp lệ trước khi tải ảnh.',
      );
      return;
    }

    const validated = validateEvidenceAsset(outcome.asset);
    if ('error' in validated) {
      deps.notify('Ảnh chưa hợp lệ', validated.error);
      return;
    }

    pendingOwner = { technicianId, orderId: pickTarget };
    publish({
      pending: validated,
      error: null,
      needsVerify: false,
    });
  }

  async function reconcileAttempt(
    technicianId: string,
    orderId: string,
    sameSession: () => boolean,
    notifyResult: boolean,
  ): Promise<boolean> {
    const attempts = attemptsFor(technicianId);
    const attempt = attempts.get(orderId);

    if (!attempt) {
      if (sameSession()) {
        publish({ needsVerify: false });
      }
      return false;
    }

    try {
      const rows = await deps.getEvidence(orderId);
      if (!sameSession()) return false;

      const currentIds = beforeEvidenceIds(rows, orderId);
      const baseline = new Set(attempt.baselineIds);
      const newIds = currentIds.filter((id) => !baseline.has(id));

      const verified = attempt.expectedId
        ? currentIds.includes(attempt.expectedId)
        : newIds.length === 1;

      if (!verified) {
        publish({
          busy: false,
          needsVerify: true,
          error:
            'GET chưa đủ bằng chứng để xác nhận lần tải ảnh trước. Không gửi POST lại.',
        });
        if (notifyResult) {
          deps.notify(
            'Chưa xác minh ảnh',
            'Không gửi lại ảnh. Hãy làm mới bằng chứng và kiểm tra lại.',
          );
        }
        return false;
      }

      attempts.delete(orderId);
      pendingOwner = null;
      state = {
        pending: null,
        busy: true,
        error: null,
        needsVerify: false,
      };
      write(state);

      await deps.refreshEvidence();
      if (!sameSession()) return true;

      publish({
        busy: false,
        needsVerify: false,
        error: null,
      });
      deps.notify(
        'Đã xác minh ảnh',
        'GET bằng chứng đã xác nhận ảnh trước sửa chữa mới trên đúng ServiceOrder.',
      );
      return true;
    } catch (error) {
      if (!sameSession()) return false;
      const status = statusOf(error);
      if (status === 401 || status === 403) {
        deps.onAccessDenied();
      }
      publish({
        busy: false,
        needsVerify: true,
        error:
          'Chưa thể đối chiếu bằng chứng từ máy chủ. Không gửi POST lại.',
      });
      if (notifyResult) {
        deps.notify(
          'Chưa xác minh ảnh',
          'Không gửi lại ảnh. Hãy kiểm tra kết nối rồi đối chiếu bằng chứng.',
        );
      }
      return false;
    }
  }

  async function upload(): Promise<void> {
    if (uploading || !state.pending || !pendingOwner) return;

    const selected = state.pending;
    const owner = pendingOwner;

    if (
      deps.getTechnicianId() !== owner.technicianId ||
      !deps.isFocused() ||
      deps.getOrder()?.id !== owner.orderId
    ) {
      discardSelection();
      return;
    }

    const target = uploadTarget();
    if (!target || target !== owner.orderId) {
      discardSelection();
      deps.notify(
        'Chưa thể tải ảnh',
        'Cần check-in hợp lệ trước khi tải ảnh.',
      );
      return;
    }

    const sameSession = () =>
      deps.getTechnicianId() === owner.technicianId &&
      deps.isFocused() &&
      deps.getOrder()?.id === owner.orderId;

    const attempts = attemptsFor(owner.technicianId);
    if (attempts.has(target)) {
      publish({
        needsVerify: true,
        error:
          'Lần tải ảnh trước đang chờ xác minh. Không gửi POST lại.',
      });
      await reconcileAttempt(
        owner.technicianId,
        target,
        sameSession,
        true,
      );
      return;
    }

    uploading = true;
    publish({
      busy: true,
      error: null,
      needsVerify: false,
    });

    try {
      let baselineRows: EvidenceResponse[];
      try {
        baselineRows = await deps.getEvidence(target);
      } catch (error) {
        if (!sameSession()) {
          discardSelection();
          return;
        }

        const status = statusOf(error);
        if (status === 401 || status === 403) {
          discardSelection();
          deps.onAccessDenied();
          deps.notify(
            'Phiên đăng nhập đã hết',
            'Vui lòng đăng nhập lại để tiếp tục tải ảnh.',
          );
          return;
        }

        publish({
          busy: false,
          error:
            'Chưa tải được bằng chứng hiện tại nên chưa gửi ảnh. Hãy thử lại sau.',
          needsVerify: false,
        });
        return;
      }

      if (!sameSession()) {
        discardSelection();
        return;
      }

      attempts.set(target, {
        baselineIds: beforeEvidenceIds(baselineRows, target),
        expectedId: null,
      });

      let response: unknown;
      try {
        response = await deps.uploadBefore(target, {
          uri: selected.uri,
          name: selected.name,
          type: selected.mime,
        });
      } catch (error) {
        if (!sameSession()) return;

        if (isDefinitiveUploadRejection(error)) {
          attempts.delete(target);
          const status = statusOf(error);

          if (status === 401 || status === 403) {
            discardSelection();
            deps.onAccessDenied();
            deps.notify(
              'Phiên đăng nhập đã hết',
              'Vui lòng đăng nhập lại để tiếp tục tải ảnh.',
            );
            return;
          }

          publish({
            busy: false,
            needsVerify: false,
            error:
              'Máy chủ từ chối tải ảnh' +
              (typeof status === 'number'
                ? ' (mã ' + status + ')'
                : '') +
              '. Chưa ghi nhận ảnh mới; hãy kiểm tra điều kiện trước khi thử lại.',
          });
          return;
        }

        // Timeout/offline/5xx/provider uncertainty: a row may already exist.
        const verified = await reconcileAttempt(
          owner.technicianId,
          target,
          sameSession,
          false,
        );
        if (!sameSession()) return;

        if (!verified) {
          publish({
            busy: false,
            needsVerify: true,
            error:
              'Chưa xác nhận ảnh đã được lưu. Không gửi POST lại; hãy dùng Kiểm tra bằng chứng.',
          });
          deps.notify(
            'Chưa xác minh ảnh',
            'Kết quả tải ảnh chưa xác định. Không gửi lại; chỉ đối chiếu bằng GET.',
          );
        }
        return;
      }

      if (!sameSession()) return;
      const attempt = attempts.get(target);
      if (attempt) {
        attempt.expectedId = responseEvidenceId(response);
      }

      // Even HTTP 201 must be proven by authoritative evidence GET.
      const verified = await reconcileAttempt(
        owner.technicianId,
        target,
        sameSession,
        false,
      );
      if (!sameSession()) return;

      if (!verified) {
        publish({
          busy: false,
          needsVerify: true,
          error:
            'POST đã phản hồi nhưng GET chưa xác nhận ảnh mới. Không gửi POST lại.',
        });
        deps.notify(
          'Đang xác minh ảnh',
          'Chưa có bằng chứng GET đủ để gọi lần tải ảnh này là thành công.',
        );
      }
    } finally {
      uploading = false;
      if (state.busy) publish({ busy: false });
    }
  }

  async function reconcile(): Promise<void> {
    const technicianId = deps.getTechnicianId();
    if (!technicianId || !deps.isFocused()) return;

    const target = uploadTarget();
    if (!target) return;

    const sameSession = () =>
      deps.getTechnicianId() === technicianId &&
      deps.isFocused() &&
      deps.getOrder()?.id === target;

    await reconcileAttempt(
      technicianId,
      target,
      sameSession,
      true,
    );
  }

  return {
    pickFromCamera: () => pick('camera'),
    pickFromGallery: () => pick('gallery'),
    upload: () => upload(),
    reconcile: () => reconcile(),
    discard: () => discardSelection(),
  };
}
