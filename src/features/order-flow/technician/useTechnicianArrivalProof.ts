import { useEffect, useLayoutEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { useOrderSession } from '../runtime/OrderSessionProvider';
import { createProductionArrivalProofController, createProductionOrderLocationTracker } from './arrival-proof-production';
/** Mount once in the active M3 task screen, inside its existing OrderSessionProvider. */
export function useTechnicianArrivalProof({ trackLocation = false }: { trackLocation?: boolean } = {}) {
  const { key, coordinator, journal, snapshot } = useOrderSession();
  const focused = useIsFocused();
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const ownership = useMemo(() => ({ key, active: false }), [key]);
  const runtime = useMemo(() => ({ coordinator, journal, getKey: () => ownership.key, isActive: () => ownership.active }), [coordinator, journal, ownership]);
  const controller = useMemo(() => createProductionArrivalProofController(runtime), [runtime]);
  const tracker = useMemo(() => createProductionOrderLocationTracker(runtime), [runtime]);
  const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
  useEffect(() => {
    if (__DEV__) console.warn('[arrival-proof] hook mounted');
    return () => { if (__DEV__) console.warn('[arrival-proof] hook UNMOUNTED'); };
  }, []);
  useLayoutEffect(() => {
    ownership.active = focused && foreground;
    if (__DEV__) console.warn('[arrival-proof] active=' + ownership.active, JSON.stringify({ focused, foreground }));
    return () => { ownership.active = false; };
  }, [ownership, focused, foreground]);
  useEffect(() => {
    const listener = AppState.addEventListener('change', value => {
      ownership.active = focused && value === 'active';
      if (!ownership.active) tracker.stop();
      setForeground(value === 'active');
    });
    return () => { listener.remove(); tracker.stop(); };
  }, [focused, tracker, ownership]);
  const enRoute = snapshot?.access === 'current' && snapshot.order.status === 'ready' && snapshot.order.data.status === 'EN_ROUTE';
  useEffect(() => {
    if (trackLocation && focused && foreground && enRoute) void tracker.start();
    else tracker.stop();
    return () => tracker.stop();
  }, [tracker, trackLocation, focused, foreground, enRoute]);
  return { controller, state };
}
