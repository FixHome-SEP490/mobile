import React, { useId } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { lightTheme as colors } from '../constants/theme';
import { isNativeMapAvailable, MAP_UNAVAILABLE_BODY, mapTilerStyleUrl, mapUnavailableTitle, zoomForDelta } from './map-availability';

type MapLibre = typeof import('@maplibre/maplibre-react-native');
let mapLibre: MapLibre | null | undefined;
/**
 * MapLibre is loaded only when a map is really drawn. A static import ran its native module
 * lookup at start-up, which Expo Go does not have (BUG DETECTOR 211); the APK still loads it.
 */
export function loadMapLibre(): MapLibre | null {
  if (mapLibre !== undefined) return mapLibre;
  if (!isNativeMapAvailable()) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mapLibre = require('@maplibre/maplibre-react-native') as MapLibre;
  } catch {
    mapLibre = null;
  }
  return mapLibre;
}

export type MapCoordinate = { latitude: number; longitude: number };
export type MapRegion = MapCoordinate & { latitudeDelta: number; longitudeDelta: number };
export type MapPressEvent = { nativeEvent: { coordinate: MapCoordinate } };

/** The props the screens used with react-native-maps, kept so they did not change when maps moved to MapTiler. */
export type AddressMapProps = {
  style?: StyleProp<ViewStyle>;
  testID?: string;
  initialRegion?: MapRegion;
  region?: MapRegion;
  onPress?: (event: MapPressEvent) => void;
  children?: React.ReactNode;
};

export type MarkerProps = {
  coordinate: MapCoordinate;
  title?: string;
  pinColor?: string;
  testID?: string;
};

export function MapUnavailable({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View testID="map-unavailable" style={[styles.placeholder, style]} accessible accessibilityLabel={`${mapUnavailableTitle()}. ${MAP_UNAVAILABLE_BODY}`}>
      <Text style={styles.title}>{mapUnavailableTitle()}</Text>
      <Text style={styles.body}>{MAP_UNAVAILABLE_BODY}</Text>
    </View>
  );
}

/** MapTiler map (MapLibre) when the build has its key, otherwise a readable placeholder. */
export default function AddressMap({ style, testID, initialRegion, region, onPress, children }: AddressMapProps) {
  const native = loadMapLibre();
  if (!native) return <MapUnavailable style={style} />;
  const { Map, Camera } = native;
  const view = region ?? initialRegion;
  const center: [number, number] | undefined = view ? [view.longitude, view.latitude] : undefined;
  const zoom = view ? zoomForDelta(Math.max(view.latitudeDelta, view.longitudeDelta)) : 1;
  return (
    <Map
      testID={testID}
      style={style}
      mapStyle={mapTilerStyleUrl()}
      logo={false}
      attribution
      onPress={onPress ? (event) => {
        const [longitude, latitude] = event.nativeEvent.lngLat;
        onPress({ nativeEvent: { coordinate: { latitude, longitude } } });
      } : undefined}
    >
      {region && center
        ? <Camera center={center} zoom={zoom} duration={300} />
        : <Camera initialViewState={center ? { center, zoom } : { zoom }} />}
      {children}
    </Map>
  );
}

export function Marker({ coordinate, title, pinColor = colors.primaryStrong, testID }: MarkerProps) {
  // MapLibre refuses a marker whose id changes, and the pin moves on every tap: the id must not follow the coordinate.
  const autoId = useId();
  const native = loadMapLibre();
  if (!native) return null;
  const MapLibreMarker = native.Marker;
  return (
    <MapLibreMarker id={testID ?? autoId} lngLat={[coordinate.longitude, coordinate.latitude]} anchor="bottom">
      <View testID={testID} accessible accessibilityLabel={title} style={styles.pinWrap}>
        <View style={[styles.pinHead, { backgroundColor: pinColor }]} />
        <View style={[styles.pinTail, { borderTopColor: pinColor }]} />
      </View>
    </MapLibreMarker>
  );
}

const styles = StyleSheet.create({
  placeholder: { justifyContent: 'center', alignItems: 'center', gap: 6, padding: 16, backgroundColor: colors.divider },
  title: { color: colors.text, fontSize: 14, fontWeight: '600', textAlign: 'center' },
  body: { color: colors.textSecondary, fontSize: 13, lineHeight: 18, textAlign: 'center' },
  pinWrap: { alignItems: 'center' },
  pinHead: { width: 22, height: 22, borderRadius: 11, borderWidth: 3, borderColor: '#FFFFFF' },
  pinTail: { width: 0, height: 0, marginTop: -2, borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 9, borderLeftColor: 'transparent', borderRightColor: 'transparent' },
});
