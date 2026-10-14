import React from 'react';
import { AppState, View } from 'react-native';
import { createOrderReadCoordinator } from '../runtime/order-read-coordinator';
import { createOrderCommandJournal } from '../runtime/order-command-journal';
import { useTechnicianParts } from './useTechnicianParts';

const mockKey = { userId: 'tech-1', role: 'technician' as const, serviceOrderId: 'order-1', sessionGeneration: 1 };
const mockCoordinator = createOrderReadCoordinator({
  readOrder: async () => ({ id: 'order-1', status: 'ACCEPTED', technician: { id: 'tech-1' } } as any),
  readResource: async () => [],
});
let mockJournal: ReturnType<typeof createOrderCommandJournal>;
let mockFocused = true;

jest.mock('@react-navigation/native', () => ({
  useIsFocused: () => mockFocused,
}));

jest.mock('../runtime/OrderSessionProvider', () => ({
  useOrderSession: () => ({
    key: mockKey,
    coordinator: mockCoordinator,
    journal: mockJournal,
    snapshot: mockCoordinator.getSnapshot(),
  }),
}));

const { act, create } = jest.requireActual('react-test-renderer');

describe('useTechnicianParts', () => {
  beforeEach(async () => {
    Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
    mockJournal = createOrderCommandJournal({
      getItem: async () => null,
      setItem: async () => {},
    });
    await mockJournal.restore();
    mockCoordinator.activate(mockKey);
  });

  it('initializes controller and exposes state', async () => {
    let hookResult: ReturnType<typeof useTechnicianParts> | undefined;

    function Harness() {
      hookResult = useTechnicianParts();
      return <View />;
    }

    let tree: { unmount: () => void };
    await act(async () => {
      tree = create(<Harness />);
    });

    expect(hookResult).toBeDefined();
    expect(hookResult?.state.phase).toBe('idle');
    expect(typeof hookResult?.controller.createPreRepair).toBe('function');
    expect(typeof hookResult?.controller.receiveByQr).toBe('function');
    expect(typeof hookResult?.controller.updateItemUsage).toBe('function');
    expect(typeof hookResult?.controller.cancelPartRequest).toBe('function');

    await act(async () => {
      tree.unmount();
    });
  });
});
