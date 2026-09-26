import {
  classifyLinkedShortlistPostError,
  hasPositiveNewInvitations,
  invitationIds,
  isVisibleBookingOwner,
  validateLinkedReselectPrePost,
  type LinkedReselectPrePostSnapshot,
} from './customer-linked-reselect';
import type { BookingItem, CustomerBookingInvitation } from '../../api/bookings.api';
import type { ServiceOrderItem } from '../../api/orders.api';

const CUSTOMER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BOOKING_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ORDER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const TECH_ONE = '11111111-1111-4111-8111-111111111111';
const TECH_TWO = '22222222-2222-4222-8222-222222222222';
const OLD_ONE = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const OLD_TWO = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const NEW_INVITE = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const OTHER_CUSTOMER = '99999999-9999-4999-8999-999999999999';
// Fixture window is 2026-09-25T10:00–12:00Z; pinning now keeps pre-POST tests deterministic.
const TEST_NOW = new Date('2026-09-24T10:00:00Z');
const EXPIRED_NOW = new Date('2026-09-26T00:00:00Z');

const invitation = (id: string, status: CustomerBookingInvitation['status']): CustomerBookingInvitation => ({
  id, bookingId: BOOKING_ID, priorityOrder: 1, status, invitedAt: '2026-09-24T09:00:00Z', expiresAt: null,
});

const booking = (overrides: Partial<BookingItem> = {}): BookingItem => ({
  id: BOOKING_ID,
  customerId: CUSTOMER_ID,
  serviceOrderId: ORDER_ID,
  serviceId: 'service-1',
  addressId: 'address-1',
  description: 'Replacement round',
  status: 'CLOSED',
  urgency: 'NORMAL',
  preferredStartAt: '2026-09-25T10:00:00Z',
  preferredEndAt: '2026-09-25T12:00:00Z',
  createdAt: '2026-09-20T08:00:00Z',
  invitations: [invitation(OLD_ONE, 'DECLINED'), invitation(OLD_TWO, 'EXPIRED')],
  ...overrides,
} as BookingItem);

const order = (overrides: Partial<ServiceOrderItem> = {}): ServiceOrderItem => ({
  id: ORDER_ID,
  code: 'FH-20260920-ABCD1234',
  bookingId: BOOKING_ID,
  serviceName: 'Tap repair',
  status: 'ACCEPTED',
  customerName: 'An',
  customerPhone: '090',
  addressSummary: 'HCM',
  scheduledAt: '2026-09-25T10:00:00Z',
  laborTotal: 100,
  partsTotal: 0,
  grandTotal: 100,
  paymentStatus: 'UNPAID',
  createdAt: '2026-09-20T09:00:00Z',
  ...overrides,
} as ServiceOrderItem);

const snapshot = (overrides: Partial<LinkedReselectPrePostSnapshot> = {}): LinkedReselectPrePostSnapshot => ({
  bookingId: BOOKING_ID,
  serviceOrderId: ORDER_ID,
  customerId: CUSTOMER_ID,
  bookingStatus: 'CLOSED',
  orderStatus: 'ACCEPTED',
  preferredStartAt: '2026-09-25T10:00:00Z',
  preferredEndAt: '2026-09-25T12:00:00Z',
  invitationIds: [OLD_ONE, OLD_TWO],
  selectedIds: [TECH_ONE, TECH_TWO],
  candidateUserIds: [TECH_ONE, TECH_TWO],
  ...overrides,
});

describe('R07 linked shortlist POST response classification (no automatic retry)', () => {
  it.each([409, 422, 403])('status %i is definitive: reconcile with GET, never re-POST', (status) => {
    expect(classifyLinkedShortlistPostError({ response: { status } })).toBe('definitive');
  });
  it('status 404 on POST is definitive (wrong ID): fail closed without retry', () => {
    expect(classifyLinkedShortlistPostError({ response: { status: 404 } })).toBe('definitive');
  });
  it('status 401 is denied: hide candidates and fail closed', () => {
    expect(classifyLinkedShortlistPostError({ response: { status: 401 } })).toBe('denied');
  });
  it.each([
    ['timeout with no response', { request: {}, message: 'timeout of 0ms exceeded' }],
    ['offline network error', { message: 'Network Error' }],
    ['server 500', { response: { status: 500 } }],
    ['unknown shape', new Error('boom')],
  ])('R09 %s is ambiguous: keep the support lock, never infer failure', (_label, error) => {
    expect(classifyLinkedShortlistPostError(error)).toBe('ambiguous');
  });
});

describe('R08/R09 positive new-invitation evidence (never infer POST outcome from status alone)', () => {
  it('detects a newly created invitation UUID after an ambiguous POST', () => {
    expect(hasPositiveNewInvitations([OLD_ONE, OLD_TWO], [invitation(OLD_ONE, 'DECLINED'), invitation(NEW_INVITE, 'PENDING')])).toBe(true);
  });
  it('a status change with the same invitation IDs is NOT positive evidence', () => {
    expect(hasPositiveNewInvitations([OLD_ONE, OLD_TWO], [invitation(OLD_ONE, 'PENDING'), invitation(OLD_TWO, 'EXPIRED')])).toBe(false);
    expect(hasPositiveNewInvitations([OLD_ONE, OLD_TWO], [invitation(OLD_ONE, 'DECLINED'), invitation(OLD_TWO, 'EXPIRED')])).toBe(false);
  });
  it('missing, null, or empty current invitations are never positive evidence', () => {
    expect(hasPositiveNewInvitations([OLD_ONE], null)).toBe(false);
    expect(hasPositiveNewInvitations([OLD_ONE], undefined)).toBe(false);
    expect(hasPositiveNewInvitations([OLD_ONE], [])).toBe(false);
  });
  it('invitationIds extracts stable string IDs and ignores malformed entries', () => {
    expect(invitationIds([invitation(OLD_ONE, 'DECLINED'), { id: '' } as CustomerBookingInvitation])).toEqual([OLD_ONE]);
    expect(invitationIds(null)).toEqual([]);
  });
});

describe('R07/R10 pre-POST revalidation (exactly one POST only on a fresh match)', () => {
  it('passes when Booking + Order + customer + window + selection + candidates are unchanged', () => {
    expect(validateLinkedReselectPrePost(snapshot(), booking(), order(), CUSTOMER_ID, [TECH_ONE, TECH_TWO], [TECH_ONE, TECH_TWO], TEST_NOW)).toBe(true);
  });
  it('fails when booking status, order status, or the ServiceOrder identity changed', () => {
    expect(validateLinkedReselectPrePost(snapshot(), booking({ status: 'MATCHING' }), order(), CUSTOMER_ID, [TECH_ONE, TECH_TWO], [TECH_ONE, TECH_TWO], TEST_NOW)).toBe(false);
    expect(validateLinkedReselectPrePost(snapshot(), booking(), order({ status: 'UNDER_REPAIR' }), CUSTOMER_ID, [TECH_ONE, TECH_TWO], [TECH_ONE, TECH_TWO], TEST_NOW)).toBe(false);
    expect(validateLinkedReselectPrePost(snapshot(), booking(), order({ id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', bookingId: BOOKING_ID }), CUSTOMER_ID, [TECH_ONE, TECH_TWO], [TECH_ONE, TECH_TWO], TEST_NOW)).toBe(false);
  });
  it('fails when invitations, time window, customer, selection, or candidates changed', () => {
    expect(validateLinkedReselectPrePost(snapshot(), booking({ invitations: [invitation(NEW_INVITE, 'PENDING')] }), order(), CUSTOMER_ID, [TECH_ONE, TECH_TWO], [TECH_ONE, TECH_TWO], TEST_NOW)).toBe(false);
    expect(validateLinkedReselectPrePost(snapshot(), booking({ preferredEndAt: '2026-09-25T13:00:00Z' }), order(), CUSTOMER_ID, [TECH_ONE, TECH_TWO], [TECH_ONE, TECH_TWO], TEST_NOW)).toBe(false);
    expect(validateLinkedReselectPrePost(snapshot(), booking(), order(), '99999999-9999-4999-8999-999999999999', [TECH_ONE, TECH_TWO], [TECH_ONE, TECH_TWO], TEST_NOW)).toBe(false);
    expect(validateLinkedReselectPrePost(snapshot(), booking(), order(), CUSTOMER_ID, [TECH_TWO, TECH_ONE], [TECH_ONE, TECH_TWO], TEST_NOW)).toBe(false);
    expect(validateLinkedReselectPrePost(snapshot(), booking(), order(), CUSTOMER_ID, [TECH_ONE, TECH_TWO], [TECH_ONE], TEST_NOW)).toBe(false);
  });
  it('fails closed on wrong booking ID, unauthorized GET, or malformed reads', () => {
    expect(validateLinkedReselectPrePost(snapshot(), booking({ id: 'ffffffff-ffff-4fff-8fff-ffffffffffff' }), order(), CUSTOMER_ID, [TECH_ONE, TECH_TWO], [TECH_ONE, TECH_TWO], TEST_NOW)).toBe(false);
    expect(validateLinkedReselectPrePost(snapshot(), null, order(), CUSTOMER_ID, [TECH_ONE, TECH_TWO], [TECH_ONE, TECH_TWO], TEST_NOW)).toBe(false);
    expect(validateLinkedReselectPrePost(snapshot(), booking(), null, CUSTOMER_ID, [TECH_ONE, TECH_TWO], [TECH_ONE, TECH_TWO], TEST_NOW)).toBe(false);
  });
});

describe('P1a visible-booking ownership gate (A-to-B account switch must never leak)', () => {
  it('the signed-in owner may see their own booking', () => {
    expect(isVisibleBookingOwner(booking(), CUSTOMER_ID)).toBe(true);
  });
  it('customer B never sees customer A booking content', () => {
    expect(isVisibleBookingOwner(booking(), OTHER_CUSTOMER)).toBe(false);
  });
  it('missing customerId fails closed (never render private content)', () => {
    expect(isVisibleBookingOwner(booking({ customerId: undefined }), CUSTOMER_ID)).toBe(false);
    expect(isVisibleBookingOwner(booking({ customerId: '' }), CUSTOMER_ID)).toBe(false);
  });
  it('null booking or signed-out/empty identity fails closed', () => {
    expect(isVisibleBookingOwner(null, CUSTOMER_ID)).toBe(false);
    expect(isVisibleBookingOwner(undefined, CUSTOMER_ID)).toBe(false);
    expect(isVisibleBookingOwner(booking(), null)).toBe(false);
    expect(isVisibleBookingOwner(booking(), '')).toBe(false);
  });
});

describe('P1b pre-POST end-of-window recheck (no POST after expiry even if strings match)', () => {
  it('rejects when the preferred window already ended before dispatch', () => {
    expect(validateLinkedReselectPrePost(snapshot(), booking(), order(), CUSTOMER_ID, [TECH_ONE, TECH_TWO], [TECH_ONE, TECH_TWO], EXPIRED_NOW)).toBe(false);
  });
  it('rejects at the exact end boundary (end must stay strictly future)', () => {
    const atEnd = new Date('2026-09-25T12:00:00Z');
    expect(validateLinkedReselectPrePost(snapshot(), booking(), order(), CUSTOMER_ID, [TECH_ONE, TECH_TWO], [TECH_ONE, TECH_TWO], atEnd)).toBe(false);
  });
  it('still passes with a valid future window at dispatch time', () => {
    expect(validateLinkedReselectPrePost(snapshot(), booking(), order(), CUSTOMER_ID, [TECH_ONE, TECH_TWO], [TECH_ONE, TECH_TWO], TEST_NOW)).toBe(true);
  });
});
