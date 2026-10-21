import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { CalendarDays, ChevronLeft, ChevronRight, Clock, X } from 'lucide-react-native';
import { useAppTheme } from '../constants/theme';
import {
  BOOKING_SLOTS,
  SLOT_SHORT,
  sessionDayLabel,
  sessionCloseAt,
  upcomingSessions,
  type BookingSchedule,
} from '../utils/booking-session';
import { vnTodayCalendarDate, vnWallClockToDate } from '../utils/vn-time';

const QUICK_DAY_COUNT = 6;
const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

function monthOf(dateKey: string): string {
  return dateKey.slice(0, 7);
}

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function calendarCells(month: string): (string | null)[] {
  const [year, monthNumber] = month.split('-').map(Number);
  const offset = (new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const cellCount = Math.ceil((offset + daysInMonth) / 7) * 7;
  return Array.from({ length: cellCount }, (_, index) => {
    const day = index - offset + 1;
    return day < 1 || day > daysInMonth ? null : dateKey(year, monthNumber, day);
  });
}

function shiftMonth(month: string, amount: number): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, monthNumber - 1 + amount, 1));
  return dateKey(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 1).slice(0, 7);
}

function monthLabel(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Intl.DateTimeFormat('vi-VN', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
}

function sameSessions(left: ReturnType<typeof upcomingSessions>, right: ReturnType<typeof upcomingSessions>): boolean {
  return left.length === right.length && left.every((session, index) =>
    session.date === right[index]?.date && session.slot === right[index]?.slot);
}

/**
 * "Đặt trước theo buổi" (one morning, afternoon or evening of a day in the next 14 days)
 * or "Tới ngay" — same choices as the web booking page.
 */
export default function BookingSessionPicker({
  value,
  onChange,
  allowUrgent = true,
}: {
  value: BookingSchedule | null;
  onChange: (next: BookingSchedule | null) => void;
  /** False when "Tới ngay" makes no sense, e.g. when moving an existing booking (the server refuses it). */
  allowUrgent?: boolean;
}) {
  const { colors } = useAppTheme();
  const { width: windowWidth } = useWindowDimensions();
  const [sessions, setSessions] = useState(() => upcomingSessions(14));
  const days = useMemo(() => [...new Set(sessions.map((session) => session.date))], [sessions]);
  const valueKey = value?.mode === 'scheduled'
    ? `${value.mode}:${value.date}:${value.slot}`
    : value?.mode ?? 'none';
  const [modeOverride, setModeOverride] = useState<{ valueKey: string; mode: 'scheduled' | 'urgent' } | null>(null);
  const mode = modeOverride?.valueKey === valueKey ? modeOverride.mode : value?.mode ?? 'scheduled';
  const [dayOverride, setDayOverride] = useState<{ valueKey: string; date: string } | null>(null);
  const selectedDay = dayOverride?.valueKey === valueKey
    ? dayOverride.date
    : value?.mode === 'scheduled' && days.includes(value.date) ? value.date : days[0];
  const [calendarOpen, setCalendarOpen] = useState(false);
  const today = vnTodayCalendarDate();
  const [visibleMonth, setVisibleMonth] = useState(() => monthOf(selectedDay ?? dateKey(
    today.getFullYear(), today.getMonth() + 1, today.getDate(),
  )));
  const invalidatedScheduleRef = useRef<string | null>(null);

  const refreshSessions = useCallback(() => {
    const fresh = upcomingSessions(14);
    setSessions((current) => sameSessions(current, fresh) ? current : fresh);
  }, []);

  useFocusEffect(useCallback(() => {
    refreshSessions();
  }, [refreshSessions]));

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshSessions();
    });
    return () => subscription.remove();
  }, [refreshSessions]);

  useEffect(() => {
    const now = Date.now();
    const tomorrow = vnTodayCalendarDate(new Date(now), 1);
    const midnight = vnWallClockToDate(
      tomorrow.getFullYear(), tomorrow.getMonth() + 1, tomorrow.getDate(), 0, 0,
    ).getTime();
    const nextSessionClose = sessions
      .map((session) => sessionCloseAt(session))
      .filter((time): time is number => time !== undefined && time > now)
      .reduce((next, time) => Math.min(next, time), Number.POSITIVE_INFINITY);
    const nextBoundary = Math.min(midnight, nextSessionClose);
    const timeout = setTimeout(refreshSessions, Math.max(1, nextBoundary - now + 50));
    return () => clearTimeout(timeout);
  }, [refreshSessions, sessions]);

  const isUrgent = allowUrgent && mode === 'urgent';
  const candidateSchedule = value?.mode === 'scheduled' ? value : null;
  const scheduled = mode === 'scheduled' && candidateSchedule
    && sessions.some((session) => session.date === candidateSchedule.date && session.slot === candidateSchedule.slot)
    ? candidateSchedule
    : null;
  const activeDay = selectedDay && days.includes(selectedDay) ? selectedDay : days[0];
  const daySlots = sessions.filter((session) => session.date === activeDay).map((session) => session.slot);
  const quickDays = days.slice(0, QUICK_DAY_COUNT);
  const minMonth = days[0] ? monthOf(days[0]) : undefined;
  const maxMonth = days.at(-1) ? monthOf(days.at(-1)!) : undefined;
  const calendarMonth = minMonth && visibleMonth < minMonth
    ? minMonth
    : maxMonth && visibleMonth > maxMonth ? maxMonth : visibleMonth;
  const canGoPrevious = Boolean(minMonth && calendarMonth > minMonth);
  const canGoNext = Boolean(maxMonth && calendarMonth < maxMonth);
  const calendarWidth = Math.max(308, Math.min(windowWidth - 32, 488));
  const selectedDateIsInStrip = selectedDay ? quickDays.includes(selectedDay) : false;

  useEffect(() => {
    if (!candidateSchedule) {
      invalidatedScheduleRef.current = null;
      return;
    }
    const key = `${candidateSchedule.date}:${candidateSchedule.slot}`;
    const valid = sessions.some((session) => session.date === candidateSchedule.date && session.slot === candidateSchedule.slot);
    if (valid) {
      invalidatedScheduleRef.current = null;
      return;
    }
    if (invalidatedScheduleRef.current !== key) {
      invalidatedScheduleRef.current = key;
      onChange(null);
    }
  }, [candidateSchedule, onChange, sessions]);

  const emit = useCallback((next: BookingSchedule | null) => {
    void Haptics.selectionAsync();
    onChange(next);
  }, [onChange]);

  const chooseDay = (date: string) => {
    const freshSessions = upcomingSessions(14);
    refreshSessions();
    if (!freshSessions.some((session) => session.date === date)) return;
    setDayOverride({ valueKey, date });
    setCalendarOpen(false);
    if (scheduled) {
      if (freshSessions.some((session) => session.date === date && session.slot === scheduled.slot)) {
        emit({ mode: 'scheduled', date, slot: scheduled.slot });
      } else {
        emit(null);
      }
    }
  };

  const openCalendar = () => {
    const freshSessions = upcomingSessions(14);
    refreshSessions();
    const freshDays = [...new Set(freshSessions.map((session) => session.date))];
    const date = selectedDay && freshDays.includes(selectedDay) ? selectedDay : freshDays[0];
    if (date) setVisibleMonth(monthOf(date));
    setCalendarOpen(true);
  };

  const slotsForCalendar = new Set(sessions.map((session) => session.date));
  const cellDates = calendarCells(calendarMonth);
  const monthTitle = monthLabel(calendarMonth);
  const card = (on: boolean) => [styles.card, {
    borderColor: on ? colors.primary : colors.border,
    backgroundColor: on ? colors.primarySoft : colors.surface,
  }];

  return (
    <View style={styles.wrap}>
      <View style={styles.modes} accessibilityRole="radiogroup">
        <Pressable
          testID="mode-scheduled"
          accessibilityRole="radio"
          accessibilityState={{ checked: !isUrgent }}
          onPress={() => {
            setModeOverride({ valueKey, mode: 'scheduled' });
            if (value?.mode === 'scheduled' && sessions.some((session) => session.date === value.date && session.slot === value.slot)) {
              if (selectedDay !== value.date) setDayOverride({ valueKey, date: value.date });
            } else {
              emit(null);
            }
          }}
          style={card(!isUrgent)}
        >
          <CalendarDays size={16} color={colors.primaryStrong} strokeWidth={1.75} />
          <Text style={[styles.cardTitle, { color: colors.text }]}>Đặt trước theo buổi</Text>
          <Text style={[styles.cardHint, { color: colors.textSecondary }]}>Chọn ngày và buổi sáng, chiều hoặc tối</Text>
        </Pressable>
        {allowUrgent && (
          <Pressable
            testID="mode-urgent"
            accessibilityRole="radio"
            accessibilityState={{ checked: isUrgent }}
            onPress={() => {
              setModeOverride({ valueKey, mode: 'urgent' });
              emit({ mode: 'urgent' });
            }}
            style={card(isUrgent)}
          >
            <Clock size={16} color={colors.primaryStrong} strokeWidth={1.75} />
            <Text style={[styles.cardTitle, { color: colors.text }]}>Tới ngay</Text>
            <Text style={[styles.cardHint, { color: colors.textSecondary }]}>Thợ gần bạn đang rảnh tới trong khoảng 2 giờ</Text>
          </Pressable>
        )}
      </View>

      {!isUrgent && (
        <>
          <View style={styles.dateHeading}>
            <Text style={[styles.sectionLabel, { color: colors.text }]}>Ngày dự kiến</Text>
            <Pressable
              testID="calendar-open"
              accessibilityRole="button"
              accessibilityLabel="Xem lịch"
              style={[styles.calendarOpen, { borderColor: colors.border, backgroundColor: colors.surface }]}
              onPress={openCalendar}
            >
              <CalendarDays size={18} color={colors.primaryStrong} strokeWidth={1.75} />
              <Text style={{ color: colors.primaryStrong, fontWeight: '600' }}>Xem lịch</Text>
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.days}>
            {quickDays.map((date) => {
              const on = date === activeDay;
              return (
                <Pressable
                  key={date}
                  testID={`session-day-${date}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => chooseDay(date)}
                  style={[styles.day, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primarySoft : colors.surface }]}
                >
                  <Text style={{ color: on ? colors.primaryStrong : colors.text, fontWeight: '700', fontSize: 13 }}>{sessionDayLabel(date)}</Text>
                </Pressable>
              );
            })}
            {selectedDay && !selectedDateIsInStrip && days.includes(selectedDay) && (
              <Pressable
                testID="session-selected-day"
                accessibilityRole="button"
                accessibilityState={{ selected: true }}
                onPress={openCalendar}
                style={[styles.day, styles.selectedDay, { borderColor: colors.primary, backgroundColor: colors.primarySoft }]}
              >
                <Text style={{ color: colors.primaryStrong, fontWeight: '700', fontSize: 13 }}>{sessionDayLabel(selectedDay)}</Text>
              </Pressable>
            )}
          </ScrollView>
          {quickDays.length > 1 && (
            <Text testID="session-days-swipe-hint" style={[styles.daysHint, { color: colors.textSecondary }]}>
              Vuốt ngang để xem thêm ngày
            </Text>
          )}
          <View style={styles.slots}>
            {BOOKING_SLOTS.map((slot) => {
              const enabled = daySlots.includes(slot);
              const on = !!scheduled && scheduled.date === activeDay && scheduled.slot === slot;
              return (
                <Pressable
                  key={slot}
                  testID={`session-slot-${slot}`}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on, disabled: !enabled }}
                  disabled={!enabled}
                  onPress={() => {
                    const freshSessions = upcomingSessions(14);
                    refreshSessions();
                    if (!activeDay || !freshSessions.some((session) => session.date === activeDay && session.slot === slot)) return;
                    setModeOverride({ valueKey, mode: 'scheduled' });
                    emit({ mode: 'scheduled', date: activeDay, slot });
                  }}
                  style={[styles.slot, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primarySoft : colors.surface, opacity: enabled ? 1 : 0.4 }]}
                >
                  <Text style={{ color: on ? colors.primaryStrong : colors.text, fontWeight: '700', fontSize: 13, textAlign: 'center' }}>{SLOT_SHORT[slot]}</Text>
                  {!enabled && <Text style={[styles.cardHint, { color: colors.textSecondary }]}>Đã qua</Text>}
                </Pressable>
              );
            })}
          </View>
          {!scheduled && (
            <Text style={[styles.cardHint, { color: colors.textSecondary }]}>Chưa chọn buổi; lịch chỉ được xác nhận sau khi chọn buổi sáng, chiều hoặc tối.</Text>
          )}
        </>
      )}

      <Modal
        testID="session-calendar-modal"
        visible={calendarOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setCalendarOpen(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Đóng lịch"
            style={styles.backdrop}
            onPress={() => setCalendarOpen(false)}
          />
          <SafeAreaView edges={['bottom']} style={[styles.calendarSheet, { backgroundColor: colors.surface }]}>
            <ScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
            <View style={styles.calendarHeader}>
              <Text style={[styles.calendarHeading, { color: colors.text }]}>Chọn ngày</Text>
              <Pressable
                testID="calendar-close"
                accessibilityRole="button"
                accessibilityLabel="Đóng lịch"
                style={styles.iconButton}
                onPress={() => setCalendarOpen(false)}
              >
                <X size={20} color={colors.text} />
              </Pressable>
            </View>
            <View style={styles.monthNav}>
              <Pressable
                testID="calendar-month-prev"
                accessibilityRole="button"
                accessibilityLabel="Tháng trước"
                accessibilityState={{ disabled: !canGoPrevious }}
                disabled={!canGoPrevious}
                style={[styles.iconButton, !canGoPrevious && styles.disabledButton]}
                onPress={() => setVisibleMonth(shiftMonth(calendarMonth, -1))}
              >
                <ChevronLeft size={20} color={colors.text} />
              </Pressable>
              <Text testID="calendar-month-title" accessibilityRole="header" style={[styles.monthTitle, { color: colors.text }]}>{monthTitle}</Text>
              <Pressable
                testID="calendar-month-next"
                accessibilityRole="button"
                accessibilityLabel="Tháng sau"
                accessibilityState={{ disabled: !canGoNext }}
                disabled={!canGoNext}
                style={[styles.iconButton, !canGoNext && styles.disabledButton]}
                onPress={() => setVisibleMonth(shiftMonth(calendarMonth, 1))}
              >
                <ChevronRight size={20} color={colors.text} />
              </Pressable>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ width: calendarWidth }}
              keyboardShouldPersistTaps="handled"
            >
              <View style={{ width: calendarWidth }}>
                <View style={styles.weekdays}>
                  {WEEKDAYS.map((weekday) => (
                    <View key={weekday} style={styles.calendarCell}>
                      <Text testID={`calendar-weekday-${weekday}`} style={[styles.weekday, { color: colors.textSecondary }]}>{weekday}</Text>
                    </View>
                  ))}
                </View>
                <View style={styles.calendarGrid}>
                  {cellDates.map((date, index) => {
                    const enabled = Boolean(date && slotsForCalendar.has(date));
                    const selected = date === selectedDay;
                    return (
                      <View key={date ?? `blank-${index}`} style={styles.calendarCell}>
                        {date && (
                          <Pressable
                            testID={`calendar-date-${date}`}
                            accessibilityRole="button"
                            accessibilityLabel={sessionDayLabel(date)}
                            accessibilityState={{ selected, disabled: !enabled }}
                            disabled={!enabled}
                            onPress={() => chooseDay(date)}
                            style={[styles.calendarDate, {
                              backgroundColor: selected ? colors.primary : 'transparent',
                              borderColor: selected ? colors.primary : colors.border,
                              opacity: enabled ? 1 : 0.35,
                            }]}
                          >
                            <Text style={{ color: selected ? colors.surface : colors.text, fontWeight: selected ? '700' : '500' }}>{Number(date.slice(-2))}</Text>
                          </Pressable>
                        )}
                      </View>
                    );
                  })}
                </View>
              </View>
            </ScrollView>
            <Text style={[styles.cardHint, { color: colors.textSecondary }]}>Chỉ chọn được ngày còn khung giờ trong 14 ngày tới. Chọn ngày chưa tự xác nhận buổi.</Text>
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  modes: { flexDirection: 'row', gap: 8 },
  card: { flex: 1, borderWidth: 1, borderRadius: 14, padding: 12, gap: 4, minHeight: 96 },
  cardTitle: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  cardHint: { fontSize: 12, lineHeight: 18 },
  dateHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  sectionLabel: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  calendarOpen: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12 },
  days: { gap: 8, paddingVertical: 2 },
  daysHint: { fontSize: 11, lineHeight: 16, textAlign: 'right', marginTop: -8, marginBottom: -8 },
  day: { minHeight: 44, justifyContent: 'center', borderWidth: 1, borderRadius: 12, paddingHorizontal: 12 },
  selectedDay: { marginLeft: 2 },
  slots: { flexDirection: 'row', gap: 8 },
  slot: { flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 12, paddingHorizontal: 8 },
  modalRoot: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  backdrop: { ...StyleSheet.absoluteFill },
  calendarSheet: { width: '100%', maxWidth: 520, alignSelf: 'center', maxHeight: '88%', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8, gap: 8 },
  sheetContent: { gap: 8, paddingBottom: 8 },
  calendarHeader: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  calendarHeading: { fontSize: 18, lineHeight: 24, fontWeight: '700' },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  disabledButton: { opacity: 0.35 },
  monthNav: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthTitle: { fontSize: 16, lineHeight: 22, fontWeight: '700', textTransform: 'capitalize' },
  weekdays: { flexDirection: 'row', marginBottom: 4 },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calendarCell: { width: '14.2857%', minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  weekday: { minWidth: 44, minHeight: 44, textAlign: 'center', textAlignVertical: 'center', fontSize: 12, fontWeight: '600' },
  calendarDate: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 22 },
});
