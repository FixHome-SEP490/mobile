export type MatchingRadarBooking = {
  status?: string | null;
  invitations?: {
    priorityOrder?: number | null;
    status?: string | null;
  }[] | null;
};

export type CustomerMatchingRadarContext = {
  authenticatedCustomer: boolean;
  ownsBooking: boolean;
  focused: boolean;
  foreground: boolean;
  loading: boolean;
  refreshing: boolean;
  hasError: boolean;
  uncertainSend: boolean;
  attemptLocked: boolean;
  rejectedDefinitive: boolean;
};

/** Decorative pulse is reserved for a real, owner-bound pending Backend invitation. */
export function canShowCustomerMatchingRadar(
  booking: MatchingRadarBooking | null | undefined,
  context: CustomerMatchingRadarContext,
): boolean {
  if (!booking || booking.status !== 'MATCHING'
    || !context.authenticatedCustomer || !context.ownsBooking
    || !context.focused || !context.foreground
    || context.loading || context.refreshing || context.hasError
    || context.uncertainSend || context.attemptLocked || context.rejectedDefinitive) return false;

  const invitations = Array.isArray(booking.invitations) ? booking.invitations : [];
  return invitations.some((invitation) => invitation.status === 'PENDING'
    && Number.isInteger(invitation.priorityOrder)
    && (invitation.priorityOrder ?? 0) > 0)
    && !invitations.some((invitation) => invitation.status === 'ACCEPTED');
}
