// src/constants/config.ts
import { Platform } from 'react-native';

export const APP_CONFIG = {
  API_BASE_URL: process.env.EXPO_PUBLIC_API_BASE_URL || (Platform.OS === 'android' ? 'http://10.0.2.2:3000/api/v1' : 'http://localhost:3000/api/v1'),
  APP_NAME: process.env.EXPO_PUBLIC_APP_NAME || 'FixHome',
  REQUEST_TIMEOUT: 15000,
};
