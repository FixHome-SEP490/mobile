import apiClient from './client';
import { bookingDraftsApi, describeBookingDraft, fetchCurrentBookingDraft, formatDraftExpiry, isBookingDraft, isDraftConflict, type BookingDraft } from './booking-drafts.api';

jest.mock('./client', () => ({ __esModule: true, default: { get: jest.fn(), put: jest.fn(), delete: jest.fn(), post: jest.fn() } }));
const api = apiClient as unknown as { get: jest.Mock; put: jest.Mock; delete: jest.Mock; post: jest.Mock };
const draft: BookingDraft = { id: 'd1', version: 2, expiresAt: '2026-12-23T03:30:00Z', snapshot: { items: [{ serviceId: 's1' }] } };

beforeEach(() => jest.resetAllMocks());

describe('bookingDraftsApi', () => {
  it('reads, saves with the expected version and discards the one current draft', async () => {
    api.get.mockResolvedValue({ data: { data: draft } });
    await expect(bookingDraftsApi.current()).resolves.toEqual(draft);
    expect(api.get).toHaveBeenCalledWith('/booking-drafts/current');
    api.put.mockResolvedValue({ data: { data: draft } });
    await bookingDraftsApi.save({ items: [] }, 1);
    expect(api.put).toHaveBeenCalledWith('/booking-drafts/current', { snapshot: { items: [] }, expectedVersion: 1 });
    api.delete.mockResolvedValue({ data: { data: { deleted: true } } });
    await expect(bookingDraftsApi.discard()).resolves.toEqual({ deleted: true });
  });

  it('sends a booking through the draft with its version, key and Backend urgency', async () => {
    api.post.mockResolvedValue({ data: { data: { kind: 'booking', bookingId: 'b1', visitGroupId: null } } });
    const data = { serviceId: 's1', addressId: 'a1', description: 'x', urgency: 'NORMAL' } as never;
    await expect(bookingDraftsApi.submit('d/1', { expectedVersion: 2, operationKey: 'k', request: { kind: 'booking', data } })).resolves.toMatchObject({ bookingId: 'b1' });
    expect(api.post).toHaveBeenCalledWith('/booking-drafts/d%2F1/submit', { expectedVersion: 2, operationKey: 'k', request: { kind: 'booking', data: { serviceId: 's1', addressId: 'a1', description: 'x', urgency: 'medium' } } });
  });
});

describe('draft helpers', () => {
  it('banner reads never throw and ignore a body that is not a draft', async () => {
    api.get.mockRejectedValueOnce(new Error('offline'));
    await expect(fetchCurrentBookingDraft()).resolves.toBeNull();
    api.get.mockResolvedValueOnce({ data: { data: [] } });
    await expect(fetchCurrentBookingDraft()).resolves.toBeNull();
    api.get.mockResolvedValueOnce({ data: { data: draft } });
    await expect(fetchCurrentBookingDraft()).resolves.toEqual(draft);
    expect(isBookingDraft({ id: 'x' })).toBe(false);
  });

  it('writes the expiry in Vietnam time and describes the draft', () => {
    expect(formatDraftExpiry('2026-12-23T03:30:00Z')).toBe('23/12/2026 10:30');
    expect(formatDraftExpiry('nope')).toBe('ngày hết hạn chưa xác định');
    expect(describeBookingDraft(draft)).toBe('Đơn đặt 1 thiết bị');
    expect(describeBookingDraft({ ...draft, snapshot: { quantity: 3 } })).toBe('Đơn đặt 1 thiết bị (số lượng 3)');
    expect(describeBookingDraft({ ...draft, snapshot: { kind: 'visit_group', items: [{}, {}] } })).toBe('Lượt nhiều thiết bị · 2 thiết bị');
  });

  it('knows a 409 on save or submit', () => {
    expect(isDraftConflict({ response: { status: 409 } })).toBe(true);
    expect(isDraftConflict({ response: { status: 400 } })).toBe(false);
    expect(isDraftConflict(new Error('x'))).toBe(false);
  });
});
