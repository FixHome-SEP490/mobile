import { createOrderReadCoordinator } from '../runtime/order-read-coordinator';
import { createOrderCommandJournal } from '../runtime/order-command-journal';
import type { OrderRole, OrderSessionKey } from '../domain/order-session.types';

export const afterAsset = { source: 'camera' as const, uri: 'file://private.jpg', name: 'after.jpg', type: 'image/jpeg', sizeBytes: 1024 };
export const proof = (id = 'after', uploaderId = 'tech') => ({ id, serviceOrderId: 'order', uploaderId, type: 'AFTER', mediaUrl: `https://res.cloudinary.com/fixture/image/authenticated/s--signature--/v1/order/${id}.jpg`, createdAt: '2026-10-14T00:00:00Z' });
export const walletSummary = (balance: number | string = '120000', transactions: unknown[] = []) => ({ balance, transactions,
  meta: { page: 1, limit: 20, total: transactions.length, totalPages: transactions.length ? 1 : 0 } });
export function m6Fixture(role: OrderRole = 'customer') {
  const key: OrderSessionKey = { userId: role === 'customer' ? 'customer' : 'tech', role, sessionGeneration: 1, serviceOrderId: 'order' };
  let owner: OrderSessionKey | null = key;
  const disk = new Map<string, string>();
  let storageGate: (() => Promise<void>) | undefined;
  const storage = { getItem: async (name: string) => disk.get(name) ?? null, setItem: async (name: string, raw: string) => { await storageGate?.(); disk.set(name, raw); } };
  const journal = createOrderCommandJournal(storage);
  const server = {
    order: { id: 'order', status: 'UNDER_REPAIR', technician: { id: 'tech' }, customerConfirmed: false,
      completionRequestedAt: role === 'customer' ? '2026-10-14T00:00:00Z' : '', pricingMode: 'fixed_price', fixedUnitPrice: 120000 },
    invoice: { id: 'invoice', serviceOrderId: 'order', paymentStatus: 'unpaid', grandTotal: '120000' } as Record<string, unknown> | null,
    cash: null as Record<string, unknown> | null,
    evidence: [proof()] as Record<string, unknown>[],
    extras: [] as Record<string, unknown>[], quotations: [] as Record<string, unknown>[], parts: [] as Record<string, unknown>[],
    wallet: walletSummary() as unknown, failOrder: false, failResource: '' as string,
  };
  const reads: string[] = [];
  const coordinator = createOrderReadCoordinator({ readOrder: async () => { reads.push('order'); if (server.failOrder) throw Error('offline'); return server.order; },
    readResource: async (_, kind) => { reads.push(kind); if (kind === server.failResource) throw Error('offline'); return kind === 'history' ? [] : server[kind]; } });
  coordinator.activate(key);
  let sequence = 0;
  return { key, server, storage, disk, journal, coordinator, reads,
    runtime: { coordinator, journal, getKey: () => owner, isActive: () => !!owner, newIntentId: () => `m6-${++sequence}`, now: () => 1000 },
    revoke: () => { owner = null; }, renew: () => { owner = { ...key, sessionGeneration: 2 }; },
    deferStorage: (gate: () => Promise<void>) => { storageGate = gate; },
  };
}
export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}
