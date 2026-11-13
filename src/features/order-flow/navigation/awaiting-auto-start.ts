import type { OrderSessionSnapshot } from '../domain/order-session.types';

/**
 * M-11: while the technician waits on site for the customer's quotation decision, the order moves on by itself
 * (approve, then the server's autoStartRepair a moment later). A push for either write can be missed or read
 * before the second write, and the socket poll only runs when the socket is down, so the screen stayed on
 * "Chờ duyệt báo giá" / EN_ROUTE until the technician reopened the order. While the session shows an
 * EN_ROUTE order with a sent or approved quotation, the order is read again on a short interval.
 */
export const AWAITING_DECISION_POLL_MS = 8_000;

export function awaitingAutoStart(snapshot: OrderSessionSnapshot | null | undefined): boolean {
  if (!snapshot || snapshot.key.role !== 'technician' || snapshot.order.status !== 'ready') return false;
  if (String(snapshot.order.data.status).toUpperCase() !== 'EN_ROUTE') return false;
  const quotations = snapshot.resources.quotations;
  return quotations.status === 'ready' && Array.isArray(quotations.data)
    // The quotation list is read per order; rows may omit serviceOrderId, so only a row naming another order is skipped.
    && quotations.data.some(q => (!q.serviceOrderId || q.serviceOrderId === snapshot.key.serviceOrderId)
      && ['SENT', 'APPROVED'].includes(String(q.status).toUpperCase()));
}
