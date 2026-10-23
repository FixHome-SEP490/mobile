import React from 'react';
import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { OrderSessionSnapshot } from '../domain/order-session.types';
import { createOrderSessionSnapshot, readyResource } from '../domain/order-session.types';
import ProposalDetailScreen from './ProposalDetailScreen';

let mockSnapshot: OrderSessionSnapshot;
let mockProposalId = '';
jest.mock('../runtime/OrderSessionProvider', () => ({ useOrderSession: () => ({ key: mockSnapshot.key, snapshot: mockSnapshot, loadResource: jest.fn(async () => {}) }) }));
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ goBack: jest.fn(), push: jest.fn() }), useRoute: () => ({ params: { proposalId: mockProposalId } }) }));
jest.mock('react-native-safe-area-context', () => {
  const Native = jest.requireActual('react-native');
  return { SafeAreaView: Native.View, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
});
jest.mock('../../../hooks/useKeyboardInset', () => ({ useKeyboardInset: () => 0 }));

function readySnapshot() {
  const key = { userId: 'customer-1', role: 'customer' as const, sessionGeneration: 1, serviceOrderId: 'order-1' };
  const snapshot = createOrderSessionSnapshot(key);
  snapshot.access = 'current';
  snapshot.order = readyResource({ id: key.serviceOrderId, code: 'SO-1', bookingId: 'b-1', serviceName: 'Repair', status: 'UNDER_REPAIR',
    customerName: 'Customer', customerPhone: '0900', addressSummary: 'Address', scheduledAt: '', laborTotal: 0, partsTotal: 0,
    grandTotal: 0, paymentStatus: 'UNPAID', createdAt: '' }, 1, 1);
  snapshot.resources.quotations = readyResource([
    { id: 'q-approved', serviceOrderId: key.serviceOrderId, status: 'APPROVED', version: 4, items: [] },
    { id: 'q-superseded', serviceOrderId: key.serviceOrderId, status: 'SUPERSEDED', version: 2, items: [] },
    { id: 'q-rejected', serviceOrderId: key.serviceOrderId, status: 'REJECTED', version: 5, items: [] },
  ], 1, 1);
  snapshot.resources.extras = readyResource([], 1, 1);
  return snapshot;
}

it('opens exact non-pending proposal IDs as status/version-bearing readonly records', async () => {
  mockSnapshot = readySnapshot();
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<ProposalDetailScreen />); });
  for (const [id, statusLabel, version] of [
    ['q-approved', 'Đã duyệt', '4'],
    ['q-superseded', 'Đã được thay thế', '2'],
    ['q-rejected', 'Đã từ chối', '5'],
  ]) {
    mockProposalId = id;
    await act(async () => renderer.update(<ProposalDetailScreen />));
    const text = renderer.root.findAllByType(Text).map(node => String(node.props.children)).join(' ');
    expect(text).toContain(statusLabel);
    expect(text).toMatch(new RegExp(`Báo giá lần ,?${version}`));
    expect(text).not.toContain('Chấp nhận');
    expect(text).not.toContain('Từ chối');
  }
  await act(async () => renderer.unmount());
});
