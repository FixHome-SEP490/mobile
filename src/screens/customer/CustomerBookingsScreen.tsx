import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  StatusBar,
  Modal,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../types';
import { useAppTheme } from '../../constants/theme';
import { useScrollHideTabBar } from '../../hooks/useScrollHideTabBar';
import { useAuthStore } from '../../store/auth.store';
import CustomerSkeleton from '../../components/customer/CustomerSkeleton';
import { bookingsApi, type BookingItem } from '../../api/bookings.api';
import { ordersApi, type ServiceOrderItem, type CanonicalOrderStatus } from '../../api/orders.api';
import {
  createBookingsHistoryLoader,
  customerBookingsUserId,
  getCachedHistoryState,
  linkedReplacementState,
  orderTotalText,
  resolveBookingsView,
  resumeTargetFor,
  type BookingsTab,
} from './customer-bookings-history';
import { orderDetailTarget } from './customer-order-detail';
import { buildBookingWindow } from '../../utils/booking-window';
import {
  canCancelBookingConservative,
  canRescheduleBookingConservative,
  cancelBookingConservative,
  rescheduleBookingConservative,
} from './customer-booking-manage';

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
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<BookingsTab>('all');
  const [manageBookingId, setManageBookingId] = useState<string | null>(null);
  const [manageMode, setManageMode] = useState<'cancel' | 'reschedule' | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [rescheduleDayOffset, setRescheduleDayOffset] = useState(1);
  const [rescheduleTime, setRescheduleTime] = useState('09:00');
  const [manageBusy, setManageBusy] = useState(false);
  const [manageError, setManageError] = useState<string | null>(null);
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
        return { label: 'Đang di chuyển', bg: '#FEF3C7', color: '#D97706' };
      case 'UNDER_REPAIR':
      case 'IN_PROGRESS':
        return { label: 'Đang sửa chữa', bg: colors.primaryTint, color: colors.primary };
      case 'ACCEPTED':
        return { label: 'Đã nhận đơn', bg: '#E0E7FF', color: '#4F46E5' };
      case 'COMPLETED':
        return { label: 'Hoàn thành', bg: '#DCFCE7', color: '#16A34A' };
      case 'CANCELLED':
        return { label: 'Đã hủy', bg: '#FEE2E2', color: colors.error };
      default:
        return { label: s, bg: colors.border, color: colors.textSecondary };
    }
  };

  const getBookingBadge = (status: BookingItem['status']) => {
    const s = String(status).toUpperCase();
    switch (s) {
      case 'SUBMITTED':
        return { label: 'Đã gửi yêu cầu', bg: '#E0E7FF', color: '#4F46E5' };
      case 'MATCHING':
        return { label: 'Đang tìm kỹ thuật viên', bg: '#FEF3C7', color: '#D97706' };
      case 'MATCHED':
        return { label: 'Đã ghép kỹ thuật viên', bg: '#DCFCE7', color: '#16A34A' };
      case 'CONFIRMED':
        return { label: 'Đã xác nhận', bg: colors.primaryTint, color: colors.primary };
      case 'CLOSED':
        return { label: 'Vòng tìm kỹ thuật viên đã kết thúc', bg: colors.divider, color: colors.textSecondary };
      case 'CANCELLED':
        return { label: 'Đã hủy', bg: '#FEE2E2', color: colors.error };
      default:
        return { label: s, bg: colors.divider, color: colors.textSecondary };
    }
  };

  const view = resolveBookingsView(historyState, searchQuery, activeTab);
  const { cards, filtered: filteredCards, showList, emptyNote, showLoadMore, showLoadMoreOrders, ordersCoverageText } = view;

  const renderOrderSummary = (order: ServiceOrderItem, bookingId: string | null) => {
    const badge = getStatusBadge(order.status);
    const totalText = orderTotalText(order);
    const dateStr = order.createdAt
      ? new Date(order.createdAt).toLocaleDateString('vi-VN')
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
              {dateStr}{totalText ? ` · ${totalText}` : ''}
            </Text>
            {!totalText && (
              <Text style={styles.meta}>Chưa có thông tin giá</Text>
            )}
            {order.technician?.fullName && (
              <Text style={styles.meta}>Kỹ thuật viên {order.technician.fullName}</Text>
            )}
            <Text style={styles.meta}>Mã tham chiếu: {order.code || order.id.slice(0, 8)}</Text>
            {bookingId && (
              <Text style={styles.meta}>Thuộc yêu cầu #{bookingId.slice(0, 8)}</Text>
            )}
          </View>
        </View>
      </View>
    );
  };

  const renderBookingCard = (booking: BookingItem) => {
    const badge = getBookingBadge(booking.status);
    const resumeId = resumeTargetFor(booking, !view.ordersCoverageComplete);
    const dateStr = booking.createdAt
      ? new Date(booking.createdAt).toLocaleDateString('vi-VN')
      : 'Gần đây';
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
            {!!booking.description && (
              <View style={styles.metaRow}>
                <Ionicons name="document-text-outline" size={14} color={colors.textSecondary} />
                <Text style={[styles.metaRowText, styles.noteText]} numberOfLines={2}>
                  {booking.description}
                </Text>
              </View>
            )}
            {!!booking.addressSummary && (
              <View style={styles.metaRow}>
                <Ionicons name="location-outline" size={14} color={colors.textSecondary} />
                <Text style={styles.metaRowText} numberOfLines={2}>{booking.addressSummary}</Text>
              </View>
            )}
            <View style={styles.metaRow}>
              <Ionicons name="calendar-outline" size={14} color={colors.textSecondary} />
              <Text style={styles.metaRowText}>{dateStr}</Text>
            </View>
            {waiting && (
              <View style={styles.waitingNote}>
                <Text style={styles.waitingNoteText}>
                  Đang chờ kỹ thuật viên phản hồi — không cần gửi lại.
                </Text>
              </View>
            )}
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
        </TouchableOpacity>
        {/* K09_B_BOOKING_MANAGE */}
        {(canCancelBookingConservative(booking) ||
          canRescheduleBookingConservative(booking)) && (
          <View style={[styles.cardActionsRow, { marginTop: 12 }]}>
            {canRescheduleBookingConservative(booking) && (
              <TouchableOpacity
                style={[styles.pillBtn, { borderColor: colors.border }]}
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
                style={[styles.pillBtn, { borderColor: '#FCA5A5' }]}
                onPress={() => openBookingManage(booking, 'cancel')}
                disabled={manageBusy}
                accessibilityRole="button"
              >
                <Text style={[styles.pillBtnText, { color: '#B91C1C' }]}>
                  Hủy yêu cầu
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <Modal
          visible={manageBookingId === booking.id && manageMode === 'cancel'}
          transparent
          animationType="slide"
          onRequestClose={closeBookingManage}
        >
          <View style={styles.manageModalBackdrop}>
            <View style={[styles.manageModalSheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={styles.manageTitle}>Hủy yêu cầu đặt lịch</Text>
            <Text style={styles.meta}>
              Chỉ áp dụng khi chưa có đơn sửa chữa. Nếu kỹ thuật viên vừa nhận đơn,
              hệ thống sẽ chuyển sang đơn sửa chữa.
            </Text>
            <TextInput
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
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
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
          </View>
        </Modal>

        <Modal
          visible={manageBookingId === booking.id && manageMode === 'reschedule'}
          transparent
          animationType="slide"
          onRequestClose={closeBookingManage}
        >
          <View style={styles.manageModalBackdrop}>
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
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
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
          </View>
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
    const dateStr = booking.createdAt
      ? new Date(booking.createdAt).toLocaleDateString('vi-VN')
      : 'Gần đây';
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
            {!!booking.description && (
              <View style={styles.metaRow}>
                <Ionicons name="document-text-outline" size={14} color={colors.textSecondary} />
                <Text style={[styles.metaRowText, styles.noteText]} numberOfLines={2}>
                  {booking.description}
                </Text>
              </View>
            )}
            {!!booking.addressSummary && (
              <View style={styles.metaRow}>
                <Ionicons name="location-outline" size={14} color={colors.textSecondary} />
                <Text style={styles.metaRowText} numberOfLines={2}>{booking.addressSummary}</Text>
              </View>
            )}
            <View style={styles.metaRow}>
              <Ionicons name="calendar-outline" size={14} color={colors.textSecondary} />
              <Text style={styles.metaRowText}>{dateStr}</Text>
            </View>
            <View style={styles.waitingNote}>
              <Text style={styles.waitingNoteText}>{message}</Text>
            </View>
            <Text style={styles.meta}>
              {`Đơn lịch sử ${order.code || order.id.slice(0, 8)} — kỹ thuật viên trước đây chưa được xác nhận là kỹ thuật viên hiện tại.`}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
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
            style={[styles.pillBtn, { borderColor: colors.border, alignSelf: 'flex-start', marginTop: 8 }]}
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

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Đơn của tôi</Text>
      </View>
      {/* Search & Filter */}
      <View style={styles.searchFilterContainer}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color={colors.textSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Tìm theo mã đơn, dịch vụ, kỹ thuật viên..."
            placeholderTextColor={colors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      {/* Segment Tabs */}
      <View style={styles.segmentContainer}>
        <TouchableOpacity
          style={[styles.segmentBtn, activeTab === 'all' && styles.segmentActive]}
          onPress={() => { Haptics.selectionAsync(); setActiveTab('all'); }}
        >
          <Text style={activeTab === 'all' ? styles.segmentTextActive : styles.segmentText}>
            Tất cả ({cards.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.segmentBtn, activeTab === 'in_progress' && styles.segmentActive]}
          onPress={() => { Haptics.selectionAsync(); setActiveTab('in_progress'); }}
        >
          <Text style={activeTab === 'in_progress' ? styles.segmentTextActive : styles.segmentText}>
            Đang xử lý
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.segmentBtn, activeTab === 'completed' && styles.segmentActive]}
          onPress={() => { Haptics.selectionAsync(); setActiveTab('completed'); }}
        >
          <Text style={activeTab === 'completed' ? styles.segmentTextActive : styles.segmentText}>
            Hoàn tất
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content List */}
      {loading ? (
        <View style={styles.loadingState}>
          <CustomerSkeleton variant="booking" rows={3} />
          <Text style={styles.loadingText} accessibilityLiveRegion="polite">Đang tải đơn của tôi...</Text>
        </View>
      ) : showList ? (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
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
              <Ionicons name="layers-outline" size={56} color="#CBD5E1" />
              <Text style={styles.emptyTitle}>Chưa thấy mục phù hợp ở trang này</Text>
              <Text style={styles.emptyDesc}>Còn trang lịch sử chưa tải. Bấm Tải thêm để xem tiếp.</Text>
            </View>
          )}
          {filteredCards.length === 0 && emptyNote === 'no-match' && (
            <View style={styles.emptyContainer}>
              <Ionicons name="search-outline" size={56} color="#CBD5E1" />
              <Text style={styles.emptyTitle}>Không tìm thấy mục phù hợp</Text>
              <Text style={styles.emptyDesc}>Không có mục nào phù hợp với tìm kiếm/bộ lọc hiện tại.</Text>
              {!!searchQuery.trim() && (
                <TouchableOpacity onPress={() => setSearchQuery('')} accessibilityRole="button" style={styles.retryBtn}>
                  <Text style={styles.retryText}>Xóa tìm kiếm</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
          {filteredCards.map((card) => {
            const key = card.kind === 'booking' ? `booking-${card.booking.id}` : `order-${card.order.id}`;
            if (card.kind === 'booking' && !card.order) return <View key={key}>{renderBookingCard(card.booking)}</View>;
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
              <TouchableOpacity
                key={key}
                onPress={() => navigation.navigate('CustomerOrderDetail', { serviceOrderId: detailId })}
                accessibilityRole="button"
                accessibilityLabel="Xem chi tiết đơn sửa chữa"
                activeOpacity={0.8}
              >
                {renderOrderSummary(order, bookingId)}
              </TouchableOpacity>
            );
          })}
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
          {!!ordersCoverageText && (
            <Text style={styles.coverageText}>{ordersCoverageText}</Text>
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
          <Ionicons name="receipt-outline" size={56} color="#CBD5E1" />
          <Text style={styles.emptyTitle}>Chưa có đơn nào</Text>
          <Text style={styles.emptyDesc}>Đặt lịch ngay để kỹ thuật viên FixHome kiểm tra tại nhà bạn.</Text>
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
    paddingVertical: 14,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
  },
  searchFilterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 12,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    color: colors.text,
  },
  segmentContainer: {
    flexDirection: 'row',
    backgroundColor: colors.border,
    margin: 16,
    padding: 4,
    borderRadius: 12,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  segmentActive: {
    backgroundColor: colors.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  segmentTextActive: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  scrollContent: {
    padding: 16,
    paddingTop: 0,
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
    marginBottom: 20,
  },
  bookNowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  bookNowText: {
    color: colors.surface,
    fontSize: 14,
    fontWeight: '700',
  },
  retryBtn: {
    padding: 12,
    marginTop: 8,
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
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
  },
  loadMoreBtn: {
    padding: 14,
    alignItems: 'center',
  },
  coverageText: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: 4,
  },
  resumeBtn: {
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  resumeText: {
    color: '#FFFFFF', // chữ trên nút nền primary/error, luôn trắng bất kể theme
    fontSize: 13,
    fontWeight: '700',
  },
  secondaryBtn: {
    marginTop: 8,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
  },
  secondaryText: {
    fontSize: 13,
    fontWeight: '700',
  },
  manageActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  cardActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: 8,
    marginTop: 8,
  },
  pillBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  pillBtnText: {
    fontSize: 13,
    fontWeight: '700',
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
    padding: 10,
    textAlignVertical: 'top',
  },
  manageError: {
    color: '#B91C1C',
    fontSize: 12,
    fontWeight: '600',
  },
  manageChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  manageChip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderRadius: 8,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#E0F2FE',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  cardInfo: {
    flex: 1,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 6,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  title: {
    fontSize: 15,
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
