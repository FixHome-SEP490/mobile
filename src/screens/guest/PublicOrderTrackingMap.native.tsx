import React from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker, type Region } from 'react-native-maps';
import { lightTheme as colors } from '../../constants/theme';

type Coordinates = { lat: number; lng: number };

type PublicOrderTrackingMapProps = {
  technicianLocation: Coordinates;
  destination: Coordinates | null;
};

function mapRegion(technicianLocation: Coordinates, destination: Coordinates | null): Region {
  const points = [technicianLocation, ...(destination ? [destination] : [])];
  const latitudes = points.map(point => point.lat);
  const longitudes = points.map(point => point.lng);
  return {
    latitude: (Math.min(...latitudes) + Math.max(...latitudes)) / 2,
    longitude: (Math.min(...longitudes) + Math.max(...longitudes)) / 2,
    latitudeDelta: Math.max(0.01, Math.max(...latitudes) - Math.min(...latitudes) + 0.02),
    longitudeDelta: Math.max(0.01, Math.max(...longitudes) - Math.min(...longitudes) + 0.02),
  };
}

export default function PublicOrderTrackingMap({ technicianLocation, destination }: PublicOrderTrackingMapProps) {
  return (
    <View testID="public-tracking-map-container" style={styles.container}>
      <MapView testID="public-tracking-map" style={styles.map} region={mapRegion(technicianLocation, destination)}>
        <Marker
          testID="public-tracking-technician-marker"
          coordinate={{ latitude: technicianLocation.lat, longitude: technicianLocation.lng }}
          title="Vị trí kỹ thuật viên"
          pinColor={colors.success}
        />
        {destination ? (
          <Marker
            testID="public-tracking-destination-marker"
            coordinate={{ latitude: destination.lat, longitude: destination.lng }}
            title="Địa chỉ sửa chữa"
            pinColor={colors.primaryStrong}
          />
        ) : null}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { height: 220, overflow: 'hidden', borderRadius: 10, marginTop: 8 },
  map: { flex: 1 },
});
