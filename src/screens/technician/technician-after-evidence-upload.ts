import type { EvidenceResponse, EvidenceUploadImage } from '../../api/orders.api';
import { orderDetailTarget } from '../customer/customer-order-detail';
import {
  validateEvidenceAsset,
  type PendingUpload,
  type PickerOutcome,
  type PickerPermission,
  type PickerSource,
} from './technician-evidence-upload';

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
  needsVerify: boolean;
}

export const initialAfterUploadState: AfterUploadState = {
  pending: null,
  busy: false,
  error: null,
  needsVerify: false,
};

export interface AfterEvidenceUploadDeps {
  getOrder: () => AfterUploadOrderGate | null;
  getTechnicianId: () => string | null;
  isFocused: () => boolean;
  requestPermission: (source: PickerSource) => Promise<PickerPermission>;
  launchPicker: (source: PickerSource) => Promise<PickerOutcome>;
  uploadAfter: (
    orderId: string,
    image: EvidenceUploadImage,
  ) => Promise<unknown>;
  getEvidence: (orderId: string) => Promise<EvidenceResponse[]>;
  refreshEvidence: () => Promise<void>;
  onAccessDenied: () => void;
  notify: (title: string, message: string) => void;
}

interface AfterUploadAttempt {
  baselineIds: string[];
  expectedId: string | null;
}

const attemptsByTechnician = new Map<
  string,
  Map<string, AfterUploadAttempt>
>();

function attemptsFor(
  technicianId: string,
): Map<string, AfterUploadAttempt> {
  let attempts = attemptsByTechnician.get(technicianId);
  if (!attempts) {
    attempts = new Map<string, AfterUploadAttempt>();
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

function afterEvidenceIds(
  rows: readonly EvidenceResponse[],
  orderId: string,
): string[] {
  return rows
    .filter(
      (row) =>
        row.serviceOrderId === orderId &&
        String(row.type).toUpperCase() === 'AFTER' &&
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

export function afterUploadTarget(
  order: AfterUploadOrderGate | null,
): string | null {
  if (!order || order.historical === true) return null;
  const target = orderDetailTarget(order.id);
  if (!target) return null;
  if (String(order.status).toUpperCase() !== 'UNDER_REPAIR') return null;
  if (order.completionRequestedAt) return null;
  return target;
}

export function createAfterEvidenceUploadController(
  deps: AfterEvidenceUploadDeps,
  write: (state: AfterUploadState) => void,
) {
  let state: AfterUploadState = { ...initialAfterUploadState };
  let uploading = false;
  let pendingOwner: { technicianId: string; orderId: string } | null =
    null;

  const publish = (patch: Partial<AfterUploadState>) => {
    state = { ...state, ...patch };
    write(state);
  };

  function fullTarget(): string | null {
    if (!deps.getTechnicianId() || !deps.isFocused()) return null;
    const order = deps.getOrder();
    if (!order) return null;
    const target = afterUploadTarget(order);
    return target && order.id === target ? target : null;
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

    const target = fullTarget();
    if (!target) {
      deps.notify(
        'Chưa thể tải ảnh sau sửa chữa',
        'Đơn phải đang sửa chữa và chưa yêu cầu hoàn thành.',
      );
      return;
    }

    if (attemptsFor(technicianId).has(target)) {
      publish({
        needsVerify: true,
        error:
          'Có ảnh AFTER đang chờ xác minh. Không chọn hoặc gửi ảnh mới.',
      });
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
        'Hãy cấp quyền trong Cài đặt rồi quay lại thử lại.',
      );
      return;
    }
    if (permission === 'unavailable') {
      deps.notify(
        'Không mở được ảnh',
        'Thiết bị chưa sẵn sàng cho camera/thư viện.',
      );
      return;
    }

    let outcome: PickerOutcome;
    try {
      outcome = await deps.launchPicker(source);
    } catch {
      deps.notify('Không mở được ảnh', 'Vui lòng thử lại.');
      return;
    }
    if (!sameSession() || outcome.canceled) return;

    const currentTarget = fullTarget();
    if (!currentTarget || currentTarget !== target) {
      deps.notify(
        'Đơn đã thay đổi',
        'Không chọn ảnh cho trạng thái cũ. Hãy làm mới chi tiết đơn.',
      );
      return;
    }

    const validated = validateEvidenceAsset(outcome.asset);
    if ('error' in validated) {
      deps.notify('Ảnh chưa hợp lệ', validated.error);
      return;
    }

    pendingOwner = { technicianId, orderId: target };
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
      if (sameSession()) publish({ needsVerify: false });
      return false;
    }

    try {
      const rows = await deps.getEvidence(orderId);
      if (!sameSession()) return false;

      const currentIds = afterEvidenceIds(rows, orderId);
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
            'GET chưa đủ bằng chứng để xác nhận lần tải ảnh AFTER trước. Không gửi POST lại.',
        });
        if (notifyResult) {
          deps.notify(
            'Chưa xác minh ảnh AFTER',
            'Không gửi lại ảnh. Hãy kiểm tra bằng chứng hiện tại.',
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
        error: null,
        needsVerify: false,
      });
      deps.notify(
        'Đã xác minh ảnh AFTER',
        'GET bằng chứng đã xác nhận ảnh sau sửa chữa mới trên đúng ServiceOrder.',
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
          'Chưa thể đối chiếu bằng chứng AFTER từ máy chủ. Không gửi POST lại.',
      });
      if (notifyResult) {
        deps.notify(
          'Chưa xác minh ảnh AFTER',
          'Không gửi lại ảnh. Hãy kiểm tra kết nối rồi thử GET lại.',
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

    const target = fullTarget();
    if (!target || target !== owner.orderId) {
      discardSelection();
      deps.notify(
        'Đơn đã thay đổi',
        'Không tải ảnh cho trạng thái cũ. Hãy làm mới chi tiết đơn.',
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
          'Lần tải ảnh AFTER trước đang chờ xác minh. Không gửi POST lại.',
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
            'Vui lòng đăng nhập lại để tiếp tục.',
          );
          return;
        }

        publish({
          busy: false,
          needsVerify: false,
          error:
            'Chưa tải được bằng chứng hiện tại nên chưa gửi ảnh AFTER.',
        });
        return;
      }

      if (!sameSession()) {
        discardSelection();
        return;
      }

      attempts.set(target, {
        baselineIds: afterEvidenceIds(baselineRows, target),
        expectedId: null,
      });

      let response: unknown;
      try {
        response = await deps.uploadAfter(target, {
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
              'Vui lòng đăng nhập lại để tiếp tục.',
            );
            return;
          }

          publish({
            busy: false,
            needsVerify: false,
            error:
              'Máy chủ từ chối tải ảnh AFTER' +
              (typeof status === 'number'
                ? ' (mã ' + status + ')'
                : '') +
              '. Chưa ghi nhận ảnh mới.',
          });
          return;
        }

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
              'Kết quả tải ảnh AFTER chưa xác định. Không gửi POST lại.',
          });
          deps.notify(
            'Chưa xác minh ảnh AFTER',
            'Không gửi lại; chỉ đối chiếu bằng GET.',
          );
        }
        return;
      }

      if (!sameSession()) return;
      const attempt = attempts.get(target);
      if (attempt) {
        attempt.expectedId = responseEvidenceId(response);
      }

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
            'POST đã phản hồi nhưng GET chưa xác nhận ảnh AFTER mới. Không gửi POST lại.',
        });
        deps.notify(
          'Đang xác minh ảnh AFTER',
          'HTTP thành công chưa đủ; cần GET bằng chứng xác nhận.',
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
    const target = fullTarget();
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
