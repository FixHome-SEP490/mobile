import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Trash2, X } from 'lucide-react-native';
import { EvidencePhotoStage } from '../../components/technician/EvidencePhotoPreview';
import StatusBadge from '../../components/StatusBadge';
import { technicianProfileApi } from '../../api/technician-profile.api';
import { iconStroke, useAppTheme } from '../../constants/theme';
import { isoToViDate } from './skill-evidence';
import type { StatusView } from './technician-status';

export interface EvidenceFacts {
  issuer: string | null;
  referenceNumber: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  claimedYears: number | null;
}

/** The labelled lines of a paper, in the order a reviewer reads them; empty details are left out. */
export function evidenceFactLines(d: EvidenceFacts): { label: string; value: string }[] {
  const lines: { label: string; value: string | null }[] = [
    { label: 'Nơi cấp', value: d.issuer },
    { label: 'Số hiệu', value: d.referenceNumber },
    { label: 'Ngày cấp', value: d.issuedAt ? isoToViDate(d.issuedAt.slice(0, 10)) : null },
    { label: 'Hết hạn', value: d.expiresAt ? isoToViDate(d.expiresAt.slice(0, 10)) : null },
    { label: 'Kinh nghiệm', value: d.claimedYears != null ? `${d.claimedYears} năm` : null },
  ];
  return lines.filter((l): l is { label: string; value: string } => !!l.value);
}

/**
 * Everything the technician needs to follow one paper: the photo, what was typed, where it sits, how it stands and,
 * when it is not locked, the way to delete it. Shared by the skill row, the papers page and the signup step.
 */
export default function EvidenceDetailModal({ visible, title, photo, facts, status, reason, note, categories, onDelete, onClose }: {
  visible: boolean;
  title: string;
  /** Where to ask for the photo link; absent for a file that is not an image. */
  photo?: { serviceId: string; documentId: string } | null;
  facts: { label: string; value: string }[];
  status?: StatusView;
  reason?: string | null;
  note?: string | null;
  categories?: string[];
  /** Absent when the paper is locked. */
  onDelete?: () => void;
  onClose: () => void;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  // The link is kept with the paper it belongs to: one modal serves several papers and must never show the previous one's photo.
  const [loaded, setLoaded] = useState<{ documentId: string; url: string } | null>(null);
  const serviceId = photo?.serviceId;
  const documentId = photo?.documentId;

  useEffect(() => {
    if (!visible || !serviceId || !documentId) return undefined;
    let live = true;
    technicianProfileApi.getSkillEvidenceAccess(serviceId, documentId).then((url) => { if (live && url) setLoaded({ documentId, url }); }, () => undefined);
    return () => { live = false; };
  }, [visible, serviceId, documentId]);

  const uri = loaded && loaded.documentId === documentId ? loaded.url : null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <Pressable style={styles.dismiss} accessibilityRole="button" accessibilityLabel="Đóng chi tiết giấy tờ" onPress={onClose} />
        <View style={styles.sheet} testID="evidence-detail">
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={2} accessibilityRole="header">{title}</Text>
            <Pressable testID="evidence-detail-close" accessibilityRole="button" accessibilityLabel="Đóng" hitSlop={8} onPress={onClose} style={styles.close}>
              <X size={20} strokeWidth={iconStroke} color={colors.text} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            {uri ? <EvidencePhotoStage uri={uri} label={title} /> : null}
            {status ? <View style={styles.statusRow}><StatusBadge view={status} /></View> : null}
            {reason !== undefined && status?.tone === 'danger' ? (
              <Text style={styles.reason} accessibilityRole="alert">{`Lý do từ chối: ${reason?.trim() || 'Không có lý do chi tiết từ FixHome'}`}</Text>
            ) : null}
            {!!note && <Text style={styles.hint}>{note}</Text>}
            {facts.length ? (
              <View style={styles.facts}>
                {facts.map((f) => (
                  <View key={f.label} style={styles.fact}>
                    <Text style={styles.factLabel}>{f.label}</Text>
                    <Text style={styles.factValue}>{f.value}</Text>
                  </View>
                ))}
              </View>
            ) : <Text style={styles.hint}>Giấy tờ này chưa có thông tin chi tiết.</Text>}
            {categories?.length ? (
              <View style={styles.fact}>
                <Text style={styles.factLabel}>Áp dụng cho</Text>
                <Text style={styles.factValue}>{categories.join(', ')}</Text>
              </View>
            ) : null}
          </ScrollView>
          {onDelete ? (
            <Pressable testID="evidence-detail-delete" accessibilityRole="button" accessibilityLabel={`Xóa giấy tờ ${title}`} onPress={onDelete}
              style={({ pressed }) => [styles.delete, pressed && styles.pressed]}>
              <Trash2 size={18} strokeWidth={iconStroke} color={colors.tone.danger.text} />
              <Text style={styles.deleteText}>Xóa giấy tờ này</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const getStyles = (colors: ReturnType<typeof useAppTheme>['colors']) => StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  dismiss: { flex: 1 },
  sheet: { maxHeight: '85%', backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 24, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  title: { flex: 1, color: colors.text, fontSize: 18, lineHeight: 26, fontWeight: '700' },
  close: { width: 44, height: 44, marginTop: -8, marginRight: -8, alignItems: 'center', justifyContent: 'center' },
  body: { gap: 12 },
  statusRow: { flexDirection: 'row' },
  reason: { color: colors.tone.danger.text, fontSize: 14, lineHeight: 20 },
  hint: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  facts: { gap: 10 },
  fact: { gap: 2 },
  factLabel: { color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  factValue: { color: colors.text, fontSize: 15, lineHeight: 22, fontWeight: '500' },
  delete: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, backgroundColor: colors.tone.danger.bg },
  deleteText: { color: colors.tone.danger.text, fontSize: 15, fontWeight: '600' },
  pressed: { opacity: 0.8 },
});
