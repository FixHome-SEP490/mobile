import { ordersApi } from '../../../api/orders.api';
import { fundedCheckoutApi } from '../../../api/funded-checkout.api';
import { newEntryIntentId } from '../runtime/entry-attempt-production';
import { authenticatedM6Key, type M6OrderRuntime } from '../customer/order-payment-production';
import { createTechnicianCashController } from './technician-cash-controller';
export function createProductionTechnicianCashController(runtime: M6OrderRuntime) {
  return createTechnicianCashController({ ...runtime, getKey: () => authenticatedM6Key(runtime, 'technician'), newIntentId: newEntryIntentId,
    transport: {
      declareCash: ordersApi.declareCashSettlement,
      cashReservation: orderId => fundedCheckoutApi.cashReservation({ kind: 'SOLO', serviceOrderId: orderId }),
      declareFundedCash: (orderId, reservationId, dto) => fundedCheckoutApi.declareCash({ kind: 'SOLO', serviceOrderId: orderId }, reservationId, dto),
    } });
}
