import * as WebBrowser from 'expo-web-browser';
import { ordersApi } from '../../../api/orders.api';
import { customerWalletApi } from '../../../api/customer-wallet.api';
import { fundedCheckoutApi } from '../../../api/funded-checkout.api';
import { useAuthStore } from '../../../store/auth.store';
import { sameOrderSession, type OrderRole, type OrderSessionKey } from '../domain/order-session.types';
import type { OrderCommandJournal } from '../runtime/order-command-journal';
import type { OrderReadCoordinator } from '../runtime/order-read-coordinator';
import { newEntryIntentId } from '../runtime/entry-attempt-production';
import { createOrderPaymentController } from './customer-payment-controller';
export interface M6OrderRuntime { coordinator: OrderReadCoordinator; journal: OrderCommandJournal; getKey: () => OrderSessionKey | null; isActive: () => boolean }
export function authenticatedM6Key(runtime: M6OrderRuntime, role: OrderRole) {
  const key = runtime.getKey(), auth = useAuthStore.getState();
  return key && runtime.isActive() && auth.isAuthenticated && auth.user?.role === role && key.role === role
    && sameOrderSession({ userId: auth.user.id, role, sessionGeneration: auth.sessionGeneration, serviceOrderId: key.serviceOrderId }, key) ? key : null;
}
export function createProductionOrderPaymentController(runtime: M6OrderRuntime) {
  return createOrderPaymentController({ ...runtime, getKey: () => authenticatedM6Key(runtime, 'customer'), newIntentId: newEntryIntentId,
    transport: { payWallet: ordersApi.payInvoiceWithWallet, createVnpayUrl: ordersApi.createVnpayUrl, confirmNoCharge: ordersApi.confirmNoCharge,
      confirmCash: ordersApi.confirmCashSettlement, readWallet: () => customerWalletApi.getSummary(), openUrl: url => WebBrowser.openAuthSessionAsync(url, 'fixhome://'), funded: fundedCheckoutApi } });
}
