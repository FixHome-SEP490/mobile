import { useEffect } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import { technicianProfileApi } from '../api/technician-profile.api';

const EVERY_MS = 5 * 60_000;

/**
 * While the technician app is in the foreground, report the GPS position every
 * five minutes (PO 08/10/2026: urgent jobs go to whoever is nearby, using a fix
 * younger than 15 minutes). Never prompts on its own: it uses the permission
 * the technician already gave for check-in and directions.
 */
export function useTechnicianLocationPing(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    const ping = async () => {
      try {
        const permission = await Location.getForegroundPermissionsAsync();
        if (cancelled || permission.status !== 'granted') return;
        const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (cancelled) return;
        await technicianProfileApi.reportLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracyMeters: position.coords.accuracy ?? undefined,
        });
      } catch {
        // next tick retries; a missing fix must never disturb the app
      }
    };
    void ping();
    const timer = setInterval(() => { if (AppState.currentState === 'active') void ping(); }, EVERY_MS);
    const sub = AppState.addEventListener('change', (state) => { if (state === 'active') void ping(); });
    return () => { cancelled = true; clearInterval(timer); sub.remove(); };
  }, [enabled]);
}
