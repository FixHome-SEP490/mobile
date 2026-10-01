import { buildBookingWindow, buildCustomerBookingWindow, validateBookingFields } from './booking-window';
import { vnWallClockToDate as vn } from './vn-time';

// Clock times are Vietnam times; calendar dates are what the date picker returns.

const SERVICE_ID = '11111111-1111-4111-8111-111111111111';
const ADDRESS_ID = '22222222-2222-4222-8222-222222222222';

describe('Booking request input contract', () => {
  it('creates a real future two-hour arrival window for a calendar date', () => {
    const now = vn(2026, 9, 22, 8, 0);
    const { preferredStartAt, preferredEndAt } = buildCustomerBookingWindow({
      date: new Date(2026, 8, 22),
      time: '09:00',
      now,
    });
    expect(preferredStartAt).toBe(vn(2026, 9, 22, 9, 0).toISOString());
    expect(preferredEndAt).toBe(vn(2026, 9, 22, 11, 0).toISOString());
  });

  it('preserves the today through three-day calendar horizon', () => {
    const now = vn(2026, 9, 22, 8, 0);
    const thirdDay = buildCustomerBookingWindow({
      date: new Date(2026, 8, 25),
      time: '09:00',
      now,
    });
    expect(thirdDay.preferredStartAt).toBe(
      vn(2026, 9, 25, 9, 0).toISOString(),
    );
    expect(() =>
      buildCustomerBookingWindow({ date: new Date(2026, 8, 26), time: '09:00', now }),
    ).toThrow('Vui lòng chọn ngày hẹn trong hôm nay đến 3 ngày tới.');
  });

  it.each(['09:00', '10:00', '13:00', '14:00', '15:00', '16:00'])(
    'keeps the allowed %s start slot and its two-hour end',
    (time) => {
      const now = vn(2026, 9, 22, 8, 0);
      const result = buildCustomerBookingWindow({
        date: new Date(2026, 8, 23),
        time,
        now,
      });
      const [hours, minutes] = time.split(':').map(Number);
      expect(result.preferredStartAt).toBe(
        vn(2026, 9, 23, hours, minutes).toISOString(),
      );
      expect(result.preferredEndAt).toBe(
        vn(2026, 9, 23, hours + 2, minutes).toISOString(),
      );
    },
  );

  it('rejects arbitrary start times outside the six customer slots', () => {
    expect(() =>
      buildCustomerBookingWindow({
        date: new Date(2026, 8, 23),
        time: '11:00',
        now: vn(2026, 9, 22, 8, 0),
      }),
    ).toThrow('Vui lòng chọn một trong các khung giờ có sẵn.');
  });

  it('rejects past windows and malformed times before an API call', () => {
    const now = vn(2026, 9, 22, 10, 0);
    expect(() =>
      buildCustomerBookingWindow({ date: new Date(2026, 8, 22), time: '09:00', now }),
    ).toThrow();
    expect(() =>
      buildCustomerBookingWindow({ date: new Date(2026, 8, 22), time: '25:00', now }),
    ).toThrow();
  });

  it('keeps tomorrow at the selected Vietnam clock hour', () => {
    const now = vn(2026, 9, 22, 20, 0);
    const result = buildCustomerBookingWindow({
      date: new Date(2026, 8, 23),
      time: '09:00',
      now,
    });
    expect(result.preferredStartAt).toBe(vn(2026, 9, 23, 9, 0).toISOString());
  });

  it('preserves the existing relative window contract for rescheduling', () => {
    const now = vn(2026, 9, 22, 8, 0);
    const result = buildBookingWindow({ dayOffset: 10, time: '11:30', now });
    expect(result.preferredStartAt).toBe(vn(2026, 10, 2, 11, 30).toISOString());
    expect(result.preferredEndAt).toBe(vn(2026, 10, 2, 13, 30).toISOString());
  });

  it('rejects missing real catalog service, saved address and description', () => {
    expect(() => validateBookingFields({ serviceId: '', addressId: ADDRESS_ID, description: 'Sửa quạt' })).toThrow();
    expect(() => validateBookingFields({ serviceId: SERVICE_ID, addressId: '', description: 'Sửa quạt' })).toThrow();
    expect(() =>
      validateBookingFields({ serviceId: SERVICE_ID, addressId: ADDRESS_ID, description: '  ' }),
    ).toThrow('Vui lòng mô tả sự cố để tiếp tục.');
    expect(() => validateBookingFields({ serviceId: SERVICE_ID, addressId: ADDRESS_ID, description: 'x'.repeat(5001) })).toThrow();
  });

  it('accepts generic UUIDs compatible with the backend contract', () => {
    const genericUuid = '00000000-0000-0000-0000-000000000000';
    expect(
      validateBookingFields({
        serviceId: genericUuid,
        addressId: genericUuid,
        description: 'Sửa quạt',
      }),
    ).toEqual({
      serviceId: genericUuid,
      addressId: genericUuid,
      description: 'Sửa quạt',
    });
  });

  it('normalizes customer description and requires a positive quantity', () => {
    expect(validateBookingFields({ serviceId: SERVICE_ID, addressId: ADDRESS_ID, description: '  Tủ lạnh không mát  ', quantity: 2 }))
      .toEqual({ serviceId: SERVICE_ID, addressId: ADDRESS_ID, description: 'Tủ lạnh không mát', quantity: 2 });
    expect(() => validateBookingFields({ serviceId: SERVICE_ID, addressId: ADDRESS_ID, description: 'Sửa quạt', quantity: 0 })).toThrow();
  });
});
