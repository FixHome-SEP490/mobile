import {
  createTechnicianCashController,
  technicianCashTarget,
  type TechnicianCashDeps,
  type TechnicianCashState,
} from './technician-cash-settlement';

const ORDER_ID = '11111111-1111-4111-8111-111111111111';
const order = (overrides: Record<string, unknown> = {}) => ({
  id: ORDER_ID,
  status: 'UNDER_REPAIR',
  paymentStatus: 'UNPAID',
  completionRequestedAt: '2030-01-01T00:00:00Z',
  grandTotal: 150000,
  historical: false,
  ...overrides,
});

function setup() {
  let current = order();
  const write = jest.fn<void, [TechnicianCashState]>();
  const deps: TechnicianCashDeps = {
    getOrder: () => current,
    getTechnicianId: () => 'tech-a',
    isFocused: () => true,
    getCashSettlement: jest.fn().mockResolvedValue(null),
    declareCashSettlement: jest.fn().mockResolvedValue({}),
    refreshDetail: jest.fn().mockResolvedValue(undefined),
    onAccessDenied: jest.fn(),
    notify: jest.fn(),
  };
  const controller = createTechnicianCashController(deps, write);
  return {
    deps, controller,
    state: () => write.mock.calls.at(-1)?.[0],
    setOrder: (v: ReturnType<typeof order>) => { current = v; },
  };
}

it('requires completion request, unpaid under-repair and exact server total', () => {
  expect(technicianCashTarget(order())).toEqual({ orderId: ORDER_ID, amount: 150000 });
  expect(technicianCashTarget(order({ completionRequestedAt: null }))).toBeNull();
  expect(technicianCashTarget(order({ paymentStatus: 'PAID' }))).toBeNull();
});

it('declares exact server order total and verifies by GET', async () => {
  const h = setup();
  (h.deps.getCashSettlement as jest.Mock).mockResolvedValue({
    id: 's1', declaredAmount: 150000, status: 'pending_confirmation',
  });
  await h.controller.declare('Đã nhận tiền');
  expect(h.deps.declareCashSettlement).toHaveBeenCalledWith(ORDER_ID, {
    declaredAmount: 150000,
    technicianNotes: 'Đã nhận tiền',
  });
  expect(h.state()).toMatchObject({
    status: 'PENDING_CONFIRMATION',
    declaredAmount: 150000,
    needsVerify: false,
  });
});

it('ambiguous declaration never blindly reposts', async () => {
  const h = setup();
  (h.deps.declareCashSettlement as jest.Mock).mockRejectedValue(new Error('offline'));
  (h.deps.getCashSettlement as jest.Mock).mockResolvedValue(null);
  await h.controller.declare();
  await h.controller.declare();
  expect(h.deps.declareCashSettlement).toHaveBeenCalledTimes(1);
  expect(h.state()?.needsVerify).toBe(true);
});
