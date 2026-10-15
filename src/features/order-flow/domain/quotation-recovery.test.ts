import { getRestoredQuotationRecovery } from './quotation-recovery';
import { createOrderCommandJournal } from '../runtime/order-command-journal';
import type { OrderSessionKey, OrderSessionSnapshot } from './order-session.types';
import { createOrderSessionSnapshot, readyResource } from './order-session.types';

function createMemoryStorage(initialData?: string) {
  let store: string | null = initialData ?? null;
  return {
    async getItem() {
      return store;
    },
    async setItem(_k: string, v: string) {
      store = v;
    },
  };
}

describe('getRestoredQuotationRecovery', () => {
  it('detects technician quote-create recovery on cold restart with pending marker', async () => {
    const key: OrderSessionKey = { userId: 'tech-1', role: 'technician', sessionGeneration: 1, serviceOrderId: 'order-1' };
    const snapshot: OrderSessionSnapshot = createOrderSessionSnapshot(key);
    snapshot.access = 'current';
    snapshot.pendingIntent = true;
    snapshot.order = readyResource({ id: 'order-1', status: 'EN_ROUTE', pricingMode: 'INSPECTION_REQUIRED', technician: { id: 'tech-1' } } as any, 1, 1);

    // Simulate journal restored from storage with an unknown quote-create marker
    const storageData = JSON.stringify([
      {
        userId: 'tech-1',
        role: 'technician',
        serviceOrderId: 'order-1',
        intentId: 'intent-create-1',
        entityId: 'order-1',
        resultEntityId: 'quote-created-99',
        operation: 'quote-create',
        dispatchedAt: Date.now() - 5000,
        status: 'submitting', // restored as unknown
      },
    ]);
    const journal = createOrderCommandJournal(createMemoryStorage(storageData));
    await journal.restore();

    const recovery = getRestoredQuotationRecovery(journal, key, snapshot);
    expect(recovery.hasRecovery).toBe(true);
    if (recovery.hasRecovery) {
      expect(recovery.operation).toBe('quote-create');
      expect(recovery.intentId).toBe('intent-create-1');
      expect(recovery.targetQuoteId).toBe('quote-created-99');
      expect(recovery.isUnresolved).toBe(true);
    }
  });

  it('detects customer quote-decision recovery even when resolver defaults to CX', async () => {
    const key: OrderSessionKey = { userId: 'cust-1', role: 'customer', sessionGeneration: 1, serviceOrderId: 'order-1' };
    const snapshot: OrderSessionSnapshot = createOrderSessionSnapshot(key);
    snapshot.access = 'current';
    snapshot.pendingIntent = true;
    snapshot.order = readyResource({ id: 'order-1', status: 'EN_ROUTE', pricingMode: 'INSPECTION_REQUIRED', technician: { id: 'tech-1' } } as any, 1, 1);

    const storageData = JSON.stringify([
      {
        userId: 'cust-1',
        role: 'customer',
        serviceOrderId: 'order-1',
        intentId: 'intent-decide-1',
        entityId: 'quote-target-123',
        operation: 'quote-decision',
        dispatchedAt: Date.now() - 10000,
        status: 'unknown',
      },
    ]);
    const journal = createOrderCommandJournal(createMemoryStorage(storageData));
    await journal.restore();

    const recovery = getRestoredQuotationRecovery(journal, key, snapshot);
    expect(recovery.hasRecovery).toBe(true);
    if (recovery.hasRecovery) {
      expect(recovery.operation).toBe('quote-decision');
      expect(recovery.targetQuoteId).toBe('quote-target-123');
      expect(recovery.isUnresolved).toBe(true);
    }
  });

  it('handles lost-ID quote-create without guessing or correlating', async () => {
    const key: OrderSessionKey = { userId: 'tech-1', role: 'technician', sessionGeneration: 1, serviceOrderId: 'order-1' };
    const snapshot: OrderSessionSnapshot = createOrderSessionSnapshot(key);
    snapshot.access = 'current';
    snapshot.order = readyResource({ id: 'order-1', status: 'EN_ROUTE', pricingMode: 'INSPECTION_REQUIRED', technician: { id: 'tech-1' } } as any, 1, 1);

    const storageData = JSON.stringify([
      {
        userId: 'tech-1',
        role: 'technician',
        serviceOrderId: 'order-1',
        intentId: 'intent-lost-id',
        entityId: 'order-1',
        operation: 'quote-create',
        dispatchedAt: Date.now(),
        status: 'unknown',
      },
    ]);
    const journal = createOrderCommandJournal(createMemoryStorage(storageData));
    await journal.restore();

    const recovery = getRestoredQuotationRecovery(journal, key, snapshot);
    expect(recovery.hasRecovery).toBe(true);
    if (recovery.hasRecovery) {
      expect(recovery.targetQuoteId).toBeUndefined();
      expect(recovery.resultEntityId).toBeUndefined();
      expect(recovery.isUnresolved).toBe(true);
    }
  });

  it('fails closed on revoked access or role mismatch', async () => {
    const key: OrderSessionKey = { userId: 'cust-1', role: 'customer', sessionGeneration: 1, serviceOrderId: 'order-1' };
    const snapshot: OrderSessionSnapshot = createOrderSessionSnapshot(key);
    snapshot.access = 'revoked'; // Revoked access
    snapshot.order = readyResource({ id: 'order-1', status: 'EN_ROUTE', pricingMode: 'INSPECTION_REQUIRED', technician: { id: 'tech-1' } } as any, 1, 1);

    const storageData = JSON.stringify([
      {
        userId: 'cust-1',
        role: 'customer',
        serviceOrderId: 'order-1',
        intentId: 'intent-1',
        entityId: 'q-1',
        operation: 'quote-decision',
        dispatchedAt: Date.now(),
        status: 'unknown',
      },
    ]);
    const journal = createOrderCommandJournal(createMemoryStorage(storageData));
    await journal.restore();

    // Revoked -> no recovery
    expect(getRestoredQuotationRecovery(journal, key, snapshot).hasRecovery).toBe(false);

    // Role mismatch: technician key trying to access customer snapshot
    snapshot.access = 'current';
    const techKey: OrderSessionKey = { userId: 'cust-1', role: 'technician', sessionGeneration: 1, serviceOrderId: 'order-1' };
    expect(getRestoredQuotationRecovery(journal, techKey, snapshot).hasRecovery).toBe(false);
  });

  it('fails closed on fixed-price order or foreign quotation holder', async () => {
    const key: OrderSessionKey = { userId: 'cust-1', role: 'customer', sessionGeneration: 1, serviceOrderId: 'order-1' };
    const snapshot: OrderSessionSnapshot = createOrderSessionSnapshot(key);
    snapshot.access = 'current';
    // Fixed price order
    snapshot.order = readyResource({ id: 'order-1', status: 'EN_ROUTE', pricingMode: 'FIXED_PRICE', technician: { id: 'tech-1' } } as any, 1, 1);

    const storageData = JSON.stringify([
      {
        userId: 'cust-1',
        role: 'customer',
        serviceOrderId: 'order-1',
        intentId: 'intent-1',
        entityId: 'q-1',
        operation: 'quote-decision',
        dispatchedAt: Date.now(),
        status: 'unknown',
      },
    ]);
    const journal = createOrderCommandJournal(createMemoryStorage(storageData));
    await journal.restore();

    expect(getRestoredQuotationRecovery(journal, key, snapshot).hasRecovery).toBe(false);

    // Inspection required but target quote belongs to a foreign technician
    snapshot.order = readyResource({ id: 'order-1', status: 'EN_ROUTE', pricingMode: 'INSPECTION_REQUIRED', technician: { id: 'tech-1' } } as any, 1, 1);
    snapshot.resources.quotations = readyResource(
      [{ id: 'q-1', serviceOrderId: 'order-1', technicianId: 'tech-foreign', status: 'SENT', version: 1, items: [] }] as any,
      1,
      1,
    );
    expect(getRestoredQuotationRecovery(journal, key, snapshot).hasRecovery).toBe(false);
  });

  it('fails closed on sessionGeneration mismatch (full key compare)', async () => {
    const key: OrderSessionKey = { userId: 'cust-1', role: 'customer', sessionGeneration: 1, serviceOrderId: 'order-1' };
    const snapshot: OrderSessionSnapshot = createOrderSessionSnapshot(key);
    snapshot.access = 'current';
    snapshot.order = readyResource({ id: 'order-1', status: 'EN_ROUTE', pricingMode: 'INSPECTION_REQUIRED', technician: { id: 'tech-1' } } as any, 1, 1);
    snapshot.key.sessionGeneration = 2;

    const storageData = JSON.stringify([
      {
        userId: 'cust-1',
        role: 'customer',
        serviceOrderId: 'order-1',
        intentId: 'intent-1',
        entityId: 'q-1',
        operation: 'quote-decision',
        dispatchedAt: Date.now(),
        status: 'unknown',
      },
    ]);
    const journal = createOrderCommandJournal(createMemoryStorage(storageData));
    await journal.restore();

    expect(getRestoredQuotationRecovery(journal, key, snapshot).hasRecovery).toBe(false);
  });
});
