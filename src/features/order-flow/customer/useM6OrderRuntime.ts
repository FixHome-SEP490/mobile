import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { useOrderSession } from '../runtime/OrderSessionProvider';
import type { OrderSessionSnapshot } from '../domain/order-session.types';
/** Screen lifetime only; keeps the existing provider/reader and journal. */
export function useM6OrderRuntime() {
  const { key, coordinator, journal, snapshot } = useOrderSession(), focused = useIsFocused();
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const ownership = useMemo(() => ({ key, active: false }), [key]);
  const active = focused && foreground;
  useLayoutEffect(() => { ownership.active = active; return () => { ownership.active = false; }; }, [ownership, active]);
  useEffect(() => {
    const listener = AppState.addEventListener('change', value => { ownership.active = focused && value === 'active'; setForeground(value === 'active'); });
    return () => { ownership.active = false; listener.remove(); };
  }, [ownership, focused]);
  const runtime = useMemo(() => ({ coordinator, journal, getKey: () => ownership.key, isActive: () => ownership.active }), [coordinator, journal, ownership]);
  return { runtime, active, snapshot };
}
export function useM6PresentationLifecycle(controller: { invalidatePresentation: () => void; revalidateConfirmation: () => void; verify: () => Promise<void> }, active: boolean, snapshot: OrderSessionSnapshot | null) {
  useLayoutEffect(() => controller.revalidateConfirmation(), [controller, snapshot]);
  useLayoutEffect(() => { if (!active) controller.invalidatePresentation(); return () => controller.invalidatePresentation(); }, [controller, active]);
  useEffect(() => {
    // Native events can be batched back to active before React renders. Revoke
    // captured confirmations immediately, independently of the rendered flag.
    const listener = AppState.addEventListener('change', value => { if (value !== 'active') controller.invalidatePresentation(); });
    return () => listener.remove();
  }, [controller]);
  // Only unresolved owned markers cause GET. No polling and no POST on lifecycle.
  useEffect(() => { if (active) void controller.verify(); }, [controller, active]);
}
