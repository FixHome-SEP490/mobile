import { orderDetailTarget } from '../customer/customer-order-detail';
import type { EvidenceUploadImage } from '../../api/orders.api';
import {
  validateEvidenceAsset,
  type PendingUpload,
  type PickerOutcome,
  type PickerPermission,
  type PickerSource,
} from './technician-evidence-upload';

/**
 * P3B10 bounded AFTER-evidence camera/gallery upload. Separate from the P3B5
 * BEFORE controller (which is untouched): runs only on an assigned ACTIVE
 * UNDER_REPAIR technician detail with no completion requested yet. The user
 * explicitly taps camera/gallery, then uploads with a second explicit tap.
 * Exactly ONE JPEG/PNG/WebP <= 10 MiB (reused fail-closed validation). The
 * POST 201 body (private `storage://`) is ignored; success re-fetches fresh
 * signed GET photos instead. AFTER upload is not order completion and never
 * sets COMPLETED/PAID/invoice values.
 */

export interface AfterUploadOrderGate {
  id: string;
  status: unknown;
  completionRequestedAt: unknown;
  historical?: unknown;
}

export interface AfterUploadState {
  pending: PendingUpload | null;
  busy: boolean;
  error: string | null;
}

export const initialAfterUploadState: AfterUploadState = {
  pending: null,
  busy: false,
  error: null,
};

export interface AfterEvidenceUploadDeps {
  getOrder: () => AfterUploadOrderGate | null;
  getTechnicianId: () => string | null;
  isFocused: () => boolean;
  requestPermission: (source: PickerSource) => Promise<PickerPermission>;
  launchPicker: (source: PickerSource) => Promise<PickerOutcome>;
  uploadAfter: (orderId: string, image: EvidenceUploadImage) => Promise<unknown>;
  /** GET-only reconciliation: refresh signed photos (and detail counts). */
  refreshEvidence: () => Promise<void>;
  onAccessDenied: () => void;
  notify: (title: string, message: string) => void;
}

function statusOf(error: unknown): number | undefined {
  return (error as { response?: { status?: number } } | null)?.response?.status;
}

/** AFTER gate: same tech/focus/real order, active UNDER_REPAIR, completion not requested. */
export function afterUploadTarget(order: AfterUploadOrderGate | null): string | null {
  if (!order || order.historical === true) return null;
  const target = orderDetailTarget(order.id);
  if (!target) return null;
  if (String(order.status).toUpperCase() !== 'UNDER_REPAIR') return null;
  if (!!order.completionRequestedAt) return null;
  return target;
}

export function createAfterEvidenceUploadController(
  deps: AfterEvidenceUploadDeps,
  write: (state: AfterUploadState) => void,
) {
  let state: AfterUploadState = { ...initialAfterUploadState };
  let uploading = false;
  /** Account+order that owns the pending selection; upload requires an exact match. */
  let pendingOwner: { technicianId: string; orderId: string } | null = null;

  const publish = (patch: Partial<AfterUploadState>) => {
    state = { ...state, ...patch };
    write(state);
  };

  function fullTarget(): string | null {
    if (!deps.getTechnicianId()) return null;
    if (!deps.isFocused()) return null;
    const order = deps.getOrder();
    if (!order) return null;
    const target = afterUploadTarget(order);
    if (!target || order.id !== target) return null;
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
    if (!fullTarget()) {
      deps.notify('Chưa thể tải ảnh sau sửa chữa', 'Đơn cần ở trạng thái đang sửa và chưa yêu cầu hoàn thành mới tải được ảnh sau sửa chữa.');
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
    const pickTarget = fullTarget();
    if (!pickTarget) {
      deps.notify('Chưa thể tải ảnh sau sửa chữa', 'Đơn cần ở trạng thái đang sửa và chưa yêu cầu hoàn thành mới tải được ảnh sau sửa chữa.');
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
    const target = fullTarget();
    if (!target || target !== owner.orderId) {
      discardSelection();
      deps.notify('Chưa thể tải ảnh sau sửa chữa', 'Đơn cần ở trạng thái đang sửa và chưa yêu cầu hoàn thành mới tải được ảnh sau sửa chữa.');
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
      await deps.uploadAfter(target, { uri: selected.uri, name: selected.name, type: selected.mime });
      if (!sameSession()) {
        discardSelection();
        return;
      }
      if (fullTarget() !== target) {
        discardSelection();
        return;
      }
      state = { pending: null, busy: true, error: null };
      write(state);
      deps.notify('Đã tải ảnh', 'Ảnh sau sửa chữa đã được tải lên. Ảnh mới sẽ hiển thị sau khi tải lại.');
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
