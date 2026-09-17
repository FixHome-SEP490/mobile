// src/api/client.ts
import axios, {
  type AxiosInstance,
  type InternalAxiosRequestConfig,
  type AxiosError,
} from 'axios';
import { APP_CONFIG } from '../constants';
import { storageService } from '../services/storage.service';
import { useAuthStore } from '../store/auth.store';

const apiClient: AxiosInstance = axios.create({
  baseURL: APP_CONFIG.API_BASE_URL,
  timeout: APP_CONFIG.REQUEST_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Track whether a refresh is already in progress to avoid infinite loops
let isRefreshing = false;
let failedQueue: {
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}[] = [];

function processQueue(error: unknown, token: string | null = null) {
  failedQueue.forEach((pending) => {
    if (error) {
      pending.reject(error);
    } else {
      pending.resolve(token!);
    }
  });
  failedQueue = [];
}

// Request interceptor – attach JWT token
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const token = await storageService.getToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// Response interceptor – handle 401 with token refresh
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    // Only attempt refresh on 401, and only once per request
    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      if (originalRequest.url?.includes('/auth/') && !originalRequest.url?.includes('/auth/refresh')) return Promise.reject(error);
      // Don't try to refresh if the failing request was itself the refresh call
      if (originalRequest.url?.includes('/auth/refresh')) {
        await storageService.clearAll();
        useAuthStore.getState().logout();
        return Promise.reject(error);
      }

      if (isRefreshing) {
        originalRequest._retry = true;
        // Queue the request while another refresh is in progress
        return new Promise((resolve, reject) => {
          failedQueue.push({
            resolve: (token: string) => {
              originalRequest.headers.Authorization = `Bearer ${token}`;
              resolve(apiClient(originalRequest));
            },
            reject,
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshToken = await storageService.getRefreshToken();
        if (!refreshToken) {
          throw error;
        }

        const res = await axios.post(
          `${APP_CONFIG.API_BASE_URL}/auth/refresh`,
          { refreshToken },
          { timeout: APP_CONFIG.REQUEST_TIMEOUT },
        );

        const data = res.data?.data ?? res.data;
        const newAccessToken = data.accessToken;
        const newRefreshToken = data.refreshToken;
        if (typeof newAccessToken !== 'string' || !newAccessToken || typeof newRefreshToken !== 'string' || !newRefreshToken) throw new Error('Invalid refresh response');

        await storageService.setToken(newAccessToken);
        if (newRefreshToken) {
          await storageService.setRefreshToken(newRefreshToken);
        }

        processQueue(null, newAccessToken);
        const user = useAuthStore.getState().user;
        if (user) useAuthStore.getState().setAuth(newAccessToken, user);

        // Retry original request with new token
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        await storageService.clearAll();
        useAuthStore.getState().logout();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    if (error.response?.status === 401 && originalRequest?._retry) {
      await storageService.clearAll();
      useAuthStore.getState().logout();
    }
    return Promise.reject(error);
  },
);

export default apiClient;
