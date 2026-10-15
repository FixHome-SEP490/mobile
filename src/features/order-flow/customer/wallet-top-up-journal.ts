import type { OrderJournalStorage } from '../runtime/order-command-journal';
import type { M6Phase } from './payment-facts';
export interface WalletTopUpMarker { userId: string; stableKey: string; dispatchedAt: number; paymentId?: string; status: 'unknown' | 'resolved' | 'failed-known' }
const identifier = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v);
function sanitize(value: unknown): WalletTopUpMarker {
  const row = value as WalletTopUpMarker | null;
  if (!row || !identifier(row.userId) || typeof row.stableKey !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(row.stableKey)
    || !Number.isFinite(row.dispatchedAt) || row.dispatchedAt < 0 || !['unknown', 'resolved', 'failed-known'].includes(row.status)
    || (row.paymentId !== undefined && !identifier(row.paymentId))) throw Error('Wallet intent unavailable');
  return { userId: row.userId, stableKey: row.stableKey, dispatchedAt: row.dispatchedAt, status: row.status, ...(row.paymentId ? { paymentId: row.paymentId } : {}) };
}
/** Separate wallet intent without an order. No payload, URL, balance or credential on disk. */
export function createWalletTopUpJournal(storage: OrderJournalStorage) {
  let rows: WalletTopUpMarker[] = [], loaded = false, damaged = false, restoring: Promise<void> | null = null;
  let writes: Promise<void> = Promise.resolve();
  const ready = () => { if (!loaded || damaged) throw Error('Wallet intent unavailable'); };
  const persist = () => { const raw = JSON.stringify(rows); writes = writes.then(() => storage.setItem('fixhome.customer-wallet-intents.v1', raw)).catch(e => { damaged = true; throw e; }); return writes; };
  return {
    restore() {
      if (loaded) return damaged ? Promise.reject(Error('Wallet intent unavailable')) : Promise.resolve();
      if (!restoring) restoring = (async () => {
        try {
          const raw = await storage.getItem('fixhome.customer-wallet-intents.v1'); const parsed: unknown = raw === null ? [] : JSON.parse(raw);
          if (!Array.isArray(parsed)) throw Error('Wallet intent unavailable');
          rows = parsed.map(sanitize);
          if (new Set(rows.map(r => r.userId)).size !== rows.length || new Set(rows.map(r => r.stableKey)).size !== rows.length) throw Error('Wallet intent unavailable');
          loaded = true;
        } catch (e) { damaged = true; throw e; }
      })();
      return restoring;
    },
    get(userId: string) { ready(); const row = rows.find(r => r.userId === userId); return row ? { ...row } : null; },
    async begin(userId: string, stableKey: string, dispatchedAt: number) {
      ready(); if (rows.some(r => (r.userId === userId && r.status === 'unknown') || r.stableKey === stableKey)) return false;
      rows = [...rows.filter(r => r.userId !== userId), sanitize({ userId, stableKey, dispatchedAt, status: 'unknown' })];
      await persist(); return true;
    },
    async recordPayment(userId: string, stableKey: string, paymentId: string) {
      ready(); const row = rows.find(r => r.userId === userId && r.stableKey === stableKey);
      if (!row || !identifier(paymentId) || (row.paymentId && row.paymentId !== paymentId)) throw Error('Wallet intent unavailable');
      rows = rows.map(r => r === row ? { ...r, paymentId } : r); await persist();
    },
    async mark(userId: string, stableKey: string, status: Extract<M6Phase, 'resolved' | 'failed-known'>) {
      ready(); rows = rows.map(r => r.userId === userId && r.stableKey === stableKey ? { ...r, status } : r); await persist();
    },
  };
}
export type WalletTopUpJournal = ReturnType<typeof createWalletTopUpJournal>;
