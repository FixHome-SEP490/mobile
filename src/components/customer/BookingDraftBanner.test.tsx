import React from 'react';
import { Alert } from 'react-native';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import BookingDraftBanner from './BookingDraftBanner';

const mockCurrent = jest.fn();
const mockDiscard = jest.fn();
const mockNavigate = jest.fn();
let mockRole: string | undefined = 'customer';

jest.mock('../../api/booking-drafts.api', () => {
  const actual = jest.requireActual<typeof import('../../api/booking-drafts.api')>('../../api/booking-drafts.api');
  // The banner reads through fetchCurrentBookingDraft (which never throws), so that is what is replaced.
  return { ...actual, fetchCurrentBookingDraft: (...a: unknown[]) => mockCurrent(...a), bookingDraftsApi: { discard: (...a: unknown[]) => mockDiscard(...a) } };
});
jest.mock('@react-navigation/native', () => {
  const R = jest.requireActual<typeof import('react')>('react');
  return { useNavigation: () => ({ navigate: mockNavigate }), useFocusEffect: (effect: () => void | (() => void)) => R.useEffect(effect, [effect]) };
});
jest.mock('../../store/auth.store', () => ({
  useAuthStore: (select: (s: unknown) => unknown) => select({ isAuthenticated: !!mockRole, user: mockRole ? { role: mockRole } : null }),
}));

const draft = { id: 'd1', version: 2, expiresAt: '2026-12-23T03:30:00Z', snapshot: { kind: 'visit_group', items: [{}, {}] } };
const mounted: ReturnType<typeof create>[] = [];
const render = async () => { let r!: ReturnType<typeof create>; await act(async () => { r = create(<BookingDraftBanner />); }); mounted.push(r); return r; };
afterEach(async () => { await act(async () => { mounted.splice(0).forEach((r) => r.unmount()); }); });
const byId = (r: ReturnType<typeof create>, id: string): ReactTestInstance => r.root.findAll((n) => n.props.testID === id && typeof n.props.onPress === 'function')[0];
const text = (r: ReturnType<typeof create>) => JSON.stringify(r.toJSON());

beforeEach(() => { jest.clearAllMocks(); mockRole = 'customer'; mockCurrent.mockResolvedValue(draft); });

describe('BookingDraftBanner', () => {
  it('shows the saved draft with its summary and expiry, and continues it', async () => {
    const r = await render();
    expect(text(r)).toContain('Đơn đặt lịch chưa hoàn tất');
    expect(text(r)).toContain('Lượt nhiều thiết bị · 2 thiết bị');
    expect(text(r)).toContain('Hết hạn 23/12/2026 10:30');
    await act(async () => byId(r, 'booking-draft-resume').props.onPress());
    expect(mockNavigate).toHaveBeenCalledWith('CustomerBookingCreate', { resumeDraft: true });
  });

  it('shows nothing without a draft or for a technician', async () => {
    mockCurrent.mockResolvedValue(null);
    expect((await render()).toJSON()).toBeNull();
    mockRole = 'technician';
    mockCurrent.mockResolvedValue(draft);
    expect((await render()).toJSON()).toBeNull();
  });

  it('asks before discarding, then removes the draft', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => { buttons?.find((b) => b.style === 'destructive')?.onPress?.(); });
    mockDiscard.mockResolvedValue({ deleted: true });
    const r = await render();
    await act(async () => byId(r, 'booking-draft-discard').props.onPress());
    expect(alert).toHaveBeenCalledWith('Huỷ bản nháp đặt lịch?', expect.any(String), expect.any(Array));
    expect(mockDiscard).toHaveBeenCalledTimes(1);
    expect(text(r)).toContain('Đã huỷ bản nháp.');
    expect(text(r)).not.toContain('Tiếp tục đặt');
    alert.mockRestore();
  });
});
