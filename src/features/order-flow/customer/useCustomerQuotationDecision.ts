import { useEffect, useLayoutEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { ordersApi } from '../../../api/orders.api';
import { useOrderSession } from '../runtime/OrderSessionProvider';
import {
  createCustomerQuotationDecisionController,
  type CustomerQuotationDecisionDependencies,
  type CustomerQuotationDecisionTransport,
} from './customer-quotation-controller';

const defaultTransport: CustomerQuotationDecisionTransport = {
  approveQuotation: (quoteId, paidWarrantyItemIds) =>
    ordersApi.approveQuotation(quoteId, paidWarrantyItemIds ?? []),
  rejectQuotation: quoteId => ordersApi.rejectQuotation(quoteId),
  getQuotation: id => ordersApi.getQuotation(id),
};

export function useCustomerQuotationDecision(transport: CustomerQuotationDecisionTransport = defaultTransport) {
  const { key, coordinator, journal } = useOrderSession();
  const focused = useIsFocused();
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const ownership = useMemo(() => ({ key, active: false }), [key]);

  const deps: CustomerQuotationDecisionDependencies = useMemo(
    () => ({
      coordinator,
      journal,
      transport,
      getKey: () => ownership.key,
      isActive: () => ownership.active,
      newIntentId: () => `qd-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    }),
    [coordinator, journal, transport, ownership],
  );

  const controller = useMemo(() => createCustomerQuotationDecisionController(deps), [deps]);
  const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);

  useLayoutEffect(() => {
    ownership.active = focused && foreground;
    return () => {
      ownership.active = false;
    };
  }, [ownership, focused, foreground]);

  useEffect(() => {
    const listener = AppState.addEventListener('change', value => {
      ownership.active = focused && value === 'active';
      setForeground(value === 'active');
    });
    return () => {
      listener.remove();
    };
  }, [focused, ownership]);

  return { controller, state };
}
