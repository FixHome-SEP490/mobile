import type { OrderJournalStorage } from './order-command-journal';

export type EntryAttempt = {
  ownerUserId: string; intentId: string; createdAt: number; confirmedId?: string; resolved?: boolean;
} & ({ kind: 'booking-create'; baselineIds: string[] | null }
  | { kind: 'invitation'; invitationId: string; bookingId: string; action: 'ACCEPT' | 'DECLINE' });
const STORE_KEY = 'fixhome.entry-command-intents.v1';
const id = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(v);
function sanitize(value: unknown): EntryAttempt {
  if (!value || typeof value !== 'object') throw Error('Invalid entry intent');
  const r = value as EntryAttempt;
  if (!id(r.ownerUserId) || !id(r.intentId) || !Number.isFinite(r.createdAt) || r.createdAt < 0
    || (r.confirmedId !== undefined && !id(r.confirmedId)) || (r.resolved !== undefined && typeof r.resolved !== 'boolean')) throw Error('Invalid entry intent');
  const common = { ownerUserId: r.ownerUserId, intentId: r.intentId, createdAt: r.createdAt,
    ...(r.confirmedId ? { confirmedId: r.confirmedId } : {}), ...(r.resolved ? { resolved: true } : {}) };
  if (r.kind === 'booking-create' && (r.baselineIds === null || (Array.isArray(r.baselineIds) && r.baselineIds.every(id))))
    return { ...common, kind: r.kind, baselineIds: r.baselineIds && [...r.baselineIds] };
  if (r.kind === 'invitation' && id(r.invitationId) && id(r.bookingId) && ['ACCEPT', 'DECLINE'].includes(r.action))
    return { ...common, kind: r.kind, invitationId: r.invitationId, bookingId: r.bookingId, action: r.action };
  throw Error('Invalid entry intent');
}
/** Locks only; never an offline queue or stored Booking/camera snapshot. */
export function createEntryAttemptJournal(storage: OrderJournalStorage) {
  let rows: EntryAttempt[] = [], loaded = false, damaged = false;
  let restoring: Promise<void> | undefined;
  let writes = Promise.resolve();
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach(fn => fn());
  const ready = () => { if (!loaded || damaged) throw Error('Entry journal unavailable'); };
  const persist = () => {
    const raw = JSON.stringify(rows);
    writes = writes.then(() => storage.setItem(STORE_KEY, raw)).catch(error => { damaged = true; emit(); throw error; });
    return writes;
  };
  return {
    restore(): Promise<void> {
      if (loaded && !damaged) return Promise.resolve();
      return restoring ??= (async () => {
        try {
          const raw = await storage.getItem(STORE_KEY), parsed: unknown = raw === null ? [] : JSON.parse(raw);
          if (!Array.isArray(parsed)) throw Error('Invalid entry journal');
          rows = parsed.map(sanitize);
          if (new Set(rows.map(r => `${r.ownerUserId}:${r.intentId}`)).size !== rows.length) throw Error('Conflicting entry journal');
          loaded = true; emit();
        } catch (error) { damaged = true; throw error; }
      })();
    },
    blocked(owner: string, kind: EntryAttempt['kind'], invitationId?: string): boolean {
      return !loaded || damaged || rows.some(r => r.ownerUserId === owner && r.kind === kind && !r.resolved
        && (r.kind !== 'invitation' || invitationId === undefined || r.invitationId === invitationId));
    },
    list(owner: string): EntryAttempt[] { ready(); return rows.filter(r => r.ownerUserId === owner).map(sanitize); },
    async begin(input: EntryAttempt): Promise<boolean> {
      ready(); const row = sanitize(input);
      if (rows.some(r => r.ownerUserId === row.ownerUserId && (r.intentId === row.intentId
        || (!r.resolved && r.kind === row.kind && (r.kind === 'booking-create' || (row.kind === 'invitation' && r.invitationId === row.invitationId)))))) return false;
      rows = [...rows, row]; emit(); await persist(); return true;
    },
    async recordId(owner: string, intentId: string, confirmedId: string) {
      ready(); const row = rows.find(r => r.ownerUserId === owner && r.intentId === intentId);
      if (!row || !id(confirmedId) || (row.confirmedId && row.confirmedId !== confirmedId)) throw Error('Conflicting entry ID');
      rows = rows.map(r => r === row ? { ...r, confirmedId } : r); emit(); await persist();
    },
    async resolve(owner: string, intentId: string) {
      ready(); if (!rows.some(r => r.ownerUserId === owner && r.intentId === intentId)) throw Error('Missing entry intent');
      rows = rows.map(r => r.ownerUserId === owner && r.intentId === intentId ? { ...r, resolved: true } : r); emit(); await persist();
    },
    subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
  };
}
export type EntryAttemptJournal = ReturnType<typeof createEntryAttemptJournal>;
