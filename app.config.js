// Maps: MapTiler tiles drawn by MapLibre (@maplibre/maplibre-react-native, plugin in app.json).
// The MapTiler key is EXPO_PUBLIC_MAPTILER_KEY, inlined into the JS bundle at build time and never
// committed. A build without it still succeeds: the screens show a map placeholder
// (src/components/map-availability.ts). No Google Maps key is needed any more.
module.exports = ({ config }) => ({ ...config });
