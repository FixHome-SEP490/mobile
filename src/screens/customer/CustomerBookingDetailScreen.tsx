import React, { useCallback, useState } from 'react';
import {
  Alert,
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
  canExtendMatching,
  createBookingDetailLoader,
  initialBookingDetailState,
} from './customer-booking-detail';
import { vnDateTimeString, vnTimeString } from '../../utils/vn-time';
import BackButton from '../../components/BackButton';
import RebookSheet from '../../components/RebookSheet';

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
  const startText = vnDateTimeString(startDate);
  if (!end) return startText;
  const endDate = new Date(end);
  if (!Number.isFinite(endDate.getTime())) return startText;
  return `${startText} – ${vnTimeString(endDate, { hour: '2-digit', minute: '2-digit' })}`;
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
  const [rebookOpen, setRebookOpen] = useState(false);
  const nextAction = booking ? bookingNextAction(booking) : null;
  const [extending, setExtending] = useState(false);
  const [extensionNotice, setExtensionNotice] = useState('');

  const extendMatching = () => {
    if (!booking || extending) return;
    Alert.alert('Gia hạn thời gian chờ thợ', 'Kỹ thuật viên đang được mời sẽ có thêm thời gian để nhận việc.', [
      { text: 'Để sau', style: 'cancel' },
      {
        text: 'Gia hạn',
        onPress: async () => {
          setExtending(true);
          try {
            const result = await bookingsApi.extendMatching(booking.id);
            setExtensionNotice(`Đã gia hạn lời mời tới ${vnDateTimeString(new Date(result.expiresAt))}.`);
            void loader.refresh(true);
          } catch {
            Alert.alert('Chưa gia hạn được', 'Lời mời có thể đã hết hạn hoặc đã có kỹ thuật viên nhận. Kéo xuống để tải lại.');
          } finally {
            setExtending(false);
          }
        },
      },
    ]);
  };

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
        <BackButton />
        <Text style={styles.headerTitle} accessibilityRole="header">Chi tiết yêu cầu đặt lịch</Text>
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
          <Text style={styles.emptyTitle} accessibilityRole="header">Không xem được yêu cầu</Text>
          {!!error && <Text style={styles.emptyText}>{error}</Text>}
          <TouchableOpacity
            onPress={() => void loader.refresh(true)}
            disabled={refreshing}
            accessibilityRole="button"
            accessibilityLabel="Thử tải lại yêu cầu đặt lịch"
            accessibilityState={{ disabled: refreshing, busy: refreshing }}
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
            <Text style={styles.serviceTitle} accessibilityRole="header">{booking.serviceName || 'Dịch vụ sửa chữa'}</Text>
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

          <View testID="booking-detail-status-timeline" style={styles.progressCard}>
            <Text style={styles.progressHeading} accessibilityRole="header">Tiến độ yêu cầu</Text>
            <View style={styles.progressRow}>
              <View style={styles.progressTrack}>
                <View style={styles.progressDotComplete} />
                <View style={styles.progressConnector} />
              </View>
              <View style={styles.progressCopy}>
                <Text style={styles.progressTitle}>Yêu cầu đã gửi</Text>
                {!!booking.createdAt && (
                  <Text style={styles.progressMeta}>{vnDateTimeString(booking.createdAt)}</Text>
                )}
              </View>
            </View>
            <View style={styles.progressRow}>
              <View style={styles.progressTrack}>
                <View style={styles.progressDotCurrent} />
              </View>
              <View style={styles.progressCopy}>
                <Text style={styles.progressMeta}>Trạng thái hiện tại</Text>
                <Text style={styles.progressTitle}>{bookingStatusLabel(booking.status)}</Text>
              </View>
            </View>
            <View style={styles.orderRelation}>
              <Ionicons
                name={booking.serviceOrderId ? 'construct-outline' : 'time-outline'}
                size={18}
                color={colors.textSecondary}
              />
              <Text style={styles.orderRelationText}>
                {booking.serviceOrderId
                  ? 'Đơn sửa chữa đã được tạo'
                  : 'Đơn sửa chữa chưa được tạo'}
              </Text>
            </View>
          </View>

          {booking.status === 'CANCELLED' && (
            <TouchableOpacity
              testID="booking-rebook"
              onPress={() => setRebookOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Đặt lại thợ"
              style={styles.primaryButton}
            >
              <Text style={styles.primaryButtonText}>Đặt lại thợ</Text>
            </TouchableOpacity>
          )}
          {booking.status === 'CANCELLED' && (
            <RebookSheet bookingId={booking.id} visible={rebookOpen} onClose={() => setRebookOpen(false)} />
          )}

          {nextAction && (
            <View style={styles.actionCard} accessibilityRole="summary">
              <Text style={styles.actionEyebrow}>Bước tiếp theo</Text>
              <Text style={styles.actionTitle} accessibilityRole="header">{nextAction.title}</Text>
              <Text style={styles.actionDetail}>{nextAction.detail}</Text>
              {!!nextAction.primaryLabel && (
                <TouchableOpacity
                  testID="booking-detail-primary-action"
                  onPress={runPrimaryAction}
                  accessibilityRole="button"
                  accessibilityLabel={nextAction.primaryLabel}
                  accessibilityHint="Mở bước tiếp theo; không tự gửi yêu cầu đặt lịch hoặc thanh toán"
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
                  accessibilityLabel="Xem đơn sửa chữa liên quan"
                  style={styles.linkButton}
                >
                  <Text style={styles.linkText}>Xem đơn sửa chữa liên quan</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {canExtendMatching(booking) && !extensionNotice && (
            <TouchableOpacity
              testID="booking-extend-matching"
              onPress={extendMatching}
              disabled={extending}
              accessibilityRole="button"
              style={styles.linkButton}
            >
              <Text style={styles.linkText}>{extending ? 'Đang gia hạn…' : 'Gia hạn thời gian chờ thợ'}</Text>
            </TouchableOpacity>
          )}
          {!!extensionNotice && <Text style={styles.actionDetail}>{extensionNotice}</Text>}

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
      lineHeight: 24,
      fontWeight: '700',
      color: colors.text,
    },
    headerBackBtn: { width: 44, height: 44, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
    headerSpacer: { width: 44 },
    content: { padding: 16, paddingBottom: 64, gap: 14, flexGrow: 1 },
    loadingState: { flex: 1, padding: 16, gap: 12 },
    loadingText: { textAlign: 'center', color: colors.textSecondary, fontSize: 13 },
    emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 10 },
    emptyTitle: { color: colors.text, fontSize: 18, lineHeight: 26, fontWeight: '700' },
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
    summaryTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 },
    statusBadge: {
      alignSelf: 'flex-start',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor: colors.primarySoft,
    },
    statusText: { color: colors.primaryStrong, fontSize: 12, lineHeight: 17, fontWeight: '800' },
    referenceText: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, fontWeight: '600', flexShrink: 0 },
    serviceTitle: { color: colors.text, fontSize: 20, lineHeight: 28, fontWeight: '700' },
    description: { color: colors.text, fontSize: 14, lineHeight: 21 },
    infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    infoText: { flex: 1, color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
    actionCard: {
      borderRadius: 16,
      padding: 16,
      gap: 8,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    actionEyebrow: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, fontWeight: '700' },
    actionTitle: { color: colors.text, fontSize: 18, lineHeight: 26, fontWeight: '700' },
    actionDetail: { color: colors.textSecondary, fontSize: 13, lineHeight: 20 },
    primaryButton: {
      marginTop: 4,
      minHeight: 48,
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
    linkButton: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 3 },
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
    noteText: { flex: 1, color: colors.textSecondary, fontSize: 12, lineHeight: 19 },
    progressCard: {
      borderRadius: 16,
      padding: 16,
      gap: 12,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    progressHeading: { color: colors.text, fontSize: 15, lineHeight: 22, fontWeight: '800' },
    progressRow: { flexDirection: 'row', minHeight: 38, gap: 12 },
    progressTrack: { width: 18, alignItems: 'center' },
    progressDotComplete: {
      width: 12,
      height: 12,
      borderRadius: 6,
      marginTop: 4,
      backgroundColor: colors.primaryStrong,
    },
    progressDotCurrent: {
      width: 12,
      height: 12,
      borderRadius: 6,
      marginTop: 4,
      borderWidth: 3,
      borderColor: colors.primaryStrong,
      backgroundColor: colors.surface,
    },
    progressConnector: {
      position: 'absolute',
      top: 18,
      bottom: -14,
      width: 1,
      backgroundColor: colors.border,
    },
    progressCopy: { flex: 1, gap: 2 },
    progressTitle: { color: colors.text, fontSize: 14, lineHeight: 20, fontWeight: '700' },
    progressMeta: { color: colors.textSecondary, fontSize: 12, lineHeight: 18 },
    orderRelation: {
      marginTop: 2,
      paddingTop: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    orderRelationText: { flex: 1, color: colors.textSecondary, fontSize: 12, lineHeight: 18 },
  });
}
