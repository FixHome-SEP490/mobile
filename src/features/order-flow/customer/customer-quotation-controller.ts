import { isHistoricalOrder } from '../../../api/orders.api';
import { sameOrderSession, type OrderSessionKey, type OrderResourceKind, type OrderQuotation } from '../domain/order-session.types';
import { normalizeOrderResource } from '../domain/order-view-models';
import { createOrderCommandAdapter, type CommandReadbackVerdict } from '../runtime/order-controller-adapters';
import type { OrderCommandJournal, OrderCommandOperation } from '../runtime/order-command-journal';
import type { OrderReadCoordinator } from '../runtime/order-read-coordinator';

export const REJECT_WHOLE_ORDER_WARNING =
  'Từ chối báo giá sẽ hủy toàn bộ đơn dịch vụ, không chỉ báo giá';
export const APPROVE_NOT_PAYMENT_NOTE =
  'Duyệt báo giá chưa phải thanh toán.';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function isValidUuid(id: unknown): id is string {
  return typeof id === 'string' && UUID_REGEX.test(id.trim());
}

export function parseSafeIntegerMoney(val: unknown): number | null {
  if (typeof val === 'number') {
    return Number.isSafeInteger(val) && val >= 0 ? val : null;
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!/^\d+$/.test(trimmed)) return null;
    const num = Number(trimmed);
    return Number.isSafeInteger(num) && num >= 0 ? num : null;
  }
  return null;
}

export interface EligibleWarrantyOption {
  itemId: string;
  description: string;
  fee: number;
  termDays: number;
}

/**
 * Genuinely eligible paid-warranty lines only:
 * - valid UUID id
 * - type === 'parts_equipment' or 'PARTS'
 * - partSource === 'technician'
 * - partWarrantyOption === 'paid_warranty'
 * - warrantyFee is a finite safe integer >= 0 (genuine 0 is valid; missing/invalid fails closed)
 * - warrantyTermDays is a positive integer (1..3650)
 * Anything else — including FixHome INCLUDED warranty, external, labor — is excluded.
 */
export function getEligibleWarrantyOptions(quotation: OrderQuotation | null | undefined): EligibleWarrantyOption[] {
  if (!quotation || !Array.isArray(quotation.items)) return [];
  const options: EligibleWarrantyOption[] = [];
  for (const item of quotation.items) {
    if (!item || typeof item !== 'object') continue;
    if (!item.id || !isValidUuid(item.id)) continue;
    const itemType = String(item.type ?? '').toLowerCase();
    if (itemType !== 'parts_equipment' && String(item.type ?? '').toUpperCase() !== 'PARTS') continue;
    if (String(item.partSource ?? '').toLowerCase() !== 'technician') continue;
    if (String(item.partWarrantyOption ?? '').toLowerCase() !== 'paid_warranty') continue;
    const fee = parseSafeIntegerMoney(item.warrantyFee);
    if (fee === null) continue; // Fails closed on missing or malformed fee, never defaults to 0!
    if (typeof item.warrantyTermDays !== 'number' || !Number.isSafeInteger(item.warrantyTermDays) || item.warrantyTermDays < 1 || item.warrantyTermDays > 3650) {
      continue;
    }
    options.push({
      itemId: item.id,
      description: item.description,
      fee,
      termDays: item.warrantyTermDays,
    });
  }
  return options;
}

/**
 * Review preview calculation before approval:
 * laborTotal + partsTotal + SUM(selected warrantyFee) once per line.
 * Fails closed (returns null) for missing or invalid components, never authoritative zero.
 */
export function calculateReviewPreview(
  quotation: OrderQuotation | null | undefined,
  selectedIds: string[],
): {
  baseLabor: number;
  baseParts: number;
  warrantyTotal: number;
  previewGrandTotal: number;
} | null {
  const baseLabor = parseSafeIntegerMoney(quotation?.laborTotal);
  const baseParts = parseSafeIntegerMoney(quotation?.partsTotal);
  if (baseLabor === null || baseParts === null) {
    return null;
  }
  const eligible = getEligibleWarrantyOptions(quotation);
  const eligibleMap = new Map<string, number>();
  for (const opt of eligible) {
    eligibleMap.set(opt.itemId, opt.fee);
  }
  const selectedSet = new Set(selectedIds);
  let warrantyTotal = 0;
  for (const id of selectedSet) {
    const fee = eligibleMap.get(id);
    if (fee === undefined) {
      return null;
    }
    warrantyTotal += fee; // SUM once per line
  }
  const previewGrandTotal = baseLabor + baseParts + warrantyTotal;
  if (!Number.isSafeInteger(previewGrandTotal)) return null;

  return {
    baseLabor,
    baseParts,
    warrantyTotal,
    previewGrandTotal,
  };
}

export type DecisionAction = 'APPROVE' | 'REJECT';

export interface CustomerQuotationTarget {
  orderId: string;
  quoteId: string;
  quoteVersion?: number;
  technicianId?: string;
}

export interface CustomerQuotationDecisionDraft {
  owner: string;
  target: CustomerQuotationTarget;
  action: DecisionAction;
  selectedWarrantyItemIds: string[];
}

export interface CustomerQuotationDecisionState {
  phase: 'idle' | 'submitting' | 'verifying' | 'unknown' | 'denied' | 'resolved';
  operation?: OrderCommandOperation;
  message: string | null;
  selectedWarrantyItemIds: string[];
  confirmDraft: CustomerQuotationDecisionDraft | null;
  decidedAction?: DecisionAction;
  resolvedQuotation?: OrderQuotation | null;
}

export interface CustomerQuotationDecisionTransport {
  approveQuotation: (quoteId: string, paidWarrantyItemIds?: string[]) => Promise<unknown>;
  rejectQuotation: (quoteId: string) => Promise<unknown>;
  getQuotation?: (id: string) => Promise<unknown>;
}

export interface CustomerQuotationDecisionDependencies {
  coordinator: OrderReadCoordinator;
  journal: OrderCommandJournal;
  transport: CustomerQuotationDecisionTransport;
  getKey: () => OrderSessionKey | null;
  isActive: () => boolean;
  newIntentId: () => string;
  now?: () => number;
}

const unknownMessage = 'Kết quả quyết định báo giá chưa xác định. Không gửi lại; hãy kiểm tra từ hệ thống hoặc liên hệ hỗ trợ.';

export function createCustomerQuotationDecisionController(deps: CustomerQuotationDecisionDependencies) {
  let state: CustomerQuotationDecisionState = {
    phase: 'idle',
    message: null,
    selectedWarrantyItemIds: [],
    confirmDraft: null,
  };
  let busy = false;
  const listeners = new Set<() => void>();
  const publish = (next: CustomerQuotationDecisionState) => {
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
      key.role === 'customer' &&
      s?.access === 'current' &&
      s.order.status === 'ready' &&
      !isHistoricalOrder(s.order.data) &&
      s.order.data.id === key.serviceOrderId
      ? s.order.data
      : null;
  };

  const currentQuote = (key: OrderSessionKey): OrderQuotation | null => {
    const s = deps.coordinator.getSnapshot();
    const order = currentOrder(key);
    if (!order || s?.resources.quotations.status !== 'ready') return null;
    if (String(order.pricingMode ?? '').toUpperCase() !== 'INSPECTION_REQUIRED') return null;
    if (!order.technician?.id) return null;

    const quotes = s.resources.quotations.data.filter(
      q => q.serviceOrderId === key.serviceOrderId && q.technicianId === order.technician?.id,
    );
    if (!quotes.length) return null;
    const sent = quotes.filter(q => String(q.status).toUpperCase() === 'SENT');
    if (!sent.length) return null;
    if (sent.length === 1) return sent[0];
    const sorted = [...sent].sort((a, b) => (b.version ?? 0) - (a.version ?? 0));
    return sorted[0];
  };

  function allowed(key: OrderSessionKey): boolean {
    const order = currentOrder(key);
    if (!order || order.completionRequestedAt) return false;
    if (order.status !== 'EN_ROUTE') return false;
    if (String(order.pricingMode ?? '').toUpperCase() !== 'INSPECTION_REQUIRED') return false;
    const quote = currentQuote(key);
    if (!quote || String(quote.status).toUpperCase() !== 'SENT') return false;
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

  async function checkVerdict(
    key: OrderSessionKey,
    quoteId: string,
    expectedVersion: number | undefined,
    technicianId: string | undefined,
    expectedAction: DecisionAction,
  ): Promise<{ verdict: CommandReadbackVerdict; quotation: OrderQuotation | null }> {
    const order = currentOrder(key);
    if (!order || order.technician?.id !== technicianId) return { verdict: 'unresolved', quotation: null };

    let targetQuote: OrderQuotation | null = null;
    if (deps.transport.getQuotation) {
      try {
        const raw = await deps.transport.getQuotation(quoteId);
        if (raw && typeof raw === 'object') {
          const r = ('data' in raw && (raw as { data: any }).data) ? (raw as { data: any }).data : raw;
          if (
            r &&
            typeof r === 'object' &&
            r.id === quoteId &&
            r.serviceOrderId === key.serviceOrderId &&
            r.technicianId === technicianId
          ) {
            // Strict scope: normalize the exact readback through the frozen
            // quotations projection. Malformed/missing scope stays unresolved,
            // never a fabricated empty scope or zero.
            try {
              const row = {
                id: r.id,
                serviceOrderId: r.serviceOrderId,
                technicianId: r.technicianId,
                status: r.status,
                version: r.version,
                laborTotal: r.laborTotal,
                partsTotal: r.partsTotal,
                items: r.items,
                note: r.note,
                sentAt: r.sentAt,
                decidedAt: r.decidedAt,
                createdAt: r.createdAt,
                updatedAt: r.updatedAt,
                supersedesId: r.supersedesId,
              };
              const normalized = normalizeOrderResource('quotations', [row], key.serviceOrderId, key.role);
              targetQuote = normalized[0] ?? null;
            } catch {
              return { verdict: 'unresolved', quotation: null };
            }
          }
        }
      } catch {
        return { verdict: 'unresolved', quotation: null };
      }
    }

    if (!targetQuote) {
      const s = deps.coordinator.getSnapshot();
      if (s?.resources.quotations.status !== 'ready') return { verdict: 'unresolved', quotation: null };
      const found = s.resources.quotations.data.find(
        q => q.id === quoteId && q.serviceOrderId === key.serviceOrderId,
      );
      if (!found || found.technicianId !== technicianId) return { verdict: 'unresolved', quotation: null };
      targetQuote = found;
    }

    if (!targetQuote) return { verdict: 'unresolved', quotation: null };
    if (expectedVersion !== undefined && targetQuote.version !== expectedVersion) {
      return { verdict: 'unresolved', quotation: null };
    }

    const quoteStatus = String(targetQuote.status).toUpperCase();
    if (quoteStatus === 'SENT') {
      // SENT-no-effect: decision had no effect on server
      return { verdict: 'unresolved', quotation: null };
    }

    if (expectedAction === 'APPROVE') {
      if (quoteStatus === 'APPROVED') {
        return { verdict: 'resolved', quotation: targetQuote };
      }
      return { verdict: 'unresolved', quotation: null };
    }

    if (expectedAction === 'REJECT') {
      if (quoteStatus === 'REJECTED' && order.status === 'CANCELLED') {
        return { verdict: 'resolved', quotation: targetQuote };
      }
      return { verdict: 'unresolved', quotation: null };
    }

    return { verdict: 'unresolved', quotation: null };
  }

  return {
    getState: () => state,
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },

    toggleWarrantyItem(itemId: string): void {
      if (busy) return;
      const key = deps.getKey();
      if (!key) return;
      const quote = currentQuote(key);
      const eligible = getEligibleWarrantyOptions(quote);
      if (!eligible.some(e => e.itemId === itemId)) return;

      const currentSet = new Set(state.selectedWarrantyItemIds);
      if (currentSet.has(itemId)) {
        currentSet.delete(itemId);
      } else {
        currentSet.add(itemId);
      }
      publish({
        ...state,
        selectedWarrantyItemIds: Array.from(currentSet),
        confirmDraft: null, // Any selection change requires re-confirmation
      });
    },

    confirm(action: DecisionAction): boolean {
      const key = deps.getKey();
      if (!key || busy || !sameKey(key)) return false;
      const order = currentOrder(key);
      const quote = currentQuote(key);
      if (!order || !quote || !allowed(key)) {
        publish({
          ...state,
          phase: 'denied',
          message: 'Báo giá hiện tại không ở trạng thái sẵn sàng để xử lý.',
          confirmDraft: null,
        });
        return false;
      }

      // Filter selected IDs to only genuinely eligible items of this target quote
      const eligible = getEligibleWarrantyOptions(quote);
      const eligibleIds = new Set(eligible.map(e => e.itemId));
      const selectedWarrantyItemIds = action === 'APPROVE'
        ? state.selectedWarrantyItemIds.filter(id => eligibleIds.has(id))
        : [];

      const owner = `${key.userId}/${key.sessionGeneration}/${key.serviceOrderId}`;
      const target: CustomerQuotationTarget = {
        orderId: order.id,
        quoteId: quote.id,
        quoteVersion: quote.version,
        technicianId: quote.technicianId,
      };

      publish({
        ...state,
        phase: 'idle',
        message: null,
        confirmDraft: {
          owner,
          target,
          action,
          selectedWarrantyItemIds,
        },
      });
      return true;
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
      publish({ ...state, phase: 'verifying', operation: 'quote-decision', message: null });

      try {
        await deps.journal.restore();
        if (!sameKey(key)) {
          busy = false;
          return;
        }
        if (deps.journal.hasUnresolved(key)) {
          publish({ ...state, phase: 'unknown', operation: 'quote-decision', message: unknownMessage });
          busy = false;
          return;
        }
      } catch {
        if (sameKey(key)) publish({ ...state, phase: 'unknown', operation: 'quote-decision', message: unknownMessage });
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
            operation: 'quote-decision',
            message: 'Không thể kết nối đến máy chủ để tải thông tin báo giá. Vui lòng thử lại.',
          });
        }
        busy = false;
        return;
      }

      const order = currentOrder(key);
      const quote = currentQuote(key);

      // Verify target has not changed since confirmation
      if (
        !order ||
        !quote ||
        quote.id !== draft.target.quoteId ||
        quote.version !== draft.target.quoteVersion ||
        quote.technicianId !== draft.target.technicianId
      ) {
        publish({
          ...state,
          phase: 'denied',
          operation: 'quote-decision',
          message: 'Báo giá đã được cập nhật hoặc thay đổi so với khi xác nhận. Vui lòng xem lại.',
          confirmDraft: null,
        });
        busy = false;
        return;
      }

      if (!allowed(key)) {
        publish({ ...state, phase: 'denied', operation: 'quote-decision', message: 'Điều kiện hiện tại không cho phép thực hiện quyết định.', confirmDraft: null });
        busy = false;
        return;
      }

      const intentId = deps.newIntentId();
      const adapter = createOrderCommandAdapter(deps.journal, {
        isCurrent: k => !!currentOrder(k),
        refresh: k => refresh(k, ['quotations']),
      });

      publish({ ...state, phase: 'submitting', operation: 'quote-decision', message: null });
      let sent = false;
      let readbackResolvedQuotation: OrderQuotation | null = null;

      try {
        await adapter.dispatch(
          key,
          { intentId, entityId: draft.target.quoteId, operation: 'quote-decision' },
          async () => {
            // Revalidate captured session/order/holder/quote/version and selected exact eligible IDs immediately before transport POST
            if (!sameKey(key)) return;
            const liveOrder = currentOrder(key);
            if (!liveOrder || liveOrder.status !== 'EN_ROUTE') return;
            if (liveOrder.technician?.id !== draft.target.technicianId) return;
            if (String(liveOrder.pricingMode ?? '').toUpperCase() !== 'INSPECTION_REQUIRED') return;
            const liveQuote = currentQuote(key);
            if (
              !liveQuote ||
              liveQuote.id !== draft.target.quoteId ||
              liveQuote.version !== draft.target.quoteVersion ||
              liveQuote.technicianId !== draft.target.technicianId ||
              String(liveQuote.status).toUpperCase() !== 'SENT'
            ) {
              return;
            }

            if (draft.action === 'APPROVE') {
              const liveEligible = getEligibleWarrantyOptions(liveQuote);
              const liveEligibleIds = new Set(liveEligible.map(e => e.itemId));
              if (!draft.selectedWarrantyItemIds.every(id => liveEligibleIds.has(id))) {
                return;
              }
            }

            sent = true;
            if (draft.action === 'APPROVE') {
              return deps.transport.approveQuotation(draft.target.quoteId, draft.selectedWarrantyItemIds);
            }
            return deps.transport.rejectQuotation(draft.target.quoteId);
          },
          async () => {
            if (!sent) return 'failed-known';
            if (!sameKey(key)) return 'unresolved';
            const { verdict, quotation } = await checkVerdict(
              key,
              draft.target.quoteId,
              draft.target.quoteVersion,
              draft.target.technicianId,
              draft.action,
            );
            if (verdict === 'resolved') {
              readbackResolvedQuotation = quotation;
            }
            return verdict;
          },
        );

        if (!sameKey(key)) return;
        const marker = deps.journal.list(key.userId).find(m => m.intentId === intentId);
        const resolved = marker?.status === 'resolved';
        publish({
          ...state,
          phase: resolved ? 'resolved' : marker?.status === 'failed-known' ? 'denied' : 'unknown',
          operation: 'quote-decision',
          message: marker?.status === 'unknown' ? unknownMessage : marker?.status === 'failed-known' ? 'Yêu cầu không thể thực hiện do dữ liệu đã thay đổi.' : null,
          confirmDraft: resolved ? null : state.confirmDraft,
          decidedAction: resolved ? draft.action : undefined,
          resolvedQuotation: resolved ? readbackResolvedQuotation : null,
        });
      } catch {
        if (sameKey(key)) publish({ ...state, phase: 'unknown', operation: 'quote-decision', message: unknownMessage });
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
              m.operation === 'quote-decision' &&
              ['submitting', 'verifying', 'unknown'].includes(m.status),
          );
        const adapter = createOrderCommandAdapter(deps.journal, {
          isCurrent: sameKey,
          refresh: k => refresh(k, ['quotations']),
        });
        let recoveredQuotation: OrderQuotation | null = null;
        for (const marker of markers) {
          await adapter.verify(key, marker.intentId, async () => {
            const s = deps.coordinator.getSnapshot();
            const order = currentOrder(key);
            if (!order) return 'unresolved';

            let q: OrderQuotation | null = null;
            if (deps.transport.getQuotation) {
              try {
                const raw = await deps.transport.getQuotation(marker.entityId);
                if (raw && typeof raw === 'object') {
                  const r = ('data' in raw && (raw as { data: any }).data) ? (raw as { data: any }).data : raw;
                  if (r && typeof r === 'object' && r.id === marker.entityId && r.serviceOrderId === key.serviceOrderId) {
                    // Strict scope: same frozen quotations projection as submit
                    // readback. Malformed scope stays unresolved, never [].
                    try {
                      const row = {
                        id: r.id,
                        serviceOrderId: r.serviceOrderId,
                        technicianId: r.technicianId,
                        status: r.status,
                        version: r.version,
                        laborTotal: r.laborTotal,
                        partsTotal: r.partsTotal,
                        items: r.items,
                        note: r.note,
                        sentAt: r.sentAt,
                        decidedAt: r.decidedAt,
                        createdAt: r.createdAt,
                        updatedAt: r.updatedAt,
                        supersedesId: r.supersedesId,
                      };
                      const normalized = normalizeOrderResource('quotations', [row], key.serviceOrderId, key.role);
                      q = normalized[0] ?? null;
                    } catch {
                      return 'unresolved';
                    }
                  }
                }
              } catch {
                return 'unresolved';
              }
            }

            if (!q) {
              q = s?.resources.quotations.status === 'ready'
                ? s.resources.quotations.data.find(row => row.id === marker.entityId && row.serviceOrderId === key.serviceOrderId) ?? null
                : null;
            }

            if (!q || q.technicianId !== order.technician?.id) return 'unresolved';
            const st = String(q.status).toUpperCase();
            if (st === 'APPROVED') {
              recoveredQuotation = q;
              return 'resolved';
            }
            if (st === 'REJECTED' && s?.order.status === 'ready' && s.order.data.status === 'CANCELLED') {
              recoveredQuotation = q;
              return 'resolved';
            }
            return 'unresolved';
          });
        }
        if (sameKey(key)) {
          const hasUnres = deps.journal.hasUnresolved(key);
          publish({
            ...state,
            phase: markers.length && !hasUnres ? 'resolved' : hasUnres ? 'unknown' : 'idle',
            message: hasUnres ? unknownMessage : null,
            resolvedQuotation: recoveredQuotation,
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

export type CustomerQuotationDecisionController = ReturnType<typeof createCustomerQuotationDecisionController>;
