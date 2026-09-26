import {
  createQuotationCreateController,
  initialQuoteState,
  quoteCreateTarget,
  validateQuoteDraft,
  validateQuoteRows,
  QUOTE_MAX_ROWS,
  type QuotationCreateDeps,
  type QuoteState,
} from './technician-quotation-create';
import { createTechOrderDetailLoader } from './technician-order-detail';
import { writeDetailWithMirror } from '../customer/customer-order-detail';
import type { ServiceOrderItem } from '../../api/orders.api';

const ORDER_ID = '11111111-1111-4111-8111-111111111111';

const gate = (overrides: Record<string, unknown> = {}) => ({
  id: ORDER_ID,
  status: 'EN_ROUTE',
  arrivalVerified: true,
  historical: false,
  pricingMode: 'inspection_required',
  quotationStatus: null,
  ...overrides,
});

const draft = (overrides: Record<string, string> = {}) => ({
  description: 'Thay tụ nguồn',
  quantity: '1',
  unitPrice: '180000',
  note: '',
  ...overrides,
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

interface Harness {
  deps: QuotationCreateDeps;
  controller: ReturnType<typeof createQuotationCreateController>;
  setOrder: (order: ReturnType<typeof gate> | null) => void;
  setTechnicianId: (value: string | null) => void;
  setFocused: (value: boolean) => void;
  state: () => QuoteState;
}

/** Exercises the actual production controller the detail screen calls. */
function setup(): Harness {
  let order: ReturnType<typeof gate> | null = gate();
  let technicianId: string | null = 'tech-1';
  let focused = true;
  const write = jest.fn<void, [QuoteState]>();
  const deps: QuotationCreateDeps = {
    getOrder: () => order,
    getTechnicianId: () => technicianId,
    isFocused: () => focused,
    createQuotation: jest.fn().mockResolvedValue({ id: 'q-1', status: 'SENT' }),
    refreshDetail: jest.fn().mockResolvedValue(undefined),
    onAccessDenied: jest.fn(),
    notify: jest.fn(),
  };
  const controller = createQuotationCreateController(deps, write);
  return {
    deps,
    controller,
    setOrder: (value) => { order = value; },
    setTechnicianId: (value) => { technicianId = value; },
    setFocused: (value) => { focused = value; },
    state: () => write.mock.calls[write.mock.calls.length - 1][0],
  };
}

const post = (h: Harness) => h.deps.createQuotation as jest.Mock;
const notified = (h: Harness) => h.deps.notify as jest.Mock;
const refreshed = (h: Harness) => h.deps.refreshDetail as jest.Mock;
const denied = (h: Harness) => h.deps.onAccessDenied as jest.Mock;

async function confirmValid(h: Harness) {
  h.controller.setField('description', 'Thay tụ nguồn');
  h.controller.setField('quantity', '2');
  h.controller.setField('unitPrice', '180000');
  h.controller.requestConfirm();
}

it('exposes the multi-line editor surface: no approval/payment/status', () => {
  const { controller } = setup();
  expect(Object.keys(controller).sort()).toEqual(
    ['addRow', 'cancelConfirm', 'markReverified', 'removeRow', 'requestConfirm', 'reset',
      'setField', 'setNote', 'setRowField', 'setWarrantyOption', 'submit'].sort(),
  );
});

it('starts with exactly one labor row', () => {
  const h = setup();
  h.controller.requestConfirm();
  // Empty single row blocks confirm with first-row errors mirrored.
  expect(h.state().rows).toHaveLength(1);
  expect(h.state().rows[0]).toMatchObject({ kind: 'labor' });
});

it('posts nothing before an explicit confirm + submit', async () => {
  const h = setup();
  h.controller.setField('description', 'Thay tụ nguồn');
  await h.controller.submit();
  expect(post(h)).not.toHaveBeenCalled();
  h.controller.requestConfirm();
  expect(post(h)).not.toHaveBeenCalled();
});

it('confirms an honest integer total and submits the exact labor-only payload', async () => {
  const h = setup();
  await confirmValid(h);
  expect(h.state()).toMatchObject({ confirming: true, quotedTotalText: expect.stringContaining('360') });
  await h.controller.submit();
  expect(post(h)).toHaveBeenCalledTimes(1);
  expect(post(h)).toHaveBeenCalledWith(ORDER_ID, {
    items: [{ type: 'labor', description: 'Thay tụ nguồn', quantity: 2, unitPrice: 180000 }],
  });
  expect(h.state()).toMatchObject({ sent: true, busy: false, confirming: false, error: null });
  expect(notified(h).mock.calls[notified(h).mock.calls.length - 1]).toEqual(
    ['Đã gửi báo giá', 'Đã gửi báo giá, chờ khách duyệt.'],
  );
  const copy = notified(h).mock.calls.map((call) => String(call[1])).join(' ');
  expect(copy).not.toMatch(/đã thanh toán|đã duyệt|PAID|APPROVED/i);
  expect(refreshed(h)).toHaveBeenCalledTimes(1);
});

it('forwards a trimmed note within limit and omits it when blank', async () => {
  const h = setup();
  h.controller.setField('description', 'Vệ sinh dàn lạnh');
  h.controller.setField('quantity', '1');
  h.controller.setField('unitPrice', '150000');
  h.controller.setField('note', '  Bao gồm công tháo lắp.  ');
  h.controller.requestConfirm();
  await h.controller.submit();
  expect(post(h)).toHaveBeenCalledWith(ORDER_ID, {
    items: [{ type: 'labor', description: 'Vệ sinh dàn lạnh', quantity: 1, unitPrice: 150000 }],
    note: 'Bao gồm công tháo lắp.',
  });
});

it.each([
  ['fixed price mode', { pricingMode: 'fixed_price' }],
  ['missing pricing mode', { pricingMode: null }],
  ['accepted status', { status: 'ACCEPTED' }],
  ['under repair status', { status: 'UNDER_REPAIR' }],
  ['unverified arrival', { arrivalVerified: false }],
  ['historical order', { historical: true }],
  ['pending SENT quote', { quotationStatus: 'SENT' }],
  ['approved quote', { quotationStatus: 'APPROVED' }],
  ['lowercase sent quote', { quotationStatus: 'sent' }],
])('blocks create for %s without POST', async (_label, overrides) => {
  const h = setup();
  h.setOrder(gate(overrides));
  await confirmValid(h);
  expect(h.state().confirming).toBe(false);
  await h.controller.submit();
  expect(post(h)).not.toHaveBeenCalled();
  expect(notified(h).mock.calls[0][0]).toBe('Chưa thể tạo báo giá');
});

it('allows a fresh quote after a rejected one and for malformed ids never posts', async () => {
  const rejected = setup();
  rejected.setOrder(gate({ quotationStatus: 'REJECTED' }));
  await confirmValid(rejected);
  expect(rejected.state().confirming).toBe(true);

  const malformed = setup();
  malformed.setOrder(gate({ id: 'not-a-uuid' }));
  await confirmValid(malformed);
  expect(post(malformed)).not.toHaveBeenCalled();
});

it('stays silent without POST when logged out or blurred', async () => {
  const loggedOut = setup();
  loggedOut.setTechnicianId(null);
  await confirmValid(loggedOut);
  expect(post(loggedOut)).not.toHaveBeenCalled();
  expect(notified(loggedOut)).not.toHaveBeenCalled();

  const blurred = setup();
  blurred.setFocused(false);
  await confirmValid(blurred);
  expect(post(blurred)).not.toHaveBeenCalled();
  expect(notified(blurred)).not.toHaveBeenCalled();
});

it('validates boundaries without POST: blank, oversize, non-integer, out-of-range', async () => {
  const blank = setup();
  blank.controller.requestConfirm();
  expect(blank.state().confirming).toBe(false);
  expect(blank.state().fieldErrors.description).toBeTruthy();
  expect(blank.state().fieldErrors.quantity).toBeTruthy();
  expect(blank.state().fieldErrors.unitPrice).toBeTruthy();

  const over = setup();
  over.controller.setField('description', 'x'.repeat(2001));
  over.controller.setField('quantity', '1001');
  over.controller.setField('unitPrice', '1000000000');
  over.controller.setField('note', 'y'.repeat(5001));
  over.controller.requestConfirm();
  expect(over.state().confirming).toBe(false);
  expect(over.state().fieldErrors).toMatchObject({
    description: expect.any(String),
    quantity: expect.any(String),
    unitPrice: expect.any(String),
    note: expect.any(String),
  });

  for (const bad of ['1.5', '-3', 'abc', '']) {
    const h = setup();
    h.controller.setField('description', 'Việc nhỏ');
    h.controller.setField('quantity', bad);
    h.controller.setField('unitPrice', '1000');
    h.controller.requestConfirm();
    expect(h.state().confirming).toBe(false);
    expect(post(h)).not.toHaveBeenCalled();
  }
});

it('accepts zero unit price as a valid free-labor line', async () => {
  const h = setup();
  h.controller.setField('description', 'Kiểm tra miễn phí');
  h.controller.setField('quantity', '1');
  h.controller.setField('unitPrice', '0');
  h.controller.requestConfirm();
  expect(h.state().confirming).toBe(true);
  await h.controller.submit();
  expect(post(h)).toHaveBeenCalledWith(ORDER_ID, {
    items: [{ type: 'labor', description: 'Kiểm tra miễn phí', quantity: 1, unitPrice: 0 }],
  });
});

it('throttles duplicate submits to a single POST', async () => {
  const h = setup();
  const gatePromise = deferred<unknown>();
  post(h).mockReturnValueOnce(gatePromise.promise);
  await confirmValid(h);
  const first = h.controller.submit();
  const second = h.controller.submit();
  gatePromise.resolve({ id: 'q-1' });
  await Promise.all([first, second]);
  expect(post(h)).toHaveBeenCalledTimes(1);
});

it('drops a stale 201 response after logout without notify or refresh', async () => {
  const h = setup();
  const gatePromise = deferred<unknown>();
  post(h).mockReturnValueOnce(gatePromise.promise);
  await confirmValid(h);
  const attempt = h.controller.submit();
  h.setTechnicianId(null);
  gatePromise.resolve({ id: 'q-1' });
  await attempt;
  expect(notified(h)).not.toHaveBeenCalled();
  expect(refreshed(h)).not.toHaveBeenCalled();
  expect(h.state().sent).toBe(false);
});

it.each([401, 403])('purges the form on %s with re-login copy', async (status) => {
  const h = setup();
  await confirmValid(h);
  post(h).mockRejectedValue({ response: { status } });
  await h.controller.submit();
  expect(denied(h)).toHaveBeenCalledTimes(1);
  expect(h.state()).toMatchObject({
    draft: { description: '', quantity: '', unitPrice: '', note: '' },
    busy: false,
    sent: false,
  });
  expect(notified(h).mock.calls[notified(h).mock.calls.length - 1][0]).toBe('Phiên đăng nhập đã hết');
});

it.each([409, 422])('shows backend contract status on %s and reloads without locking', async (status) => {
  const h = setup();
  await confirmValid(h);
  post(h).mockRejectedValue({ response: { status } });
  await h.controller.submit();
  expect(post(h)).toHaveBeenCalledTimes(1);
  expect(h.state().error).toMatch(new RegExp(`mã ${status}`));
  expect(h.state().needsVerify).toBe(false);
  expect(refreshed(h)).toHaveBeenCalledTimes(1);
});

it.each([
  ['timeout with no status', { message: 'timeout' }],
  ['server 500', { response: { status: 500 } }],
  ['offline', new Error('Network request failed')],
])('locks on ambiguous failure %s: no repost until the detail reloads', async (_label, error) => {
  const h = setup();
  await confirmValid(h);
  post(h).mockRejectedValue(error);
  await h.controller.submit();
  expect(post(h)).toHaveBeenCalledTimes(1);
  expect(h.state().needsVerify).toBe(true);
  expect(h.state().error).toMatch(/tải lại chi tiết đơn/);
  expect(refreshed(h)).toHaveBeenCalledTimes(1);
  // Locked: confirm + submit do nothing until reverified.
  h.controller.requestConfirm();
  await h.controller.submit();
  expect(post(h)).toHaveBeenCalledTimes(1);
  h.controller.markReverified();
  expect(h.state().needsVerify).toBe(false);
});

it('reset clears the form on blur/order change', async () => {
  const h = setup();
  await confirmValid(h);
  h.controller.reset();
  expect(h.state()).toMatchObject({
    draft: { description: '', quantity: '', unitPrice: '', note: '' },
    confirming: false,
    sent: false,
    needsVerify: false,
  });
});

describe('quoteCreateTarget (production gate)', () => {
  it.each([
    [{ status: 'en_route', pricingMode: 'Inspection_Required' }, true],
    [{ status: 'ACCEPTED' }, false],
    [{ arrivalVerified: 1 }, false],
    [{ pricingMode: 'FIXED_PRICE' }, false],
    [{ historical: true }, false],
    [{ quotationStatus: 'SENT' }, false],
    [{ quotationStatus: 'APPROVED' }, false],
    [{ quotationStatus: 'REJECTED' }, true],
    [{ quotationStatus: undefined }, true],
    [null, false],
  ])('gate %s', (overrides, expected) => {
    const order = overrides === null ? null : gate(overrides as Record<string, unknown>);
    expect(quoteCreateTarget(order)).toBe(expected ? ORDER_ID : null);
  });
});

describe('validateQuoteDraft (production helper)', () => {
  it('trims and totals a valid line', () => {
    expect(validateQuoteDraft(draft({ description: '  Vệ sinh  ', quantity: '3', unitPrice: '50000' }))).toMatchObject({
      line: { description: 'Vệ sinh', quantity: 3, unitPrice: 50000, total: 150000 },
      note: null,
      errors: {},
    });
  });

  it('rejects unsafe integers and oversized text', () => {
    const { line, errors } = validateQuoteDraft(draft({ quantity: '99999999999999999999', description: 'x'.repeat(2001) }));
    expect(line).toBeNull();
    expect(errors).toMatchObject({ description: expect.any(String), quantity: expect.any(String) });
  });
});

it('shares the initial state shape', () => {
  expect(initialQuoteState).toMatchObject({
    confirming: false,
    busy: false,
    error: null,
    needsVerify: false,
    sent: false,
    quotedTotalText: null,
  });
  expect(initialQuoteState.rows).toHaveLength(1);
});

function fillRow(h: { controller: ReturnType<typeof createQuotationCreateController> }, key: string, fields: Record<string, string>) {
  for (const [field, value] of Object.entries(fields)) {
    h.controller.setRowField(key, field as 'description' | 'quantity' | 'unitPrice' | 'warrantyFee' | 'warrantyTermDays', value);
  }
}

describe('multi-line labor + technician-parts editor (P3B8)', () => {
  it('adds/removes rows with stable keys and never drops below one', () => {
    const h = setup();
    h.controller.addRow('part');
    h.controller.addRow('labor');
    const keys = h.state().rows.map((row) => row.key);
    expect(h.state().rows).toHaveLength(3);
    expect(new Set(keys).size).toBe(3);
    expect(h.state().rows[1]).toMatchObject({ kind: 'part' });
    h.controller.removeRow(keys[0]);
    h.controller.removeRow(keys[1]);
    expect(h.state().rows).toHaveLength(1);
    h.controller.removeRow(h.state().rows[0].key);
    expect(h.state().rows).toHaveLength(1);
  });

  it('caps rows at 100 without POST', async () => {
    const h = setup();
    for (let index = 0; index < QUOTE_MAX_ROWS + 5; index += 1) h.controller.addRow('labor');
    expect(h.state().rows).toHaveLength(QUOTE_MAX_ROWS);
    h.controller.requestConfirm();
    expect(h.state().confirming).toBe(false);
    await h.controller.submit();
    expect(post(h)).not.toHaveBeenCalled();
  });

  it('confirms mixed lines with cost and warranty totals separated, fee once per line', async () => {
    const h = setup();
    fillRow(h, 'row-1', { description: 'Thay tụ nguồn', quantity: '2', unitPrice: '180000' });
    h.controller.addRow('part');
    const partKey = h.state().rows[1].key;
    h.controller.setWarrantyOption(partKey, 'paid_warranty');
    fillRow(h, partKey, { description: 'Tụ 450V', quantity: '3', unitPrice: '25000', warrantyFee: '20000', warrantyTermDays: '90' });
    h.controller.addRow('part');
    const plainKey = h.state().rows[2].key;
    fillRow(h, plainKey, { description: 'Dây điện', quantity: '1', unitPrice: '50000' });
    h.controller.requestConfirm();
    expect(h.state()).toMatchObject({ confirming: true });
    // Cost 2*180000 + 3*25000 + 50000 = 485000; warranty 20000 once (not x3).
    expect(h.state().quotedCostText).toContain('485');
    expect(h.state().quotedWarrantyText).toContain('20');
    await h.controller.submit();
    expect(post(h)).toHaveBeenCalledTimes(1);
    expect(post(h)).toHaveBeenCalledWith(ORDER_ID, {
      items: [
        { type: 'labor', description: 'Thay tụ nguồn', quantity: 2, unitPrice: 180000 },
        {
          type: 'parts_equipment', description: 'Tụ 450V', quantity: 3, unitPrice: 25000,
          partSource: 'technician', partWarrantyOption: 'paid_warranty',
          warrantyFee: 20000, warrantyTermDays: 90,
        },
        {
          type: 'parts_equipment', description: 'Dây điện', quantity: 1, unitPrice: 50000,
          partSource: 'technician', partWarrantyOption: 'no_warranty',
        },
      ],
    });
    const rendered = JSON.stringify(post(h).mock.calls[0][1]);
    expect(rendered).not.toMatch(/partCatalogId|fixhome/i);
    expect(h.state()).toMatchObject({ sent: true });
  });

  it('emits P3B7-compatible paid-warranty fields for the customer decision view', async () => {
    const h = setup();
    h.controller.addRow('part');
    const partKey = h.state().rows.find((row) => row.kind === 'part')?.key ?? '';
    h.controller.setWarrantyOption(partKey, 'paid_warranty');
    fillRow(h, partKey, { description: 'Bo mạch', quantity: '1', unitPrice: '850000', warrantyFee: '90000', warrantyTermDays: '180' });
    fillRow(h, 'row-1', { description: 'Công lắp', quantity: '1', unitPrice: '100000' });
    h.controller.requestConfirm();
    await h.controller.submit();
    const part = post(h).mock.calls[0][1].items[1];
    expect(part).toMatchObject({
      type: 'parts_equipment',
      partSource: 'technician',
      partWarrantyOption: 'paid_warranty',
      warrantyFee: 90000,
      warrantyTermDays: 180,
    });
  });

  it('stops the whole POST when any single row is invalid, never dropping it', async () => {
    const h = setup();
    fillRow(h, 'row-1', { description: 'Thay tụ nguồn', quantity: '1', unitPrice: '180000' });
    h.controller.addRow('part');
    const badKey = h.state().rows[1].key;
    fillRow(h, badKey, { description: '', quantity: '1', unitPrice: '50000' });
    h.controller.requestConfirm();
    expect(h.state().confirming).toBe(false);
    expect(h.state().rowErrors[badKey]?.description).toBeTruthy();
    expect(h.state().rows).toHaveLength(2);
    await h.controller.submit();
    expect(post(h)).not.toHaveBeenCalled();
  });

  it('rejects paid warranty with zero fee or out-of-range term', async () => {
    for (const [fee, term] of [['0', '90'], ['-5', '90'], ['100', '0'], ['100', '3651'], ['100', '1.5']]) {
      const h = setup();
      h.controller.addRow('part');
      const partKey = h.state().rows.find((row) => row.kind === 'part')?.key ?? '';
      fillRow(h, partKey, { description: 'Tụ', quantity: '1', unitPrice: '1000', warrantyFee: fee, warrantyTermDays: term });
      h.controller.setWarrantyOption(partKey, 'paid_warranty');
      fillRow(h, 'row-1', { description: 'Công', quantity: '1', unitPrice: '1000' });
      h.controller.requestConfirm();
      expect(h.state().confirming).toBe(false);
      expect(post(h)).not.toHaveBeenCalled();
    }
    const ok = setup();
    ok.controller.addRow('part');
    const partKey = ok.state().rows.find((row) => row.kind === 'part')?.key ?? '';
    ok.controller.setWarrantyOption(partKey, 'paid_warranty');
    fillRow(ok, partKey, { description: 'Tụ', quantity: '1', unitPrice: '1000', warrantyFee: '1', warrantyTermDays: '3650' });
    fillRow(ok, 'row-1', { description: 'Công', quantity: '1', unitPrice: '1000' });
    ok.controller.requestConfirm();
    expect(ok.state().confirming).toBe(true);
  });

  it('switching warranty option clears fee/term inputs', () => {
    const h = setup();
    h.controller.addRow('part');
    const partKey = h.state().rows.find((row) => row.kind === 'part')?.key ?? '';
    fillRow(h, partKey, { description: 'Tụ', quantity: '1', unitPrice: '1000', warrantyFee: '5000', warrantyTermDays: '30' });
    h.controller.setWarrantyOption(partKey, 'paid_warranty');
    h.controller.setWarrantyOption(partKey, 'no_warranty');
    expect(h.state().rows.find((row) => row.key === partKey)).toMatchObject({
      warrantyOption: 'no_warranty', warrantyFee: '', warrantyTermDays: '',
    });
  });

  it('editing any row cancels confirmation', async () => {
    const h = setup();
    await confirmValid(h);
    expect(h.state().confirming).toBe(true);
    fillRow(h, 'row-1', { quantity: '3' });
    expect(h.state().confirming).toBe(false);
    expect(h.state().quotedTotalText).toBeNull();
  });

  it('keeps integer arithmetic exact at high magnitudes', async () => {
    const h = setup();
    h.controller.addRow('labor');
    h.controller.addRow('labor');
    for (const row of h.state().rows) {
      fillRow(h, row.key, { description: 'Việc lớn', quantity: '1000', unitPrice: '999999999' });
    }
    h.controller.requestConfirm();
    expect(h.state().confirming).toBe(true);
    // 3 x 1000 x 999999999 = 2999999997000 exactly.
    expect(h.state().quotedCostText).toContain('2.999.999.997.000');
    await h.controller.submit();
    expect(post(h).mock.calls[0][1].items).toHaveLength(3);
  });
});

describe('validateQuoteRows (production helper)', () => {
  it('rejects empty and oversized row sets', () => {
    expect(validateQuoteRows([], '').lines).toBeNull();
    expect(validateQuoteRows(
      Array.from({ length: QUOTE_MAX_ROWS + 1 }, (_, index) => ({
        key: `k${index}`, kind: 'labor' as const, description: 'V', quantity: '1', unitPrice: '1',
        warrantyOption: 'no_warranty' as const, warrantyFee: '', warrantyTermDays: '',
      })), '',
    ).lines).toBeNull();
  });

  it('flags an oversized note without dropping rows', () => {
    const rows = [{
      key: 'k1', kind: 'labor' as const, description: 'V', quantity: '1', unitPrice: '1',
      warrantyOption: 'no_warranty' as const, warrantyFee: '', warrantyTermDays: '',
    }];
    const result = validateQuoteRows(rows, 'n'.repeat(5001));
    expect(result.lines).toBeNull();
    expect(result.noteError).toBeTruthy();
  });
});

describe('ambiguous-retry screen path (review remediation)', () => {
  const QUOTE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const detailOrder = (overrides: Record<string, unknown> = {}) => ({
    id: ORDER_ID,
    code: 'SO-1',
    bookingId: '22222222-2222-4222-8222-222222222222',
    serviceName: 'Tap repair',
    status: 'EN_ROUTE',
    arrivalVerified: true,
    historical: false,
    pricingMode: 'inspection_required',
    beforeEvidenceCount: 2,
    quotation: null,
    ...overrides,
  });

  interface ScreenHarness {
    loader: ReturnType<typeof createTechOrderDetailLoader>;
    getOrder: jest.Mock;
    controller: ReturnType<typeof createQuotationCreateController>;
    createQuotation: jest.Mock;
    state: () => QuoteState;
    setTechId: (value: string | null) => void;
    setFocused: (value: boolean) => void;
    mirror: { current: { order: ServiceOrderItem | null; serviceOrderId: string } };
    /** Exact fixed onRefresh unlock sequence from the technician screen. */
    fixedOnRefresh: () => Promise<void>;
  }

  /** REAL tech loader (production sync mirror) + REAL controller, screen wiring. */
  function screenSetup(): ScreenHarness {
    let techId: string | null = 'tech-1';
    let focused = true;
    const listeners = new Set<() => void>();
    const getOrder = jest.fn<Promise<ServiceOrderItem>, [string]>()
      .mockResolvedValue(detailOrder() as unknown as ServiceOrderItem);
    const mirror: { current: { order: ServiceOrderItem | null; serviceOrderId: string } } = {
      current: { order: null, serviceOrderId: ORDER_ID },
    };
    const loader = createTechOrderDetailLoader(
      getOrder,
      writeDetailWithMirror(mirror, ORDER_ID, () => undefined),
      {
        getUserId: () => techId,
        subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
      },
    );
    const writes: QuoteState[] = [];
    const createQuotation = jest.fn().mockResolvedValue({ id: 'q-1' });
    const controller = createQuotationCreateController(
      {
        getOrder: () => {
          const latest = mirror.current;
          if (!latest.order || latest.order.id !== latest.serviceOrderId) return null;
          return {
            id: latest.order.id,
            status: latest.order.status,
            arrivalVerified: latest.order.arrivalVerified,
            historical: latest.order.historical,
            pricingMode: latest.order.pricingMode,
            quotationStatus: latest.order.quotation ? latest.order.quotation.status : null,
          };
        },
        getTechnicianId: () => techId,
        isFocused: () => focused,
        createQuotation,
        refreshDetail: jest.fn().mockResolvedValue(undefined),
        onAccessDenied: jest.fn(),
        notify: jest.fn(),
      },
      (state) => { writes.push(state); },
    );
    return {
      loader,
      getOrder,
      controller,
      createQuotation,
      state: () => writes[writes.length - 1],
      setTechId: (value) => { techId = value; listeners.forEach((listener) => listener()); },
      setFocused: (value) => { focused = value; },
      mirror,
      fixedOnRefresh: async () => {
        const detailFresh = await loader.refreshVerified();
        const latest = mirror.current;
        const sameSession =
          focused &&
          techId !== null &&
          !!latest.order &&
          latest.order.id === ORDER_ID &&
          latest.order.id === latest.serviceOrderId;
        if (detailFresh === true && sameSession) controller.markReverified();
      },
    };
  }

  function fillValid(controller: ReturnType<typeof createQuotationCreateController>) {
    controller.setField('description', 'Thay tụ');
    controller.setField('quantity', '1');
    controller.setField('unitPrice', '180000');
    controller.requestConfirm();
  }

  it('failed detail GET after ambiguous POST keeps the lock with zero repost', async () => {
    const s = screenSetup();
    await s.loader.focus(ORDER_ID);
    fillValid(s.controller);
    s.createQuotation.mockRejectedValueOnce({ message: 'timeout' });
    await s.controller.submit();
    expect(s.state().needsVerify).toBe(true);
    s.getOrder.mockRejectedValueOnce(new Error('offline'));
    await s.fixedOnRefresh();
    expect(s.state().needsVerify).toBe(true);
    s.controller.requestConfirm();
    await s.controller.submit();
    expect(s.createQuotation).toHaveBeenCalledTimes(1);
  });

  it('fresh GET with server SENT quote blocks a duplicate create pre-commit', async () => {
    const s = screenSetup();
    await s.loader.focus(ORDER_ID);
    fillValid(s.controller);
    s.createQuotation.mockRejectedValueOnce({ message: 'timeout' });
    await s.controller.submit();
    expect(s.state().needsVerify).toBe(true);
    // The ambiguous POST actually committed server-side: the fresh GET now
    // carries SENT. The sync mirror shows it pre-commit.
    s.getOrder.mockResolvedValueOnce(detailOrder({
      quotation: { id: QUOTE_ID, status: 'SENT', laborTotal: 180000, partsTotal: 0, items: [] },
    }) as unknown as ServiceOrderItem);
    await s.fixedOnRefresh();
    const quoted = (s.mirror.current.order as unknown as Record<string, unknown> | null)
      ?.quotation as Record<string, unknown> | undefined;
    expect(quoted?.status).toBe('SENT');
    s.controller.requestConfirm();
    await s.controller.submit();
    expect(s.createQuotation).toHaveBeenCalledTimes(1);
  });

  it('fresh GET still eligible permits a deliberate retry', async () => {
    const s = screenSetup();
    await s.loader.focus(ORDER_ID);
    fillValid(s.controller);
    s.createQuotation.mockRejectedValueOnce({ message: 'timeout' });
    await s.controller.submit();
    s.getOrder.mockResolvedValueOnce(detailOrder() as unknown as ServiceOrderItem);
    await s.fixedOnRefresh();
    expect(s.state().needsVerify).toBe(false);
    fillValid(s.controller);
    s.createQuotation.mockResolvedValue({ id: 'q-2' });
    await s.controller.submit();
    expect(s.createQuotation).toHaveBeenCalledTimes(2);
  });

  it('technician switch during the verifying GET keeps the lock silently', async () => {
    const s = screenSetup();
    await s.loader.focus(ORDER_ID);
    fillValid(s.controller);
    s.createQuotation.mockRejectedValueOnce({ message: 'timeout' });
    await s.controller.submit();
    const gate = deferred<ServiceOrderItem>();
    s.getOrder.mockReturnValueOnce(gate.promise);
    const attempt = s.fixedOnRefresh();
    s.setTechId('other-tech');
    gate.resolve(detailOrder() as unknown as ServiceOrderItem);
    await attempt;
    expect(s.state().needsVerify).toBe(true);
  });
});
