// Expo SecureStore has no browser implementation. Keep tokens in this tab's
// session only for FixHome's local Expo Web development, never in localStorage.
const TOKEN_KEY = 'fixhome_dev_access_token';
const REFRESH_TOKEN_KEY = 'fixhome_dev_refresh_token';

function browserStorage(): Storage {
  if (typeof window === 'undefined') {
    throw new Error('Browser session storage is unavailable');
  }
  return window.sessionStorage;
}

export const storageService = {
  async getToken(): Promise<string | null> {
    try {
      return browserStorage().getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },

  async setToken(token: string): Promise<void> {
    browserStorage().setItem(TOKEN_KEY, token);
  },

  async removeToken(): Promise<void> {
    browserStorage().removeItem(TOKEN_KEY);
  },

  async getRefreshToken(): Promise<string | null> {
    try {
      return browserStorage().getItem(REFRESH_TOKEN_KEY);
    } catch {
      return null;
    }
  },

  async setRefreshToken(token: string): Promise<void> {
    browserStorage().setItem(REFRESH_TOKEN_KEY, token);
  },

  async removeRefreshToken(): Promise<void> {
    browserStorage().removeItem(REFRESH_TOKEN_KEY);
  },

  async clearAll(): Promise<void> {
    const storage = browserStorage();
    storage.removeItem(TOKEN_KEY);
    storage.removeItem(REFRESH_TOKEN_KEY);
  },
};