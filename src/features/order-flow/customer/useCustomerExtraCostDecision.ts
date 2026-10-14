import { useEffect, useLayoutEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { useOrderSession } from '../runtime/OrderSessionProvider';
import { sameOrderSession } from '../domain/order-session.types';
import {
  createCustomerExtraCostDecisionController,
  type CustomerExtraCostDecisionControllerDeps,
  type CustomerExtraCostDecisionTransport,
} from './customer-extra-cost-controller';

export function useCustomerExtraCostDecision(transport?: CustomerExtraCostDecisionTransport) {
  const { key, coordinator, journal } = useOrderSession();
  const focused = useIsFocused();
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const ownership = useMemo(() => ({ key, active: false }), [key]);

  const deps: CustomerExtraCostDecisionControllerDeps = useMemo(
    () => ({
      readCoordinator: coordinator,
      journal,
      transport,
      isCurrent: (currentKey) =>
        ownership.active &&
        ownership.key !== null &&
        sameOrderSession(ownership.key, currentKey),
    }),
    [coordinator, journal, transport, ownership],
  );

  const controller = useMemo(() => createCustomerExtraCostDecisionController(deps), [deps]);
  const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);

  useLayoutEffect(() => {
    ownership.active = focused && foreground;
    return () => {
      ownership.active = false;
    };
  }, [ownership, focused, foreground]);

  useEffect(() => {
    const listener = AppState.addEventListener('change', (value) => {
      ownership.active = focused && value === 'active';
      setForeground(value === 'active');
    });
    return () => {
      listener.remove();
    };
  }, [focused, ownership]);

  return { controller, state };
}
