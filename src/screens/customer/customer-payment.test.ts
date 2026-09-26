import type { InvoiceView } from './order-invoice';
import {
  createCustomerPaymentController,
  customerPaymentTarget,
  sanitizeCashSettlement,
  type CustomerPaymentDeps,
  type CustomerPaymentState,
} from './customer-payment';

const ORDER_ID = '11111111-1111-4111-8111-111111111111';
const invoice: InvoiceView = {
  id: 'invoice-1',
  paymentStatus: 'UNPAID',
  laborText: '100.000',
  partsText: '0',
  totalText: '100.000',
  issuedText: null,
  paidText: null,
  items: [],
};
const order = (overrides: Record<string, unknown> = {}) => ({
  id: ORDER_ID,
  status: 'UNDER_REPAIR',
  paymentStatus: 'UNPAID',
  customerConfirmed: true,
  historical: false,
  ...overrides,
});

function setup() {
  let currentOrder: ReturnType<typeof order> | null = order();
  let currentInvoice: InvoiceView | null = invoice;
  let customerId: string | null = 'customer-a';
  const write = jest.fn<void, [CustomerPaymentState]>();
  const deps: CustomerPaymentDeps = {
    getOrder: () => currentOrder,
    getInvoice: () => currentInvoice,
    getCustomerId: () => customerId,
    isFocused: () => true,
    getCashSettlement: jest.fn().mockResolvedValue(null),
    confirmCashSettlement: jest.fn().mockResolvedValue({}),
    createVnpayUrl: jest.fn().mockResolvedValue('https://sandbox.vnpayment.vn/pay'),
    openExternalUrl: jest.fn().mockResolvedValue(undefined),
    refreshAll: jest.fn().mockResolvedValue(undefined),
    onAccessDenied: jest.fn(),
    notify: jest.fn(),
  };
  const controller = createCustomerPaymentController(deps, write);
  return {
    deps,
    controller,
    state: () => write.mock.calls.at(-1)?.[0],
    setOrder: (v: ReturnType<typeof order> | null) => { currentOrder = v; },
    setInvoice: (v: InvoiceView | null) => { currentInvoice = v; },
    setCustomer: (v: string | null) => { customerId = v; },
  };
}

describe('customer payment target', () => {
  it('requires confirmed work + unpaid under-repair + real invoice', () => {
    expect(customerPaymentTarget(order(), invoice)).toEqual({
      orderId: ORDER_ID,
      invoiceId: 'invoice-1',
    });
    expect(customerPaymentTarget(order({ customerConfirmed: false }), invoice)).toBeNull();
    expect(customerPaymentTarget(order({ paymentStatus: 'PAID' }), invoice)).toBeNull();
    expect(customerPaymentTarget(order({ status: 'COMPLETED' }), invoice)).toBeNull();
  });
});

it('sanitizes only exact cash settlement fields', () => {
  expect(sanitizeCashSettlement({
    id: 'settlement-1',
    declaredAmount: 100000,
    confirmedAmount: null,
    status: 'pending_confirmation',
    technicianNotes: 'cash',
    secret: 'do-not-render',
  })).toEqual({
    id: 'settlement-1',
    declaredAmount: 100000,
    confirmedAmount: null,
    status: 'PENDING_CONFIRMATION',
    technicianNotes: 'cash',
  });
});

it('cash confirmation POST is reconciled by GET and never trusted alone', async () => {
  const h = setup();
  (h.deps.getCashSettlement as jest.Mock)
    .mockResolvedValueOnce({
      id: 's1', declaredAmount: 100000, status: 'pending_confirmation',
    })
    .mockResolvedValueOnce({
      id: 's1', declaredAmount: 100000, confirmedAmount: 100000, status: 'confirmed',
    });
  await h.controller.loadCash();
  await h.controller.confirmCash(true, 100000);
  expect(h.deps.confirmCashSettlement).toHaveBeenCalledTimes(1);
  expect(h.deps.refreshAll).toHaveBeenCalledTimes(1);
  expect(h.state()).toMatchObject({
    cashNeedsVerify: false,
    settlement: expect.objectContaining({ status: 'CONFIRMED' }),
  });
});

it('ambiguous cash result remains no-repost locked when GET stays pending', async () => {
  const h = setup();
  (h.deps.getCashSettlement as jest.Mock).mockResolvedValue({
    id: 's1', declaredAmount: 100000, status: 'pending_confirmation',
  });
  (h.deps.confirmCashSettlement as jest.Mock).mockRejectedValue(new Error('offline'));
  await h.controller.loadCash();
  await h.controller.confirmCash(true, 100000);
  await h.controller.confirmCash(true, 100000);
  expect(h.deps.confirmCashSettlement).toHaveBeenCalledTimes(1);
  expect(h.state()?.cashNeedsVerify).toBe(true);
});

it('opens only HTTPS VNPay URL and treats return as unverified until Backend GET', async () => {
  const h = setup();
  await h.controller.startVnpay();
  expect(h.deps.createVnpayUrl).toHaveBeenCalledWith('invoice-1');
  expect(h.deps.openExternalUrl).toHaveBeenCalledWith('https://sandbox.vnpayment.vn/pay');
  expect(h.state()?.onlinePending).toBe(true);

  h.setOrder(order({ paymentStatus: 'PAID', status: 'COMPLETED' }));
  h.setInvoice({ ...invoice, paymentStatus: 'PAID' });
  await h.controller.reconcileOnline();
  expect(h.state()?.onlinePending).toBe(false);
});

it('unknown VNPay URL POST never auto-retries', async () => {
  const h = setup();
  (h.deps.createVnpayUrl as jest.Mock).mockRejectedValue(new Error('timeout'));
  await h.controller.startVnpay();
  await h.controller.startVnpay();
  expect(h.deps.createVnpayUrl).toHaveBeenCalledTimes(1);
  expect(h.state()?.onlinePending).toBe(true);
});
