import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardInset } from '../../../hooks/useKeyboardInset';
import BackButton, { HomeButton } from '../../../components/BackButton';
import { lightTheme as colors, spacing } from '../../../constants/theme';

export interface TaskAction {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  accessibilityHint?: string;
  testID?: string;
}

export function FixedActionFooter({ primary, secondary, summary, bottomInset, keyboardInset }: {
  primary?: TaskAction; secondary?: TaskAction; summary?: React.ReactNode; bottomInset: number; keyboardInset: number;
}) {
  return <View testID="order-flow-fixed-footer" style={[styles.footer, { paddingBottom: Math.max(12, keyboardInset > 0 ? 0 : bottomInset), transform: [{ translateY: -keyboardInset }] }]}>
    {summary}
    <View style={styles.actionRow}>
      {secondary && <TouchableOpacity testID={secondary.testID} accessibilityRole="button" accessibilityHint={secondary.accessibilityHint}
        accessibilityState={{ disabled: !!secondary.disabled }}
        disabled={secondary.disabled} onPress={secondary.onPress} style={[styles.secondaryButton, primary && styles.secondarySlot, secondary.disabled && styles.disabled]}>
        <Text style={styles.secondaryText}>{secondary.label}</Text>
      </TouchableOpacity>}
      {primary && <TouchableOpacity testID={primary.testID} accessibilityRole="button" accessibilityHint={primary.accessibilityHint}
        accessibilityState={{ disabled: !!primary.disabled }}
        disabled={primary.disabled} onPress={primary.onPress} style={[styles.primaryButton, secondary && styles.primarySlot, primary.disabled && styles.disabled]}>
        <Text style={styles.primaryText}>{primary.label}</Text>
      </TouchableOpacity>}
    </View>
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

export function TaskScreenShell({ title, stage, children, primary, secondary, summary, onBack, contentStyle }: {
  title: string;
  stage?: 1 | 2 | 3 | 4 | null;
  children: React.ReactNode;
  primary?: TaskAction;
  secondary?: TaskAction;
  /** Always-visible line above the footer actions (e.g. running total). */
  summary?: React.ReactNode;
  onBack?: () => void;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const insets = useSafeAreaInsets();
  const keyboardInset = useKeyboardInset();
  // Data is live (OrderFlowNavigator); a manual refresh button would only suggest it is not.
  if (secondary?.testID === 'task-refresh' || secondary?.testID === 'readonly-detail-refresh') secondary = undefined;
  return <SafeAreaView edges={['top', 'left', 'right']} style={styles.page}>
    <View style={styles.header}>
      <BackButton onPress={onBack ?? (() => {})} />
      <Text accessibilityRole="header" style={styles.headerTitle}>{title}</Text>
      <HomeButton />
    </View>
    {stage !== undefined && <StageHeader stage={stage} />}
    <ScrollView style={styles.scroll} contentContainerStyle={[styles.scrollContent, contentStyle]} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
    {keyboardInset > 0 && <View testID="order-flow-keyboard-spacer" style={{ height: keyboardInset }} />}
    {(primary || secondary) && <FixedActionFooter primary={primary} secondary={secondary} summary={summary} bottomInset={insets.bottom} keyboardInset={keyboardInset} />}
  </SafeAreaView>;
}

export type NoticeTone = 'info' | 'error' | 'success' | 'warning';
const NOTICE_TONE: Record<NoticeTone, 'info' | 'danger' | 'success' | 'warning'> = { info: 'info', error: 'danger', success: 'success', warning: 'warning' };

/** `tone="error"` is announced as an alert; other tones stay passive summaries. */
export function ReadOnlyNotice({ children, style, tone = 'info' }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; tone?: NoticeTone }) {
  const t = colors.tone[NOTICE_TONE[tone]];
  return <View accessibilityRole={tone === 'error' ? 'alert' : 'summary'} style={[styles.notice, { backgroundColor: t.bg }, tone !== 'info' && { borderLeftWidth: 4, borderLeftColor: t.fg }, style]}>
    <Text style={[styles.noticeText, tone !== 'info' && { color: t.text }]}>{children}</Text>
  </View>;
}

/** A titled card, the grouping used across the order screens (title above, rows inside one card). */
export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={{ gap: spacing.sm }}>
    <Text accessibilityRole="header" style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20, fontWeight: '600', marginTop: spacing.sm }}>{title}</Text>
    <View style={{ backgroundColor: colors.surface, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingHorizontal: spacing.md }}>{children}</View>
  </View>;
}

export function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return <View style={styles.row}><Text style={styles.rowLabel}>{label}</Text><Text selectable style={styles.rowValue}>{value || 'Chưa có thông tin'}</Text></View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  header: { minHeight: 56, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { flex: 1, textAlign: 'center', color: colors.text, fontSize: 18, fontWeight: '700' },
  stageWrap: { paddingHorizontal: spacing.md, paddingBottom: spacing.md },
  stageTrack: { flexDirection: 'row', gap: 4 },
  stageSegment: { flex: 1, height: 4, borderRadius: 4, backgroundColor: colors.border },
  stageSegmentActive: { backgroundColor: colors.primaryStrong },
  stageLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, gap: 4 },
  stageLabel: { flex: 1, color: colors.textSecondary, fontSize: 12, textAlign: 'center' },
  stageLabelCurrent: { color: colors.primaryStrong, fontWeight: '700' },
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.lg },
  footer: { backgroundColor: colors.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingHorizontal: spacing.md, paddingTop: 12, gap: 8 },
  actionRow: { flexDirection: 'row', gap: 8 },
  secondarySlot: { flex: 1 },
  primarySlot: { flex: 2 },
  primaryButton: { flex: 1, minHeight: 52, backgroundColor: colors.primaryStrong, paddingHorizontal: spacing.md, paddingVertical: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: colors.surface, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  secondaryButton: { flex: 1, minHeight: 52, paddingHorizontal: spacing.md, paddingVertical: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: colors.text, fontSize: 15, fontWeight: '600', textAlign: 'center' },
  disabled: { opacity: 0.5 },
  notice: { padding: spacing.md, backgroundColor: colors.tone.info.bg, borderRadius: 12 },
  noticeText: { color: colors.text, fontSize: 14, lineHeight: 21 },
  row: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, gap: 4 },
  rowLabel: { color: colors.textSecondary, fontSize: 13 },
  rowValue: { color: colors.text, fontSize: 16, lineHeight: 23 },
});
