import React from 'react';
import { act, create } from 'react-test-renderer';
import type { OrderSessionSnapshot } from '../domain/order-session.types';
import { createOrderSessionSnapshot, readyResource } from '../domain/order-session.types';
import TechnicianOrderHub from './TechnicianOrderHub';

let mockSnapshot: OrderSessionSnapshot;
const mockNavigate = jest.fn();
const mockLoadResource = jest.fn();

jest.mock('../runtime/OrderSessionProvider', () => ({
  useOrderSession: () => ({ key: mockSnapshot.key, snapshot: mockSnapshot, loadResource: mockLoadResource }),
}));
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: mockNavigate }) }));

function snapshotWith(status: string, parts: unknown[]): OrderSessionSnapshot {
  const key = { userId: 'tech-1', role: 'technician' as const, sessionGeneration: 1, serviceOrderId: 'order-1' };
  const snapshot = createOrderSessionSnapshot(key);
  snapshot.access = 'current';
  snapshot.order = readyResource({ id: 'order-1', status, technician: { id: 'tech-1' } } as never, 1, 1);
  snapshot.resources.parts = readyResource(parts as never, 1, 1);
  return snapshot;
}
const part = (fulfillmentMethod: string, status: string) => ({ id: `${fulfillmentMethod}-${status}`, serviceOrderId: 'order-1', technicianId: 'tech-1', fulfillmentMethod, status });
const render = async () => { let r!: ReturnType<typeof create>; await act(async () => { r = create(<TechnicianOrderHub />); }); return r; };

beforeEach(() => mockNavigate.mockClear());

it('counts only parts the technician can receive now and opens the parts screen', async () => {
  mockSnapshot = snapshotWith('EN_ROUTE', [part('delivery', 'delivering'), part('pickup', 'ready'), part('pickup', 'requested'), part('delivery', 'received')]);
  const r = await render();
  expect(JSON.stringify(r.toJSON())).toMatch(/2 chờ nhận/);
  await act(async () => r.root.findByProps({ testID: 'task-link-PartsLifecycle' }).props.onPress());
  expect(mockNavigate).toHaveBeenCalledWith('PartsLifecycle');
});

it('shows repair-only shortcuts only while under repair', async () => {
  mockSnapshot = snapshotWith('EN_ROUTE', []);
  expect((await render()).root.findAllByProps({ testID: 'task-link-AfterEvidence' })).toHaveLength(0);
  mockSnapshot = snapshotWith('UNDER_REPAIR', []);
  expect((await render()).root.findAllByProps({ testID: 'task-link-AfterEvidence' }).length).toBeGreaterThan(0);
});

it('disables every shortcut when access is revoked', async () => {
  mockSnapshot = snapshotWith('EN_ROUTE', []);
  mockSnapshot.access = 'revoked';
  const r = await render();
  const link = r.root.findByProps({ testID: 'task-link-ScopeDetail' });
  expect(link.props.disabled).toBe(true);
  await act(async () => link.props.onPress?.());
  expect(mockNavigate).not.toHaveBeenCalled();
});
