// src/components/technician/PhotoDraftGallery.tsx
//
// Photos the technician has just taken and not sent yet: one large photo with a counter and, from two
// photos on, a thumbnail strip to switch between them. Same layout as BookingMediaViewer (the customer's
// photos in the invitation detail), so any number of photos takes the same height.
import React from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAppTheme } from '../../constants/theme';

export default function PhotoDraftGallery({ photos, index, onSelect, previewTestID, label }: {
  photos: { uri: string }[];
  index: number;
  onSelect: (index: number) => void;
  previewTestID?: string;
  label: string;
}) {
  const { colors } = useAppTheme();
  if (photos.length === 0) return null;
  const current = Math.min(index, photos.length - 1);
  return (
    <View style={styles.list}>
      <View style={[styles.stage, { backgroundColor: colors.border }]}>
        <Image
          testID={previewTestID}
          source={{ uri: photos[current].uri }}
          style={styles.fill}
          resizeMode="cover"
          accessibilityLabel={`${label} ${current + 1}`}
        />
        {photos.length > 1 ? (
          <View style={styles.counter} pointerEvents="none">
            <Text style={styles.counterText}>{`${current + 1}/${photos.length}`}</Text>
          </View>
        ) : null}
      </View>
      {photos.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbRow}>
          {photos.map((photo, i) => (
            <TouchableOpacity
              key={`${photo.uri}-${i}`}
              testID={`${previewTestID ?? 'photo'}-thumb-${i}`}
              onPress={() => onSelect(i)}
              accessibilityRole="button"
              accessibilityLabel={`Xem ${label.toLowerCase()} ${i + 1}`}
              accessibilityState={{ selected: i === current }}
              style={[styles.thumb, { backgroundColor: colors.border, borderColor: i === current ? colors.primaryStrong : 'transparent' }]}
            >
              <Image source={{ uri: photo.uri }} style={styles.fill} resizeMode="cover" />
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

const THUMB = 56;
const styles = StyleSheet.create({
  list: { gap: 8 },
  stage: { width: '100%', aspectRatio: 4 / 3, borderRadius: 12, overflow: 'hidden' },
  fill: { width: '100%', height: '100%' },
  counter: { position: 'absolute', right: 8, bottom: 8, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.55)' },
  counterText: { fontSize: 12, lineHeight: 18, fontWeight: '600', color: '#fff' },
  thumbRow: { gap: 8 },
  thumb: { width: THUMB, height: THUMB, borderRadius: 10, overflow: 'hidden', borderWidth: 2 },
});
