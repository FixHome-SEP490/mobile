import { isHistoricalOrder } from '../../../api/orders.api';
import {
  sameOrderSession,
  type OrderSessionKey,
  type OrderResourceKind,
  type OrderPartReadModel,
} from '../domain/order-session.types';
import { createOrderCommandAdapter, type CommandReadbackVerdict } from '../runtime/order-controller-adapters';
import type { OrderCommandJournal, OrderCommandOperation } from '../runtime/order-command-journal';
import type { OrderReadCoordinator } from '../runtime/order-read-coordinator';
import {
  partRequestsApi,
  type PartRequest,
  type PartRequestItem,
  type CreatePartRequestPayload,
} from '../../../api/part-requests.api';

export const PART_REQUEST_REASON_MAX = 2000;
export const PART_ITEM_NOTE_MAX = 500;
export const PART_ITEMS_MIN = 1;
export const PART_ITEMS_MAX = 50;
export const PART_QUANTITY_MIN = 1;
export const PART_QUANTITY_MAX = 100;
export const QR_TOKEN_MAX = 128;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function isValidUuid(id: unknown): id is string {
  return typeof id === 'string' && UUID_REGEX.test(id.trim());
}

export function validateCreatePreRepairPayload(payload: unknown): CreatePartRequestPayload {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Dữ liệu yêu cầu linh kiện không hợp lệ.');
  }
  const raw = payload as Record<string, unknown>;
  if (!Array.isArray(raw.items)) {
    throw new Error('Danh sách linh kiện phải là một mảng.');
  }
  if (raw.items.length < PART_ITEMS_MIN || raw.items.length > PART_ITEMS_MAX) {
    throw new Error(`Số lượng loại linh kiện yêu cầu phải từ ${PART_ITEMS_MIN} đến ${PART_ITEMS_MAX}.`);
  }

  const items = raw.items.map((itemRaw, index) => {
    if (!itemRaw || typeof itemRaw !== 'object') {
      throw new Error(`Linh kiện thứ ${index + 1} không hợp lệ.`);
    }
    const item = itemRaw as Record<string, unknown>;
    const partCatalogId = typeof item.partCatalogId === 'string' ? item.partCatalogId.trim() : '';
    if (!isValidUuid(partCatalogId)) {
      throw new Error(`Mã linh kiện trong danh mục thứ ${index + 1} không phải UUID hợp lệ.`);
    }

    const quantity = typeof item.quantity === 'number' && Number.isSafeInteger(item.quantity)
      ? item.quantity
      : null;
    if (quantity === null || quantity < PART_QUANTITY_MIN || quantity > PART_QUANTITY_MAX) {
      throw new Error(`Số lượng linh kiện thứ ${index + 1} phải là số nguyên từ ${PART_QUANTITY_MIN} đến ${PART_QUANTITY_MAX}.`);
    }

    let note: string | undefined;
    if (item.note !== undefined && item.note !== null) {
      if (typeof item.note !== 'string') throw new Error(`Ghi chú linh kiện thứ ${index + 1} phải là chuỗi văn bản.`);
      const trimmedNote = item.note.trim();
      if (trimmedNote.length > PART_ITEM_NOTE_MAX) {
        throw new Error(`Ghi chú linh kiện thứ ${index + 1} không được vượt quá ${PART_ITEM_NOTE_MAX} ký tự.`);
      }
      note = trimmedNote.length > 0 ? trimmedNote : undefined;
    }

    return { partCatalogId, quantity, ...(note ? { note } : {}) };
  });

  let reason: string | undefined;
  if (raw.reason !== undefined && raw.reason !== null) {
    if (typeof raw.reason !== 'string') throw new Error('Lý do yêu cầu phải là chuỗi văn bản.');
    const trimmedReason = raw.reason.trim();
    if (trimmedReason.length > PART_REQUEST_REASON_MAX) {
      throw new Error(`Lý do yêu cầu không được vượt quá ${PART_REQUEST_REASON_MAX} ký tự.`);
    }
    reason = trimmedReason.length > 0 ? trimmedReason : undefined;
  }

  let fulfillmentMethod: 'pickup' | 'delivery' = 'pickup';
  if (raw.fulfillmentMethod !== undefined && raw.fulfillmentMethod !== null) {
    if (raw.fulfillmentMethod !== 'pickup' && raw.fulfillmentMethod !== 'delivery') {
      throw new Error('Hình thức nhận linh kiện không hợp lệ (chỉ chấp nhận "pickup" hoặc "delivery").');
    }
    fulfillmentMethod = raw.fulfillmentMethod;
  }

  return { items, fulfillmentMethod, ...(reason ? { reason } : {}) };
}

export function validateReceiveQrToken(token: unknown): string {
  if (typeof token !== 'string') throw new Error('Mã QR không hợp lệ.');
  const trimmed = token.trim();
  if (trimmed.length < 1 || trimmed.length > QR_TOKEN_MAX) {
    throw new Error(`Mã QR phải có độ dài từ 1 đến ${QR_TOKEN_MAX} ký tự.`);
  }
  return trimmed;
}

export function validateItemUsageStatus(status: unknown): 'used' | 'returned' {
  const normalized = String(status ?? '').toLowerCase().trim();
  if (normalized !== 'used' && normalized !== 'returned') {
    throw new Error('Trạng thái sử dụng linh kiện phải là "used" hoặc "returned".');
  }
  return normalized as 'used' | 'returned';
}

export function validateCancelReason(reason?: unknown): string | undefined {
  if (reason === undefined || reason === null) return undefined;
  if (typeof reason !== 'string') throw new Error('Lý do hủy phải là chuỗi văn bản.');
  const trimmed = reason.trim();
  if (trimmed.length > PART_REQUEST_REASON_MAX) {
    throw new Error(`Lý do hủy không được vượt quá ${PART_REQUEST_REASON_MAX} ký tự.`);
  }
  return trimmed.length > 0 ? trimmed : undefined;
}

export interface TechnicianPartsTransport {
  createPreRepair: (orderId: string, payload: CreatePartRequestPayload) => Promise<PartRequest>;
  receiveByQr: (requestId: string, qrToken: string) => Promise<PartRequest>;
  updateItemUsage: (requestId: string, itemId: string, usageStatus: 'used' | 'returned') => Promise<PartRequestItem>;
  cancel: (requestId: string, reason?: string) => Promise<PartRequest>;
  getPartRequest?: (requestId: string) => Promise<PartRequest>;
}

export interface TechnicianPartsControllerDeps {
  journal: OrderCommandJournal;
  readCoordinator: OrderReadCoordinator;
  isCurrent: (key: OrderSessionKey) => boolean;
  notify?: (title: string, message: string) => void;
  transport?: TechnicianPartsTransport;
}

export interface TechnicianPartsControllerState {
  phase: 'idle' | 'submitting' | 'verifying' | 'resolved' | 'denied' | 'unknown';
  operation: 'parts-create' | 'parts-receive' | 'parts-usage' | 'parts-cancel' | null;
  targetId: string | null;
  error: string | null;
  actionSuccess: string | null;
  resolvedEntityId: string | null;
}

const defaultTransport: TechnicianPartsTransport = {
  createPreRepair: (orderId, payload) => partRequestsApi.createPreRepair(orderId, payload),
  receiveByQr: (requestId, token) => partRequestsApi.receiveByQr(requestId, token),
  updateItemUsage: (requestId, itemId, usageStatus) => partRequestsApi.updateItemUsage(requestId, itemId, usageStatus),
  cancel: (requestId, reason) => partRequestsApi.cancel(requestId, reason),
  getPartRequest: (requestId) => partRequestsApi.getById(requestId),
};

function currentOrder(coordinator: OrderReadCoordinator, key: OrderSessionKey) {
  const s = coordinator.getSnapshot();
  if (!s || !sameOrderSession(s.key, key) || s.access !== 'current') return null;
  return s.order.status === 'ready' && !isHistoricalOrder(s.order.data) ? s.order.data : null;
}

function currentParts(coordinator: OrderReadCoordinator, key: OrderSessionKey): OrderPartReadModel[] | null {
  const s = coordinator.getSnapshot();
  if (!s || !sameOrderSession(s.key, key) || s.access !== 'current') return null;
  const parts = s.resources.parts;
  return parts?.status === 'ready' && Array.isArray(parts?.data) ? parts.data : null;
}

export function createTechnicianPartsController(deps: TechnicianPartsControllerDeps) {
  const transport = deps.transport ?? defaultTransport;

  async function refresh(key: OrderSessionKey, resources: OrderResourceKind[] = ['parts']) {
    await deps.readCoordinator.refreshOrderSession(key, 'command-readback');
    if (!currentOrder(deps.readCoordinator, key)) return;
    await Promise.all(
      resources
        .filter((kind) => deps.readCoordinator.getSnapshot()?.resources[kind].status === 'unloaded')
        .map((kind) => deps.readCoordinator.loadResource(key, kind)),
    );
  }

  const adapter = createOrderCommandAdapter(deps.journal, {
    isCurrent: deps.isCurrent,
    refresh: async (key) => {
      await refresh(key, ['parts']);
    },
  });

  let state: TechnicianPartsControllerState = {
    phase: 'idle',
    operation: null,
    targetId: null,
    error: null,
    actionSuccess: null,
    resolvedEntityId: null,
  };

  const listeners = new Set<(s: TechnicianPartsControllerState) => void>();
  function publish(patch: Partial<TechnicianPartsControllerState>) {
    state = { ...state, ...patch };
    listeners.forEach((l) => l(state));
  }

  function reset() {
    publish({
      phase: 'idle',
      operation: null,
      targetId: null,
      error: null,
      actionSuccess: null,
      resolvedEntityId: null,
    });
  }

  async function createPreRepair(key: OrderSessionKey, payload: unknown): Promise<void> {
    if (!deps.isCurrent(key) || key.role !== 'technician') return;
    if (state.phase === 'submitting' || state.phase === 'verifying') return;

    let validatedPayload: CreatePartRequestPayload;
    try {
      validatedPayload = validateCreatePreRepairPayload(payload);
    } catch (err) {
      publish({
        phase: 'denied',
        operation: 'parts-create',
        targetId: key.serviceOrderId,
        error: (err as Error).message,
        actionSuccess: null,
      });
      return;
    }

    // Preflight refresh parts resource
    try {
      await refresh(key, ['parts']);
    } catch {
      publish({
        phase: 'denied',
        operation: 'parts-create',
        targetId: key.serviceOrderId,
        error: 'Không thể tải danh sách linh kiện để kiểm tra điều kiện. Vui lòng thử lại.',
        actionSuccess: null,
      });
      return;
    }

    if (!deps.isCurrent(key)) return;

    // Gate verification: order must be ACCEPTED, tech matches, and parts list is ready
    const order = currentOrder(deps.readCoordinator, key);
    if (!order || isHistoricalOrder(order) || order.technician?.id !== key.userId) {
      publish({ phase: 'denied', operation: 'parts-create', error: 'Chỉ kỹ thuật viên phụ trách mới có quyền yêu cầu linh kiện.', actionSuccess: null });
      return;
    }
    if (String(order.status).toUpperCase() !== 'ACCEPTED') {
      publish({ phase: 'denied', operation: 'parts-create', error: 'Yêu cầu linh kiện dự kiến chỉ được tạo khi đơn ở trạng thái ĐÃ TIẾP NHẬN (ACCEPTED).', actionSuccess: null });
      return;
    }

    const partsList = currentParts(deps.readCoordinator, key);
    if (!partsList) {
      publish({ phase: 'denied', operation: 'parts-create', error: 'Dữ liệu linh kiện chưa sẵn sàng. Vui lòng thử lại.', actionSuccess: null });
      return;
    }
    const hasActivePreRepair = partsList.some(
      (pr) => pr.requestType === 'pre_repair' && pr.status !== 'cancelled',
    );
    if (hasActivePreRepair) {
      publish({ phase: 'denied', operation: 'parts-create', error: 'Đơn hàng đã có yêu cầu linh kiện dự kiến chưa hủy.', actionSuccess: null });
      return;
    }

    const intentId = `parts-create-${Date.now()}`;
    let createdId: string | null = null;
    publish({ phase: 'submitting', operation: 'parts-create', targetId: key.serviceOrderId, error: null, actionSuccess: null });

    await adapter.dispatch(
      key,
      {
        intentId,
        entityId: key.serviceOrderId,
        operation: 'parts-create',
      },
      async () => {
        // Deferred gate check immediately before transport call
        const currentSnapOrder = currentOrder(deps.readCoordinator, key);
        if (
          !deps.isCurrent(key) ||
          !currentSnapOrder ||
          String(currentSnapOrder.status).toUpperCase() !== 'ACCEPTED' ||
          currentSnapOrder.technician?.id !== key.userId
        ) {
          throw new Error('Session, technician or order status changed before create parts dispatch.');
        }
        const liveParts = currentParts(deps.readCoordinator, key);
        if (!liveParts || liveParts.some((pr) => pr.requestType === 'pre_repair' && pr.status !== 'cancelled')) {
          throw new Error('Active pre-repair parts request exists before dispatch.');
        }

        const res = await transport.createPreRepair(key.serviceOrderId, validatedPayload);
        if (res && typeof res === 'object' && typeof res.id === 'string' && res.id.trim()) {
          createdId = res.id.trim();
          await deps.journal.recordEntity(key.userId, intentId, createdId);
        }
      },
      async (): Promise<CommandReadbackVerdict> => {
        const marker = deps.journal.list(key.userId).find((m) => m.intentId === intentId);
        const targetId = createdId ?? marker?.resultEntityId;
        if (!targetId) return 'unresolved';
        try {
          const detail = transport.getPartRequest
            ? await transport.getPartRequest(targetId)
            : currentParts(deps.readCoordinator, key)?.find((p) => p.id === targetId);
          if (!detail || detail.id !== targetId) return 'unresolved';
          if (detail.serviceOrderId !== key.serviceOrderId) return 'unresolved';
          if (detail.technicianId !== key.userId) return 'unresolved';
          if (detail.status !== 'requested') return 'unresolved';
          return 'resolved';
        } catch {
          return 'unresolved';
        }
      },
    );

    if (!deps.isCurrent(key)) return;
    const finalMarker = deps.journal.list(key.userId).find((m) => m.intentId === intentId);
    if (finalMarker?.status === 'resolved') {
      publish({
        phase: 'resolved',
        operation: 'parts-create',
        resolvedEntityId: createdId ?? finalMarker.resultEntityId ?? null,
        actionSuccess: 'Đã gửi yêu cầu linh kiện dự kiến thành công!',
        error: null,
      });
      deps.notify?.('Yêu cầu linh kiện', 'Đã gửi yêu cầu linh kiện dự kiến thành công.');
    } else {
      publish({
        phase: 'unknown',
        operation: 'parts-create',
        error: 'Chưa xác nhận yêu cầu linh kiện đã được tạo. Hãy tải lại danh sách linh kiện để kiểm tra trước khi thử lại.',
        actionSuccess: null,
      });
    }
  }

  async function receiveByQr(key: OrderSessionKey, requestId: string, qrToken: unknown): Promise<void> {
    if (!deps.isCurrent(key) || key.role !== 'technician') return;
    if (state.phase === 'submitting' || state.phase === 'verifying') return;

    let token: string;
    try {
      token = validateReceiveQrToken(qrToken);
    } catch (err) {
      publish({ phase: 'denied', operation: 'parts-receive', targetId: requestId, error: (err as Error).message, actionSuccess: null });
      return;
    }

    // Gate check
    const order = currentOrder(deps.readCoordinator, key);
    if (!order || isHistoricalOrder(order) || order.technician?.id !== key.userId) {
      publish({ phase: 'denied', operation: 'parts-receive', targetId: requestId, error: 'Chỉ kỹ thuật viên phụ trách mới có quyền nhận linh kiện.', actionSuccess: null });
      return;
    }

    const partsList = currentParts(deps.readCoordinator, key);
    if (!partsList) {
      publish({ phase: 'denied', operation: 'parts-receive', targetId: requestId, error: 'Dữ liệu linh kiện chưa sẵn sàng.', actionSuccess: null });
      return;
    }
    const targetRequest = partsList.find((p) => p.id === requestId);
    if (!targetRequest) {
      publish({ phase: 'denied', operation: 'parts-receive', targetId: requestId, error: 'Không tìm thấy yêu cầu linh kiện.', actionSuccess: null });
      return;
    }
    if (targetRequest.technicianId && targetRequest.technicianId !== key.userId) {
      publish({ phase: 'denied', operation: 'parts-receive', targetId: requestId, error: 'Yêu cầu linh kiện thuộc về kỹ thuật viên khác.', actionSuccess: null });
      return;
    }

    // Fulfillment status validation: pickup requires READY, delivery requires DELIVERING
    if (targetRequest.fulfillmentMethod === 'pickup' && targetRequest.status !== 'ready') {
      publish({ phase: 'denied', operation: 'parts-receive', targetId: requestId, error: 'Linh kiện tự lấy phải ở trạng thái ĐÃ SẴN SÀNG (ready) để nhận.', actionSuccess: null });
      return;
    }
    if (targetRequest.fulfillmentMethod === 'delivery' && targetRequest.status !== 'delivering') {
      publish({ phase: 'denied', operation: 'parts-receive', targetId: requestId, error: 'Linh kiện giao hàng phải ở trạng thái ĐANG GIAO (delivering) để nhận.', actionSuccess: null });
      return;
    }
    if (!targetRequest.fulfillmentMethod && targetRequest.status !== 'ready' && targetRequest.status !== 'delivering') {
      publish({ phase: 'denied', operation: 'parts-receive', targetId: requestId, error: 'Linh kiện chưa ở trạng thái sẵn sàng nhận.', actionSuccess: null });
      return;
    }

    const intentId = `parts-receive-${Date.now()}`;
    publish({ phase: 'submitting', operation: 'parts-receive', targetId: requestId, error: null, actionSuccess: null });

    await adapter.dispatch(
      key,
      {
        intentId,
        entityId: requestId,
        operation: 'parts-receive',
      },
      async () => {
        // Deferred session & entity check: do NOT log or persist qrToken in journal
        const liveOrder = currentOrder(deps.readCoordinator, key);
        if (!deps.isCurrent(key) || !liveOrder || liveOrder.technician?.id !== key.userId) {
          throw new Error('Session or technician changed before receiveByQr dispatch.');
        }
        const liveParts = currentParts(deps.readCoordinator, key);
        const liveReq = liveParts?.find((p) => p.id === requestId);
        if (!liveReq || liveReq.technicianId !== key.userId) {
          throw new Error('Target request missing or foreign before receiveByQr dispatch.');
        }
        const expectedStatus = liveReq.fulfillmentMethod === 'delivery' ? 'delivering' : 'ready';
        if (!['pickup', 'delivery'].includes(liveReq.fulfillmentMethod ?? '') || liveReq.status !== expectedStatus) {
          throw new Error('Target request status invalid before receiveByQr dispatch.');
        }
        await transport.receiveByQr(requestId, token);
      },
      async (): Promise<CommandReadbackVerdict> => {
        try {
          const detail = transport.getPartRequest
            ? await transport.getPartRequest(requestId)
            : currentParts(deps.readCoordinator, key)?.find((p) => p.id === requestId);
          if (!detail || detail.id !== requestId) return 'unresolved';
          if (detail.serviceOrderId !== key.serviceOrderId) return 'unresolved';
          if (detail.technicianId !== key.userId) return 'unresolved';
          if (detail.status === 'received') return 'resolved';
          return 'unresolved';
        } catch {
          return 'unresolved';
        }
      },
    );

    if (!deps.isCurrent(key)) return;
    const finalMarker = deps.journal.list(key.userId).find((m) => m.intentId === intentId);
    if (finalMarker?.status === 'resolved') {
      publish({
        phase: 'resolved',
        operation: 'parts-receive',
        resolvedEntityId: requestId,
        actionSuccess: 'Xác nhận nhận linh kiện thành công!',
        error: null,
      });
      deps.notify?.('Nhận linh kiện', 'Đã nhận linh kiện thành công.');
    } else {
      publish({
        phase: 'unknown',
        operation: 'parts-receive',
        error: 'Chưa xác nhận trạng thái nhận linh kiện. Hãy làm mới để kiểm tra trước khi thử lại.',
        actionSuccess: null,
      });
    }
  }

  async function updateItemUsage(
    key: OrderSessionKey,
    requestId: string,
    itemId: string,
    status: unknown,
  ): Promise<void> {
    if (!deps.isCurrent(key) || key.role !== 'technician') return;
    if (state.phase === 'submitting' || state.phase === 'verifying') return;

    let usageStatus: 'used' | 'returned';
    try {
      usageStatus = validateItemUsageStatus(status);
    } catch (err) {
      publish({ phase: 'denied', operation: 'parts-usage', targetId: itemId, error: (err as Error).message, actionSuccess: null });
      return;
    }

    // Gate check
    const order = currentOrder(deps.readCoordinator, key);
    if (!order || isHistoricalOrder(order) || order.technician?.id !== key.userId) {
      publish({ phase: 'denied', operation: 'parts-usage', targetId: itemId, error: 'Chỉ kỹ thuật viên phụ trách mới có quyền cập nhật linh kiện.', actionSuccess: null });
      return;
    }
    if (String(order.status).toUpperCase() !== 'UNDER_REPAIR' || !!order.completionRequestedAt) {
      publish({ phase: 'denied', operation: 'parts-usage', targetId: itemId, error: 'Ghi nhận linh kiện yêu cầu đơn ở trạng thái ĐANG SỬA (UNDER_REPAIR) trước khi yêu cầu hoàn tất.', actionSuccess: null });
      return;
    }

    const partsList = currentParts(deps.readCoordinator, key);
    if (!partsList) {
      publish({ phase: 'denied', operation: 'parts-usage', targetId: itemId, error: 'Dữ liệu linh kiện chưa sẵn sàng.', actionSuccess: null });
      return;
    }
    const targetRequest = partsList.find((p) => p.id === requestId);
    if (!targetRequest) {
      publish({ phase: 'denied', operation: 'parts-usage', targetId: itemId, error: 'Không tìm thấy yêu cầu linh kiện.', actionSuccess: null });
      return;
    }
    if (targetRequest.technicianId && targetRequest.technicianId !== key.userId) {
      publish({ phase: 'denied', operation: 'parts-usage', targetId: itemId, error: 'Yêu cầu linh kiện thuộc về kỹ thuật viên khác.', actionSuccess: null });
      return;
    }
    if (targetRequest.status !== 'received') {
      publish({ phase: 'denied', operation: 'parts-usage', targetId: itemId, error: 'Chỉ có thể ghi nhận sử dụng linh kiện sau khi đã nhận (RECEIVED).', actionSuccess: null });
      return;
    }
    const targetItem = targetRequest.items?.find((i) => i.id === itemId);
    if (!targetItem) {
      publish({ phase: 'denied', operation: 'parts-usage', targetId: itemId, error: 'Không tìm thấy hạng mục linh kiện cần cập nhật.', actionSuccess: null });
      return;
    }

    const intentId = `parts-usage-${Date.now()}`;
    const stableKey = `usage:${usageStatus}:${itemId}`;
    publish({ phase: 'submitting', operation: 'parts-usage', targetId: itemId, error: null, actionSuccess: null });

    await adapter.dispatch(
      key,
      {
        intentId,
        entityId: `${requestId}__${itemId}`,
        operation: 'parts-usage',
        stableKey,
      },
      async () => {
        const liveOrder = currentOrder(deps.readCoordinator, key);
        if (!deps.isCurrent(key) || !liveOrder || String(liveOrder.status).toUpperCase() !== 'UNDER_REPAIR' || !!liveOrder.completionRequestedAt || liveOrder.technician?.id !== key.userId) {
          throw new Error('Order status or technician changed before updateItemUsage dispatch.');
        }
        const liveParts = currentParts(deps.readCoordinator, key);
        const liveReq = liveParts?.find((p) => p.id === requestId);
        if (!liveReq || liveReq.technicianId !== key.userId || liveReq.status !== 'received') {
          throw new Error('Target request invalid or not received before updateItemUsage dispatch.');
        }
        const liveItem = liveReq.items?.find((i) => i.id === itemId);
        if (!liveItem) {
          throw new Error('Target item missing before updateItemUsage dispatch.');
        }
        await transport.updateItemUsage(requestId, itemId, usageStatus);
      },
      async (): Promise<CommandReadbackVerdict> => {
        try {
          const detail = transport.getPartRequest
            ? await transport.getPartRequest(requestId)
            : currentParts(deps.readCoordinator, key)?.find((p) => p.id === requestId);
          if (!detail || detail.id !== requestId) return 'unresolved';
          if (detail.serviceOrderId !== key.serviceOrderId) return 'unresolved';
          if (detail.technicianId !== key.userId) return 'unresolved';
          const item = detail.items?.find((i) => i.id === itemId);
          if (!item) return 'unresolved';
          if (item.usageStatus === usageStatus) return 'resolved';
          return 'unresolved';
        } catch {
          return 'unresolved';
        }
      },
    );

    if (!deps.isCurrent(key)) return;
    const finalMarker = deps.journal.list(key.userId).find((m) => m.intentId === intentId);
    if (finalMarker?.status === 'resolved') {
      publish({
        phase: 'resolved',
        operation: 'parts-usage',
        resolvedEntityId: itemId,
        actionSuccess: usageStatus === 'used' ? 'Đã ghi nhận linh kiện ĐÃ DÙNG.' : 'Đã ghi nhận linh kiện HOÀN TRẢ.',
        error: null,
      });
      deps.notify?.(
        'Sử dụng linh kiện',
        usageStatus === 'used' ? 'Đã ghi nhận linh kiện đã dùng.' : 'Đã ghi nhận linh kiện hoàn trả.',
      );
    } else {
      publish({
        phase: 'unknown',
        operation: 'parts-usage',
        error: 'Chưa xác nhận trạng thái linh kiện. Hãy làm mới để kiểm tra trước khi thử lại.',
        actionSuccess: null,
      });
    }
  }

  async function cancelPartRequest(key: OrderSessionKey, requestId: string, reason?: unknown): Promise<void> {
    if (!deps.isCurrent(key) || key.role !== 'technician') return;
    if (state.phase === 'submitting' || state.phase === 'verifying') return;

    let validatedReason: string | undefined;
    try {
      validatedReason = validateCancelReason(reason);
    } catch (err) {
      publish({ phase: 'denied', operation: 'parts-cancel', targetId: requestId, error: (err as Error).message, actionSuccess: null });
      return;
    }

    // Gate check: Tech can only cancel if still REQUESTED
    const order = currentOrder(deps.readCoordinator, key);
    if (!order || isHistoricalOrder(order) || order.technician?.id !== key.userId) {
      publish({ phase: 'denied', operation: 'parts-cancel', targetId: requestId, error: 'Chỉ kỹ thuật viên phụ trách mới có quyền hủy yêu cầu.', actionSuccess: null });
      return;
    }

    const partsList = currentParts(deps.readCoordinator, key);
    if (!partsList) {
      publish({ phase: 'denied', operation: 'parts-cancel', targetId: requestId, error: 'Dữ liệu linh kiện chưa sẵn sàng.', actionSuccess: null });
      return;
    }
    const targetRequest = partsList.find((p) => p.id === requestId);
    if (!targetRequest) {
      publish({ phase: 'denied', operation: 'parts-cancel', targetId: requestId, error: 'Không tìm thấy yêu cầu linh kiện.', actionSuccess: null });
      return;
    }
    if (targetRequest.technicianId && targetRequest.technicianId !== key.userId) {
      publish({ phase: 'denied', operation: 'parts-cancel', targetId: requestId, error: 'Yêu cầu linh kiện thuộc về kỹ thuật viên khác.', actionSuccess: null });
      return;
    }
    if (targetRequest.status !== 'requested') {
      publish({ phase: 'denied', operation: 'parts-cancel', targetId: requestId, error: 'Kỹ thuật viên chỉ có thể hủy yêu cầu khi đang ở trạng thái ĐÃ GỬI (REQUESTED).', actionSuccess: null });
      return;
    }

    const intentId = `parts-cancel-${Date.now()}`;
    publish({ phase: 'submitting', operation: 'parts-cancel', targetId: requestId, error: null, actionSuccess: null });

    await adapter.dispatch(
      key,
      {
        intentId,
        entityId: requestId,
        operation: 'parts-cancel',
      },
      async () => {
        const liveOrder = currentOrder(deps.readCoordinator, key);
        if (!deps.isCurrent(key) || !liveOrder || liveOrder.technician?.id !== key.userId) {
          throw new Error('Order or technician changed before cancelPartRequest dispatch.');
        }
        const liveParts = currentParts(deps.readCoordinator, key);
        const liveReq = liveParts?.find((p) => p.id === requestId);
        if (!liveReq || liveReq.technicianId !== key.userId || liveReq.status !== 'requested') {
          throw new Error('Target request invalid or not requested before cancelPartRequest dispatch.');
        }
        await transport.cancel(requestId, validatedReason);
      },
      async (): Promise<CommandReadbackVerdict> => {
        try {
          const detail = transport.getPartRequest
            ? await transport.getPartRequest(requestId)
            : currentParts(deps.readCoordinator, key)?.find((p) => p.id === requestId);
          if (!detail || detail.id !== requestId) return 'unresolved';
          if (detail.serviceOrderId !== key.serviceOrderId) return 'unresolved';
          if (detail.technicianId !== key.userId) return 'unresolved';
          if (detail.status === 'cancelled') return 'resolved';
          return 'unresolved';
        } catch {
          return 'unresolved';
        }
      },
    );

    if (!deps.isCurrent(key)) return;
    const finalMarker = deps.journal.list(key.userId).find((m) => m.intentId === intentId);
    if (finalMarker?.status === 'resolved') {
      publish({
        phase: 'resolved',
        operation: 'parts-cancel',
        resolvedEntityId: requestId,
        actionSuccess: 'Đã hủy yêu cầu linh kiện.',
        error: null,
      });
      deps.notify?.('Hủy yêu cầu linh kiện', 'Đã hủy yêu cầu linh kiện thành công.');
    } else {
      publish({
        phase: 'unknown',
        operation: 'parts-cancel',
        error: 'Chưa xác nhận trạng thái hủy. Hãy làm mới để kiểm tra trước khi thử lại.',
        actionSuccess: null,
      });
    }
  }

  async function verify(key: OrderSessionKey, intentId: string): Promise<void> {
    if (!deps.isCurrent(key)) return;
    const allowedOps: OrderCommandOperation[] = ['parts-create', 'parts-receive', 'parts-usage', 'parts-cancel'];
    const marker = deps.journal.list(key.userId).find(
      (m) =>
        m.intentId === intentId &&
        m.userId === key.userId &&
        m.role === key.role &&
        m.serviceOrderId === key.serviceOrderId &&
        allowedOps.includes(m.operation),
    );
    if (!marker) return;

    publish({ phase: 'verifying', operation: marker.operation as any, targetId: marker.entityId, error: null });

    await adapter.verify(key, intentId, async () => {
      try {
        if (marker.operation === 'parts-create') {
          const createdId = marker.resultEntityId;
          if (!createdId) return 'unresolved';
          const detail = transport.getPartRequest
            ? await transport.getPartRequest(createdId)
            : currentParts(deps.readCoordinator, key)?.find((p) => p.id === createdId);
          return detail?.id === createdId &&
            detail.serviceOrderId === key.serviceOrderId &&
            detail.technicianId === key.userId &&
            detail.status === 'requested'
            ? 'resolved'
            : 'unresolved';
        }
        if (marker.operation === 'parts-receive') {
          const detail = transport.getPartRequest
            ? await transport.getPartRequest(marker.entityId)
            : currentParts(deps.readCoordinator, key)?.find((p) => p.id === marker.entityId);
          return detail?.id === marker.entityId &&
            detail.serviceOrderId === key.serviceOrderId &&
            detail.technicianId === key.userId &&
            detail.status === 'received'
            ? 'resolved'
            : 'unresolved';
        }
        if (marker.operation === 'parts-usage') {
          const [requestId, itemId] = marker.entityId.split('__');
          const parts = marker.stableKey?.split(':') ?? [];
          const desiredOutcome = parts[1] === 'used' || parts[1] === 'returned' ? parts[1] : null;
          if (!desiredOutcome) {
            return 'unresolved';
          }
          const detail = transport.getPartRequest
            ? await transport.getPartRequest(requestId)
            : currentParts(deps.readCoordinator, key)?.find((p) => p.id === requestId);
          if (!detail || detail.id !== requestId || detail.serviceOrderId !== key.serviceOrderId || detail.technicianId !== key.userId) {
            return 'unresolved';
          }
          const item = detail.items?.find((i) => i.id === itemId);
          return item && item.usageStatus === desiredOutcome ? 'resolved' : 'unresolved';
        }
        if (marker.operation === 'parts-cancel') {
          const detail = transport.getPartRequest
            ? await transport.getPartRequest(marker.entityId)
            : currentParts(deps.readCoordinator, key)?.find((p) => p.id === marker.entityId);
          return detail?.id === marker.entityId &&
            detail.serviceOrderId === key.serviceOrderId &&
            detail.technicianId === key.userId &&
            detail.status === 'cancelled'
            ? 'resolved'
            : 'unresolved';
        }
        return 'unresolved';
      } catch {
        return 'unresolved';
      }
    });

    if (!deps.isCurrent(key)) return;
    const finalMarker = deps.journal.list(key.userId).find((m) => m.intentId === intentId);
    if (finalMarker?.status === 'resolved') {
      publish({ phase: 'resolved', operation: marker.operation as any, error: null, actionSuccess: 'Đã xác nhận thành công.' });
    } else {
      publish({ phase: 'unknown', operation: marker.operation as any, error: 'Chưa thể xác nhận. Vui lòng thử lại sau.' });
    }
  }

  return {
    getState: () => state,
    subscribe: (fn: (s: TechnicianPartsControllerState) => void) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    createPreRepair,
    receiveByQr,
    updateItemUsage,
    cancelPartRequest,
    verify,
    reset,
  };
}
