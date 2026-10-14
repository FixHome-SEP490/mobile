import { useMemo, useSyncExternalStore } from 'react';
import { createProductionCustomerAftercare } from '../aftercare/m7-production';
import { useM6OrderRuntime, useM6PresentationLifecycle } from './useM6OrderRuntime';
/** Only the section the Customer actually opened is read. Review remains optional. */
export function useCustomerAftercare(section: 'review' | 'warranty' | null = null) {
  const { runtime, active, snapshot } = useM6OrderRuntime();
  const controller = useMemo(() => createProductionCustomerAftercare(runtime), [runtime]);
  const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
  const lifecycle = useMemo(() => ({ ...controller, async verify() {
    try {
      const markers = await controller.restoredMarkers();
      if (markers.length || section === null) await controller.verify();
      else if (section === 'review') await controller.loadReview(); else await controller.loadWarranty();
    } catch { await controller.verify(); }
  } }), [controller, section]);
  useM6PresentationLifecycle(lifecycle, active, snapshot);
  return { controller, state };
}
