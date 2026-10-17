import { canShowCustomerMatchingRadar } from './customer-matching-radar-state';

const base = {
  booking: {
    status: 'MATCHING',
    invitations: [{ id: 'invite-1', priorityOrder: 1, status: 'PENDING' }],
  },
  context: {
    authenticatedCustomer: true,
    ownsBooking: true,
    focused: true,
    foreground: true,
    loading: false,
    refreshing: false,
    hasError: false,
    uncertainSend: false,
    attemptLocked: false,
    rejectedDefinitive: false,
  },
};

it('shows only for an owned, focused customer session with an eligible real pending invite', () => {
  expect(canShowCustomerMatchingRadar(base.booking, base.context)).toBe(true);

  for (const [key, value] of Object.entries({
    authenticatedCustomer: false,
    ownsBooking: false,
    focused: false,
    foreground: false,
    loading: true,
    refreshing: true,
    hasError: true,
    uncertainSend: true,
    attemptLocked: true,
    rejectedDefinitive: true,
  })) {
    expect(canShowCustomerMatchingRadar(base.booking, { ...base.context, [key]: value }))
      .toBe(false);
  }
});

it.each([
  ['SUBMITTED', [{ id: 'invite-1', priorityOrder: 1, status: 'PENDING' }]],
  ['MATCHED', [{ id: 'invite-1', priorityOrder: 1, status: 'PENDING' }]],
  ['MATCHING', []],
  ['MATCHING', [{ id: 'invite-1', priorityOrder: 1, status: 'STANDBY' }]],
  ['MATCHING', [{ id: 'invite-1', priorityOrder: 0, status: 'PENDING' }]],
  ['MATCHING', [
    { id: 'invite-1', priorityOrder: 1, status: 'PENDING' },
    { id: 'invite-2', priorityOrder: 2, status: 'ACCEPTED' },
  ]],
])('fails closed for booking state %s and ineligible invitations', (status, invitations) => {
  expect(canShowCustomerMatchingRadar({ status, invitations }, base.context)).toBe(false);
});
