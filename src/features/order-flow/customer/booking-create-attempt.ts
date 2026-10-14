import type { BookingItem, CreateBookingDto } from '../../../api/bookings.api';
import type { EntryAttemptJournal } from '../runtime/entry-attempt-journal';
export interface BookingAttemptResult { phase: 'idle' | 'submitting' | 'verifying' | 'unknown' | 'denied' | 'resolved'; bookingId?: string; provenUnsent?: true }
export function createBookingAttemptController(deps: {
  journal: EntryAttemptJournal;
  api: { createBooking: (dto: CreateBookingDto) => Promise<Pick<BookingItem, 'id' | 'customerId'>>; getBooking: (id: string) => Promise<Pick<BookingItem, 'id' | 'customerId'>> };
  isCurrent: (owner: string) => boolean;
  newIntentId: () => string;
}) {
  async function verify(owner: string): Promise<BookingAttemptResult> {
    try {
      await deps.journal.restore(); if (!deps.isCurrent(owner)) return { phase: 'denied' };
      const marker = deps.journal.list(owner).find(r => r.kind === 'booking-create' && !r.resolved);
      if (!marker) return { phase: 'idle' };
      if (!marker.confirmedId) return { phase: 'unknown' };
      const row = await deps.api.getBooking(marker.confirmedId);
      if (!deps.isCurrent(owner) || row.id !== marker.confirmedId || row.customerId !== owner) return { phase: 'unknown' };
      await deps.journal.resolve(owner, marker.intentId);
      return deps.isCurrent(owner) ? { phase: 'resolved', bookingId: row.id } : { phase: 'denied' };
    } catch { return { phase: 'unknown' }; }
  }
  return { verify,
    async create(owner: string, dto: CreateBookingDto, baselineIds: string[] | null): Promise<BookingAttemptResult> {
      let dispatched = false;
      const intentId = deps.newIntentId();
      try {
        await deps.journal.restore();
        if (!deps.isCurrent(owner)) {
          const absent = !deps.journal.blocked(owner, 'booking-create') && !deps.journal.list(owner).some(marker => marker.intentId === intentId);
          return { phase: 'denied', ...(absent ? { provenUnsent: true as const } : {}) };
        }
        if (!await deps.journal.begin({ ownerUserId: owner, intentId, kind: 'booking-create', baselineIds, createdAt: Date.now() })) return { phase: 'unknown' };
        if (!deps.isCurrent(owner)) { await deps.journal.resolve(owner, intentId); return { phase: 'denied', provenUnsent: true }; }
        dispatched = true;
        const row = await deps.api.createBooking(dto);
        // Record real correlation for its original owner even when UI identity changed.
        await deps.journal.recordId(owner, intentId, row.id);
        return await verify(owner);
      } catch { return { phase: dispatched ? 'unknown' : 'denied' }; }
    },
  };
}
