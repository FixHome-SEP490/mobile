import { useEffect, useLayoutEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { ordersApi } from '../../../api/orders.api';
import { useOrderSession } from '../runtime/OrderSessionProvider';
import {
  createTechnicianQuotationController,
  type TechnicianQuotationDependencies,
  type TechnicianQuotationTransport,
} from './technician-quotation-controller';

const defaultTransport: TechnicianQuotationTransport = {
  createQuotation: (orderId, payload) => ordersApi.createQuotation(orderId, payload),
  getQuotation: id => ordersApi.getQuotation(id),
};

export function useTechnicianQuotation(transport: TechnicianQuotationTransport = defaultTransport) {
  const { key, coordinator, journal } = useOrderSession();
  const focused = useIsFocused();
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const ownership = useMemo(() => ({ key, active: false }), [key]);

  const deps: TechnicianQuotationDependencies = useMemo(
    () => ({
      coordinator,
      journal,
      transport,
      getKey: () => ownership.key,
      isActive: () => ownership.active,
      newIntentId: () => `qt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    }),
    [coordinator, journal, transport, ownership],
  );

  const controller = useMemo(() => createTechnicianQuotationController(deps), [deps]);
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
