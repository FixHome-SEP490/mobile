import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import BackButton from '../../components/BackButton';
import BookingSessionPicker from '../../components/BookingSessionPicker';
import { bookingsApi } from '../../api/bookings.api';
import { createIdempotencyKey } from '../../api/part-requests.api';
import { useAppTheme } from '../../constants/theme';
import type { RootStackParamList } from '../../types';
import { scheduleSummary, type BookingSchedule } from '../../utils/booking-session';
import { extractApiErrorMessage } from '../../utils/input-validation';
import {
  buildRebookDto,
  parseRebookResult,
  parseRepairFailureDraft,
  REBOOK_UNCLEAR,
  type RebookKind,
  type RepairFailureDraft,
} from './failed-repair-rebook';

type Route = RouteProp<RootStackParamList, 'CustomerFailedRepairRebook' | 'CustomerInterruptionRebook'>;

/**
 * Book again the devices a visit could not repair (web #175). The server freezes the draft (service, description,
 * address); the customer only picks a new time. The original photos are not carried over.
 * The same screen books again a job a manager closed (web #183, `CustomerInterruptionRebook`): then the previous technician
 * is not offered the new booking.
 */
export default function CustomerFailedRepairRebookScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<Route>();
  const params = route.params;
  const kind: RebookKind = 'bookingId' in params ? 'interruption' : 'failure';
  const sourceBookingIds = 'bookingId' in params ? [params.bookingId] : params.sourceBookingIds;
  const sourcesKey = sourceBookingIds.join(',');

  const [draft, setDraft] = useState<RepairFailureDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [schedule, setSchedule] = useState<BookingSchedule | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // The same key for every retry of this screen, so an unclear answer can never book twice.
  const idempotencyKey = useRef(createIdempotencyKey('rebook'));

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const anchor = sourceBookingIds[0];
      const raw = kind === 'interruption' ? await bookingsApi.getInterruptionDraft(anchor) : await bookingsApi.getRepairFailureDraft(anchor);
      setDraft(parseRepairFailureDraft(raw, anchor, sourceBookingIds, kind));
    } catch (err) {
      setDraft(null);
      setLoadError(extractApiErrorMessage(err, 'Chưa tải được dữ liệu đặt lại. Vui lòng thử lại.'));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourcesKey, kind]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const canConfirm = !busy && schedule?.mode === 'scheduled';
  const confirm = async () => {
    if (!draft || schedule?.mode !== 'scheduled' || busy) return;
    setBusy(true);
    setError('');
    try {
      const dto = buildRebookDto(draft, schedule, idempotencyKey.current);
      const raw = kind === 'interruption'
        ? await bookingsApi.confirmInterruptionRebook(sourceBookingIds[0], dto)
        : await bookingsApi.confirmRepairFailureRebook(sourceBookingIds[0], dto);
      const result = parseRebookResult(raw, draft);
      if (result.kind === 'visit') navigation.replace('CustomerVisit', { visitGroupId: result.id });
      else navigation.replace('CustomerMatching', { bookingId: result.id });
    } catch (err) {
      setError(extractApiErrorMessage(err, REBOOK_UNCLEAR));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <BackButton />
        <Text accessibilityRole="header" style={styles.headerTitle}>{kind === 'interruption' ? 'Đặt lịch mới' : 'Đặt lại máy không sửa được'}</Text>
      </View>
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : !draft ? (
        <View style={styles.center}>
          <Text style={styles.error} accessibilityRole="alert">{loadError}</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => void load()} accessibilityRole="button">
            <Text style={styles.primaryText}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.body}>
            <Text style={styles.hint}>
              Dịch vụ và mô tả được giữ nguyên. Bạn chọn lịch hẹn mới; giá được tính lại theo bảng giá hiện hành. Ảnh gốc không được gửi lại.{kind === 'interruption' ? ' Kỹ thuật viên của lần trước sẽ không được ghép cho lịch mới.' : ''}
            </Text>
            {draft.items.map((item, index) => (
              <View key={item.sourceBookingId} style={styles.card} testID={`rebook-item-${index + 1}`}>
                <Text style={styles.cardTitle}>{draft.items.length > 1 ? `Máy ${index + 1}: ` : ''}{item.deviceLabel || 'Thiết bị cần sửa lại'}</Text>
                {!!item.description && <Text style={styles.hint} numberOfLines={4}>{item.description}</Text>}
              </View>
            ))}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Địa chỉ</Text>
              <Text style={styles.hint}>{draft.address.text || 'Địa chỉ của lượt sửa trước'}</Text>
            </View>
            <Text style={styles.section}>Chọn lịch mới</Text>
            <BookingSessionPicker value={schedule} onChange={setSchedule} allowUrgent={false} />
            {!!error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
          </ScrollView>
          <View style={styles.footer}>
            {schedule && <Text style={styles.hint}>Lịch mới: <Text style={styles.strong}>{scheduleSummary(schedule)}</Text></Text>}
            <TouchableOpacity
              style={[styles.primaryBtn, !canConfirm && styles.disabled]}
              disabled={!canConfirm}
              onPress={() => void confirm()}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canConfirm }}
              testID="rebook-confirm"
            >
              <Text style={styles.primaryText}>{busy ? 'Đang gửi yêu cầu…' : draft.items.length > 1 ? `Đặt lại ${draft.items.length} máy` : 'Đặt lại'}</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

const getStyles = (colors: ReturnType<typeof useAppTheme>['colors']) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, gap: 4 },
  headerTitle: { flex: 1, fontSize: 18, lineHeight: 24, fontWeight: '700', color: colors.text },
  body: { padding: 16, gap: 12, paddingBottom: 24 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 16, gap: 8 },
  cardTitle: { fontSize: 16, lineHeight: 24, fontWeight: '600', color: colors.text },
  section: { fontSize: 16, lineHeight: 24, fontWeight: '700', color: colors.text },
  hint: { fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  strong: { color: colors.text, fontWeight: '700' },
  error: { fontSize: 14, lineHeight: 20, color: colors.tone.danger.text },
  footer: { padding: 16, gap: 8, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  primaryBtn: { minHeight: 48, borderRadius: 14, backgroundColor: colors.primaryStrong, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  primaryText: { color: colors.surface, fontSize: 14, fontWeight: '600' },
  disabled: { opacity: 0.5 },
});
