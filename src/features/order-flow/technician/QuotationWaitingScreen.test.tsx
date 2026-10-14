import React from 'react';
import { act, create } from 'react-test-renderer';
import type { OrderSessionKey, OrderSessionSnapshot } from '../domain/order-session.types';
import { createOrderSessionSnapshot, readyResource } from '../domain/order-session.types';
import QuotationWaitingScreen from './QuotationWaitingScreen';

let mockKey: OrderSessionKey;
let mockSnapshot: OrderSessionSnapshot;
let mockJournalList: unknown[] = [];
let mockState: any;
const mockVerify = jest.fn();
const mockRefresh: jest.Mock = jest.fn(async () => {});
const mockLoadResource: jest.Mock = jest.fn(async () => {});
const mockNavigate: jest.Mock = jest.fn();

jest.mock('../runtime/OrderSessionProvider', () => ({
  useOrderSession: () => ({
    key: mockKey,
    snapshot: mockSnapshot,
    refresh: (...args: unknown[]) => mockRefresh(...args),
    loadResource: (...args: unknown[]) => mockLoadResource(...args),
    journal: { list: () => mockJournalList },
  }),
}));
jest.mock('./useTechnicianQuotation', () => ({
  useTechnicianQuotation: () => ({
    controller: { verify: (...args: unknown[]) => mockVerify(...args) },
    state: mockState,
  }),
}));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: (...args: unknown[]) => mockNavigate(...args), goBack: jest.fn() }),
  useIsFocused: () => true,
}));
jest.mock('react-native-safe-area-context', () => {
  const Native = jest.requireActual('react-native');
  return { SafeAreaView: Native.View, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
});
jest.mock('../../../hooks/useKeyboardInset', () => ({ useKeyboardInset: () => 0 }));

function waitingSnapshot(quoteStatus: string, orderStatus = 'EN_ROUTE') {
  const key: OrderSessionKey = { userId: 'tech-1', role: 'technician', sessionGeneration: 1, serviceOrderId: 'order-1' };
  const snapshot = createOrderSessionSnapshot(key);
  snapshot.access = 'current';
  snapshot.order = readyResource(
    {
      id: 'order-1',
      code: 'SO-1',
      bookingId: 'booking-1',
      serviceName: 'Sửa điều hòa',
      status: orderStatus,
      arrivalVerified: true,
      pricingMode: 'INSPECTION_REQUIRED',
      customerName: 'Khách hàng',
      customerPhone: '0900000000',
      technician: { id: 'tech-1', fullName: 'Thợ', phoneNumber: '0901111111', averageRating: null },
      laborTotal: 0,
      partsTotal: 0,
      grandTotal: 0,
      paymentStatus: 'UNPAID',
      createdAt: '2026-10-13T00:00:00Z',
    } as any,
    1,
    1,
  );
  snapshot.resources.quotations = readyResource(
    [
      {
        id: 'quote-1',
        serviceOrderId: 'order-1',
        technicianId: 'tech-1',
        status: quoteStatus,
        version: 2,
        laborTotal: 150000,
        partsTotal: 50000,
        sentAt: '2026-10-13T01:00:00Z',
        items: [],
      },
    ] as any,
    1,
    1,
  );
  return { key, snapshot };
}

beforeEach(() => {
  const fixture = waitingSnapshot('SENT');
  mockKey = fixture.key;
  mockSnapshot = fixture.snapshot;
  mockJournalList = [];
  mockState = { phase: 'idle', message: null };
  for (const mock of [mockVerify, mockRefresh, mockLoadResource, mockNavigate]) mock.mockClear();
});

it('shows the exact SENT scope with the awaited party and refreshes without writes', async () => {
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<QuotationWaitingScreen />);
  });
  const text = JSON.stringify(renderer.toJSON());
  expect(text).toMatch(/quote-1/);
  expect(text).toMatch(/Khách hàng duyệt/);

  await act(async () => {
    renderer.root.findByProps({ testID: 'quote-proposal-link' }).props.onPress();
  });
  expect(mockNavigate).toHaveBeenCalledWith('ProposalDetail', { proposalId: 'quote-1' });

  await act(async () => {
    renderer.root.findByProps({ testID: 'task-refresh' }).props.onPress();
  });
  expect(mockRefresh).toHaveBeenCalledWith('manual');
  expect(mockVerify).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());
});

it('unknown offers GET-only verify and never resends the creation', async () => {
  mockState = { phase: 'unknown', message: 'Kết quả chưa xác định.' };
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<QuotationWaitingScreen />);
  });
  await act(async () => {
    renderer.root.findByProps({ testID: 'quote-verify' }).props.onPress();
  });
  expect(mockVerify).toHaveBeenCalledTimes(1);
  await act(async () => renderer.unmount());
});

it('approved server state explains the next step and continues without fake repair start', async () => {
  const fixture = waitingSnapshot('APPROVED', 'UNDER_REPAIR');
  mockSnapshot = fixture.snapshot;
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<QuotationWaitingScreen />);
  });
  const text = JSON.stringify(renderer.toJSON());
  expect(text).toMatch(/đang sửa chữa/);
  expect(text).not.toMatch(/Bắt đầu sửa|bắt đầu sửa/);

  await act(async () => {
    renderer.root.findByProps({ testID: 'quote-continue' }).props.onPress();
  });
  expect(mockNavigate).toHaveBeenCalledWith('OrderTask');
  await act(async () => renderer.unmount());
});

it('a superseded known id is shown as replaced, never as still waiting', async () => {
  const fixture = waitingSnapshot('SUPERSEDED');
  mockSnapshot = fixture.snapshot;
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<QuotationWaitingScreen />);
  });
  const text = JSON.stringify(renderer.toJSON());
  expect(text).toMatch(/thay thế/);
  expect(text).not.toMatch(/Khách hàng duyệt/);
  await act(async () => renderer.unmount());
});
