import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { lightTheme as colors } from '../../../constants/theme';

export interface EvidencePhotoOption { id: string; type: string; mediaUrl: string }

export const EVIDENCE_MAX = 10;

/** Thumbnail grid so the technician can tell which owned photo is being attached. */
export function EvidencePhotoPicker({ photos, isSelected, disabled, loaded, onToggle, onCapture, onReload }: {
  photos: EvidencePhotoOption[];
  isSelected: (photo: EvidencePhotoOption) => boolean;
  disabled: boolean;
  loaded: boolean;
  onToggle: (photo: EvidencePhotoOption) => void;
  onCapture: () => void;
  onReload: () => void;
}) {
  const selectedCount = photos.filter(isSelected).length;
  return (
    <View style={styles.wrap}>
      {!loaded && <Text style={styles.hint}>Chưa tải được danh sách ảnh. Hãy tải lại danh sách.</Text>}
      {loaded && photos.length === 0 && <Text style={styles.hint}>Chưa có ảnh trước/sau sửa chữa để đính kèm. Chụp ảnh sau sửa chữa để thêm.</Text>}
      {photos.length > 0 && <Text style={styles.hint}>Đã chọn {selectedCount}/{EVIDENCE_MAX} ảnh. Chạm vào ảnh để chọn hoặc bỏ chọn.</Text>}
      <View style={styles.grid}>
        {photos.map((photo, index) => {
          const selected = isSelected(photo);
          const label = `${photo.type === 'BEFORE' ? 'Trước sửa chữa' : 'Sau sửa chữa'} · Ảnh ${index + 1}`;
          return (
            <TouchableOpacity
              key={photo.id}
              testID={`proposal-evidence-${photo.id}`}
              accessibilityRole="checkbox"
              accessibilityLabel={label}
              accessibilityState={{ checked: selected, disabled }}
              disabled={disabled}
              style={[styles.tile, selected && styles.tileSelected, disabled && styles.disabled]}
              onPress={() => onToggle(photo)}
            >
              <Image source={{ uri: photo.mediaUrl }} accessibilityIgnoresInvertColors style={styles.thumb} />
              <Text style={[styles.caption, selected && styles.captionSelected]} numberOfLines={1}>{selected ? 'Đã chọn · ' : ''}{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <TouchableOpacity
        testID="proposal-capture-after"
        accessibilityRole="button"
        accessibilityLabel="Chụp ảnh sau sửa chữa mới"
        accessibilityHint="Mở màn chụp ảnh sau sửa chữa; bản nháp đề xuất này được giữ nguyên"
        disabled={disabled}
        onPress={onCapture}
        style={[styles.capture, disabled && styles.disabled]}
      >
        <Text style={styles.captureText}>Chụp ảnh sau sửa chữa mới</Text>
      </TouchableOpacity>
      <TouchableOpacity
        testID="proposal-reload-evidence"
        accessibilityRole="button"
        accessibilityLabel="Tải lại danh sách ảnh"
        accessibilityHint="Tải lại ảnh từ máy chủ để lấy ảnh vừa chụp, không gửi đề xuất"
        onPress={onReload}
        style={styles.reload}
      >
        <Text style={styles.reloadText}>Tải lại danh sách ảnh</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  hint: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { width: '31%', minWidth: 96, borderWidth: 1, borderColor: colors.border, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.surface },
  tileSelected: { borderColor: colors.primary, borderWidth: 2 },
  thumb: { width: '100%', aspectRatio: 1, backgroundColor: colors.divider },
  caption: { fontSize: 12, color: colors.textSecondary, padding: 6 },
  captionSelected: { color: colors.primaryStrong, fontWeight: '700' },
  disabled: { opacity: 0.5 },
  capture: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.primaryStrong, borderRadius: 12 },
  captureText: { color: colors.primaryStrong, fontSize: 15, fontWeight: '600' },
  reload: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  reloadText: { color: colors.textSecondary, fontSize: 14, fontWeight: '600', textDecorationLine: 'underline' },
});
