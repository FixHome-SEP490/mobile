import type { InvitationItem } from '../../api/bookings.api';
import {
  invitationClosedLabel, invitationCountdown, invitationDistanceText, invitationPriceText, sortInvitationsForDisplay,
} from './invitation-view';

const NOW = Date.parse('2026-09-30T07:00:00Z');
const at = (minutes: number) => new Date(NOW + minutes * 60000).toISOString();

const inv = (id: string, expiresAt: string | null, priorityOrder = 1, status: InvitationItem['status'] = 'PENDING') =>
  ({ id, bookingId: `b-${id}`, priorityOrder, status, invitedAt: at(-5), expiresAt }) as InvitationItem;

describe('invitationCountdown', () => {
  beforeAll(() => jest.useFakeTimers().setSystemTime(NOW));
  afterAll(() => jest.useRealTimers());

  it('formats minutes and hours from the server deadline', () => {
    expect(invitationCountdown(at(12), NOW)).toEqual({ label: 'Còn 12 phút', urgent: true });
    expect(invitationCountdown(at(60), NOW)).toEqual({ label: 'Còn 1 giờ', urgent: false });
    expect(invitationCountdown(at(135), NOW)).toEqual({ label: 'Còn 2 giờ 15 phút', urgent: false });
  });

  it('rounds sub-minute remainders up and flags urgency under 15 minutes', () => {
    expect(invitationCountdown(new Date(NOW + 20000).toISOString(), NOW)).toEqual({ label: 'Còn 1 phút', urgent: true });
    expect(invitationCountdown(at(15), NOW)?.urgent).toBe(false);
  });

  it('returns null with no deadline, an expired one, or garbage', () => {
    expect(invitationCountdown(null, NOW)).toBeNull();
    expect(invitationCountdown(at(-1), NOW)).toBeNull();
    expect(invitationCountdown('nope', NOW)).toBeNull();
  });
});

describe('sortInvitationsForDisplay', () => {
  beforeAll(() => jest.useFakeTimers().setSystemTime(NOW));
  afterAll(() => jest.useRealTimers());

  it('puts live invitations first, soonest deadline on top, expired last', () => {
    const list = [inv('expired', at(-10)), inv('late', at(50)), inv('soon', at(5)), inv('answered', at(30), 1, 'ACCEPTED')];
    expect(sortInvitationsForDisplay(list).map((i) => i.id)).toEqual(['soon', 'late', 'expired', 'answered']);
  });

  it('breaks deadline ties by priorityOrder and never drops items', () => {
    const list = [inv('b', at(20), 2), inv('a', at(20), 1)];
    const sorted = sortInvitationsForDisplay(list);
    expect(sorted.map((i) => i.id)).toEqual(['a', 'b']);
    expect(sortInvitationsForDisplay([])).toEqual([]);
  });
});

it('labels closed invitations by how they closed', () => {
  expect(invitationClosedLabel('ACCEPTED')).toBe('Đã nhận việc');
  expect(invitationClosedLabel('DECLINED')).toBe('Đã từ chối');
  expect(invitationClosedLabel('EXPIRED')).toBe('Đã hết hạn');
  expect(invitationClosedLabel('PENDING')).toBe('Đã hết hạn');
});

describe('invitation job preview text', () => {
  it('words the distance band like the web', () => {
    expect(invitationDistanceText({ minKm: 0, maxKm: 1 })).toBe('Cách bạn dưới 1 km');
    expect(invitationDistanceText({ minKm: 3, maxKm: 5 })).toBe('Cách bạn khoảng 3-5 km');
    expect(invitationDistanceText({ minKm: 40, maxKm: null })).toBe('Cách bạn hơn 40 km');
    expect(invitationDistanceText(null)).toBe('');
  });
  it('shows a listed price only for fixed_price, otherwise the quote-after-visit line', () => {
    const money = (n: number) => `${n}đ`;
    expect(invitationPriceText({ pricingMode: 'fixed_price', fixedUnitPrice: 150000, quantity: 2 }, money)).toBe('Giá niêm yết 150000đ × 2');
    expect(invitationPriceText({ pricingMode: 'inspection_required', fixedUnitPrice: null }, money)).toBe('Báo giá sau khi kiểm tra tại nhà khách');
    expect(invitationPriceText(undefined, money)).toBe('Báo giá sau khi kiểm tra tại nhà khách');
  });
});
