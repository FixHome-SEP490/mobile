import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

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
  error: string;
};

function bookingEndTime(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  const end = hours * 60 + minutes + 2 * 60;
  const endHour = String(Math.floor(end / 60)).padStart(2, '0');
  const endMinute = String(end % 60).padStart(2, '0');
  return `${endHour}:${endMinute}`;
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
  const [dateOpen, setDateOpen] = useState(true);
  const [timeOpen, setTimeOpen] = useState(true);
  const [customTimeOpen, setCustomTimeOpen] = useState(false);
  const [customTimeError, setCustomTimeError] = useState('');
  const [customTimeText, setCustomTimeText] = useState(time);
  const { minimumDate, maximumDate } = getBookingDateRange();
  const endTime = bookingEndTime(time);
  const isSuggestedTime = BOOKING_START_TIMES.some((option) => option === time);

  const toggleDate = () => {
    void Haptics.selectionAsync();
    setTimeOpen(true);
    setCustomTimeOpen(false);
    setDateOpen(true);
  };

  const toggleTime = () => {
    void Haptics.selectionAsync();
    setDateOpen(true);
    setCustomTimeOpen(false);
    setCustomTimeError('');
    setTimeOpen(true);
  };

  const openDetailedTime = () => {
    void Haptics.selectionAsync();
    setTimeOpen(true);
    setCustomTimeError('');
    setCustomTimeText(time);
    setCustomTimeOpen(true);
  };

  const applyCustomTime = () => {
    const raw = customTimeText.trim();
    const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(raw)
      ?? /^([01]\d|2[0-3])([0-5]\d)$/.exec(raw);
    const nextTime = match ? `${match[1].padStart(2, '0')}:${match[2]}` : '';
    if (!isCustomerBookingStartTime(nextTime)) {
      setCustomTimeError('Chọn giờ hợp lệ từ 09:00 đến 16:00.');
      return;
    }
    onTimeChange(nextTime);
    void Haptics.selectionAsync();
    setCustomTimeError('');
    setCustomTimeOpen(false);
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
        <View testID="booking-inline-date-choices"
          style={[styles.picker, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.quickLabel, { color: colors.text }]}>Chọn ngày hẹn</Text>
          <View style={styles.dateChoices}>
            {Array.from({ length: 4 }, (_, offset) => {
              const option = new Date(minimumDate.getFullYear(), minimumDate.getMonth(), minimumDate.getDate() + offset);
              const allowed = option.getTime() <= maximumDate.getTime();
              const chosen = date.getFullYear() === option.getFullYear()
                && date.getMonth() === option.getMonth()
                && date.getDate() === option.getDate();
              return (
                <Pressable
                  key={offset}
                  accessibilityRole="button"
                  accessibilityLabel={`Chọn ngày ${formatBookingDate(option)}`}
                  accessibilityState={{ selected: chosen, disabled: !allowed }}
                  disabled={!allowed}
                  onPress={() => {
                    onDateChange(option);
                    void Haptics.selectionAsync();
                    setDateOpen(true);
                  }}
                  style={[styles.dateChoice, {
                    borderColor: chosen ? colors.primary : colors.border,
                    backgroundColor: chosen ? colors.primary : colors.background,
                  }]}
                >
                  <Text style={{ fontSize: 12, color: chosen ? colors.surface : colors.textSecondary }}>
                    {offset === 0 ? 'Hôm nay' : offset === 1 ? 'Ngày mai' : `+${offset} ngày`}
                  </Text>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: chosen ? colors.surface : colors.text }}>
                    {`${String(option.getDate()).padStart(2, '0')}/${String(option.getMonth() + 1).padStart(2, '0')}`}
                  </Text>
                </Pressable>
              );
            })}
          </View>
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
                    setTimeOpen(true);
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
          <Text style={[styles.quickLabel, { color: colors.text }]}>Giờ bắt đầu (09:00–16:00)</Text>
          <View style={styles.customTimeRow}>
            <TextInput
              accessibilityLabel="Nhập giờ bắt đầu cụ thể"
              accessibilityHint="Nhập 09:30 hoặc 0930, theo định dạng 24 giờ."
              style={[styles.customTimeInput, { color: colors.text, borderColor: colors.border }]}
              value={customTimeText}
              onChangeText={setCustomTimeText}
              maxLength={5}
              placeholder="09:30"
              keyboardType="numbers-and-punctuation"
              autoCorrect={false}
            />
            <Pressable accessibilityRole="button" accessibilityLabel="Áp dụng giờ cụ thể"
              style={[styles.customTimeApply, { backgroundColor: colors.primary }]}
              onPress={applyCustomTime}>
              <Text style={{ color: colors.surface, fontWeight: '700' }}>Áp dụng</Text>
            </Pressable>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Hủy chọn giờ cụ thể"
            onPress={() => { setCustomTimeOpen(false); setCustomTimeError(''); }}
            style={styles.customTimeCancel}>
            <Text style={{ color: colors.textSecondary }}>Hủy</Text>
          </Pressable>
        </View>
      )}

      {!!customTimeError && (
        <Text accessibilityRole="alert" style={[styles.error, { color: colors.error }]}>
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
  dateChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dateChoice: { flexGrow: 1, minWidth: 70, minHeight: 62, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 3, paddingHorizontal: 6 },
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
  customTimeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  customTimeInput: { flex: 1, minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontSize: 17, fontWeight: '600' },
  customTimeApply: { minHeight: 48, paddingHorizontal: 18, borderRadius: 12, justifyContent: 'center' },
  customTimeCancel: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center', paddingHorizontal: 10 },
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
