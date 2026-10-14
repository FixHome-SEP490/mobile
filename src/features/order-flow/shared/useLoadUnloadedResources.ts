import { useEffect, useMemo } from 'react';
import type { OrderResourceKind, OrderSessionSnapshot } from '../domain/order-session.types';
import type { OrderSessionContextValue } from '../runtime/OrderSessionProvider';

/** Lazy detail reads happen once per unloaded resource; errors wait for explicit refresh. */
export function useLoadUnloadedResources(
  snapshot: OrderSessionSnapshot | null,
  kinds: readonly OrderResourceKind[],
  loadResource: OrderSessionContextValue['loadResource'],
) {
  const kindsKey = kinds.join('|');
  const stableKinds = useMemo(() => kindsKey ? kindsKey.split('|') as OrderResourceKind[] : [], [kindsKey]);
  useEffect(() => {
    if (!snapshot || snapshot.access !== 'current' || snapshot.order.status !== 'ready') return;
    for (const kind of stableKinds) {
      if (snapshot.resources[kind].status === 'unloaded') void loadResource(kind);
    }
  }, [snapshot, stableKinds, loadResource]);
}
