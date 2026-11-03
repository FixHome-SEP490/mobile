import { isNativeMapAvailable } from './map-availability';

describe('isNativeMapAvailable (bug 44)', () => {
  it('uses the native map on Android only when the build recorded a Maps key', () => {
    expect(isNativeMapAvailable('android', { androidMapsConfigured: true })).toBe(true);
    expect(isNativeMapAvailable('android', { androidMapsConfigured: false })).toBe(false);
    expect(isNativeMapAvailable('android', {})).toBe(false);
    expect(isNativeMapAvailable('android', undefined)).toBe(false);
    expect(isNativeMapAvailable('android', { androidMapsConfigured: 'true' })).toBe(false);
  });

  it('keeps Apple Maps on iOS without any key', () => {
    expect(isNativeMapAvailable('ios', undefined)).toBe(true);
  });
});
