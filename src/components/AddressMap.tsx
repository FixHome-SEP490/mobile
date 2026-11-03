import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import NativeMapView, { Marker as NativeMarker, type MapMarkerProps, type MapViewProps } from 'react-native-maps';
import { lightTheme as colors } from '../constants/theme';
import { isNativeMapAvailable, MAP_UNAVAILABLE_BODY, MAP_UNAVAILABLE_TITLE } from './map-availability';

export function MapUnavailable({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View testID="map-unavailable" style={[styles.placeholder, style]} accessible accessibilityLabel={`${MAP_UNAVAILABLE_TITLE}. ${MAP_UNAVAILABLE_BODY}`}>
      <Text style={styles.title}>{MAP_UNAVAILABLE_TITLE}</Text>
      <Text style={styles.body}>{MAP_UNAVAILABLE_BODY}</Text>
    </View>
  );
}

/** Native map when the build has its map key, otherwise a readable placeholder (bug 44). */
export default function AddressMap(props: MapViewProps) {
  if (!isNativeMapAvailable()) return <MapUnavailable style={props.style} />;
  return <NativeMapView {...props} />;
}

export function Marker(props: MapMarkerProps) {
  if (!isNativeMapAvailable()) return null;
  return <NativeMarker {...props} />;
}

const styles = StyleSheet.create({
  placeholder: { justifyContent: 'center', alignItems: 'center', gap: 6, padding: 16, backgroundColor: colors.divider },
  title: { color: colors.text, fontSize: 14, fontWeight: '600', textAlign: 'center' },
  body: { color: colors.textSecondary, fontSize: 13, lineHeight: 18, textAlign: 'center' },
});
