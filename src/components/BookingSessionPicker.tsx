import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Clock, CalendarDays } from 'lucide-react-native';
import { useAppTheme } from '../constants/theme';
import {
  SLOT_SHORT,
  sessionDayLabel,
  upcomingSessions,
  type BookingSchedule,
  type BookingSlot,
} from '../utils/booking-session';

/**
 * "Đặt trước theo buổi" (one morning or afternoon of a day in the next 14 days)
 * or "Tới ngay" — same choices as the web booking page.
 */
export default function BookingSessionPicker({
  value,
  onChange,
}: {
  value: BookingSchedule | null;
  onChange: (next: BookingSchedule) => void;
}) {
  const { colors } = useAppTheme();
  // Computed once per mount: sessions that started meanwhile are rejected on review.
  const sessions = useMemo(() => upcomingSessions(14), []);
  const days = useMemo(() => [...new Set(sessions.map((s) => s.date))], [sessions]);
  const scheduled = value?.mode === 'scheduled' ? value : null;
  const [day, setDay] = useState<string | undefined>(scheduled?.date ?? days[0]);
  const activeDay = day ?? days[0];

  const pick = (next: BookingSchedule) => {
    void Haptics.selectionAsync();
    onChange(next);
  };
  const isUrgent = value?.mode === 'urgent';
  const slots = sessions.filter((s) => s.date === activeDay).map((s) => s.slot);

  const card = (on: boolean) => [styles.card, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primarySoft : colors.surface }];

  return (
    <View style={styles.wrap}>
      <View style={styles.modes} accessibilityRole="radiogroup">
        <Pressable
          testID="mode-scheduled"
          accessibilityRole="radio"
          accessibilityState={{ checked: !isUrgent }}
          onPress={() => pick(scheduled ?? { mode: 'scheduled', date: activeDay ?? '', slot: slots[0] ?? 'morning' })}
          style={card(!isUrgent)}
        >
          <CalendarDays size={16} color={colors.primaryStrong} strokeWidth={1.75} />
          <Text style={[styles.cardTitle, { color: colors.text }]}>Đặt trước theo buổi</Text>
          <Text style={[styles.cardHint, { color: colors.textSecondary }]}>Chọn ngày và buổi sáng hoặc chiều</Text>
        </Pressable>
        <Pressable
          testID="mode-urgent"
          accessibilityRole="radio"
          accessibilityState={{ checked: isUrgent }}
          onPress={() => pick({ mode: 'urgent' })}
          style={card(isUrgent)}
        >
          <Clock size={16} color={colors.primaryStrong} strokeWidth={1.75} />
          <Text style={[styles.cardTitle, { color: colors.text }]}>Tới ngay</Text>
          <Text style={[styles.cardHint, { color: colors.textSecondary }]}>Thợ gần bạn đang rảnh tới trong khoảng 2 giờ</Text>
        </Pressable>
      </View>

      {!isUrgent && (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.days}>
            {days.map((d) => {
              const on = d === activeDay;
              return (
                <Pressable
                  key={d}
                  testID={`session-day-${d}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => {
                    setDay(d);
                    if (scheduled) {
                      const has = sessions.some((s) => s.date === d && s.slot === scheduled.slot);
                      const slot = has ? scheduled.slot : sessions.find((s) => s.date === d)!.slot;
                      pick({ mode: 'scheduled', date: d, slot });
                    }
                  }}
                  style={[styles.day, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primarySoft : colors.surface }]}
                >
                  <Text style={{ color: on ? colors.primaryStrong : colors.text, fontWeight: '700', fontSize: 13 }}>{sessionDayLabel(d)}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <View style={styles.slots}>
            {(['morning', 'afternoon'] as BookingSlot[]).map((slot) => {
              const enabled = slots.includes(slot);
              const on = !!scheduled && scheduled.date === activeDay && scheduled.slot === slot;
              return (
                <Pressable
                  key={slot}
                  testID={`session-slot-${slot}`}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on, disabled: !enabled }}
                  disabled={!enabled}
                  onPress={() => pick({ mode: 'scheduled', date: activeDay!, slot })}
                  style={[styles.slot, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primarySoft : colors.surface, opacity: enabled ? 1 : 0.4 }]}
                >
                  <Text style={{ color: on ? colors.primaryStrong : colors.text, fontWeight: '700' }}>{SLOT_SHORT[slot]}</Text>
                  {!enabled && <Text style={[styles.cardHint, { color: colors.textSecondary }]}>Đã qua</Text>}
                </Pressable>
              );
            })}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  modes: { flexDirection: 'row', gap: 10 },
  card: { flex: 1, borderWidth: 1, borderRadius: 14, padding: 12, gap: 4, minHeight: 96 },
  cardTitle: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  cardHint: { fontSize: 12, lineHeight: 18 },
  days: { gap: 8, paddingVertical: 2 },
  day: { minHeight: 44, justifyContent: 'center', borderWidth: 1, borderRadius: 12, paddingHorizontal: 12 },
  slots: { flexDirection: 'row', gap: 10 },
  slot: { flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 12, paddingHorizontal: 8 },
});
