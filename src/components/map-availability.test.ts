import { isNativeMapAvailable, mapTilerKey, mapTilerStyleUrl, zoomForDelta } from './map-availability';

describe('map availability (MapTiler + MapLibre)', () => {
  it('draws the native map on Android and iOS only when the build has a MapTiler key', () => {
    expect(isNativeMapAvailable('android', 'k')).toBe(true);
    expect(isNativeMapAvailable('ios', 'k')).toBe(true);
    expect(isNativeMapAvailable('android', '')).toBe(false);
    expect(isNativeMapAvailable('ios', '')).toBe(false);
  });

  it('never draws the native map on web (the web build has its own placeholder)', () => {
    expect(isNativeMapAvailable('web', 'k')).toBe(false);
  });

  it('treats a blank key as missing', () => {
    expect(mapTilerKey('   ')).toBe('');
    expect(mapTilerKey(undefined)).toBe('');
    expect(mapTilerKey(' abc ')).toBe('abc');
  });

  it('uses the same MapTiler streets style as the web app', () => {
    expect(mapTilerStyleUrl('abc')).toBe('https://api.maptiler.com/maps/streets-v2/style.json?key=abc');
  });

  it('turns a region delta into a zoom level', () => {
    expect(zoomForDelta(0.02)).toBeCloseTo(14.1, 1);
    expect(zoomForDelta(100)).toBeCloseTo(1.85, 1);
    expect(zoomForDelta(0)).toBeCloseTo(14.1, 1);
    expect(zoomForDelta(1e-9)).toBe(18);
  });
});
