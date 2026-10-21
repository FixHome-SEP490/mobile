import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CalendarClock, Info, X } from 'lucide-react-native';
import type { BookingItem } from '../api/bookings.api';
import { useAppTheme } from '../constants/theme';
import { scheduleSummary, sessionLabel, type BookingSchedule } from '../utils/booking-session';
import BookingSessionPicker from './BookingSessionPicker';

/**
 * Bottom sheet to move a booking that has no technician yet. Unlike the booking form it shows
 * the current appointment, what the change does, the new pick, and a footer that stays in view.
 */
export default function BookingRescheduleSheet({
  visible, booking, schedule, busy, error, animated, onChange, onSave, onClose,
}: {
  visible: boolean;
  booking: BookingItem;
  schedule: BookingSchedule | null;
  busy: boolean;
  error: string | null;
  animated: boolean;
  onChange: (next: BookingSchedule | null) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const { colors } = useAppTheme();
  const close = () => { if (!busy) onClose(); };
  return (
    <Modal visible={visible} transparent animationType={animated ? 'slide' : 'none'} onRequestClose={close}>
      <View style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityRole="button" accessibilityLabel="Đóng" />
        <SafeAreaView edges={['bottom']} style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>Đổi lịch hẹn</Text>
              {!!booking.serviceName && (
                <Text numberOfLines={1} style={[styles.sub, { color: colors.textSecondary }]}>{booking.serviceName}</Text>
              )}
            </View>
            <Pressable testID="reschedule-close" accessibilityRole="button" accessibilityLabel="Đóng" onPress={close} disabled={busy} style={styles.close}>
              <X size={22} color={colors.text} />
            </Pressable>
          </View>
          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} keyboardShouldPersistTaps="handled">
            <View style={[styles.current, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <CalendarClock size={20} color={colors.primaryStrong} />
              <View style={styles.headerCopy}>
                <Text style={[styles.sub, { color: colors.textSecondary }]}>Lịch hiện tại</Text>
                <Text style={[styles.currentText, { color: colors.text }]}>
                  {sessionLabel({ bookingMode: booking.bookingMode, slot: booking.slot, start: booking.preferredStartAt ?? booking.preferredAt })}
                </Text>
              </View>
            </View>
            <View style={styles.notice}>
              <Info size={16} color={colors.textSecondary} />
              <Text style={[styles.noticeText, { color: colors.textSecondary }]}>
                Lời mời đã gửi sẽ bị huỷ. Sau khi lưu, bạn sẽ chọn lại kỹ thuật viên cho lịch mới.
              </Text>
            </View>
            <Text style={[styles.section, { color: colors.text }]}>Chọn lịch mới</Text>
            <BookingSessionPicker value={schedule} onChange={onChange} allowUrgent={false} />
            {!!error && <Text accessibilityRole="alert" style={[styles.error, { color: colors.tone.danger.text }]}>{error}</Text>}
          </ScrollView>
          <View style={[styles.footer, { borderTopColor: colors.border }]}>
            {schedule && (
              <Text style={[styles.sub, { color: colors.textSecondary }]}>Lịch mới: <Text style={{ color: colors.text, fontWeight: '700' }}>{scheduleSummary(schedule)}</Text></Text>
            )}
            <Pressable
              testID="reschedule-save"
              accessibilityRole="button"
              accessibilityState={{ disabled: busy || !schedule }}
              disabled={busy || !schedule}
              onPress={onSave}
              style={[styles.save, { backgroundColor: colors.primary, opacity: busy || !schedule ? 0.5 : 1 }]}
            >
              <Text style={styles.saveText}>{busy ? 'Đang xác minh...' : 'Xác nhận đổi lịch'}</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { maxHeight: '90%', borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 16, paddingRight: 8, paddingTop: 4 },
  headerCopy: { flex: 1 },
  title: { fontSize: 18, lineHeight: 24, fontWeight: '800' },
  sub: { fontSize: 12, lineHeight: 18 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  body: { flexShrink: 1 },
  bodyContent: { padding: 16, gap: 12 },
  current: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 14, padding: 12 },
  currentText: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  notice: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  noticeText: { flex: 1, fontSize: 12, lineHeight: 18 },
  section: { fontSize: 15, lineHeight: 22, fontWeight: '700' },
  error: { fontSize: 12, fontWeight: '600' },
  footer: { gap: 8, padding: 16, borderTopWidth: StyleSheet.hairlineWidth },
  save: { minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  saveText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
