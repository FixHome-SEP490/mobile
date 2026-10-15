import { isHistoricalOrder } from '../../../api/orders.api';
import type { OrderSessionSnapshot } from './order-session.types';
import { actionableExtras } from './order-task-resolver';

export function matchesDecisionTarget(current: { id: string; version?: number } | undefined, captured: { id: string; version?: number }): boolean {
  return !!current && current.id === captured.id && current.version === captured.version;
}
/** Preliminary UX eligibility only. Authenticated Backend commands remain authoritative. */
export function getOrderCapabilities(s: OrderSessionSnapshot) {
  const denied = { canRecoverRepair: false, canRequestCompletion: false, canAttemptRequestCompletion: false };
  if (s.key.role !== 'technician' || s.access !== 'current' || s.pendingIntent || s.order.status !== 'ready' || isHistoricalOrder(s.order.data)) return denied;
  const order = s.order.data;
  if (order.id !== s.key.serviceOrderId || order.technician?.id !== s.key.userId || order.completionRequestedAt) return denied;
  if (s.resources.evidence.status !== 'ready') return denied;
  const extras = actionableExtras(s); if (!extras || extras.length) return denied;
  const partsReady = s.resources.parts.status === 'ready'
    && !s.resources.parts.data.some(p => p.serviceOrderId !== order.id || !p.technicianId)
    && !s.resources.parts.data.filter(p => p.technicianId === s.key.userId).some(p =>
      p.status !== 'cancelled' && p.status !== 'completed' && (p.status !== 'received' || p.items.some(i => i.usageStatus !== 'used' && i.usageStatus !== 'returned')));
  const mode = order.pricingMode?.toUpperCase();
  const fixed = mode === 'FIXED_PRICE' && typeof order.fixedUnitPrice === 'number' && Number.isFinite(order.fixedUnitPrice) && order.fixedUnitPrice >= 0;
  const quotes = s.resources.quotations;
  const inspected = mode === 'INSPECTION_REQUIRED' && quotes.status === 'ready'
    && quotes.data.some(q => q.serviceOrderId === order.id && q.technicianId === s.key.userId && q.status.toUpperCase() === 'APPROVED')
    && !quotes.data.some(q => q.status.toUpperCase() === 'SENT');
  if (!fixed && !inspected) return denied;
  const evidence = s.resources.evidence.data.filter(e => e.serviceOrderId === order.id && e.uploaderId === s.key.userId);
  const before = s.proofPolicy?.beforeMinimum, after = s.proofPolicy?.afterMinimum;
  const afterCount = evidence.filter(e => e.type === 'AFTER').length;
  const knownAfterPolicy = after !== undefined && Number.isInteger(after) && after > 0;
  return {
    canRecoverRepair: order.status === 'EN_ROUTE' && order.arrivalVerified === true && before !== undefined && Number.isInteger(before) && before > 0
      && evidence.some(e => e.type === 'CHECKIN_FACE') && evidence.filter(e => e.type === 'BEFORE').length >= before,
    canRequestCompletion: partsReady && order.status === 'UNDER_REPAIR' && knownAfterPolicy && afterCount >= after!,
    // User-confirmed attempt asks Backend to validate its private runtime policy.
    // It is not a claim that the configured AFTER threshold is already satisfied.
    canAttemptRequestCompletion: partsReady && order.status === 'UNDER_REPAIR' && afterCount > 0
      && (after === undefined || (knownAfterPolicy && afterCount >= after!)),
  };
}
