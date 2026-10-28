/**
 * M4 shared quotation row draft. Presentation-only: the frozen controller
 * validator (`validateQuotationPayload`) owns every DTO rule, so this module
 * never invents schemas and never coerces invalid numeric strings to 0.
 * The same row shape is reused by M5 additional-cost drafting.
 */
export type CostItemKind = 'labor' | 'parts_equipment';
/** Backend 26/10/2026: new quotations and additional costs only take FixHome catalog parts. */
export type CostItemPartSource = 'fixhome';
export type CostItemWarrantyOption = 'no_warranty' | 'paid_warranty';

export interface CostItemRow {
  key: string;
  kind: CostItemKind;
  description: string;
  quantity: string;
  unitPrice: string;
  partSource: CostItemPartSource;
  partCatalogId: string;
  partNameSnapshot: string;
  partSku: string;
  warrantyPolicy: string;
  partWarrantyOption: CostItemWarrantyOption;
  warrantyTermDays: string;
  warrantyFee: string;
  laborWarrantyDays: string;
}

export interface CostItemFieldErrors {
  description?: string;
  quantity?: string;
  unitPrice?: string;
  partCatalogId?: string;
  warrantyTermDays?: string;
  warrantyFee?: string;
  laborWarrantyDays?: string;
}

export interface CostItemCatalogOption {
  id: string;
  name: string;
  sellingPrice: number;
  warrantyDays: number | null;
  warrantyPolicy: string | null;
  sku: string | null;
}

export interface CostItemCatalogPanel {
  status: 'idle' | 'loading' | 'ready' | 'empty' | 'error';
  parts: CostItemCatalogOption[];
  error: string | null;
}

let rowSequence = 0;

export function createCostItemRow(kind: CostItemKind = 'labor'): CostItemRow {
  rowSequence += 1;
  return {
    key: `item-${Date.now().toString(36)}-${rowSequence}`,
    kind,
    description: '',
    quantity: '',
    unitPrice: '',
    partSource: 'fixhome',
    partCatalogId: '',
    partNameSnapshot: '',
    partSku: '',
    warrantyPolicy: '',
    partWarrantyOption: 'no_warranty',
    warrantyTermDays: '',
    warrantyFee: '',
    laborWarrantyDays: '',
  };
}

const DIGITS = /^\d+$/;
/** Line total for display only; null while quantity/price are not valid integers (never 0). */
export function costItemRowSubtotal(row: Pick<CostItemRow, 'quantity' | 'unitPrice'>): number | null {
  const q = row.quantity.trim();
  const p = row.unitPrice.trim();
  if (!DIGITS.test(q) || !DIGITS.test(p)) return null;
  const total = Number(q) * Number(p);
  return Number.isSafeInteger(total) ? total : null;
}

/** Required-field hints shown after a failed submit; the controller validator stays authoritative. */
export function validateCostItemRows(rows: CostItemRow[]): Record<string, CostItemFieldErrors> {
  const out: Record<string, CostItemFieldErrors> = {};
  for (const row of rows) {
    const e: CostItemFieldErrors = {};
    if (!row.description.trim()) e.description = 'Nhập mô tả hạng mục.';
    if (!DIGITS.test(row.quantity.trim()) || Number(row.quantity) < 1) e.quantity = 'Nhập số lượng từ 1 trở lên.';
    if (!DIGITS.test(row.unitPrice.trim())) e.unitPrice = 'Nhập đơn giá bằng số nguyên (đ).';
    if (row.kind === 'parts_equipment' && !row.partCatalogId) e.partCatalogId = 'Chọn một linh kiện trong danh mục FixHome.';
    if (Object.keys(e).length) out[row.key] = e;
  }
  return out;
}

/** Kind/source switches clear forbidden fields; never carried into the payload. */
export function switchCostItemKind(row: CostItemRow, kind: CostItemKind): CostItemRow {
  if (kind === 'labor') {
    return {
      ...row,
      kind,
      partSource: 'fixhome',
      partCatalogId: '',
      partNameSnapshot: '',
      partSku: '',
      warrantyPolicy: '',
      partWarrantyOption: 'no_warranty',
      warrantyTermDays: '',
      warrantyFee: '',
    };
  }
  return { ...row, kind, laborWarrantyDays: '' };
}

/**
 * Shape one row into raw validator input. Raw strings pass through untouched;
 * the controller validator rejects invalid numerics (never 0) and owns bounds.
 */
export function costItemRowToPayloadItem(row: CostItemRow): Record<string, unknown> {
  const base = { description: row.description, quantity: row.quantity, unitPrice: row.unitPrice };
  if (row.kind === 'labor') {
    return {
      type: 'labor',
      ...base,
      ...(row.laborWarrantyDays.trim() ? { warrantyDays: row.laborWarrantyDays } : {}),
    };
  }
  return {
    type: 'parts_equipment',
    ...base,
    partSource: 'fixhome',
    partCatalogId: row.partCatalogId,
    ...(row.partNameSnapshot.trim() ? { partNameSnapshot: row.partNameSnapshot.trim() } : {}),
    ...(row.partSku.trim() ? { partSku: row.partSku.trim() } : {}),
    ...(row.warrantyPolicy.trim() ? { warrantyPolicy: row.warrantyPolicy.trim() } : {}),
  };
}
