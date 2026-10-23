import type { CanonicalOrderStatus } from '../../../api/orders.api';
import React from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import * as Clipboard from 'expo-clipboard';
import { createOrderSessionSnapshot, readyResource, type OrderSessionSnapshot } from '../domain/order-session.types';
import OrderInformationScreen from './OrderInformationScreen';

let mockSnapshot: OrderSessionSnapshot;
const mockSetClipboard = Clipboard.setStringAsync as jest.Mock;
jest.mock('../runtime/OrderSessionProvider', () => ({ useOrderSession: () => ({ key: mockSnapshot.key, snapshot: mockSnapshot, refresh: jest.fn(), loadResource: jest.fn(async () => {}) }) }));
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ goBack: jest.fn(), navigate: jest.fn() }) }));
jest.mock('react-native-safe-area-context', () => {
  const Native = jest.requireActual('react-native');
  return { SafeAreaView: Native.View, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
});
jest.mock('../../../hooks/useKeyboardInset', () => ({ useKeyboardInset: () => 0 }));
jest.mock('../../../components/AcceptedRescheduleSheet', () => ({ __esModule: true, default: () => null }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));

function renderTree(role: 'customer' | 'technician', status: CanonicalOrderStatus = 'UNDER_REPAIR', pricingMode = 'INSPECTION_REQUIRED'): ReactTestRenderer {
  const key = { userId: 'u1', role, sessionGeneration: 1, serviceOrderId: 'order-1' };
  mockSnapshot = createOrderSessionSnapshot(key);
  mockSnapshot.access = 'current';
  mockSnapshot.order = readyResource({
    id: 'order-1', code: 'SO-1', bookingId: 'b1', serviceName: 'Sửa điều hòa', status,
    customerName: 'An', customerPhone: '0900', addressSummary: 'Quận 1', scheduledAt: '2030-10-21T01:00:00.000Z',
    bookingMode: 'scheduled', slot: 'morning', customerNote: 'Gọi trước', laborWarrantyDays: 90,
    technician: { id: 't1', fullName: 'Bình', phoneNumber: '0911', averageRating: null },
    pricingMode, fixedUnitPrice: 150000, quantity: 2, laborTotal: 0, partsTotal: 0, grandTotal: 0, paymentStatus: 'UNPAID', createdAt: '',
  }, 1, 1);
  let r!: ReturnType<typeof create>;
  act(() => { r = create(<OrderInformationScreen />); });
  return r;
}

function render(role: 'customer' | 'technician', status?: CanonicalOrderStatus, pricingMode?: string) {
  const tree = renderTree(role, status, pricingMode);
  const output = JSON.stringify(tree.toJSON()).replace(/","/g, '');
  act(() => tree.unmount());
  return output;
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
  it('offers rescheduling only to the customer once the technician accepted and before the repair starts', () => {
    expect(render('customer', 'ACCEPTED')).toContain('order-reschedule-entry');
    expect(render('customer', 'UNDER_REPAIR')).not.toContain('order-reschedule-entry');
    expect(render('technician', 'ACCEPTED')).not.toContain('order-reschedule-entry');
  });
it('shows the locked price and quantity only for a fixed-price order', () => {    const fixed = render('customer', 'UNDER_REPAIR', 'FIXED_PRICE');    expect(fixed).toContain('Giá đã chốt');    expect(fixed).toContain('150.000');    expect(fixed).toContain('Số lượng');    expect(render('customer')).not.toContain('Giá đã chốt');  });
  it('shows the customer to the technician', () => {
    const out = render('technician');
    expect(out).toContain('An · 0900');
    expect(out).not.toContain('order-code-copy');
  });

  it('lets only the customer copy the full backend order code', async () => {
    const tree = renderTree('customer');
    await act(async () => { await tree.root.findByProps({ testID: 'order-code-copy' }).props.onPress(); });
    expect(mockSetClipboard).toHaveBeenCalledWith('SO-1');
    expect(tree.root.findAllByType(Text).map(node => String(node.props.children)).join(' ')).toContain('Đã sao chép mã đơn.');
    act(() => tree.unmount());
  });
});

describe('OrderInformationScreen cost history', () => {
  it('lists every quotation round and extra cost with status, lines and totals', () => {
    const tree = renderTree('customer');
    act(() => {
      mockSnapshot.resources.quotations = readyResource([
        { id: 'q1', serviceOrderId: 'order-1', status: 'SUPERSEDED', version: 1, laborTotal: '100000', partsTotal: '0', items: [{ id: 'a', type: 'LABOR', description: 'Công kiểm tra', quantity: 1, unitPrice: 100000, lineTotal: 100000 }] },
        { id: 'q2', serviceOrderId: 'order-1', status: 'APPROVED', version: 2, laborTotal: '100000', partsTotal: '60000', items: [
          { id: 'b', type: 'LABOR', description: 'Công kiểm tra', quantity: 1, unitPrice: 100000, lineTotal: 100000 },
          { id: 'c', type: 'PARTS', description: 'Co đồng Φ12', quantity: 2, unitPrice: 30000, lineTotal: 60000, warrantyTermDays: 30 },
        ] },
      ] as any, 1, 1);
      mockSnapshot.resources.extras = readyResource([
        { id: 'e1', serviceOrderId: 'order-1', status: 'approved', reason: 'Hỏng van', totalLaborDelta: 50000, totalPartsDelta: 450000, shippingFee: 25000, createdAt: '2030-10-21T01:00:00.000Z',
          items: [{ id: 'd', type: 'parts_equipment', description: 'Bình chứa nước', quantity: 1, unitPrice: 450000, lineTotal: 450000 }] },
      ] as any, 1, 1);
      tree.update(<OrderInformationScreen />);
    });
    const out = JSON.stringify(tree.toJSON()).replace(/","/g, '');
    expect(out).toContain('Báo giá lần 1');
    expect(out).toContain('Đã được thay thế');
    expect(out).toContain('Báo giá lần 2');
    expect(out).toContain('Đã duyệt báo giá');
    expect(out).toContain('Co đồng Φ12');
    expect(out).toContain('Phát sinh lần 1');
    expect(out).toContain('Hỏng van');
    expect(out).toContain('Tổng phát sinh');
    expect(out).toContain('525.000');
    act(() => tree.unmount());
  });
});
