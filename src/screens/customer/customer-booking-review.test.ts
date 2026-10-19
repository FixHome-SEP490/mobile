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
  it('keeps local Booking photo previews in the review without adding media refs to the request', () => {
    const photo = {
      uri: 'file:///device/photo.jpg',
      name: 'photo.jpg',
      type: 'image/jpeg' as const,
      sizeBytes: 2048,
    };
    const snapshot = buildBookingReviewSnapshot({
      ownerUserId: 'customer-a',
      service,
      address,
      description: 'Máy lạnh chảy nước',
      date: new Date(2026, 8, 27),
      time: '09:00',
      now: vnWallClockToDate(2026, 9, 27, 8, 0),
      photos: [photo],
    });

    expect(snapshot.photos).toEqual([photo]);
    expect(Object.isFrozen(snapshot.photos)).toBe(true);
    expect(Object.isFrozen(snapshot.photos[0])).toBe(true);
    expect(snapshot.request).not.toHaveProperty('photoUploadIds');
    expect(snapshot.request).not.toHaveProperty('mediaUrls');
  });

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

describe('booking from the assistant', () => {
  const base = {
    ownerUserId: 'customer-a',
    service,
    address,
    description: 'Máy lạnh kêu lạch cạch',
    date: new Date(2026, 8, 27),
    time: '09:00',
    now: vnWallClockToDate(2026, 9, 27, 8, 0),
  };

  it('sends the assistant session so the technician gets a summary, and says so', () => {
    const snapshot = buildBookingReviewSnapshot({ ...base, aiSessionId: '25a67259319c492bb68fd414778b8ce0' });
    expect(snapshot.request.aiSessionId).toBe('25a67259319c492bb68fd414778b8ce0');
    expect(snapshot.hasAiSummary).toBe(true);
  });

  it.each([
    ['no session', undefined],
    ['null', null],
    ['empty', ''],
    ['spaces and emoji', 'phiên 😀'],
    ['injection', "x'; drop table bookings;--"],
    ['too long', 'a'.repeat(129)],
  ])('books normally with %s', (_label, aiSessionId) => {
    const snapshot = buildBookingReviewSnapshot({ ...base, aiSessionId });
    expect(snapshot.request).not.toHaveProperty('aiSessionId');
    expect(snapshot.hasAiSummary).toBe(false);
  });
});

describe('session schedule', () => {
  const now = new Date('2026-10-15T03:00:00Z'); // 10:00 Vietnam
  const base = () => ({
    ownerUserId: 'owner-1',
    service: { id: '11111111-1111-4111-8111-111111111111', name: 'Sửa máy lạnh', isActive: true, pricingMode: 'fixed_price', basePrice: 1, fixedPrice: 1 } as never,
    address: { id: '22222222-2222-4222-8222-222222222222', userId: 'owner-1', label: 'Nhà', line1: '1 Đường A', district: 'Q1', province: 'HCM', lat: 10.7, lng: 106.7 } as never,
    description: 'Máy lạnh không mát',
    now,
  });

  it('carries mode/date/slot, the resolved window and a trimmed note', () => {
    const snap = buildBookingReviewSnapshot({ ...base(), schedule: { mode: 'scheduled', date: '2026-10-16', slot: 'morning' }, customerNote: '  Gọi trước  ' });
    expect(snap.request).toMatchObject({
      mode: 'scheduled', date: '2026-10-16', slot: 'morning', customerNote: 'Gọi trước',
      preferredStartAt: '2026-10-16T01:00:00.000Z', preferredEndAt: '2026-10-16T05:00:00.000Z',
    });
    expect(snap.scheduleLabel).toBe('Thứ 6, 16/10 · Sáng 8:00 - 12:00');
  });

  it('builds an urgent request without date or slot', () => {
    const snap = buildBookingReviewSnapshot({ ...base(), schedule: { mode: 'urgent' } });
    expect(snap.request.mode).toBe('urgent');
    expect(snap.request.date).toBeUndefined();
    expect(snap.request.customerNote).toBeUndefined();
    expect(snap.scheduleLabel).toContain('Tới ngay');
  });

  it('asks for a session when none was chosen', () => {
    expect(() => buildBookingReviewSnapshot(base())).toThrow('chọn ngày và buổi');
  });
});

describe('Catalog V2 device facts in the booking request', () => {
  const base = {
    ownerUserId: 'customer-a', service, address, description: 'Máy không mát',
    schedule: { mode: 'scheduled', date: '2026-10-16', slot: 'morning' } as const, now: new Date('2026-10-15T03:00:00Z'),
  };

  it('sends the facts and the server-confirmed variant, and nothing when there are none', () => {
    const withFacts = buildBookingReviewSnapshot({ ...base, deviceAttributes: { acMounting: 'wall' }, selectedVariantCode: 'AC-01-02' });
    expect(withFacts.request).toMatchObject({ deviceAttributes: { acMounting: 'wall' }, selectedVariantCode: 'AC-01-02' });
    const plain = buildBookingReviewSnapshot({ ...base, deviceAttributes: {}, selectedVariantCode: null });
    expect(plain.request).not.toHaveProperty('deviceAttributes');
    expect(plain.request).not.toHaveProperty('selectedVariantCode');
  });
});
