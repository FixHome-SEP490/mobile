// src/api/parts-sourcing.api.ts
// F3 (CUSTOMER 72, TECHNICIAN 66), same as web utils/parts-sourcing.ts: whether the FixHome parts of a
// quote waiting for the customer can be supplied by a warehouse. The approval re-checks on the server and
// refuses with 409 PARTS_SOURCE_UNAVAILABLE (nothing is kept), so this read is only what the screens show.
import apiClient from './client';

export type PartsSourcingStatus = 'none' | 'covered' | 'available' | 'unavailable';
export interface MissingPart { partCatalogId: string; name: string; quantity: number }
export interface PartsSourcing { quotationId: string; quotationStatus: string; status: PartsSourcingStatus; missing: MissingPart[] }

type QuoteLike = { id?: string | null; status?: string | null; items?: { type?: string | null; partSource?: string | null }[] | null } | null | undefined;

/** Only a quote still waiting for the customer with a FixHome part is worth asking about. */
export function needsSourcingCheck(quote: QuoteLike): boolean {
  if (!quote?.id || String(quote.status ?? '').toUpperCase() !== 'SENT') return false;
  return (quote.items ?? []).some(item => String(item.type ?? '').toUpperCase() !== 'LABOR' && item.partSource === 'fixhome');
}

/** The approval was refused because no warehouse holds the parts (HTTP 409, code PARTS_SOURCE_UNAVAILABLE). */
export function isPartsSourceUnavailable(error: unknown): boolean {
  const response = (error as { response?: { status?: number; data?: { error?: { code?: unknown }; code?: unknown } } } | null)?.response;
  return response?.status === 409 && (response.data?.error?.code ?? response.data?.code) === 'PARTS_SOURCE_UNAVAILABLE';
}

export function readPartsSourcing(raw: unknown): PartsSourcing | null {
  const outer = raw as { data?: unknown } | null;
  const value = (outer && typeof outer === 'object' && 'data' in outer && outer.data && typeof outer.data === 'object' ? outer.data : raw) as Partial<PartsSourcing> | null;
  if (!value || typeof value !== 'object' || !['none', 'covered', 'available', 'unavailable'].includes(String(value.status))) return null;
  const missing = Array.isArray(value.missing) ? value.missing.filter(item => item && typeof item.name === 'string')
    .map(item => ({ partCatalogId: String(item.partCatalogId), name: item.name, quantity: Number(item.quantity) || 0 })) : [];
  return { quotationId: String(value.quotationId ?? ''), quotationStatus: String(value.quotationStatus ?? ''),
    status: value.status as PartsSourcingStatus, missing };
}

/** "Tụ quạt × 2, Bo mạch × 1" for the note. */
export function missingPartsText(missing: MissingPart[]): string {
  return missing.map(item => `${item.name} × ${item.quantity}`).join(', ');
}

export const partsSourcingApi = {
  async get(quotationId: string): Promise<PartsSourcing | null> {
    return readPartsSourcing((await apiClient.get<unknown>(`/quotations/${quotationId}/parts-sourcing`)).data);
  },
};

/** The technician may replace a SENT quote only after choosing to, and only while its parts have no source. */
export function canReviseUnsourcedQuote(chosen: boolean, sourcing: PartsSourcing | null): boolean {
  return chosen && sourcing?.status === 'unavailable';
}
