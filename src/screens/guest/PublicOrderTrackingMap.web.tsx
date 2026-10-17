import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { lightTheme as colors } from '../../constants/theme';

type Coordinates = { lat: number; lng: number };

type PublicOrderTrackingMapProps = {
  technicianLocation: Coordinates;
  destination: Coordinates | null;
};

export default function PublicOrderTrackingMap({ technicianLocation, destination }: PublicOrderTrackingMapProps) {
  void technicianLocation;
  void destination;
  return (
    <View testID="public-tracking-map-unavailable" style={styles.container}>
      <Text style={styles.label}>Bản đồ vị trí chỉ khả dụng trên ứng dụng FixHome.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { minHeight: 56, justifyContent: 'center', padding: 12, borderRadius: 10, marginTop: 8, backgroundColor: colors.divider },
  label: { color: colors.textSecondary, textAlign: 'center', fontSize: 13, lineHeight: 18 },
});
