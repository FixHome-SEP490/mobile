// src/api/w3-delivery.api.ts
// Customer side of W3 part delivery (same backend routes as web w3-delivery-*.api.ts):
// - 0đ courier quote:   GET/POST /part-requests/:id/delivery          (consent)
// - paid courier quote: GET/POST /part-requests/:id/delivery/terms    (consent, 70/30 split)
// The client never computes money: every amount shown comes from the server read.
import { Platform } from 'react-native';
import apiClient from './client';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/;

export type DeliveryStatus = 'INELIGIBLE' | 'PENDING_ASSISTANCE' | 'RESERVED' | 'RELEASED'
  | 'ISSUED_TO_COURIER' | 'DISPATCH_RECORDED' | 'TECHNICIAN_RECEIVED';

export interface DeliveryQuote {
  quoteVersion: number;
  fingerprint: string;
  totalShippingFee: number;
  customerShippingShare: number;
  technicianShippingShare: number;
}

/** Normalized customer view of either the 0đ or the paid read. */
export interface CustomerDeliveryState {
  kind: 'free' | 'paid';
  version: number;
  quote: DeliveryQuote | null;
  invalidated: boolean;
  customerConsented: boolean;
  technicianConsented: boolean;
  actualShippingFee: number | null;
  actualCustomerShare: number | null;
  physicalStatus: DeliveryStatus | null;
  ceilings: { count: number; shipping: string; customer: string; technician: string } | null;
  /** Paid only: actual technician share recorded by the SM. */
  actualTechnicianShare?: number | null;
  /** Base delivery read: physical journal version and its bound warehouse (receipt evidence uses it). */
  physicalVersion?: number | null;
  physicalWarehouseId?: string | null;
}

/** Same normalized state, read by either party. */
export type DeliveryState = CustomerDeliveryState;
export type DeliveryAudience = "customer" | "technician";

export class DeliveryShapeError extends Error {
  constructor() { super('Chưa đối chiếu được thông tin giao linh kiện.'); }
}
const bad = (): never => { throw new DeliveryShapeError(); };

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : bad();
}
function int(value: unknown, min = 0): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min;
}
function data(payload: unknown): Record<string, unknown> {
  const outer = obj(payload);
  return 'success' in outer && 'data' in outer ? obj(outer.data) : outer;
}

export function parseQuote(value: unknown): DeliveryQuote | null {
  if (value === null || value === undefined) return null;
  const q = obj(value);
  if (!int(q.quoteVersion, 1) || typeof q.fingerprint !== 'string' || !SHA256.test(q.fingerprint)
    || !int(q.totalShippingFee) || !int(q.customerShippingShare) || !int(q.technicianShippingShare)
    || q.customerShippingShare + q.technicianShippingShare !== q.totalShippingFee) return bad();
  return { quoteVersion: q.quoteVersion, fingerprint: q.fingerprint, totalShippingFee: q.totalShippingFee,
    customerShippingShare: q.customerShippingShare, technicianShippingShare: q.technicianShippingShare };
}

const STATUSES: DeliveryStatus[] = ['INELIGIBLE', 'PENDING_ASSISTANCE', 'RESERVED', 'RELEASED',
  'ISSUED_TO_COURIER', 'DISPATCH_RECORDED', 'TECHNICIAN_RECEIVED'];

export function parseFreeRead(payload: unknown): CustomerDeliveryState {
  const d = data(payload);
  if (!int(d.version) || typeof d.invalidated !== 'boolean' || typeof d.customerConsented !== 'boolean'
    || typeof d.technicianConsented !== 'boolean') return bad();
  const quote = parseQuote(d.quote);
  const actual = d.actual === null || d.actual === undefined ? null : obj(d.actual);
  if (actual && !int(actual.totalShippingFee)) return bad();
  const physical = d.physical === null || d.physical === undefined ? null : obj(d.physical);
  const status = physical && STATUSES.includes(physical.status as DeliveryStatus) ? physical.status as DeliveryStatus : null;
  return { kind: 'free', version: d.version, quote, invalidated: d.invalidated,
    customerConsented: d.customerConsented, technicianConsented: d.technicianConsented,
    actualShippingFee: actual ? actual.totalShippingFee as number : null, actualCustomerShare: actual ? 0 : null,
    physicalStatus: status, ceilings: null,
    physicalVersion: physical && int(physical.version, 1) ? physical.version as number : null,
    physicalWarehouseId: physical && typeof physical.warehouseId === "string" && UUID.test(physical.warehouseId) ? physical.warehouseId : null };
}

export function parsePaidRead(payload: unknown): CustomerDeliveryState | null {
  const d = data(payload);
  if (typeof d.invalidated !== 'boolean') return bad();
  let ceilings: CustomerDeliveryState['ceilings'] = null;
  if (d.recordedConditionalCeilings !== null && d.recordedConditionalCeilings !== undefined) {
    const t = obj(d.recordedConditionalCeilings);
    const money = (v: unknown): v is string => typeof v === 'string' && /^(0|[1-9]\d*)$/.test(v);
    if (!int(t.count) || !money(t.shipping) || !money(t.customer) || !money(t.technician)) return bad();
    ceilings = { count: t.count, shipping: t.shipping, customer: t.customer, technician: t.technician };
  }
  if (d.state === null || d.state === undefined) return null;
  const s = obj(d.state);
  const quote = parseQuote(s.quote);
  if (!int(s.version, 1) || !quote || typeof s.customerConsented !== 'boolean' || typeof s.technicianConsented !== 'boolean') return bad();
  const actual = s.actual === null || s.actual === undefined ? null : obj(s.actual);
  if (actual && (!int(actual.totalShippingFee) || !int(actual.customerShippingShare))) return bad();
  return { kind: 'paid', version: s.version, quote, invalidated: d.invalidated,
    customerConsented: s.customerConsented, technicianConsented: s.technicianConsented,
    actualShippingFee: actual ? actual.totalShippingFee as number : null,
    actualCustomerShare: actual ? actual.customerShippingShare as number : null,
    actualTechnicianShare: actual && int(actual.technicianShippingShare) ? actual.technicianShippingShare as number : null,
    physicalStatus: null, ceilings };
}

/** RFC 4122 v4 id; the backend rejects anything else as commandId. */
export function newCommandId(random: () => number = Math.random): string {
  const hex = (n: number) => Array.from({ length: n }, () => Math.floor(random() * 16).toString(16)).join('');
  const variant = '89ab'[Math.floor(random() * 4)];
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${variant}${hex(3)}-${hex(12)}`;
}

/** Body of the customer consent; the share is the server's customer share, never typed by the user. */
export function consentBody(state: CustomerDeliveryState, commandId: string, audience: DeliveryAudience = "customer") {
  const mine = audience === "customer" ? state.customerConsented : state.technicianConsented;
  if (!state.quote || state.invalidated || mine || !UUID.test(commandId)) return bad();
  const share = audience === "customer" ? state.quote.customerShippingShare : state.quote.technicianShippingShare;
  return { commandId, expectedVersion: state.version, quoteVersion: state.quote.quoteVersion,
    quoteFingerprint: state.quote.fingerprint, totalShippingFee: state.quote.totalShippingFee,
    shippingShare: state.kind === 'free' ? 0 : share, accepted: true as const };
}

function path(requestId: string, kind: 'free' | 'paid') {
  if (!UUID.test(requestId)) return bad();
  return kind === 'free' ? `/part-requests/${requestId}/delivery` : `/part-requests/${requestId}/delivery/terms`;
}

export const w3DeliveryApi = {
  async readFree(requestId: string) {
    return parseFreeRead((await apiClient.get<unknown>(path(requestId, 'free'))).data);
  },
  async readPaid(requestId: string) {
    return parsePaidRead((await apiClient.get<unknown>(path(requestId, 'paid'))).data);
  },
  async consent(requestId: string, state: CustomerDeliveryState, audience: DeliveryAudience = "customer") {
    const body = consentBody(state, newCommandId(), audience);
    await apiClient.post<unknown>(`${path(requestId, state.kind)}/consent`, body);
  },
  /** Technician: reserve (0đ or paid once both consented and the actual fee is recorded) or receipt with evidence. */
  async physical(requestId: string, action: "reserve" | "receipt", body: { commandId: string; expectedVersion: number; evidenceId?: string }) {
    if (!UUID.test(body.commandId) || !int(body.expectedVersion) || (action === "receipt" && !UUID.test(body.evidenceId ?? ""))) return bad();
    await apiClient.post<unknown>(`${path(requestId, "free")}/${action}`, body);
  },
  /** TECHNICIAN_RECEIPT photo, bound to the warehouse already on the physical journal. */
  async uploadReceiptEvidence(requestId: string, input: { warehouseId: string; quoteVersion: number; image: { uri: string; name: string; type: string } }): Promise<string> {
    if (!UUID.test(input.warehouseId) || !int(input.quoteVersion, 1) || !["image/jpeg", "image/png", "image/webp"].includes(input.image.type)) return bad();
    const form = new FormData();
    if (Platform.OS === "web") {
      const blob = await (await fetch(input.image.uri)).blob();
      form.append("file", blob, input.image.name);
    } else form.append("file", input.image as unknown as Blob);
    form.append("warehouseId", input.warehouseId);
    form.append("purpose", "TECHNICIAN_RECEIPT");
    form.append("quoteVersion", String(input.quoteVersion));
    const res = await apiClient.post<unknown>(`${path(requestId, "free")}/evidence`, form, { headers: { "Content-Type": "multipart/form-data" } });
    const d = data(res.data);
    if (typeof d.evidenceId !== "string" || !UUID.test(d.evidenceId)) return bad();
    return d.evidenceId;
  },
};
