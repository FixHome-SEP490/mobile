import { useEffect, useLayoutEffect, useMemo, useSyncExternalStore } from 'react';
import { createProductionTechnicianWarranty } from '../aftercare/m7-production';
import { useAftercareOwner, useAftercarePresentation } from '../aftercare/useAftercareOwner';
import { entryAttemptJournal } from '../runtime/entry-attempt-production';
/** null selects inbox; an actual claim ID selects just its assigned warranty task. */
export function useTechnicianWarranty(claimId: string | null = null, journal = entryAttemptJournal) {
  const { runtime, owner, active } = useAftercareOwner('technician');
  const controller = useMemo(() => { const c = createProductionTechnicianWarranty(runtime, journal); c.selectClaim(claimId); return c; }, [runtime, journal, claimId]);
  const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
  useLayoutEffect(() => { controller.selectClaim(claimId); return () => controller.invalidatePresentation(); }, [controller, claimId]);
  useAftercarePresentation(controller.invalidatePresentation, active);
  useEffect(() => {
    let current = true;
    if (active && owner) void (async () => {
      if (!claimId) await controller.loadInbox();
      else {
        try { const markers = await controller.restoredMarkers(); if (!current) return;
          if (markers.length) await controller.verify(); else await controller.refreshClaim();
        } catch { if (current) await controller.verify(); }
      }
    })();
    return () => { current = false; };
  }, [controller, active, owner, claimId]);
  return { controller, state };
}
