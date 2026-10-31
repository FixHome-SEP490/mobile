import { useCallback, useEffect, useState } from 'react';
import { ordersApi } from '../../../api/orders.api';
import { loadReleasable, type ReleasableJob } from '../../../screens/technician/technician-overrun-release';

/**
 * The technician's upcoming orders that can be reported late while the current job overruns
 * (same rule and API as the "Không kịp tới" tab). A failed read leaves the list empty.
 *
 * Only the orders still waiting for the technician are asked for, and the answer is shared: the row in the
 * order hub and the report page it opens read the same list, so the page opens at once with what the hub already has.
 */
const WAITING = ['accepted', 'en_route'];
const FRESH_MS = 20_000;
let shared: { owner: string; at: number; items: ReleasableJob[] } | null = null;
let inflight: { owner: string; promise: Promise<ReleasableJob[]> } | null = null;

async function fetchReleasable(owner: string, force: boolean): Promise<ReleasableJob[]> {
  if (!force && inflight?.owner === owner) return inflight.promise;
  const promise = ordersApi.getTechnicianJobs({ excludeVisitGroups: true, statuses: WAITING })
    .then((jobs) => loadReleasable(jobs, ordersApi.overrunReleaseStatus))
    .then((found) => { shared = { owner, at: Date.now(), items: found.items }; return found.items; })
    .finally(() => { if (inflight?.promise === promise) inflight = null; });
  inflight = { owner, promise };
  return promise;
}

export function useReleasableOrders(owner: string | undefined, enabled = true) {
  const cached = shared && shared.owner === owner ? shared : null;
  const [items, setItems] = useState<ReleasableJob[]>(cached?.items ?? []);
  const [loading, setLoading] = useState(!cached);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!enabled || !owner) return;
    const fresh = shared?.owner === owner && Date.now() - shared.at < FRESH_MS;
    // Fresh and not asked to reload: what the hub already read is the answer, nothing to fetch.
    if (fresh && tick === 0) return;
    let live = true;
    fetchReleasable(owner, tick > 0)
      .then((found) => { if (live) setItems(found); })
      .catch(() => { /* optional shortcut: the "Không kịp tới" tab stays available */ })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [enabled, owner, tick]);

  const reload = useCallback(() => setTick((n) => n + 1), []);
  return { items, loading, reload };
}

/** For tests and sign-out: forget what was read. */
export function forgetReleasableOrders(): void { shared = null; inflight = null; }
