import { Platform } from 'react-native';
import Constants from 'expo-constants';

/**
 * Maps come from MapTiler (the same streets style as the web app), drawn by MapLibre.
 * The key is EXPO_PUBLIC_MAPTILER_KEY, inlined into the bundle at build time (GitHub secret
 * for the APK, .env locally). Without it the screens show a readable placeholder instead of an
 * empty grey map; the web build keeps its own fallback component.
 */
export function mapTilerKey(value: string | undefined = process.env.EXPO_PUBLIC_MAPTILER_KEY): string {
  return value?.trim() ?? '';
}

/** Expo Go has no MapLibre native module: loading it there crashes the app (BUG DETECTOR 211). */
export function isExpoGo(environment: string | undefined = Constants.executionEnvironment): boolean {
  return environment === 'storeClient';
}

export function isNativeMapAvailable(
  platform: string = Platform.OS,
  key: string = mapTilerKey(),
  expoGo: boolean = isExpoGo(),
): boolean {
  return platform !== 'web' && !expoGo && key.length > 0;
}

/** MapTiler streets style, as on the web (`MapTilerMap.vue`). */
export function mapTilerStyleUrl(key: string = mapTilerKey()): string {
  return `https://api.maptiler.com/maps/streets-v2/style.json?key=${encodeURIComponent(key)}`;
}

/** react-native-maps style region delta -> MapLibre zoom (0.02° is about street level, 100° the whole world). */
export function zoomForDelta(delta: number): number {
  const safe = Number.isFinite(delta) && delta > 0 ? delta : 0.02;
  return Math.max(0, Math.min(18, Math.log2(360 / safe)));
}

export const MAP_UNAVAILABLE_TITLE = 'Bản đồ chưa khả dụng trên bản ứng dụng này';
export const MAP_EXPO_GO_TITLE = 'Bản đồ chỉ có trên bản cài APK';

/** The placeholder title: Expo Go says where the map is, other builds that they have none. */
export function mapUnavailableTitle(expoGo: boolean = isExpoGo()): string {
  return expoGo ? MAP_EXPO_GO_TITLE : MAP_UNAVAILABLE_TITLE;
}
export const MAP_UNAVAILABLE_BODY = 'Bạn vẫn có thể tìm hoặc nhập địa chỉ, hoặc dùng vị trí hiện tại.';
