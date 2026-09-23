/** @jest-environment jsdom */
import { storageService } from './storage.service.web';

describe('Expo Web token storage', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(() => {
    window.sessionStorage.clear();
  });

  it('starts empty and keeps both test tokens in tab session storage', async () => {
    expect(await storageService.getToken()).toBeNull();
    expect(await storageService.getRefreshToken()).toBeNull();
    await storageService.setToken('test-access');
    await storageService.setRefreshToken('test-refresh');
    expect(await storageService.getToken()).toBe('test-access');
    expect(await storageService.getRefreshToken()).toBe('test-refresh');
    expect(window.localStorage.getItem('fixhome_dev_access_token')).toBeNull();
    expect(window.localStorage.getItem('fixhome_dev_refresh_token')).toBeNull();
  });

  it('removes each token independently', async () => {
    await storageService.setToken('test-access');
    await storageService.setRefreshToken('test-refresh');
    await storageService.removeToken();
    expect(await storageService.getToken()).toBeNull();
    expect(await storageService.getRefreshToken()).toBe('test-refresh');
    await storageService.removeRefreshToken();
    expect(await storageService.getRefreshToken()).toBeNull();
  });

  it('clears only FixHome tokens, leaving unrelated session data intact', async () => {
    window.sessionStorage.setItem('other_app', 'keep');
    await storageService.setToken('test-access');
    await storageService.setRefreshToken('test-refresh');
    await storageService.clearAll();
    expect(await storageService.getToken()).toBeNull();
    expect(await storageService.getRefreshToken()).toBeNull();
    expect(window.sessionStorage.getItem('other_app')).toBe('keep');
  });
});