// src/components/technician/EvidencePhotoPreview.tsx
//
// A paper the technician picked, shown the way the customer's photos are shown on a job invitation (a 4:3 stage with
// the whole picture, `BookingMediaViewer`), and opened full screen on tap. These photos are local files, so there is
// nothing to download or retry.
import React, { useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, View } from 'react-native';
import { X } from 'lucide-react-native';
import { useAppTheme } from '../../constants/theme';

/** The large 4:3 view of one picked photo; tap to see it full screen. */
export function EvidencePhotoStage({ uri, label = 'Ảnh giấy tờ' }: { uri: string; label?: string }) {
  const { colors } = useAppTheme();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        testID="evidence-photo-stage"
        accessibilityRole="imagebutton"
        accessibilityLabel={`${label}. Chạm để xem toàn màn hình`}
        onPress={() => setOpen(true)}
        style={[styles.stage, { backgroundColor: colors.border }]}
      >
        <Image source={{ uri }} style={styles.fill} resizeMode="contain" />
      </Pressable>
      <EvidencePhotoModal uri={open ? uri : null} onClose={() => setOpen(false)} />
    </>
  );
}

/** A small square of one picked photo for a list row; tap to see it full screen. */
export function EvidencePhotoThumb({ uri, label = 'Ảnh giấy tờ', size = 56 }: { uri: string; label?: string; size?: number }) {
  const { colors } = useAppTheme();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        testID="evidence-photo-thumb"
        accessibilityRole="imagebutton"
        accessibilityLabel={`${label}. Chạm để xem`}
        onPress={() => setOpen(true)}
        style={[styles.thumb, { backgroundColor: colors.border, width: size, height: size }]}
      >
        <Image source={{ uri }} style={styles.fill} resizeMode="cover" />
      </Pressable>
      <EvidencePhotoModal uri={open ? uri : null} onClose={() => setOpen(false)} />
    </>
  );
}

function EvidencePhotoModal({ uri, onClose }: { uri: string | null; onClose: () => void }) {
  return (
    <Modal visible={!!uri} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        {!!uri && <Image source={{ uri }} style={styles.full} resizeMode="contain" accessibilityLabel="Ảnh giấy tờ, toàn màn hình" />}
        <Pressable testID="evidence-photo-close" accessibilityRole="button" accessibilityLabel="Đóng ảnh" onPress={onClose} style={styles.close}>
          <X size={22} color="#fff" strokeWidth={2} />
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  stage: { width: '100%', aspectRatio: 4 / 3, borderRadius: 12, overflow: 'hidden' },
  fill: { width: '100%', height: '100%' },
  thumb: { width: 56, height: 56, borderRadius: 10, overflow: 'hidden' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center' },
  full: { width: '100%', height: '80%' },
  close: { position: 'absolute', top: 56, right: 16, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.18)' },
});
