import { orderDetailTarget } from '../customer/customer-order-detail';
import type { EvidenceUploadImage } from '../../api/orders.api';

/**
 * P3B5 bounded BEFORE-evidence camera/gallery upload. Runs only on an
 * assigned ACTIVE EN_ROUTE technician detail whose Backend order carries
 * `arrivalVerified === true` (derived from a valid check-in, never from a
 * client toast or bare HTTP 200). The user explicitly taps camera/gallery;
 * exactly ONE JPEG/PNG/WebP <= 10 MiB is selected, then uploaded with a
 * second explicit tap. No AFTER/ADDITIONAL, quotation, status, payment, or
 * persistence lives here. The POST 201 body (private `storage://`) is
 * ignored; success re-fetches fresh signed GET photos instead.
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
}

export const initialUploadState: UploadState = {
  pending: null,
  busy: false,
  error: null,
};

export interface EvidenceUploadDeps {
  getOrder: () => UploadOrderGate | null;
  getTechnicianId: () => string | null;
  isFocused: () => boolean;
  requestPermission: (source: PickerSource) => Promise<PickerPermission>;
  launchPicker: (source: PickerSource) => Promise<PickerOutcome>;
  uploadBefore: (orderId: string, image: EvidenceUploadImage) => Promise<unknown>;
  /** GET-only reconciliation: refresh signed photos (and detail counts). */
  refreshEvidence: () => Promise<void>;
  onAccessDenied: () => void;
  notify: (title: string, message: string) => void;
}

function statusOf(error: unknown): number | undefined {
  return (error as { response?: { status?: number } } | null)?.response?.status;
}

function mimeFor(asset: PickerAsset): string | null {
  const raw = typeof asset.mimeType === 'string'
    ? asset.mimeType.toLowerCase().split(';')[0].trim()
    : '';
  if (MIME_EXTENSION[raw]) return raw;
  // Extension fallback only when the OS reports no MIME at all; an explicitly
  // unsupported MIME is never overridden by the file name.
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
 * Fail-closed file validation: exactly one photo with a known MIME and a
 * genuine OS-reported size in (0, 10 MiB]. Unknown type/size is rejected —
 * never defaulted — so an unverifiable file can never reach POST.
 */
export function validateEvidenceAsset(
  asset: PickerAsset,
): PendingUpload | { error: string } {
  const uri = typeof asset.uri === 'string' && asset.uri.length > 0 ? asset.uri : null;
  if (!uri) return { error: 'Không đọc được ảnh đã chọn. Vui lòng thử lại.' };
  const mime = mimeFor(asset);
  if (!mime) {
    return { error: 'Ảnh không đúng định dạng JPEG/PNG/WebP. Vui lòng chọn ảnh khác.' };
  }
  if (
    typeof asset.fileSize !== 'number' ||
    !Number.isFinite(asset.fileSize) ||
    asset.fileSize <= 0
  ) {
    return { error: 'Không đọc được dung lượng ảnh. Vui lòng chụp/chọn ảnh khác.' };
  }
  if (asset.fileSize > BEFORE_EVIDENCE_MAX_BYTES) {
    return { error: 'Ảnh vượt quá 10 MB. Vui lòng chụp/chọn ảnh nhỏ hơn.' };
  }
  return { uri, name: fileNameFor(uri, mime), mime, sizeBytes: asset.fileSize };
}

export function createEvidenceUploadController(
  deps: EvidenceUploadDeps,
  write: (state: UploadState) => void,
) {
  let state: UploadState = { ...initialUploadState };
  let uploading = false;
  /** Account+order that owns the pending selection; upload requires an exact match. */
  let pendingOwner: { technicianId: string; orderId: string } | null = null;

  const publish = (patch: Partial<UploadState>) => {
    state = { ...state, ...patch };
    write(state);
  };

  /** Full pre-POST gate: session, focus, same real order, EN_ROUTE, Backend arrival. */
  function uploadTarget(): string | null {
    if (!deps.getTechnicianId()) return null;
    if (!deps.isFocused()) return null;
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
    if (state.pending === null && state.error === null) return;
    state = { ...state, pending: null, error: null };
    write(state);
  }

  async function pick(source: PickerSource): Promise<void> {
    if (uploading) return;
    const technicianId = deps.getTechnicianId();
    if (!technicianId || !deps.isFocused()) return;
    if (!uploadTarget()) {
      deps.notify('Chưa thể tải ảnh', 'Check-in hợp lệ trước khi tải ảnh.');
      return;
    }
    const sameSession = () => deps.getTechnicianId() === technicianId && deps.isFocused();
    let permission: PickerPermission;
    try {
      permission = await deps.requestPermission(source);
    } catch {
      permission = 'unavailable';
    }
    if (!sameSession()) return;
    if (permission === 'denied') {
      deps.notify(
        source === 'camera' ? 'Cần quyền camera' : 'Cần quyền thư viện ảnh',
        'Hãy cấp quyền trong Cài đặt rồi quay lại thử chụp/chọn ảnh.',
      );
      return;
    }
    if (permission === 'unavailable') {
      deps.notify('Không mở được ảnh', 'Thiết bị chưa sẵn sàng cho camera/thư viện. Vui lòng thử lại.');
      return;
    }
    let outcome: PickerOutcome;
    try {
      outcome = await deps.launchPicker(source);
    } catch {
      deps.notify('Không mở được ảnh', 'Không thể mở camera/thư viện lúc này. Vui lòng thử lại.');
      return;
    }
    if (!sameSession()) return;
    if (outcome.canceled) return;
    const pickTarget = uploadTarget();
    if (!pickTarget || deps.getOrder()?.id !== pickTarget) {
      deps.notify('Chưa thể tải ảnh', 'Check-in hợp lệ trước khi tải ảnh.');
      return;
    }
    const validated = validateEvidenceAsset(outcome.asset);
    if ('error' in validated) {
      deps.notify('Ảnh chưa hợp lệ', validated.error);
      return;
    }
    pendingOwner = { technicianId, orderId: pickTarget };
    publish({ pending: validated, error: null });
  }

  async function upload(): Promise<void> {
    if (uploading || !state.pending || !pendingOwner) return;
    const selected = state.pending;
    const owner = pendingOwner;
    // The selection belongs to one technician+order: any switch, blur, or
    // logout drops it silently — never POST, never notify another account.
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
      deps.notify('Chưa thể tải ảnh', 'Check-in hợp lệ trước khi tải ảnh.');
      return;
    }
    uploading = true;
    publish({ busy: true, error: null });
    const sameSession = () =>
      deps.getTechnicianId() === owner.technicianId &&
      deps.isFocused() &&
      deps.getOrder()?.id === owner.orderId;
    try {
      // The 201 body (private storage reference) is intentionally ignored:
      // success below re-fetches fresh signed GET photos; raw POST paths are
      // never written to state, logs, or UI.
      await deps.uploadBefore(target, { uri: selected.uri, name: selected.name, type: selected.mime });
      if (!sameSession()) {
        discardSelection();
        return;
      }
      const stillTarget = uploadTarget();
      if (stillTarget !== target) {
        discardSelection();
        return;
      }
      state = { pending: null, busy: true, error: null };
      write(state);
      deps.notify('Đã tải ảnh', 'Ảnh trước sửa chữa đã được tải lên. Ảnh mới sẽ hiển thị sau khi tải lại.');
      await deps.refreshEvidence();
    } catch (error) {
      if (!sameSession()) {
        discardSelection();
        return;
      }
      const status = statusOf(error);
      if (status === 401 || status === 403) {
        discardSelection();
        deps.onAccessDenied();
        deps.notify('Phiên đăng nhập đã hết', 'Vui lòng đăng nhập lại để tiếp tục tải ảnh.');
        return;
      }
      if (status === 503) {
        publish({ busy: false, error: 'Dịch vụ ảnh tạm thời không khả dụng. Hãy kiểm tra ảnh hiện có rồi thử lại.' });
        await deps.refreshEvidence();
        return;
      }
      // Ambiguous POST (timeout/offline/5xx/lost response): the provider may
      // have stored the file — never auto-repost. Keep the selection for an
      // explicit user retry only after checking current evidence.
      publish({ busy: false, error: 'Chưa xác nhận ảnh đã được tải lên. Hãy tải lại bằng chứng trước khi thử lại.' });
      await deps.refreshEvidence();
    } finally {
      uploading = false;
      if (state.busy) publish({ busy: false });
    }
  }

  return {
    pickFromCamera: () => pick('camera'),
    pickFromGallery: () => pick('gallery'),
    upload: () => upload(),
    discard: () => discardSelection(),
  };
}
