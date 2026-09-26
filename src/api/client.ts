// src/api/client.ts
import axios, {
  type AxiosInstance,
  type InternalAxiosRequestConfig,
  type AxiosError,
} from 'axios';
import { APP_CONFIG } from '../constants';
import { storageService } from '../services/storage.service';
import { useAuthStore } from '../store/auth.store';

interface AuthSessionSnapshot {
  generation: number;
  userId: string | null;
  isAuthenticated: boolean;
}

type SessionAwareRequestConfig = InternalAxiosRequestConfig & {
  _retry?: boolean;
  _authSession?: AuthSessionSnapshot;
};

interface ActiveRefresh {
  session: AuthSessionSnapshot;
  promise: Promise<string>;
}

const SAFE_REPLAY_METHODS = new Set(['get', 'head', 'options']);

let activeRefresh: ActiveRefresh | null = null;

class StaleAuthSessionError extends Error {
  constructor() {
    super('Authentication session changed while the request was in flight');
    this.name = 'StaleAuthSessionError';
  }
}

function getAuthSessionSnapshot(): AuthSessionSnapshot {
  const state = useAuthStore.getState();
  return {
    generation: state.sessionGeneration,
    userId: state.user?.id ?? null,
    isAuthenticated: state.isAuthenticated,
  };
}

function isSameAuthSession(
  left: AuthSessionSnapshot,
  right: AuthSessionSnapshot,
): boolean {
  return (
    left.generation === right.generation &&
    left.userId === right.userId &&
    left.isAuthenticated === right.isAuthenticated
  );
}

function isCurrentAuthSession(session: AuthSessionSnapshot): boolean {
  return isSameAuthSession(session, getAuthSessionSnapshot());
}

function assertCurrentAuthSession(session: AuthSessionSnapshot): void {
  if (!isCurrentAuthSession(session)) {
    throw new StaleAuthSessionError();
  }
}

function isSafeReplayMethod(method?: string): boolean {
  return SAFE_REPLAY_METHODS.has((method ?? 'get').toLowerCase());
}

function isAuthEndpoint(url?: string): boolean {
  return Boolean(url?.startsWith('/auth/') || url?.includes('/auth/'));
}

async function clearAuthForMatchingSession(
  session: AuthSessionSnapshot,
): Promise<void> {
  if (!isCurrentAuthSession(session)) return;

  await storageService.clearAll();

  if (!isCurrentAuthSession(session)) return;
  useAuthStore.getState().logout();
}

async function performRefresh(session: AuthSessionSnapshot): Promise<string> {
  assertCurrentAuthSession(session);

  const refreshToken = await storageService.getRefreshToken();
  assertCurrentAuthSession(session);
  if (!refreshToken) {
    throw new Error('No refresh token available');
  }

  const res = await axios.post(
    `${APP_CONFIG.API_BASE_URL}/auth/refresh`,
    { refreshToken },
    { timeout: APP_CONFIG.REQUEST_TIMEOUT },
  );

  assertCurrentAuthSession(session);

  const data = res.data?.data ?? res.data;
  const newAccessToken = data.accessToken;
  const newRefreshToken = data.refreshToken;

  if (
    typeof newAccessToken !== 'string' ||
    !newAccessToken ||
    typeof newRefreshToken !== 'string' ||
    !newRefreshToken
  ) {
    throw new Error('Invalid refresh response');
  }

  await storageService.setToken(newAccessToken);
  if (!isCurrentAuthSession(session)) {
    const currentToken = useAuthStore.getState().token;
    if (currentToken) {
      await storageService.setToken(currentToken);
    }
    throw new StaleAuthSessionError();
  }

  await storageService.setRefreshToken(newRefreshToken);
  assertCurrentAuthSession(session);

  const currentUser = useAuthStore.getState().user;
  if (currentUser) {
    useAuthStore.getState().setAuth(newAccessToken, currentUser);
  }

  return newAccessToken;
}

function getOrStartRefresh(session: AuthSessionSnapshot): Promise<string> {
  if (activeRefresh && isSameAuthSession(activeRefresh.session, session)) {
    return activeRefresh.promise;
  }

  const entry: ActiveRefresh = {
    session,
    promise: performRefresh(session),
  };
  activeRefresh = entry;

  void entry.promise.then(
    () => {
      if (activeRefresh === entry) activeRefresh = null;
    },
    () => {
      if (activeRefresh === entry) activeRefresh = null;
    },
  );

  return entry.promise;
}

const apiClient: AxiosInstance = axios.create({
  baseURL: APP_CONFIG.API_BASE_URL,
  timeout: APP_CONFIG.REQUEST_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor – attach JWT token and bind the request to the current auth session.
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const request = config as SessionAwareRequestConfig;
    const currentSession = getAuthSessionSnapshot();

    if (request._authSession) {
      if (!isSameAuthSession(request._authSession, currentSession)) {
        throw new StaleAuthSessionError();
      }
    } else {
      request._authSession = currentSession;
    }

    const token = await storageService.getToken();
    assertCurrentAuthSession(request._authSession);

    if (token && request.headers) {
      request.headers.Authorization = `Bearer ${token}`;
    }
    return request;
  },
  (error) => Promise.reject(error),
);

// Response interceptor – refresh only within the initiating auth session.
// Only safe read methods are automatically replayed.
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as SessionAwareRequestConfig | undefined;

    if (error.response?.status !== 401 || !originalRequest) {
      return Promise.reject(error);
    }

    const requestSession = originalRequest._authSession;
    if (!requestSession) {
      return Promise.reject(error);
    }

    if (!isCurrentAuthSession(requestSession)) {
      return Promise.reject(new StaleAuthSessionError());
    }

    // A refresh request must never recursively refresh itself.
    if (originalRequest.url?.includes('/auth/refresh')) {
      await clearAuthForMatchingSession(requestSession);
      return Promise.reject(error);
    }

    // Authentication endpoints are not replayed automatically.
    if (isAuthEndpoint(originalRequest.url)) {
      return Promise.reject(error);
    }

    // A second 401 after a safe replay invalidates only the same current session.
    if (originalRequest._retry) {
      await clearAuthForMatchingSession(requestSession);
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    try {
      const newAccessToken = await getOrStartRefresh(requestSession);
      assertCurrentAuthSession(requestSession);

      // A mutation may have side effects even when its response is uncertain.
      // Refresh the session for future calls, but require explicit user intent to retry it.
      if (!isSafeReplayMethod(originalRequest.method)) {
        return Promise.reject(error);
      }

      if (originalRequest.headers) {
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
      }
      return apiClient(originalRequest);
    } catch (refreshError) {
      if (
        refreshError instanceof StaleAuthSessionError ||
        !isCurrentAuthSession(requestSession)
      ) {
        return Promise.reject(
          refreshError instanceof StaleAuthSessionError
            ? refreshError
            : new StaleAuthSessionError(),
        );
      }

      await clearAuthForMatchingSession(requestSession);
      return Promise.reject(refreshError);
    }
  },
);

export default apiClient;