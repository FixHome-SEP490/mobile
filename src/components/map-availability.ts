import { Platform } from 'react-native';
import Constants from 'expo-constants';

/**
 * Google Maps on Android needs an API key in the native build (app.config.js reads
 * FIXHOME_ANDROID_MAPS_API_KEY at build time and records androidMapsConfigured in extra).
 * Without it the native MapView throws "API key not found", so screens show a readable
 * fallback instead. iOS uses Apple Maps and needs no key.
 */
export function isNativeMapAvailable(
  platform: string = Platform.OS,
  extra: unknown = Constants.expoConfig?.extra,
): boolean {
  if (platform !== 'android') return true;
  return typeof extra === 'object' && extra !== null
    && (extra as Record<string, unknown>).androidMapsConfigured === true;
}

export const MAP_UNAVAILABLE_TITLE = 'Bản đồ chưa khả dụng trên bản ứng dụng này';
export const MAP_UNAVAILABLE_BODY = 'Bạn vẫn có thể tìm hoặc nhập địa chỉ, hoặc dùng vị trí hiện tại.';
