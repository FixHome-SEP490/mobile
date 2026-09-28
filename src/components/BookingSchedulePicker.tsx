import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import * as Haptics from 'expo-haptics';
import { CalendarDays, ChevronDown, Clock3 } from 'lucide-react-native';
import { BOOKING_START_TIMES, getBookingDateRange } from '../utils/booking-window';
import { formatBookingDate } from '../screens/customer/customer-booking-review';

type BookingColors = {
  background: string;
  border: string;
  primary: string;
  surface: string;
  text: string;
  textSecondary: string;
};

export default function BookingSchedulePicker({
  colors,
  date,
  time,
  onDateChange,
  onTimeChange,
}: {
  colors: BookingColors;
  date: Date;
  time: (typeof BOOKING_START_TIMES)[number];
  onDateChange: (date: Date) => void;
  onTimeChange: (time: (typeof BOOKING_START_TIMES)[number]) => void;
}) {
  const [dateOpen, setDateOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);
  const { minimumDate, maximumDate } = getBookingDateRange();
  const endHour = String(Number(time.slice(0, 2)) + 2).padStart(2, '0');
  const endTime = `${endHour}:${time.slice(3)}`;

  const toggleDate = () => {
    Haptics.selectionAsync();
    setTimeOpen(false);
    setDateOpen((open) => !open);
  };
  const toggleTime = () => {
    Haptics.selectionAsync();
    setDateOpen(false);
    setTimeOpen((open) => !open);
  };

  return (
    <View style={styles.container}>
      <View style={styles.rows}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Ngày hẹn, ${formatBookingDate(date)}`}
          accessibilityState={{ expanded: dateOpen }}
          onPress={toggleDate}
          style={({ pressed }) => [
            styles.row,
            {
              backgroundColor: colors.surface,
              borderColor: dateOpen ? colors.primary : colors.border,
              opacity: pressed ? 0.76 : 1,
            },
          ]}
        >
          <CalendarDays color={colors.primary} size={20} />
          <View style={styles.rowText}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Ngày hẹn</Text>
            <Text style={[styles.value, { color: colors.text }]}>{formatBookingDate(date)}</Text>
          </View>
          <ChevronDown color={colors.textSecondary} size={18} />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Khung giờ dự kiến, ${time} đến ${endTime}`}
          accessibilityState={{ expanded: timeOpen }}
          onPress={toggleTime}
          style={({ pressed }) => [
            styles.row,
            {
              backgroundColor: colors.surface,
              borderColor: timeOpen ? colors.primary : colors.border,
              opacity: pressed ? 0.76 : 1,
            },
          ]}
        >
          <Clock3 color={colors.primary} size={20} />
          <View style={styles.rowText}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Khung giờ dự kiến</Text>
            <Text style={[styles.value, { color: colors.text }]}>{time}–{endTime}</Text>
          </View>
          <ChevronDown color={colors.textSecondary} size={18} />
        </Pressable>
      </View>

      {dateOpen && (
        <View style={[styles.picker, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <DateTimePicker
            value={date}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            presentation={Platform.OS === 'ios' ? 'inline' : 'dialog'}
            minimumDate={minimumDate}
            maximumDate={maximumDate}
            locale="vi_VN"
            accentColor={colors.primary}
            onValueChange={(_event, selectedDate) => {
              onDateChange(
                new Date(
                  selectedDate.getFullYear(),
                  selectedDate.getMonth(),
                  selectedDate.getDate(),
                ),
              );
              Haptics.selectionAsync();
              setDateOpen(Platform.OS === 'ios');
            }}
            onDismiss={() => setDateOpen(false)}
          />
        </View>
      )}

      {timeOpen && (
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel="Chọn giờ bắt đầu"
          style={[
            styles.timeGrid,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          {BOOKING_START_TIMES.map((option) => {
            const selected = option === time;
            return (
              <Pressable
                key={option}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                onPress={() => {
                  Haptics.selectionAsync();
                  onTimeChange(option);
                  setTimeOpen(false);
                }}
                style={({ pressed }) => [
                  styles.timeOption,
                  {
                    backgroundColor: selected ? colors.primary : colors.background,
                    borderColor: selected ? colors.primary : colors.border,
                    opacity: pressed ? 0.76 : 1,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.timeText,
                    { color: selected ? colors.surface : colors.text },
                  ]}
                >
                  {option}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      <Text style={[styles.hint, { color: colors.textSecondary }]}>
        Thời gian tiếp nhận dự kiến trong khoảng 2 giờ.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  rows: { gap: 8 },
  row: {
    minHeight: 58,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowText: { flex: 1, gap: 2 },
  label: { fontSize: 12 },
  value: { fontSize: 15, fontWeight: '600' },
  picker: { borderWidth: 1, borderRadius: 12, padding: 8, overflow: 'hidden' },
  timeGrid: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  timeOption: {
    minWidth: 82,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeText: { fontWeight: '600', fontSize: 14 },
  hint: { fontSize: 12, lineHeight: 18 },
});
