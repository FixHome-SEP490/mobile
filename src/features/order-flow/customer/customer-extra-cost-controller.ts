import { isHistoricalOrder, ordersApi, type CostRequest } from '../../../api/orders.api';
import {
  sameOrderSession,
  type OrderSessionKey,
  type OrderResourceKind,
} from '../domain/order-session.types';
import { createOrderCommandAdapter, type CommandReadbackVerdict } from '../runtime/order-controller-adapters';
import type { OrderCommandJournal, OrderCommandOperation } from '../runtime/order-command-journal';
import type { OrderReadCoordinator } from '../runtime/order-read-coordinator';
import {
  isCostDecisionBlocked,
  eligibleExtraWarrantyOptions,
  type ExtraWarrantyOption,
} from '../../../screens/customer/customer-additional-cost-decision';

export interface CustomerExtraCostDecisionTransport {
  approveCost: (costId: string, paidWarrantyItemIds?: string[]) => Promise<unknown>;
  rejectCost: (costId: string, reason?: string) => Promise<unknown>;
  getAdditionalCosts: (orderId: string) => Promise<CostRequest[]>;
}

export interface CustomerExtraCostDecisionControllerDeps {
  journal: OrderCommandJournal;
  readCoordinator: OrderReadCoordinator;
  isCurrent: (key: OrderSessionKey) => boolean;
  notify?: (title: string, message: string) => void;
  transport?: CustomerExtraCostDecisionTransport;
}

export interface CustomerExtraCostDecisionState {
  phase: 'idle' | 'confirming' | 'submitting' | 'verifying' | 'resolved' | 'denied' | 'unknown';
  operation: 'extra-decision' | null;
  targetCostId: string | null;
  action: 'approve' | 'reject' | null;
  selectedWarrantyIds: string[];
  eligibleWarrantyOptions: ExtraWarrantyOption[];
  error: string | null;
  actionSuccess: string | null;
  resolvedEntityId: string | null;
}

const defaultTransport: CustomerExtraCostDecisionTransport = {
  approveCost: (costId, paidWarrantyItemIds = []) => ordersApi.decideAdditionalCost(costId, 'APPROVE', paidWarrantyItemIds),
  rejectCost: (costId) => ordersApi.decideAdditionalCost(costId, 'REJECT'),
  getAdditionalCosts: (orderId) => ordersApi.getAdditionalCosts(orderId),
};

function currentOrder(coordinator: OrderReadCoordinator, key: OrderSessionKey) {
  const s = coordinator.getSnapshot();
  if (!s || !sameOrderSession(s.key, key) || s.access !== 'current') return null;
  return s.order.status === 'ready' && !isHistoricalOrder(s.order.data) ? s.order.data : null;
}

function currentExtras(coordinator: OrderReadCoordinator, key: OrderSessionKey): CostRequest[] | null {
  const s = coordinator.getSnapshot();
  if (!s || !sameOrderSession(s.key, key) || s.access !== 'current') return null;
  const extras = s.resources.extras;
  return extras.status === 'ready' && Array.isArray(extras.data) ? (extras.data as unknown as CostRequest[]) : null;
}

export function createCustomerExtraCostDecisionController(deps: CustomerExtraCostDecisionControllerDeps) {
  const transport = deps.transport ?? defaultTransport;

  async function refresh(key: OrderSessionKey, resources: OrderResourceKind[] = ['extras']) {
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
      await refresh(key, ['extras']);
    },
  });

  let state: CustomerExtraCostDecisionState = {
    phase: 'idle',
    operation: null,
    targetCostId: null,
    action: null,
    selectedWarrantyIds: [],
    eligibleWarrantyOptions: [],
    error: null,
    actionSuccess: null,
    resolvedEntityId: null,
  };

  const listeners = new Set<(s: CustomerExtraCostDecisionState) => void>();
  function publish(patch: Partial<CustomerExtraCostDecisionState>) {
    state = { ...state, ...patch };
    listeners.forEach((l) => l(state));
  }

  function reset() {
    publish({
      phase: 'idle',
      operation: null,
      targetCostId: null,
      action: null,
      selectedWarrantyIds: [],
      eligibleWarrantyOptions: [],
      error: null,
      actionSuccess: null,
      resolvedEntityId: null,
    });
  }

  function prepareDecision(key: OrderSessionKey, costId: string, action: 'approve' | 'reject'): void {
    if (!deps.isCurrent(key) || key.role !== 'customer') return;
    if (state.phase === 'submitting' || state.phase === 'verifying') return;

    const extras = currentExtras(deps.readCoordinator, key);
    const targetCost = extras?.find((c) => c.id === costId && c.serviceOrderId === key.serviceOrderId);
    if (!targetCost) {
      publish({
        phase: 'denied',
        operation: 'extra-decision',
        targetCostId: costId,
        action,
        error: 'Không tìm thấy thông tin chi phí phát sinh để quyết định.',
        actionSuccess: null,
      });
      return;
    }

    const eligible = action === 'approve' ? eligibleExtraWarrantyOptions(targetCost.items) : [];
    publish({
      phase: 'confirming',
      operation: 'extra-decision',
      targetCostId: costId,
      action,
      selectedWarrantyIds: [],
      eligibleWarrantyOptions: eligible,
      error: null,
      actionSuccess: null,
    });
  }

  function toggleWarranty(itemId: string): void {
    if (state.phase !== 'confirming' || state.action !== 'approve') return;
    const isEligible = state.eligibleWarrantyOptions.some((opt) => opt.itemId === itemId);
    if (!isEligible) return;

    const current = new Set(state.selectedWarrantyIds);
    if (current.has(itemId)) {
      current.delete(itemId);
    } else {
      current.add(itemId);
    }
    publish({ selectedWarrantyIds: Array.from(current) });
  }

  async function submitDecision(
    key: OrderSessionKey,
    costId: string,
    action: 'approve' | 'reject',
    reason?: string,
  ): Promise<void> {
    if (!deps.isCurrent(key) || key.role !== 'customer') return;
    if (state.phase === 'submitting' || state.phase === 'verifying') return;

    // Preflight refresh extras
    try {
      await refresh(key, ['extras']);
    } catch {
      publish({
        phase: 'denied',
        operation: 'extra-decision',
        targetCostId: costId,
        action,
        error: 'Không thể kết nối đến máy chủ để tải thông tin chi phí phát sinh. Vui lòng thử lại.',
        actionSuccess: null,
      });
      return;
    }

    if (!deps.isCurrent(key)) return;

    // Gate verification
    const order = currentOrder(deps.readCoordinator, key);
    if (!order || isHistoricalOrder(order)) {
      publish({ phase: 'denied', operation: 'extra-decision', targetCostId: costId, action, error: 'Đơn hàng không hợp lệ.', actionSuccess: null });
      return;
    }
    if (String(order.status).toUpperCase() !== 'UNDER_REPAIR' || !!order.completionRequestedAt) {
      publish({ phase: 'denied', operation: 'extra-decision', targetCostId: costId, action, error: 'Chỉ có thể quyết định chi phí phát sinh khi đơn đang trong quá trình sửa chữa.', actionSuccess: null });
      return;
    }

    const extras = currentExtras(deps.readCoordinator, key);
    const targetCost = extras?.find((c) => c.id === costId && c.serviceOrderId === key.serviceOrderId);
    if (!targetCost) {
      publish({ phase: 'denied', operation: 'extra-decision', targetCostId: costId, action, error: 'Không tìm thấy đề xuất chi phí phát sinh.', actionSuccess: null });
      return;
    }
    if (String(targetCost.status).toUpperCase() !== 'PENDING_APPROVAL') {
      publish({ phase: 'denied', operation: 'extra-decision', targetCostId: costId, action, error: 'Đề xuất chi phí này không còn ở trạng thái chờ duyệt.', actionSuccess: null });
      return;
    }
    if (isCostDecisionBlocked(targetCost.expiresAt)) {
      publish({ phase: 'denied', operation: 'extra-decision', targetCostId: costId, action, error: 'Đề xuất chi phí phát sinh đã hết hạn duyệt.', actionSuccess: null });
      return;
    }
    // Check if superseded
    const isSuperseded = extras?.some((c) => c.supersedesId === costId);
    if (isSuperseded) {
      publish({ phase: 'denied', operation: 'extra-decision', targetCostId: costId, action, error: 'Đề xuất chi phí đã bị thay thế bởi bản sửa đổi mới hơn.', actionSuccess: null });
      return;
    }

    const selectedWarrantyIds = action === 'approve' ? state.selectedWarrantyIds : [];
    const intentId = `extra-decision-${Date.now()}`;
    const stableKey = `decision:${action}:${costId}`;
    publish({ phase: 'submitting', operation: 'extra-decision', targetCostId: costId, action, error: null, actionSuccess: null });

    await adapter.dispatch(
      key,
      {
        intentId,
        entityId: costId,
        operation: 'extra-decision',
        stableKey,
      },
      async () => {
        // Deferred gate check
        const liveOrder = currentOrder(deps.readCoordinator, key);
        if (
          !deps.isCurrent(key) ||
          !liveOrder ||
          String(liveOrder.status).toUpperCase() !== 'UNDER_REPAIR' ||
          !!liveOrder.completionRequestedAt
        ) {
          throw new Error('Order status changed before extra-decision dispatch.');
        }

        const liveExtras = currentExtras(deps.readCoordinator, key);
        const liveCost = liveExtras?.find((c) => c.id === costId && c.serviceOrderId === key.serviceOrderId);
        if (
          !liveCost ||
          String(liveCost.status).toUpperCase() !== 'PENDING_APPROVAL' ||
          isCostDecisionBlocked(liveCost.expiresAt)
        ) {
          throw new Error('Target proposal invalid, expired, or not pending approval before extra-decision dispatch.');
        }

        if (action === 'approve') {
          await transport.approveCost(costId, selectedWarrantyIds.length > 0 ? selectedWarrantyIds : undefined);
        } else {
          await transport.rejectCost(costId, reason);
        }
      },
      async (): Promise<CommandReadbackVerdict> => {
        try {
          const list = await transport.getAdditionalCosts(key.serviceOrderId);
          const matched = list.find((c) => c.id === costId && c.serviceOrderId === key.serviceOrderId);
          if (!matched) return 'unresolved';

          const status = String(matched.status).toUpperCase();
          const expectedStatus = action === 'approve' ? 'APPROVED' : 'REJECTED';
          if (status === expectedStatus) return 'resolved';
          return 'unresolved';
        } catch {
          return 'unresolved';
        }
      },
    );

    if (!deps.isCurrent(key)) return;
    const finalMarker = deps.journal.list(key.userId).find((m) => m.intentId === intentId);
    if (finalMarker?.status === 'resolved') {
      const successMsg = action === 'approve'
        ? 'Đã duyệt chi phí phát sinh thành công!'
        : 'Đã từ chối chi phí phát sinh.';
      publish({
        phase: 'resolved',
        operation: 'extra-decision',
        resolvedEntityId: costId,
        actionSuccess: successMsg,
        error: null,
      });
      deps.notify?.(
        'Quyết định chi phí',
        action === 'approve' ? 'Đã duyệt chi phí phát sinh thành công.' : 'Đã từ chối chi phí phát sinh.',
      );
    } else {
      publish({
        phase: 'unknown',
        operation: 'extra-decision',
        error: 'Chưa xác nhận trạng thái quyết định chi phí. Hãy làm mới để kiểm tra trước khi thử lại.',
        actionSuccess: null,
      });
    }
  }

  async function verify(key: OrderSessionKey, intentId: string): Promise<void> {
    if (!deps.isCurrent(key)) return;
    const allowedOps: OrderCommandOperation[] = ['extra-decision'];
    const marker = deps.journal.list(key.userId).find(
      (m) =>
        m.intentId === intentId &&
        m.userId === key.userId &&
        m.role === key.role &&
        m.serviceOrderId === key.serviceOrderId &&
        allowedOps.includes(m.operation),
    );
    if (!marker) return;

    publish({ phase: 'verifying', operation: marker.operation as any, targetCostId: marker.entityId, error: null });

    await adapter.verify(key, intentId, async () => {
      try {
        const costId = marker.entityId;
        const stableParts = marker.stableKey?.split(':') ?? [];
        const desiredAction = stableParts[1] === 'approve' || stableParts[1] === 'reject' ? stableParts[1] : null;
        if (!desiredAction) return 'unresolved';

        const list = await transport.getAdditionalCosts(key.serviceOrderId);
        const matched = list.find((c) => c.id === costId && c.serviceOrderId === key.serviceOrderId);
        if (!matched) return 'unresolved';

        const status = String(matched.status).toUpperCase();
        const expectedStatus = desiredAction === 'approve' ? 'APPROVED' : 'REJECTED';
        return status === expectedStatus ? 'resolved' : 'unresolved';
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
    subscribe: (fn: (s: CustomerExtraCostDecisionState) => void) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    prepareDecision,
    toggleWarranty,
    submitDecision,
    verify,
    reset,
  };
}
