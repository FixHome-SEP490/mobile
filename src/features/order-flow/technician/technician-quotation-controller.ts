import { isHistoricalOrder, type CreateQuotationPayload, type CreateQuotationItem } from '../../../api/orders.api';
import { sameOrderSession, type OrderSessionKey, type OrderResourceKind } from '../domain/order-session.types';
import { createOrderCommandAdapter, type CommandReadbackVerdict } from '../runtime/order-controller-adapters';
import type { OrderCommandJournal, OrderCommandMarker, OrderCommandOperation } from '../runtime/order-command-journal';
import type { OrderReadCoordinator } from '../runtime/order-read-coordinator';

export const QUOTE_DESCRIPTION_MAX = 2000;
export const QUOTE_QUANTITY_MIN = 1;
export const QUOTE_QUANTITY_MAX = 1000;
export const QUOTE_UNIT_PRICE_MIN = 0;
export const QUOTE_UNIT_PRICE_MAX = 999999999;
export const QUOTE_NOTE_MAX = 5000;
export const QUOTE_MIN_ITEMS = 1;
export const QUOTE_MAX_ITEMS = 100;
export const QUOTE_WARRANTY_TERM_MIN = 1;
export const QUOTE_WARRANTY_TERM_MAX = 3650;
export const LABOR_WARRANTY_DAYS_MIN = 0;
export const LABOR_WARRANTY_DAYS_MAX = 3650;
export const LABOR_WARRANTY_DAYS_DEFAULT = 365;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function isValidUuid(id: unknown): id is string {
  return typeof id === 'string' && UUID_REGEX.test(id.trim());
}

function parseSafeInteger(val: unknown): number | null {
  if (typeof val === 'number') {
    return Number.isSafeInteger(val) ? val : null;
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!/^\d+$/.test(trimmed)) return null;
    const num = Number(trimmed);
    return Number.isSafeInteger(num) ? num : null;
  }
  return null;
}

export function validateQuotationPayload(payload: unknown): CreateQuotationPayload {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Dữ liệu báo giá không hợp lệ.');
  }
  const raw = payload as Record<string, unknown>;
  if (!Array.isArray(raw.items)) {
    throw new Error('Danh sách hạng mục phải là một mảng.');
  }
  if (raw.items.length < QUOTE_MIN_ITEMS || raw.items.length > QUOTE_MAX_ITEMS) {
    throw new Error(`Số lượng hạng mục báo giá phải từ ${QUOTE_MIN_ITEMS} đến ${QUOTE_MAX_ITEMS}.`);
  }

  let note: string | undefined;
  if (raw.note !== undefined && raw.note !== null) {
    if (typeof raw.note !== 'string') throw new Error('Ghi chú phải là chuỗi văn bản.');
    const trimmedNote = raw.note.trim();
    if (trimmedNote.length > QUOTE_NOTE_MAX) {
      throw new Error(`Ghi chú không được vượt quá ${QUOTE_NOTE_MAX} ký tự.`);
    }
    note = trimmedNote.length > 0 ? trimmedNote : undefined;
  }

  const items: CreateQuotationItem[] = raw.items.map((itemRaw, index) => {
    if (!itemRaw || typeof itemRaw !== 'object') {
      throw new Error(`Hạng mục thứ ${index + 1} không hợp lệ.`);
    }
    const item = itemRaw as Record<string, unknown>;
    if (typeof item.description !== 'string' || !item.description.trim()) {
      throw new Error(`Hạng mục thứ ${index + 1} chưa có mô tả.`);
    }
    const description = item.description.trim();
    if (description.length > QUOTE_DESCRIPTION_MAX) {
      throw new Error(`Mô tả hạng mục thứ ${index + 1} không được vượt quá ${QUOTE_DESCRIPTION_MAX} ký tự.`);
    }

    const quantity = parseSafeInteger(item.quantity);
    if (quantity === null || quantity < QUOTE_QUANTITY_MIN || quantity > QUOTE_QUANTITY_MAX) {
      throw new Error(`Số lượng hạng mục thứ ${index + 1} phải là số nguyên từ ${QUOTE_QUANTITY_MIN} đến ${QUOTE_QUANTITY_MAX}.`);
    }

    const unitPrice = parseSafeInteger(item.unitPrice);
    if (unitPrice === null || unitPrice < QUOTE_UNIT_PRICE_MIN || unitPrice > QUOTE_UNIT_PRICE_MAX) {
      throw new Error(`Đơn giá hạng mục thứ ${index + 1} phải là số nguyên từ ${QUOTE_UNIT_PRICE_MIN} đến ${QUOTE_UNIT_PRICE_MAX}đ.`);
    }

    const itemType = String(item.type ?? '').toLowerCase();
    if (itemType === 'labor') {
      let warrantyDays: number | undefined;
      if (item.warrantyDays !== undefined && item.warrantyDays !== null) {
        const wDays = parseSafeInteger(item.warrantyDays);
        if (wDays === null || wDays < LABOR_WARRANTY_DAYS_MIN || wDays > LABOR_WARRANTY_DAYS_MAX) {
          throw new Error(`Số ngày bảo hành công thợ phải từ ${LABOR_WARRANTY_DAYS_MIN} đến ${LABOR_WARRANTY_DAYS_MAX}.`);
        }
        warrantyDays = wDays;
      }
      return {
        type: 'labor',
        description,
        quantity,
        unitPrice,
        ...(warrantyDays !== undefined ? { warrantyDays } : {}),
      };
    }

    if (itemType === 'parts_equipment') {
      const partSource = String(item.partSource ?? '').toLowerCase();
      if (partSource === 'fixhome') {
        if (!isValidUuid(item.partCatalogId)) {
          throw new Error(`Linh kiện FixHome ở hạng mục ${index + 1} phải có ID danh mục hợp lệ.`);
        }
        return {
          type: 'parts_equipment',
          partSource: 'fixhome',
          partCatalogId: String(item.partCatalogId).trim(),
          description,
          quantity,
          unitPrice,
          ...(typeof item.partNameSnapshot === 'string' && item.partNameSnapshot.trim() ? { partNameSnapshot: item.partNameSnapshot.trim() } : {}),
          ...(typeof item.partSku === 'string' && item.partSku.trim() ? { partSku: item.partSku.trim() } : {}),
          ...(typeof item.warrantyPolicy === 'string' && item.warrantyPolicy.trim() ? { warrantyPolicy: item.warrantyPolicy.trim() } : {}),
        };
      }

      if (partSource === 'external') {
        return {
          type: 'parts_equipment',
          partSource: 'external',
          partWarrantyOption: 'no_warranty',
          description,
          quantity,
          unitPrice,
        };
      }

      if (partSource === 'technician') {
        const warrantyOption = String(item.partWarrantyOption ?? 'no_warranty').toLowerCase();
        if (warrantyOption === 'paid_warranty') {
          const term = parseSafeInteger(item.warrantyTermDays);
          if (term === null || term < QUOTE_WARRANTY_TERM_MIN || term > QUOTE_WARRANTY_TERM_MAX) {
            throw new Error(`Thời hạn bảo hành linh kiện thợ phải từ ${QUOTE_WARRANTY_TERM_MIN} đến ${QUOTE_WARRANTY_TERM_MAX} ngày.`);
          }
          let warrantyFee: number | undefined;
          if (item.warrantyFee !== undefined && item.warrantyFee !== null) {
            const fee = parseSafeInteger(item.warrantyFee);
            if (fee === null || fee < QUOTE_UNIT_PRICE_MIN || fee > QUOTE_UNIT_PRICE_MAX) {
              throw new Error(`Phí bảo hành linh kiện thợ phải từ ${QUOTE_UNIT_PRICE_MIN} đến ${QUOTE_UNIT_PRICE_MAX}đ.`);
            }
            warrantyFee = fee;
          }
          return {
            type: 'parts_equipment',
            partSource: 'technician',
            partWarrantyOption: 'paid_warranty',
            description,
            quantity,
            unitPrice,
            warrantyTermDays: term,
            ...(warrantyFee !== undefined ? { warrantyFee } : {}),
          };
        }

        return {
          type: 'parts_equipment',
          partSource: 'technician',
          partWarrantyOption: 'no_warranty',
          description,
          quantity,
          unitPrice,
        };
      }

      throw new Error(`Nguồn linh kiện '${partSource}' ở hạng mục ${index + 1} không hợp lệ.`);
    }

    throw new Error(`Loại hạng mục '${itemType}' ở hạng mục ${index + 1} không hợp lệ. Phải là 'labor' hoặc 'parts_equipment'.`);
  });

  return { items, ...(note ? { note } : {}) };
}

export interface TechnicianQuotationTarget {
  orderId: string;
  technicianId: string;
  orderStatus: string;
  pricingMode: string;
}

export interface TechnicianQuotationState {
  phase: 'idle' | 'submitting' | 'verifying' | 'unknown' | 'denied' | 'resolved';
  operation?: OrderCommandOperation;
  message: string | null;
  confirmDraft: {
    owner: string;
    payload: CreateQuotationPayload;
    target: TechnicianQuotationTarget;
  } | null;
  createdQuotationId?: string;
}

export interface TechnicianQuotationTransport {
  createQuotation: (orderId: string, payload: CreateQuotationPayload) => Promise<unknown>;
  getQuotation?: (id: string) => Promise<unknown>;
}

export interface TechnicianQuotationDependencies {
  coordinator: OrderReadCoordinator;
  journal: OrderCommandJournal;
  transport: TechnicianQuotationTransport;
  getKey: () => OrderSessionKey | null;
  isActive: () => boolean;
  newIntentId: () => string;
  now?: () => number;
}

const unknownMessage = 'Kết quả tạo báo giá chưa xác định. Không gửi lại; hãy kiểm tra từ hệ thống hoặc liên hệ hỗ trợ.';

export function createTechnicianQuotationController(deps: TechnicianQuotationDependencies) {
  let state: TechnicianQuotationState = { phase: 'idle', message: null, confirmDraft: null };
  let busy = false;
  const listeners = new Set<() => void>();
  const publish = (next: TechnicianQuotationState) => {
    state = next;
    listeners.forEach(fn => fn());
  };

  const sameKey = (key: OrderSessionKey) =>
    deps.isActive() &&
    sameOrderSession(deps.getKey(), key) &&
    sameOrderSession(deps.coordinator.getSnapshot()?.key ?? null, key);

  const currentOrder = (key: OrderSessionKey) => {
    const s = deps.coordinator.getSnapshot();
    return sameKey(key) &&
      key.role === 'technician' &&
      s?.access === 'current' &&
      s.order.status === 'ready' &&
      !isHistoricalOrder(s.order.data) &&
      s.order.data.id === key.serviceOrderId &&
      s.order.data.technician?.id === key.userId
      ? s.order.data
      : null;
  };

  const currentQuotations = (key: OrderSessionKey) => {
    const s = deps.coordinator.getSnapshot();
    return currentOrder(key) && s?.resources.quotations.status === 'ready'
      ? s.resources.quotations.data.filter(q => q.serviceOrderId === key.serviceOrderId)
      : null;
  };

  function allowed(key: OrderSessionKey): boolean {
    const order = currentOrder(key);
    if (!order || order.completionRequestedAt) return false;
    if (order.status !== 'EN_ROUTE') return false;
    if (order.arrivalVerified !== true) return false;
    if (String(order.pricingMode ?? '').toUpperCase() !== 'INSPECTION_REQUIRED') return false;
    const s = deps.coordinator.getSnapshot();
    if (s?.resources.quotations.status !== 'ready') return false;
    const quotes = currentQuotations(key);
    if (!quotes || quotes.some(q => String(q.status).toUpperCase() === 'APPROVED')) return false;
    return true;
  }

  async function refresh(key: OrderSessionKey, resources: OrderResourceKind[] = ['quotations']) {
    await deps.coordinator.refreshOrderSession(key, 'command-readback');
    if (!currentOrder(key)) return;
    await Promise.all(
      resources
        .filter(kind => deps.coordinator.getSnapshot()?.resources[kind].status === 'unloaded')
        .map(kind => deps.coordinator.loadResource(key, kind)),
    );
  }

  async function checkVerdict(key: OrderSessionKey, marker: OrderCommandMarker): Promise<CommandReadbackVerdict> {
    if (!marker.resultEntityId) {
      // Timeout lost ID cannot correlate by time, content, or max version
      return 'unresolved';
    }
    const order = currentOrder(key);
    if (!order || order.technician?.id !== key.userId) return 'unresolved';

    let targetQuote: { id: string; serviceOrderId: string; technicianId?: string; version?: number; status: string } | null = null;
    if (deps.transport.getQuotation) {
      try {
        const raw = await deps.transport.getQuotation(marker.resultEntityId);
        if (raw && typeof raw === 'object') {
          const r = ('data' in raw && (raw as { data: any }).data) ? (raw as { data: any }).data : raw;
          if (
            r &&
            typeof r === 'object' &&
            r.id === marker.resultEntityId &&
            r.serviceOrderId === key.serviceOrderId &&
            r.technicianId === key.userId
          ) {
            targetQuote = {
              id: r.id,
              serviceOrderId: r.serviceOrderId,
              technicianId: r.technicianId,
              version: r.version,
              status: String(r.status ?? '').toUpperCase(),
            };
          }
        }
      } catch {
        return 'unresolved';
      }
    }

    if (!targetQuote) {
      const quotes = currentQuotations(key);
      if (!quotes) return 'unresolved';
      const match = quotes.find(
        q => q.id === marker.resultEntityId && q.serviceOrderId === key.serviceOrderId && q.technicianId === key.userId,
      );
      if (match) {
        targetQuote = match;
      }
    }

    if (!targetQuote) return 'unresolved';

    if (typeof targetQuote.version !== 'number' || !Number.isSafeInteger(targetQuote.version) || targetQuote.version < 1) {
      return 'unresolved';
    }

    const validStatuses = ['SENT', 'DRAFT', 'APPROVED', 'SUPERSEDED'];
    const st = String(targetQuote.status).toUpperCase();
    if (!validStatuses.includes(st)) {
      return 'unresolved';
    }

    // SUPERSEDED with the exact durable resultEntityId still proves the known
    // creation was recorded (a newer version superseded it). Resolve the
    // creation marker; screens display the actual current/history scope and
    // never claim the superseded quote is active.

    return 'resolved';
  }

  return {
    getState: () => state,
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },

    confirm(payload: unknown): boolean {
      const key = deps.getKey();
      if (!key || busy || !sameKey(key)) return false;
      const order = currentOrder(key);
      if (!order || !allowed(key)) {
        publish({
          ...state,
          phase: 'denied',
          message: 'Đơn hiện tại chưa đủ điều kiện tạo báo giá.',
          confirmDraft: null,
        });
        return false;
      }
      try {
        const validated = validateQuotationPayload(payload);
        const owner = `${key.userId}/${key.sessionGeneration}/${key.serviceOrderId}`;
        const target: TechnicianQuotationTarget = {
          orderId: order.id,
          technicianId: key.userId,
          orderStatus: order.status,
          pricingMode: String(order.pricingMode ?? ''),
        };
        publish({
          ...state,
          phase: 'idle',
          message: null,
          confirmDraft: { owner, payload: validated, target },
        });
        return true;
      } catch (err: unknown) {
        publish({
          ...state,
          phase: 'denied',
          message: err instanceof Error ? err.message : 'Dữ liệu báo giá không hợp lệ.',
          confirmDraft: null,
        });
        return false;
      }
    },

    cancelConfirm(): void {
      if (busy) return;
      publish({ ...state, confirmDraft: null, message: null });
    },

    async submit(): Promise<void> {
      const key = deps.getKey();
      if (busy || !key || !sameKey(key)) return;
      const draft = state.confirmDraft;
      if (!draft) return;
      const owner = `${key.userId}/${key.sessionGeneration}/${key.serviceOrderId}`;
      if (draft.owner !== owner) {
        publish({ ...state, phase: 'denied', message: 'Phiên làm việc đã thay đổi. Vui lòng thử lại.', confirmDraft: null });
        return;
      }

      busy = true;
      publish({ ...state, phase: 'verifying', operation: 'quote-create', message: null });

      try {
        await deps.journal.restore();
        if (!sameKey(key)) {
          busy = false;
          return;
        }
        if (deps.journal.hasUnresolved(key)) {
          publish({ ...state, phase: 'unknown', operation: 'quote-create', message: unknownMessage });
          busy = false;
          return;
        }
      } catch {
        if (sameKey(key)) publish({ ...state, phase: 'unknown', operation: 'quote-create', message: unknownMessage });
        busy = false;
        return;
      }

      try {
        await refresh(key, ['quotations']);
      } catch {
        // Preflight refresh failure: proven unsent, allows retry
        if (sameKey(key)) {
          publish({
            ...state,
            phase: 'denied',
            operation: 'quote-create',
            message: 'Không thể kết nối đến máy chủ để tải thông tin báo giá. Vui lòng thử lại.',
          });
        }
        busy = false;
        return;
      }

      const order = currentOrder(key);
      // Verify target has not changed since confirmation
      if (
        !order ||
        order.id !== draft.target.orderId ||
        order.status !== draft.target.orderStatus ||
        order.technician?.id !== draft.target.technicianId ||
        String(order.pricingMode ?? '') !== draft.target.pricingMode
      ) {
        publish({
          ...state,
          phase: 'denied',
          operation: 'quote-create',
          message: 'Thông tin đơn hàng đã thay đổi so với khi xác nhận. Vui lòng kiểm tra lại.',
          confirmDraft: null,
        });
        busy = false;
        return;
      }

      if (!allowed(key)) {
        publish({ ...state, phase: 'denied', operation: 'quote-create', message: 'Điều kiện hiện tại không cho phép gửi báo giá.', confirmDraft: null });
        busy = false;
        return;
      }

      const intentId = deps.newIntentId();
      const adapter = createOrderCommandAdapter(deps.journal, {
        isCurrent: k => !!currentOrder(k),
        refresh: k => refresh(k, ['quotations']),
      });

      publish({ ...state, phase: 'submitting', operation: 'quote-create', message: null });
      let sent = false;
      let createdId: string | undefined;

      try {
        await adapter.dispatch(
          key,
          { intentId, entityId: key.serviceOrderId, operation: 'quote-create' },
          async () => {
            // Revalidate captured session/order/holder/approval absence immediately before transport POST
            if (!sameKey(key)) return;
            const liveOrder = currentOrder(key);
            if (
              !liveOrder ||
              liveOrder.id !== draft.target.orderId ||
              liveOrder.status !== 'EN_ROUTE' ||
              liveOrder.technician?.id !== key.userId ||
              liveOrder.arrivalVerified !== true ||
              String(liveOrder.pricingMode ?? '').toUpperCase() !== 'INSPECTION_REQUIRED'
            ) {
              return;
            }
            const s = deps.coordinator.getSnapshot();
            if (s?.resources.quotations.status !== 'ready') return;
            const liveQuotes = currentQuotations(key);
            if (!liveQuotes || liveQuotes.some(q => String(q.status).toUpperCase() === 'APPROVED')) {
              return;
            }

            sent = true;
            const res = await deps.transport.createQuotation(key.serviceOrderId, draft.payload);
            if (res && typeof res === 'object' && 'id' in res && typeof (res as { id: unknown }).id === 'string') {
              createdId = (res as { id: string }).id;
              await deps.journal.recordEntity(key.userId, intentId, createdId);
            }
            return res;
          },
          async () => {
            if (!sent) return 'failed-known';
            if (!sameKey(key)) return 'unresolved';
            const marker = deps.journal.list(key.userId).find(m => m.intentId === intentId);
            if (!marker) return 'unresolved';
            return checkVerdict(key, marker);
          },
        );

        if (!sameKey(key)) return;
        const marker = deps.journal.list(key.userId).find(m => m.intentId === intentId);
        const resolved = marker?.status === 'resolved';
        publish({
          phase: resolved ? 'resolved' : marker?.status === 'failed-known' ? 'denied' : 'unknown',
          operation: 'quote-create',
          message: marker?.status === 'unknown' ? unknownMessage : marker?.status === 'failed-known' ? 'Yêu cầu không thể thực hiện do dữ liệu đã thay đổi.' : null,
          confirmDraft: resolved ? null : state.confirmDraft,
          createdQuotationId: createdId,
        });
      } catch {
        if (sameKey(key)) publish({ ...state, phase: 'unknown', operation: 'quote-create', message: unknownMessage });
      } finally {
        busy = false;
      }
    },

    async verify(): Promise<void> {
      const key = deps.getKey();
      if (!key || busy || !sameKey(key)) return;
      busy = true;
      publish({ ...state, phase: 'verifying', message: null });
      try {
        await deps.journal.restore();
        if (!sameKey(key)) return;
        const markers = deps.journal
          .list(key.userId)
          .filter(
            m =>
              m.serviceOrderId === key.serviceOrderId &&
              m.operation === 'quote-create' &&
              ['submitting', 'verifying', 'unknown'].includes(m.status),
          );
        const adapter = createOrderCommandAdapter(deps.journal, {
          isCurrent: sameKey,
          refresh: k => refresh(k, ['quotations']),
        });
        for (const marker of markers) {
          await adapter.verify(key, marker.intentId, () => checkVerdict(key, marker));
        }
        if (sameKey(key)) {
          const hasUnres = deps.journal.hasUnresolved(key);
          publish({
            ...state,
            phase: markers.length && !hasUnres ? 'resolved' : hasUnres ? 'unknown' : 'idle',
            message: hasUnres ? unknownMessage : null,
          });
        }
      } catch {
        if (sameKey(key)) publish({ ...state, phase: 'unknown', message: unknownMessage });
      } finally {
        busy = false;
      }
    },
  };
}

export type TechnicianQuotationController = ReturnType<typeof createTechnicianQuotationController>;
