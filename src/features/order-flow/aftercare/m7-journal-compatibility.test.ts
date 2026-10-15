import { createEntryAttemptJournal } from '../runtime/entry-attempt-journal';
import { createOrderCommandJournal } from '../runtime/order-command-journal';
const memory = () => { const disk = new Map<string, string>(); return { disk, storage: { getItem: async (k: string) => disk.get(k) ?? null, setItem: async (k: string, v: string) => { disk.set(k, v); } } }; };
it('M7 additions preserve old booking/invitation and financial markers across restart', async () => {
  const m = memory(), entry = createEntryAttemptJournal(m.storage), order = createOrderCommandJournal(m.storage); await entry.restore(); await order.restore();
  await entry.begin({ kind: 'booking-create', ownerUserId: 'customer', intentId: 'old-booking', createdAt: 1, baselineIds: null });
  await entry.begin({ kind: 'invitation', ownerUserId: 'tech', intentId: 'old-invitation', createdAt: 2, invitationId: 'inv', bookingId: 'booking', action: 'ACCEPT' });
  await order.begin({ userId: 'customer', role: 'customer', sessionGeneration: 1, serviceOrderId: 'order' }, { operation: 'wallet-pay', intentId: 'old-payment', entityId: 'invoice' });
  const e = createEntryAttemptJournal(m.storage), o = createOrderCommandJournal(m.storage); await e.restore(); await o.restore();
  expect(e.list('tech')[0]).toMatchObject({ kind: 'invitation', invitationId: 'inv', action: 'ACCEPT' }); expect(o.list('customer')[0]).toMatchObject({ operation: 'wallet-pay', status: 'unknown' });
});
it('support entry markers scope booking/order and role without fake serviceOrderId or payload persistence', async () => {
  const m = memory(), j = createEntryAttemptJournal(m.storage); await j.restore();
  expect(await j.begin({ kind: 'support-create', role: 'customer', contextKind: 'booking', contextId: 'booking', ownerUserId: 'customer', intentId: 'support', createdAt: 1 })).toBe(true);
  expect(j.blocked('customer', 'support-create', 'booking', 'customer')).toBe(true);
  expect(j.blocked('customer', 'support-create', 'other-booking', 'customer')).toBe(false);
  expect(await j.begin({ kind: 'support-create', role: 'customer', contextKind: 'booking', contextId: 'booking', ownerUserId: 'customer', intentId: 'duplicate', createdAt: 2 })).toBe(false);
  await j.recordId('customer', 'support', 'case'); const restarted = createEntryAttemptJournal(m.storage); await restarted.restore(); expect(restarted.list('customer')[0].confirmedId).toBe('case');
  expect([...m.disk.values()].join('')).not.toContain('serviceOrderId');
});
it('warranty marker holds exact claim/visit and locks competing operations while other claims remain independent', async () => {
  const m = memory(), j = createEntryAttemptJournal(m.storage); await j.restore();
  expect(await j.begin({ kind: 'warranty-command', operation: 'check-in', claimId: 'claim', expectedVisitId: 'visit', ownerUserId: 'tech', intentId: 'check', createdAt: 1 })).toBe(true);
  expect(await j.begin({ kind: 'warranty-command', operation: 'propose', claimId: 'claim', ownerUserId: 'tech', intentId: 'proposal', createdAt: 2 })).toBe(false);
  expect(j.blocked('tech', 'warranty-command', 'other-claim')).toBe(false);
  const restarted = createEntryAttemptJournal(m.storage); await restarted.restore(); expect(restarted.list('tech')[0]).toMatchObject({ operation: 'check-in', expectedVisitId: 'visit' });
});
it.each(['order-cancel', 'warranty-respond-agree', 'warranty-respond-dispute'] as const)('explicit M7 order operation %s restores without weakening existing locks', async operation => {
  const m = memory(), j = createOrderCommandJournal(m.storage); await j.restore();
  await j.begin({ userId: 'customer', role: 'customer', sessionGeneration: 1, serviceOrderId: 'order' }, { operation, intentId: 'intent', entityId: 'claim' });
  const restarted = createOrderCommandJournal(m.storage); await restarted.restore(); expect(restarted.list('customer')[0]).toMatchObject({ operation, status: 'unknown' });
});
it('restored IDs-only M7 locks never cross users/roles/contexts or persist private DTO content', async () => {
  const m = memory(), j = createEntryAttemptJournal(m.storage); await j.restore();
  await j.begin({ kind: 'support-create', role: 'customer', contextKind: 'order', contextId: 'order', ownerUserId: 'customer', intentId: 'support', createdAt: 1, reason: 'PRIVATE', evidenceRefs: ['PRIVATE'] } as never);
  const restored = createEntryAttemptJournal(m.storage); await restored.restore(); expect(restored.blocked('other', 'support-create', 'order', 'customer')).toBe(false); expect(restored.blocked('customer', 'support-create', 'order', 'technician')).toBe(false);
  expect([...m.disk.values()].join('')).not.toContain('PRIVATE');
});
