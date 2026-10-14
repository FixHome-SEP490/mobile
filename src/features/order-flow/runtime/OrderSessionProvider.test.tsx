import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { OrderSessionProvider, useOrderSession } from './OrderSessionProvider';
import { createOrderReadCoordinator } from './order-read-coordinator';
import { createOrderCommandJournal } from './order-command-journal';
import { useAuthStore } from '../../../store/auth.store';
import { UserRole } from '../../../types/auth.types';
jest.mock('@react-native-async-storage/async-storage', () => ({ __esModule: true, default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) } }));
const user = { id: 'customer', role: UserRole.CUSTOMER, email: 'fixture@example.test', fullName: 'Fixture' };
afterEach(() => { useAuthStore.getState().logout(); });
it('derives session from auth, shares one reader and purges on logout', async () => {
  useAuthStore.getState().setAuth('fixture', user);
  let reads = 0;
  const coordinator = createOrderReadCoordinator({ readOrder: async () => { reads++; return { id: 'o', status: 'ACCEPTED' }; }, readResource: async () => [] });
  const journal = createOrderCommandJournal({ getItem: async () => null, setItem: async () => undefined });
  let seen: ReturnType<typeof useOrderSession> | null = null;
  function Child() { seen = useOrderSession(); return null; }
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => { renderer = TestRenderer.create(<OrderSessionProvider serviceOrderId="o" coordinator={coordinator} journal={journal}><Child /><Child /></OrderSessionProvider>); });
  expect(reads).toBe(1); expect(coordinator.getSnapshot()?.key.userId).toBe('customer');
  await act(async () => { useAuthStore.getState().logout(); });
  expect(coordinator.getSnapshot()).toBeNull(); expect(seen!.snapshot).toBeNull();
  act(() => renderer.unmount());
});
it('restored unresolved marker blocks new writes before session becomes ready', async () => {
  useAuthStore.getState().setAuth('fixture', user);
  const marker = { userId: 'customer', role: 'customer', serviceOrderId: 'o', entityId: 'invoice', intentId: 'intent', operation: 'vnpay-url', dispatchedAt: 1, status: 'submitting' };
  const journal = createOrderCommandJournal({ getItem: async () => JSON.stringify([marker]), setItem: async () => undefined });
  const coordinator = createOrderReadCoordinator({ readOrder: async () => ({ id: 'o', status: 'UNDER_REPAIR', completionRequestedAt: 'fixture' }), readResource: async () => [] });
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => { renderer = TestRenderer.create(<OrderSessionProvider serviceOrderId="o" coordinator={coordinator} journal={journal}>{null}</OrderSessionProvider>); });
  expect(coordinator.getSnapshot()?.pendingIntent).toBe(true);
  act(() => renderer.unmount());
});
