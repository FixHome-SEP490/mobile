import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useNavigation } from '@react-navigation/native';
import { Clock } from 'lucide-react-native';
import { ordersApi, type DelayDecision, type ServiceOrderItem } from '../../../api/orders.api';
import { useOptionalOrderSession } from '../runtime/OrderSessionProvider';
import { DELAY_CHOICES, delayDecisionError, delayNoticeState } from './delay-notice';
import { lightTheme as colors, spacing } from '../../../constants/theme';

/** The technician reported this order late: the customer waits, picks another technician or cancels without fee. */
export default function DelayNoticeCard({ order }: { order: ServiceOrderItem }) {
  const navigation = useNavigation<any>();
  const session = useOptionalOrderSession();
  const [busy, setBusy] = useState<DelayDecision | null>(null);
  const [error, setError] = useState('');
  const state = delayNoticeState(order);
  if (!state) return null;
  if (state.kind === 'waiting') {
    return (
      <View testID="delay-waiting" style={[styles.card, styles.quiet]}>
        <Text style={styles.meta}>{`Bạn đã chọn đợi thêm. Kỹ thuật viên có thể tới trễ khoảng ${state.minutes} phút.`}</Text>
      </View>
    );
  }

  const send = async (decision: DelayDecision) => {
    setBusy(decision);
    setError('');
    try {
      await ordersApi.decideDelay(order.id, decision);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (decision === 'switch' && order.bookingId) navigation.navigate('CustomerBookingDetail', { bookingId: order.bookingId, released: true });
      else await session?.refresh('delay-decision');
    } catch (err) {
      setError(delayDecisionError(err));
    } finally {
      setBusy(null);
    }
  };
  const choose = (choice: (typeof DELAY_CHOICES)[number]) => {
    if (busy) return;
    if (!choice.confirmText) { void send(choice.decision); return; }
    Alert.alert(choice.confirmTitle, choice.confirmText, [
      { text: 'Quay lại', style: 'cancel' },
      { text: choice.label, style: choice.decision === 'cancel' ? 'destructive' : 'default', onPress: () => void send(choice.decision) },
    ]);
  };

  return (
    <View testID="delay-ask" accessibilityRole="alert" style={styles.card}>
      <View style={styles.head}>
        <Clock size={18} strokeWidth={1.75} color={colors.tone.warning.text} />
        <Text style={styles.title}>Kỹ thuật viên báo trễ</Text>
      </View>
      <Text style={styles.body}>{`Kỹ thuật viên chưa xong đơn trước (${state.reason}) nên có thể tới trễ khoảng ${state.minutes} phút. Bạn muốn thế nào?`}</Text>
      {DELAY_CHOICES.map((choice, index) => (
        <Pressable
          key={choice.decision}
          testID={`delay-choice-${choice.decision}`}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy !== null }}
          disabled={busy !== null}
          onPress={() => choose(choice)}
          style={[styles.btn, index === 0 ? styles.primary : styles.secondary, busy !== null && styles.disabled]}
        >
          {busy === choice.decision
            ? <ActivityIndicator size="small" color={index === 0 ? colors.surface : colors.primaryStrong} />
            : <Text style={[styles.btnText, index === 0 ? styles.primaryText : styles.secondaryText]}>{choice.label}</Text>}
        </Pressable>
      ))}
      {!!error && <Text testID="delay-error" accessibilityRole="alert" style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: spacing.md, borderRadius: 12, backgroundColor: colors.tone.warning.bg, gap: 8, marginTop: 4 },
  quiet: { backgroundColor: colors.primarySoft },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: colors.tone.warning.text, fontSize: 15, fontWeight: '700' },
  body: { color: colors.text, fontSize: 14, lineHeight: 21 },
  meta: { color: colors.text, fontSize: 14, lineHeight: 20 },
  btn: { minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  primary: { backgroundColor: colors.primaryStrong },
  secondary: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  btnText: { fontSize: 15, fontWeight: '700', textAlign: 'center' },
  primaryText: { color: colors.surface },
  secondaryText: { color: colors.primaryStrong },
  error: { color: colors.tone.danger.text, fontSize: 13, lineHeight: 19 },
  disabled: { opacity: 0.6 },
});
