import type { CustomerNotificationItem } from '../../api/notifications.api';
import type { MySupportCase } from '../../api/support-cases.api';
import {
  resolveCustomerNotificationTarget,
  type CustomerNotificationTarget,
} from './customer-notification-target';

export interface CustomerNotificationActionDeps {
  markReadLocal: (id: string) => void;
  markReadRemote: (id: string) => Promise<void>;
  onMarkReadError: (error: unknown) => void;
  getSupportCase: (id: string) => Promise<MySupportCase>;
}

export async function prepareCustomerNotificationAction(
  item: CustomerNotificationItem,
  deps: CustomerNotificationActionDeps,
): Promise<CustomerNotificationTarget | null> {
  if (!item.isRead) {
    deps.markReadLocal(item.id);
    void deps.markReadRemote(item.id).catch(deps.onMarkReadError);
  }

  return resolveCustomerNotificationTarget(item, {
    getSupportCase: deps.getSupportCase,
  });
}
