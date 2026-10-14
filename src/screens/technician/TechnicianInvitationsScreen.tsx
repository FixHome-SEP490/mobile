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
  BackHandler,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertTriangle, ArrowUpRight, CheckCircle2, ChevronLeft, Clock, Info, MailOpen, MapPin, RefreshCw, Wrench, X } from 'lucide-react-native';
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
import { useReduceMotion } from '../../hooks/useReduceMotion';
import { useTechnicianAvailability } from '../../hooks/useTechnicianAvailability';
import { isSameVnDay, vnDateTimeString, vnTimeString } from '../../utils/vn-time';
import CustomerSkeleton from '../../components/customer/CustomerSkeleton';
import StatusBadge from '../../components/StatusBadge';
import InvitationDecisionView from '../../features/order-flow/technician/InvitationDecisionView';

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
  const reduceMotion = useReduceMotion();
  const setPendingInvitations = useBadgeStore((s) => s.setPendingInvitations);
  const [state, setState] = useState(initialInboxState);
  const controllerRef = useRef<ReturnType<typeof createInvitationInbox> | null>(null);
  if (controllerRef.current === null) {
    controllerRef.current = createInvitationInbox(bookingsApi, {
      getMyOrdersPage: ordersApi.getTechnicianJobsPage,
      getOrder: ordersApi.getTechnicianOrder,
    }, setState, (notice, isCurrent) => {
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
  const [reviewingInvitationId, setReviewingInvitationId] = useState<string | null>(null);
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
  // T03 focused scene (UX01A, Main M2T-20261011-011): local view-only selector.
  // When set, the viewport shows only that invitation; Back only clears this
  // selector, never POSTs, reloads or mutates controller/nav/API state.
  const focusedInvitation = reviewingInvitationId
    ? (sorted.find((inv) => inv.id === reviewingInvitationId) ?? null)
    : null;
  const isFocused = reviewingInvitationId !== null;
  const focusedMissing = isFocused && !loading && !error && focusedInvitation === null;
  useEffect(() => {
    if (reviewingInvitationId === null) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setReviewingInvitationId(null);
      return true;
    });
    return () => sub.remove();
  }, [reviewingInvitationId]);
  // Keep the tab badge in step with what this screen shows (only once a real load finished).
  useEffect(() => {
    if (!loading && !error) setPendingInvitations(liveCount);
  }, [loading, error, liveCount, setPendingInvitations]);

  const onRefresh = () => { void controller.load(); };
  const respond = (inv: InvitationItem, action: 'ACCEPT' | 'DECLINE') => {
    // Haptic nudge only; skipped when the OS Reduce Motion setting is on.
    // The mutation guard and controller flow below stay unchanged.
    if (!reduceMotion) {
      void Haptics.impactAsync(
        action === 'ACCEPT' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Heavy
      );
    }
    void controller.respond(inv.id, action);
  };

  const renderItem = ({ item: inv }: { item: InvitationItem }) => {
    const actionable = isActionable(inv);
    const inFlight = actionInFlight[inv.id];
    const b = inv.booking;
    const serviceName = b?.serviceName ?? 'Chưa xác định dịch vụ';
    const countdown = actionable ? invitationCountdown(inv.expiresAt, now) : null;
    // A missing/invalid deadline is not evidence of expiry. Display only;
    // the existing controller still decides whether a response is allowed.
    const knownStatus = ['PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED'].includes(inv.status);
    const knownDeadline = inv.expiresAt !== null && Number.isFinite(Date.parse(inv.expiresAt));
    const closedView: StatusView = {
      label: !knownStatus || (inv.status === 'PENDING' && !knownDeadline)
        ? 'Chưa xác định' : invitationClosedLabel(inv.status),
      tone: 'neutral', icon: 'XCircle',
    };
    const statusView: StatusView = actionable
      ? { label: inFlight ? 'Đang xác minh phản hồi' : 'Đang chờ quyết định', tone: 'warning', icon: 'Clock' }
      : closedView;
    const countdownView: StatusView | null = countdown
      ? { label: countdown.label, tone: countdown.urgent ? 'danger' : 'warning', icon: 'Clock' }
      : null;
    const location = [b?.district, b?.province].filter(Boolean).join(', ');
    const timeWindow = formatWindow(b?.preferredStartAt, b?.preferredEndAt);
    const reviewing = reviewingInvitationId === inv.id;

    return (
      // Privacy: only allowlisted preview fields are rendered.
      <View style={[styles.card, reviewing ? styles.detailCard : null]}>
        {reviewing && (
          <View style={styles.detailHeading}>
            <Text style={styles.detailTitle} accessibilityRole="header">Xem kỹ, rồi nhận việc</Text>
            <TouchableOpacity
              style={styles.closeReviewBtn}
              onPress={() => setReviewingInvitationId(null)}
              accessibilityRole="button"
              accessibilityLabel={`Đóng phần xem lời mời ${serviceName}`}
            >
              <X size={20} color={colors.textSecondary} strokeWidth={1.75} />
            </TouchableOpacity>
          </View>
        )}

        {/* Native fallback, not a photograph of the requested service.
            The prototype's DOM appliance art is not a native approved asset. */}
        <View
          testID="invitation-service-art"
          style={[styles.serviceArt, reviewing ? styles.detailArt : null]}
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <View style={styles.artIconPlate}>
            <Wrench size={72} color={colors.primaryStrong} strokeWidth={1.25} />
          </View>
        </View>

        <View style={[styles.cardContent, reviewing ? styles.detailContent : null]}>
          <StatusBadge view={statusView} />
          <Text style={[styles.serviceName, reviewing ? styles.detailServiceName : null]} accessibilityRole="header">
            {serviceName}
          </Text>

          {reviewing ? (
            <View style={styles.previewDetails}>
              <View style={styles.detailField}>
                <Text style={styles.fieldLabel}>Khu vực được phép xem</Text>
                <Text style={styles.fieldValue}>{location || 'Chưa xác định'}</Text>
              </View>
              <View style={styles.detailField}>
                <Text style={styles.fieldLabel}>Khung giờ mong muốn</Text>
                <Text style={styles.fieldValue}>{timeWindow || 'Chưa xác định'}</Text>
              </View>
              <View style={styles.detailField}>
                <Text style={styles.fieldLabel}>Số lượng</Text>
                <Text style={styles.fieldValue}>{b?.quantity != null ? `SL ${b.quantity}` : 'Chưa xác định'}</Text>
              </View>
              <View style={styles.detailField}>
                <Text style={styles.fieldLabel}>Mức độ khẩn</Text>
                {b?.urgency ? <StatusBadge view={urgencyView(b.urgency)} /> : <Text style={styles.fieldValue}>Chưa xác định</Text>}
              </View>
              <View style={styles.detailField}>
                <Text style={styles.fieldLabel}>Hạn phản hồi</Text>
                <Text style={styles.fieldValue}>{knownDeadline ? vnDateTimeString(inv.expiresAt!, VN_DATETIME) : 'Chưa xác định'}</Text>
                {countdownView ? <StatusBadge view={countdownView} /> : null}
              </View>
            </View>
          ) : (
            <>
              <View style={styles.metaRow}>
                <MapPin size={16} color={colors.textSecondary} strokeWidth={1.75} style={styles.rowIcon} />
                <Text style={styles.metaText}>{location || 'Khu vực chưa xác định'}</Text>
              </View>
              <View style={styles.metaRow}>
                <Clock size={16} color={colors.textSecondary} strokeWidth={1.75} style={styles.rowIcon} />
                <Text style={styles.metaText}>{timeWindow || 'Khung giờ chưa xác định'}</Text>
              </View>
              {b?.quantity != null ? <Text style={styles.fieldValue}>{`Số lượng: SL ${b.quantity}`}</Text> : null}
              <View style={styles.badgeRow}>
                {b?.urgency ? <StatusBadge view={urgencyView(b.urgency)} /> : null}
                {countdownView ? <StatusBadge view={countdownView} /> : null}
              </View>
            </>
          )}

          {!!inFlight && (
            <Text style={styles.lockText} accessibilityLiveRegion="polite">
              Đã gửi phản hồi. Nếu chờ lâu, kéo xuống để kiểm tra lại; lời mời tạm khóa để tránh gửi trùng.
            </Text>
          )}

          {/* Review trước khi Accept/Decline; mutation guard vẫn giữ nguyên. */}
          {actionable && !reviewing && (
            <TouchableOpacity
              style={[styles.reviewBtn, inFlight ? styles.btnDisabled : null]}
              disabled={!!inFlight}
              onPress={() => setReviewingInvitationId(inv.id)}
              accessibilityRole="button"
              accessibilityLabel={`Xem và quyết định lời mời ${serviceName}`}
              accessibilityHint="Mở thông tin xem trước ngay trong màn Lời mời"
              accessibilityState={{ disabled: !!inFlight, expanded: false }}
            >
              <Text style={styles.reviewBtnText}>Xem & quyết định</Text>
              <ArrowUpRight size={20} color={colors.text} strokeWidth={1.75} />
            </TouchableOpacity>
          )}

          {reviewing && (
            <InvitationDecisionView
              invitation={inv}
              actionable={actionable}
              closedLabel={closedView.label}
              countdownLabel={countdown?.label ?? null}
              countdownUrgent={countdown?.urgent ?? false}
              inFlight={inFlight ?? null}
              onAccept={() => respond(inv, 'ACCEPT')}
              onDecline={() => respond(inv, 'DECLINE')}
              onBack={() => setReviewingInvitationId(null)}
              onRefresh={onRefresh}
            />
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      <FlatList
        data={loading || error ? [] : isFocused ? (focusedInvitation ? [focusedInvitation] : []) : sorted}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        extraData={[now, reviewingInvitationId]}
        contentContainerStyle={[
          (loading || error ? true : isFocused ? !focusedInvitation : sorted.length === 0) ? styles.emptyFlex : styles.listContent,
          { paddingBottom: TAB_BAR_CLEARANCE + Math.max(insets.bottom, 16) },
        ]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={
          isFocused ? (
            <View style={styles.headerStack}>
              <View style={styles.focusedTopBar}>
                <TouchableOpacity
                  style={styles.backBtn}
                  onPress={() => setReviewingInvitationId(null)}
                  accessibilityRole="button"
                  accessibilityLabel="Quay lại danh sách lời mời"
                  accessibilityHint="Trở về danh sách lời mời mà không gửi phản hồi"
                >
                  <ChevronLeft size={20} color={colors.text} strokeWidth={1.75} />
                  <Text style={styles.backBtnText}>Quay lại</Text>
                </TouchableOpacity>
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
                    accessibilityState={{ disabled: availability.toggling, busy: availability.toggling }}
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
                    accessibilityLabel="Xem đơn vừa nhận"
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
                <View style={[styles.banner, { backgroundColor: colors.tone.warning.bg }]} accessibilityLiveRegion="polite">
                  <RefreshCw size={18} color={colors.tone.warning.fg} strokeWidth={1.75} />
                  <Text style={[styles.bannerText, { color: colors.tone.warning.text }]}>
                    Có phản hồi nhận việc chưa xác định. Không gửi lại; ứng dụng chỉ đối chiếu bằng danh sách Công việc.
                  </Text>
                </View>
              ) : null}
            </View>
          ) : (
          <View style={styles.headerStack}>
            <View style={styles.header}>
              <Text style={styles.headerTitle} accessibilityRole="header">Lời mời</Text>
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
                  accessibilityState={{ disabled: availability.toggling, busy: availability.toggling }}
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
                  accessibilityLabel="Xem đơn vừa nhận"
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
              <View style={[styles.banner, { backgroundColor: colors.tone.warning.bg }]} accessibilityLiveRegion="polite">
                <RefreshCw size={18} color={colors.tone.warning.fg} strokeWidth={1.75} />
                <Text style={[styles.bannerText, { color: colors.tone.warning.text }]}>
                  Có phản hồi nhận việc chưa xác định. Không gửi lại; ứng dụng chỉ đối chiếu bằng danh sách Công việc.
                </Text>
              </View>
            ) : null}
          </View>
          )}
        ListEmptyComponent={focusedMissing ? (
          <View style={styles.center}>
            <MailOpen size={56} color={colors.muted} strokeWidth={1.5} />
            <Text style={styles.emptyTitle}>Không còn lời mời hợp lệ</Text>
            <Text style={styles.emptyDesc}>
              Lời mời bạn đang xem đã thay đổi hoặc hết hiệu lực. Quay lại để xem danh sách mới nhất.
            </Text>
            <TouchableOpacity
              style={styles.refreshBtn}
              onPress={onRefresh}
              accessibilityRole="button"
              accessibilityLabel="Làm mới danh sách lời mời"
            >
              <Text style={styles.refreshBtnText}>Làm mới</Text>
            </TouchableOpacity>
          </View>
        ) : loading ? (
          <View style={styles.skeletonWrap}>
            <Text style={styles.loadingText}>Đang tải…</Text>
            <CustomerSkeleton variant="booking" />
          </View>
        ) : error ? (
          <View style={[styles.banner, { backgroundColor: colors.tone.danger.bg }]} accessibilityLiveRegion="polite">
            <AlertTriangle size={20} color={colors.tone.danger.fg} strokeWidth={1.75} />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity
              style={styles.retryBtn}
              onPress={onRefresh}
              accessibilityRole="button"
              accessibilityLabel="Thử tải lại danh sách lời mời"
            >
              <Text style={styles.retryBtnText}>Thử lại</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.center}>
            <MailOpen size={56} color={colors.muted} strokeWidth={1.5} />
            <Text style={styles.emptyTitle}>Chưa có lời mời nào</Text>
            <TouchableOpacity
              style={styles.refreshBtn}
              onPress={onRefresh}
              accessibilityRole="button"
              accessibilityLabel="Làm mới danh sách lời mời"
            >
              <Text style={styles.refreshBtnText}>Làm mới</Text>
            </TouchableOpacity>
          </View>
        )}
        ListFooterComponent={!loading && !error ? (
          <View style={styles.privacyNotice}>
            <Info size={18} color={colors.tone.info.fg} strokeWidth={1.75} />
            <Text style={styles.privacyText}>
              Địa chỉ đầy đủ và thông tin liên lạc chỉ hiển thị sau khi bạn nhận việc thành công.
            </Text>
          </View>
        ) : null}
      />
    </SafeAreaView>
  );
}

const getStyles = (colors: ReturnType<typeof useAppTheme>['colors']) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  headerStack: { gap: 16 },
  focusedTopBar: { flexDirection: 'row', alignItems: 'center', paddingTop: 8 },
  backBtn: { minHeight: 44, minWidth: 44, flexDirection: 'row', alignItems: 'center', gap: 4, paddingRight: 12 },
  backBtnText: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.text },
  header: {
    paddingTop: 24,
    gap: 8,
  },
  headerTitle: { fontSize: 24, lineHeight: 32, fontWeight: '700', color: colors.text },
  headerSubtitle: { fontSize: 12, lineHeight: 18, color: colors.textSecondary },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 14,
  },
  bannerText: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: '500' },
  bannerAction: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  bannerActionText: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  acceptedCard: {
    padding: 14,
    borderRadius: 14,
    gap: 8,
  },
  acceptedTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  acceptedTitle: { flex: 1, fontSize: 16, lineHeight: 24, fontWeight: '700' },
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
  skeletonWrap: { paddingVertical: 16 },
  loadingText: { fontSize: 14, lineHeight: 20, color: colors.textSecondary, paddingHorizontal: 16, paddingTop: 4 },
  center: { minHeight: 240, justifyContent: 'center', alignItems: 'center', paddingVertical: 32, gap: 12 },
  errorText: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.tone.danger.text },
  retryBtn: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  retryBtnText: { color: colors.tone.danger.text, fontWeight: '700', fontSize: 14, lineHeight: 20 },
  emptyFlex: { flexGrow: 1, paddingHorizontal: 24, gap: 24 },
  emptyTitle: { fontSize: 18, lineHeight: 26, fontWeight: '700', color: colors.text },
  emptyDesc: { fontSize: 14, lineHeight: 20, color: colors.textSecondary, textAlign: 'center' },
  refreshBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16 },
  refreshBtnText: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.primaryStrong },
  listContent: { paddingHorizontal: 24, gap: 24 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  serviceArt: { minHeight: 180, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  artIconPlate: { width: 112, height: 112, borderRadius: 24, backgroundColor: colors.surface, borderColor: colors.primaryTint, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  cardContent: { padding: 24, gap: 12 },
  detailContent: { paddingHorizontal: 0 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  serviceName: { fontSize: 20, lineHeight: 28, fontWeight: '700', color: colors.text },
  metaRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  rowIcon: { marginTop: 2 },
  metaText: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  lockText: { fontSize: 12, lineHeight: 18, color: colors.textSecondary },
  reviewBtn: { minHeight: 48, marginTop: 4, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  reviewBtnText: { flexShrink: 1, fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.text },
  detailCard: { borderWidth: 0, backgroundColor: colors.background },
  detailHeading: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 16 },
  detailTitle: { flex: 1, fontSize: 24, lineHeight: 32, fontWeight: '700', color: colors.text },
  closeReviewBtn: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  detailArt: { minHeight: 200, borderRadius: 24 },
  detailServiceName: { fontSize: 24, lineHeight: 32 },
  previewDetails: { marginTop: 8 },
  detailField: { paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 8 },
  fieldLabel: { fontSize: 12, lineHeight: 18, color: colors.textSecondary },
  fieldValue: { fontSize: 14, lineHeight: 22, color: colors.text },
  reviewSurface: { marginTop: 8, gap: 12 },
  reviewTitle: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.text },
  reviewText: { fontSize: 14, lineHeight: 22, color: colors.textSecondary },
  actionRow: {
    gap: 12,
    marginTop: 8,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  btnDecline: {
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDeclineText: { flexShrink: 1, textAlign: 'center', color: colors.text, fontWeight: '600', fontSize: 14, lineHeight: 20 },
  btnAccept: {
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: colors.primaryStrong,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnAcceptText: { flexShrink: 1, textAlign: 'center', color: colors.surface, fontWeight: '700', fontSize: 16, lineHeight: 24 },
  btnDisabled: { opacity: 0.5 },
  privacyNotice: { marginTop: 16, padding: 16, borderRadius: 20, backgroundColor: colors.tone.info.bg, flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  privacyText: { flex: 1, fontSize: 12, lineHeight: 20, color: colors.tone.info.text },
});
