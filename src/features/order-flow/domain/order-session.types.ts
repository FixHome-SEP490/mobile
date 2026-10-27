import type { CostRequest, EvidenceResponse, TechnicianOrderItem } from '../../../api/orders.api';
import type { PartRequest, PartRequestItem } from '../../../api/part-requests.api';

export type OrderRole = 'customer' | 'technician';
export interface OrderSessionKey {
  userId: string;
  role: OrderRole;
  sessionGeneration: number;
  serviceOrderId: string;
}
export type Resource<T> =
  | { status: 'unloaded'; requestSeq: number }
  | { status: 'loading'; requestSeq: number }
  | { status: 'ready'; requestSeq: number; fetchedAt: number; data: T }
  | { status: 'error'; requestSeq: number; error: 'unavailable' | 'invalid' };
export interface OrderQuotationItem {
  id?: string;
  quotationId?: string;
  type: 'labor' | 'parts_equipment' | 'LABOR' | 'PARTS';
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal?: number;
  warrantyDays?: number;
  partSource?: string;
  partCatalogId?: string | null;
  partNameSnapshot?: string | null;
  partWarrantyOption?: string;
  warrantyFee?: number | string | null;
  warrantyTermDays?: number | null;
  warrantyDaysSnapshot?: number | null;
}
export interface OrderQuotation {
  id: string;
  serviceOrderId: string;
  technicianId?: string;
  status: string;
  version?: number;
  supersedesId?: string | null;
  laborTotal?: number | string;
  partsTotal?: number | string;
  note?: string | null;
  sentAt?: string | null;
  decidedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  items: OrderQuotationItem[];
}
/** Money remains the server numeric/string; no client calculation or missing-to-zero coercion. */
export interface OrderInvoice {
  id: string;
  serviceOrderId: string;
  paymentStatus: string;
  grandTotal: number | string;
  laborTotal?: number | string;
  partsTotal?: number | string;
  issuedAt?: string;
  paidAt?: string | null;
  /** Undefined for a legacy payload with no lines, never silently replaced by []. */
  items?: { id: string; description: string; quantity: number; lineTotal: number | string; sourceType?: string; sourceItemId?: string | null; type?: string }[];
}
export interface OrderHistoryEntry {
  id: string;
  serviceOrderId: string;
  fromStatus: string | null;
  toStatus: string;
  actorRole: string | null;
  reason: string | null;
  createdAt: string;
}
export interface OrderCashSettlement {
  id: string;
  serviceOrderId: string;
  status: string;
  declaredAmount: number | string;
  confirmedAmount?: number | string | null;
  declaredByTechnicianId?: string;
  declaredAt?: string;
  technicianNotes?: string | null;
}
export interface OrderPartReadModel {
  id: string;
  serviceOrderId: string;
  status: PartRequest['status'];
  /** Omitted from the customer projection. Missing holder never proves technician readiness. */
  technicianId?: string;
  requestType?: PartRequest['requestType'];
  fulfillmentMethod?: PartRequest['fulfillmentMethod'];
  /** Present on the technician's own read; they tie a request to the quotation or additional cost it serves. */
  quotationId?: string | null;
  additionalCostId?: string | null;
  receivedAt?: string | null;
  items: (Pick<PartRequestItem, 'id' | 'partNameSnapshot' | 'quantity' | 'usageStatus'> & Partial<Pick<PartRequestItem, 'partCatalogId' | 'partSource'>>)[];
}
export interface OrderResourceData {
  evidence: EvidenceResponse[];
  quotations: OrderQuotation[];
  extras: CostRequest[];
  parts: OrderPartReadModel[];
  invoice: OrderInvoice | null;
  cash: OrderCashSettlement | null;
  history: OrderHistoryEntry[];
}
export type OrderResourceKind = keyof OrderResourceData;
export type OrderResources = { [K in OrderResourceKind]: Resource<OrderResourceData[K]> };
export interface OrderSessionSnapshot {
  key: OrderSessionKey;
  access: 'unverified' | 'current' | 'historical' | 'revoked';
  order: Resource<TechnicianOrderItem>;
  resources: OrderResources;
  /** Restored unresolved journal marker, never a successful command result. */
  pendingIntent?: boolean;
  /** Verified environment policy supplied by QA/config contract, no source default. */
  proofPolicy?: { beforeMinimum: number; afterMinimum: number };
}
export type CustomerTaskId = 'C03' | 'C04' | 'C05' | 'C06' | 'C07' | 'C08' | 'C09' | 'C10' | 'C11' | 'C12' | 'CX';
export type TechnicianTaskId = 'T02' | 'T03' | 'T05' | 'T06' | 'T07' | 'T08' | 'TR' | 'T09' | 'T11' | 'T15' | 'T16' | 'TH' | 'TX';
/** Explicit navigation branches/forms. They do not imply a new order status or automatic step. */
export type ManualOrderTaskId = 'C09a' | 'C13' | 'T02a' | 'T04' | 'T09a' | 'T10' | 'T12' | 'T13' | 'T14' | 'T15a';
export type OrderTaskId = CustomerTaskId | TechnicianTaskId | ManualOrderTaskId;
export type OrderBlocker = 'access' | 'order' | 'assignment' | 'resource' | 'proof-policy' | 'unknown-command' | 'unsupported' | 'version';
export interface OrderTaskResolution {
  taskId: CustomerTaskId | TechnicianTaskId;
  stage: 1 | 2 | 3 | 4 | null;
  readOnly: boolean;
  blockers: OrderBlocker[];
  target?: { id: string; version?: number };
  /** Multiple independent pending proposals require explicit user selection by entity/version. */
  targets?: { id: string; version?: number }[];
}
export function readyResource<T>(data: T, requestSeq: number, fetchedAt: number): Resource<T> & { status: 'ready' } {
  return { status: 'ready', data, requestSeq, fetchedAt };
}
export function createOrderSessionSnapshot(key: OrderSessionKey): OrderSessionSnapshot {
  return { key: { ...key }, access: 'unverified', order: { status: 'unloaded', requestSeq: 0 }, resources: {
    evidence: { status: 'unloaded', requestSeq: 0 }, quotations: { status: 'unloaded', requestSeq: 0 },
    extras: { status: 'unloaded', requestSeq: 0 }, parts: { status: 'unloaded', requestSeq: 0 },
    invoice: { status: 'unloaded', requestSeq: 0 }, cash: { status: 'unloaded', requestSeq: 0 },
    history: { status: 'unloaded', requestSeq: 0 },
  } };
}
export function sameOrderSession(a: OrderSessionKey | null, b: OrderSessionKey): boolean {
  return !!a && a.userId === b.userId && a.role === b.role && a.sessionGeneration === b.sessionGeneration && a.serviceOrderId === b.serviceOrderId;
}
