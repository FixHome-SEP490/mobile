// src/screens/technician/TechnicianInvitationsScreen.tsx
//
// Technician PENDING invitation inbox — P2. Main tab ("Lời mời").
// Shows only live PENDING invitations from GET /invitations/my.
// Privacy: only allowed preview fields (province/district/service/quantity/urgency/time) are rendered.
// Accept/Decline: single in-flight lock per invitation to prevent duplicate POST on tap or retry.
// On ACCEPT: offer the existing Technician area only after a real order id is returned.
// Ambiguous responses remain locked while GET reconciliation cannot resolve them.
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
  StatusBar,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertTriangle, CheckCircle2, Clock, MailOpen, MapPin, RefreshCw } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { UserRole, type RootStackParamList } from '../../types';
import { useAuthStore } from '../../store/auth.store';
import { useBadgeStore } from '../../store/badge.store';
import { createInvitationInbox, initialInboxState, isActionable } from './invitation-inbox';
import { invitationClosedLabel, invitationCountdown, sortInvitationsForDisplay } from './invitation-view';
import { urgencyView, type StatusView } from './technician-status';
import { bookingsApi, type InvitationItem } from '../../api/bookings.api';
import { ordersApi } from '../../api/orders.api';
import { useAppTheme } from '../../constants/theme';
import { useTechnicianAvailability } from '../../hooks/useTechnicianAvailability';
import { isSameVnDay, vnDateTimeString, vnTimeString } from '../../utils/vn-time';
import CustomerSkeleton from '../../components/customer/CustomerSkeleton';
import StatusBadge from '../../components/StatusBadge';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

// Floating GlassTabBar: 64pt pill + breathing room, plus the bottom inset (min 16).
const TAB_BAR_CLEARANCE = 64 + 16;
const TICK_MS = 30000;

const VN_DATETIME = { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' } as const;
const VN_TIME = { hour: '2-digit', minute: '2-digit' } as const;

function formatWindow(start: string | null | undefined, end: string | null | undefined): string {
  if (!start && !end) return '';
  if (!end) return vnDateTimeString(start!, VN_DATETIME);
  if (!start) return vnDateTimeString(end, VN_DATETIME);
  return isSameVnDay(start, end)
    ? `${vnDateTimeString(start, VN_DATETIME)} – ${vnTimeString(end, VN_TIME)}`
    : `${vnDateTimeString(start, VN_DATETIME)} – ${vnDateTimeString(end, VN_DATETIME)}`;
}

export default function TechnicianInvitationsScreen() {
  const { colors, isDark } = useAppTheme();
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavProp>();
  const availability = useTechnicianAvailability();
  const setPendingInvitations = useBadgeStore((s) => s.setPendingInvitations);
  const [state, setState] = useState(initialInboxState);
  const controllerRef = useRef<ReturnType<typeof createInvitationInbox> | null>(null);
  if (controllerRef.current === null) {
    controllerRef.current = createInvitationInbox(bookingsApi, ordersApi, setState, (notice, isCurrent) => {
      Alert.alert(notice.title, notice.message, notice.orderId ? [
        {
          text: 'Xem đơn vừa nhận',
          onPress: () => {
            if (isCurrent()) {
              navigation.navigate('TechnicianOrderDetail', {
                serviceOrderId: notice.orderId!,
              });
            }
          },
        },
        { text: 'Để sau', style: 'cancel' },
      ] : undefined);
    }, {
      getUserId: () => {
        const session = useAuthStore.getState();
        return session.isAuthenticated && session.user?.role === UserRole.TECHNICIAN
          ? session.user.id : null;
      },
      subscribe: (listener) => useAuthStore.subscribe(listener),
    });
  }
  const controller = controllerRef.current;
  const { invitations, loading, refreshing, error, actionInFlight, acceptedOrderId, recoveryPending } = state;
  useFocusEffect(useCallback(() => {
    void controller.focus();
    return () => controller.blur();
  }, [controller]));

  // Re-evaluate countdowns/expiry while focused. Deadlines come from the server (`expiresAt`).
  const [now, setNow] = useState(() => Date.now());
  useFocusEffect(useCallback(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []));

  // `now` is a dependency on purpose: re-sort/re-count when a deadline passes.
  const sorted = useMemo(
    () => (now > 0 ? sortInvitationsForDisplay(invitations) : invitations),
    [invitations, now],
  );
  const liveCount = useMemo(
    () => (now > 0 ? invitations.filter(isActionable).length : 0),
    [invitations, now],
  );
  // Keep the tab badge in step with what this screen shows (only once a real load finished).
  useEffect(() => {
    if (!loading && !error) setPendingInvitations(liveCount);
  }, [loading, error, liveCount, setPendingInvitations]);

  const onRefresh = () => { void controller.load(); };
  const respond = (inv: InvitationItem, action: 'ACCEPT' | 'DECLINE') => {
    Haptics.impactAsync(
      action === 'ACCEPT' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Heavy
    );
    void controller.respond(inv.id, action);
  };
  const handleDecline = (inv: InvitationItem) => {
    Alert.alert('Từ chối lời mời?', 'Bạn sẽ không nhận đơn này.', [
      { text: 'Giữ lại lời mời', style: 'cancel' },
      { text: 'Từ chối', style: 'destructive', onPress: () => respond(inv, 'DECLINE') },
    ]);
  };

  const renderItem = ({ item: inv }: { item: InvitationItem }) => {
    const actionable = isActionable(inv);
    const inFlight = actionInFlight[inv.id];
    const b = inv.booking;
    const serviceName = b?.serviceName ?? 'Dịch vụ sửa chữa';
    const countdown = actionable ? invitationCountdown(inv.expiresAt, now) : null;
    const closedView: StatusView = { label: invitationClosedLabel(inv.status), tone: 'neutral', icon: 'XCircle' };
    const countdownView: StatusView | null = countdown
      ? { label: countdown.label, tone: countdown.urgent ? 'danger' : 'warning', icon: 'Clock' }
      : null;
    const location = [b?.district, b?.province].filter(Boolean).join(', ');
    const timeWindow = formatWindow(b?.preferredStartAt, b?.preferredEndAt);

    return (
      // Privacy: only allowlisted preview fields are rendered.
      <View style={styles.card}>
        <View style={styles.badgeRow}>
          {b?.urgency ? <StatusBadge view={urgencyView(b.urgency)} /> : <View />}
          {!actionable ? <StatusBadge view={closedView} /> : countdownView ? <StatusBadge view={countdownView} /> : null}
        </View>

        <Text style={styles.serviceName}>
          {serviceName}
          {b?.quantity != null ? ` · SL ${b.quantity}` : ''}
        </Text>

        {!!location && (
          <View style={styles.metaRow}>
            <MapPin size={16} color={colors.textSecondary} strokeWidth={1.75} style={styles.rowIcon} />
            <Text style={styles.metaText}>{location}</Text>
          </View>
        )}
        {!!timeWindow && (
          <View style={styles.metaRow}>
            <Clock size={16} color={colors.textSecondary} strokeWidth={1.75} style={styles.rowIcon} />
            <Text style={styles.metaText}>{timeWindow}</Text>
          </View>
        )}

        {!!inFlight && (
          <Text style={styles.lockText}>
            Đã gửi phản hồi. Nếu chờ lâu, kéo xuống để kiểm tra lại; lời mời tạm khóa để tránh gửi trùng.
          </Text>
        )}

        {/* Guarded single in-flight per invitation */}
        {actionable && (
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.btnDecline, inFlight ? styles.btnDisabled : null]}
              disabled={!!inFlight}
              onPress={() => handleDecline(inv)}
              accessibilityRole="button"
              accessibilityLabel={`Từ chối lời mời ${serviceName}`}
            >
              {inFlight === 'DECLINE' ? (
                <ActivityIndicator size="small" color={colors.error} />
              ) : (
                <Text style={styles.btnDeclineText}>Từ chối</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btnAccept, inFlight ? styles.btnDisabled : null]}
              disabled={!!inFlight}
              onPress={() => respond(inv, 'ACCEPT')}
              accessibilityRole="button"
              accessibilityLabel={`Nhận việc ${serviceName}`}
            >
              {inFlight === 'ACCEPT' ? (
                <ActivityIndicator size="small" color={colors.surface} />
              ) : (
                <Text style={styles.btnAcceptText}>Nhận việc</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.surface} />

      <View style={styles.header}>
        <Text style={styles.headerTitle} accessibilityRole="header">Lời mời nhận việc</Text>
        {!loading && !error && (
          <Text style={styles.headerSubtitle}>
            {liveCount > 0 ? `${liveCount} lời mời chờ xác nhận` : 'Không có lời mời chờ xác nhận'}
          </Text>
        )}
      </View>

      {availability.isAvailable === false && (
        <View style={[styles.banner, { backgroundColor: colors.tone.warning.bg }]}>
          <AlertTriangle size={18} color={colors.tone.warning.fg} strokeWidth={1.75} />
          <Text style={[styles.bannerText, { color: colors.tone.warning.text }]}>
            Bạn đang tạm dừng nhận đơn mới.
          </Text>
          <TouchableOpacity
            onPress={availability.toggle}
            disabled={availability.toggling}
            style={styles.bannerAction}
            accessibilityRole="button"
            accessibilityLabel="Bật lại nhận đơn mới"
          >
            {availability.toggling ? (
              <ActivityIndicator size="small" color={colors.tone.warning.text} />
            ) : (
              <Text style={[styles.bannerActionText, { color: colors.tone.warning.text }]}>Bật lại</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {acceptedOrderId ? (
        <View style={[styles.acceptedCard, { backgroundColor: colors.tone.success.bg }]}>
          <View style={styles.acceptedTitleRow}>
            <CheckCircle2 size={18} color={colors.tone.success.fg} strokeWidth={1.75} />
            <Text style={[styles.acceptedTitle, { color: colors.tone.success.text }]}>Đã xác minh đơn vừa nhận</Text>
          </View>
          <Text style={[styles.acceptedText, { color: colors.tone.success.text }]}>
            Đây là đơn đang được giao cho tài khoản kỹ thuật viên hiện tại.
          </Text>
          <TouchableOpacity
            accessibilityRole="button"
            style={styles.acceptedButton}
            onPress={() =>
              navigation.navigate('TechnicianOrderDetail', {
                serviceOrderId: acceptedOrderId,
              })
            }
          >
            <Text style={styles.acceptedButtonText}>Xem đơn vừa nhận</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {recoveryPending ? (
        <View style={[styles.banner, { backgroundColor: colors.tone.warning.bg }]}>
          <RefreshCw size={18} color={colors.tone.warning.fg} strokeWidth={1.75} />
          <Text style={[styles.bannerText, { color: colors.tone.warning.text }]}>
            Có phản hồi nhận việc chưa xác định. Không gửi lại; ứng dụng chỉ đối chiếu bằng danh sách Công việc.
          </Text>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.skeletonWrap}>
          <CustomerSkeleton variant="booking" />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <AlertTriangle size={48} color={colors.error} strokeWidth={1.5} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={onRefresh} accessibilityRole="button">
            <Text style={styles.retryBtnText}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          extraData={now}
          contentContainerStyle={[
            sorted.length === 0 ? styles.emptyFlex : styles.listContent,
            { paddingBottom: TAB_BAR_CLEARANCE + Math.max(insets.bottom, 16) },
          ]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <MailOpen size={56} color={colors.muted} strokeWidth={1.5} />
              <Text style={styles.emptyTitle}>Chưa có lời mời nào</Text>
              <Text style={styles.emptyDesc}>
                Khi khách hàng gửi lời mời, bạn sẽ thấy ở đây. Kéo xuống để làm mới.
              </Text>
              <TouchableOpacity style={styles.refreshBtn} onPress={onRefresh} accessibilityRole="button">
                <Text style={styles.refreshBtnText}>Làm mới</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const getStyles = (colors: ReturnType<typeof useAppTheme>['colors']) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  headerTitle: { fontSize: 24, lineHeight: 32, fontWeight: '700', color: colors.text },
  headerSubtitle: { fontSize: 14, lineHeight: 20, color: colors.textSecondary, marginTop: 2 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    borderRadius: 14,
  },
  bannerText: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: '500' },
  bannerAction: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  bannerActionText: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  acceptedCard: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 14,
    borderRadius: 14,
    gap: 8,
  },
  acceptedTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  acceptedTitle: { fontSize: 16, lineHeight: 24, fontWeight: '700' },
  acceptedText: { fontSize: 14, lineHeight: 20 },
  acceptedButton: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
    backgroundColor: colors.success,
    paddingHorizontal: 16,
    borderRadius: 14,
  },
  acceptedButtonText: { color: colors.surface, fontSize: 14, lineHeight: 20, fontWeight: '700' },
  skeletonWrap: { flex: 1, padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 12 },
  errorText: { fontSize: 14, lineHeight: 20, color: colors.error, textAlign: 'center' },
  retryBtn: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: colors.primaryStrong,
    borderRadius: 14,
  },
  retryBtnText: { color: colors.surface, fontWeight: '700', fontSize: 14, lineHeight: 20 },
  emptyFlex: { flexGrow: 1 },
  emptyTitle: { fontSize: 18, lineHeight: 26, fontWeight: '700', color: colors.text },
  emptyDesc: { fontSize: 14, lineHeight: 20, color: colors.textSecondary, textAlign: 'center' },
  refreshBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16 },
  refreshBtnText: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.primaryStrong },
  listContent: { padding: 16, gap: 12 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  badgeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  serviceName: { fontSize: 16, lineHeight: 24, fontWeight: '700', color: colors.text },
  metaRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  rowIcon: { marginTop: 2 },
  metaText: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  lockText: { fontSize: 12, lineHeight: 16, color: colors.textSecondary },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  btnDecline: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDeclineText: { color: colors.error, fontWeight: '700', fontSize: 14, lineHeight: 20 },
  btnAccept: {
    flex: 2,
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: colors.primaryStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnAcceptText: { color: colors.surface, fontWeight: '700', fontSize: 16, lineHeight: 24 },
  btnDisabled: { opacity: 0.5 },
});
