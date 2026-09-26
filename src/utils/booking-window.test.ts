import { buildBookingWindow, validateBookingFields } from './booking-window';

const SERVICE_ID = '11111111-1111-4111-8111-111111111111';
const ADDRESS_ID = '22222222-2222-4222-8222-222222222222';

describe('Booking request input contract', () => {
  it('creates a real future two-hour arrival window in the selected local day', () => {
    const now = new Date(2026, 8, 22, 8, 0);
    const { preferredStartAt, preferredEndAt } = buildBookingWindow({ dayOffset: 0, time: '09:00', now });
    expect(preferredStartAt).toBe(new Date(2026, 8, 22, 9, 0).toISOString());
    expect(preferredEndAt).toBe(new Date(2026, 8, 22, 11, 0).toISOString());
  });

  it('rejects past windows and malformed times before an API call', () => {
    const now = new Date(2026, 8, 22, 10, 0);
    expect(() => buildBookingWindow({ dayOffset: 0, time: '09:00', now })).toThrow();
    expect(() => buildBookingWindow({ dayOffset: 0, time: '25:00', now })).toThrow();
    expect(() => buildBookingWindow({ dayOffset: -1, time: '14:00', now })).toThrow();
  });

  it('keeps tomorrow at the selected local clock hour', () => {
    const now = new Date(2026, 8, 22, 20, 0);
    const result = buildBookingWindow({ dayOffset: 1, time: '09:00', now });
    expect(result.preferredStartAt).toBe(new Date(2026, 8, 23, 9, 0).toISOString());
  });

  it('rejects missing real catalog service, saved address and description', () => {
    expect(() => validateBookingFields({ serviceId: '', addressId: ADDRESS_ID, description: 'Sửa quạt' })).toThrow();
    expect(() => validateBookingFields({ serviceId: SERVICE_ID, addressId: '', description: 'Sửa quạt' })).toThrow();
    expect(() => validateBookingFields({ serviceId: SERVICE_ID, addressId: ADDRESS_ID, description: '  ' })).toThrow();
    expect(() => validateBookingFields({ serviceId: SERVICE_ID, addressId: ADDRESS_ID, description: 'x'.repeat(5001) })).toThrow();
  });

  it('normalizes customer description and requires a positive quantity', () => {
    expect(validateBookingFields({ serviceId: SERVICE_ID, addressId: ADDRESS_ID, description: '  Tủ lạnh không mát  ', quantity: 2 }))
      .toEqual({ serviceId: SERVICE_ID, addressId: ADDRESS_ID, description: 'Tủ lạnh không mát', quantity: 2 });
    expect(() => validateBookingFields({ serviceId: SERVICE_ID, addressId: ADDRESS_ID, description: 'Sửa quạt', quantity: 0 })).toThrow();
  });
});