import * as Location from 'expo-location';
import { ordersApi } from '../../../api/orders.api';
import { useAuthStore } from '../../../store/auth.store';
import { sameOrderSession, type OrderSessionKey } from '../domain/order-session.types';
import type { OrderCommandJournal } from '../runtime/order-command-journal';
import type { OrderReadCoordinator } from '../runtime/order-read-coordinator';
import { createArrivalProofController, type FreshOrderPosition } from './arrival-proof-controller';
import { createOrderLocationTracker } from './order-location-tracker';
import { newEntryIntentId } from '../runtime/entry-attempt-production';

export interface ArrivalProofRuntime {
  coordinator: OrderReadCoordinator; journal: OrderCommandJournal;
  getKey: () => OrderSessionKey | null; isActive: () => boolean;
}
function currentKey(runtime: ArrivalProofRuntime): OrderSessionKey | null {
  const key = runtime.getKey(), auth = useAuthStore.getState();
  return key && auth.isAuthenticated && auth.user?.role === 'technician'
    && sameOrderSession({ userId: auth.user.id, role: 'technician', sessionGeneration: auth.sessionGeneration, serviceOrderId: key.serviceOrderId }, key) ? key : null;
}
export function createProductionArrivalProofController(runtime: ArrivalProofRuntime) {
  return createArrivalProofController({ ...runtime, getKey: () => currentKey(runtime), newIntentId: newEntryIntentId,
    transport: { depart: ordersApi.enRoute, checkIn: ordersApi.checkIn, uploadFace: ordersApi.uploadCheckInFace,
      uploadBefore: ordersApi.uploadEvidenceBefore, recoverRepair: ordersApi.startRepair, deleteEvidence: ordersApi.deleteEvidence },
  });
}
function fromLocation(p: Location.LocationObject): FreshOrderPosition {
  return { source: 'os', permission: 'granted', lat: p.coords.latitude, lng: p.coords.longitude,
    accuracyMeters: p.coords.accuracy ?? Number.NaN, timestamp: p.timestamp };
}
/** UI calls at point of use, after explaining permission; never destination/cache GPS. */
export async function captureFreshOrderPosition(): Promise<FreshOrderPosition> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) return { source: 'os', permission: 'denied', lat: Number.NaN, lng: Number.NaN, accuracyMeters: Number.NaN, timestamp: Date.now() };
  return fromLocation(await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }));
}
export function createProductionOrderLocationTracker(runtime: ArrivalProofRuntime) {
  return createOrderLocationTracker({ coordinator: runtime.coordinator, getKey: () => runtime.isActive() ? currentKey(runtime) : null,
    patch: ordersApi.updateOrderLocation,
    watch: async onPosition => {
      if (!(await Location.getForegroundPermissionsAsync()).granted) throw Error('Location permission required');
      const watcher = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, timeInterval: 15000, distanceInterval: 20 }, p => onPosition(fromLocation(p)));
      return () => watcher.remove();
    },
  });
}
