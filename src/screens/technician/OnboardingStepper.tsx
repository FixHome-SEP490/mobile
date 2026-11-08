import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { iconSize, useAppTheme, type ThemeColors } from '../../constants/theme';
import StatusBadge from '../../components/StatusBadge';
import { ONBOARDING_STEPS, type OnboardingStepProgress } from './technician-onboarding';
import type { StatusView } from './technician-status';

// Nhãn ngắn dưới mỗi nút tròn; tiêu đề đầy đủ nằm ở phần đầu bước.
const SHORT_LABELS = ['Thông tin', 'Xác minh', 'Kỹ năng', 'Khu vực', 'Gửi duyệt'];

/** Nhãn trạng thái của bước đang xem: có chữ và icon, không chỉ dựa vào màu (DS §8.4). */
function stepStatusView(progress: OnboardingStepProgress | undefined): StatusView {
  if (progress?.completed) return { label: 'Đã hoàn tất', tone: 'success', icon: 'CheckCircle2' };
  if (progress?.current) return { label: 'Đang thực hiện', tone: 'info', icon: 'Clock' };
  if (progress?.statusLabel === 'Cần hoàn tất') return { label: 'Cần hoàn tất', tone: 'warning', icon: 'AlertTriangle' };
  return { label: 'Chưa bắt đầu', tone: 'neutral', icon: 'Minus' };
}

/** Năm nút tròn nối bằng đường kẻ, nhãn ngắn bên dưới, rồi tiêu đề và trạng thái của bước đang xem. */
export default function OnboardingStepper({
  progress,
  step,
  onSelect,
}: {
  progress: OnboardingStepProgress[];
  step: number;
  onSelect: (id: number) => void;
}) {
  const { colors } = useAppTheme();
  const styles = getStyles(colors);
  const selected = progress[step - 1];

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {ONBOARDING_STEPS.map((s, index) => {
          const item = progress[index];
          const done = item?.completed ?? false;
          const active = item?.current ?? false;
          const reachable = item?.reachable ?? false;
          const prevDone = index > 0 && (progress[index - 1]?.completed ?? false);
          return (
            <TouchableOpacity
              key={s.id}
              style={styles.node}
              disabled={!reachable}
              onPress={() => onSelect(s.id)}
              accessibilityRole="button"
              accessibilityLabel={`Bước ${s.id}: ${s.title}, ${item?.statusLabel ?? 'Chưa bắt đầu'}`}
              accessibilityState={{ selected: active, disabled: !reachable }}
            >
              <View style={styles.circleRow}>
                <View style={[styles.line, index === 0 && styles.lineHidden, prevDone && styles.lineDone]} />
                <View style={[styles.circle, done && styles.circleDone, active && !done && styles.circleActive, !reachable && styles.circleTodo]}>
                  {done ? (
                    <Check size={iconSize.sm} color="#FFFFFF" strokeWidth={2.5} />
                  ) : (
                    <Text style={[styles.number, active && styles.numberActive]}>{s.id}</Text>
                  )}
                </View>
                <View style={[styles.line, index === ONBOARDING_STEPS.length - 1 && styles.lineHidden, done && styles.lineDone]} />
              </View>
              <Text style={[styles.label, active && styles.labelActive]}>{SHORT_LABELS[index]}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={styles.head}>
        <Text style={styles.overline}>Bước {step}/{ONBOARDING_STEPS.length}</Text>
        <Text style={styles.title} accessibilityRole="header">{ONBOARDING_STEPS[step - 1].title}</Text>
        <View accessibilityLiveRegion="polite" style={styles.badge}>
          <StatusBadge view={stepStatusView(selected)} />
        </View>
      </View>
    </View>
  );
}

const CIRCLE = 32;

const getStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    wrap: { gap: 16, marginBottom: 16 },
    row: { flexDirection: 'row' },
    node: { flex: 1, alignItems: 'center', minHeight: 64 },
    circleRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' },
    line: { flex: 1, height: 2, backgroundColor: colors.border },
    lineHidden: { backgroundColor: 'transparent' },
    lineDone: { backgroundColor: colors.primaryStrong },
    circle: {
      width: CIRCLE,
      height: CIRCLE,
      borderRadius: CIRCLE / 2,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    circleDone: { backgroundColor: colors.primaryStrong, borderColor: colors.primaryStrong },
    circleActive: { backgroundColor: colors.primarySoft, borderColor: colors.primaryStrong },
    circleTodo: { backgroundColor: colors.divider },
    number: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
    numberActive: { color: colors.primaryStrong, fontWeight: '700' },
    label: { marginTop: 6, fontSize: 12, lineHeight: 16, fontWeight: '500', color: colors.textSecondary, textAlign: 'center' },
    labelActive: { color: colors.text, fontWeight: '600' },
    head: { gap: 4 },
    overline: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: colors.textSecondary },
    title: { fontSize: 20, lineHeight: 28, fontWeight: '600', color: colors.text },
    badge: { alignSelf: 'flex-start', marginTop: 4 },
  });
