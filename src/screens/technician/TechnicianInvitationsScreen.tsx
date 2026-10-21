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
  Switch,
  StatusBar,
  BackHandler,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertTriangle, ArrowUpRight, CheckCircle2, Clock, FileText, Image as ImageIcon, Info, MailOpen, MapPin, RefreshCw, Wrench } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { UserRole, type RootStackParamList } from '../../types';
import { useAuthStore } from '../../store/auth.store';
import { useLiveRefresh } from '../../hooks/useLiveRefresh';
import { useBadgeStore } from '../../store/badge.store';
import { createInvitationInbox, initialInboxState, isActionable } from './invitation-inbox';
import { invitationClosedLabel, invitationCountdown, invitationDistanceText, sortInvitationsForDisplay } from './invitation-view';
import { urgencyView, type StatusView } from './technician-status';
import { bookingsApi, type InvitationItem } from '../../api/bookings.api';
import { ordersApi } from '../../api/orders.api';
import { useAppTheme } from '../../constants/theme';
import { useReduceMotion } from '../../hooks/useReduceMotion';
import { useTechnicianAvailability } from '../../hooks/useTechnicianAvailability';
import { sessionLabel } from '../../utils/booking-session';
import { isSameVnDay, vnDateTimeString, vnTimeString } from '../../utils/vn-time';
import CustomerSkeleton from '../../components/customer/CustomerSkeleton';
import StatusBadge from '../../components/StatusBadge';
import BackButton from '../../components/BackButton';
import InvitationJobDetails from '../../components/technician/InvitationJobDetails';
import InvitationDecisionView from '../../features/order-flow/technician/InvitationDecisionView';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

// Floating GlassTabBar: 64pt pill + breathing room, plus the bottom inset (min 16).
const TAB_BAR_CLEARANCE = 64 + 16;
const TICK_MS = 30000;
const NOTICE_MS = 5000;

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
    }, setState, (notice) => {
      // A verified accept is announced by the 5 s banner below, not a modal.
      if (!notice.orderId) Alert.alert(notice.title, notice.message);
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
  const { invitations, loading, error, actionInFlight, acceptedOrderId, recoveryPending } = state;
  // Spinner only for a user pull; focus/poll reloads are silent (controller `refreshing` would shift the list).
  const [pulling, setPulling] = useState(false);
  useFocusEffect(useCallback(() => {
    void controller.focus();
    return () => controller.blur();
  }, [controller]));

  useLiveRefresh(['invitation:updated'], () => { void controller.load(); }, undefined, { pollMs: 30_000 });

  // Re-evaluate countdowns/expiry while focused. Deadlines come from the server (`expiresAt`).
  const [now, setNow] = useState(() => Date.now());
  const [reviewingInvitationId, setReviewingInvitationId] = useState<string | null>(null);
  // After the technician answers, the detail closes by itself and a notice shows for 5 s.
  const [responded, setResponded] = useState<{ id: string; action: 'ACCEPT' | 'DECLINE' } | null>(null);
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
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
  const responseGone = !!responded && !loading && !invitations.some((inv) => inv.id === responded.id);
  const noticeKey = acceptedOrderId
    ? `accept:${acceptedOrderId}`
    : responseGone && responded.action === 'DECLINE' ? `decline:${responded.id}` : null;
  useEffect(() => {
    if (!noticeKey) return;
    const timer = setTimeout(() => setDismissedKey(noticeKey), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [noticeKey]);
  const showAccepted = !!acceptedOrderId && dismissedKey !== noticeKey;
  const showDeclined = !!noticeKey && noticeKey.startsWith('decline:') && dismissedKey !== noticeKey;
  const focusedInvitation = reviewingInvitationId
    ? (sorted.find((inv) => inv.id === reviewingInvitationId) ?? null)
    : null;
  const isFocused = reviewingInvitationId !== null && !(responseGone && responded.id === reviewingInvitationId);
  const focusedMissing = isFocused && !loading && !error && focusedInvitation === null;
  useEffect(() => {
    if (!isFocused) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setReviewingInvitationId(null);
      return true;
    });
    return () => sub.remove();
  }, [isFocused]);
  // Keep the tab badge in step with what this screen shows (only once a real load finished).
  useEffect(() => {
    if (!loading && !error) setPendingInvitations(liveCount);
  }, [loading, error, liveCount, setPendingInvitations]);

  const onRefresh = () => { void controller.load(); };
  const onPull = () => {
    setPulling(true);
    void controller.load().finally(() => setPulling(false));
  };
  const respond = (inv: InvitationItem, action: 'ACCEPT' | 'DECLINE') => {
    setResponded({ id: inv.id, action });
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
    const distance = invitationDistanceText(b?.distanceBand);
    // Same wording as the web: "Buổi sáng (8:00 - 12:00), 21/10/2026" / "Tới ngay"; older bookings keep the plain window.
    const timeWindow = b && (b.bookingMode || b.slot)
      ? sessionLabel({ bookingMode: b.bookingMode, slot: b.slot, start: b.preferredStartAt })
      : formatWindow(b?.preferredStartAt, b?.preferredEndAt);
    const priority = `Ưu tiên số ${inv.priorityOrder}`;
    const reviewing = reviewingInvitationId === inv.id;

    return (
      // Privacy: only allowlisted preview fields are rendered.
      <View style={[styles.card, reviewing ? styles.detailCard : null]}>
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
            <Wrench size={40} color={colors.primaryStrong} strokeWidth={1.5} />
          </View>
        </View>

        <View style={[styles.cardContent, reviewing ? styles.detailContent : null]}>
          <View style={styles.badgeRow}>
            <StatusBadge view={statusView} />
            {countdownView && !reviewing ? <StatusBadge view={countdownView} /> : null}
          </View>
          {actionable ? <Text style={styles.priorityText}>{priority}</Text> : null}
          <Text style={[styles.serviceName, reviewing ? styles.detailServiceName : null]} accessibilityRole="header">
            {serviceName}
          </Text>

          {reviewing ? (
            <View style={styles.previewDetails}>
              <View
                style={[styles.deadlineBox, { backgroundColor: countdown?.urgent ? colors.tone.danger.bg : colors.tone.warning.bg }]}
                testID="invitation-deadline"
              >
                <Clock size={20} color={countdown?.urgent ? colors.tone.danger.fg : colors.tone.warning.fg} strokeWidth={1.75} />
                <View style={styles.deadlineText}>
                  <Text style={styles.fieldLabel}>Hạn phản hồi</Text>
                  <Text style={styles.deadlineValue}>{knownDeadline ? vnDateTimeString(inv.expiresAt!, VN_DATETIME) : 'Chưa xác định'}</Text>
                </View>
                {countdownView ? <StatusBadge view={countdownView} /> : null}
              </View>
              <View style={styles.infoTile}>
                <MapPin size={18} color={colors.primaryStrong} strokeWidth={1.75} style={styles.rowIcon} />
                <View style={styles.tileBody}>
                  <Text style={styles.fieldLabel}>Khu vực được phép xem</Text>
                  <Text style={styles.fieldValue}>{location || 'Chưa xác định'}</Text>
                  {distance ? <Text style={styles.fieldValue} testID="invitation-detail-distance">{distance}</Text> : null}
                </View>
              </View>
              <View style={styles.infoTile}>
                <Clock size={18} color={colors.primaryStrong} strokeWidth={1.75} style={styles.rowIcon} />
                <View style={styles.tileBody}>
                  <Text style={styles.fieldLabel}>Khung giờ mong muốn</Text>
                  <Text style={styles.fieldValue}>{timeWindow || 'Chưa xác định'}</Text>
                </View>
              </View>
              <View style={styles.tilePair}>
                <View style={[styles.infoTile, styles.tileHalf]}>
                  <View style={styles.tileBody}>
                    <Text style={styles.fieldLabel}>Số lượng</Text>
                    <Text style={styles.fieldValue}>{b?.quantity != null ? `SL ${b.quantity}` : 'Chưa xác định'}</Text>
                  </View>
                </View>
                <View style={[styles.infoTile, styles.tileHalf]}>
                  <View style={styles.tileBody}>
                    <Text style={styles.fieldLabel}>Mức độ khẩn</Text>
                    {b?.urgency ? <View style={styles.badgeRow}><StatusBadge view={urgencyView(b.urgency)} /></View> : <Text style={styles.fieldValue}>Chưa xác định</Text>}
                  </View>
                </View>
              </View>
              {b ? <InvitationJobDetails booking={b} /> : null}
            </View>
          ) : (
            <>
              <View style={styles.metaRow}>
                <MapPin size={16} color={colors.textSecondary} strokeWidth={1.75} style={styles.rowIcon} />
                <Text style={styles.metaText}>{[location || 'Khu vực chưa xác định', distance].filter(Boolean).join(' · ')}</Text>
              </View>
              {b?.description ? (
                <View style={styles.metaRow}>
                  <FileText size={16} color={colors.textSecondary} strokeWidth={1.75} style={styles.rowIcon} />
                  <Text style={styles.metaText} numberOfLines={2} testID="invitation-description">{b.description}</Text>
                </View>
              ) : null}
              <View style={styles.metaRow}>
                <Clock size={16} color={colors.textSecondary} strokeWidth={1.75} style={styles.rowIcon} />
                <Text style={styles.metaText}>{timeWindow || 'Khung giờ chưa xác định'}</Text>
              </View>
              {b?.quantity != null ? <Text style={styles.fieldValue}>{`Số lượng: SL ${b.quantity}`}</Text> : null}
              <View style={styles.badgeRow}>
                {b?.urgency ? <StatusBadge view={urgencyView(b.urgency)} /> : null}
                {b?.media?.length ? (
                  <View style={styles.mediaChip} testID="invitation-media-chip">
                    <ImageIcon size={14} color={colors.primaryStrong} strokeWidth={1.75} />
                    <Text style={styles.mediaChipText}>{`${b.media.length} ảnh/video của khách`}</Text>
                  </View>
                ) : null}
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
              <ArrowUpRight size={20} color={colors.surface} strokeWidth={2} />
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

      {isFocused ? (
        <View style={styles.topBar}>
          <BackButton onPress={() => setReviewingInvitationId(null)} label="Quay lại danh sách lời mời" />
          <Text style={styles.topBarTitle} accessibilityRole="header">Chi tiết lời mời</Text>
          <View style={styles.topBarSpacer} />
        </View>
      ) : (
        // Main tab: same header as the other tabs (no back, left-aligned page title).
        <View style={styles.tabHeader}>
          <Text style={styles.tabTitle} accessibilityRole="header">Lời mời</Text>
          {!loading && !error && (
            <Text style={styles.headerSubtitle}>
              {liveCount > 0 ? `${liveCount} lời mời chờ xác nhận` : 'Không có lời mời chờ xác nhận'}
            </Text>
          )}
        </View>
      )}

      <FlatList
        data={loading || error ? [] : isFocused ? (focusedInvitation ? [focusedInvitation] : []) : sorted}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        extraData={[now, reviewingInvitationId]}
        contentContainerStyle={[
          (loading || error ? true : isFocused ? !focusedInvitation : sorted.length === 0) ? styles.emptyFlex : styles.listContent,
          { paddingBottom: TAB_BAR_CLEARANCE + Math.max(insets.bottom, 16) },
        ]}
        refreshControl={<RefreshControl refreshing={pulling} onRefresh={onPull} />}
        ListHeaderComponent={
          isFocused ? (
            <View style={styles.headerStack}>
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

              {showDeclined ? (
                <View style={[styles.banner, { backgroundColor: colors.tone.info.bg }]} accessibilityLiveRegion="polite">
                  <Info size={18} color={colors.tone.info.fg} strokeWidth={1.75} />
                  <Text style={[styles.bannerText, { color: colors.tone.info.text }]}>Đã từ chối lời mời.</Text>
                </View>
              ) : null}
              {showAccepted && acceptedOrderId ? (
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
            {availability.autoAccept !== null && (
              <View style={styles.autoRow}>
                <Text style={styles.autoLabel}>Tự nhận việc</Text>
                <Switch
                  value={availability.autoAccept}
                  disabled={availability.togglingAuto}
                  onValueChange={() => { void availability.toggleAutoAccept().then((ok) => { if (ok) onRefresh(); }); }}
                  accessibilityLabel="Tự nhận việc"
                />
              </View>
            )}

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

            {showDeclined ? (
              <View style={[styles.banner, { backgroundColor: colors.tone.info.bg }]} accessibilityLiveRegion="polite">
                <Info size={18} color={colors.tone.info.fg} strokeWidth={1.75} />
                <Text style={[styles.bannerText, { color: colors.tone.info.text }]}>Đã từ chối lời mời.</Text>
              </View>
            ) : null}
            {showAccepted && acceptedOrderId ? (
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
  headerStack: { gap: 16, paddingTop: 16 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.divider },
  topBarTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  tabHeader: { minHeight: 69, justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.divider }, // 69 = Home header
  tabTitle: { fontSize: 20, lineHeight: 24, fontWeight: '700', color: colors.text },
  topBarSpacer: { width: 44, height: 44 },
  headerSubtitle: { fontSize: 12, lineHeight: 16, color: colors.textSecondary },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 14,
  },
  priorityText: { fontSize: 13, lineHeight: 18, fontWeight: '700', color: colors.primaryStrong },
  autoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  autoLabel: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.text },
  bannerText: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: '500' },
  bannerAction: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  bannerActionText: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  acceptedCard: {
    padding: 16,
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
  listContent: { paddingHorizontal: 20, gap: 16 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  serviceArt: { minHeight: 112, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  artIconPlate: { width: 72, height: 72, borderRadius: 20, backgroundColor: colors.surface, borderColor: colors.primaryTint, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  cardContent: { padding: 20, gap: 12 },
  detailContent: { paddingHorizontal: 0, paddingBottom: 0 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  serviceName: { fontSize: 20, lineHeight: 28, fontWeight: '700', color: colors.text },
  metaRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  rowIcon: { marginTop: 2 },
  metaText: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  lockText: { fontSize: 12, lineHeight: 18, color: colors.textSecondary },
  reviewBtn: { minHeight: 52, marginTop: 8, paddingHorizontal: 20, borderRadius: 16, backgroundColor: colors.primaryStrong, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  reviewBtnText: { flexShrink: 1, fontSize: 15, lineHeight: 22, fontWeight: '700', color: colors.surface },
  mediaChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, minHeight: 28, borderRadius: 999, backgroundColor: colors.primarySoft },
  mediaChipText: { fontSize: 12, lineHeight: 18, fontWeight: '600', color: colors.primaryStrong },
  detailCard: { borderWidth: 0, backgroundColor: colors.background },
  detailArt: { minHeight: 120, borderRadius: 24 },
  detailServiceName: { fontSize: 24, lineHeight: 32 },
  previewDetails: { marginTop: 8, gap: 12 },
  deadlineBox: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 16 },
  deadlineText: { flex: 1, gap: 2 },
  deadlineValue: { fontSize: 15, lineHeight: 22, fontWeight: '700', color: colors.text },
  infoTile: { flexDirection: 'row', gap: 12, padding: 16, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  tilePair: { flexDirection: 'row', gap: 12 },
  tileHalf: { flex: 1 },
  tileBody: { flex: 1, gap: 4 },
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
