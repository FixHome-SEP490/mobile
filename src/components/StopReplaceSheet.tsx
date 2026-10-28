import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supportCasesApi, type MySupportCase } from '../api/support-cases.api';
import { useAppTheme } from '../constants/theme';
import { useReduceMotion } from '../hooks/useReduceMotion';
import {
  findStopRequest, isActiveStopRequest, isDefiniteRefusal, STOP_REASON_MAX, STOP_REQUEST_NOTE, STOP_UNCLEAR, stopReasonProblem, stopRequestStatusText,
} from '../screens/customer/stop-replace';
import { extractApiErrorMessage } from '../utils/input-validation';

/**
 * "Yêu cầu dừng / đổi thợ" (web #183): the customer asks a manager to stop the repair or change the technician. It shows the
 * request already sent, if any, and otherwise a short form. Sending changes nothing about the order by itself.
 */
export default function StopReplaceSheet({ orderId, visible, onClose }: { orderId: string; visible: boolean; onClose: () => void }) {
  const { colors } = useAppTheme();
  const reduceMotion = useReduceMotion();
  const insets = useSafeAreaInsets();
  const [cases, setCases] = useState<MySupportCase[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // After an answer that may have been lost the form stays shut until the list has been read again.
  const [needsCheck, setNeedsCheck] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const page = await supportCasesApi.listMine({ serviceOrderId: orderId, limit: 20 });
      setCases(page.data);
      return page.data;
    } catch {
      setLoadError('Chưa tải được trạng thái yêu cầu. Vui lòng thử lại.');
      return null;
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    if (!visible) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the request when the sheet opens
    setReason(''); setError(''); setNeedsCheck(false);
    void load();
  }, [visible, load]);

  const existing = cases ? findStopRequest(cases, orderId) : null;
  const active = isActiveStopRequest(existing);
  const problem = reason.trim() ? stopReasonProblem(reason) : null;
  const canSend = !busy && !needsCheck && !active && !loading && cases !== null && stopReasonProblem(reason) === null;

  const send = async () => {
    if (!canSend) return;
    setBusy(true);
    setError('');
    try {
      await supportCasesApi.requestStopReplace(orderId, reason);
      setReason('');
      await load();
    } catch (err) {
      if (isDefiniteRefusal(err)) {
        setError(extractApiErrorMessage(err, 'Chưa gửi được yêu cầu. Vui lòng kiểm tra lại rồi thử lại.'));
      } else {
        // The request may have been saved: read it back before offering to send again.
        const fresh = await load();
        if (fresh && findStopRequest(fresh, orderId)) setNeedsCheck(false);
        else { setNeedsCheck(true); setError(STOP_UNCLEAR); }
      }
    } finally {
      setBusy(false);
    }
  };

  // Reads the list again after a lost answer. A request found is shown; none found means it did not go through, so sending again is safe.
  const checkStatus = async () => {
    const fresh = await load();
    if (!fresh) return;
    setNeedsCheck(false);
    setError(findStopRequest(fresh, orderId) ? '' : 'Chưa thấy yêu cầu nào đã gửi. Bạn có thể gửi lại.');
  };

  const close = () => { if (!busy) onClose(); };
  return (
    <Modal visible={visible} transparent animationType={reduceMotion ? 'none' : 'slide'} onRequestClose={close}>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityRole="button" accessibilityLabel="Đóng" />
        <View style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: Math.max(insets.bottom, 16) }]}>
          <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>Yêu cầu dừng sửa hoặc đổi thợ</Text>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
            <Text style={[styles.hint, { color: colors.textSecondary }]}>{STOP_REQUEST_NOTE}</Text>
            {loading && cases === null ? <ActivityIndicator color={colors.primary} /> : null}
            {loadError ? (
              <Pressable onPress={() => void load()} accessibilityRole="button" style={styles.link}>
                <Text style={{ color: colors.tone.danger.text }}>{loadError} Thử lại</Text>
              </Pressable>
            ) : null}
            {existing ? (
              <View style={[styles.box, { borderColor: colors.border }]} testID="stop-request-status">
                <Text style={[styles.strong, { color: colors.text }]}>{stopRequestStatusText(existing)}</Text>
                <Text style={[styles.hint, { color: colors.textSecondary }]} numberOfLines={4}>{existing.reason}</Text>
                {existing.resolutionReason ? <Text style={[styles.hint, { color: colors.textSecondary }]}>{existing.resolutionReason}</Text> : null}
              </View>
            ) : null}
            {!active && cases !== null ? (
              <View style={{ gap: 8 }}>
                <Text style={[styles.label, { color: colors.text }]}>Lý do</Text>
                <TextInput
                  style={[styles.input, { borderColor: colors.border, color: colors.text }]}
                  value={reason}
                  onChangeText={setReason}
                  multiline
                  maxLength={STOP_REASON_MAX}
                  editable={!busy && !needsCheck}
                  placeholder="Ví dụ: Kỹ thuật viên chưa xử lý được lỗi, tôi muốn đổi người khác"
                  placeholderTextColor={colors.muted}
                  accessibilityLabel="Lý do dừng sửa hoặc đổi thợ"
                  testID="stop-request-reason"
                />
                {problem ? <Text style={{ color: colors.tone.danger.text, fontSize: 13 }}>{problem}</Text> : null}
              </View>
            ) : null}
            {error ? <Text style={{ color: colors.tone.danger.text, fontSize: 14, lineHeight: 20 }} accessibilityRole="alert" testID="stop-request-error">{error}</Text> : null}
          </ScrollView>
          {needsCheck ? (
            <Pressable onPress={() => void checkStatus()} style={styles.button} accessibilityRole="button" testID="stop-request-check">
              <Text style={{ color: colors.primaryStrong, fontWeight: '600' }}>Kiểm tra trạng thái</Text>
            </Pressable>
          ) : !active ? (
            <Pressable
              onPress={() => void send()}
              disabled={!canSend}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSend }}
              style={[styles.button, { backgroundColor: colors.primaryStrong, opacity: canSend ? 1 : 0.5 }]}
              testID="stop-request-send"
            >
              <Text style={{ color: colors.surface, fontWeight: '600' }}>{busy ? 'Đang gửi yêu cầu…' : 'Gửi yêu cầu'}</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={close} disabled={busy} style={styles.button} accessibilityRole="button" accessibilityLabel="Đóng">
            <Text style={{ color: colors.primaryStrong, fontWeight: '600' }}>Đóng</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 16, paddingTop: 16, gap: 8, maxHeight: '88%' },
  title: { fontSize: 18, lineHeight: 24, fontWeight: '700' },
  body: { gap: 12, paddingBottom: 8 },
  hint: { fontSize: 14, lineHeight: 20 },
  strong: { fontSize: 16, lineHeight: 24, fontWeight: '600' },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '500' },
  box: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 4 },
  input: { minHeight: 96, borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 16, textAlignVertical: 'top' },
  button: { minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  link: { minHeight: 44, justifyContent: 'center' },
});
