import { createTechnicianCashController } from './technician-cash-controller';
import { NoFundedCashReservationError } from '../../../api/funded-checkout.api';
import { m6Fixture } from '../customer/m6-fixtures.test-utils';
jest.mock('../../../api/client', () => ({ __esModule: true, default: {} }));

function setup(lookup: () => Promise<{ voucherReservationId: string; customerDueVnd: number }>) {
  const f = m6Fixture('technician');
  f.server.order.completionRequestedAt = '2026-10-27T01:00:00Z';
  const row = (amount: number) => ({ id: 'cash', serviceOrderId: 'order', declaredByTechnicianId: f.key.userId, declaredAmount: amount, status: 'pending_confirmation', declaredAt: '2026-10-27T02:00:00Z', technicianNotes: null, confirmedAmount: null });
  const declare = (amount: number) => { f.server.cash = row(amount) as never; return row(amount); };
  const transport = {
    declareCash: jest.fn(async (_id: string, dto: { declaredAmount: number }) => declare(dto.declaredAmount)),
    cashReservation: jest.fn(lookup),
    declareFundedCash: jest.fn(async (_id: string, _hold: string, dto: { declaredAmount: number }) => declare(dto.declaredAmount)),
  };
  return { ...f, transport, controller: createTechnicianCashController({ ...f.runtime, transport }) };
}
const NONE = async () => { throw new NoFundedCashReservationError(); };

it('declares through the hold when the server reports a voucher, at exactly the due', async () => {
  const f = setup(async () => ({ voucherReservationId: 'hold-1', customerDueVnd: 70000 }));
  await f.controller.requestDeclaration({ declaredAmount: 70000 }); await f.controller.submitConfirmation();
  expect(f.transport.declareFundedCash).toHaveBeenCalledWith('order', 'hold-1', { declaredAmount: 70000 });
  expect(f.transport.declareCash).not.toHaveBeenCalled();
});

it('refuses an amount that is not the due while a voucher is held', async () => {
  const f = setup(async () => ({ voucherReservationId: 'hold-1', customerDueVnd: 70000 }));
  await f.controller.requestDeclaration({ declaredAmount: 120000 }); await f.controller.submitConfirmation();
  expect(f.controller.getState()).toMatchObject({ phase: 'denied', voucher: { status: 'held', dueVnd: 70000 } });
  expect(f.transport.declareFundedCash).not.toHaveBeenCalled(); expect(f.transport.declareCash).not.toHaveBeenCalled();
});

it('collects the full amount only on the explicit "no voucher" answer', async () => {
  const f = setup(NONE);
  await f.controller.requestDeclaration({ declaredAmount: 120000 }); await f.controller.submitConfirmation();
  expect(f.transport.declareCash).toHaveBeenCalledWith('order', { declaredAmount: 120000 });
  expect(f.transport.declareFundedCash).not.toHaveBeenCalled();
});

it.each([['a server error', async () => { throw { response: { status: 409 } }; }], ['a 503', async () => { throw { response: { status: 503 } }; }], ['a network failure', async () => { throw new Error('offline'); }]])(
  'does not fall back to the full amount after %s', async (_name, lookup) => {
    const f = setup(lookup as never);
    await f.controller.requestDeclaration({ declaredAmount: 120000 }); await f.controller.submitConfirmation();
    expect(f.controller.getState()).toMatchObject({ phase: 'denied', voucher: { status: 'error' } });
    expect(f.transport.declareCash).not.toHaveBeenCalled(); expect(f.transport.declareFundedCash).not.toHaveBeenCalled();
  });

it('lets the screen read the voucher before the technician types', async () => {
  const f = setup(async () => ({ voucherReservationId: 'hold-1', customerDueVnd: 70000 }));
  await f.controller.checkVoucher();
  expect(f.controller.getState().voucher).toEqual({ status: 'held', reservationId: 'hold-1', dueVnd: 70000 });
});
