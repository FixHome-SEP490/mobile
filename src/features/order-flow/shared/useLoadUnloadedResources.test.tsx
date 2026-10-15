import React, { useEffect } from 'react';
import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import { createOrderSessionSnapshot, readyResource, type OrderResourceKind, type OrderSessionSnapshot } from '../domain/order-session.types';
import { useLoadUnloadedResources } from './useLoadUnloadedResources';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

function fixture(): OrderSessionSnapshot {
  const key = { userId: 'customer-1', role: 'customer' as const, sessionGeneration: 1, serviceOrderId: 'order-1' };
  const snapshot = createOrderSessionSnapshot(key);
  snapshot.access = 'current';
  snapshot.order = readyResource({ id: key.serviceOrderId, code: 'SO-1', bookingId: 'b-1', serviceName: 'Repair', status: 'UNDER_REPAIR',
    customerName: 'Customer', customerPhone: '0900', addressSummary: 'Address', scheduledAt: '2026-10-13T00:00:00Z', laborTotal: 0,
    partsTotal: 0, grandTotal: 0, paymentStatus: 'UNPAID', createdAt: '2026-10-12T00:00:00Z' }, 1, 1);
  return snapshot;
}

function Probe({ snapshot, loadResource, refresh }: { snapshot: OrderSessionSnapshot; loadResource: (kind: OrderResourceKind) => Promise<void>; refresh: () => void }) {
  useLoadUnloadedResources(snapshot, ['history'], loadResource);
  useEffect(() => {}, [refresh]);
  return <Text onPress={refresh}>Refresh</Text>;
}

it('does not re-request a deferred resource as snapshots and provider callbacks change through loading and error', async () => {
  const pending = deferred<void>();
  const firstLoad = jest.fn(() => pending.promise);
  const loadingLoad = jest.fn(async () => {});
  const errorLoad = jest.fn(async () => {});
  const initial = fixture();
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<Probe snapshot={initial} loadResource={firstLoad} refresh={jest.fn()} />); });
  expect(firstLoad).toHaveBeenCalledTimes(1);

  const loading = { ...initial, resources: { ...initial.resources, history: { status: 'loading' as const, requestSeq: 2 } } };
  await act(async () => renderer.update(<Probe snapshot={loading} loadResource={loadingLoad} refresh={jest.fn()} />));
  expect(loadingLoad).not.toHaveBeenCalled();

  pending.resolve();
  await act(async () => { await pending.promise; });
  const error = { ...loading, resources: { ...initial.resources, history: { status: 'error' as const, requestSeq: 2, error: 'unavailable' as const } } };
  await act(async () => renderer.update(<Probe snapshot={error} loadResource={errorLoad} refresh={jest.fn()} />));
  expect(errorLoad).not.toHaveBeenCalled();

  const refresh = jest.fn();
  await act(async () => renderer.update(<Probe snapshot={error} loadResource={errorLoad} refresh={refresh} />));
  await act(async () => renderer.root.findByType(Text).props.onPress());
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(firstLoad).toHaveBeenCalledTimes(1);
  await act(async () => renderer.unmount());
});
