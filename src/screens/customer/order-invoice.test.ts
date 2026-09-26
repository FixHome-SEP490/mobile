import {
  createOrderInvoiceController,
  initialInvoiceState,
  invoicePaymentLabel,
  sanitizeInvoice,
  type InvoiceState,
} from './order-invoice';

const ORDER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '33333333-3333-4333-8333-333333333333';

const payload = (overrides: Record<string, unknown> = {}) => ({
  id: 'inv-1',
  serviceOrderId: ORDER_ID,
  laborTotal: 100000,
  partsTotal: 50000,
  grandTotal: 150000,
  paymentStatus: 'UNPAID',
  issuedAt: '2030-10-21T12:00:00Z',
  paidAt: null,
  items: [
    { id: 'li-1', type: 'LABOR', description: 'Thay tụ', quantity: 1, unitPrice: 100000, lineTotal: 100000 },
    { id: 'li-2', type: 'PARTS', description: 'Tụ 450V', quantity: 2, unitPrice: 25000, lineTotal: 50000 },
  ],
  commissionBase: 100000,
  commissionRateSnapshot: 0.2,
  commissionAmount: 20000,
  ...overrides,
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

/** Exercises the actual production controller both detail screens call. */
function setup(response: unknown = payload()) {
  const getInvoice = jest.fn<Promise<unknown>, [string]>().mockResolvedValue(response);
  const write = jest.fn<void, [InvoiceState]>();
  const controller = createOrderInvoiceController(getInvoice, write);
  let readable = true;
  const isReadable = () => readable;
  const setReadable = (value: boolean) => { readable = value; };
  const state = () => write.mock.calls[write.mock.calls.length - 1][0];
  return { getInvoice, write, controller, isReadable, setReadable, state };
}

it('exposes a strictly read-only surface: no pay/mutate affordance', () => {
  const { controller } = setup();
  expect(Object.keys(controller).sort()).toEqual(
    ['blurInvoice', 'focusInvoice', 'refreshInvoice'].sort(),
  );
});

it('fetches once per authorized focus and renders server-derived totals/status/items', async () => {
  const { getInvoice, controller, isReadable, state } = setup();
  await controller.focusInvoice(ORDER_ID, isReadable);
  expect(getInvoice).toHaveBeenCalledTimes(1);
  expect(getInvoice).toHaveBeenCalledWith(ORDER_ID);
  expect(state()).toMatchObject({ loading: false, error: null, canRetry: false, absent: false });
  expect(state().invoice).toMatchObject({
    id: 'inv-1',
    paymentStatus: 'UNPAID',
    laborText: expect.stringContaining('100'),
    partsText: expect.stringContaining('50'),
    totalText: expect.stringContaining('150'),
    issuedText: expect.any(String),
    paidText: null,
  });
  expect(state().invoice?.items).toMatchObject([
    { id: 'li-1', description: 'Thay tụ', quantity: 1 },
    { id: 'li-2', description: 'Tụ 450V', quantity: 2 },
  ]);
  expect(invoicePaymentLabel('UNPAID')).toBe('Chưa thanh toán');
  expect(invoicePaymentLabel('PAID')).toBe('Đã thanh toán');
  expect(invoicePaymentLabel('REFUNDED')).toBe('Đã hoàn tiền');
  expect(invoicePaymentLabel('UNKNOWN')).toBe('Không rõ');
});

it('never exposes commission, provider, or raw finance internals in state', async () => {
  const { controller, isReadable, state } = setup();
  await controller.focusInvoice(ORDER_ID, isReadable);
  const rendered = JSON.stringify(state());
  expect(rendered).not.toMatch(/commission|commissionAmount|commissionBase|commissionRateSnapshot/i);
  expect(state().invoice).not.toHaveProperty('commissionAmount');
});

it('treats server null as truthful absent without fake paid status', async () => {
  const { controller, isReadable, state } = setup(null);
  await controller.focusInvoice(ORDER_ID, isReadable);
  expect(state()).toMatchObject({ invoice: null, absent: true, loading: false, error: null, canRetry: false });
});

it('treats 404 as safe absent without error', async () => {
  const { getInvoice, controller, isReadable, state } = setup();
  getInvoice.mockRejectedValueOnce({ response: { status: 404 } });
  await controller.focusInvoice(ORDER_ID, isReadable);
  expect(state()).toMatchObject({ invoice: null, absent: true, error: null, canRetry: false });
});

it('ignores malformed item rows while keeping valid lines', async () => {
  const { controller, isReadable, state } = setup(payload({
    items: [
      { id: 'li-1', description: 'Thay tụ', quantity: 1, lineTotal: 100000 },
      { id: '  ', description: 'blank id', quantity: 1, lineTotal: 1 },
      { id: 'li-x', description: '   ', quantity: 1, lineTotal: 1 },
      { id: 'li-y', description: 'zero qty', quantity: 0, lineTotal: 0 },
      { id: 'li-z', description: 'NaN total', quantity: 1, lineTotal: NaN },
      'not-an-object',
    ],
  }));
  await controller.focusInvoice(ORDER_ID, isReadable);
  expect(state().invoice?.items.map((item) => item.id)).toEqual(['li-1', 'li-z']);
  expect(state().invoice?.items.find((item) => item.id === 'li-z')?.lineTotalText).toBeNull();
});

it('uses unknown fallback for negative/NaN totals and unknown status instead of valid money', async () => {
  const { controller, isReadable, state } = setup(payload({
    laborTotal: -5,
    partsTotal: NaN,
    grandTotal: '150000',
    paymentStatus: 'PARTIAL',
  }));
  await controller.focusInvoice(ORDER_ID, isReadable);
  expect(state().invoice).toMatchObject({
    laborText: null,
    partsText: null,
    totalText: null,
    paymentStatus: 'UNKNOWN',
  });
  const rendered = JSON.stringify(state());
  expect(rendered).not.toMatch(/-5/);
});

it('never renders a payload for another order', async () => {
  const { controller, isReadable, state } = setup(payload({ serviceOrderId: OTHER_ID }));
  await controller.focusInvoice(ORDER_ID, isReadable);
  expect(state().invoice).toBeNull();
  expect(state().absent).toBe(true);
});

it('never GETs for an unauthorized, denied, or historical-gated focus', async () => {
  const { getInvoice, write, controller } = setup();
  await controller.focusInvoice(ORDER_ID, () => false);
  expect(getInvoice).not.toHaveBeenCalled();
  expect(write).not.toHaveBeenCalled();
  await controller.refreshInvoice(() => false);
  expect(getInvoice).not.toHaveBeenCalled();
});

it('avoids focus double-load yet refetches on refocus after blur', async () => {
  const { getInvoice, controller, isReadable, state } = setup();
  const first = controller.focusInvoice(ORDER_ID, isReadable);
  const second = controller.focusInvoice(ORDER_ID, isReadable);
  await Promise.all([first, second]);
  expect(getInvoice).toHaveBeenCalledTimes(1);
  await controller.focusInvoice(ORDER_ID, isReadable);
  expect(getInvoice).toHaveBeenCalledTimes(1);
  getInvoice.mockResolvedValueOnce(payload({ id: 'inv-2' }));
  controller.blurInvoice();
  await controller.focusInvoice(ORDER_ID, isReadable);
  expect(getInvoice).toHaveBeenCalledTimes(2);
  expect(state().invoice?.id).toBe('inv-2');
});

it('drops a stale GET that resolves after blur so old-account invoices never return', async () => {
  const { getInvoice, write, controller, isReadable } = setup();
  const pending = deferred<unknown>();
  getInvoice.mockReturnValueOnce(pending.promise);
  const first = controller.focusInvoice(ORDER_ID, isReadable);
  controller.blurInvoice();
  write.mockClear();
  pending.resolve(payload());
  await first;
  expect(write).not.toHaveBeenCalled();
  await controller.focusInvoice(ORDER_ID, isReadable);
  expect(getInvoice).toHaveBeenCalledTimes(2);
  const last = write.mock.calls[write.mock.calls.length - 1][0];
  expect(last.invoice?.id).toBe('inv-1');
});

it('purges when the gate flips mid-flight instead of rendering', async () => {
  const { getInvoice, write, controller, isReadable, setReadable } = setup();
  const pending = deferred<unknown>();
  getInvoice.mockReturnValueOnce(pending.promise);
  const request = controller.focusInvoice(ORDER_ID, isReadable);
  setReadable(false);
  pending.resolve(payload());
  await request;
  const last = write.mock.calls[write.mock.calls.length - 1][0];
  expect(last.invoice).toBeNull();
});

it.each([401, 403])('purges invoice on denial %s with retry disabled until new focus', async (status) => {
  const { getInvoice, controller, isReadable, state } = setup();
  await controller.focusInvoice(ORDER_ID, isReadable);
  expect(state().invoice?.id).toBe('inv-1');
  getInvoice.mockRejectedValueOnce({ response: { status } });
  await controller.refreshInvoice(isReadable);
  expect(state()).toMatchObject({ invoice: null, absent: false, loading: false, canRetry: false });
  expect(state().error).toContain('quyền');
  const rendered = JSON.stringify(state());
  expect(rendered).not.toMatch(/inv-1|Thay tụ/);
});

it('distinguishes 503 with a real retry that recovers', async () => {
  const { getInvoice, controller, isReadable, state } = setup();
  getInvoice.mockRejectedValueOnce({ response: { status: 503 } });
  await controller.focusInvoice(ORDER_ID, isReadable);
  expect(state()).toMatchObject({ invoice: null, loading: false, canRetry: true });
  expect(state().error).toContain('không khả dụng');
  getInvoice.mockResolvedValueOnce(payload({ id: 'inv-retry' }));
  await controller.refreshInvoice(isReadable);
  expect(getInvoice).toHaveBeenCalledTimes(2);
  expect(state()).toMatchObject({ error: null, canRetry: false, absent: false });
  expect(state().invoice?.id).toBe('inv-retry');
});

it('keeps last-good invoice on transient failure and recovers on manual retry', async () => {
  const { getInvoice, controller, isReadable, state } = setup();
  await controller.focusInvoice(ORDER_ID, isReadable);
  getInvoice.mockRejectedValueOnce(new Error('offline'));
  await controller.refreshInvoice(isReadable);
  expect(state().invoice?.id).toBe('inv-1');
  expect(state().error).toBeTruthy();
  expect(state().canRetry).toBe(true);
  getInvoice.mockResolvedValueOnce(payload({ id: 'inv-new' }));
  await controller.refreshInvoice(isReadable);
  expect(state()).toMatchObject({ error: null });
  expect(state().invoice?.id).toBe('inv-new');
});

it('blur purges invoice so nothing persists beyond the focused screen', async () => {
  const { controller, isReadable, state } = setup();
  await controller.focusInvoice(ORDER_ID, isReadable);
  expect(JSON.stringify(state())).toMatch(/inv-1/);
  controller.blurInvoice();
  expect(state()).toMatchObject({ invoice: null, absent: false, loading: false, error: null, canRetry: false });
  expect(JSON.stringify(state())).not.toMatch(/inv-1/);
});

describe('sanitizeInvoice (production helper)', () => {
  it.each([[null], [undefined], ['invoice'], [42]])(
    'returns null for absent payload %s',
    (response) => {
      expect(sanitizeInvoice(ORDER_ID, response)).toBeNull();
    },
  );

  it('returns null for blank id or mismatched order without rendering', () => {
    expect(sanitizeInvoice(ORDER_ID, payload({ id: '  ' }))).toBeNull();
    expect(sanitizeInvoice(ORDER_ID, payload({ serviceOrderId: OTHER_ID }))).toBeNull();
  });

  it('keeps only allowlisted display fields', () => {
    const view = sanitizeInvoice(ORDER_ID, payload());
    expect(view).not.toBeNull();
    expect(Object.keys(view ?? {}).sort()).toEqual(
      ['id', 'issuedText', 'items', 'laborText', 'paidText', 'partsText', 'paymentStatus', 'totalText'].sort(),
    );
  });
});

it('shares the initial state shape', () => {
  expect(initialInvoiceState).toMatchObject({ invoice: null, absent: false, loading: false, error: null, canRetry: false });
});
