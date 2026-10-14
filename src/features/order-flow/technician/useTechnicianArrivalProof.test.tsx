import React from 'react';
import { AppState, View, type AppStateStatus } from 'react-native';
import { createOrderReadCoordinator } from '../runtime/order-read-coordinator';
import { createOrderCommandJournal } from '../runtime/order-command-journal';
import { createArrivalProofController as mockCreateArrivalProofController, type ArrivalProofController } from './arrival-proof-controller';
import { useTechnicianArrivalProof } from './useTechnicianArrivalProof';
const mockKey = { userId: 'tech', role: 'technician' as const, serviceOrderId: 'order', sessionGeneration: 1 };
const mockCoordinator = createOrderReadCoordinator({ readOrder: async () => ({ id: 'order', status: 'ACCEPTED', technician: { id: 'tech' }, departAvailableAt: '1970-01-01T00:00:00Z' }), readResource: async () => [] });
let mockJournal: ReturnType<typeof createOrderCommandJournal>;
const mockDepart = jest.fn();
const mockStart = jest.fn(), mockStop = jest.fn();
let mockFocused = true;
jest.mock('@react-navigation/native', () => ({ useIsFocused: () => mockFocused }));
jest.mock('../runtime/OrderSessionProvider', () => ({ useOrderSession: () => ({ key: mockKey, coordinator: mockCoordinator, journal: mockJournal, snapshot: mockCoordinator.getSnapshot() }) }));
jest.mock('./arrival-proof-production', () => ({
  createProductionArrivalProofController: (runtime: unknown) => mockCreateArrivalProofController({ ...(runtime as Parameters<typeof mockCreateArrivalProofController>[0]),
    newIntentId: () => 'intent', transport: { depart: mockDepart, checkIn: jest.fn(), uploadFace: jest.fn(), uploadBefore: jest.fn(), recoverRepair: jest.fn(), deleteEvidence: jest.fn() } }),
  createProductionOrderLocationTracker: () => ({ start: mockStart, stop: mockStop }),
}));
const { act, create } = jest.requireActual('react-test-renderer');
it('unmount fences an awaited durable reservation before any POST', async () => {
  Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
  let release!: () => void, saving!: () => void;
  const saved = new Promise<void>(r => { saving = r; });
  let first = true;
  mockJournal = createOrderCommandJournal({ getItem: async () => null, setItem: async () => { if (first) { first = false; saving(); await new Promise<void>(r => { release = r; }); } } });
  mockCoordinator.activate(mockKey); await mockCoordinator.refreshOrderSession(mockKey, 'test');
  let controller!: ArrivalProofController;
  function Harness() { controller = useTechnicianArrivalProof().controller; return <View />; }
  let tree: { unmount: () => void }; await act(async () => { tree = create(<Harness />); });
  let request!: Promise<void>;
  await act(async () => { request = controller.depart(); await saved; });
  await act(async () => tree.unmount()); release(); await request;
  expect(mockDepart).not.toHaveBeenCalled();
});
it('non-Travel EN_ROUTE consumer never starts the native order watcher', async () => {
  mockStart.mockClear();
  const read = createOrderReadCoordinator({ readOrder: async () => ({ id: 'order', status: 'EN_ROUTE', technician: { id: 'tech' } }), readResource: async () => [] });
  read.activate(mockKey); await read.refreshOrderSession(mockKey, 'test');
  // Provider's latest ready EN_ROUTE snapshot; the command hook alone has no B09 ownership.
  jest.spyOn(mockCoordinator, 'getSnapshot').mockImplementation(() => read.getSnapshot());
  function Harness() { useTechnicianArrivalProof(); return <View />; }
  let tree: { unmount: () => void }; await act(async () => { tree = create(<Harness />); });
  expect(mockStart).not.toHaveBeenCalled();
  await act(async () => tree.unmount()); jest.restoreAllMocks();
});
it('Travel starts only while focused in foreground and removes its watcher on blur/background/unmount', async () => {
  mockStart.mockClear(); mockStop.mockClear(); mockFocused = true;
  Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
  const read = createOrderReadCoordinator({ readOrder: async () => ({ id: 'order', status: 'EN_ROUTE', technician: { id: 'tech' } }), readResource: async () => [] });
  read.activate(mockKey); await read.refreshOrderSession(mockKey, 'test');
  jest.spyOn(mockCoordinator, 'getSnapshot').mockImplementation(() => read.getSnapshot());
  let background!: (value: AppStateStatus) => void;
  const remove = jest.fn();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => { background = listener; return { remove }; });
  function Harness() { useTechnicianArrivalProof({ trackLocation: true }); return <View />; }
  let tree: { unmount: () => void; update: (node: React.ReactElement) => void };
  await act(async () => { tree = create(<Harness />); });
  expect(mockStart).toHaveBeenCalledTimes(1);
  await act(async () => background('background'));
  expect(mockStop).toHaveBeenCalled(); expect(mockStart).toHaveBeenCalledTimes(1);
  await act(async () => background('active'));
  expect(mockStart).toHaveBeenCalledTimes(2);
  mockFocused = false;
  await act(async () => tree.update(<Harness />));
  expect(mockStart).toHaveBeenCalledTimes(2);
  await act(async () => tree.unmount()); expect(remove).toHaveBeenCalled();
  mockFocused = true; jest.restoreAllMocks();
});
