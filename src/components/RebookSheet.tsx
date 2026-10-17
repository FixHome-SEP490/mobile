import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { bookingsApi, type SessionOption } from '../api/bookings.api';
import { useAppTheme } from '../constants/theme';
import { useReduceMotion } from '../hooks/useReduceMotion';
import { extractApiErrorMessage } from '../utils/input-validation';

/**
 * "Đặt lại thợ": new booking with the same service and address from a finished
 * or cancelled one. The former technician is invited when free in the chosen
 * session; otherwise the customer picks another technician.
 */
export default function RebookSheet({ bookingId, visible, onClose }: { bookingId: string; visible: boolean; onClose: () => void }) {
  const { colors } = useAppTheme();
  const navigation = useNavigation<any>();
  const reduceMotion = useReduceMotion();
  const insets = useSafeAreaInsets();
  const [sessions, setSessions] = useState<SessionOption[]>([]);
  const [hasPrevious, setHasPrevious] = useState(false);
  const [selected, setSelected] = useState<SessionOption | null>(null);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return undefined;
    let live = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset and load the sessions each time the sheet opens
    setLoading(true); setError(''); setSelected(null); setNote('');
    bookingsApi.availableSessions(bookingId, true)
      .then((r) => { if (live) { setSessions(r.sessions); setHasPrevious(!!r.technicianId); } })
      .catch((e) => { if (live) setError(extractApiErrorMessage(e, 'Chưa tải được các buổi, thử lại sau.')); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [visible, bookingId]);

  const confirm = async () => {
    if (busy) return;
    if (!selected) { setError('Vui lòng chọn ngày và buổi.'); return; }
    setBusy(true); setError('');
    try {
      const r = await bookingsApi.rebook(bookingId, {
        date: selected.date, slot: selected.slot, ...(note.trim() ? { customerNote: note.trim() } : {}),
      });
      onClose();
      navigation.navigate(
        r.previousTechnicianInvited ? 'CustomerBookingDetail' : 'CustomerMatching',
        { bookingId: r.booking.id, rebooked: r.previousTechnicianInvited ? 'invited' : 'choose' },
      );
    } catch (e) {
      setError(extractApiErrorMessage(e, 'Chưa đặt lại được, thử lại sau.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType={reduceMotion ? 'none' : 'slide'} onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: 20 + insets.bottom }]}>
          <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>Đặt lại thợ</Text>
          <Text style={[styles.hint, { color: colors.textSecondary }]}>
            Tạo yêu cầu mới cùng dịch vụ và địa chỉ. Thợ cũ rảnh buổi bạn chọn thì lời mời gửi thẳng cho thợ cũ; bận thì bạn chọn thợ khác.
          </Text>
          {loading ? <ActivityIndicator style={styles.loader} color={colors.primary} /> : (
            <ScrollView style={styles.list}>
              {!hasPrevious && <Text style={[styles.hint, { color: colors.textSecondary }]}>Yêu cầu cũ chưa có thợ nhận, bạn sẽ chọn thợ sau khi đặt.</Text>}
              {sessions.map((s) => {
                const on = selected?.date === s.date && selected.slot === s.slot;
                return (
                  <Pressable
                    key={`${s.date}-${s.slot}`}
                    testID={`rebook-session-${s.date}-${s.slot}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    onPress={() => setSelected(s)}
                    style={({ pressed }) => [styles.row, { borderColor: on ? colors.primary : colors.border, opacity: pressed ? 0.8 : 1 }]}
                  >
                    <Text style={{ color: colors.text, fontWeight: on ? '700' : '500' }}>{s.label}</Text>
                    {!s.available && <Text style={[styles.busy, { color: colors.textSecondary }]}>{s.reason ?? 'Thợ cũ bận'} · chọn thợ khác</Text>}
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
          <TextInput accessibilityLabel="Ghi chú cho thợ"
            testID="rebook-note"
            value={note}
            onChangeText={setNote}
            maxLength={1000}
            multiline
            placeholder="Ghi chú cho thợ (không bắt buộc)"
            placeholderTextColor={colors.textSecondary}
            style={[styles.input, { borderColor: colors.border, color: colors.text }]}
          />
          {!!error && <Text accessibilityRole="alert" style={{ color: colors.error }}>{error}</Text>}
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" onPress={onClose} style={styles.btn}><Text style={{ color: colors.text, fontWeight: '600' }}>Quay lại</Text></Pressable>
            <Pressable
              testID="rebook-confirm"
              accessibilityRole="button"
              accessibilityState={{ disabled: busy || loading, busy }}
              disabled={busy || loading}
              onPress={() => void confirm()}
              style={({ pressed }) => [styles.btn, { backgroundColor: colors.primary, opacity: busy || loading ? 0.6 : pressed ? 0.8 : 1 }]}
            >
              {busy ? <ActivityIndicator color={colors.surface} /> : <Text style={{ color: colors.surface, fontWeight: '700' }}>Đặt lại</Text>}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { padding: 16, gap: 12, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '85%' },
  title: { fontSize: 20, fontWeight: '700' },
  hint: { fontSize: 13, lineHeight: 19 },
  loader: { paddingVertical: 32 },
  list: { maxHeight: 280 },
  row: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderRadius: 12, marginBottom: 8 },
  busy: { fontSize: 12, lineHeight: 18 },
  input: { minHeight: 56, borderWidth: 1, borderRadius: 12, padding: 12 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  btn: { minHeight: 48, minWidth: 96, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, borderRadius: 12 },
});
