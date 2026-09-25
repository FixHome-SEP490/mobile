import type { ServiceOrderItem } from '../../api/orders.api';
import {
  createCustomerOrderCancelController,
  customerOrderCancelTarget,
  initialCustomerOrderCancelState,
  type CustomerOrderCancelDeps,
  type CustomerOrderCancelState,
} from './customer-order-cancel';

const ORDER_ID = '11111111-1111-4111-8111-111111111111';

const order = (overrides: Partial<ServiceOrderItem> = {}): ServiceOrderItem => ({
  id: ORDER_ID,
  code: 'SO-1',
  bookingId: 'booking-1',
  serviceName: 'Điện',
  status: 'ACCEPTED',
  customerName: 'Khách',
  customerPhone: '',
  addressSummary: 'HCM',
  scheduledAt: '2030-01-01T10:00:00Z',
  laborTotal: 0,
  partsTotal: 0,
  grandTotal: 100000,
  paymentStatus: 'UNPAID',
  createdAt: '2030-01-01T00:00:00Z',
  ...overrides,
});

function setup() {
  let current: ServiceOrderItem | null = order();
  const write = jest.fn<void, [CustomerOrderCancelState]>();
  const deps: CustomerOrderCancelDeps = {
    getOrder: () => current,
    getCustomerId: () => 'customer-a',
    isFocused: () => true,
    cancelOrder: jest.fn().mockResolvedValue({}),
    getOrderById: jest.fn().mockImplementation(async () => {
      current = order({ status: 'CANCELLED' });
      return current;
    }),
    onAccessDenied: jest.fn(),
    notify: jest.fn(),
  };
  const controller = createCustomerOrderCancelController(deps, write);
  return {
    deps,
    controller,
    state: () => write.mock.calls.at(-1)?.[0],
    setOrder: (value: ServiceOrderItem | null) => { current = value; },
  };
}

it('only exposes Customer cancel for ACCEPTED/EN_ROUTE active orders', () => {
  expect(customerOrderCancelTarget(order({ status: 'ACCEPTED' }))).toBe(ORDER_ID);
  expect(customerOrderCancelTarget(order({ status: 'EN_ROUTE' }))).toBe(ORDER_ID);
  expect(customerOrderCancelTarget(order({ status: 'UNDER_REPAIR' }))).toBeNull();
  expect(customerOrderCancelTarget(order({ status: 'COMPLETED' }))).toBeNull();
  expect(customerOrderCancelTarget(order({ historical: true }))).toBeNull();
});

it('requires explicit reason and confirmation before one POST', async () => {
  const h = setup();
  h.controller.requestConfirm();
  expect(h.deps.cancelOrder).not.toHaveBeenCalled();
  expect(h.state()?.error).toMatch(/lý do/i);

  h.controller.setReason('Không còn nhu cầu');
  h.controller.requestConfirm();
  await h.controller.submit();

  expect(h.deps.cancelOrder).toHaveBeenCalledTimes(1);
  expect(h.deps.getOrderById).toHaveBeenCalledWith(ORDER_ID);
  expect(h.state()?.status).toBe('cancelled');
});

it('ambiguous POST stays no-repost locked if fresh GET is still open', async () => {
  const h = setup();
  (h.deps.cancelOrder as jest.Mock).mockRejectedValue(new Error('timeout'));
  (h.deps.getOrderById as jest.Mock).mockImplementation(async () => order());
  h.controller.setReason('Đổi kế hoạch');
  h.controller.requestConfirm();

  await h.controller.submit();
  h.controller.requestConfirm();
  await h.controller.submit();

  expect(h.deps.cancelOrder).toHaveBeenCalledTimes(1);
  expect(h.state()?.needsVerify).toBe(true);
});

it('fresh UNDER_REPAIR result converts to protected support copy', async () => {
  const h = setup();
  (h.deps.cancelOrder as jest.Mock).mockRejectedValue({ response: { status: 409 } });
  (h.deps.getOrderById as jest.Mock).mockImplementation(async () =>
    order({ status: 'UNDER_REPAIR' }),
  );
  h.controller.setReason('Hủy');
  h.controller.requestConfirm();

  await h.controller.submit();

  expect(h.state()).toMatchObject({
    status: 'protected',
    needsVerify: false,
  });
  expect(h.state()?.error).toMatch(/Service Manager|Support/i);
});

it.each([401, 403])('clears state on access rejection %s', async (status) => {
  const h = setup();
  (h.deps.cancelOrder as jest.Mock).mockRejectedValue({ response: { status } });
  h.controller.setReason('Hủy');
  h.controller.requestConfirm();

  await h.controller.submit();

  expect(h.deps.onAccessDenied).toHaveBeenCalledTimes(1);
  expect(h.state()).toEqual(initialCustomerOrderCancelState);
});
