import React from 'react';
import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { OrderSessionSnapshot } from '../domain/order-session.types';
import { createOrderSessionSnapshot, readyResource } from '../domain/order-session.types';
import OrderProgressHistoryScreen from './OrderProgressHistoryScreen';

let mockSnapshot: OrderSessionSnapshot;
const mockLoadResource = jest.fn();
jest.mock('../runtime/OrderSessionProvider', () => ({ useOrderSession: () => ({ key: mockSnapshot.key, snapshot: mockSnapshot, loadResource: mockLoadResource }) }));
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ goBack: jest.fn() }) }));
jest.mock('react-native-safe-area-context', () => {
  const Native = jest.requireActual('react-native');
  return { SafeAreaView: Native.View, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
});
jest.mock('../../../hooks/useKeyboardInset', () => ({ useKeyboardInset: () => 0 }));

it('keeps historical technician history at the seven-field summary and does not request history', async () => {
  const key = { userId: 'technician-1', role: 'technician' as const, sessionGeneration: 3, serviceOrderId: 'order-history' };
  mockSnapshot = createOrderSessionSnapshot(key);
  mockSnapshot.access = 'historical';
  mockSnapshot.order = readyResource({ id: key.serviceOrderId, code: 'SO-9', status: 'COMPLETED', historical: true,
    createdAt: '2026-10-13T00:00:00Z', completedAt: '2026-10-13T01:00:00Z', cancelledAt: null }, 1, 1);
  mockLoadResource.mockClear();
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<OrderProgressHistoryScreen />); });
  expect(mockLoadResource).not.toHaveBeenCalled();
  expect(renderer.root.findAllByType(Text).some(node => String(node.props.children).includes('Đơn lịch sử chỉ có bản tóm tắt'))).toBe(true);
  await act(async () => renderer.unmount());
});
