import { createOrderSessionSnapshot, readyResource } from '../domain/order-session.types';
import type { OrderSessionSnapshot } from '../domain/order-session.types';
import { StackRouter } from '@react-navigation/routers';
import { requiredTaskResources } from './order-flow-navigation';

function snapshotFor(role: 'customer' | 'technician', status: string, completionRequestedAt?: string): OrderSessionSnapshot {
  const key = { userId: 'user-1', role, sessionGeneration: 1, serviceOrderId: 'order-1' };
  const snapshot = createOrderSessionSnapshot(key);
  snapshot.access = 'current';
  snapshot.order = readyResource({
    id: 'order-1', code: 'SO-1', bookingId: 'booking-1', serviceName: 'Sửa máy lạnh', status,
    customerName: 'Khách hàng', customerPhone: '0900', addressSummary: 'Địa chỉ',
    scheduledAt: '2026-10-13T02:00:00.000Z', laborTotal: 0, partsTotal: 0, grandTotal: 0,
    paymentStatus: 'UNPAID', createdAt: '2026-10-13T00:00:00.000Z',
    ...(completionRequestedAt ? { completionRequestedAt } : {}),
    technician: { id: 'user-1', fullName: 'Thợ', phoneNumber: '0900', averageRating: null },
  } as any, 1, 1);
  return snapshot;
}

it('M6 handover loads invoice, cash and after-evidence for the customer', () => {
  expect(requiredTaskResources(snapshotFor('customer', 'UNDER_REPAIR', '2026-10-13T01:00:00.000Z')))
    .toEqual(['invoice', 'cash', 'evidence']);
});

it('M6 payment waiting loads invoice and cash for the technician', () => {
  expect(requiredTaskResources(snapshotFor('technician', 'UNDER_REPAIR', '2026-10-13T01:00:00.000Z')))
    .toEqual(['invoice', 'cash']);
});

it('pre-handover repair keeps the existing extras-only read', () => {
  expect(requiredTaskResources(snapshotFor('customer', 'UNDER_REPAIR'))).toEqual(['extras']);
  expect(requiredTaskResources(snapshotFor('technician', 'UNDER_REPAIR'))).toEqual(['extras']);
});

describe('after-evidence proposal return against the installed stack router', () => {
  const router = (StackRouter as unknown as (options: object) => {
    getStateForAction: (state: unknown, action: unknown, options: unknown) => any;
  })({});
  const options = {
    routeNames: ['ExtraProposal', 'AfterEvidence', 'CompletionRequest'],
    routeParamList: { ExtraProposal: undefined, AfterEvidence: undefined, CompletionRequest: undefined },
    routeGetIdList: {},
  };
  function stackedState() {
    return {
      key: 'stack-m6-test',
      index: 1,
      routeNames: options.routeNames,
      preloadedRoutes: [],
      stale: false as const,
      routes: [
        { key: 'extra-parent-key', name: 'ExtraProposal', params: { proposalId: 'extra-1', costId: 'cost-1' } },
        { key: 'after-key', name: 'AfterEvidence', params: { fromProposal: true, proposalId: 'extra-1' } },
      ],
    };
  }

  it('plain two-arg navigate pushes a new route and orphans the parent draft', () => {
    const next = router.getStateForAction(stackedState(),
      { type: 'NAVIGATE', payload: { name: 'ExtraProposal', params: { capturedAfter: true } } }, options);
    expect(next.routes.length).toBe(3);
    expect(next.routes[2].key).not.toBe('extra-parent-key');
  });

  it('pop+merge return keeps the parent key, preserves ids and merges the refresh signal', () => {
    // Exact action shape dispatched by AfterEvidenceScreen.returnToProposal.
    const next = router.getStateForAction(stackedState(),
      { type: 'NAVIGATE', payload: { name: 'ExtraProposal', params: { proposalId: 'extra-1', capturedAfter: true }, merge: true, pop: true } }, options);
    expect(next.routes.length).toBe(1);
    expect(next.index).toBe(0);
    expect(next.routes[0].key).toBe('extra-parent-key');
    expect(next.routes[0].params).toMatchObject({ proposalId: 'extra-1', costId: 'cost-1', capturedAfter: true });
  });
});
