import React, { useState, useCallback, useEffect } from 'react';
import { useTabBarClearance } from '../../hooks/useTabBarClearance';
import {
  View,
  Image,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  StatusBar,
  Modal,
  AccessibilityInfo,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useLiveRefresh } from '../../hooks/useLiveRefresh';
import { listsNeedRead } from '../../services/live-kinds';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../types';
import { useAppTheme } from '../../constants/theme';
import { CUSTOMER_UI_ARTWORK } from '../../constants/customer-artwork';
import { useScrollHideTabBar } from '../../hooks/useScrollHideTabBar';
import { useAuthStore } from '../../store/auth.store';
import CustomerSkeleton from '../../components/customer/CustomerSkeleton';
import CustomerActivitySectionHeader from '../../components/customer/CustomerActivitySectionHeader';
import { bookingsApi, type BookingItem } from '../../api/bookings.api';
import { ordersApi, type ServiceOrderItem, type CanonicalOrderStatus } from '../../api/orders.api';
import {
  createBookingsHistoryLoader,
  customerBookingsUserId,
  getCachedHistoryState,
  linkedReplacementState,
  resolveBookingsView,
  resumeTargetFor,
  type BookingsTab,
  type HistoryCard,
} from './customer-bookings-history';
import { orderDetailTarget } from './customer-order-detail';
import { buildBookingWindow } from '../../utils/booking-window';
import {
  canCancelBookingConservative,
  canRescheduleBookingConservative,
  cancelBookingConservative,
  rescheduleBookingConservative,
} from './customer-booking-manage';
import { vnDateString, vnTimeString } from '../../utils/vn-time';

const MANAGE_DATE_OFFSETS = [0, 1, 2, 3, 7] as const;
const MANAGE_START_TIMES = ['08:00', '09:00', '10:00', '13:00', '14:00', '15:00', '16:00'] as const;

function manageDateLabel(offset: number): string {
  if (offset === 0) return 'Hôm nay';
  if (offset === 1) return 'Ngày mai';
  return 'Sau ' + offset + ' ngày';
}

export default function CustomerBookingsScreen() {
  const { colors, spacing, fontSize, isDark } = useAppTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const styles = getStyles(colors, spacing, fontSize);
  const [manageBookingId, setManageBookingId] = useState<string | null>(null);
  const [manageMode, setManageMode] = useState<'cancel' | 'reschedule' | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [rescheduleDayOffset, setRescheduleDayOffset] = useState(1);
  const [rescheduleTime, setRescheduleTime] = useState('09:00');
  const [manageBusy, setManageBusy] = useState(false);
  const [manageError, setManageError] = useState<string | null>(null);
  const [activityTab, setActivityTab] = useState<BookingsTab>('in_progress');
  // Repairs and booking requests are two lists, one shown at a time (as on the web), so nobody scrolls past one to reach the other.
  const [kindTab, setKindTab] = useState<'repair' | 'request' | null>(null);
  const tabBarClearance = useTabBarClearance();
  const [activitySearch, setActivitySearch] = useState('');
  const [expandedRequests, setExpandedRequests] = useState<Record<string, boolean>>({});
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((enabled) => { if (mounted) setReduceMotion(enabled ?? false); })
      .catch(() => undefined);
    const subscription = (AccessibilityInfo as unknown as {
      addEventListener?: (event: string, handler: (enabled: boolean) => void) => { remove: () => void };
    }).addEventListener?.('reduceMotionChanged', (enabled) => {
      if (mounted) setReduceMotion(enabled);
    });
    return () => {
      mounted = false;
      subscription?.remove();
    };
  }, []);
  const [historyState, setHistoryState] = useState(getCachedHistoryState);
  const { bookings, total, loading, refreshing, loadingMore, loadingMoreOrders, error, ordersError } = historyState;
  const [loader] = useState(() => createBookingsHistoryLoader(
    (page, pageSize) => bookingsApi.getMyBookingsPage(page, pageSize),
    ordersApi.getMyOrders,
    setHistoryState,
    {
      getUserId: () => customerBookingsUserId(useAuthStore.getState()),
      subscribe: (listener) => useAuthStore.subscribe(listener),
    },
    { getOrdersPage: (page, pageSize) => ordersApi.getMyOrdersPage(page, pageSize) },
  ));
  useFocusEffect(useCallback(() => {
    void loader.focus();
    return () => loader.blur();
  }, [loader]));
  // Tapping the tab icon while already on this screen is the explicit
  // "reload" gesture; every other visit (switching tabs back here) reuses
  // the cached list from `loader.focus()` instead of refetching.
  useEffect(() => {
    return (navigation as any).addListener('tabPress', () => {
      if (navigation.isFocused()) void loader.refresh(true);
    });
  }, [navigation, loader]);
  // PO 18/10/2026: a technician answering, an order moving on or a new one reaching the list shows up at once.
  useLiveRefresh(['booking:updated', 'invitation:updated', 'order:updated'], (batch) => {
    if (listsNeedRead(batch)) void loader.refresh(true);
  }, undefined, { pollMs: 30_000 });
  const handleScroll = useScrollHideTabBar();

  const onRefresh = () => { void loader.refresh(); };
  const onLoadMore = () => { void loader.loadMore(); };
  const onLoadMoreOrders = () => { void loader.loadMoreOrders(); };

  const closeBookingManage = () => {
    if (manageBusy) return;
    setManageBookingId(null);
    setManageMode(null);
    setCancelReason('');
    setManageError(null);
  };

  const openBookingManage = (booking: BookingItem, mode: 'cancel' | 'reschedule') => {
    if (manageBusy) return;
    if (mode === 'cancel' && !canCancelBookingConservative(booking)) return;
    if (mode === 'reschedule' && !canRescheduleBookingConservative(booking)) return;
    setManageBookingId(booking.id);
    setManageMode(mode);
    setCancelReason('');
    setRescheduleDayOffset(1);
    setRescheduleTime('09:00');
    setManageError(null);
  };

  const bookingMutationDeps = {
    getCustomerId: () => customerBookingsUserId(useAuthStore.getState()),
    getBooking: (id: string) => bookingsApi.getBooking(id),
    cancelBooking: (id: string, reason: string) => bookingsApi.cancelBooking(id, reason),
    reschedule: (id: string, start: string, end: string) =>
      bookingsApi.reschedule(id, start, end),
  };

  const handleBookingCancel = async (booking: BookingItem) => {
    const reason = cancelReason.trim();
    if (!reason || reason.length > 2000 || manageBusy) {
      setManageError('Vui lòng nhập lý do hủy từ 1 đến 2000 ký tự.');
      return;
    }
    setManageBusy(true);
    setManageError(null);
    try {
      const result = await cancelBookingConservative(
        bookingMutationDeps,
        booking,
        reason,
      );
      if (result.kind === 'cancelled') {
        setManageBookingId(null);
        setManageMode(null);
        setCancelReason('');
        await loader.refresh();
        return;
      }
      if (result.kind === 'linked' && result.booking.serviceOrderId) {
        setManageBookingId(null);
        setManageMode(null);
        const target = orderDetailTarget(result.booking.serviceOrderId);
        if (target) {
          navigation.navigate('CustomerOrderDetail', { serviceOrderId: target });
          return;
        }
      }
      setManageError(
        result.kind === 'retryable'
          ? 'Hệ thống chưa xác nhận việc hủy theo trạng thái mới nhất. Bạn có thể thử lại bằng một thao tác mới.'
          : 'Chưa xác minh được việc hủy. Không tự gửi lại; hãy làm mới danh sách trước.',
      );
      await loader.refresh();
    } finally {
      setManageBusy(false);
    }
  };

  const handleBookingReschedule = async (booking: BookingItem) => {
    if (manageBusy) return;
    let window: ReturnType<typeof buildBookingWindow>;
    try {
      window = buildBookingWindow({
        dayOffset: rescheduleDayOffset,
        time: rescheduleTime,
      });
    } catch (error) {
      setManageError((error as Error).message || 'Khung giờ không hợp lệ.');
      return;
    }
    setManageBusy(true);
    setManageError(null);
    try {
      const result = await rescheduleBookingConservative(
        bookingMutationDeps,
        booking,
        window.preferredStartAt,
        window.preferredEndAt,
      );
      if (result.kind === 'rescheduled') {
        setManageBookingId(null);
        setManageMode(null);
        await loader.refresh();
        return;
      }
      if (result.kind === 'linked' && result.booking.serviceOrderId) {
        setManageBookingId(null);
        setManageMode(null);
        const target = orderDetailTarget(result.booking.serviceOrderId);
        if (target) {
          navigation.navigate('CustomerOrderDetail', { serviceOrderId: target });
          return;
        }
      }
      setManageError(
        result.kind === 'retryable'
          ? 'Trạng thái mới nhất vẫn giữ lịch cũ. Bạn có thể thử lại bằng một thao tác mới.'
          : 'Chưa xác minh được việc đổi lịch. Không tự gửi lại; hãy làm mới danh sách trước.',
      );
      await loader.refresh();
    } finally {
      setManageBusy(false);
    }
  };

  const getStatusBadge = (status: CanonicalOrderStatus) => {
    const s = String(status).toUpperCase();
    switch (s) {
      case 'EN_ROUTE':
        return { label: 'Đang di chuyển', bg: colors.tone.warning.bg, color: colors.tone.warning.text };
      case 'UNDER_REPAIR':
      case 'IN_PROGRESS':
        return { label: 'Đang sửa chữa', bg: colors.tone.repair.bg, color: colors.tone.repair.text };
      case 'ACCEPTED':
        return { label: 'Đã nhận đơn', bg: colors.tone.info.bg, color: colors.tone.info.text };
      case 'COMPLETED':
        return { label: 'Hoàn thành', bg: colors.tone.success.bg, color: colors.tone.success.text };
      case 'CANCELLED':
        return { label: 'Đã hủy', bg: colors.tone.neutral.bg, color: colors.tone.neutral.text };
      default:
        return { label: 'Trạng thái chưa xác định', bg: colors.tone.neutral.bg, color: colors.tone.neutral.text };
    }
  };

  const getBookingBadge = (status: BookingItem['status']) => {
    const s = String(status).toUpperCase();
    switch (s) {
      case 'SUBMITTED':
        return { label: 'Đã gửi yêu cầu', bg: colors.tone.info.bg, color: colors.tone.info.text };
      case 'MATCHING':
        return { label: 'Đang tìm kỹ thuật viên', bg: colors.tone.warning.bg, color: colors.tone.warning.text };
      case 'MATCHED':
        return { label: 'Đã ghép kỹ thuật viên', bg: colors.tone.success.bg, color: colors.tone.success.text };
      case 'CONFIRMED':
        return { label: 'Đã xác nhận', bg: colors.tone.info.bg, color: colors.tone.info.text };
      case 'CLOSED':
        return { label: 'Chưa có thợ nhận', bg: colors.divider, color: colors.textSecondary };
      case 'CANCELLED':
        return { label: 'Đã hủy', bg: colors.tone.neutral.bg, color: colors.tone.neutral.text };
      default:
        return { label: 'Trạng thái chưa xác định', bg: colors.tone.neutral.bg, color: colors.tone.neutral.text };
    }
  };

  const view = resolveBookingsView(historyState, activitySearch, activityTab);
  // The server totals of both lists, as on the web; unknown until the first load settles.
  const allTotal = loading || !!error || !!ordersError ? null : total + historyState.ordersTotal;
  const { filtered: filteredCards, showList, emptyNote, showLoadMore, showLoadMoreOrders } = view;
  const emptyTitle = activitySearch.trim()
    ? 'Không có kết quả trong phần đã tải'
    : activityTab === 'completed' ? 'Chưa có đơn hoặc yêu cầu hoàn tất'
      : activityTab === 'cancelled' ? 'Chưa có đơn hoặc yêu cầu đã hủy'
      : activityTab === 'all' ? 'Chưa có yêu cầu hoặc đơn nào' : 'Không có đơn đang diễn ra';
  const emptyDescription = activitySearch.trim()
    ? 'Hãy đổi từ khóa hoặc tải thêm trang để tìm tiếp.'
    : activityTab === 'completed' ? 'Các đơn sửa chữa đã hoàn tất sẽ xuất hiện tại đây.'
      : activityTab === 'cancelled' ? 'Các đơn và yêu cầu đã hủy sẽ xuất hiện tại đây.'
      : activityTab === 'all' ? 'Yêu cầu đặt lịch và đơn sửa chữa của bạn sẽ xuất hiện tại đây.'
        : 'Khi có yêu cầu hoặc đơn sửa chữa đang xử lý, chúng sẽ xuất hiện tại đây.';

  const renderOrderSummary = (
    order: ServiceOrderItem,
    bookingId: string | null,
    showDetailAffordance = false,
  ) => {
    const badge = getStatusBadge(order.status);
    const dateStr = order.createdAt
      ? vnDateString(order.createdAt)
      : 'Gần đây';
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.iconContainer}>
            <Ionicons name="construct-outline" size={24} color={colors.primary} />
          </View>
          <View style={styles.cardInfo}>
            <View style={[styles.badge, { backgroundColor: badge.bg }]}>
              <Text style={[styles.badgeText, { color: badge.color }]}>{badge.label}</Text>
            </View>
            <Text style={styles.title} numberOfLines={1}>
              {order.serviceName || `Đơn #${order.code}`}
            </Text>
            <Text style={styles.meta}>
              {dateStr}
            </Text>
          </View>
          {showDetailAffordance && (
            <Ionicons
              name="chevron-forward"
              size={18}
              color={colors.textSecondary}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
          )}
        </View>
      </View>
    );
  };

  const renderBookingCard = (booking: BookingItem) => {
    const badge = getBookingBadge(booking.status);
    const resumeId = resumeTargetFor(booking, !view.ordersCoverageComplete);
    const schedule = booking.preferredStartAt && Number.isFinite(Date.parse(booking.preferredStartAt))
      ? booking.preferredStartAt : null;
    const dateStr = schedule ? `${vnDateString(schedule)} · ${vnTimeString(schedule, { hour: '2-digit', minute: '2-digit', hour12: false })}`
      : booking.createdAt ? vnDateString(booking.createdAt) : 'Chưa có thời gian';
    const waiting = String(booking.status).toUpperCase() === 'MATCHING';
    return (
      <View style={styles.card}>
        <TouchableOpacity
          testID={`booking-card-detail-${booking.id}`}
          style={styles.cardHeader}
          onPress={() => navigation.navigate('CustomerBookingDetail', { bookingId: booking.id })}
          accessibilityRole="button"
          accessibilityLabel="Xem chi tiết yêu cầu đặt lịch"
          activeOpacity={0.8}
        >
          <View style={styles.iconContainer}>
            <Ionicons name="calendar-outline" size={24} color={colors.primary} />
          </View>
          <View style={styles.cardInfo}>
            <View style={[styles.badge, { backgroundColor: badge.bg }]}>
              <Text style={[styles.badgeText, { color: badge.color }]}>{badge.label}</Text>
            </View>
            <Text style={styles.title} numberOfLines={1}>
              {booking.serviceName || `Yêu cầu #${booking.id.slice(0, 8)}`}
            </Text>
            {expandedRequests[booking.id] && !!booking.addressSummary && (
              <View style={styles.metaRow}>
                <Ionicons name="location-outline" size={14} color={colors.textSecondary} />
                <Text style={styles.metaRowText} numberOfLines={1}>{booking.addressSummary}</Text>
              </View>
            )}
            <View style={styles.metaRow}>
              <Ionicons name="calendar-outline" size={14} color={colors.textSecondary} />
              <Text style={styles.metaRowText}>{dateStr}</Text>
            </View>
            {waiting && expandedRequests[booking.id] && (
              <View style={styles.waitingNote}>
                <Text style={styles.waitingNoteText}>
                  Đang chờ kỹ thuật viên phản hồi — không cần gửi lại.
                </Text>
              </View>
            )}
          </View>
          {!(canCancelBookingConservative(booking) || canRescheduleBookingConservative(booking) || waiting || booking.addressSummary) && (
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          )}
        </TouchableOpacity>
        {(canCancelBookingConservative(booking) || canRescheduleBookingConservative(booking) || waiting || booking.addressSummary) && (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Tùy chọn yêu cầu"
            accessibilityState={{ expanded: !!expandedRequests[booking.id] }}
            style={styles.requestOptions}
            onPress={() => setExpandedRequests((current) => ({ ...current, [booking.id]: !current[booking.id] }))}
          >
            <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Tùy chọn yêu cầu</Text>
            <Ionicons name={expandedRequests[booking.id] ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
        {/* K09_B_BOOKING_MANAGE */}
        {expandedRequests[booking.id] && (canCancelBookingConservative(booking) ||
          canRescheduleBookingConservative(booking)) && (
          <View style={[styles.cardActionsRow, { marginTop: 12 }]}>
            {canRescheduleBookingConservative(booking) && (
              <TouchableOpacity
                style={[styles.pillBtn, { borderColor: colors.border, flex: 1 }]}
                onPress={() => openBookingManage(booking, 'reschedule')}
                disabled={manageBusy}
                accessibilityRole="button"
              >
                <Text style={[styles.pillBtnText, { color: colors.text }]}>
                  Đổi lịch
                </Text>
              </TouchableOpacity>
            )}
            {canCancelBookingConservative(booking) && (
              <TouchableOpacity
                style={[styles.pillBtn, { borderColor: colors.tone.danger.fg, flex: 1 }]}
                onPress={() => openBookingManage(booking, 'cancel')}
                disabled={manageBusy}
                accessibilityRole="button"
              >
                <Text style={[styles.pillBtnText, { color: colors.tone.danger.text }]}>
                  Hủy yêu cầu
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <Modal
          visible={manageBookingId === booking.id && manageMode === 'cancel'}
          transparent
          animationType={reduceMotion ? 'none' : 'slide'}
          onRequestClose={closeBookingManage}
        >
          <KeyboardAvoidingView style={styles.manageModalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={[styles.manageModalSheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={styles.manageTitle}>Hủy yêu cầu đặt lịch</Text>
            <Text style={styles.meta}>
              Chỉ áp dụng khi chưa có đơn sửa chữa. Nếu kỹ thuật viên vừa nhận đơn,
              hệ thống sẽ chuyển sang đơn sửa chữa.
            </Text>
            <TextInput accessibilityLabel="Lý do hủy"
              value={cancelReason}
              onChangeText={setCancelReason}
              editable={!manageBusy}
              maxLength={2000}
              multiline
              placeholder="Lý do hủy"
              placeholderTextColor={colors.textSecondary}
              style={[
                styles.manageInput,
                { color: colors.text, borderColor: colors.border },
              ]}
            />
            {!!manageError && (
              <Text style={styles.manageError}>{manageError}</Text>
            )}
            <View style={styles.manageActions}>
              <TouchableOpacity
                style={[
                  styles.resumeBtn,
                  { backgroundColor: colors.error, flex: 1 },
                ]}
                onPress={() => {
                  if (!reduceMotion) {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                  }
                  void handleBookingCancel(booking);
                }}
                disabled={manageBusy}
                accessibilityRole="button"
              >
                <Text style={styles.resumeText}>
                  {manageBusy ? 'Đang xác minh...' : 'Xác nhận hủy'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.secondaryBtn,
                  { borderColor: colors.border, flex: 1 },
                ]}
                onPress={closeBookingManage}
                disabled={manageBusy}
                accessibilityRole="button"
              >
                <Text style={[styles.secondaryText, { color: colors.text }]}>
                  Giữ yêu cầu
                </Text>
              </TouchableOpacity>
            </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        <Modal
          visible={manageBookingId === booking.id && manageMode === 'reschedule'}
          transparent
          animationType={reduceMotion ? 'none' : 'slide'}
          onRequestClose={closeBookingManage}
        >
          <KeyboardAvoidingView style={styles.manageModalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={[styles.manageModalSheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.manageTitle}>
              Đổi lịch trước khi có đơn sửa chữa
            </Text>
            <Text style={styles.meta}>
              Chỉ áp dụng cho yêu cầu đã gửi hoặc đang tìm kỹ thuật viên, khi chưa
              có đơn sửa chữa.
            </Text>
            <Text style={styles.manageLabel}>Ngày</Text>
            <View style={styles.manageChips}>
              {MANAGE_DATE_OFFSETS.map((offset) => (
                <TouchableOpacity
                  key={offset}
                  onPress={() => setRescheduleDayOffset(offset)}
                  disabled={manageBusy}
                  style={[
                    styles.manageChip,
                    {
                      borderColor:
                        rescheduleDayOffset === offset
                          ? colors.primary
                          : colors.border,
                      backgroundColor:
                        rescheduleDayOffset === offset
                          ? colors.primarySoft
                          : colors.surface,
                    },
                  ]}
                  accessibilityRole="radio"
                  accessibilityState={{
                    checked: rescheduleDayOffset === offset,
                  }}
                >
                  <Text style={{ color: colors.text }}>
                    {manageDateLabel(offset)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.manageLabel}>Giờ bắt đầu (khung 2 giờ)</Text>
            <View style={styles.manageChips}>
              {MANAGE_START_TIMES.map((time) => (
                <TouchableOpacity
                  key={time}
                  onPress={() => setRescheduleTime(time)}
                  disabled={manageBusy}
                  style={[
                    styles.manageChip,
                    {
                      borderColor:
                        rescheduleTime === time
                          ? colors.primary
                          : colors.border,
                      backgroundColor:
                        rescheduleTime === time
                          ? colors.primarySoft
                          : colors.surface,
                    },
                  ]}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: rescheduleTime === time }}
                >
                  <Text style={{ color: colors.text }}>{time}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {!!manageError && (
              <Text style={styles.manageError}>{manageError}</Text>
            )}
            <View style={styles.manageActions}>
              <TouchableOpacity
                style={[
                  styles.resumeBtn,
                  { backgroundColor: colors.primary, flex: 1 },
                ]}
                onPress={() => {
                  if (!reduceMotion) {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  }
                  void handleBookingReschedule(booking);
                }}
                disabled={manageBusy}
                accessibilityRole="button"
              >
                <Text style={styles.resumeText}>
                  {manageBusy ? 'Đang xác minh...' : 'Lưu lịch mới'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.secondaryBtn,
                  { borderColor: colors.border, flex: 1 },
                ]}
                onPress={closeBookingManage}
                disabled={manageBusy}
                accessibilityRole="button"
              >
                <Text style={[styles.secondaryText, { color: colors.text }]}>
                  Hủy thay đổi
                </Text>
              </TouchableOpacity>
            </View>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {!!resumeId && (
          <TouchableOpacity
            style={[styles.resumeBtn, { backgroundColor: colors.primary }]}
            onPress={() => navigation.navigate('CustomerMatching', { bookingId: resumeId })}
            accessibilityRole="button"
            accessibilityLabel="Tiếp tục chọn kỹ thuật viên"
          >
            <Text style={styles.resumeText}>Tiếp tục chọn kỹ thuật viên</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderLinkedReplacementCard = (
    booking: BookingItem,
    order: ServiceOrderItem,
    replacement: 'waiting' | 'support',
  ) => {
    const badge = getBookingBadge(booking.status);
    const detailId = orderDetailTarget(order.id);
    const schedule = booking.preferredStartAt && Number.isFinite(Date.parse(booking.preferredStartAt))
      ? booking.preferredStartAt : null;
    const dateStr = schedule ? `${vnDateString(schedule)} · ${vnTimeString(schedule, { hour: '2-digit', minute: '2-digit', hour12: false })}`
      : booking.createdAt ? vnDateString(booking.createdAt) : 'Chưa có thời gian';
    const message = replacement === 'waiting'
      ? 'Đang tìm kỹ thuật viên thay thế; đang chờ kỹ thuật viên phản hồi; làm mới để cập nhật'
      : 'Lượt mời kỹ thuật viên thay thế đã kết thúc. Xem khả năng chọn lại; hệ thống sẽ kiểm tra trước khi gửi.';
    return (
      <View style={styles.card}>
        <TouchableOpacity
          testID={`booking-card-detail-${booking.id}`}
          style={styles.cardHeader}
          onPress={() => navigation.navigate('CustomerBookingDetail', { bookingId: booking.id })}
          accessibilityRole="button"
          accessibilityLabel="Xem chi tiết yêu cầu đặt lịch"
          activeOpacity={0.8}
        >
          <View style={styles.iconContainer}>
            <Ionicons name="calendar-outline" size={24} color={colors.primary} />
          </View>
          <View style={styles.cardInfo}>
            <View style={[styles.badge, { backgroundColor: badge.bg }]}>
              <Text style={[styles.badgeText, { color: badge.color }]}>{badge.label}</Text>
            </View>
            <Text style={styles.title} numberOfLines={1}>
              {booking.serviceName || order.serviceName || `Yêu cầu #${booking.id.slice(0, 8)}`}
            </Text>
            {expandedRequests[booking.id] && !!booking.addressSummary && (
              <View style={styles.metaRow}>
                <Ionicons name="location-outline" size={14} color={colors.textSecondary} />
                <Text style={styles.metaRowText} numberOfLines={1}>{booking.addressSummary}</Text>
              </View>
            )}
            <View style={styles.metaRow}>
              <Ionicons name="calendar-outline" size={14} color={colors.textSecondary} />
              <Text style={styles.metaRowText}>{dateStr}</Text>
            </View>
            {expandedRequests[booking.id] && (
              <View style={styles.waitingNote}>
                <Text style={styles.waitingNoteText}>{message}</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Thông tin lời mời"
          accessibilityState={{ expanded: !!expandedRequests[booking.id] }} style={styles.requestOptions}
          onPress={() => setExpandedRequests((current) => ({ ...current, [booking.id]: !current[booking.id] }))}>
          <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Thông tin lời mời</Text>
          <Ionicons name={expandedRequests[booking.id] ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.resumeBtn, { backgroundColor: colors.primary }]}
          onPress={() => navigation.navigate('CustomerMatching', { bookingId: booking.id })}
          accessibilityRole="button"
          accessibilityLabel={replacement === 'waiting' ? 'Xem tình trạng tìm kỹ thuật viên' : 'Xem khả năng chọn lại'}
        >
          <Text style={styles.resumeText}>{replacement === 'waiting' ? 'Xem tình trạng tìm kỹ thuật viên' : 'Xem khả năng chọn lại'}</Text>
        </TouchableOpacity>
        {!!detailId && (
          <TouchableOpacity
            style={[styles.pillBtn, { borderColor: colors.border, marginTop: 8 }]}
            onPress={() => navigation.navigate('CustomerOrderDetail', { serviceOrderId: detailId })}
            accessibilityRole="button"
            accessibilityLabel="Xem chi tiết đơn lịch sử"
          >
            <Text style={[styles.pillBtnText, { color: colors.text }]}>Xem chi tiết đơn lịch sử</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderActiveCard = (card: HistoryCard) => {
    const key = card.kind === 'booking' ? `booking-${card.booking.id}` : `order-${card.order.id}`;
    if (card.kind === 'booking' && !card.order) {
      return <View key={key}>{renderBookingCard(card.booking)}</View>;
    }
    if (card.kind === 'booking' && card.order) {
      const replacement = linkedReplacementState(card.booking, card.order);
      if (replacement) {
        return <View key={key}>{renderLinkedReplacementCard(card.booking, card.order, replacement)}</View>;
      }
    }
    const order = card.kind === 'booking' ? card.order! : card.order;
    const bookingId = card.kind === 'booking' ? card.booking.id : order.bookingId ?? null;
    const detailId = orderDetailTarget(order.id);
    if (!detailId) return <View key={key}>{renderOrderSummary(order, bookingId)}</View>;
    return (
      <View key={key} style={{ gap: 8 }}>
        <TouchableOpacity
          onPress={() => navigation.navigate('CustomerOrderDetail', { serviceOrderId: detailId })}
          accessibilityRole="button"
          accessibilityLabel="Xem chi tiết đơn sửa chữa"
          activeOpacity={0.8}
        >
          {renderOrderSummary(order, bookingId, true)}
        </TouchableOpacity>
      </View>
    );
  };

  const actionRequiredCards = filteredCards.filter((card) =>
    card.kind === 'booking'
    && !card.order
    && resumeTargetFor(card.booking, !view.ordersCoverageComplete) !== null,
  );
  const ongoingCards = filteredCards.filter((card) => !actionRequiredCards.includes(card));
  const repairCards = ongoingCards.filter((card) => card.kind === 'order' || card.order !== null);
  const requestCards = ongoingCards.filter((card) => !repairCards.includes(card));
  const requestCount = requestCards.length + actionRequiredCards.length;
  // What needs the customer's action opens first; otherwise the repairs, then the requests.
  const activeKind = kindTab ?? (actionRequiredCards.length > 0 ? 'request' : repairCards.length > 0 || requestCount === 0 ? 'repair' : 'request');
  const kindEmptyText = activeKind === 'repair'
    ? (activityTab === 'completed' ? 'Chưa có đơn sửa chữa hoàn tất' : activityTab === 'cancelled' ? 'Chưa có đơn sửa chữa đã hủy' : 'Chưa có đơn sửa chữa nào')
    : (activityTab === 'completed' ? 'Chưa có yêu cầu đặt lịch hoàn tất' : activityTab === 'cancelled' ? 'Chưa có yêu cầu đặt lịch đã hủy' : 'Chưa có yêu cầu đặt lịch nào');
  const kindTabs = [
    { id: 'repair', label: 'Đơn sửa chữa', count: repairCards.length, urgent: 0 },
    { id: 'request', label: 'Yêu cầu đặt lịch', count: requestCount, urgent: actionRequiredCards.length },
  ] as const;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text accessibilityRole="header" style={styles.headerTitle}>Hoạt động</Text>
        </View>

      </View>

      <View style={styles.activityControls}>
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={18} color={colors.textSecondary} />
          <TextInput
            value={activitySearch}
            onChangeText={setActivitySearch}
            placeholder="Tìm yêu cầu hoặc đơn sửa chữa"
            placeholderTextColor={colors.textSecondary}
            accessibilityLabel="Tìm yêu cầu hoặc đơn sửa chữa"
            returnKeyType="search"
            style={styles.searchInput}
          />
        </View>
        <View style={styles.kindTabs} accessibilityRole="tablist" testID="activity-kind-tabs">
          {kindTabs.map((tab) => {
            const selected = activeKind === tab.id;
            return (
              <TouchableOpacity
                key={tab.id}
                testID={`activity-kind-${tab.id}`}
                style={[styles.kindTab, selected && styles.kindTabActive]}
                onPress={() => setKindTab(tab.id)}
                accessibilityRole="tab"
                accessibilityLabel={`${tab.label}, ${tab.count}${tab.urgent > 0 ? `, ${tab.urgent} cần bạn xử lý` : ''}`}
                accessibilityState={{ selected }}
              >
                <Text style={selected ? styles.kindTabTextActive : styles.kindTabText} numberOfLines={1}>{tab.label}</Text>
                <View style={[styles.kindCount, { backgroundColor: tab.urgent > 0 ? colors.tone.warning.bg : selected ? colors.primarySoft : colors.divider }]}>
                  <Text style={[styles.kindCountText, { color: tab.urgent > 0 ? colors.tone.warning.text : colors.textSecondary }]}>{tab.count}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow} accessibilityRole="tablist">
          {([
            { id: 'all', label: allTotal === null ? 'Tất cả' : `Tất cả (${allTotal})`, testID: 'activity-filter-all' },
            { id: 'in_progress', label: 'Đang xử lý', testID: 'activity-filter-open' },
            { id: 'completed', label: 'Hoàn tất', testID: 'activity-filter-history' },
            { id: 'cancelled', label: 'Đã hủy', testID: 'activity-filter-cancelled' },
          ] as const).map((tab) => {
            const selected = activityTab === tab.id;
            return (
              <TouchableOpacity
                key={tab.id}
                testID={tab.testID}
                style={[styles.filterChip, selected && styles.filterChipActive]}
                onPress={() => setActivityTab(tab.id)}
                accessibilityRole="tab"
                accessibilityLabel={tab.label}
                accessibilityState={{ selected }}
              >
                <Text style={selected ? styles.filterChipTextActive : styles.filterChipText} numberOfLines={1}>{tab.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Content List */}
      {loading ? (
        <View style={styles.loadingState}>
          <CustomerSkeleton variant="booking" rows={3} />
          <Text style={styles.loadingText} accessibilityLiveRegion="polite">Đang tải hoạt động...</Text>
        </View>
      ) : showList ? (
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: tabBarClearance }]}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {!!error && (
            <View style={styles.errorBanner} accessibilityRole="alert">
              <Text style={styles.emptyDesc}>{error}</Text>
              <TouchableOpacity onPress={onRefresh} disabled={refreshing} accessibilityRole="button">
                <Text style={styles.retryText}>Thử lại</Text>
              </TouchableOpacity>
            </View>
          )}
          {!!ordersError && (
            <View style={styles.errorBanner} accessibilityRole="alert">
              <Text style={styles.emptyDesc}>{ordersError}</Text>
              <TouchableOpacity onPress={onRefresh} disabled={refreshing} accessibilityRole="button">
                <Text style={styles.retryText}>Thử lại</Text>
              </TouchableOpacity>
            </View>
          )}
          {filteredCards.length === 0 && emptyNote === 'more-pages' && (
            <View style={styles.emptyContainer}>
              <Ionicons name="layers-outline" size={56} color={colors.muted} />
              <Text style={styles.emptyTitle}>{emptyTitle}</Text>
              <Text style={styles.emptyDesc}>Còn dữ liệu ở các trang tiếp theo. Tải thêm để kiểm tra.</Text>
            </View>
          )}
          {filteredCards.length === 0 && emptyNote === 'no-match' && (
            <View style={styles.emptyContainer}>
              <Image source={CUSTOMER_UI_ARTWORK.emptySearch} style={{ width: 144, height: 112 }} resizeMode="contain" accessible={false} testID="activity-empty-art" />
              <Text style={styles.emptyTitle}>{emptyTitle}</Text>
              <Text style={styles.emptyDesc}>{emptyDescription}</Text>
              {!activitySearch.trim() && activityTab === 'in_progress' && (
                <TouchableOpacity
                  style={[styles.bookNowBtn, { backgroundColor: colors.primary }]}
                  onPress={() => navigation.navigate('CustomerServices')}
                  accessibilityRole="button"
                >
                  <Ionicons name="add-circle-outline" size={18} color={colors.surface} />
                  <Text style={styles.bookNowText}>Đặt dịch vụ mới</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
          {activeKind === 'repair' && repairCards.map(renderActiveCard)}
          {activeKind === 'request' && (
            <>
              {actionRequiredCards.length > 0 && (
                <>
                  <CustomerActivitySectionHeader
                    title="Cần bạn xử lý"
                    count={actionRequiredCards.length}
                    icon="alert"
                    testID="activity-action-required-section"
                  />
                  {actionRequiredCards.map(renderActiveCard)}
                </>
              )}
              {requestCards.length > 0 && (
                <>
                  {actionRequiredCards.length > 0 && (
                    <View style={styles.sectionHeaderSpaced}>
                      <CustomerActivitySectionHeader title="Yêu cầu khác" count={requestCards.length} icon="request" testID="activity-request-section" />
                    </View>
                  )}
                  {requestCards.map(renderActiveCard)}
                </>
              )}
            </>
          )}
          {filteredCards.length > 0 && (activeKind === 'repair' ? repairCards.length === 0 : requestCount === 0) && (
            <View style={styles.kindEmpty} testID="activity-kind-empty">
              <Ionicons name={activeKind === 'repair' ? 'construct-outline' : 'calendar-outline'} size={40} color={colors.muted} />
              <Text style={styles.emptyTitle}>{kindEmptyText}</Text>
              <Text style={styles.emptyDesc}>
                {activeKind === 'repair' ? 'Xem tab Yêu cầu đặt lịch để theo dõi các yêu cầu của bạn.' : 'Xem tab Đơn sửa chữa để theo dõi các đơn đang được thực hiện.'}
              </Text>
            </View>
          )}
          {showLoadMore && (
            <TouchableOpacity
              onPress={onLoadMore}
              disabled={loadingMore}
              accessibilityRole="button"
              accessibilityLabel="Tải thêm lịch sử đặt lịch"
              style={styles.loadMoreBtn}
            >
              {loadingMore ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={styles.retryText}>Tải thêm ({bookings.length}/{total})</Text>
              )}
            </TouchableOpacity>
          )}
          {showLoadMoreOrders && (
            <TouchableOpacity
              onPress={onLoadMoreOrders}
              disabled={loadingMoreOrders}
              accessibilityRole="button"
              accessibilityLabel="Tải thêm đơn đã nhận"
              style={styles.loadMoreBtn}
            >
              {loadingMoreOrders ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={styles.retryText}>Tải thêm đơn đã nhận</Text>
              )}
            </TouchableOpacity>
          )}
        </ScrollView>
      ) : (
        <View style={styles.emptyContainer}>
          <Image source={CUSTOMER_UI_ARTWORK.emptySearch} style={{ width: 144, height: 112 }} resizeMode="contain" accessible={false} testID="activity-empty-art" />
          <Text style={styles.emptyTitle}>{emptyTitle}</Text>
          <Text style={styles.emptyDesc}>{emptyDescription}</Text>
          <TouchableOpacity
            style={[styles.bookNowBtn, { backgroundColor: colors.primary }]}
            onPress={() => navigation.navigate('CustomerServices')}
          >
            <Ionicons name="add-circle-outline" size={18} color={colors.surface} />
            <Text style={styles.bookNowText}>Đặt dịch vụ mới</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onRefresh} disabled={refreshing} accessibilityRole="button" style={styles.retryBtn}>
            <Text style={styles.retryText}>Làm mới</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const getStyles = (colors: any, spacing: any, fontSize: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
  },
  headerCopy: { flex: 1, paddingRight: 12 },
  historyButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  historyButtonText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sectionHeaderSpaced: { marginTop: 8 },
  kindCount: { minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  kindCountText: { fontSize: 12, fontWeight: '700' },
  kindEmpty: { alignItems: 'center', gap: 8, paddingVertical: 32, paddingHorizontal: 24 },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: colors.text },
  sectionCount: { fontSize: 12, fontWeight: '700', color: colors.textSecondary },
  activityControls: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
    gap: 8,
  },
  searchFilterContainer: {
    flexDirection: 'column',
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 12,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    color: colors.text,
  },
  // Two lists as tabs with an underline (the page's main choice); the status filter is a row of chips like Thông báo.
  kindTabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border },
  kindTab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48, borderBottomWidth: 2, borderBottomColor: 'transparent', marginBottom: -1 },
  kindTabActive: { borderBottomColor: colors.primary },
  kindTabText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  kindTabTextActive: { fontSize: 14, fontWeight: '700', color: colors.primaryStrong ?? colors.primary },
  filterRow: { flexDirection: 'row', gap: 8, paddingRight: 8 },
  filterChip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  filterChipActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  filterChipText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  filterChipTextActive: { fontSize: 13, fontWeight: '700', color: colors.primaryStrong ?? colors.primary },
  scrollContent: {
    padding: 16,
    paddingTop: 12,
  },
  loadingState: {
    flex: 1,
  },
  loadingText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  emptyDesc: {
    fontSize: 13,
    color: colors.primary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  bookNowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
  },
  bookNowText: {
    color: colors.surface,
    fontSize: 14,
    fontWeight: '600',
  },
  retryBtn: {
    padding: 12,
    marginTop: 8,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
  },
  errorBanner: {
    padding: 16,
    marginBottom: 12,
    gap: 8,
    alignItems: 'center',
    backgroundColor: colors.tone.warning.bg,
    borderRadius: 12,
  },
  loadMoreBtn: {
    padding: 16,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverageText: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: 4,
  },
  resumeBtn: {
    marginTop: 12,
    paddingVertical: 12,
    minHeight: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resumeText: {
    color: '#FFFFFF', // chữ trên nút nền primary/error, luôn trắng bất kể theme
    fontSize: 14,
    fontWeight: '600',
  },
  secondaryBtn: {
    marginTop: 8,
    paddingVertical: 12,
    minHeight: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  secondaryText: {
    fontSize: 14,
    fontWeight: '600',
  },
  manageActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  requestOptions: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingTop: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  cardActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: 8,
    marginTop: 8,
  },
  pillBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    borderWidth: 1,
  },
  pillBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  managePanel: {
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: colors.background,
    gap: 8,
  },
  manageModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  manageModalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    padding: 16,
    gap: 8,
    maxHeight: '85%',
  },
  manageTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
  },
  manageLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
  },
  manageInput: {
    minHeight: 72,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    textAlignVertical: 'top',
  },
  manageError: {
    color: colors.tone.danger.text,
    fontSize: 12,
    fontWeight: '600',
  },
  manageChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  manageChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 44,
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 8,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.primarySoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  cardInfo: {
    flex: 1,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    marginBottom: 6,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  title: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  meta: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  metaRowText: {
    flex: 1,
    fontSize: 13,
    color: colors.textSecondary,
  },
  noteText: {
    fontStyle: 'italic',
  },
  waitingNote: {
    marginTop: 4,
    padding: 8,
    borderRadius: 8,
    backgroundColor: colors.primarySoft,
  },
  waitingNoteText: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '600',
  },
});
