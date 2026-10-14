import { useEffect, useLayoutEffect, useMemo, useSyncExternalStore } from 'react';
import { createProductionBookingAftercare } from '../aftercare/m7-production';
import { useAftercareOwner, useAftercarePresentation } from '../aftercare/useAftercareOwner';
import { entryAttemptJournal } from '../runtime/entry-attempt-production';
export function useBookingAftercare(bookingId: string | null, journal = entryAttemptJournal) {
  const { runtime, owner, active } = useAftercareOwner('customer');
  const controllers = useMemo(() => { const c = createProductionBookingAftercare(runtime, journal); c.booking.selectBooking(bookingId); return c; }, [runtime, journal, bookingId]);
  const { booking, support } = controllers;
  const bookingState = useSyncExternalStore(booking.subscribe, booking.getState, booking.getState);
  const supportState = useSyncExternalStore(support.subscribe, support.getState, support.getState);
  useLayoutEffect(() => support.revalidateConfirmation(), [support, bookingState]);
  useLayoutEffect(() => { booking.selectBooking(bookingId); return () => { booking.invalidatePresentation(); support.invalidatePresentation(); }; }, [booking, support, bookingId]);
  const clear = useMemo(() => () => { booking.invalidatePresentation(); support.invalidatePresentation(); }, [booking, support]);
  useAftercarePresentation(clear, active);
  useEffect(() => {
    let current = true;
    if (active && owner && bookingId) void (async () => {
      await booking.verify(); if (!current) return;
      if (booking.getState().phase === 'idle') await booking.refresh();
      if (current) await support.verify();
    })();
    return () => { current = false; };
  }, [booking, support, active, owner, bookingId]);
  return { booking, support, bookingState, supportState, context: booking.supportContext(), recovery: booking.recovery() };
}
