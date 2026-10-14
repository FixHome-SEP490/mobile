import { isHistoricalOrder } from '../../../api/orders.api';
import { sameOrderSession, type OrderSessionKey, type OrderSessionSnapshot, type OrderRole } from './order-session.types';
import type { OrderCommandJournal, OrderCommandMarker, OrderCommandStatus } from '../runtime/order-command-journal';

export type RestoredQuotationRecovery =
  | {
      hasRecovery: false;
      isUnresolved: false;
    }
  | {
      hasRecovery: true;
      operation: 'quote-create' | 'quote-decision';
      intentId: string;
      entityId: string;
      resultEntityId?: string;
      targetQuoteId?: string;
      status: OrderCommandStatus;
      isUnresolved: boolean;
      role: OrderRole;
      serviceOrderId: string;
    };

/**
 * Scoped read-only restored quotation recovery from M4 logic.
 * Inspects exact current user/role/order, pricing mode, assignment,
 * and quote-create / quote-decision markers against actual owned target.
 * Fails closed on revoked access, non-inspection orders, foreign holders, or mismatched roles.
 */
export function getRestoredQuotationRecovery(
  journal: OrderCommandJournal,
  key: OrderSessionKey | null | undefined,
  snapshot?: OrderSessionSnapshot | null,
): RestoredQuotationRecovery {
  if (!key || !snapshot || snapshot.access !== 'current') {
    return { hasRecovery: false, isUnresolved: false };
  }
  // Full session key compare (user/role/sessionGeneration/order) before exposing scoped recovery.
  if (!sameOrderSession(snapshot.key, key)) {
    return { hasRecovery: false, isUnresolved: false };
  }

  // Full order validation: must be current ready non-historical INSPECTION_REQUIRED order
  if (snapshot.order.status !== 'ready') {
    return { hasRecovery: false, isUnresolved: false };
  }
  const order = snapshot.order.data;
  if (!order || order.id !== key.serviceOrderId || isHistoricalOrder(order)) {
    return { hasRecovery: false, isUnresolved: false };
  }
  if (String(order.pricingMode ?? '').toUpperCase() !== 'INSPECTION_REQUIRED') {
    return { hasRecovery: false, isUnresolved: false };
  }
  if (key.role === 'technician' && order.technician?.id !== key.userId) {
    return { hasRecovery: false, isUnresolved: false };
  }

  const allowedOps = key.role === 'technician' ? ['quote-create'] : ['quote-decision'];
  const markers = journal.list(key.userId);
  const match = markers.find(
    (m: OrderCommandMarker) =>
      m.serviceOrderId === key.serviceOrderId &&
      m.role === key.role &&
      allowedOps.includes(m.operation) &&
      m.status !== 'resolved' &&
      m.status !== 'failed-known',
  );

  if (!match) {
    return { hasRecovery: false, isUnresolved: false };
  }

  // Target quote validation when quotations resource is ready
  if (match.operation === 'quote-decision' && snapshot.resources.quotations.status === 'ready') {
    const targetQ = snapshot.resources.quotations.data.find(
      q => q.id === match.entityId && q.serviceOrderId === key.serviceOrderId,
    );
    // If target quote exists and belongs to a different technician than assigned order technician, fail closed
    if (targetQ && order.technician?.id && targetQ.technicianId !== order.technician.id) {
      return { hasRecovery: false, isUnresolved: false };
    }
  }

  return {
    hasRecovery: true,
    operation: match.operation as 'quote-create' | 'quote-decision',
    intentId: match.intentId,
    entityId: match.entityId,
    resultEntityId: match.resultEntityId,
    targetQuoteId: match.operation === 'quote-decision' ? match.entityId : match.resultEntityId,
    status: match.status,
    isUnresolved: true,
    role: match.role,
    serviceOrderId: match.serviceOrderId,
  };
}
