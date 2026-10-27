import React from 'react';
import { Image } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { OrderSessionSnapshot } from '../domain/order-session.types';
import { createOrderSessionSnapshot, readyResource } from '../domain/order-session.types';
import EvidenceViewerScreen from './EvidenceViewerScreen';

let mockSnapshot: OrderSessionSnapshot;
let mockRouteParams = { evidenceId: 'face' };
jest.mock('../runtime/OrderSessionProvider', () => ({ useOptionalOrderSession: () => null, useOrderSession: () => ({ key: mockSnapshot.key, snapshot: mockSnapshot }) }));
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ goBack: jest.fn() }), useRoute: () => ({ params: mockRouteParams }) }));
jest.mock('react-native-safe-area-context', () => {
  const Native = jest.requireActual('react-native');
  return { SafeAreaView: Native.View, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
});
jest.mock('../../../hooks/useKeyboardInset', () => ({ useKeyboardInset: () => 0 }));

function customerSnapshot() {
  const key = { userId: 'customer-1', role: 'customer' as const, sessionGeneration: 1, serviceOrderId: 'order-1' };
  const snapshot = createOrderSessionSnapshot(key);
  snapshot.access = 'current';
  snapshot.resources.evidence = readyResource([
    { id: 'before', serviceOrderId: 'order-1', type: 'BEFORE', mediaUrl: 'https://example.test/before.jpg', createdAt: '2026-10-13T00:00:00Z' },
    { id: 'face', serviceOrderId: 'order-1', type: 'CHECKIN_FACE' as any, mediaUrl: 'https://example.test/face.jpg', createdAt: '2026-10-13T00:00:00Z' },
  ], 1, 1);
  return snapshot;
}

it('does not resolve a face evidence ID in the customer viewer but still opens an allowed photo', async () => {
  mockSnapshot = customerSnapshot();
  mockRouteParams = { evidenceId: 'face' };
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<EvidenceViewerScreen />); });
  expect(renderer.root.findAllByType(Image)).toHaveLength(0);
  await act(async () => renderer.unmount());

  mockRouteParams = { evidenceId: 'before' };
  await act(async () => { renderer = create(<EvidenceViewerScreen />); });
  expect(renderer.root.findAllByType(Image)).toHaveLength(1);
  await act(async () => renderer.unmount());
});
