import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAppTheme } from '../../constants/theme';
import { vnTimeString } from '../../utils/vn-time';
import { buildDayTimeline } from './schedule-timeline';
import type { ScheduleDay } from './technician-schedule';

const HOUR_H = 44;
const LABEL_W = 44;
const VN_TIME = { hour: '2-digit', minute: '2-digit' } as const;
const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;

/** Hour grid of the selected day: orders as blocks, time off as a shaded band, red line at the current time. */
export default function ScheduleDayTimeline({ day, now, onOpenOrder }: { day: ScheduleDay; now: number; onOpenOrder: (orderId: string) => void }) {
  const { colors } = useAppTheme();
  const t = buildDayTimeline(day, now);
  const top = (min: number) => ((min - t.startHour * 60) / 60) * HOUR_H;
  const hours = Array.from({ length: t.endHour - t.startHour + 1 }, (_, i) => t.startHour + i);
  const showNow = t.nowMin !== null && t.nowMin >= t.startHour * 60 && t.nowMin <= t.endHour * 60;

  return (
    <View testID="schedule-timeline" style={[styles.wrap, { height: (t.endHour - t.startHour) * HOUR_H + 16, borderColor: colors.border, backgroundColor: colors.surface }]}>
      {hours.map((h) => (
        <View key={h} style={[styles.hour, { top: top(h * 60) + 8 }]}>
          <Text style={[styles.hourLabel, { color: colors.textSecondary }]}>{hh(h)}</Text>
          <View style={[styles.line, { backgroundColor: colors.border }]} />
        </View>
      ))}
      <View style={[styles.canvas, { left: LABEL_W + 8 }]}>
        {t.blocks.map((b) => {
          const style = {
            top: top(b.startMin) + 8,
            height: Math.max(20, top(b.endMin) - top(b.startMin)),
            left: `${(b.col / b.cols) * 100}%` as const,
            width: `${(1 / b.cols) * 100}%` as const,
          };
          if (b.kind === 'timeoff') {
            return (
              <View key={`off-${b.id}`} testID="timeline-timeoff" style={[styles.block, style, { backgroundColor: colors.tone.warning.bg }]}>
                <Text numberOfLines={1} style={[styles.blockText, { color: colors.tone.warning.text }]}>Nghỉ{b.timeOff?.reason ? ` · ${b.timeOff.reason}` : ''}</Text>
              </View>
            );
          }
          return (
            <TouchableOpacity
              key={b.id}
              testID={`timeline-order-${b.id}`}
              accessibilityRole="button"
              accessibilityLabel={`Xem công việc ${b.order?.code ?? ''} ${b.order?.serviceName ?? ''}`.trim()}
              onPress={() => onOpenOrder(b.id)}
              style={[styles.block, style, { backgroundColor: colors.primarySoft, borderColor: colors.primaryStrong, borderWidth: 1 }]}
            >
              <Text numberOfLines={1} style={[styles.blockText, { color: colors.primaryStrong }]}>{vnTimeString(b.order!.scheduledAt, VN_TIME)} {b.order?.serviceName ?? ''}</Text>
            </TouchableOpacity>
          );
        })}
        {showNow && (
          <View testID="timeline-now" pointerEvents="none" style={[styles.now, { top: top(t.nowMin!) + 8, backgroundColor: colors.error }]} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  hour: { position: 'absolute', left: 8, right: 8, flexDirection: 'row', alignItems: 'center', height: 0 },
  hourLabel: { width: LABEL_W, fontSize: 12 },
  line: { flex: 1, height: StyleSheet.hairlineWidth },
  canvas: { position: 'absolute', top: 0, bottom: 0, right: 8 },
  block: { position: 'absolute', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, justifyContent: 'flex-start' },
  blockText: { fontSize: 12, fontWeight: '600' },
  now: { position: 'absolute', left: 0, right: 0, height: 2 },
});
