import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { BookingReviewSummary } from './BookingReviewSheet';
import type { BookingReviewSnapshot } from '../screens/customer/customer-booking-review';

jest.mock('@gorhom/bottom-sheet', () => ({ BottomSheetBackdrop: () => null, BottomSheetModal: () => null, BottomSheetScrollView: () => null }));
jest.mock('./BackClosableBottomSheetModal', () => () => null);
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));

const colors = { border: '#ddd', divider: '#eee', error: '#f00', primary: '#00f', surface: '#fff', text: '#000', textSecondary: '#555' };

function snapshot(customerNote?: string): BookingReviewSnapshot {
  return {
    ownerUserId: 'u1',
    request: { serviceId: 's1', addressId: 'a1', description: 'Máy không mát', quantity: 1, ...(customerNote ? { customerNote } : {}) } as BookingReviewSnapshot['request'],
    serviceName: 'Sửa điều hòa',
    addressLabel: 'Nhà riêng',
    addressDescription: '',
    scheduleLabel: 'Thứ 6, 20/11 · 18:00 - 23:00',
    pricingLabel: 'Tham khảo 249.000 ₫',
    photos: [],
    hasAiSummary: false,
  };
}

const texts = (r: TestRenderer.ReactTestRenderer) => r.root.findAllByType(Text).map((t) => String([t.props.children].flat().join('')));

describe('BookingReviewSummary', () => {
  test('shows the note for the technician the customer typed', () => {
    let r!: TestRenderer.ReactTestRenderer;
    act(() => { r = TestRenderer.create(<BookingReviewSummary snapshot={snapshot('Gọi trước 15 phút')} colors={colors} />); });
    expect(texts(r)).toEqual(expect.arrayContaining(['Ghi chú cho thợ', 'Gọi trước 15 phút']));
  });

  test('leaves the note row out when there is no note', () => {
    let r!: TestRenderer.ReactTestRenderer;
    act(() => { r = TestRenderer.create(<BookingReviewSummary snapshot={snapshot()} colors={colors} />); });
    expect(texts(r)).not.toContain('Ghi chú cho thợ');
  });
});
