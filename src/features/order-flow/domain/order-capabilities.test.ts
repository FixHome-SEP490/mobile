import { getOrderCapabilities, matchesDecisionTarget } from './order-capabilities';
import { createOrderSessionSnapshot, readyResource } from './order-session.types';
import type { ServiceOrderItem } from '../../../api/orders.api';
it('does not enable recovery or completion from aggregate counters/missing resources', () => {
  const s = createOrderSessionSnapshot({ userId: 'tech', role: 'technician', sessionGeneration: 1, serviceOrderId: 'o' });
  s.access = 'current'; s.order = readyResource({ id: 'o', status: 'EN_ROUTE', technician: { id: 'tech' }, arrivalVerified: true, pricingMode: 'fixed_price', fixedUnitPrice: 100, beforeEvidenceCount: 99 } as ServiceOrderItem, 1, 1);
  expect(getOrderCapabilities(s)).toMatchObject({ canRecoverRepair: false, canRequestCompletion: false });
});
it('fresh own proof + attested thresholds + fixed price + no pending proposals/parts allows explicit recovery only', () => {
  const s = createOrderSessionSnapshot({ userId: 'tech', role: 'technician', sessionGeneration: 1, serviceOrderId: 'o' });
  s.access = 'current'; s.order = readyResource({ id: 'o', status: 'EN_ROUTE', technician: { id: 'tech' }, arrivalVerified: true, pricingMode: 'fixed_price', fixedUnitPrice: 100 } as ServiceOrderItem, 1, 1);
  s.proofPolicy = { beforeMinimum: 1, afterMinimum: 1 };
  s.resources.evidence = readyResource(['CHECKIN_FACE', 'BEFORE'].map((type, i) => ({ id: String(i), serviceOrderId: 'o', uploaderId: 'tech', type: type as 'BEFORE' | 'CHECKIN_FACE', mediaUrl: 'https://example.test', createdAt: '' })), 1, 1);
  s.resources.extras = readyResource([], 1, 1); s.resources.parts = readyResource([], 1, 1);
  expect(getOrderCapabilities(s).canRecoverRepair).toBe(true);
  s.resources.parts = { status: 'unloaded', requestSeq: 0 };
  expect(getOrderCapabilities(s).canRecoverRepair).toBe(true);
  expect(getOrderCapabilities(s).canAttemptRequestCompletion).toBe(false);
  s.pendingIntent = true; expect(getOrderCapabilities(s).canRecoverRepair).toBe(false);
});
it('decision targeting compares exact entity and version and fails when either changed', () => {
  expect(matchesDecisionTarget({ id: 'new', version: 2 }, { id: 'old', version: 1 })).toBe(false);
  expect(matchesDecisionTarget({ id: 'new', version: 2 }, { id: 'new', version: 1 })).toBe(false);
  expect(matchesDecisionTarget({ id: 'new', version: 2 }, { id: 'new', version: 2 })).toBe(true);
});
it('outgoing holder requests do not block current technician completion; own unresolved parts do', () => {
  const s = createOrderSessionSnapshot({ userId: 'tech', role: 'technician', sessionGeneration: 1, serviceOrderId: 'o' });
  s.access = 'current'; s.order = readyResource({ id: 'o', status: 'UNDER_REPAIR', technician: { id: 'tech' }, pricingMode: 'fixed_price', fixedUnitPrice: 100 } as ServiceOrderItem, 1, 1);
  s.proofPolicy = { beforeMinimum: 1, afterMinimum: 1 };
  s.resources.evidence = readyResource([{ id: 'after', serviceOrderId: 'o', uploaderId: 'tech', type: 'AFTER', mediaUrl: '', createdAt: '' }], 1, 1);
  s.resources.extras = readyResource([], 1, 1);
  const part = { id: 'p', serviceOrderId: 'o', technicianId: 'old-tech', requestType: 'pre_repair' as const, fulfillmentMethod: 'pickup' as const, status: 'received' as const, shippingFee: 0, createdAt: '', updatedAt: '', items: [] };
  s.resources.parts = readyResource([part], 1, 1);
  expect(getOrderCapabilities(s).canRequestCompletion).toBe(true);
  s.resources.parts = readyResource([{ ...part, technicianId: 'tech', status: 'delivering' }], 1, 1);
  expect(getOrderCapabilities(s).canRequestCompletion).toBe(false);
});
it('unknown minimum permits explicit server-validating completion attempt without claiming readiness', () => {
  const s = createOrderSessionSnapshot({ userId: 'tech', role: 'technician', sessionGeneration: 1, serviceOrderId: 'o' });
  s.access = 'current'; s.order = readyResource({ id: 'o', status: 'UNDER_REPAIR', technician: { id: 'tech' }, pricingMode: 'fixed_price', fixedUnitPrice: 100 } as ServiceOrderItem, 1, 1);
  s.resources.evidence = readyResource([{ id: 'after', serviceOrderId: 'o', uploaderId: 'tech', type: 'AFTER', mediaUrl: '', createdAt: '' }], 1, 1);
  s.resources.extras = readyResource([], 1, 1); s.resources.parts = readyResource([], 1, 1);
  expect(getOrderCapabilities(s)).toMatchObject({ canRequestCompletion: false, canAttemptRequestCompletion: true });
  s.proofPolicy = { beforeMinimum: 1, afterMinimum: 2 };
  expect(getOrderCapabilities(s).canAttemptRequestCompletion).toBe(false);
  s.proofPolicy = undefined; s.resources.parts = { status: 'unloaded', requestSeq: 0 };
  expect(getOrderCapabilities(s).canAttemptRequestCompletion).toBe(false);
});
it('unsupported extra status blocks both completion proof and server-validating attempt', () => {
  const s = createOrderSessionSnapshot({ userId: 'tech', role: 'technician', sessionGeneration: 1, serviceOrderId: 'o' });
  s.access = 'current'; s.order = readyResource({ id: 'o', status: 'UNDER_REPAIR', technician: { id: 'tech' }, pricingMode: 'fixed_price', fixedUnitPrice: 100 } as ServiceOrderItem, 1, 1);
  s.proofPolicy = { beforeMinimum: 1, afterMinimum: 1 };
  s.resources.evidence = readyResource([{ id: 'after', serviceOrderId: 'o', uploaderId: 'tech', type: 'AFTER', mediaUrl: '', createdAt: '' }], 1, 1);
  s.resources.parts = readyResource([], 1, 1);
  s.resources.extras = readyResource([{ id: 'extra', serviceOrderId: 'o', status: 'pending', reason: '', totalLaborDelta: 0, totalPartsDelta: 0, createdAt: '', items: [] }], 1, 1);
  expect(getOrderCapabilities(s)).toMatchObject({ canRequestCompletion: false, canAttemptRequestCompletion: false });
});
