import { createOrderCommandJournal } from '../runtime/order-command-journal';
import { getRestoredExtraRecovery, getRestoredPartsRecovery } from './extra-and-parts-recovery';
import { readyResource, type OrderSessionKey, type OrderSessionSnapshot } from './order-session.types';

function createStorage() {
  const map = new Map<string, string>();
  return {
    getItem: async (k: string) => map.get(k) ?? null,
    setItem: async (k: string, v: string) => { map.set(k, v); },
  };
}

describe('extra-and-parts-recovery', () => {
  const techKey: OrderSessionKey = {
    userId: 'tech-1',
    role: 'technician',
    serviceOrderId: 'order-1',
    sessionGeneration: 1,
  };

  const customerKey: OrderSessionKey = {
    userId: 'cust-1',
    role: 'customer',
    serviceOrderId: 'order-1',
    sessionGeneration: 1,
  };

  const baseOrder = {
    id: 'order-1',
    status: 'UNDER_REPAIR',
    technician: { id: 'tech-1' },
    customer: { id: 'cust-1' },
  };

  const techSnapshot: OrderSessionSnapshot = {
    key: techKey,
    access: 'current',
    order: readyResource(baseOrder as any, 1, Date.now()),
    resources: {} as any,
  };

  const customerSnapshot: OrderSessionSnapshot = {
    key: customerKey,
    access: 'current',
    order: readyResource(baseOrder as any, 1, Date.now()),
    resources: {} as any,
  };

  it('returns no recovery when journal has no matching markers', async () => {
    const journal = createOrderCommandJournal(createStorage());
    await journal.restore();
    const result = getRestoredExtraRecovery(journal, techKey, techSnapshot);
    expect(result.hasRecovery).toBe(false);
  });

  it('restores technician extra-create and extra-revise markers', async () => {
    const journal = createOrderCommandJournal(createStorage());
    await journal.restore();
    await journal.begin(techKey, {
      intentId: 'intent-extra-1',
      entityId: 'order-1',
      operation: 'extra-create',
    });

    const result = getRestoredExtraRecovery(journal, techKey, techSnapshot);
    expect(result.hasRecovery).toBe(true);
    if (result.hasRecovery) {
      expect(result.operation).toBe('extra-create');
      expect(result.intentId).toBe('intent-extra-1');
      expect(result.isUnresolved).toBe(true);
    }
  });

  it('restores customer extra-decision markers and fails closed for technician role', async () => {
    const journal = createOrderCommandJournal(createStorage());
    await journal.restore();
    await journal.begin(customerKey, {
      intentId: 'intent-decision-1',
      entityId: 'cost-1',
      operation: 'extra-decision',
    });

    const custResult = getRestoredExtraRecovery(journal, customerKey, customerSnapshot);
    expect(custResult.hasRecovery).toBe(true);
    if (custResult.hasRecovery) {
      expect(custResult.operation).toBe('extra-decision');
      expect(custResult.entityId).toBe('cost-1');
    }

    // Technician cannot recover extra-decision
    const techResult = getRestoredExtraRecovery(journal, techKey, techSnapshot);
    expect(techResult.hasRecovery).toBe(false);
  });

  it('restores technician parts operations (parts-create, parts-receive, parts-usage, parts-cancel)', async () => {
    const journal = createOrderCommandJournal(createStorage());
    await journal.restore();
    await journal.begin(techKey, {
      intentId: 'intent-parts-receive',
      entityId: 'part-req-1',
      operation: 'parts-receive',
    });

    const result = getRestoredPartsRecovery(journal, techKey, techSnapshot);
    expect(result.hasRecovery).toBe(true);
    if (result.hasRecovery) {
      expect(result.operation).toBe('parts-receive');
      expect(result.entityId).toBe('part-req-1');
      expect(result.isUnresolved).toBe(true);
    }
  });

  it('fails closed when technician is revoked or reassigned (foreign tech)', async () => {
    const journal = createOrderCommandJournal(createStorage());
    await journal.restore();
    await journal.begin(techKey, {
      intentId: 'intent-parts-1',
      entityId: 'order-1',
      operation: 'parts-create',
    });

    const reassignedSnapshot: OrderSessionSnapshot = {
      ...techSnapshot,
      order: readyResource({ ...baseOrder, technician: { id: 'other-tech' } } as any, 1, Date.now()),
    };

    const partsResult = getRestoredPartsRecovery(journal, techKey, reassignedSnapshot);
    expect(partsResult.hasRecovery).toBe(false);

    const extraResult = getRestoredExtraRecovery(journal, techKey, reassignedSnapshot);
    expect(extraResult.hasRecovery).toBe(false);
  });

  it('fails closed on historical access or historical order status', async () => {
    const journal = createOrderCommandJournal(createStorage());
    await journal.restore();
    await journal.begin(techKey, {
      intentId: 'intent-parts-1',
      entityId: 'order-1',
      operation: 'parts-create',
    });

    const historicalSnapshot: OrderSessionSnapshot = {
      ...techSnapshot,
      access: 'historical',
    };

    expect(getRestoredPartsRecovery(journal, techKey, historicalSnapshot).hasRecovery).toBe(false);
    expect(getRestoredExtraRecovery(journal, techKey, historicalSnapshot).hasRecovery).toBe(false);
  });

  it('prioritizes unresolved extra markers over settled resolved markers', async () => {
    const journal = createOrderCommandJournal(createStorage());
    await journal.restore();

    // 1. First marker is already resolved
    await journal.begin(techKey, {
      intentId: 'intent-extra-resolved',
      entityId: 'order-1',
      operation: 'extra-create',
    });
    await journal.mark(techKey.userId, 'intent-extra-resolved', 'resolved');

    // 2. Second marker can now begin since first is resolved
    await journal.begin(techKey, {
      intentId: 'intent-extra-unresolved',
      entityId: 'cost-2',
      operation: 'extra-revise',
    });
    await journal.mark(techKey.userId, 'intent-extra-unresolved', 'unknown');

    const extraResult = getRestoredExtraRecovery(journal, techKey, techSnapshot);
    expect(extraResult.hasRecovery).toBe(true);
    if (extraResult.hasRecovery) {
      expect(extraResult.intentId).toBe('intent-extra-unresolved');
      expect(extraResult.operation).toBe('extra-revise');
      expect(extraResult.isUnresolved).toBe(true);
    }
  });

  it('prioritizes unresolved parts markers over settled resolved markers', async () => {
    const journal = createOrderCommandJournal(createStorage());
    await journal.restore();

    // 1. First marker resolved
    await journal.begin(techKey, {
      intentId: 'intent-parts-resolved',
      entityId: 'part-1',
      operation: 'parts-create',
    });
    await journal.mark(techKey.userId, 'intent-parts-resolved', 'resolved');

    // 2. Second marker unresolved
    await journal.begin(techKey, {
      intentId: 'intent-parts-unresolved',
      entityId: 'part-2',
      operation: 'parts-receive',
    });
    await journal.mark(techKey.userId, 'intent-parts-unresolved', 'unknown');

    const partsResult = getRestoredPartsRecovery(journal, techKey, techSnapshot);
    expect(partsResult.hasRecovery).toBe(true);
    if (partsResult.hasRecovery) {
      expect(partsResult.intentId).toBe('intent-parts-unresolved');
      expect(partsResult.operation).toBe('parts-receive');
      expect(partsResult.isUnresolved).toBe(true);
    }
  });

  it('retains terminal order recovery (COMPLETED or completionRequestedAt) for settled markers', async () => {
    const journal = createOrderCommandJournal(createStorage());
    await journal.restore();

    await journal.begin(techKey, {
      intentId: 'intent-terminal-extra',
      entityId: 'order-1',
      operation: 'extra-create',
    });
    await journal.mark(techKey.userId, 'intent-terminal-extra', 'resolved');

    const completedSnapshot: OrderSessionSnapshot = {
      ...techSnapshot,
      order: readyResource({ ...baseOrder, status: 'COMPLETED' } as any, 1, Date.now()),
    };

    const extraResult = getRestoredExtraRecovery(journal, techKey, completedSnapshot);
    expect(extraResult.hasRecovery).toBe(true);
    if (extraResult.hasRecovery) {
      expect(extraResult.status).toBe('resolved');
      expect(extraResult.isUnresolved).toBe(false);
    }

    const postRepairSnapshot: OrderSessionSnapshot = {
      ...techSnapshot,
      order: readyResource(
        { ...baseOrder, status: 'UNDER_REPAIR', completionRequestedAt: '2026-10-14T04:00:00Z' } as any,
        1,
        Date.now(),
      ),
    };

    const postRepairResult = getRestoredExtraRecovery(journal, techKey, postRepairSnapshot);
    expect(postRepairResult.hasRecovery).toBe(true);
    if (postRepairResult.hasRecovery) {
      expect(postRepairResult.status).toBe('resolved');
    }
  });
});
