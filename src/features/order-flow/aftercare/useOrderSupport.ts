import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { createProductionOrderSupport } from './m7-production';
import { useM6OrderRuntime, useM6PresentationLifecycle } from '../customer/useM6OrderRuntime';
import { entryAttemptJournal } from '../runtime/entry-attempt-production';
export function useOrderSupport(journal = entryAttemptJournal) {
  const { runtime, active, snapshot } = useM6OrderRuntime();
  const controller = useMemo(() => createProductionOrderSupport(runtime, journal), [runtime, journal]);
  const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
  const lifecycle = useMemo(() => ({ ...controller, verify: async () => {} }), [controller]);
  useM6PresentationLifecycle(lifecycle, active, snapshot);
  const access = snapshot?.access;
  // The sole order reader may become ready after mount. Recovery reads known case IDs only.
  useEffect(() => { if (active && access === 'current') void controller.verify(); }, [controller, active, access]);
  return { controller, state, allowedTypes: controller.allowedTypes() };
}
