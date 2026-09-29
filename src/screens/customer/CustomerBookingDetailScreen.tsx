import React, { useCallback, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { bookingsApi } from '../../api/bookings.api';
import { useAppTheme, type ThemeColors } from '../../constants/theme';
import CustomerSkeleton from '../../components/customer/CustomerSkeleton';
import { useAuthStore } from '../../store/auth.store';
import type { RootStackParamList } from '../../types';
import { customerBookingsUserId } from './customer-bookings-history';
import {
  bookingNextAction,
  bookingStatusLabel,
  createBookingDetailLoader,
  initialBookingDetailState,
} from './customer-booking-detail';

type BookingDetailRoute = RouteProp<RootStackParamList, 'CustomerBookingDetail'>;

function urgencyLabel(urgency: string): string {
  switch (String(urgency).toUpperCase()) {
    case 'LOW':
      return 'Không gấp';
    case 'HIGH':
      return 'Ưu tiên cao';
    case 'EMERGENCY':
      return 'Khẩn cấp';
    default:
      return 'Bình thường';
  }
}

function formatWindow(start?: string, end?: string): string {
  if (!start) return 'Chưa có lịch hẹn';
  const startDate = new Date(start);
  if (!Number.isFinite(startDate.getTime())) return 'Chưa có lịch hẹn';
  const startText = startDate.toLocaleString('vi-VN');
  if (!end) return startText;
  const endDate = new Date(end);
  if (!Number.isFinite(endDate.getTime())) return startText;
  return `${startText} – ${endDate.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;
}

export default function CustomerBookingDetailScreen() {
  const { colors, isDark } = useAppTheme();
  const styles = getStyles(colors);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<BookingDetailRoute>();
  const bookingId = route.params.bookingId;
  const [state, setState] = useState(initialBookingDetailState);
  const [loader] = useState(() => createBookingDetailLoader(
    bookingsApi.getBooking,
    setState,
    {
      getUserId: () => customerBookingsUserId(useAuthStore.getState()),
      subscribe: (listener) => useAuthStore.subscribe(listener),
    },
  ));

  useFocusEffect(useCallback(() => {
    void loader.focus(bookingId);
    return () => loader.blur();
  }, [bookingId, loader]));

  const { booking, loading, refreshing, error } = state;
  const nextAction = booking ? bookingNextAction(booking) : null;

  const runPrimaryAction = () => {
    if (!booking || !nextAction) return;
    if (nextAction.kind === 'choose_technician') {
      navigation.navigate('CustomerMatching', { bookingId: booking.id });
      return;
    }
    if (nextAction.kind === 'open_order' && nextAction.serviceOrderId) {
      navigation.navigate('CustomerOrderDetail', { serviceOrderId: nextAction.serviceOrderId });
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={colors.background}
      />
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Quay lại"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Chi tiết yêu cầu đặt lịch</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={styles.loadingState}>
          <CustomerSkeleton variant="orderDetail" rows={3} />
          <Text style={styles.loadingText}>Đang tải yêu cầu đặt lịch…</Text>
        </View>
      ) : !booking ? (
        <View style={styles.emptyState}>
          <Ionicons name="calendar-outline" size={52} color={colors.muted} />
          <Text style={styles.emptyTitle}>Không xem được yêu cầu</Text>
          {!!error && <Text style={styles.emptyText}>{error}</Text>}
          <TouchableOpacity
            onPress={() => void loader.refresh(true)}
            disabled={refreshing}
            accessibilityRole="button"
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>{refreshing ? 'Đang tải…' : 'Thử lại'}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={(
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void loader.refresh(true)}
            />
          )}
        >
          {!!error && <Text style={styles.inlineError}>{error}</Text>}

          <View style={styles.summaryCard}>
            <View style={styles.summaryTopRow}>
              <View style={styles.statusBadge}>
                <Text style={styles.statusText}>{bookingStatusLabel(booking.status)}</Text>
              </View>
              <Text style={styles.referenceText}>#{booking.id.slice(0, 8)}</Text>
            </View>
            <Text style={styles.serviceTitle}>{booking.serviceName || 'Dịch vụ sửa chữa'}</Text>
            {!!booking.description && <Text style={styles.description}>{booking.description}</Text>}
            {!!booking.addressSummary && (
              <View style={styles.infoRow}>
                <Ionicons name="location-outline" size={17} color={colors.textSecondary} />
                <Text style={styles.infoText}>{booking.addressSummary}</Text>
              </View>
            )}
            <View style={styles.infoRow}>
              <Ionicons name="calendar-outline" size={17} color={colors.textSecondary} />
              <Text style={styles.infoText}>
                {formatWindow(booking.preferredStartAt || booking.preferredAt, booking.preferredEndAt)}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Ionicons name="speedometer-outline" size={17} color={colors.textSecondary} />
              <Text style={styles.infoText}>Mức độ: {urgencyLabel(booking.urgency)}</Text>
            </View>
            {!!booking.mediaUrls?.length && (
              <View style={styles.infoRow}>
                <Ionicons name="images-outline" size={17} color={colors.textSecondary} />
                <Text style={styles.infoText}>Đã gửi {booking.mediaUrls.length} ảnh hiện trạng</Text>
              </View>
            )}
          </View>

          {nextAction && (
            <View style={styles.actionCard} accessibilityRole="summary">
              <Text style={styles.actionEyebrow}>BẠN CẦN LÀM GÌ?</Text>
              <Text style={styles.actionTitle}>{nextAction.title}</Text>
              <Text style={styles.actionDetail}>{nextAction.detail}</Text>
              {!!nextAction.primaryLabel && (
                <TouchableOpacity
                  testID="booking-detail-primary-action"
                  onPress={runPrimaryAction}
                  accessibilityRole="button"
                  style={styles.primaryButton}
                >
                  <Text style={styles.primaryButtonText}>{nextAction.primaryLabel}</Text>
                  <Ionicons name="arrow-forward" size={18} color={colors.surface} />
                </TouchableOpacity>
              )}
              {nextAction.kind === 'choose_technician' && !!nextAction.serviceOrderId && (
                <TouchableOpacity
                  onPress={() => navigation.navigate('CustomerOrderDetail', {
                    serviceOrderId: nextAction.serviceOrderId!,
                  })}
                  accessibilityRole="button"
                  style={styles.linkButton}
                >
                  <Text style={styles.linkText}>Xem đơn sửa chữa liên quan</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          <View style={styles.noteCard}>
            <Ionicons name="information-circle-outline" size={20} color={colors.primaryStrong} />
            <Text style={styles.noteText}>
              “Yêu cầu đặt lịch” là bước tìm và mời kỹ thuật viên. Khi kỹ thuật viên nhận việc,
              FixHome tạo “Đơn sửa chữa” riêng để theo dõi tiến độ, báo giá và thanh toán.
            </Text>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function getStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      minHeight: 56,
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      backgroundColor: colors.surface,
    },
    headerTitle: {
      flex: 1,
      textAlign: 'center',
      fontSize: 17,
      fontWeight: '800',
      color: colors.text,
    },
    headerSpacer: { width: 24 },
    content: { padding: 16, paddingBottom: 36, gap: 14 },
    loadingState: { flex: 1, padding: 16, gap: 12 },
    loadingText: { textAlign: 'center', color: colors.textSecondary, fontSize: 13 },
    emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 10 },
    emptyTitle: { color: colors.text, fontSize: 17, fontWeight: '800' },
    emptyText: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, textAlign: 'center' },
    inlineError: {
      padding: 12,
      borderRadius: 10,
      backgroundColor: colors.divider,
      color: colors.error,
      fontSize: 13,
      fontWeight: '600',
    },
    summaryCard: {
      borderRadius: 16,
      padding: 16,
      gap: 10,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    summaryTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    statusBadge: {
      alignSelf: 'flex-start',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor: colors.primarySoft,
    },
    statusText: { color: colors.primaryStrong, fontSize: 12, lineHeight: 17, fontWeight: '800' },
    referenceText: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
    serviceTitle: { color: colors.text, fontSize: 19, lineHeight: 26, fontWeight: '800' },
    description: { color: colors.text, fontSize: 14, lineHeight: 21 },
    infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    infoText: { flex: 1, color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
    actionCard: {
      borderRadius: 16,
      padding: 16,
      gap: 8,
      backgroundColor: colors.primarySoft,
      borderWidth: 1,
      borderColor: colors.primary,
    },
    actionEyebrow: { color: colors.primaryStrong, fontSize: 11, fontWeight: '900', letterSpacing: 0.4 },
    actionTitle: { color: colors.text, fontSize: 18, lineHeight: 25, fontWeight: '800' },
    actionDetail: { color: colors.textSecondary, fontSize: 13, lineHeight: 20 },
    primaryButton: {
      marginTop: 4,
      minHeight: 46,
      borderRadius: 12,
      paddingHorizontal: 16,
      backgroundColor: colors.primaryStrong,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
    },
    primaryButtonText: { color: colors.surface, fontSize: 14, fontWeight: '800' },
    secondaryButton: {
      minHeight: 44,
      paddingHorizontal: 16,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
    },
    secondaryButtonText: { color: colors.primaryStrong, fontSize: 14, fontWeight: '700' },
    linkButton: { alignSelf: 'flex-start', paddingVertical: 6 },
    linkText: { color: colors.primaryStrong, fontSize: 13, fontWeight: '700' },
    noteCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      padding: 14,
      borderRadius: 14,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    noteText: { flex: 1, color: colors.textSecondary, fontSize: 12, lineHeight: 18 },
  });
}
