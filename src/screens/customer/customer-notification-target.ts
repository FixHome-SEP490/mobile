import type { CustomerNotificationItem } from '../../api/notifications.api';
import type { MySupportCase } from '../../api/support-cases.api';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CustomerNotificationTarget =
  | { name: 'CustomerBookingDetail'; params: { bookingId: string; released?: true } }
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
  item: Pick<CustomerNotificationItem, 'referenceId' | 'referenceType'> & { type?: string },
  deps: CustomerNotificationTargetDeps,
): Promise<CustomerNotificationTarget | null> {
  const referenceId = validId(item.referenceId);
  if (!referenceId || typeof item.referenceType !== 'string') return null;

  const type = item.referenceType.trim().toUpperCase();

  if (type === 'BOOKING') {
    // The technician could not make it (BE 20/10/2026): the request page points to choosing another one.
    const released = item.type?.trim().toUpperCase() === 'TECHNICIAN_RELEASED';
    return {
      name: 'CustomerBookingDetail',
      params: released ? { bookingId: referenceId, released: true } : { bookingId: referenceId },
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
