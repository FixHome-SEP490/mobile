import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CalendarClock, X } from 'lucide-react-native';
import { bookingsApi, type SessionOption } from '../api/bookings.api';
import { useAppTheme } from '../constants/theme';
import { useReduceMotion } from '../hooks/useReduceMotion';
import { SLOT_SHORT, sessionDayLabel, sessionLabel } from '../utils/booking-session';
import { extractApiErrorMessage } from '../utils/input-validation';

/**
 * Moves a booking whose technician already accepted: only the sessions that technician is free
 * for can be picked, and the technician is told about the new time (same rule as the web).
 */
export default function AcceptedRescheduleSheet({
  bookingId, current, visible, onClose, onDone,
}: {
  bookingId: string;
  /** The appointment as it stands, for the "Lịch hiện tại" card. */
  current: { bookingMode?: string | null; slot?: string | null; start?: string | null };
  visible: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const { colors } = useAppTheme();
  const reduceMotion = useReduceMotion();
  const [sessions, setSessions] = useState<SessionOption[]>([]);
  const [selected, setSelected] = useState<SessionOption | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return undefined;
    let live = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset and load the technician's free sessions each time the sheet opens
    setLoading(true); setError(''); setSelected(null);
    bookingsApi.availableSessions(bookingId)
      .then((r) => { if (live) setSessions(r.sessions); })
      .catch((e) => { if (live) setError(extractApiErrorMessage(e, 'Chưa tải được các buổi, thử lại sau.')); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [visible, bookingId]);

  const close = () => { if (!busy) onClose(); };
  const save = async () => {
    if (busy || !selected) return;
    setBusy(true); setError('');
    try {
      await bookingsApi.reschedule(bookingId, { mode: 'scheduled', date: selected.date, slot: selected.slot });
      onDone();
      onClose();
    } catch (e) {
      setError(extractApiErrorMessage(e, 'Chưa đổi được lịch, thử lại sau.'));
    } finally {
      setBusy(false);
    }
  };

  const days = [...new Set(sessions.map((s) => s.date))];
  return (
    <Modal visible={visible} transparent animationType={reduceMotion ? 'none' : 'slide'} onRequestClose={close}>
      <View style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityRole="button" accessibilityLabel="Đóng" />
        <SafeAreaView edges={['bottom']} style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <View style={styles.header}>
            <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>Đổi lịch hẹn</Text>
            <Pressable testID="accepted-reschedule-close" accessibilityRole="button" accessibilityLabel="Đóng" onPress={close} disabled={busy} style={styles.close}>
              <X size={22} color={colors.text} />
            </Pressable>
          </View>
          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            <View style={[styles.current, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <CalendarClock size={20} color={colors.primaryStrong} />
              <View style={styles.flex}>
                <Text style={[styles.hint, { color: colors.textSecondary }]}>Lịch hiện tại</Text>
                <Text style={[styles.currentText, { color: colors.text }]}>{sessionLabel({ bookingMode: current.bookingMode, slot: current.slot, start: current.start })}</Text>
              </View>
            </View>
            <Text style={[styles.hint, { color: colors.textSecondary }]}>
              Kỹ thuật viên đã nhận đơn nên chỉ chọn được các buổi họ còn rảnh. Họ sẽ được báo lịch mới.
            </Text>
            {loading && <ActivityIndicator color={colors.primary} style={styles.loader} />}
            {!loading && days.map((date) => (
              <View key={date} style={styles.day}>
                <Text style={[styles.dayTitle, { color: colors.text }]}>{sessionDayLabel(date)}</Text>
                {sessions.filter((s) => s.date === date).map((s) => {
                  const on = selected?.date === s.date && selected.slot === s.slot;
                  return (
                    <Pressable
                      key={`${s.date}-${s.slot}`}
                      testID={`accepted-session-${s.date}-${s.slot}`}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: on, disabled: !s.available }}
                      disabled={!s.available}
                      onPress={() => setSelected(s)}
                      style={[styles.row, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primarySoft : colors.surface, opacity: s.available ? 1 : 0.5 }]}
                    >
                      <Text style={{ color: colors.text, fontWeight: on ? '700' : '500' }}>{SLOT_SHORT[s.slot]}</Text>
                      {!s.available && <Text style={[styles.hint, { color: colors.textSecondary }]}>{s.reason ?? 'Thợ bận'}</Text>}
                    </Pressable>
                  );
                })}
              </View>
            ))}
            {!loading && !error && days.length === 0 && <Text style={[styles.hint, { color: colors.textSecondary }]}>Chưa có buổi nào để chọn.</Text>}
            {!!error && <Text accessibilityRole="alert" style={[styles.error, { color: colors.tone.danger.text }]}>{error}</Text>}
          </ScrollView>
          <View style={[styles.footer, { borderTopColor: colors.border }]}>
            <Pressable
              testID="accepted-reschedule-save"
              accessibilityRole="button"
              accessibilityState={{ disabled: busy || !selected }}
              disabled={busy || !selected}
              onPress={() => void save()}
              style={[styles.save, { backgroundColor: colors.primary, opacity: busy || !selected ? 0.5 : 1 }]}
            >
              <Text style={styles.saveText}>{busy ? 'Đang đổi lịch...' : 'Xác nhận đổi lịch'}</Text>
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
  header: { flexDirection: 'row', alignItems: 'center', paddingLeft: 16, paddingRight: 8, paddingTop: 8 },
  title: { flex: 1, fontSize: 18, lineHeight: 24, fontWeight: '800' },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  body: { flexShrink: 1 },
  bodyContent: { padding: 16, gap: 12 },
  flex: { flex: 1 },
  current: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 14, padding: 12 },
  currentText: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  hint: { fontSize: 12, lineHeight: 18 },
  loader: { paddingVertical: 24 },
  day: { gap: 8 },
  dayTitle: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  row: { minHeight: 48, justifyContent: 'center', borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  error: { fontSize: 12, fontWeight: '600' },
  footer: { padding: 16, borderTopWidth: StyleSheet.hairlineWidth },
  save: { minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  saveText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
