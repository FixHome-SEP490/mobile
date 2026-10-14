import { isHistoricalOrder } from '../../../api/orders.api';
import { sameOrderSession, type OrderSessionKey, type OrderSessionSnapshot, type OrderRole } from './order-session.types';
import type { OrderCommandJournal, OrderCommandMarker, OrderCommandStatus } from '../runtime/order-command-journal';

export type RestoredExtraRecovery =
  | {
      hasRecovery: false;
      isUnresolved: false;
    }
  | {
      hasRecovery: true;
      operation: 'extra-create' | 'extra-revise' | 'extra-decision';
      intentId: string;
      entityId: string;
      resultEntityId?: string;
      status: OrderCommandStatus;
      isUnresolved: boolean;
      role: OrderRole;
      serviceOrderId: string;
    };

export type RestoredPartsRecovery =
  | {
      hasRecovery: false;
      isUnresolved: false;
    }
  | {
      hasRecovery: true;
      operation: 'parts-create' | 'parts-receive' | 'parts-usage' | 'parts-cancel';
      intentId: string;
      entityId: string;
      resultEntityId?: string;
      status: OrderCommandStatus;
      isUnresolved: boolean;
      role: OrderRole;
      serviceOrderId: string;
    };

/**
 * Scoped read-only restored extra recovery for M5 extras (creation, revision, decision).
 * Enforces session key, current access, ready non-historical order, and role ownership.
 * Prioritizes unresolved matching markers and retains valid terminal readback even after order leaves UNDER_REPAIR.
 */
export function getRestoredExtraRecovery(
  journal: OrderCommandJournal,
  key: OrderSessionKey | null | undefined,
  snapshot?: OrderSessionSnapshot | null,
): RestoredExtraRecovery {
  if (!key || !snapshot || snapshot.access !== 'current') {
    return { hasRecovery: false, isUnresolved: false };
  }
  if (!sameOrderSession(snapshot.key, key)) {
    return { hasRecovery: false, isUnresolved: false };
  }
  if (snapshot.order.status !== 'ready') {
    return { hasRecovery: false, isUnresolved: false };
  }
  const order = snapshot.order.data;
  if (!order || order.id !== key.serviceOrderId || isHistoricalOrder(order)) {
    return { hasRecovery: false, isUnresolved: false };
  }
  if (key.role === 'technician' && order.technician?.id !== key.userId) {
    return { hasRecovery: false, isUnresolved: false };
  }

  const allowedOps = key.role === 'technician'
    ? ['extra-create', 'extra-revise']
    : ['extra-decision'];

  const markers = journal.list(key.userId);
  const matching = markers.filter(
    (m: OrderCommandMarker) =>
      allowedOps.includes(m.operation) &&
      m.serviceOrderId === key.serviceOrderId &&
      m.role === key.role,
  );

  if (!matching.length) {
    return { hasRecovery: false, isUnresolved: false };
  }

  // Prioritize unresolved matching markers; if all settled, select latest
  const match = matching.find((m) => m.status !== 'resolved' && m.status !== 'failed-known')
    ?? matching[matching.length - 1];

  // Retain valid terminal readback even after order leaves UNDER_REPAIR (e.g. COMPLETED or completionRequested)
  const isUnderRepair = String(order.status).toUpperCase() === 'UNDER_REPAIR';
  const isTerminalOrPostRepair = ['COMPLETED', 'CANCELLED'].includes(String(order.status).toUpperCase()) || !!order.completionRequestedAt;
  if (!isUnderRepair && !isTerminalOrPostRepair && match.status !== 'resolved') {
    return { hasRecovery: false, isUnresolved: false };
  }

  const isUnresolved = match.status !== 'resolved' && match.status !== 'failed-known';
  return {
    hasRecovery: true,
    operation: match.operation as 'extra-create' | 'extra-revise' | 'extra-decision',
    intentId: match.intentId,
    entityId: match.entityId,
    resultEntityId: match.resultEntityId,
    status: match.status,
    isUnresolved,
    role: match.role,
    serviceOrderId: match.serviceOrderId,
  };
}

/**
 * Scoped read-only restored parts recovery for M5 parts lifecycle.
 * Technician-only; enforces session key, current access, ready non-historical order, and technician assignment.
 * Prioritizes unresolved matching markers.
 */
export function getRestoredPartsRecovery(
  journal: OrderCommandJournal,
  key: OrderSessionKey | null | undefined,
  snapshot?: OrderSessionSnapshot | null,
): RestoredPartsRecovery {
  if (!key || !snapshot || snapshot.access !== 'current') {
    return { hasRecovery: false, isUnresolved: false };
  }
  if (key.role !== 'technician') {
    return { hasRecovery: false, isUnresolved: false };
  }
  if (!sameOrderSession(snapshot.key, key)) {
    return { hasRecovery: false, isUnresolved: false };
  }
  if (snapshot.order.status !== 'ready') {
    return { hasRecovery: false, isUnresolved: false };
  }
  const order = snapshot.order.data;
  if (!order || order.id !== key.serviceOrderId || isHistoricalOrder(order)) {
    return { hasRecovery: false, isUnresolved: false };
  }
  if (order.technician?.id !== key.userId) {
    return { hasRecovery: false, isUnresolved: false };
  }

  const allowedOps = ['parts-create', 'parts-receive', 'parts-usage', 'parts-cancel'];
  const markers = journal.list(key.userId);
  const matching = markers.filter(
    (m: OrderCommandMarker) =>
      allowedOps.includes(m.operation) &&
      m.serviceOrderId === key.serviceOrderId &&
      m.role === 'technician',
  );

  if (!matching.length) {
    return { hasRecovery: false, isUnresolved: false };
  }

  // Prioritize unresolved matching markers; if all settled, select latest
  const match = matching.find((m) => m.status !== 'resolved' && m.status !== 'failed-known')
    ?? matching[matching.length - 1];

  const isUnresolved = match.status !== 'resolved' && match.status !== 'failed-known';
  return {
    hasRecovery: true,
    operation: match.operation as 'parts-create' | 'parts-receive' | 'parts-usage' | 'parts-cancel',
    intentId: match.intentId,
    entityId: match.entityId,
    resultEntityId: match.resultEntityId,
    status: match.status,
    isUnresolved,
    role: match.role,
    serviceOrderId: match.serviceOrderId,
  };
}
