import type { OrderResourceKind, OrderSessionSnapshot, OrderTaskResolution } from '../domain/order-session.types';
import { isHistoricalOrder } from '../../../api/orders.api';

export type TaskRouteTransition = { kind: 'hold' } | { kind: 'replace'; taskId: OrderTaskResolution['taskId'] };

/** Load only the reads the current resolver needs; historical technician rows are summary-only. */
export function requiredTaskResources(snapshot: OrderSessionSnapshot): OrderResourceKind[] {
  if (snapshot.access !== 'current' || snapshot.order.status !== 'ready' || isHistoricalOrder(snapshot.order.data)) return [];
  const order = snapshot.order.data;
  if (order.status === 'COMPLETED' || order.status === 'CANCELLED') return [];
  if (snapshot.key.role === 'customer') {
    if (order.completionRequestedAt) return ['invoice', 'cash', 'evidence'];
    if (order.status === 'UNDER_REPAIR') return ['extras'];
    if (order.status === 'EN_ROUTE' && order.pricingMode?.toUpperCase() === 'INSPECTION_REQUIRED') return ['quotations'];
    return [];
  }
  if (order.completionRequestedAt) return ['invoice', 'cash'];
  if (order.status === 'UNDER_REPAIR') return ['extras'];
  if (order.status === 'EN_ROUTE' && order.arrivalVerified === true) {
    return order.pricingMode?.toUpperCase() === 'INSPECTION_REQUIRED' ? ['evidence', 'quotations'] : ['evidence'];
  }
  return [];
}

/**
 * Keep a visible task stable while its newly required reads are refreshing.
 * Terminal, revoked, and unresolved-payment outcomes are meaningful readbacks
 * and may replace immediately; this function never dispatches business writes.
 * Manual T04 lives on its own stack route and is never an automatic taskId,
 * so this function never targets it and never bounces it back to T03.
 */
export const MANUAL_ARRIVAL_CHECK_IN_ROUTE = 'ArrivalCheckIn' as const;
export const MANUAL_BEFORE_CAPTURE_ROUTE = 'BeforeCapture' as const;

/** Manual arrival screen stays visible; an automatic T03 readback must not pop it. */
export function keepManualArrivalCheckIn(currentRouteName: string | undefined): boolean {
  return currentRouteName === MANUAL_ARRIVAL_CHECK_IN_ROUTE;
}

/** Manual BEFORE capture stays visible; automatic readbacks must not bounce it away. */
export function keepManualBeforeCapture(currentRouteName: string | undefined): boolean {
  return currentRouteName === MANUAL_BEFORE_CAPTURE_ROUTE;
}
export function taskRouteTransition(
  currentTaskId: OrderTaskResolution['taskId'] | undefined,
  next: OrderTaskResolution,
  snapshot: OrderSessionSnapshot | null,
): TaskRouteTransition {
  if (currentTaskId === next.taskId) return { kind: 'hold' };
  if (!snapshot) return { kind: 'hold' };

  if (snapshot.access === 'revoked') {
    const roleException = snapshot.key.role === 'customer' ? 'CX' : 'TX';
    return next.taskId === roleException ? { kind: 'replace', taskId: roleException } : { kind: 'hold' };
  }

  if (snapshot.access === 'historical') {
    return snapshot.key.role === 'technician' && next.taskId === 'TH'
      ? { kind: 'replace', taskId: 'TH' }
      : { kind: 'hold' };
  }

  if (snapshot.access !== 'current' || snapshot.order.status !== 'ready') return { kind: 'hold' };

  const terminal = snapshot.order.data.status === 'COMPLETED' || snapshot.order.data.status === 'CANCELLED';
  const unknownPayment = next.taskId === 'C11' && next.blockers.includes('unknown-command');
  if (terminal || unknownPayment) return { kind: 'replace', taskId: next.taskId };

  // Resource blockers commonly appear during foreground/manual refresh. Do
  // not bounce away from an already visible task while its next read is pending.
  if (next.blockers.includes('resource') || next.blockers.includes('access')) return { kind: 'hold' };

  return { kind: 'replace', taskId: next.taskId };
}
