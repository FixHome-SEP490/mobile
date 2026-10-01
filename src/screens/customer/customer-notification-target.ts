import type { CustomerNotificationItem } from '../../api/notifications.api';
import type { MySupportCase } from '../../api/support-cases.api';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CustomerNotificationTarget =
  | { name: 'CustomerBookingDetail'; params: { bookingId: string } }
  | { name: 'CustomerOrderDetail'; params: { serviceOrderId: string } };

export interface CustomerNotificationTargetDeps {
  getSupportCase: (id: string) => Promise<MySupportCase>;
}

function validId(value: unknown): string | null {
  return typeof value === 'string' && UUID.test(value.trim())
    ? value.trim()
    : null;
}

export async function resolveCustomerNotificationTarget(
  item: Pick<CustomerNotificationItem, 'referenceId' | 'referenceType'>,
  deps: CustomerNotificationTargetDeps,
): Promise<CustomerNotificationTarget | null> {
  const referenceId = validId(item.referenceId);
  if (!referenceId || typeof item.referenceType !== 'string') return null;

  const type = item.referenceType.trim().toUpperCase();

  if (type === 'BOOKING') {
    return {
      name: 'CustomerBookingDetail',
      params: { bookingId: referenceId },
    };
  }

  if (type === 'SERVICE_ORDER') {
    return {
      name: 'CustomerOrderDetail',
      params: { serviceOrderId: referenceId },
    };
  }

  if (type !== 'SUPPORT_CASE') return null;

  const supportCase = await deps.getSupportCase(referenceId);
  const serviceOrderId = validId(supportCase.serviceOrderId);
  if (serviceOrderId) {
    return {
      name: 'CustomerOrderDetail',
      params: { serviceOrderId },
    };
  }

  const bookingId = validId(supportCase.bookingId);
  if (bookingId) {
    return {
      name: 'CustomerBookingDetail',
      params: { bookingId },
    };
  }

  return null;
}
