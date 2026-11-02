// src/constants/config.ts
import { NativeModules, Platform } from 'react-native';
import Constants from 'expo-constants';

// Metro's LAN host follows the workstation network. Never ship that host in a build.
function developmentApiUrl(): string | undefined {
  if (!__DEV__ || Platform.OS === 'web') return undefined;
  const hostUri = Constants.expoConfig?.hostUri;
  const scriptURL: unknown = NativeModules.SourceCode?.scriptURL;
  const authority = hostUri || (typeof scriptURL === 'string'
    ? /^https?:\/\/([^/]+)\//.exec(scriptURL)?.[1] : undefined);
  if (!authority) return undefined;
  const match = /^([a-zA-Z0-9]+(?:[.-][a-zA-Z0-9]+)*)(?::([0-9]{1,5}))?$/.exec(authority);
  if (!match || (match[2] && (Number(match[2]) < 1 || Number(match[2]) > 65535))) return undefined;
  const host = match[1].toLowerCase();
  // A tunnel proxies Metro only, not the backend. Use an explicit API override there.
  if (host.endsWith('.exp.direct') || host === 'localhost' || host.startsWith('127.') || host === '0.0.0.0') return undefined;
  return `http://${host}:3000/api/v1`;
}

export const APP_CONFIG = {
  API_BASE_URL: process.env.EXPO_PUBLIC_API_BASE_URL || developmentApiUrl() || (Platform.OS === 'android' ? 'http://10.0.2.2:3000/api/v1' : 'http://localhost:3000/api/v1'),
  APP_NAME: process.env.EXPO_PUBLIC_APP_NAME || 'FixHome',
  REQUEST_TIMEOUT: 15000,
};

// ponytail: the Backend ranks and checks every skilled technician (24-32 s seen for a two-device visit); lower this once that is fast.
export const CANDIDATES_TIMEOUT_MS = 60000;
