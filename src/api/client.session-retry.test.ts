import axios, {
  AxiosError,
  AxiosHeaders,
  type AxiosAdapter,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import apiClient from './client';
import { storageService } from '../services/storage.service';
import { useAuthStore } from '../store/auth.store';
import { UserRole, type UserInfo } from '../types';

jest.mock('../constants', () => ({
  APP_CONFIG: { API_BASE_URL: 'http://fixhome.test/api/v1', REQUEST_TIMEOUT: 1000 },
}));

jest.mock('../services/storage.service', () => ({
  storageService: {
    getToken: jest.fn(),
    setToken: jest.fn(),
    removeToken: jest.fn(),
    getRefreshToken: jest.fn(),
    setRefreshToken: jest.fn(),
    removeRefreshToken: jest.fn(),
    clearAll: jest.fn(),
  },
}));

const mockedStorage = storageService as jest.Mocked<typeof storageService>;
const originalAdapter = apiClient.defaults.adapter;

const userA: UserInfo = {
  id: 'account-a',
  email: 'a@fixhome.test',
  fullName: 'Account A',
  role: UserRole.CUSTOMER,
};

const userB: UserInfo = {
  id: 'account-b',
  email: 'b@fixhome.test',
  fullName: 'Account B',
  role: UserRole.CUSTOMER,
};

function axiosResponse(
  config: InternalAxiosRequestConfig,
  status = 200,
  data: unknown = { ok: true },
): AxiosResponse {
  return {
    data,
    status,
    statusText: String(status),
    headers: new AxiosHeaders(),
    config,
  };
}

function axiosStatusError(
  config: InternalAxiosRequestConfig,
  status: number,
): AxiosError {
  return new AxiosError(
    `HTTP ${status}`,
    undefined,
    config,
    undefined,
    axiosResponse(config, status, {}),
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function waitUntil(predicate: () => boolean, attempts = 30): Promise<void> {
  for (let i = 0; i < attempts; i += 1) {
    if (predicate()) return;
    await Promise.resolve();
  }
  throw new Error('Timed out waiting for mocked async boundary');
}

describe('api client auth-session retry safety', () => {
  let storedAccessToken: string | null;
  let storedRefreshToken: string | null;

  beforeEach(() => {
    jest.clearAllMocks();

    storedAccessToken = 'access-a';
    storedRefreshToken = 'refresh-a';

    mockedStorage.getToken.mockImplementation(async () => storedAccessToken);
    mockedStorage.getRefreshToken.mockImplementation(async () => storedRefreshToken);
    mockedStorage.setToken.mockImplementation(async (token) => {
      storedAccessToken = token;
    });
    mockedStorage.setRefreshToken.mockImplementation(async (token) => {
      storedRefreshToken = token;
    });
    mockedStorage.clearAll.mockImplementation(async () => {
      storedAccessToken = null;
      storedRefreshToken = null;
    });

    useAuthStore.setState({
      token: null,
      user: null,
      isAuthenticated: false,
      isLoading: false,
      sessionGeneration: 0,
    });
    useAuthStore.getState().setAuth('access-a', userA);
  });

  afterEach(() => {
    apiClient.defaults.adapter = originalAdapter;
    jest.restoreAllMocks();
  });

  it('refreshes and replays one same-session GET exactly once', async () => {
    let calls = 0;
    const adapter = jest.fn(async (config: InternalAxiosRequestConfig) => {
      calls += 1;
      if (calls === 1) throw axiosStatusError(config, 401);
      return axiosResponse(config, 200, { ok: true });
    });
    apiClient.defaults.adapter = adapter as AxiosAdapter;

    const refresh = jest.spyOn(axios, 'post').mockResolvedValue({
      data: {
        data: {
          accessToken: 'access-a-refreshed',
          refreshToken: 'refresh-a-refreshed',
        },
      },
    } as AxiosResponse);

    const response = await apiClient.get('/protected');

    expect(response.data).toEqual({ ok: true });
    expect(adapter).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(storedAccessToken).toBe('access-a-refreshed');
    expect(useAuthStore.getState()).toMatchObject({
      user: userA,
      token: 'access-a-refreshed',
      isAuthenticated: true,
    });
  });

  it('does not replay A mutation or mutate B auth when A refresh completes after switching to B', async () => {
    const adapter = jest.fn(async (config: InternalAxiosRequestConfig) => {
      throw axiosStatusError(config, 401);
    });
    apiClient.defaults.adapter = adapter as AxiosAdapter;

    const refreshResult = deferred<AxiosResponse>();
    jest.spyOn(axios, 'post').mockReturnValue(refreshResult.promise);

    const request = apiClient.post('/bookings', { serviceId: 'service-a' });
    await waitUntil(() => (axios.post as jest.Mock).mock.calls.length === 1);

    storedAccessToken = 'access-b';
    storedRefreshToken = 'refresh-b';
    useAuthStore.getState().beginSessionTransition();
    useAuthStore.getState().setAuth('access-b', userB);

    refreshResult.resolve({
      data: {
        data: {
          accessToken: 'access-a-stale',
          refreshToken: 'refresh-a-stale',
        },
      },
    } as AxiosResponse);

    await expect(request).rejects.toMatchObject({ name: 'StaleAuthSessionError' });

    expect(adapter).toHaveBeenCalledTimes(1);
    expect(mockedStorage.setToken).not.toHaveBeenCalled();
    expect(mockedStorage.setRefreshToken).not.toHaveBeenCalled();
    expect(mockedStorage.clearAll).not.toHaveBeenCalled();
    expect(storedAccessToken).toBe('access-b');
    expect(storedRefreshToken).toBe('refresh-b');
    expect(useAuthStore.getState()).toMatchObject({
      token: 'access-b',
      user: userB,
      isAuthenticated: true,
    });
  });

  it('isolates queued GETs when the account changes during a shared refresh', async () => {
    const adapter = jest.fn(async (config: InternalAxiosRequestConfig) => {
      throw axiosStatusError(config, 401);
    });
    apiClient.defaults.adapter = adapter as AxiosAdapter;

    const refreshResult = deferred<AxiosResponse>();
    const refresh = jest.spyOn(axios, 'post').mockReturnValue(refreshResult.promise);

    const first = apiClient.get('/first');
    const second = apiClient.get('/second');
    await waitUntil(() => adapter.mock.calls.length === 2 && refresh.mock.calls.length === 1);

    storedAccessToken = 'access-b';
    storedRefreshToken = 'refresh-b';
    useAuthStore.getState().beginSessionTransition();
    useAuthStore.getState().setAuth('access-b', userB);

    refreshResult.resolve({
      data: {
        data: {
          accessToken: 'access-a-stale',
          refreshToken: 'refresh-a-stale',
        },
      },
    } as AxiosResponse);

    await expect(first).rejects.toMatchObject({ name: 'StaleAuthSessionError' });
    await expect(second).rejects.toMatchObject({ name: 'StaleAuthSessionError' });

    expect(adapter).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(mockedStorage.clearAll).not.toHaveBeenCalled();
    expect(useAuthStore.getState()).toMatchObject({ token: 'access-b', user: userB });
  });

  it('does not let a stale refresh failure log out a newly logged-in account', async () => {
    const adapter = jest.fn(async (config: InternalAxiosRequestConfig) => {
      throw axiosStatusError(config, 401);
    });
    apiClient.defaults.adapter = adapter as AxiosAdapter;

    const refreshResult = deferred<AxiosResponse>();
    jest.spyOn(axios, 'post').mockReturnValue(refreshResult.promise);

    const request = apiClient.get('/protected');
    await waitUntil(() => (axios.post as jest.Mock).mock.calls.length === 1);

    useAuthStore.getState().logout();
    storedAccessToken = 'access-b';
    storedRefreshToken = 'refresh-b';
    useAuthStore.getState().beginSessionTransition();
    useAuthStore.getState().setAuth('access-b', userB);

    refreshResult.reject(new Error('refresh failed for old session'));

    await expect(request).rejects.toMatchObject({ name: 'StaleAuthSessionError' });

    expect(mockedStorage.clearAll).not.toHaveBeenCalled();
    expect(useAuthStore.getState()).toMatchObject({
      token: 'access-b',
      user: userB,
      isAuthenticated: true,
    });
  });

  it('clears only the matching current session when refresh credentials are invalid', async () => {
    const adapter = jest.fn(async (config: InternalAxiosRequestConfig) => {
      throw axiosStatusError(config, 401);
    });
    apiClient.defaults.adapter = adapter as AxiosAdapter;

    jest.spyOn(axios, 'post').mockResolvedValue({
      data: { data: { accessToken: '', refreshToken: '' } },
    } as AxiosResponse);

    await expect(apiClient.get('/protected')).rejects.toThrow('Invalid refresh response');

    expect(adapter).toHaveBeenCalledTimes(1);
    expect(mockedStorage.clearAll).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState()).toMatchObject({
      token: null,
      user: null,
      isAuthenticated: false,
    });
  });

  it('refreshes the session but never automatically replays a 401 mutation', async () => {
    const adapter = jest.fn(async (config: InternalAxiosRequestConfig) => {
      throw axiosStatusError(config, 401);
    });
    apiClient.defaults.adapter = adapter as AxiosAdapter;

    const refresh = jest.spyOn(axios, 'post').mockResolvedValue({
      data: {
        data: {
          accessToken: 'access-a-refreshed',
          refreshToken: 'refresh-a-refreshed',
        },
      },
    } as AxiosResponse);

    await expect(
      apiClient.post('/bookings', { serviceId: 'service-1' }),
    ).rejects.toMatchObject({ response: { status: 401 } });

    expect(adapter).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(storedAccessToken).toBe('access-a-refreshed');
    expect(useAuthStore.getState().token).toBe('access-a-refreshed');
  });

  it('does not trigger refresh or mutation replay for 403 or timeout failures', async () => {
    const refresh = jest.spyOn(axios, 'post');
    const adapter = jest.fn(async (config: InternalAxiosRequestConfig) => {
      if (adapter.mock.calls.length === 1) {
        throw axiosStatusError(config, 403);
      }
      throw new AxiosError('timeout', 'ECONNABORTED', config);
    });
    apiClient.defaults.adapter = adapter as AxiosAdapter;

    await expect(apiClient.post('/bookings', {})).rejects.toMatchObject({
      response: { status: 403 },
    });
    await expect(apiClient.post('/bookings', {})).rejects.toMatchObject({
      code: 'ECONNABORTED',
    });

    expect(adapter).toHaveBeenCalledTimes(2);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('blocks a request before dispatch when its initiating session changes during token lookup', async () => {
    const tokenResult = deferred<string | null>();
    mockedStorage.getToken.mockReturnValueOnce(tokenResult.promise);

    const adapter = jest.fn(async (config: InternalAxiosRequestConfig) =>
      axiosResponse(config, 200),
    );
    apiClient.defaults.adapter = adapter as AxiosAdapter;

    const request = apiClient.get('/protected');
    await waitUntil(() => mockedStorage.getToken.mock.calls.length === 1);

    storedAccessToken = 'access-b';
    storedRefreshToken = 'refresh-b';
    useAuthStore.getState().beginSessionTransition();
    useAuthStore.getState().setAuth('access-b', userB);
    tokenResult.resolve('access-a');

    await expect(request).rejects.toMatchObject({ name: 'StaleAuthSessionError' });
    expect(adapter).not.toHaveBeenCalled();
  });
});