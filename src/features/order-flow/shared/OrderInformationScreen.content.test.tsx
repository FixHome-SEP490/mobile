import React from 'react';
import { act, create } from 'react-test-renderer';
import { createOrderSessionSnapshot, readyResource, type OrderSessionSnapshot } from '../domain/order-session.types';
import OrderInformationScreen from './OrderInformationScreen';

let mockSnapshot: OrderSessionSnapshot;
jest.mock('../runtime/OrderSessionProvider', () => ({ useOrderSession: () => ({ key: mockSnapshot.key, snapshot: mockSnapshot, refresh: jest.fn() }) }));
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ goBack: jest.fn(), navigate: jest.fn() }) }));
jest.mock('react-native-safe-area-context', () => {
  const Native = jest.requireActual('react-native');
  return { SafeAreaView: Native.View, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
});
jest.mock('../../../hooks/useKeyboardInset', () => ({ useKeyboardInset: () => 0 }));

function render(role: 'customer' | 'technician') {
  const key = { userId: 'u1', role, sessionGeneration: 1, serviceOrderId: 'order-1' };
  mockSnapshot = createOrderSessionSnapshot(key);
  mockSnapshot.access = 'current';
  mockSnapshot.order = readyResource({
    id: 'order-1', code: 'SO-1', bookingId: 'b1', serviceName: 'Sửa điều hòa', status: 'UNDER_REPAIR',
    customerName: 'An', customerPhone: '0900', addressSummary: 'Quận 1', scheduledAt: '2030-10-21T01:00:00.000Z',
    bookingMode: 'scheduled', slot: 'morning', customerNote: 'Gọi trước', laborWarrantyDays: 90,
    technician: { id: 't1', fullName: 'Bình', phoneNumber: '0911', averageRating: null },
    pricingMode: 'INSPECTION_REQUIRED', quantity: 1, laborTotal: 0, partsTotal: 0, grandTotal: 0, paymentStatus: 'UNPAID', createdAt: '',
  }, 1, 1);
  let r!: ReturnType<typeof create>;
  act(() => { r = create(<OrderInformationScreen />); });
  return JSON.stringify(r.toJSON()).replace(/","/g, '');
}

describe('OrderInformationScreen content', () => {
  it('shows Vietnamese labels, session, note, warranty and the other party', () => {
    const out = render('customer');
    expect(out).toContain('Đang sửa chữa');
    expect(out).not.toContain('UNDER_REPAIR');
    expect(out).toContain('Buổi sáng (8:00 - 12:00)');
    expect(out).toContain('Ghi chú của khách');
    expect(out).toContain('Báo giá sau khi kiểm tra');
    expect(out).toContain('90 ngày');
    expect(out).toContain('Bình · 0911');
  });
  it('shows the customer to the technician', () => {
    const out = render('technician');
    expect(out).toContain('An · 0900');
  });
});
