import { isHistoricalOrder, type ServiceOrderItem } from '../../../api/orders.api';
import { additionalCostWireStatuses, type AdditionalCostWireStatus } from '../../../types/api.types';
import type { OrderSessionSnapshot, OrderTaskResolution, Resource } from './order-session.types';

const upper = (value: string | undefined) => value?.toUpperCase();
function result(taskId: OrderTaskResolution['taskId'], stage: OrderTaskResolution['stage'], readOnly = true, blockers: OrderTaskResolution['blockers'] = []): OrderTaskResolution {
  return { taskId, stage, readOnly, blockers };
}
function current<T extends { id: string; status: string; version?: number; supersedesId?: string | null }>(resource: Resource<T[]>): T | null | undefined {
  if (resource.status !== 'ready') return undefined;
  const replaced = new Set(resource.data.map(row => row.supersedesId).filter(Boolean));
  const rows = resource.data.filter(row => !replaced.has(row.id) && upper(row.status) !== 'SUPERSEDED');
  if (!rows.length) return null;
  if (rows.length === 1) return rows[0];
  // Versions must be explicit when multiple snapshots compete; dates/array order are not authority.
  if (rows.some(row => !Number.isInteger(row.version))) return undefined;
  const sorted = [...rows].sort((a, b) => b.version! - a.version!);
  return sorted[0].version === sorted[1].version ? undefined : sorted[0];
}
function accessOrder(s: OrderSessionSnapshot, role: 'customer' | 'technician'): ServiceOrderItem | null {
  if (s.key.role !== role || s.access !== 'current' || s.order.status !== 'ready' || isHistoricalOrder(s.order.data)) return null;
  if (s.order.data.id !== s.key.serviceOrderId) return null;
  if (role === 'technician' && s.order.data.technician?.id !== s.key.userId) return null;
  return s.order.data;
}
export function actionableExtras(s: OrderSessionSnapshot) {
  const resource = s.resources.extras;
  if (resource.status !== 'ready') return undefined;
  if (resource.data.some(row => row.serviceOrderId !== s.key.serviceOrderId)) return undefined;
  if (resource.data.some(row => typeof row.status !== 'string'
    || !additionalCostWireStatuses.includes(row.status.toLowerCase() as AdditionalCostWireStatus))) return undefined;
  const replaced = new Set(resource.data.map(row => row.supersedesId).filter(Boolean));
  return resource.data.filter(row => !replaced.has(row.id) && row.serviceOrderId === s.key.serviceOrderId && upper(row.status) === 'PENDING_APPROVAL');
}
export function resolveCustomerTask(s: OrderSessionSnapshot): OrderTaskResolution {
  const o = accessOrder(s, 'customer');
  if (!o) return result('CX', null, true, ['access']);
  if (o.status === 'CANCELLED') return result('CX', 4);
  if (o.status === 'COMPLETED') return result('C12', 4);
  if (s.pendingIntent) return result(o.completionRequestedAt ? 'C11' : 'CX', o.completionRequestedAt ? 4 : null, true, ['unknown-command']);
  if (o.completionRequestedAt) {
    if (s.resources.invoice.status !== 'ready' || s.resources.invoice.data === null) return result('C08', 4, true, ['resource']);
    const invoice = s.resources.invoice.data;
    if (invoice.serviceOrderId !== o.id) return result('CX', 4, true, ['resource']);
    if (upper(invoice.paymentStatus) === 'PAID') return result('C11', 4);
    if (upper(invoice.paymentStatus) !== 'UNPAID') return result('C11', 4, true, ['unsupported']);
    if (s.resources.cash.status !== 'ready') return result('C11', 4, true, ['resource']);
    if (s.resources.cash.data) {
      if (s.resources.cash.data.serviceOrderId !== o.id) return result('C11', 4, true, ['resource']);
      return result('C10', 4, upper(s.resources.cash.data.status) !== 'PENDING_CONFIRMATION');
    }
    return result('C09', 4, false);
  }
  if (o.status === 'UNDER_REPAIR') {
    const extras = actionableExtras(s);
    if (extras === undefined) return result('C06', 3, true, ['resource']);
    if (extras.length === 1) return { ...result('C07', 3, false), target: { id: extras[0].id, version: extras[0].version } };
    if (extras.length > 1) return { ...result('C07', 3, true, ['version']), targets: extras.map(e => ({ id: e.id, version: e.version })) };
    return result('C06', 3);
  }
  if (o.status === 'EN_ROUTE') {
    const stage = o.arrivalVerified === true ? 2 : 1;
    if (upper(o.pricingMode) === 'INSPECTION_REQUIRED') {
      const quote = current(s.resources.quotations);
      if (quote === undefined) return result('C04', stage, true, ['resource']);
      if (quote && upper(quote.status) === 'SENT') return { ...result('C05', 2, false), target: { id: quote.id, version: quote.version } };
      if (quote && upper(quote.status) === 'REJECTED') return result('CX', 2, true, ['order']);
    }
    return result('C04', stage);
  }
  if (o.status === 'ACCEPTED') return result('C03', 1);
  return result('CX', null, true, ['unsupported']);
}
export function resolveTechnicianTask(s: OrderSessionSnapshot): OrderTaskResolution {
  if (s.key.role === 'technician' && s.access === 'historical') return result('TH', null);
  const o = accessOrder(s, 'technician');
  if (!o) return result('TX', null, true, ['access']);
  if (o.status === 'CANCELLED') return result('TX', 4);
  if (o.status === 'COMPLETED') return result('T16', 4);
  if (o.completionRequestedAt) return result('T15', 4, true, s.pendingIntent ? ['unknown-command'] : []);
  if (s.pendingIntent) return result(o.status === 'UNDER_REPAIR' ? 'T09' : 'TR', o.status === 'UNDER_REPAIR' ? 3 : 2, true, ['unknown-command']);
  if (o.status === 'UNDER_REPAIR') {
    const extras = actionableExtras(s);
    if (extras === undefined) return result('T09', 3, true, ['resource']);
    if (extras.length === 1) return { ...result('T11', 3), target: { id: extras[0].id, version: extras[0].version } };
    if (extras.length > 1) return { ...result('T11', 3), targets: extras.map(e => ({ id: e.id, version: e.version })) };
    return result('T09', 3, false);
  }
  if (o.status === 'ACCEPTED') return result('T02', 1, false);
  if (o.status !== 'EN_ROUTE') return result('TX', null, true, ['unsupported']);
  if (o.arrivalVerified !== true) return result('T03', 1, false);
  if (s.resources.evidence.status !== 'ready') return result('TR', 2, true, ['resource']);
  const own = s.resources.evidence.data.filter(e => e.serviceOrderId === o.id && e.uploaderId === s.key.userId);
  if (!own.some(e => e.type === 'CHECKIN_FACE')) return result('T05', 2, false);
  const beforeCount = own.filter(e => e.type === 'BEFORE').length;
  const minimum = s.proofPolicy?.beforeMinimum;
  if (!beforeCount || (minimum !== undefined && beforeCount < minimum)) return result('T06', 2, false);
  if (upper(o.pricingMode) === 'INSPECTION_REQUIRED') {
    const quotations = s.resources.quotations;
    if (quotations.status === 'ready' && quotations.data.some(q => q.serviceOrderId !== o.id || !q.technicianId)) return result('TR', 2, true, ['resource']);
    const quote = current(quotations.status === 'ready'
      ? { ...quotations, data: quotations.data.filter(q => q.technicianId === s.key.userId) }
      : quotations);
    if (quote === undefined) return result('TR', 2, true, ['resource']);
    if (!quote || upper(quote.status) === 'DRAFT') return result('T07', 2, false);
    if (upper(quote.status) === 'SENT') return { ...result('T08', 2), target: { id: quote.id, version: quote.version } };
    if (upper(quote.status) !== 'APPROVED') return result('TX', 2, true, ['unsupported']);
  } else if (upper(o.pricingMode) !== 'FIXED_PRICE') return result('TR', 2, true, ['unsupported']);
  if (minimum === undefined || !Number.isInteger(minimum) || minimum < 1) return result('TR', 2, true, ['proof-policy']);
  // Recovery is offered by a separate capability check, never normal auto POST.
  return result('TR', 2);
}
