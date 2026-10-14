import AsyncStorage from '@react-native-async-storage/async-storage';
import { bookingsApi } from '../../../api/bookings.api';
import { createEntryAttemptJournal } from './entry-attempt-journal';
import { createBookingAttemptController } from '../customer/booking-create-attempt';
export const entryAttemptJournal = createEntryAttemptJournal(AsyncStorage);
let intentSequence = 0;
export const newEntryIntentId = () => `entry-${Date.now()}-${++intentSequence}-${Math.random().toString(36).slice(2, 10)}`;
export function createProductionBookingAttempt(isCurrent: (owner: string) => boolean) {
  return createBookingAttemptController({ journal: entryAttemptJournal, api: bookingsApi, isCurrent, newIntentId: newEntryIntentId });
}
