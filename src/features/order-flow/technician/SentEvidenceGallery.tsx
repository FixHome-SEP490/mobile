import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Trash2 } from 'lucide-react-native';
import PhotoDraftGallery from '../../../components/technician/PhotoDraftGallery';
import { vnDateTimeString } from '../../../utils/vn-time';
import { lightTheme as colors, spacing } from '../../../constants/theme';

export interface SentPhoto { id: string; mediaUrl: string; createdAt?: string | null }

/**
 * The photos already sent and confirmed, shown like the customer's photos in the invitation detail: one large photo with a counter and a
 * thumbnail strip to switch between them. The delete (with its confirmation) acts on the photo in front. `testPrefix`: 'before' | 'after'.
 */
export default function SentEvidenceGallery({ photos, index, onSelect, label, testPrefix, canDelete, busy, confirmDeleteId, onAskDelete, onCancelDelete, onConfirmDelete }: {
  photos: SentPhoto[];
  index: number;
  onSelect: (index: number) => void;
  label: string;
  testPrefix: string;
  canDelete: boolean;
  busy: boolean;
  confirmDeleteId: string | null;
  onAskDelete: (id: string) => void;
  onCancelDelete: () => void;
  onConfirmDelete: (id: string) => void;
}) {
  if (photos.length === 0) return null;
  const at = Math.min(index, photos.length - 1);
  const item = photos[at];
  const confirming = confirmDeleteId === item.id;
  return (
    <View style={styles.wrap}>
      <PhotoDraftGallery
        photos={photos.map((p) => ({ uri: p.mediaUrl }))}
        index={at}
        onSelect={onSelect}
        previewTestID={`${testPrefix}-sent-preview`}
        label={label}
      />
      <View style={styles.row}>
        <View style={styles.text}>
          <Text style={styles.title}>Ảnh {at + 1}/{photos.length}</Text>
          <Text style={styles.caption}>{item.createdAt ? vnDateTimeString(item.createdAt) : item.id}</Text>
        </View>
        {!confirming ? (
          <Pressable testID={`${testPrefix}-delete-${item.id}`} accessibilityRole="button" accessibilityLabel={`Xóa ảnh ${at + 1}`} disabled={!canDelete}
            onPress={() => onAskDelete(item.id)} hitSlop={4} style={({ pressed }) => [styles.iconBtn, !canDelete && styles.dim, pressed && styles.pressed]}>
            <Trash2 size={20} strokeWidth={1.75} color={colors.error} />
          </Pressable>
        ) : null}
      </View>
      {confirming ? (
        <View style={styles.confirm}>
          <Text style={styles.confirmText}>Xóa ảnh này khỏi đơn? Thao tác cần máy chủ xác nhận.</Text>
          <View style={styles.actions}>
            <Pressable testID={`${testPrefix}-delete-cancel-${item.id}`} accessibilityRole="button" accessibilityLabel="Giữ lại ảnh"
              onPress={onCancelDelete} style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
              <Text style={styles.actionText}>Giữ lại ảnh</Text>
            </Pressable>
            <Pressable testID={`${testPrefix}-delete-confirm-${item.id}`} accessibilityRole="button" accessibilityLabel="Xác nhận xóa ảnh" disabled={busy}
              onPress={() => onConfirmDelete(item.id)} style={({ pressed }) => [styles.action, styles.danger, busy && styles.dim, pressed && styles.pressed]}>
              <Text style={styles.dangerText}>Xác nhận xóa</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: spacing.md, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  text: { flex: 1, minWidth: 0 },
  title: { color: colors.text, fontSize: 15, lineHeight: 22, fontWeight: '600' },
  caption: { color: colors.textSecondary, fontSize: 12, lineHeight: 16, fontWeight: '500' },
  iconBtn: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  confirm: { backgroundColor: colors.background, borderRadius: 12, padding: spacing.md, gap: 8 },
  confirmText: { color: colors.text, fontSize: 14, lineHeight: 20 },
  actions: { flexDirection: 'row', gap: 8 },
  action: { flex: 1, minHeight: 48, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  actionText: { color: colors.primaryStrong, fontSize: 14, lineHeight: 20, fontWeight: '600', textAlign: 'center' },
  danger: { backgroundColor: colors.tone.danger.bg, borderColor: colors.error },
  dangerText: { color: colors.tone.danger.text, fontSize: 14, lineHeight: 20, fontWeight: '700', textAlign: 'center' },
  dim: { opacity: 0.5 },
  pressed: { opacity: 0.7 },
});
