import { isHistoricalOrder, type EvidenceResponse, type TechnicianOrderItem } from '../../../api/orders.api';
import { additionalCostWireStatuses, type AdditionalCostWireStatus } from '../../../types/api.types';
import type { OrderResourceData, OrderResourceKind, OrderRole } from './order-session.types';

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid order resource');
  return value as Record<string, unknown>;
}
function validMoney(value: unknown): value is number | string {
  return typeof value === 'number' ? Number.isFinite(value) && value >= 0
    : typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value) && Number.isFinite(Number(value));
}
function invoiceItems(value: unknown) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error('Invalid invoice items');
  return value.map(entry => {
    const item = record(entry);
    if (typeof item.id !== 'string' || !item.id || typeof item.description !== 'string' || !item.description.trim()
      || typeof item.quantity !== 'number' || !Number.isInteger(item.quantity) || item.quantity <= 0 || !validMoney(item.lineTotal)) throw new Error('Invalid invoice item');
    return { id: item.id, description: item.description, quantity: item.quantity, lineTotal: item.lineTotal };
  });
}
export function normalizeSessionOrder(payload: unknown, orderId: string): TechnicianOrderItem {
  const row = record(payload);
  if (row.id !== orderId || typeof row.status !== 'string') throw new Error('Invalid order');
  const status = row.status.toUpperCase();
  if (!['ACCEPTED', 'EN_ROUTE', 'UNDER_REPAIR', 'COMPLETED', 'CANCELLED'].includes(status)) throw new Error('Invalid order status');
  if (isHistoricalOrder(row)) {
    if (typeof row.code !== 'string' || typeof row.createdAt !== 'string') throw new Error('Invalid history');
    return { id: orderId, code: row.code, status: status as TechnicianOrderItem['status'],
      createdAt: row.createdAt, completedAt: typeof row.completedAt === 'string' ? row.completedAt : null,
      cancelledAt: typeof row.cancelledAt === 'string' ? row.cancelledAt : null, historical: true };
  }
  return { ...row, status } as unknown as TechnicianOrderItem;
}
export function normalizeOrderResource<K extends OrderResourceKind>(kind: K, payload: unknown, orderId: string, role: OrderRole): OrderResourceData[K] {
  if (kind === 'invoice' || kind === 'cash') {
    if (payload === null) return null as OrderResourceData[K];
    const row = record(payload);
    if (typeof row.id !== 'string' || !row.id || row.serviceOrderId !== orderId) throw new Error('Invalid financial resource');
    const status = kind === 'invoice' ? row.paymentStatus : row.status;
    if (typeof status !== 'string') throw new Error('Invalid financial status');
    const amount = kind === 'invoice' ? row.grandTotal : row.declaredAmount;
    // Preserve existing financial parsing policy. Missing/invalid values never become 0 here.
    if (!validMoney(amount)) throw new Error('Invalid financial amount');
    if (kind === 'cash' && ((row.declaredByTechnicianId !== undefined && (typeof row.declaredByTechnicianId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(row.declaredByTechnicianId)))
      || (row.declaredAt !== undefined && (typeof row.declaredAt !== 'string' || !Number.isFinite(Date.parse(row.declaredAt))))
      || (row.technicianNotes !== undefined && row.technicianNotes !== null && (typeof row.technicianNotes !== 'string' || row.technicianNotes.length > 2000)))) throw new Error('Invalid cash declaration');
    return (kind === 'invoice' ? {
      id: row.id, serviceOrderId: orderId, paymentStatus: status, grandTotal: amount,
      laborTotal: row.laborTotal, partsTotal: row.partsTotal, issuedAt: row.issuedAt, paidAt: row.paidAt, items: invoiceItems(row.items),
    } : { id: row.id, serviceOrderId: orderId, status, declaredAmount: amount, confirmedAmount: row.confirmedAmount,
      ...(row.declaredByTechnicianId === undefined ? {} : { declaredByTechnicianId: row.declaredByTechnicianId }),
      ...(row.declaredAt === undefined ? {} : { declaredAt: row.declaredAt }),
      ...(row.technicianNotes === undefined ? {} : { technicianNotes: row.technicianNotes }) }) as OrderResourceData[K];
  }
  if (!Array.isArray(payload)) throw new Error('Invalid resource list');
  const rows = payload.map(record);
  if (rows.some(row => typeof row.id !== 'string' || !row.id || row.serviceOrderId !== orderId)) throw new Error('Mismatched resource');
  if (kind === 'history') {
    const statuses = ['ACCEPTED', 'EN_ROUTE', 'UNDER_REPAIR', 'COMPLETED', 'CANCELLED'];
    return rows.map(row => {
      const fromStatus = row.fromStatus === null ? null : typeof row.fromStatus === 'string' ? row.fromStatus.toUpperCase() : undefined;
      const toStatus = typeof row.toStatus === 'string' ? row.toStatus.toUpperCase() : '';
      if (fromStatus === undefined || (fromStatus !== null && !statuses.includes(fromStatus)) || !statuses.includes(toStatus)
        || typeof row.createdAt !== 'string' || !Number.isFinite(Date.parse(row.createdAt))) throw new Error('Invalid history');
      return { id: row.id, serviceOrderId: orderId, fromStatus, toStatus,
        actorRole: typeof row.actorRole === 'string' ? row.actorRole : null, reason: typeof row.reason === 'string' ? row.reason : null, createdAt: row.createdAt };
    }) as OrderResourceData[K];
  }
  if (kind === 'evidence') {
    const data: EvidenceResponse[] = [];
    for (const row of rows) {
      const type = typeof row.type === 'string' ? row.type.toUpperCase() : '';
      if (role === 'customer' && type === 'CHECKIN_FACE') continue;
      if (!['BEFORE', 'AFTER', 'ADDITIONAL', 'CHECKIN_FACE'].includes(type) || typeof row.mediaUrl !== 'string') throw new Error('Invalid evidence');
      data.push({ id: row.id as string, serviceOrderId: orderId, type: type as EvidenceResponse['type'],
        mediaUrl: row.mediaUrl, uploaderId: typeof row.uploaderId === 'string' ? row.uploaderId : undefined,
        createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
        note: typeof row.note === 'string' ? row.note : undefined, capturedAt: typeof row.capturedAt === 'string' ? row.capturedAt : undefined });
    }
    return data as OrderResourceData[K];
  }
  if (rows.some(row => typeof row.status !== 'string')) throw new Error('Invalid resource status');
  if (kind === 'extras') {
    return rows.map(row => {
      const status = String(row.status).toLowerCase();
      if (!additionalCostWireStatuses.includes(status as AdditionalCostWireStatus)) throw new Error('Invalid additional cost status');
      // Money columns are bigint, so the wire carries them as digit strings; screens read numbers.
      const money = (value: unknown) => (typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value) : value);
      return {
        ...row, status,
        totalLaborDelta: money(row.totalLaborDelta), totalPartsDelta: money(row.totalPartsDelta),
        ...(row.shippingFee !== undefined ? { shippingFee: money(row.shippingFee) } : {}),
        ...(Array.isArray(row.items) ? { items: row.items.map(item => {
          const i = record(item);
          return { ...i, unitPrice: money(i.unitPrice), lineTotal: money(i.lineTotal), ...(i.warrantyFee != null ? { warrantyFee: money(i.warrantyFee) } : {}) };
        }) } : {}),
      };
    }) as OrderResourceData[K];
  }
  if (kind === 'parts') {
    // QR/staff internals are not display data. Current holder is technician-only.
    return rows.map(row => {
      if (!Array.isArray(row.items)) throw new Error('Invalid parts items');
      const items = row.items.map(item => {
        const i = record(item);
        if (typeof i.id !== 'string' || typeof i.partNameSnapshot !== 'string' || typeof i.quantity !== 'number'
          || !Number.isInteger(i.quantity) || i.quantity < 1 || !['pending', 'used', 'returned'].includes(String(i.usageStatus))) throw new Error('Invalid parts item');
        return { id: i.id, partNameSnapshot: i.partNameSnapshot, quantity: i.quantity, usageStatus: i.usageStatus,
          ...(typeof i.partCatalogId === 'string' ? { partCatalogId: i.partCatalogId } : {}), ...(typeof i.partSource === 'string' ? { partSource: i.partSource } : {}) };
      });
      return { id: row.id, serviceOrderId: row.serviceOrderId, status: row.status, requestType: row.requestType,
        fulfillmentMethod: row.fulfillmentMethod, ...(role === 'technician' ? { technicianId: row.technicianId } : {}), items };
    }) as unknown as OrderResourceData[K];
  }
function isSafeIntegerMoney(value: unknown): boolean {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) return false;
    const n = Number(trimmed);
    return Number.isSafeInteger(n) && n >= 0;
  }
  return false;
}

  if (kind === 'quotations') {
    const validStatuses = ['DRAFT', 'SENT', 'APPROVED', 'REJECTED', 'SUPERSEDED'];
    return rows.map(row => {
      if (typeof row.technicianId !== 'string' || !row.technicianId.trim()) throw new Error('Invalid quotation technicianId');
      const status = String(row.status).toUpperCase();
      if (!validStatuses.includes(status)) throw new Error('Invalid quotation status');
      if (typeof row.version !== 'number' || !Number.isSafeInteger(row.version) || row.version < 1) {
        throw new Error('Invalid quotation version');
      }
      if (!isSafeIntegerMoney(row.laborTotal)) throw new Error('Invalid quotation laborTotal');
      if (!isSafeIntegerMoney(row.partsTotal)) throw new Error('Invalid quotation partsTotal');
      if (!Array.isArray(row.items) || row.items.length < 1 || row.items.length > 100) {
        throw new Error('Invalid quotation items');
      }
      const items = row.items.map(item => {
        const i = record(item);
        if (typeof i.description !== 'string' || !i.description.trim()) throw new Error('Invalid quotation item description');
        if (typeof i.quantity !== 'number' || !Number.isSafeInteger(i.quantity) || i.quantity < 1 || i.quantity > 1000) {
          throw new Error('Invalid quotation item quantity');
        }
        if (!isSafeIntegerMoney(i.unitPrice)) throw new Error('Invalid quotation item unitPrice');
        if (typeof i.type !== 'string') throw new Error('Invalid quotation item type');
        const rawType = i.type.toLowerCase();
        if (rawType !== 'labor' && rawType !== 'parts_equipment') throw new Error('Invalid quotation item type');
        const type = rawType as 'labor' | 'parts_equipment';
        if (i.lineTotal !== undefined && !isSafeIntegerMoney(i.lineTotal)) throw new Error('Invalid quotation item lineTotal');
        if (i.warrantyFee !== undefined && i.warrantyFee !== null && !isSafeIntegerMoney(i.warrantyFee)) {
          throw new Error('Invalid quotation item warrantyFee');
        }
        // Authoritative Backend zero is valid for non-paid/included/no-warranty lines
        // (EXTERNAL normalized fee0/term0/days0; FixHome catalog days may be 0).
        // Only genuine technician paid_warranty requires 1..3650. Missing/nullable
        // legacy non-paid fields stay per source; malformed/negative/fractional still rejected.
        const isPaidWarranty =
          type === 'parts_equipment' &&
          String(i.partSource ?? '').toLowerCase() === 'technician' &&
          String(i.partWarrantyOption ?? '').toLowerCase() === 'paid_warranty';
        const minWarrantyTermDays = isPaidWarranty ? 1 : 0;
        if (i.warrantyTermDays !== undefined && i.warrantyTermDays !== null && (typeof i.warrantyTermDays !== 'number' || !Number.isSafeInteger(i.warrantyTermDays) || i.warrantyTermDays < minWarrantyTermDays || i.warrantyTermDays > 3650)) {
          throw new Error('Invalid quotation item warrantyTermDays');
        }
        return {
          id: typeof i.id === 'string' ? i.id : undefined,
          quotationId: typeof i.quotationId === 'string' ? i.quotationId : undefined,
          type,
          description: i.description.trim(),
          quantity: i.quantity,
          unitPrice: typeof i.unitPrice === 'number' ? i.unitPrice : Number(i.unitPrice),
          lineTotal: i.lineTotal !== undefined ? (typeof i.lineTotal === 'number' ? i.lineTotal : Number(i.lineTotal)) : undefined,
          warrantyDays: typeof i.warrantyDays === 'number' ? i.warrantyDays : undefined,
          partSource: typeof i.partSource === 'string' ? i.partSource : undefined,
          partCatalogId: typeof i.partCatalogId === 'string' ? i.partCatalogId : undefined,
          partNameSnapshot: typeof i.partNameSnapshot === 'string' ? i.partNameSnapshot : undefined,
          partWarrantyOption: typeof i.partWarrantyOption === 'string' ? i.partWarrantyOption : undefined,
          warrantyFee: i.warrantyFee !== undefined && i.warrantyFee !== null ? (typeof i.warrantyFee === 'number' ? i.warrantyFee : Number(i.warrantyFee)) : undefined,
          warrantyTermDays: typeof i.warrantyTermDays === 'number' ? i.warrantyTermDays : undefined,
          warrantyDaysSnapshot: typeof i.warrantyDaysSnapshot === 'number' ? i.warrantyDaysSnapshot : undefined,
        };
      });
      return {
        id: row.id as string,
        serviceOrderId: orderId,
        technicianId: row.technicianId.trim(),
        status,
        version: row.version,
        supersedesId: typeof row.supersedesId === 'string' ? row.supersedesId : null,
        laborTotal: row.laborTotal,
        partsTotal: row.partsTotal,
        note: typeof row.note === 'string' ? row.note : null,
        sentAt: typeof row.sentAt === 'string' ? row.sentAt : null,
        decidedAt: typeof row.decidedAt === 'string' ? row.decidedAt : null,
        createdAt: typeof row.createdAt === 'string' ? row.createdAt : undefined,
        updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : undefined,
        items,
      };
    }) as unknown as OrderResourceData[K];
  }
  return rows as unknown as OrderResourceData[K];
}
