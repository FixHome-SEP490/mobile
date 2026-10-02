import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import * as Haptics from 'expo-haptics';
import { CalendarDays, ChevronDown, Clock3, SlidersHorizontal } from 'lucide-react-native';
import {
  BOOKING_START_TIMES,
  getBookingDateRange,
  isCustomerBookingStartTime,
} from '../utils/booking-window';
import { formatBookingDate } from '../screens/customer/customer-booking-review';

type BookingColors = {
  background: string;
  border: string;
  primary: string;
  surface: string;
  text: string;
  textSecondary: string;
};

function bookingEndTime(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  const end = hours * 60 + minutes + 2 * 60;
  const endHour = String(Math.floor(end / 60)).padStart(2, '0');
  const endMinute = String(end % 60).padStart(2, '0');
  return `${endHour}:${endMinute}`;
}

function timePickerValue(time: string): Date {
  const [hours, minutes] = time.split(':').map(Number);
  const value = new Date();
  value.setHours(hours, minutes, 0, 0);
  return value;
}

function formatClockValue(value: Date): string {
  return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
}

export default function BookingSchedulePicker({
  colors,
  date,
  time,
  onDateChange,
  onTimeChange,
}: {
  colors: BookingColors;
  date: Date;
  time: string;
  onDateChange: (date: Date) => void;
  onTimeChange: (time: string) => void;
}) {
  const [dateOpen, setDateOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);
  const [customTimeOpen, setCustomTimeOpen] = useState(false);
  const [customTimeError, setCustomTimeError] = useState('');
  const { minimumDate, maximumDate } = getBookingDateRange();
  const endTime = bookingEndTime(time);
  const isSuggestedTime = BOOKING_START_TIMES.some((option) => option === time);

  const toggleDate = () => {
    void Haptics.selectionAsync();
    setTimeOpen(false);
    setCustomTimeOpen(false);
    setDateOpen((open) => !open);
  };

  const toggleTime = () => {
    void Haptics.selectionAsync();
    setDateOpen(false);
    setCustomTimeOpen(false);
    setCustomTimeError('');
    setTimeOpen((open) => !open);
  };

  const openDetailedTime = () => {
    void Haptics.selectionAsync();
    setTimeOpen(false);
    setCustomTimeError('');
    setCustomTimeOpen(true);
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
          accessibilityState={{ expanded: timeOpen || customTimeOpen }}
          onPress={toggleTime}
          style={({ pressed }) => [
            styles.row,
            {
              backgroundColor: colors.surface,
              borderColor: timeOpen || customTimeOpen ? colors.primary : colors.border,
              opacity: pressed ? 0.76 : 1,
            },
          ]}
        >
          <Clock3 color={colors.primary} size={20} />
          <View style={styles.rowText}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Khung giờ dự kiến</Text>
            <Text style={[styles.value, { color: colors.text }]}>
              {time}–{endTime}
            </Text>
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
            themeVariant="light"
            onValueChange={(_event, selectedDate) => {
              onDateChange(
                new Date(
                  selectedDate.getFullYear(),
                  selectedDate.getMonth(),
                  selectedDate.getDate(),
                ),
              );
              void Haptics.selectionAsync();
              setDateOpen(Platform.OS === 'ios');
            }}
            onDismiss={() => setDateOpen(false)}
          />
        </View>
      )}

      {timeOpen && (
        <View
          style={[
            styles.timePanel,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.quickLabel, { color: colors.textSecondary }]}>Gợi ý nhanh</Text>
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel="Chọn giờ bắt đầu gợi ý"
            style={styles.timeGrid}
          >
            {BOOKING_START_TIMES.map((option) => {
              const selected = option === time;
              return (
                <Pressable
                  key={option}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  onPress={() => {
                    void Haptics.selectionAsync();
                    onTimeChange(option);
                    setCustomTimeError('');
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

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Chọn giờ cụ thể"
            onPress={openDetailedTime}
            style={({ pressed }) => [
              styles.customTimeButton,
              {
                backgroundColor: !isSuggestedTime ? colors.primary : colors.background,
                borderColor: !isSuggestedTime ? colors.primary : colors.border,
                opacity: pressed ? 0.76 : 1,
              },
            ]}
          >
            <SlidersHorizontal
              size={18}
              color={!isSuggestedTime ? colors.surface : colors.primary}
            />
            <View style={styles.customTimeCopy}>
              <Text
                style={[
                  styles.customTimeTitle,
                  { color: !isSuggestedTime ? colors.surface : colors.text },
                ]}
              >
                Chọn giờ cụ thể
              </Text>
              <Text
                style={[
                  styles.customTimeSubtext,
                  {
                    color: !isSuggestedTime ? colors.surface : colors.textSecondary,
                  },
                ]}
              >
                {!isSuggestedTime ? `Đang chọn ${time}` : 'Từ 09:00 đến 16:00'}
              </Text>
            </View>
          </Pressable>
        </View>
      )}

      {customTimeOpen && (
        <View style={[styles.picker, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.quickLabel, { color: colors.textSecondary }]}>
            Chọn giờ bắt đầu cụ thể từ 09:00 đến 16:00
          </Text>
          <DateTimePicker
            value={timePickerValue(time)}
            mode="time"
            display={Platform.OS === 'ios' ? 'spinner' : 'clock'}
            presentation={Platform.OS === 'ios' ? 'inline' : 'dialog'}
            is24Hour
            locale="vi_VN"
            accentColor={colors.primary}
            themeVariant="light"
            positiveButton={{ label: 'Chọn' }}
            negativeButton={{ label: 'Hủy' }}
            onValueChange={(_event, selectedTime) => {
              const nextTime = formatClockValue(selectedTime);
              if (!isCustomerBookingStartTime(nextTime)) {
                setCustomTimeError('Vui lòng chọn giờ bắt đầu từ 09:00 đến 16:00.');
                setCustomTimeOpen(false);
                return;
              }
              onTimeChange(nextTime);
              setCustomTimeError('');
              void Haptics.selectionAsync();
              setCustomTimeOpen(Platform.OS === 'ios');
            }}
            onDismiss={() => setCustomTimeOpen(false)}
          />
        </View>
      )}

      {!!customTimeError && (
        <Text accessibilityRole="alert" style={[styles.error, { color: '#DC2626' }]}>
          {customTimeError}
        </Text>
      )}

      <Text style={[styles.hint, { color: colors.textSecondary }]}>
        Chọn nhanh một giờ gợi ý hoặc chọn giờ cụ thể. Thời gian tiếp nhận dự kiến kéo dài khoảng 2
        giờ.
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
  picker: { borderWidth: 1, borderRadius: 12, padding: 10, overflow: 'hidden', gap: 8 },
  timePanel: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    gap: 10,
  },
  quickLabel: { fontSize: 12, lineHeight: 18, fontWeight: '600' },
  timeGrid: {
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
  customTimeButton: {
    minHeight: 54,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  customTimeCopy: { flex: 1, gap: 2 },
  customTimeTitle: { fontSize: 14, fontWeight: '700' },
  customTimeSubtext: { fontSize: 12 },
  hint: { fontSize: 12, lineHeight: 18 },
  error: { fontSize: 12, lineHeight: 18, fontWeight: '600' },
});
