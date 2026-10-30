const assert = require('node:assert/strict');
const configFn = require('./app.config.js');
const base = require('./app.json').expo;
const original = process.env.FIXHOME_ANDROID_MAPS_API_KEY;
const buildPlatform = process.env.EAS_BUILD_PLATFORM;
try {
  delete process.env.FIXHOME_ANDROID_MAPS_API_KEY;
  delete process.env.EAS_BUILD_PLATFORM;
  const normal = configFn({ config: base });
  assert.deepEqual(normal.plugins, base.plugins, 'without key existing plugins remain unchanged');
  process.env.FIXHOME_ANDROID_MAPS_API_KEY = 'example-synthetic-not-a-real-key';
  const withKey = configFn({ config: base });
  assert.equal(withKey.plugins.length, base.plugins.length + 1);
  assert.deepEqual(withKey.plugins.at(-1), ['react-native-maps', {
    androidGoogleMapsApiKey: 'example-synthetic-not-a-real-key',
  }]);
  assert.deepEqual({ ...withKey, plugins: base.plugins }, base, 'dynamic config preserves app.json fields');
  delete process.env.FIXHOME_ANDROID_MAPS_API_KEY;
  process.env.EAS_BUILD_PLATFORM = 'android';
  assert.throws(() => configFn({ config: base }), /FIXHOME_ANDROID_MAPS_API_KEY/);
  process.stdout.write('BUG44 Android Maps build-time config contract PASS\n');
} finally {
  if (original == null) delete process.env.FIXHOME_ANDROID_MAPS_API_KEY;
  else process.env.FIXHOME_ANDROID_MAPS_API_KEY = original;
  if (buildPlatform == null) delete process.env.EAS_BUILD_PLATFORM;
  else process.env.EAS_BUILD_PLATFORM = buildPlatform;
}
