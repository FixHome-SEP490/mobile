import { orderDetailTarget } from '../customer/customer-order-detail';
import type { CreateQuotationItem, CreateQuotationPayload } from '../../api/orders.api';
import type { FixHomePart } from '../../api/parts-catalog.api';

/**
 * Multi-line quotation editor: 1..100 rows of LABOR, FixHome catalog PARTS,
 * or TECHNICIAN-owned PARTS on an assigned ACTIVE EN_ROUTE detail with
 * `pricingMode='inspection_required'`, Backend `arrivalVerified===true`, and
 * no existing SENT/APPROVED quotation (no silent supersede). Technician parts
 * default to no_warranty; paid_warranty needs fee > 0 and term 1..3650 and is
 * counted ONCE per line (never x quantity). FixHome catalog parts preserve
 * official warranty and SKU info.
 */

export const QUOTE_DESCRIPTION_MAX = 2000;
export const QUOTE_QUANTITY_MIN = 1;
export const QUOTE_QUANTITY_MAX = 1000;
export const QUOTE_UNIT_PRICE_MIN = 0;
export const QUOTE_UNIT_PRICE_MAX = 999999999;
export const QUOTE_NOTE_MAX = 5000;
export const QUOTE_MAX_ROWS = 100;
export const QUOTE_WARRANTY_FEE_MIN = 1;
export const QUOTE_WARRANTY_FEE_MAX = 999999999;
export const QUOTE_WARRANTY_TERM_MIN = 1;
export const QUOTE_WARRANTY_TERM_MAX = 3650;

export type QuoteRowKind = 'labor' | 'part';
export type QuoteWarrantyOption = 'no_warranty' | 'paid_warranty';
export type QuotePartSource = 'fixhome' | 'technician' | 'external';

export interface QuoteRowDraft {
  key: string;
  kind: QuoteRowKind;
  description: string;
  quantity: string;
  unitPrice: string;
  warrantyOption: QuoteWarrantyOption;
  warrantyFee: string;
  warrantyTermDays: string;
  partSource?: QuotePartSource;
  partCatalogId?: string;
  partNameSnapshot?: string;
  partSku?: string;
  warrantyDays?: number;
  warrantyPolicy?: string;
}

export interface QuoteDraft {
  description: string;
  quantity: string;
  unitPrice: string;
  note: string;
}

export interface QuoteFieldErrors {
  description?: string;
  quantity?: string;
  unitPrice?: string;
  note?: string;
  warrantyFee?: string;
  warrantyTermDays?: string;
}

export interface QuoteOrderGate {
  id: string;
  status: unknown;
  arrivalVerified: unknown;
  historical?: unknown;
  pricingMode?: unknown;
  quotationStatus?: unknown;
}

export interface QuoteState {
  rows: QuoteRowDraft[];
  rowErrors: Record<string, QuoteFieldErrors>;
  note: string;
  noteError?: string;
  confirming: boolean;
  busy: boolean;
  error: string | null;
  /** Ambiguous POST lock: reload the detail before any retry. */
  needsVerify: boolean;
  /** Last submit returned 201 and refreshed. */
  sent: boolean;
  /** Honest validated cost (labor+parts line totals), warranty fees separate. */
  quotedCostText: string | null;
  quotedWarrantyText: string | null;
  /** Kept for the single-line labor flow: equals quotedCostText when valid. */
  quotedTotalText: string | null;
  /** Kept for the single-line labor flow. */
  draft: QuoteDraft;
  /** Kept for the single-line labor flow: first-row errors. */
  fieldErrors: QuoteFieldErrors;
}

const emptyRow = (key: string, kind: QuoteRowKind = 'labor'): QuoteRowDraft => ({
  key,
  kind,
  description: '',
  quantity: '',
  unitPrice: '',
  warrantyOption: 'no_warranty',
  warrantyFee: '',
  warrantyTermDays: '',
});

const emptyDraft = (): QuoteDraft => ({ description: '', quantity: '', unitPrice: '', note: '' });

export const initialQuoteState: QuoteState = {
  rows: [emptyRow('row-1')],
  rowErrors: {},
  note: '',
  confirming: false,
  busy: false,
  error: null,
  needsVerify: false,
  sent: false,
  quotedCostText: null,
  quotedWarrantyText: null,
  quotedTotalText: null,
  draft: emptyDraft(),
  fieldErrors: {},
};

export interface QuotationCreateDeps {
  getOrder: () => QuoteOrderGate | null;
  getTechnicianId: () => string | null;
  isFocused: () => boolean;
  createQuotation: (orderId: string, payload: CreateQuotationPayload) => Promise<unknown>;
  /** GET-only reconciliation: reload the authorized detail (incl. quote). */
  refreshDetail: () => Promise<void>;
  onAccessDenied: () => void;
  notify: (title: string, message: string) => void;
}

function statusOf(error: unknown): number | undefined {
  return (error as { response?: { status?: number } } | null)?.response?.status;
}

function parseInteger(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isSafeInteger(value) ? value : null;
}

function moneyText(value: number): string {
  return `${value.toLocaleString('vi-VN')}đ`;
}

export interface ValidQuoteLine {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

/** Backend mirror validation: one labor line, trimmed text, integer bounds. */
export function validateQuoteDraft(draft: QuoteDraft): {
  line: ValidQuoteLine | null;
  note: string | null;
  errors: QuoteFieldErrors;
} {
  const errors: QuoteFieldErrors = {};
  const description = draft.description.trim();
  if (!description) {
    errors.description = 'Vui lòng nhập mô tả công việc.';
  } else if (description.length > QUOTE_DESCRIPTION_MAX) {
    errors.description = `Mô tả tối đa ${QUOTE_DESCRIPTION_MAX} ký tự.`;
  }
  const quantity = parseInteger(draft.quantity);
  if (quantity === null || quantity < QUOTE_QUANTITY_MIN || quantity > QUOTE_QUANTITY_MAX) {
    errors.quantity = `Số lượng là số nguyên từ ${QUOTE_QUANTITY_MIN} đến ${QUOTE_QUANTITY_MAX}.`;
  }
  const unitPrice = parseInteger(draft.unitPrice);
  if (unitPrice === null || unitPrice < QUOTE_UNIT_PRICE_MIN || unitPrice > QUOTE_UNIT_PRICE_MAX) {
    errors.unitPrice = `Đơn giá là số nguyên từ ${QUOTE_UNIT_PRICE_MIN} đến ${QUOTE_UNIT_PRICE_MAX}đ.`;
  }
  const note = draft.note.trim();
  if (note.length > QUOTE_NOTE_MAX) {
    errors.note = `Ghi chú tối đa ${QUOTE_NOTE_MAX} ký tự.`;
  }
  if (Object.keys(errors).length > 0 || quantity === null || unitPrice === null) {
    return { line: null, note: null, errors };
  }
  return {
    line: { description, quantity, unitPrice, total: quantity * unitPrice },
    note: note.length > 0 ? note : null,
    errors,
  };
}

export interface ValidQuoteRow {
  kind: QuoteRowKind;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  warrantyFee: number | null;
  warrantyTermDays: number | null;
  partSource?: QuotePartSource;
  partCatalogId?: string;
  partNameSnapshot?: string;
  partSku?: string;
  warrantyDays?: number;
  warrantyPolicy?: string;
}

function validateRow(row: QuoteRowDraft): { valid: ValidQuoteRow | null; errors: QuoteFieldErrors } {
  const errors: QuoteFieldErrors = {};
  const description = row.description.trim();
  if (!description) {
    errors.description = 'Vui lòng nhập mô tả.';
  } else if (description.length > QUOTE_DESCRIPTION_MAX) {
    errors.description = `Mô tả tối đa ${QUOTE_DESCRIPTION_MAX} ký tự.`;
  }
  const quantity = parseInteger(row.quantity);
  if (quantity === null || quantity < QUOTE_QUANTITY_MIN || quantity > QUOTE_QUANTITY_MAX) {
    errors.quantity = `Số lượng là số nguyên từ ${QUOTE_QUANTITY_MIN} đến ${QUOTE_QUANTITY_MAX}.`;
  }
  const unitPrice = parseInteger(row.unitPrice);
  if (unitPrice === null || unitPrice < QUOTE_UNIT_PRICE_MIN || unitPrice > QUOTE_UNIT_PRICE_MAX) {
    errors.unitPrice = `Đơn giá là số nguyên từ ${QUOTE_UNIT_PRICE_MIN} đến ${QUOTE_UNIT_PRICE_MAX}đ.`;
  }
  let warrantyFee: number | null = null;
  let warrantyTermDays: number | null = null;
  if (row.kind === 'part' && row.warrantyOption === 'paid_warranty') {
    const fee = parseInteger(row.warrantyFee);
    if (fee === null || fee < QUOTE_WARRANTY_FEE_MIN || fee > QUOTE_WARRANTY_FEE_MAX) {
      errors.warrantyFee = `Phí bảo hành là số nguyên từ ${QUOTE_WARRANTY_FEE_MIN} đến ${QUOTE_WARRANTY_FEE_MAX}đ.`;
    } else {
      warrantyFee = fee;
    }
    const term = parseInteger(row.warrantyTermDays);
    if (term === null || term < QUOTE_WARRANTY_TERM_MIN || term > QUOTE_WARRANTY_TERM_MAX) {
      errors.warrantyTermDays = `Thời hạn bảo hành là số nguyên từ ${QUOTE_WARRANTY_TERM_MIN} đến ${QUOTE_WARRANTY_TERM_MAX} ngày.`;
    } else {
      warrantyTermDays = term;
    }
  }
  if (Object.keys(errors).length > 0 || quantity === null || unitPrice === null) {
    return { valid: null, errors };
  }
  return {
    valid: {
      kind: row.kind,
      description,
      quantity,
      unitPrice,
      lineTotal: quantity * unitPrice,
      warrantyFee,
      warrantyTermDays,
      partSource: row.partSource,
      partCatalogId: row.partCatalogId,
      partNameSnapshot: row.partNameSnapshot,
      partSku: row.partSku,
      warrantyDays: row.warrantyDays,
      warrantyPolicy: row.warrantyPolicy,
    },
    errors,
  };
}

/** Backend mirror validation for 1..100 rows: every row must validate, none dropped. */
export function validateQuoteRows(
  rows: QuoteRowDraft[],
  noteText: string,
): {
  lines: ValidQuoteRow[] | null;
  note: string | null;
  rowErrors: Record<string, QuoteFieldErrors>;
  noteError?: string;
  costTotal: number;
  warrantyTotal: number;
} {
  const rowErrors: Record<string, QuoteFieldErrors> = {};
  const lines: ValidQuoteRow[] = [];
  let failed = rows.length < 1 || rows.length > QUOTE_MAX_ROWS;
  for (const row of rows) {
    const { valid, errors } = validateRow(row);
    if (!valid) {
      failed = true;
      rowErrors[row.key] = errors;
    } else {
      lines.push(valid);
    }
  }
  const note = noteText.trim();
  let noteError: string | undefined;
  if (note.length > QUOTE_NOTE_MAX) {
    noteError = `Ghi chú tối đa ${QUOTE_NOTE_MAX} ký tự.`;
    failed = true;
  }
  if (failed) {
    return { lines: null, note: null, rowErrors, noteError, costTotal: 0, warrantyTotal: 0 };
  }
  // Worst case 100 x 1000 x 999999999 < 2^53: exact integer arithmetic.
  const costTotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  // Paid fee counted ONCE per eligible line, never multiplied by quantity.
  const warrantyTotal = lines.reduce((sum, line) => sum + (line.warrantyFee ?? 0), 0);
  return { lines, note: note.length > 0 ? note : null, rowErrors, noteError, costTotal, warrantyTotal };
}

function toPayloadItem(line: ValidQuoteRow): CreateQuotationItem {
  if (line.kind === 'labor') {
    return { type: 'labor', description: line.description, quantity: line.quantity, unitPrice: line.unitPrice };
  }
  if (line.partSource === 'fixhome' && line.partCatalogId) {
    return {
      type: 'parts_equipment',
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      partSource: 'fixhome',
      partCatalogId: line.partCatalogId,
      partNameSnapshot: line.partNameSnapshot || line.description,
      partSku: line.partSku,
      warrantyDays: line.warrantyDays,
      warrantyPolicy: line.warrantyPolicy,
    };
  }
  if (line.warrantyFee !== null && line.warrantyTermDays !== null) {
    return {
      type: 'parts_equipment',
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      partSource: 'technician',
      partWarrantyOption: 'paid_warranty',
      warrantyFee: line.warrantyFee,
      warrantyTermDays: line.warrantyTermDays,
    };
  }
  return {
    type: 'parts_equipment',
    description: line.description,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    partSource: 'technician',
    partWarrantyOption: 'no_warranty',
  };
}

/** Create gate: inspection-required EN_ROUTE arrival-verified detail, no live SENT/APPROVED quote. */
export function quoteCreateTarget(order: QuoteOrderGate | null): string | null {
  if (!order || order.historical === true) return null;
  const target = orderDetailTarget(order.id);
  if (!target) return null;
  if (String(order.status).toUpperCase() !== 'EN_ROUTE') return null;
  if (order.arrivalVerified !== true) return null;
  if (String(order.pricingMode ?? '').toLowerCase() !== 'inspection_required') return null;
  const quoteStatus = order.quotationStatus == null ? '' : String(order.quotationStatus).toUpperCase();
  if (quoteStatus === 'SENT' || quoteStatus === 'APPROVED') return null;
  return target;
}

export function createQuotationCreateController(
  deps: QuotationCreateDeps,
  write: (state: QuoteState) => void,
) {
  let state: QuoteState = {
    ...initialQuoteState,
    rows: [emptyRow('row-1')],
    rowErrors: {},
    draft: emptyDraft(),
    fieldErrors: {},
  };
  let busy = false;
  let keySequence = 1;

  const publish = (patch: Partial<QuoteState>) => {
    state = { ...state, ...patch };
    write(state);
  };

  /** First-row mirror for the single-line labor flow. */
  const syncLegacyDraft = (extra: Partial<QuoteState> = {}) => {
    const rowErrors = (extra.rowErrors ?? state.rowErrors) as Record<string, QuoteFieldErrors>;
    const noteError = (extra.noteError ?? state.noteError) as string | undefined;
    const first = state.rows[0];
    const draft: QuoteDraft = first && first.kind === 'labor'
      ? { description: first.description, quantity: first.quantity, unitPrice: first.unitPrice, note: state.note }
      : emptyDraft();
    const fieldErrors: QuoteFieldErrors = { ...(first ? rowErrors[first.key] ?? {} : {}) };
    if (noteError) fieldErrors.note = noteError;
    publish({ draft, fieldErrors, ...extra });
  };

  function reset() {
    busy = false;
    keySequence = 1;
    state = {
      ...initialQuoteState,
      rows: [emptyRow('row-1')],
      rowErrors: {},
      draft: emptyDraft(),
      fieldErrors: {},
    };
    write(state);
  }

  function touch() {
    syncLegacyDraft({
      confirming: false,
      quotedCostText: null,
      quotedWarrantyText: null,
      quotedTotalText: null,
      sent: false,
    });
  }

  function setField(field: keyof QuoteDraft, value: string) {
    if (field === 'note') {
      publish({ note: value, noteError: undefined });
      touch();
      return;
    }
    const first = state.rows[0];
    if (!first) return;
    const rows = state.rows.map((row) => (row.key === first.key ? { ...row, [field]: value } : row));
    const rowErrors = { ...state.rowErrors };
    if (rowErrors[first.key]) {
      const { [field]: _dropped, ...rest } = rowErrors[first.key];
      void _dropped;
      if (Object.keys(rest).length > 0) rowErrors[first.key] = rest;
      else delete rowErrors[first.key];
    }
    state = { ...state, rows, rowErrors };
    touch();
  }

  function addRow(kind: QuoteRowKind): void {
    if (busy || state.needsVerify) return;
    if (state.rows.length >= QUOTE_MAX_ROWS) return;
    keySequence += 1;
    publish({ rows: [...state.rows, emptyRow(`row-${keySequence}`, kind)] });
    touch();
  }

  function addFixHomePart(part: FixHomePart, quantity = 1): void {
    if (busy || state.needsVerify) return;
    if (state.rows.length >= QUOTE_MAX_ROWS) return;
    keySequence += 1;
    const key = `row-${keySequence}`;
    const newRow: QuoteRowDraft = {
      key,
      kind: 'part',
      description: part.name,
      quantity: String(quantity),
      unitPrice: String(part.sellingPrice),
      warrantyOption: 'no_warranty',
      warrantyFee: '',
      warrantyTermDays: '',
      partSource: 'fixhome',
      partCatalogId: part.id,
      partNameSnapshot: part.name,
      partSku: part.sku ?? undefined,
      warrantyDays: part.warrantyDays ?? undefined,
      warrantyPolicy: part.warrantyPolicy ?? undefined,
    };
    const isSingleEmpty =
      state.rows.length === 1 &&
      !state.rows[0].description.trim() &&
      !state.rows[0].unitPrice.trim();
    const rows = isSingleEmpty ? [newRow] : [...state.rows, newRow];
    publish({ rows });
    touch();
  }

  function removeRow(key: string): void {
    if (busy || state.needsVerify) return;
    if (state.rows.length <= 1) return;
    const rowErrors = { ...state.rowErrors };
    delete rowErrors[key];
    publish({ rows: state.rows.filter((row) => row.key !== key), rowErrors });
    touch();
  }

  function setRowField(key: string, field: 'description' | 'quantity' | 'unitPrice' | 'warrantyFee' | 'warrantyTermDays', value: string): void {
    if (busy || state.needsVerify) return;
    const rows = state.rows.map((row) => (row.key === key ? { ...row, [field]: value } : row));
    const rowErrors = { ...state.rowErrors };
    if (rowErrors[key]) {
      const { [field]: _dropped, ...rest } = rowErrors[key];
      void _dropped;
      if (Object.keys(rest).length > 0) rowErrors[key] = rest;
      else delete rowErrors[key];
    }
    state = { ...state, rows, rowErrors };
    touch();
  }

  function setWarrantyOption(key: string, option: QuoteWarrantyOption): void {
    if (busy || state.needsVerify) return;
    const rows = state.rows.map((row) => (row.key === key && row.kind === 'part'
      ? { ...row, warrantyOption: option, warrantyFee: '', warrantyTermDays: '' }
      : row));
    const rowErrors = { ...state.rowErrors };
    delete rowErrors[key];
    state = { ...state, rows, rowErrors };
    touch();
  }

  function setNote(value: string): void {
    if (busy || state.needsVerify) return;
    publish({ note: value, noteError: undefined });
    touch();
  }

  function requestConfirm(): void {
    if (busy || state.needsVerify) return;
    if (!deps.getTechnicianId() || !deps.isFocused()) return;
    const target = quoteCreateTarget(deps.getOrder());
    if (!target) {
      deps.notify('Chưa thể tạo báo giá', 'Đơn chưa đủ điều kiện tạo báo giá (cần EN_ROUTE, đã check-in hợp lệ, báo giá theo khảo sát).');
      return;
    }
    const validated = validateQuoteRows(state.rows, state.note);
    if (!validated.lines) {
      syncLegacyDraft({ rowErrors: validated.rowErrors, noteError: validated.noteError, confirming: false,
        quotedCostText: null, quotedWarrantyText: null, quotedTotalText: null });
      return;
    }
    syncLegacyDraft({
      rowErrors: {},
      noteError: undefined,
      confirming: true,
      quotedCostText: moneyText(validated.costTotal),
      quotedWarrantyText: moneyText(validated.warrantyTotal),
      quotedTotalText: moneyText(validated.costTotal),
      error: null,
    });
  }

  function cancelConfirm(): void {
    if (busy) return;
    publish({ confirming: false, quotedCostText: null, quotedWarrantyText: null, quotedTotalText: null });
  }

  async function submit(): Promise<void> {
    if (busy || !state.confirming || state.needsVerify) return;
    const technicianId = deps.getTechnicianId();
    if (!technicianId || !deps.isFocused()) return;
    const target = quoteCreateTarget(deps.getOrder());
    if (!target || deps.getOrder()?.id !== target) {
      deps.notify('Chưa thể tạo báo giá', 'Đơn chưa đủ điều kiện tạo báo giá (cần EN_ROUTE, đã check-in hợp lệ, báo giá theo khảo sát).');
      return;
    }
    const validated = validateQuoteRows(state.rows, state.note);
    if (!validated.lines) {
      syncLegacyDraft({ rowErrors: validated.rowErrors, noteError: validated.noteError, confirming: false,
        quotedCostText: null, quotedWarrantyText: null, quotedTotalText: null });
      return;
    }
    busy = true;
    publish({ busy: true, error: null });
    const sameSession = () =>
      deps.getTechnicianId() === technicianId &&
      deps.isFocused() &&
      deps.getOrder()?.id === target &&
      quoteCreateTarget(deps.getOrder()) === target;
    try {
      const payload: CreateQuotationPayload = {
        items: validated.lines.map(toPayloadItem),
        ...(validated.note !== null ? { note: validated.note } : {}),
      };
      await deps.createQuotation(target, payload);
      if (!sameSession()) {
        reset();
        return;
      }
      keySequence = 1;
      state = {
        ...initialQuoteState,
        rows: [emptyRow('row-1')],
        rowErrors: {},
        draft: emptyDraft(),
        fieldErrors: {},
        sent: true,
      };
      write(state);
      deps.notify('Đã gửi báo giá', 'Đã gửi báo giá, chờ khách duyệt.');
      await deps.refreshDetail();
    } catch (error) {
      if (!sameSession()) {
        reset();
        return;
      }
      const status = statusOf(error);
      if (status === 401 || status === 403) {
        reset();
        deps.onAccessDenied();
        deps.notify('Phiên đăng nhập đã hết', 'Vui lòng đăng nhập lại để tiếp tục tạo báo giá.');
        return;
      }
      if (status === 409 || status === 422) {
        publish({
          busy: false,
          confirming: false,
          quotedCostText: null,
          quotedWarrantyText: null,
          quotedTotalText: null,
          error: `Máy chủ từ chối báo giá (mã ${status}). Vui lòng tải lại chi tiết đơn và kiểm tra báo giá hiện có.`,
        });
        await deps.refreshDetail();
        return;
      }
      // Ambiguous POST (timeout/offline/5xx/lost response): the quotation may
      // exist server-side — never auto-repost. Lock until the detail reloads.
      publish({
        busy: false,
        confirming: false,
        quotedCostText: null,
        quotedWarrantyText: null,
        quotedTotalText: null,
        needsVerify: true,
        error: 'Chưa xác nhận báo giá đã được tạo hay chưa. Hãy tải lại chi tiết đơn để kiểm tra trước khi thử lại.',
      });
      await deps.refreshDetail();
    } finally {
      busy = false;
      if (state.busy) publish({ busy: false });
    }
  }

  return {
    setField,
    addRow,
    addFixHomePart,
    removeRow,
    setRowField,
    setWarrantyOption,
    setNote,
    requestConfirm,
    cancelConfirm,
    submit,
    reset,
    /** Called by the screen after its own detail reload clears the lock. */
    markReverified: () => {
      if (!state.needsVerify) return;
      publish({ needsVerify: false, error: null });
    },
  };
}
