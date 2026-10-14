import React from 'react';
import { act, create } from 'react-test-renderer';
import type { OrderResourceKind, OrderSessionSnapshot } from '../domain/order-session.types';
import { createOrderSessionSnapshot, readyResource } from '../domain/order-session.types';
import OrderInformationScreen from './OrderInformationScreen';
import OrderProgressHistoryScreen from './OrderProgressHistoryScreen';
import EvidenceGalleryScreen from './EvidenceGalleryScreen';
import ScopeDetailScreen from './ScopeDetailScreen';
import InvoiceDetailScreen from './InvoiceDetailScreen';

let mockSnapshot: OrderSessionSnapshot;
let mockRefresh: jest.Mock<Promise<void>, [string?]>;
let mockLoadResource: jest.Mock<Promise<void>, [OrderResourceKind]>;

jest.mock('../runtime/OrderSessionProvider', () => ({ useOrderSession: () => ({
  key: mockSnapshot.key,
  snapshot: mockSnapshot,
  refresh: (...args: [string?]) => mockRefresh(...args),
  loadResource: (...args: [OrderResourceKind]) => mockLoadResource(...args),
}) }));
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ goBack: jest.fn(), push: jest.fn() }) }));
jest.mock('react-native-safe-area-context', () => {
  const Native = jest.requireActual('react-native');
  return { SafeAreaView: Native.View, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
});
jest.mock('../../../hooks/useKeyboardInset', () => ({ useKeyboardInset: () => 0 }));

const screens: { name: string; Screen: React.ComponentType; markLoading: (snapshot: OrderSessionSnapshot) => void }[] = [
  { name: 'order information', Screen: OrderInformationScreen, markLoading: snapshot => { snapshot.order = { status: 'loading', requestSeq: 2 }; } },
  { name: 'progress history', Screen: OrderProgressHistoryScreen, markLoading: snapshot => { snapshot.resources.history = { status: 'loading', requestSeq: 2 }; } },
  { name: 'evidence gallery', Screen: EvidenceGalleryScreen, markLoading: snapshot => { snapshot.resources.evidence = { status: 'loading', requestSeq: 2 }; } },
  { name: 'scope details', Screen: ScopeDetailScreen, markLoading: snapshot => { snapshot.resources.quotations = { status: 'loading', requestSeq: 2 }; } },
  { name: 'invoice details', Screen: InvoiceDetailScreen, markLoading: snapshot => { snapshot.resources.invoice = { status: 'loading', requestSeq: 2 }; } },
];

function session(): OrderSessionSnapshot {
  const key = { userId: 'customer-1', role: 'customer' as const, sessionGeneration: 1, serviceOrderId: 'order-1' };
  const snapshot = createOrderSessionSnapshot(key);
  snapshot.access = 'current';
  snapshot.order = readyResource({ id: key.serviceOrderId, code: 'SO-1', bookingId: 'booking-1', serviceName: 'Repair',
    status: 'UNDER_REPAIR', customerName: 'Customer', customerPhone: '0900', addressSummary: 'Address', scheduledAt: '',
    pricingMode: 'FIXED_PRICE', quantity: 1, fixedUnitPrice: 100, laborTotal: 100, partsTotal: 0, grandTotal: 100,
    paymentStatus: 'UNPAID', createdAt: '' }, 1, 1);
  snapshot.resources.evidence = readyResource([], 1, 1);
  snapshot.resources.quotations = readyResource([], 1, 1);
  snapshot.resources.extras = readyResource([], 1, 1);
  snapshot.resources.parts = readyResource([], 1, 1);
  snapshot.resources.invoice = readyResource(null, 1, 1);
  snapshot.resources.cash = readyResource(null, 1, 1);
  snapshot.resources.history = readyResource([], 1, 1);
  return snapshot;
}

beforeEach(() => {
  mockSnapshot = session();
  mockRefresh = jest.fn(async (_reason?: string) => {});
  mockLoadResource = jest.fn(async (_kind: OrderResourceKind) => {});
});

for (const { name, Screen, markLoading } of screens) {
  it(`${name} offers an explicit manual refresh for the authorized current order`, async () => {
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<Screen />); });
    const refresh = renderer.root.findByProps({ testID: 'readonly-detail-refresh' });
    expect(refresh.props.disabled).toBe(false);
    await act(async () => refresh.props.onPress());
    expect(mockRefresh).toHaveBeenCalledWith('manual');
    await act(async () => renderer.unmount());
  });

  it(`${name} disables refresh when access is unverified or historical`, async () => {
    for (const access of ['unverified', 'historical'] as const) {
      mockSnapshot = session();
      mockSnapshot.access = access;
      let renderer!: ReturnType<typeof create>;
      await act(async () => { renderer = create(<Screen />); });
      const refresh = renderer.root.findByProps({ testID: 'readonly-detail-refresh' });
      expect(refresh.props.disabled).toBe(true);
      await act(async () => refresh.props.onPress());
      expect(mockRefresh).not.toHaveBeenCalled();
      await act(async () => renderer.unmount());
    }
  });

  it(`${name} disables refresh while its GET is loading`, async () => {
    markLoading(mockSnapshot);
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<Screen />); });
    expect(renderer.root.findByProps({ testID: 'readonly-detail-refresh' }).props.disabled).toBe(true);
    await act(async () => renderer.unmount());
  });
}
