import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardInset } from '../../../hooks/useKeyboardInset';
import { lightTheme as colors, spacing } from '../../../constants/theme';

export interface TaskAction {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  accessibilityHint?: string;
  testID?: string;
}

export function FixedActionFooter({ primary, secondary, bottomInset, keyboardInset }: {
  primary?: TaskAction; secondary?: TaskAction; bottomInset: number; keyboardInset: number;
}) {
  return <View testID="order-flow-fixed-footer" style={[styles.footer, { paddingBottom: Math.max(12, keyboardInset > 0 ? 0 : bottomInset), transform: [{ translateY: -keyboardInset }] }]}>
    {secondary && <TouchableOpacity testID={secondary.testID} accessibilityRole="button" accessibilityHint={secondary.accessibilityHint}
      disabled={secondary.disabled} onPress={secondary.onPress} style={[styles.secondaryButton, secondary.disabled && styles.disabled]}>
      <Text style={styles.secondaryText}>{secondary.label}</Text>
    </TouchableOpacity>}
    {primary && <TouchableOpacity testID={primary.testID} accessibilityRole="button" accessibilityHint={primary.accessibilityHint}
      disabled={primary.disabled} onPress={primary.onPress} style={[styles.primaryButton, primary.disabled && styles.disabled]}>
      <Text style={styles.primaryText}>{primary.label}</Text>
    </TouchableOpacity>}
  </View>;
}

export function StageHeader({ stage }: { stage: 1 | 2 | 3 | 4 | null }) {
  const labels = ['Chuẩn bị', 'Tại nhà', 'Sửa chữa', 'Kết thúc'];
  return <View accessibilityLabel={`Tiến độ ${stage ? `giai đoạn ${stage} trên 4` : 'chưa xác định'}`} style={styles.stageWrap}>
    <View style={styles.stageTrack}>{labels.map((label, index) => <View key={label}
      style={[styles.stageSegment, stage !== null && index < stage && styles.stageSegmentActive]} />)}</View>
    <View style={styles.stageLabels}>{labels.map((label, index) => <Text key={label} numberOfLines={1}
      style={[styles.stageLabel, stage === index + 1 && styles.stageLabelCurrent]}>{label}</Text>)}</View>
  </View>;
}

export function TaskScreenShell({ title, stage, children, primary, secondary, onBack, contentStyle }: {
  title: string;
  stage?: 1 | 2 | 3 | 4 | null;
  children: React.ReactNode;
  primary?: TaskAction;
  secondary?: TaskAction;
  onBack?: () => void;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const insets = useSafeAreaInsets();
  const keyboardInset = useKeyboardInset();
  return <SafeAreaView edges={['top', 'left', 'right']} style={styles.page}>
    <View style={styles.header}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Quay lại" onPress={onBack} style={styles.backButton}>
        <Text style={styles.backGlyph}>‹</Text>
      </TouchableOpacity>
      <Text accessibilityRole="header" style={styles.headerTitle}>{title}</Text>
      <View style={styles.backButton} />
    </View>
    {stage !== undefined && <StageHeader stage={stage} />}
    <ScrollView style={styles.scroll} contentContainerStyle={[styles.scrollContent, contentStyle]} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
    {keyboardInset > 0 && <View testID="order-flow-keyboard-spacer" style={{ height: keyboardInset }} />}
    {(primary || secondary) && <FixedActionFooter primary={primary} secondary={secondary} bottomInset={insets.bottom} keyboardInset={keyboardInset} />}
  </SafeAreaView>;
}

export function ReadOnlyNotice({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View accessibilityRole="summary" style={[styles.notice, style]}><Text style={styles.noticeText}>{children}</Text></View>;
}

export function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return <View style={styles.row}><Text style={styles.rowLabel}>{label}</Text><Text selectable style={styles.rowValue}>{value || 'Chưa có thông tin'}</Text></View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  header: { minHeight: 56, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backButton: { width: 48, height: 48, justifyContent: 'center', alignItems: 'center' },
  backGlyph: { color: colors.text, fontSize: 34, lineHeight: 38 },
  headerTitle: { flex: 1, textAlign: 'center', color: colors.text, fontSize: 18, fontWeight: '700' },
  stageWrap: { paddingHorizontal: spacing.md, paddingBottom: spacing.md },
  stageTrack: { flexDirection: 'row', gap: 5 },
  stageSegment: { flex: 1, height: 4, borderRadius: 4, backgroundColor: colors.border },
  stageSegmentActive: { backgroundColor: colors.primaryStrong },
  stageLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 7, gap: 4 },
  stageLabel: { flex: 1, color: colors.textSecondary, fontSize: 11, textAlign: 'center' },
  stageLabelCurrent: { color: colors.primaryStrong, fontWeight: '700' },
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.lg },
  footer: { backgroundColor: colors.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingHorizontal: spacing.md, paddingTop: 10, gap: 8 },
  primaryButton: { minHeight: 52, backgroundColor: colors.primaryStrong, paddingHorizontal: spacing.md, paddingVertical: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: colors.surface, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  secondaryButton: { minHeight: 52, paddingHorizontal: spacing.md, paddingVertical: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: colors.text, fontSize: 15, fontWeight: '600', textAlign: 'center' },
  disabled: { opacity: 0.5 },
  notice: { padding: spacing.md, backgroundColor: '#EAF1FE', borderRadius: 12 },
  noticeText: { color: colors.text, fontSize: 14, lineHeight: 21 },
  row: { paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, gap: 5 },
  rowLabel: { color: colors.textSecondary, fontSize: 13 },
  rowValue: { color: colors.text, fontSize: 16, lineHeight: 23 },
});
