import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { FileClock } from 'lucide-react-native';
import { bookingDraftsApi, describeBookingDraft, fetchCurrentBookingDraft, formatDraftExpiry, type BookingDraft } from '../../api/booking-drafts.api';
import { useAuthStore } from '../../store/auth.store';
import { UserRole } from '../../types';
import { useAppTheme } from '../../constants/theme';

/**
 * "Đơn đặt lịch chưa hoàn tất" (web BookingDraftBanner): the customer's saved, unfinished request, read on focus. A draft
 * is quiet: no draft, a failed read or a signed-out customer shows nothing.
 */
export default function BookingDraftBanner() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const navigation = useNavigation<any>();
  const isCustomer = useAuthStore((s) => s.isAuthenticated && s.user?.role === UserRole.CUSTOMER);
  const [draft, setDraft] = useState<BookingDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useFocusEffect(useCallback(() => {
    if (!isCustomer) return undefined;
    let alive = true;
    void fetchCurrentBookingDraft().then((next) => { if (alive) setDraft(next); });
    return () => { alive = false; };
  }, [isCustomer]));

  const discard = () => {
    Alert.alert('Huỷ bản nháp đặt lịch?', 'Thông tin đã lưu trong bản nháp sẽ bị xoá và không thể khôi phục.', [
      { text: 'Giữ lại', style: 'cancel' },
      {
        text: 'Huỷ bản nháp', style: 'destructive',
        onPress: () => {
          setBusy(true);
          bookingDraftsApi.discard()
            .then((r) => { if (r.deleted) { setDraft(null); setMessage('Đã huỷ bản nháp.'); } })
            .catch(() => setMessage('Chưa huỷ được bản nháp. Vui lòng thử lại.'))
            .finally(() => setBusy(false));
        },
      },
    ]);
  };

  if (!isCustomer || (!draft && !message)) return null;
  if (!draft) return <Text accessibilityLiveRegion="polite" style={styles.message}>{message}</Text>;
  return (
    <View testID="booking-draft-banner" style={styles.card}>
      <View style={styles.head}>
        <View style={styles.tile} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><FileClock size={20} strokeWidth={1.75} color={colors.primaryStrong} /></View>
        <View style={styles.flex}>
          <Text accessibilityRole="header" style={styles.title}>Đơn đặt lịch chưa hoàn tất</Text>
          <Text style={styles.meta}>{describeBookingDraft(draft)}</Text>
          <Text style={styles.meta}>{`Hết hạn ${formatDraftExpiry(draft.expiresAt)}`}</Text>
        </View>
      </View>
      {!!message && <Text accessibilityLiveRegion="polite" style={styles.message}>{message}</Text>}
      <View style={styles.row}>
        <Pressable testID="booking-draft-resume" accessibilityRole="button" accessibilityLabel="Tiếp tục đặt" disabled={busy}
          onPress={() => navigation.navigate('CustomerBookingCreate', { resumeDraft: true })} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
          <Text style={styles.primaryText}>Tiếp tục đặt</Text>
        </Pressable>
        <Pressable testID="booking-draft-discard" accessibilityRole="button" accessibilityLabel="Huỷ bản nháp" disabled={busy} onPress={discard}
          style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
          {busy ? <ActivityIndicator size="small" color={colors.primaryStrong} /> : <Text style={styles.secondaryText}>Huỷ bản nháp</Text>}
        </Pressable>
      </View>
    </View>
  );
}

const getStyles = (colors: ReturnType<typeof useAppTheme>['colors']) => StyleSheet.create({
  flex: { flex: 1 },
  card: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, padding: 16, gap: 12 },
  head: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  tile: { width: 40, height: 40, borderRadius: 10, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.text, fontSize: 15, lineHeight: 22, fontWeight: '700' },
  meta: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  message: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  row: { flexDirection: 'row', gap: 8 },
  primary: { flex: 1, minHeight: 48, borderRadius: 12, backgroundColor: colors.primaryStrong, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  primaryText: { color: colors.surface, fontSize: 15, fontWeight: '600' },
  secondary: { minHeight: 48, minWidth: 120, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  secondaryText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  pressed: { opacity: 0.8 },
});
