import apiClient from '../../../api/client';
import type { FixHomePart, PaginationMeta, CatalogPartsQuery } from '../../../api/parts-catalog.api';

function unwrap<T>(payload: { data: T } | T): T {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

export function parseStrictCatalogMoney(val: unknown): number | null {
  if (typeof val === 'number') {
    return Number.isSafeInteger(val) && val >= 0 ? val : null;
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!/^\d+$/.test(trimmed)) return null;
    const n = Number(trimmed);
    return Number.isSafeInteger(n) && n >= 0 ? n : null;
  }
  return null;
}

/**
 * Strict catalog reader: fails closed when data is malformed or missing,
 * never coercing a broken response to an empty array [].
 */
export async function fetchStrictCatalog(query: CatalogPartsQuery = {}): Promise<{ data: FixHomePart[]; meta: PaginationMeta }> {
  const res = await apiClient.get('/parts/catalog', { params: query });
  const raw = res.data;
  if (!raw || typeof raw !== 'object') throw new Error('Invalid catalog response');
  const list = (raw as { data: unknown }).data;
  if (!Array.isArray(list)) throw new Error('Catalog data is not a list');
  const validParts: FixHomePart[] = list.map((item: unknown) => {
    if (!item || typeof item !== 'object') throw new Error('Invalid catalog item');
    const part = item as Record<string, unknown>;
    if (typeof part.id !== 'string' || !part.id.trim()) throw new Error('Missing catalog item id');
    if (typeof part.name !== 'string' || !part.name.trim()) throw new Error('Missing catalog item name');
    const sellingPrice = parseStrictCatalogMoney(part.sellingPrice);
    if (sellingPrice === null) {
      throw new Error('Invalid catalog item sellingPrice');
    }
    return {
      id: part.id.trim(),
      sku: typeof part.sku === 'string' ? part.sku : null,
      name: part.name,
      description: typeof part.description === 'string' ? part.description : null,
      sellingPrice,
      warrantyDays: typeof part.warrantyDays === 'number' && Number.isSafeInteger(part.warrantyDays) ? part.warrantyDays : null,
      warrantyPolicy: typeof part.warrantyPolicy === 'string' ? part.warrantyPolicy : null,
      isActive: Boolean(part.isActive),
      createdAt: typeof part.createdAt === 'string' ? part.createdAt : '',
      updatedAt: typeof part.updatedAt === 'string' ? part.updatedAt : '',
    };
  });
  const metaObj = (raw as { meta?: Partial<PaginationMeta> }).meta;
  const meta: PaginationMeta = {
    page: metaObj?.page ?? 1,
    limit: metaObj?.limit ?? validParts.length,
    total: metaObj?.total ?? validParts.length,
    totalPages: metaObj?.totalPages ?? 1,
  };
  return { data: validParts, meta };
}

export async function fetchStrictPartById(id: string): Promise<FixHomePart> {
  if (typeof id !== 'string' || !id.trim()) throw new Error('Invalid part ID');
  const requestedId = id.trim();
  const res = await apiClient.get(`/parts/catalog/${requestedId}`);
  const part = unwrap(res.data) as Record<string, unknown>;
  if (!part || typeof part !== 'object' || typeof part.id !== 'string' || typeof part.name !== 'string') {
    throw new Error('Invalid catalog part detail');
  }
  if (part.id.trim() !== requestedId) {
    throw new Error('Catalog part ID mismatch');
  }
  const sellingPrice = parseStrictCatalogMoney(part.sellingPrice);
  if (sellingPrice === null) {
    throw new Error('Invalid catalog item sellingPrice');
  }
  return {
    id: part.id.trim(),
    sku: typeof part.sku === 'string' ? part.sku : null,
    name: part.name,
    description: typeof part.description === 'string' ? part.description : null,
    sellingPrice,
    warrantyDays: typeof part.warrantyDays === 'number' && Number.isSafeInteger(part.warrantyDays) ? part.warrantyDays : null,
    warrantyPolicy: typeof part.warrantyPolicy === 'string' ? part.warrantyPolicy : null,
    isActive: Boolean(part.isActive),
    createdAt: typeof part.createdAt === 'string' ? part.createdAt : '',
    updatedAt: typeof part.updatedAt === 'string' ? part.updatedAt : '',
  };
}
