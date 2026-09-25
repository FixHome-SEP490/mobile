import React, { useState, useCallback, useRef } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../types';
import { useAppTheme } from '../../constants/theme';
import { useScrollHideTabBar } from '../../hooks/useScrollHideTabBar';
import { useAuthStore } from '../../store/auth.store';
import { bookingsApi, type BookingItem } from '../../api/bookings.api';
import { ordersApi, type ServiceOrderItem, type CanonicalOrderStatus } from '../../api/orders.api';
import {
  createBookingsHistoryLoader,
  customerBookingsUserId,
  initialHistoryState,
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
  const [historyState, setHistoryState] = useState(initialHistoryState);
  const { bookings, total, loading, refreshing, loadingMore, loadingMoreOrders, error, ordersError } = historyState;
  const loaderRef = useRef<ReturnType<typeof createBookingsHistoryLoader> | null>(null);
  if (loaderRef.current === null) {
    loaderRef.current = createBookingsHistoryLoader(
      (page, pageSize) => bookingsApi.getMyBookingsPage(page, pageSize),
      ordersApi.getMyOrders,
      setHistoryState,
      {
        getUserId: () => customerBookingsUserId(useAuthStore.getState()),
        subscribe: (listener) => useAuthStore.subscribe(listener),
      },
      { getOrdersPage: (page, pageSize) => ordersApi.getMyOrdersPage(page, pageSize) },
    );
  }
  const loader = loaderRef.current;
  useFocusEffect(useCallback(() => {
    void loader.focus();
    return () => loader.blur();
  }, [loader]));
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
          ? 'Backend chưa hủy theo GET mới nhất. Bạn có thể thử lại bằng một thao tác mới.'
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
          ? 'GET mới nhất vẫn giữ lịch cũ. Bạn có thể thử lại bằng một thao tác mới.'
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
        return { label: 'Đang sửa chữa', bg: '#DBEAFE', color: colors.primary };
      case 'ACCEPTED':
        return { label: 'Đã nhận đơn', bg: '#E0E7FF', color: '#4F46E5' };
      case 'COMPLETED':
        return { label: 'Hoàn thành', bg: '#DCFCE7', color: '#16A34A' };
      case 'CANCELLED':
        return { label: 'Đã hủy', bg: '#FEE2E2', color: '#DC2626' };
      default:
        return { label: s, bg: 'colors.border', color: 'colors.textSecondary' };
    }
  };

  const getBookingBadge = (status: BookingItem['status']) => {
    const s = String(status).toUpperCase();
    switch (s) {
      case 'SUBMITTED':
        return { label: 'Đã gửi yêu cầu', bg: '#E0E7FF', color: '#4F46E5' };
      case 'MATCHING':
        return { label: 'Đang tìm thợ', bg: '#FEF3C7', color: '#D97706' };
      case 'MATCHED':
        return { label: 'Đã ghép thợ', bg: '#DCFCE7', color: '#16A34A' };
      case 'CONFIRMED':
        return { label: 'Đã xác nhận', bg: '#DBEAFE', color: colors.primary };
      case 'CLOSED':
        return { label: 'Vòng tìm thợ đã kết thúc', bg: '#F1F5F9', color: '#64748B' };
      case 'CANCELLED':
        return { label: 'Đã hủy', bg: '#FEE2E2', color: '#DC2626' };
      default:
        return { label: s, bg: '#F1F5F9', color: '#64748B' };
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
              <Text style={styles.meta}>KTV {order.technician.fullName}</Text>
            )}
            <Text style={styles.meta}>Mã đơn: {order.code || order.id}</Text>
            {bookingId && (
              <Text style={styles.meta}>Từ yêu cầu #{bookingId.slice(0, 8)}</Text>
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
        <View style={styles.cardHeader}>
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
              <Text style={styles.meta} numberOfLines={2}>{booking.description}</Text>
            )}
            {!!booking.addressSummary && (
              <Text style={styles.meta} numberOfLines={1}>📍 {booking.addressSummary}</Text>
            )}
            <Text style={styles.meta}>{dateStr}</Text>
            {waiting && (
              <Text style={styles.meta}>Đang chờ kỹ thuật viên phản hồi — không cần gửi lại.</Text>
            )}
          </View>
        </View>
        {/* K09_B_BOOKING_MANAGE */}
        {(canCancelBookingConservative(booking) ||
          canRescheduleBookingConservative(booking)) && (
          <View style={styles.manageActions}>
            {canRescheduleBookingConservative(booking) && (
              <TouchableOpacity
                style={[
                  styles.secondaryBtn,
                  { borderColor: colors.border, flex: 1 },
                ]}
                onPress={() => openBookingManage(booking, 'reschedule')}
                disabled={manageBusy}
                accessibilityRole="button"
              >
                <Text style={[styles.secondaryText, { color: colors.text }]}>
                  Đổi lịch
                </Text>
              </TouchableOpacity>
            )}
            {canCancelBookingConservative(booking) && (
              <TouchableOpacity
                style={[
                  styles.secondaryBtn,
                  { borderColor: '#FCA5A5', flex: 1 },
                ]}
                onPress={() => openBookingManage(booking, 'cancel')}
                disabled={manageBusy}
                accessibilityRole="button"
              >
                <Text style={[styles.secondaryText, { color: '#B91C1C' }]}>
                  Hủy yêu cầu
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {manageBookingId === booking.id && manageMode === 'cancel' && (
          <View style={styles.managePanel}>
            <Text style={styles.manageTitle}>Hủy yêu cầu đặt lịch</Text>
            <Text style={styles.meta}>
              Chỉ áp dụng khi chưa có ServiceOrder. Nếu kỹ thuật viên vừa nhận đơn,
              GET sẽ chặn Booking cancel và chuyển sang đơn dịch vụ.
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
                  { backgroundColor: '#DC2626', flex: 1 },
                ]}
                onPress={() => {
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
        )}

        {manageBookingId === booking.id && manageMode === 'reschedule' && (
          <View style={styles.managePanel}>
            <Text style={styles.manageTitle}>
              Đổi lịch trước khi có ServiceOrder
            </Text>
            <Text style={styles.meta}>
              Mobile đang mirror Web conservative: chỉ SUBMITTED/MATCHING chưa
              linked order. Backend capability đổi lịch linked ACCEPTED/EN_ROUTE
              chưa expose ở đây.
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
                          ? '#EFF6FF'
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
                          ? '#EFF6FF'
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
          </View>
        )}

        {!!resumeId && (
          <TouchableOpacity
            style={[styles.resumeBtn, { backgroundColor: colors.primary }]}
            onPress={() => navigation.navigate('CustomerMatching', { bookingId: resumeId })}
            accessibilityRole="button"
            accessibilityLabel="Tiếp tục chọn kỹ thuật viên"
          >
            <Text style={styles.resumeText}>Tiếp tục chọn thợ</Text>
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
      ? 'Đang tìm thợ thay thế; đang chờ kỹ thuật viên phản hồi; làm mới để cập nhật'
      : 'Lượt mời thợ thay thế đã kết thúc. Xem khả năng chọn lại; hệ thống sẽ kiểm tra trước khi gửi.';
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
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
              <Text style={styles.meta} numberOfLines={2}>{booking.description}</Text>
            )}
            {!!booking.addressSummary && (
              <Text style={styles.meta} numberOfLines={1}>📍 {booking.addressSummary}</Text>
            )}
            <Text style={styles.meta}>{dateStr}</Text>
            <Text style={styles.meta}>{message}</Text>
            <Text style={styles.meta}>
              {`Đơn lịch sử ${order.code || order.id} — kỹ thuật viên trước đây chưa được xác nhận là thợ hiện tại.`}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={[styles.resumeBtn, { backgroundColor: colors.primary }]}
          onPress={() => navigation.navigate('CustomerMatching', { bookingId: booking.id })}
          accessibilityRole="button"
          accessibilityLabel={replacement === 'waiting' ? 'Xem tình trạng tìm thợ' : 'Xem khả năng chọn lại'}
        >
          <Text style={styles.resumeText}>{replacement === 'waiting' ? 'Xem tình trạng tìm thợ' : 'Xem khả năng chọn lại'}</Text>
        </TouchableOpacity>
        {!!detailId && (
          <TouchableOpacity
            style={[styles.secondaryBtn, { borderColor: colors.border }]}
            onPress={() => navigation.navigate('CustomerOrderDetail', { serviceOrderId: detailId })}
            accessibilityRole="button"
            accessibilityLabel="Xem chi tiết đơn lịch sử"
          >
            <Text style={[styles.secondaryText, { color: colors.text }]}>Xem chi tiết đơn lịch sử</Text>
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
        <Text style={styles.headerTitle}>Đơn dịch vụ</Text>
      </View>
      {/* Search & Filter */}
      <View style={styles.searchFilterContainer}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color="colors.textSecondary" />
          <TextInput
            style={styles.searchInput}
            placeholder="Tìm theo mã đơn, dịch vụ, thợ..."
            placeholderTextColor="colors.textSecondary"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      {/* Segment Tabs */}
      <View style={styles.segmentContainer}>
        <TouchableOpacity
          style={[styles.segmentBtn, activeTab === 'all' && styles.segmentActive]}
          onPress={() => setActiveTab('all')}
        >
          <Text style={activeTab === 'all' ? styles.segmentTextActive : styles.segmentText}>
            Tất cả ({cards.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.segmentBtn, activeTab === 'in_progress' && styles.segmentActive]}
          onPress={() => setActiveTab('in_progress')}
        >
          <Text style={activeTab === 'in_progress' ? styles.segmentTextActive : styles.segmentText}>
            Đang xử lý
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.segmentBtn, activeTab === 'completed' && styles.segmentActive]}
          onPress={() => setActiveTab('completed')}
        >
          <Text style={activeTab === 'completed' ? styles.segmentTextActive : styles.segmentText}>
            Hoàn tất
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content List */}
      {loading ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Đang tải đơn dịch vụ...</Text>
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
                accessibilityLabel="Xem chi tiết đơn dịch vụ"
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
          <Text style={styles.emptyTitle}>Chưa có đơn dịch vụ nào</Text>
          <Text style={styles.emptyDesc}>Đặt lịch ngay để thợ FixHome kiểm tra tại nhà bạn.</Text>
          <TouchableOpacity
            style={[styles.bookNowBtn, { backgroundColor: colors.primary }]}
            onPress={() => navigation.navigate('CustomerServices')}
          >
            <Ionicons name="add-circle-outline" size={18} color="colors.surface" />
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
  centerLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: colors.textSecondary,
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
    color: '#FFFFFF',
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
  managePanel: {
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: colors.background,
    gap: 8,
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
});
