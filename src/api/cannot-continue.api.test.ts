import apiClient from './client';
import { CannotContinueError, createCannotContinuePort, isCustomerNoShow, normalizeStop, readReadiness, type StopInput, type StopScope } from './cannot-continue.api';

jest.mock('./client', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));

const api = apiClient as unknown as { get: jest.Mock; post: jest.Mock };
const ORDER = '11111111-1111-4111-8111-111111111111';
const GROUP = '22222222-2222-4222-8222-222222222222';
const INCIDENT = '33333333-3333-4333-8333-333333333333';
const PHOTO = '44444444-4444-4444-8444-444444444444';
const order: StopScope = { kind: 'order', orderId: ORDER };
const group: StopScope = { kind: 'group', groupId: GROUP, orderId: ORDER };
const input: StopInput = { reasonClass: 'non_technician_exception', reasonCode: 'severe_damage', reason: 'Bo mạch cháy, không thay được', photoEvidenceIds: [] };
const noShow: StopInput = { ...input, reasonCode: 'customer_absent', reason: 'Khách không có nhà, gọi hai lần' };
const stopped = { serviceOutcome: 'VERIFIED_INTERRUPTION_RECORDED', incidentId: INCIDENT };
const httpError = (status: number) => ({ response: { status } });

beforeEach(() => jest.resetAllMocks());

describe('normalizeStop', () => {
  it('trims the reason, lowercases and sorts the photos', () => {
    const out = normalizeStop(order, { ...input, reason: '  Bo mạch cháy, không thay được  ', photoEvidenceIds: [PHOTO.toUpperCase()] });
    expect(out.reason).toBe('Bo mạch cháy, không thay được');
    expect(out.photoEvidenceIds).toEqual([PHOTO]);
  });

  it('refuses a short reason, a mismatched class, more than 3 photos, duplicates and, for a visit, a non no-show reason', () => {
    expect(() => normalizeStop(order, { ...input, reason: 'ngắn' })).toThrow(CannotContinueError);
    expect(() => normalizeStop(order, { ...input, reasonClass: 'technician_skill_gap' })).toThrow(CannotContinueError);
    expect(() => normalizeStop(order, { ...input, photoEvidenceIds: [PHOTO, PHOTO] })).toThrow(CannotContinueError);
    expect(() => normalizeStop(order, { ...input, photoEvidenceIds: ['x'] })).toThrow(CannotContinueError);
    expect(() => normalizeStop(group, input)).toThrow(CannotContinueError);
    expect(() => normalizeStop(group, noShow)).not.toThrow();
  });

  it('knows which reasons mean the customer is not there', () => {
    expect(isCustomerNoShow('customer_unreachable')).toBe(true);
    expect(isCustomerNoShow('severe_damage')).toBe(false);
  });
});

describe('createCannotContinuePort.stop', () => {
  it('posts one device with a command id and confirms the recorded interruption', async () => {
    const port = createCannotContinuePort();
    api.post.mockResolvedValue({ data: { data: stopped } });
    await expect(port.stop(order, input)).resolves.toEqual({ stoppedCount: 1, preservedCount: 0 });
    const [url, body] = api.post.mock.calls[0];
    expect(url).toBe(`/service-orders/${ORDER}/cannot-continue`);
    expect(body).toMatchObject({ reasonCode: 'severe_damage', photoEvidenceIds: [] });
    expect(body.commandId).toMatch(/^[\da-f-]{36}$/);
  });

  it('replays the same command id after an unknown answer and never sends other content meanwhile', async () => {
    const port = createCannotContinuePort();
    api.post.mockRejectedValueOnce(new Error('timeout'));
    await expect(port.stop(order, input)).rejects.toMatchObject({ uncertain: true });
    await expect(port.stop(order, { ...input, reason: 'Nội dung khác hẳn lần trước' })).rejects.toMatchObject({ locked: true });
    expect(api.post).toHaveBeenCalledTimes(1);
    api.post.mockResolvedValue({ data: { data: stopped } });
    await port.stop(order, input);
    expect(api.post.mock.calls[1][1].commandId).toBe(api.post.mock.calls[0][1].commandId);
    await port.stop(order, input);
    expect(api.post).toHaveBeenCalledTimes(2);
  });

  it('opens the form again on 400/422 and locks on other refusals', async () => {
    const port = createCannotContinuePort();
    api.post.mockRejectedValueOnce(httpError(422));
    await expect(port.stop(order, input)).rejects.toMatchObject({ locked: false, uncertain: false });
    api.post.mockRejectedValueOnce(httpError(409));
    const err = await port.stop(order, { ...input, reason: 'Đã sửa lại mô tả cho đủ dài' }).catch((e) => e);
    expect(err.message).toContain('Trạng thái máy hoặc phân công đã thay đổi');
    expect(port.retryAllowed(order)).toBe(false);
    await expect(port.stop(order, { ...input, reason: 'Đã sửa lại mô tả cho đủ dài' })).rejects.toMatchObject({ locked: true });
    expect(api.post).toHaveBeenCalledTimes(2);
  });

  it('stops the whole visit and needs the chosen device among the stopped ones', async () => {
    const port = createCannotContinuePort();
    api.post.mockImplementation(async (_url: string, body: { commandId: string }) => ({
      data: { data: { version: 1, groupId: GROUP, commandId: body.commandId, stopped: [{ orderId: ORDER, workStopped: true }], preserved: [{ orderId: PHOTO }] } },
    }));
    await expect(port.stop(group, noShow)).resolves.toEqual({ stoppedCount: 1, preservedCount: 1 });
    expect(api.post.mock.calls[0][0]).toBe(`/visit-groups/${GROUP}/cannot-continue`);
    expect(api.post.mock.calls[0][1].selectedOrderId).toBe(ORDER);
    const other = createCannotContinuePort();
    api.post.mockImplementation(async (_url: string, body: { commandId: string }) => ({
      data: { data: { version: 1, groupId: GROUP, commandId: body.commandId, stopped: [{ orderId: PHOTO, workStopped: true }], preserved: [] } },
    }));
    await expect(other.stop(group, noShow)).rejects.toMatchObject({ uncertain: true });
  });

  it('refuses an answer that does not confirm the interruption', async () => {
    const port = createCannotContinuePort();
    api.post.mockResolvedValue({ data: { data: { serviceOutcome: null } } });
    // An answer we cannot verify may still have been recorded: treated as unknown, replayed with the same command.
    await expect(port.stop(order, input)).rejects.toMatchObject({ uncertain: true });
  });
});

describe('contact readiness', () => {
  const ready = { contactCount: 2, notificationSent: true, callsSpaced: true, nextCallAt: null, nextEligibleAt: '2026-11-23T10:00:00Z', serverNow: '2026-11-23T10:30:00Z', ready: true };

  it('reads a solo order and a visit from their own routes', async () => {
    const port = createCannotContinuePort();
    api.get.mockResolvedValue({ data: { data: ready } });
    await expect(port.readiness(order)).resolves.toMatchObject({ ready: true, contactCount: 2 });
    expect(api.get).toHaveBeenLastCalledWith(`/service-orders/${ORDER}/contact-readiness`);
    await port.readiness(group);
    expect(api.get).toHaveBeenLastCalledWith(`/visit-groups/${GROUP}/contact-readiness`, { params: { selectedOrderId: ORDER } });
  });

  it('refuses a ready flag the numbers do not back', () => {
    expect(() => readReadiness({ ...ready, contactCount: 1 })).toThrow('Chưa xác minh');
    expect(() => readReadiness({ ...ready, nextEligibleAt: '2026-11-23T11:00:00Z' })).toThrow('Chưa xác minh');
  });

  it('keeps the contact command id until the server answers', async () => {
    const port = createCannotContinuePort();
    api.post.mockRejectedValueOnce(new Error('offline'));
    await expect(port.contact(order, 'CALL_ATTEMPT')).rejects.toThrow('offline');
    expect(port.pendingContact(order)).toBe('CALL_ATTEMPT');
    await expect(port.contact(order, 'IN_APP_NOTIFICATION')).rejects.toThrow('đối chiếu');
    api.post.mockResolvedValue({ data: { data: ready } });
    await port.contact(order, 'CALL_ATTEMPT');
    expect(api.post.mock.calls[1][1].commandId).toBe(api.post.mock.calls[0][1].commandId);
    expect(api.post.mock.calls[0][0]).toBe(`/service-orders/${ORDER}/contact-attempt`);
    expect(port.pendingContact(order)).toBeNull();
  });
});
