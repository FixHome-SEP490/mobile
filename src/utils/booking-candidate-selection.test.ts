import { canChooseTechnicians, orderedCandidateIds, toggleCandidate } from './booking-candidate-selection';
import type { BookingItem } from '../api/bookings.api';

const FIRST = '11111111-1111-4111-8111-111111111111';
const SECOND = '22222222-2222-4222-8222-222222222222';
const THIRD = '33333333-3333-4333-8333-333333333333';

describe('Booking customer selects exactly 2 distinct technician USER UUIDs in priority order', () => {
  it('first tap means priority one; second means standby; third is not silently added', () => {
    expect(toggleCandidate([], FIRST)).toEqual([FIRST]);
    expect(toggleCandidate([FIRST], SECOND)).toEqual([FIRST, SECOND]);
    expect(toggleCandidate([FIRST, SECOND], THIRD)).toEqual([FIRST, SECOND]);
    expect(orderedCandidateIds([FIRST, SECOND])).toEqual([FIRST, SECOND]);
  });
  it('tapping selected user removes them and promotes the remaining one', () => {
    expect(toggleCandidate([FIRST, SECOND], FIRST)).toEqual([SECOND]);
    expect(toggleCandidate([FIRST, SECOND], SECOND)).toEqual([FIRST]);
  });
  it('rejects empty, one, duplicated or malformed candidate ids before a POST', () => {
    expect(() => orderedCandidateIds([])).toThrow();
    expect(() => orderedCandidateIds([FIRST])).toThrow();
    expect(() => orderedCandidateIds([FIRST, FIRST])).toThrow();
    expect(() => orderedCandidateIds([FIRST, SECOND, THIRD])).toThrow();
    expect(() => orderedCandidateIds([FIRST, 'technician-profile-01'])).toThrow();
  });
  it('does not offer new shortlist while matching, pending, linked or expired', () => {
    const sample = {
      id: 'booking-1', status: 'SUBMITTED', preferredEndAt: '2030-10-21T10:00:00Z',
    } as BookingItem;
    const now = new Date('2026-09-22T10:00:00Z');
    expect(canChooseTechnicians(sample, now)).toBe(true);
    expect(canChooseTechnicians({ ...sample, status: 'MATCHING' }, now)).toBe(false);
    expect(canChooseTechnicians({ ...sample, status: 'MATCHED', serviceOrderId: 'order-1' }, now)).toBe(false);
    expect(canChooseTechnicians({ ...sample, status: 'SUBMITTED', invitations: [
      { id: 'i-1', bookingId: 'booking-1', priorityOrder: 1, status: 'PENDING', invitedAt: '2026-09-22T09:00:00Z', expiresAt: null },
    ] }, now)).toBe(false);
    expect(canChooseTechnicians({ ...sample, status: 'CLOSED' }, now)).toBe(true);
    expect(canChooseTechnicians({ ...sample, preferredEndAt: '2026-09-21T10:00:00Z' }, now)).toBe(false);
  });
  it('rejects invalid id selection instead of replacing it with a profile ID', () => {
    expect(() => toggleCandidate([], 'not-a-user-uuid')).toThrow();
  });
});