import type { ServiceItem } from '../../api/services.api';
import type { AddressData } from '../../api/users.api';
import { buildBookingReviewSnapshot } from './customer-booking-review';
import { vnWallClockToDate } from '../../utils/vn-time';

jest.mock('./service-catalog', () => ({
  resolveServicePrice: () => ({ text: '250.000đ' }),
}));

jest.mock('./customer-booking-create', () => ({
  addressReadyForBooking: (value: { lat: number; lng: number } | null) =>
    value !== null && Number.isFinite(value.lat) && Number.isFinite(value.lng),
}));

const service: ServiceItem = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Sửa máy lạnh',
  categoryId: '33333333-3333-4333-8333-333333333333',
  pricingMode: 'fixed_price',
  fixedPrice: 250000,
  basePrice: 250000,
  isActive: true,
};

const address: AddressData = {
  id: '22222222-2222-4222-8222-222222222222',
  userId: 'customer-a',
  label: 'Nhà riêng',
  line1: '12 Đường Hoa',
  ward: 'Phường 1',
  district: 'Quận 3',
  province: 'TP. Hồ Chí Minh',
  lat: 10.7769,
  lng: 106.7009,
  isDefault: true,
};

describe('customer booking review snapshot', () => {
  it('captures an immutable backend request with only the existing booking fields', () => {
    const snapshot = buildBookingReviewSnapshot({
      ownerUserId: 'customer-a',
      service,
      address,
      description: '  Máy lạnh chảy nước  ',
      date: new Date(2026, 8, 27),
      time: '09:00',
      now: vnWallClockToDate(2026, 9, 27, 8, 0),
    });

    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.request)).toBe(true);
    expect(snapshot.request).toEqual({
      serviceId: service.id,
      addressId: address.id,
      description: 'Máy lạnh chảy nước',
      preferredStartAt: vnWallClockToDate(2026, 9, 27, 9, 0).toISOString(),
      preferredEndAt: vnWallClockToDate(2026, 9, 27, 11, 0).toISOString(),
      quantity: 1,
      urgency: 'NORMAL',
    });
    expect(Object.keys(snapshot.request)).not.toContain('contactName');
    expect(Object.keys(snapshot.request)).not.toContain('contactPhone');
    expect(snapshot.scheduleLabel).toBe('CN, 27/09 · 09:00–11:00');
  });

  it('rejects an address owned by another customer', () => {
    expect(() =>
      buildBookingReviewSnapshot({
        ownerUserId: 'customer-b',
        service,
        address,
        description: 'Máy lạnh chảy nước',
        date: new Date(2026, 8, 27),
        time: '09:00',
        now: vnWallClockToDate(2026, 9, 27, 8, 0),
      }),
    ).toThrow('Vui lòng chọn địa chỉ đã lưu của tài khoản này.');
  });
});
