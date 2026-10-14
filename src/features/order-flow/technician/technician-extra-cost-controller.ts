import { isHistoricalOrder, ordersApi, type CreateAdditionalCostPayload, type CostRequest } from '../../../api/orders.api';
import {
  sameOrderSession,
  type OrderSessionKey,
  type OrderResourceKind,
} from '../domain/order-session.types';
import { createOrderCommandAdapter, type CommandReadbackVerdict } from '../runtime/order-controller-adapters';
import type { OrderCommandJournal, OrderCommandOperation } from '../runtime/order-command-journal';
import type { OrderReadCoordinator } from '../runtime/order-read-coordinator';
import { isCostDecisionBlocked } from '../../../screens/customer/customer-additional-cost-decision';
import { createdProposalIdOf } from '../../../screens/technician/technician-additional-cost-create';

export interface TechnicianExtraCostTransport {
  createProposal: (orderId: string, payload: CreateAdditionalCostPayload) => Promise<unknown>;
  reviseProposal?: (costId: string, payload: CreateAdditionalCostPayload) => Promise<unknown>;
  getAdditionalCosts: (orderId: string) => Promise<CostRequest[]>;
}

export interface TechnicianExtraCostControllerDeps {
  journal: OrderCommandJournal;
  readCoordinator: OrderReadCoordinator;
  isCurrent: (key: OrderSessionKey) => boolean;
  notify?: (title: string, message: string) => void;
  transport?: TechnicianExtraCostTransport;
}

export interface TechnicianExtraCostState {
  phase: 'idle' | 'submitting' | 'verifying' | 'resolved' | 'denied' | 'unknown';
  operation: 'extra-create' | 'extra-revise' | null;
  targetId: string | null;
  revisingId: string | null;
  error: string | null;
  actionSuccess: string | null;
  resolvedEntityId: string | null;
}

const defaultTransport: TechnicianExtraCostTransport = {
  createProposal: (orderId, payload) => ordersApi.createAdditionalCostProposal(orderId, payload),
  reviseProposal: (costId, payload) => ordersApi.reviseAdditionalCost(costId, payload),
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

export function createTechnicianExtraCostController(deps: TechnicianExtraCostControllerDeps) {
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

  let state: TechnicianExtraCostState = {
    phase: 'idle',
    operation: null,
    targetId: null,
    revisingId: null,
    error: null,
    actionSuccess: null,
    resolvedEntityId: null,
  };

  const listeners = new Set<(s: TechnicianExtraCostState) => void>();
  function publish(patch: Partial<TechnicianExtraCostState>) {
    state = { ...state, ...patch };
    listeners.forEach((l) => l(state));
  }

  function reset() {
    publish({
      phase: 'idle',
      operation: null,
      targetId: null,
      revisingId: null,
      error: null,
      actionSuccess: null,
      resolvedEntityId: null,
    });
  }

  async function createProposal(key: OrderSessionKey, payload: CreateAdditionalCostPayload): Promise<void> {
    if (!deps.isCurrent(key) || key.role !== 'technician') return;
    if (state.phase === 'submitting' || state.phase === 'verifying') return;

    // Preflight refresh extras resource with error catch (phase: 'denied')
    try {
      await refresh(key, ['extras']);
    } catch {
      publish({
        phase: 'denied',
        operation: 'extra-create',
        targetId: key.serviceOrderId,
        error: 'Không thể kết nối đến máy chủ để kiểm tra chi phí phát sinh. Vui lòng thử lại.',
        actionSuccess: null,
      });
      return;
    }

    if (!deps.isCurrent(key)) return;

    // Gate verification
    const order = currentOrder(deps.readCoordinator, key);
    if (!order || isHistoricalOrder(order) || order.technician?.id !== key.userId) {
      publish({ phase: 'denied', operation: 'extra-create', error: 'Chỉ kỹ thuật viên phụ trách mới có quyền đề xuất chi phí phát sinh.', actionSuccess: null });
      return;
    }
    if (String(order.status).toUpperCase() !== 'UNDER_REPAIR' || !!order.completionRequestedAt) {
      publish({ phase: 'denied', operation: 'extra-create', error: 'Đề xuất chi phí chỉ hợp lệ khi đơn đang sửa chữa (UNDER_REPAIR) và chưa yêu cầu hoàn tất.', actionSuccess: null });
      return;
    }

    const extras = currentExtras(deps.readCoordinator, key);
    if (!extras) {
      publish({
        phase: 'denied',
        operation: 'extra-create',
        targetId: key.serviceOrderId,
        error: 'Dữ liệu chi phí phát sinh chưa sẵn sàng. Vui lòng tải lại.',
        actionSuccess: null,
      });
      return;
    }

    const intentId = `extra-create-${Date.now()}`;
    let createdId: string | null = null;
    publish({ phase: 'submitting', operation: 'extra-create', targetId: key.serviceOrderId, revisingId: null, error: null, actionSuccess: null });

    await adapter.dispatch(
      key,
      {
        intentId,
        entityId: key.serviceOrderId,
        operation: 'extra-create',
      },
      async () => {
        // Deferred gate check immediately before wire POST
        const liveOrder = currentOrder(deps.readCoordinator, key);
        if (
          !deps.isCurrent(key) ||
          !liveOrder ||
          String(liveOrder.status).toUpperCase() !== 'UNDER_REPAIR' ||
          !!liveOrder.completionRequestedAt ||
          liveOrder.technician?.id !== key.userId
        ) {
          throw new Error('Order status or technician changed before extra-create dispatch.');
        }

        const liveExtras = currentExtras(deps.readCoordinator, key);
        if (!liveExtras) {
          throw new Error('Extras resource unavailable before extra-create dispatch.');
        }

        const res = await transport.createProposal(key.serviceOrderId, payload);
        const captured = createdProposalIdOf(res);
        if (captured) {
          createdId = captured;
          await deps.journal.recordEntity(key.userId, intentId, createdId);
        }
      },
      async (): Promise<CommandReadbackVerdict> => {
        const marker = deps.journal.list(key.userId).find((m) => m.intentId === intentId);
        const targetId = createdId ?? marker?.resultEntityId;
        if (!targetId) {
          // Lost ID protection: stays unknown
          return 'unresolved';
        }
        try {
          const list = await transport.getAdditionalCosts(key.serviceOrderId);
          const matched = list.find((c) => c.id === targetId && c.serviceOrderId === key.serviceOrderId);
          if (!matched) return 'unresolved';
          if (String(matched.status).toUpperCase() === 'PENDING_APPROVAL') return 'resolved';
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
        operation: 'extra-create',
        resolvedEntityId: createdId ?? finalMarker.resultEntityId ?? null,
        actionSuccess: 'Đã gửi đề xuất chi phí phát sinh thành công!',
        error: null,
      });
      deps.notify?.('Đề xuất chi phí', 'Đã gửi đề xuất chi phí phát sinh thành công.');
    } else {
      publish({
        phase: 'unknown',
        operation: 'extra-create',
        error: 'Chưa xác nhận đề xuất chi phí phát sinh đã được tạo. Hãy tải lại để kiểm tra trước khi thử lại.',
        actionSuccess: null,
      });
    }
  }

  async function reviseProposal(
    key: OrderSessionKey,
    costId: string,
    payload: CreateAdditionalCostPayload,
  ): Promise<void> {
    if (!deps.isCurrent(key) || key.role !== 'technician') return;
    if (state.phase === 'submitting' || state.phase === 'verifying') return;

    if (!transport.reviseProposal) {
      publish({ phase: 'denied', operation: 'extra-revise', targetId: costId, error: 'Sửa đề xuất chưa được hỗ trợ trên môi trường hiện tại.', actionSuccess: null });
      return;
    }

    try {
      await refresh(key, ['extras']);
    } catch {
      publish({
        phase: 'denied',
        operation: 'extra-revise',
        targetId: costId,
        error: 'Không thể tải chi phí phát sinh để kiểm tra điều kiện sửa. Vui lòng thử lại.',
        actionSuccess: null,
      });
      return;
    }

    if (!deps.isCurrent(key)) return;

    // Gate verification
    const order = currentOrder(deps.readCoordinator, key);
    if (!order || isHistoricalOrder(order) || order.technician?.id !== key.userId) {
      publish({ phase: 'denied', operation: 'extra-revise', targetId: costId, error: 'Chỉ kỹ thuật viên phụ trách mới có quyền sửa đề xuất.', actionSuccess: null });
      return;
    }
    if (String(order.status).toUpperCase() !== 'UNDER_REPAIR' || !!order.completionRequestedAt) {
      publish({ phase: 'denied', operation: 'extra-revise', targetId: costId, error: 'Sửa đề xuất chỉ hợp lệ khi đơn đang sửa chữa và chưa yêu cầu hoàn tất.', actionSuccess: null });
      return;
    }

    const extras = currentExtras(deps.readCoordinator, key);
    if (!extras) {
      publish({ phase: 'denied', operation: 'extra-revise', targetId: costId, error: 'Dữ liệu chi phí phát sinh chưa sẵn sàng.', actionSuccess: null });
      return;
    }
    const targetCost = extras.find((c) => c.id === costId && c.serviceOrderId === key.serviceOrderId);
    if (!targetCost) {
      publish({ phase: 'denied', operation: 'extra-revise', targetId: costId, error: 'Không tìm thấy đề xuất cần sửa.', actionSuccess: null });
      return;
    }
    if (String(targetCost.status).toUpperCase() !== 'PENDING_APPROVAL') {
      publish({ phase: 'denied', operation: 'extra-revise', targetId: costId, error: 'Chỉ đề xuất đang chờ duyệt mới có thể sửa.', actionSuccess: null });
      return;
    }
    if (isCostDecisionBlocked(targetCost.expiresAt)) {
      publish({ phase: 'denied', operation: 'extra-revise', targetId: costId, error: 'Đề xuất đã hết hạn, không thể sửa.', actionSuccess: null });
      return;
    }

    const intentId = `extra-revise-${Date.now()}`;
    let createdId: string | null = null;
    publish({ phase: 'submitting', operation: 'extra-revise', targetId: costId, revisingId: costId, error: null, actionSuccess: null });

    await adapter.dispatch(
      key,
      {
        intentId,
        entityId: costId,
        operation: 'extra-revise',
      },
      async () => {
        // Deferred gate check
        const liveOrder = currentOrder(deps.readCoordinator, key);
        if (
          !deps.isCurrent(key) ||
          !liveOrder ||
          String(liveOrder.status).toUpperCase() !== 'UNDER_REPAIR' ||
          !!liveOrder.completionRequestedAt ||
          liveOrder.technician?.id !== key.userId
        ) {
          throw new Error('Order status or technician changed before extra-revise dispatch.');
        }

        const liveExtras = currentExtras(deps.readCoordinator, key);
        const liveCost = liveExtras?.find((c) => c.id === costId && c.serviceOrderId === key.serviceOrderId);
        if (
          !liveCost ||
          String(liveCost.status).toUpperCase() !== 'PENDING_APPROVAL' ||
          isCostDecisionBlocked(liveCost.expiresAt)
        ) {
          throw new Error('Target proposal invalid, expired, or not pending approval before extra-revise dispatch.');
        }

        const res = await transport.reviseProposal!(costId, payload);
        const captured = createdProposalIdOf(res);
        if (captured) {
          createdId = captured;
          await deps.journal.recordEntity(key.userId, intentId, createdId);
        }
      },
      async (): Promise<CommandReadbackVerdict> => {
        const marker = deps.journal.list(key.userId).find((m) => m.intentId === intentId);
        const targetId = createdId ?? marker?.resultEntityId;
        if (!targetId) return 'unresolved';
        try {
          const list = await transport.getAdditionalCosts(key.serviceOrderId);
          const matched = list.find((c) => c.id === targetId && c.serviceOrderId === key.serviceOrderId);
          if (!matched) return 'unresolved';
          if (
            String(matched.status).toUpperCase() === 'PENDING_APPROVAL' &&
            (matched.supersedesId === costId || matched.id === costId)
          ) {
            return 'resolved';
          }
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
        operation: 'extra-revise',
        resolvedEntityId: createdId ?? finalMarker.resultEntityId ?? null,
        actionSuccess: 'Đã cập nhật bản sửa đề xuất thành công!',
        error: null,
      });
      deps.notify?.('Sửa đề xuất chi phí', 'Đã cập nhật bản sửa đề xuất thành công.');
    } else {
      publish({
        phase: 'unknown',
        operation: 'extra-revise',
        error: 'Chưa xác nhận bản sửa đề xuất đã được tạo. Hãy tải lại để kiểm tra trước khi thử lại.',
        actionSuccess: null,
      });
    }
  }

  async function verify(key: OrderSessionKey, intentId: string): Promise<void> {
    if (!deps.isCurrent(key)) return;
    const allowedOps: OrderCommandOperation[] = ['extra-create', 'extra-revise'];
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
        const targetId = marker.resultEntityId;
        if (!targetId) return 'unresolved';
        const list = await transport.getAdditionalCosts(key.serviceOrderId);
        const matched = list.find((c) => c.id === targetId && c.serviceOrderId === key.serviceOrderId);
        if (!matched) return 'unresolved';
        return String(matched.status).toUpperCase() === 'PENDING_APPROVAL' ? 'resolved' : 'unresolved';
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
    subscribe: (fn: (s: TechnicianExtraCostState) => void) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    createProposal,
    reviseProposal,
    verify,
    reset,
  };
}
