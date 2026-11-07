import { useCallback, useEffect, useRef, useState } from 'react';
import { technicianWarrantyApi, type TechnicianWarrantyClaim } from '../api/technician-warranty.api';
import { listsNeedRead } from '../services/live-kinds';
import { useLiveRefresh } from './useLiveRefresh';

export const WARRANTY_PAGE_SIZE = 20;

/**
 * The warranty claims assigned to the technician, page by page, like the web "Bảo hành" page. `status` narrows the
 * list on the server (the invitations are the claims still `submitted`). A newer read always wins over a slower one.
 */
export function useWarrantyClaims(status?: string, enabled = true) {
  const [items, setItems] = useState<TechnicianWarrantyClaim[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(enabled);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const sequence = useRef(0);
  const page = useRef(1);

  const read = useCallback(async (next: number, replace: boolean) => {
    const mine = ++sequence.current;
    try {
      const result = await technicianWarrantyApi.listMine({ page: next, pageSize: WARRANTY_PAGE_SIZE, ...(status ? { status } : {}) });
      if (mine !== sequence.current) return;
      page.current = next;
      setItems(current => (replace ? result.data : [...current, ...result.data.filter(row => !current.some(old => old.id === row.id))]));
      setTotal(result.meta.total);
      setError(false);
    } catch {
      if (mine === sequence.current) setError(true);
    }
  }, [status]);

  const load = useCallback(async () => {
    setLoading(true);
    await read(1, true);
    setLoading(false);
  }, [read]);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    await read(1, true);
    setRefreshing(false);
  }, [read]);
  const loadMore = useCallback(async () => {
    if (loadingMore || loading || items.length >= total) return;
    setLoadingMore(true);
    await read(page.current + 1, false);
    setLoadingMore(false);
  }, [items.length, loading, loadingMore, read, total]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- the read is the effect
  useEffect(() => { if (enabled) void load(); }, [enabled, load]);
  useLiveRefresh(['order:updated'], (batch) => { if (enabled && listsNeedRead(batch)) void read(1, true); }, undefined, { pollMs: 60_000 });

  return { items, total, loading, refreshing, loadingMore, error, load, refresh, loadMore };
}
