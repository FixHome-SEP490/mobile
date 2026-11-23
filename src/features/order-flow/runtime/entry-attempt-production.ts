import AsyncStorage from '@react-native-async-storage/async-storage';
import { bookingsApi, type BookingItem, type CreateBookingDto } from '../../../api/bookings.api';
import { createEntryAttemptJournal } from './entry-attempt-journal';
import { createBookingAttemptController } from '../customer/booking-create-attempt';
export const entryAttemptJournal = createEntryAttemptJournal(AsyncStorage);
let intentSequence = 0;
export const newEntryIntentId = () => `entry-${Date.now()}-${++intentSequence}-${Math.random().toString(36).slice(2, 10)}`;
/** `createBooking` replaces the plain POST when the booking is sent through a saved draft; the rest of the safety chain is the same. */
export function createProductionBookingAttempt(
  isCurrent: (owner: string) => boolean,
  createBooking?: (dto: CreateBookingDto) => Promise<Pick<BookingItem, 'id' | 'customerId'>>,
) {
  const api = createBooking ? { createBooking, getBooking: bookingsApi.getBooking } : bookingsApi;
  return createBookingAttemptController({ journal: entryAttemptJournal, api, isCurrent, newIntentId: newEntryIntentId });
}
