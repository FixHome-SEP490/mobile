const assert = require('node:assert/strict');
const fs = require('node:fs');
const configFn = require('./app.config.js');
const base = require('./app.json').expo;
const saved = { key: process.env.EXPO_PUBLIC_MAPTILER_KEY, google: process.env.FIXHOME_ANDROID_MAPS_API_KEY, eas: process.env.EAS_BUILD_PLATFORM };
try {
  // Maps are MapTiler + MapLibre: the config never needs (or injects) a Google Maps key.
  delete process.env.EXPO_PUBLIC_MAPTILER_KEY;
  delete process.env.FIXHOME_ANDROID_MAPS_API_KEY;
  process.env.EAS_BUILD_PLATFORM = 'android';
  const noKey = configFn({ config: base });
  assert.deepEqual(noKey, base, 'a build without any map key keeps app.json as is and does not fail');
  process.env.EXPO_PUBLIC_MAPTILER_KEY = 'example-synthetic-not-a-real-key';
  assert.deepEqual(configFn({ config: base }), base, 'the MapTiler key goes to the JS bundle, not into the native config');
  const plugins = base.plugins.map((p) => (Array.isArray(p) ? p[0] : p));
  assert.ok(plugins.includes('@maplibre/maplibre-react-native'), 'MapLibre config plugin is registered');
  assert.ok(!plugins.includes('react-native-maps'), 'no Google Maps plugin');
  const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
  assert.ok(!pkg.dependencies['react-native-maps'], 'react-native-maps is not a dependency');
  assert.ok(!JSON.stringify(base).includes('googleMaps'), 'no Google Maps key in app.json');
  process.stdout.write('Maps (MapTiler + MapLibre) build-time config contract PASS\n');
  // Phone push (PO 28/11/2026): OneSignal plus the app's own Android channels. expo-notifications would
  // register a second FCM receiver and take pushes away from OneSignal, so it must stay out.
  assert.ok(plugins.includes('onesignal-expo-plugin'), 'OneSignal config plugin is registered');
  assert.ok(plugins.includes('./plugins/with-notification-channels.js'), 'notification channel plugin is registered');
  assert.ok(pkg.dependencies['react-native-onesignal'], 'react-native-onesignal is a dependency');
  assert.ok(!pkg.dependencies['expo-notifications'], 'expo-notifications is not a dependency');
  process.stdout.write('Phone push (OneSignal) build-time config contract PASS\n');
} finally {
  for (const [name, value] of [['EXPO_PUBLIC_MAPTILER_KEY', saved.key], ['FIXHOME_ANDROID_MAPS_API_KEY', saved.google], ['EAS_BUILD_PLATFORM', saved.eas]]) {
    if (value == null) delete process.env[name]; else process.env[name] = value;
  }
}
