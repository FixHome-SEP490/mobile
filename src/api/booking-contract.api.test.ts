import apiClient from './client';
import { bookingsApi } from './bookings.api';
import { ordersApi } from './orders.api';

jest.mock('./client', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
}));

const api = apiClient as unknown as { get: jest.Mock; post: jest.Mock; patch: jest.Mock };
const firstUserId = '11111111-1111-4111-8111-111111111111';
const secondUserId = '22222222-2222-4222-8222-222222222222';
const technicianProfileId = '33333333-3333-4333-8333-333333333333';

beforeEach(() => jest.resetAllMocks());

describe('Mobile Booking / ServiceOrder API contract', () => {
  it('keeps technician profile ID separate from shortlist USER ID', async () => {
    api.get.mockResolvedValue({ data: { data: [{
      technicianId: technicianProfileId, userId: firstUserId, fullName: 'Demo Technician',
    }] } });
    const candidates = await bookingsApi.getCandidates('booking-1');
    expect(api.get).toHaveBeenCalledWith('/bookings/booking-1/technician-candidates');
    expect(candidates[0].userId).toBe(firstUserId);
    expect(candidates[0].id).toBe(firstUserId);
    expect(candidates[0].technicianId).toBe(technicianProfileId);
  });

  it('rejects candidate records lacking a valid User ID instead of falling back to profile ID', async () => {
    api.get.mockResolvedValue({ data: { data: [{ technicianId: technicianProfileId, fullName: 'No user ID' }] } });
    await expect(bookingsApi.getCandidates('booking-1')).rejects.toThrow('User ID');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('sends exactly two distinct technician USER IDs in customer-selected order', async () => {
    api.post.mockResolvedValue({ data: { data: [] } });
    await bookingsApi.sendShortlist('booking-1', [secondUserId, firstUserId]);
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith('/bookings/booking-1/shortlist', {
      technicianIds: [secondUserId, firstUserId],
    });
  });

  it.each([
    [[firstUserId], 'one candidate'],
    [[firstUserId, secondUserId, technicianProfileId], 'three candidates'],
    [[firstUserId, firstUserId], 'duplicate candidate'],
    [[firstUserId, 'profile-not-uuid'], 'invalid User ID'],
  ])('rejects %s without sending a shortlist (%s)', async (input) => {
    await expect(bookingsApi.sendShortlist('booking-1', input as [string, string]))
      .rejects.toThrow('exactly two');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('normalizes customer Booking invitation status from lowercase Backend enum', async () => {
    api.get.mockResolvedValue({ data: { data: {
      id: 'booking-1', status: 'matching', urgency: 'medium',
      serviceId: 'service-1', addressId: 'address-1', description: 'Demo issue',
      invitations: [{
        id: 'invitation-1', bookingId: 'booking-1', priorityOrder: 1,
        status: 'pending', invitedAt: '2030-10-21T08:00:00Z', expiresAt: '2030-10-21T09:00:00Z',
      }, {
        id: 'invitation-2', bookingId: 'booking-1', priorityOrder: 2,
        status: 'standby', invitedAt: '2030-10-21T08:00:00Z', expiresAt: null,
      }],
    } } });
    const booking = await bookingsApi.getBooking('booking-1');
    expect(booking.status).toBe('MATCHING');
    expect(booking.invitations?.map((invitation) => invitation.status)).toEqual(['PENDING', 'STANDBY']);
  });
  it('keeps invitation previews privacy-limited and supports null expiration', async () => {
    api.get.mockResolvedValue({ data: { data: [{
      id: 'invitation-1', bookingId: 'booking-1', priorityOrder: 1,
      status: 'pending', invitedAt: '2030-10-21T08:00:00Z', expiresAt: null,
      technicianId: firstUserId, groupId: 'internal-group-id',
      booking: {
        id: 'booking-1', province: 'Demo Province', district: 'Demo District',
        serviceName: 'Repair', quantity: 1, urgency: 'medium',
        preferredStartAt: '2030-10-21T10:00:00Z', preferredEndAt: '2030-10-21T12:00:00Z',
        customerId: 'private-customer-id', customerPhone: 'private-phone',
        addressSummary: 'private-street-address', media: [{ url: 'private-photo' }],
      },
    }] } });
    const [invitation] = await bookingsApi.getMyInvitations();
    expect(invitation.status).toBe('PENDING');
    expect(invitation.expiresAt).toBeNull();
    expect(invitation.booking?.province).toBe('Demo Province');
    expect(invitation).not.toHaveProperty('technicianId');
    expect(invitation).not.toHaveProperty('groupId');
    expect(invitation.booking).not.toHaveProperty('customerId');
    expect(invitation.booking).not.toHaveProperty('customerPhone');
    expect(invitation.booking).not.toHaveProperty('addressSummary');
    expect(invitation.booking).not.toHaveProperty('media');
  });

  it('preserves private photo upload IDs on Booking create and normalizes urgency', async () => {
    const privatePhotoId = '44444444-4444-4444-8444-444444444444';
    api.post.mockResolvedValue({ data: { data: {
      id: 'booking-1', status: 'submitted', urgency: 'medium',
      serviceId: 'service-1', addressId: 'address-1', description: 'Demo issue',
    } } });
    await bookingsApi.createBooking({
      serviceId: 'service-1', addressId: 'address-1', description: 'Demo issue',
      preferredStartAt: '2030-10-21T10:00:00Z', preferredEndAt: '2030-10-21T12:00:00Z',
      urgency: 'NORMAL', photoUploadIds: [privatePhotoId],
    });
    expect(api.post).toHaveBeenCalledWith('/bookings', expect.objectContaining({
      urgency: 'medium', photoUploadIds: [privatePhotoId],
    }));
  });

  it('forwards required GPS accuracy when checking in, without fabricating valid arrival', async () => {
    api.post.mockResolvedValue({ data: { data: { result: 'low_accuracy' } } });
    const coords = { lat: 10.7769, lng: 106.7009, accuracyMeters: 125 };
    const result = await ordersApi.checkIn('service-order-1', coords);
    expect(api.post).toHaveBeenCalledWith('/service-orders/service-order-1/check-in', coords);
    expect(result.result).toBe('low_accuracy');
  });

  it.each([undefined, null, 'not-an-array'])(
    'normalizes a SENT quotation with missing items (%s) to an empty list instead of crashing',
    async (items) => {
      api.get.mockResolvedValue({ data: { data: {
        id: 'order-1', status: 'en_route', paymentStatus: 'unpaid',
        quotation: { id: 'quote-1', status: 'sent', laborTotal: 100000, partsTotal: 0, items },
      } } });
      const detail = await ordersApi.getOrder('order-1');
      expect(api.get).toHaveBeenCalledWith('/service-orders/order-1');
      expect(detail.quotation?.status).toBe('SENT');
      expect(detail.quotation?.items).toEqual([]);
    },
  );

  it('fetches an assigned-orders page with pagination params and server total', async () => {
    api.get.mockResolvedValue({ data: { data: [{
      id: 'order-1', code: 'SO-1', bookingId: 'booking-1', status: 'accepted',
      serviceName: 'Tap repair', paymentStatus: 'unpaid',
    }], meta: { total: 40 } } });
    const page = await ordersApi.getMyOrdersPage(2, 20);
    expect(api.get).toHaveBeenCalledWith('/service-orders/my', { params: { page: 2, pageSize: 20 } });
    expect(page.total).toBe(40);
    expect(page.data).toMatchObject([{ id: 'order-1', status: 'ACCEPTED' }]);
  });

  it('clamps invalid order page bounds and keeps the legacy list call param-free', async () => {
    api.get.mockResolvedValue({ data: { data: [], meta: { total: 0 } } });
    await ordersApi.getMyOrdersPage(0, 500);
    expect(api.get).toHaveBeenCalledWith('/service-orders/my', { params: { page: 1, pageSize: 100 } });
    api.get.mockResolvedValue({ data: { data: [] } });
    await ordersApi.getMyOrders();
    expect(api.get).toHaveBeenCalledWith('/service-orders/my');
  });

  it('fetches a Booking history page with pagination params and server total', async () => {
    api.get.mockResolvedValue({ data: { data: [{
      id: 'booking-1', customerId: 'customer-1', serviceId: 'service-1', addressId: 'address-1',
      description: 'Leaking tap', status: 'submitted', urgency: 'medium',
      preferredStartAt: '2030-10-21T10:00:00Z', preferredEndAt: '2030-10-21T12:00:00Z',
      createdAt: '2030-10-20T08:00:00Z',
    }], meta: { total: 3 } } });
    const page = await bookingsApi.getMyBookingsPage(1, 20);
    expect(api.get).toHaveBeenCalledWith('/bookings/my', { params: { page: 1, pageSize: 20 } });
    expect(page.total).toBe(3);
    expect(page.data).toHaveLength(1);
    expect(page.data[0]).toMatchObject({ id: 'booking-1', status: 'SUBMITTED' });
  });

  it('clamps invalid page bounds and caps pageSize at the server limit', async () => {
    api.get.mockResolvedValue({ data: { data: [], meta: { total: 0 } } });
    await bookingsApi.getMyBookingsPage(0, -5);
    expect(api.get).toHaveBeenCalledWith('/bookings/my', { params: { page: 1, pageSize: 20 } });
    await bookingsApi.getMyBookingsPage(2, 500);
    expect(api.get).toHaveBeenCalledWith('/bookings/my', { params: { page: 2, pageSize: 100 } });
  });

  it('falls back to loaded rows when the server omits meta.total', async () => {
    api.get.mockResolvedValue({ data: { data: [{
      id: 'booking-9', customerId: 'customer-1', serviceId: 'service-1', addressId: 'address-1',
      description: 'Noisy fan', status: 'matching', urgency: 'low',
      preferredStartAt: '2030-10-21T10:00:00Z', createdAt: '2030-10-20T08:00:00Z',
    }] } });
    const page = await bookingsApi.getMyBookingsPage(1, 20);
    expect(page.total).toBe(1);
    expect(page.data[0].status).toBe('MATCHING');
  });
});