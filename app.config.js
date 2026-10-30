// Android Maps SDK key is injected at build time, never committed to the repository.
// Expo app config inherits app.json; no iOS/Web map provider change.
module.exports = ({ config }) => {
  const androidMapsKey = process.env.FIXHOME_ANDROID_MAPS_API_KEY?.trim();
  if (!androidMapsKey && process.env.EAS_BUILD_PLATFORM === 'android') {
    throw new Error('Android map build needs FIXHOME_ANDROID_MAPS_API_KEY in the EAS environment.');
  }
  return {
    ...config,
    plugins: [
      ...(config.plugins ?? []),
      ...(androidMapsKey
        ? [['react-native-maps', { androidGoogleMapsApiKey: androidMapsKey }]]
        : []),
    ],
  };
};
