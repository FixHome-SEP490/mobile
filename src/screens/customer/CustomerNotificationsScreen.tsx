import { useAppTheme } from '../../constants/theme';
import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useLiveRefresh } from '../../hooks/useLiveRefresh';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useScrollHideTabBar } from '../../hooks/useScrollHideTabBar';
import CustomerSkeleton from '../../components/customer/CustomerSkeleton';
import {
  notificationsApi,
  type CustomerNotificationItem,
  type NotificationPageMeta,
} from '../../api/notifications.api';
import { supportCasesApi } from '../../api/support-cases.api';
import type { RootStackParamList } from '../../types';
import { isSameVnDay, vnDateString, vnTimeString } from '../../utils/vn-time';
import {
  mergeNotificationRows,
  nextNotificationPage,
} from './customer-notification-pagination';
import { prepareCustomerNotificationAction } from './customer-notification-action';

export default function CustomerNotificationsScreen() {
  const { colors, spacing, fontSize, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = getStyles(colors, spacing, fontSize);
  const handleScroll = useScrollHideTabBar();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [notifications, setNotifications] = useState<CustomerNotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pageMeta, setPageMeta] = useState<NotificationPageMeta | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [resolvingReferenceId, setResolvingReferenceId] = useState<string | null>(null);
  const loadingMoreRef = useRef(false);
  const readRequestsRef = useRef(new Map<string, Promise<void>>());

  const fetchNotifications = useCallback(async () => {
    try {
      const page = await notificationsApi.getNotificationPage(1, 20);
      setNotifications(mergeNotificationRows([], page.data, true));
      setPageMeta(page.meta);
      setLoadError(null);
      setLoadMoreError(null);
    } catch (error) {
      console.error('Lỗi khi tải thông báo:', error);
      setLoadError('Không thể tải thông báo. Kiểm tra kết nối rồi thử lại.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      await fetchNotifications();
    };
    load();
  }, [fetchNotifications]);

  const onRefresh = () => {
    if (loadingMoreRef.current) return;
    setRefreshing(true);
    setLoadError(null);
    setLoadMoreError(null);
    void fetchNotifications();
  };

  const onLoadMore = useCallback(async () => {
    const nextPage = nextNotificationPage(pageMeta);
    if (!nextPage || loading || refreshing || loadingMoreRef.current) return;

    loadingMoreRef.current = true;
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const page = await notificationsApi.getNotificationPage(nextPage, 20);
      setNotifications((current) => mergeNotificationRows(current, page.data));
      setPageMeta(page.meta);
    } catch (error) {
      console.error('Lỗi khi tải thêm thông báo:', error);
      setLoadMoreError('Không thể tải thêm thông báo.');
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [loading, pageMeta, refreshing]);

  const [markingAll, setMarkingAll] = useState(false);
  const [markAllError, setMarkAllError] = useState<string | null>(null);
  const loadedUnreadCount = notifications.filter((item) => !item.isRead).length;
  // Like the web filter: narrows the pages already loaded, GET /notifications has no filter parameter.
  const [unreadOnly, setUnreadOnly] = useState(false);
  const shown = unreadOnly ? notifications.filter((item) => !item.isRead) : notifications;

  const onMarkAllRead = async () => {
    if (markingAll) return;
    setMarkingAll(true);
    setMarkAllError(null);
    try {
      await notificationsApi.readAll();
      setNotifications((prev) => prev.map((item) => ({ ...item, isRead: true })));
      setMarkAllError(null);
    } catch (error) {
      console.error('Lỗi khi đánh dấu đã đọc tất cả:', error);
      setMarkAllError('Không thể đánh dấu tất cả đã đọc. Vui lòng thử lại.');
    } finally {
      setMarkingAll(false);
    }
  };

  const onNotificationPress = async (item: CustomerNotificationItem) => {
    if (resolvingReferenceId === item.id) return;

    const mayNeedAsyncResolution = item.referenceType?.trim().toUpperCase() === 'SUPPORT_CASE';
    if (mayNeedAsyncResolution) setResolvingReferenceId(item.id);

    try {
      const target = await prepareCustomerNotificationAction(item, {
        markReadLocal: (id) => {
          setNotifications((prev) =>
            prev.map((notification) => (
              notification.id === id ? { ...notification, isRead: true } : notification
            )),
          );
        },
        markReadRemote: (id) => {
          const pending = readRequestsRef.current.get(id);
          if (pending) return pending;
          const request = notificationsApi.readNotification(id).finally(() => {
            readRequestsRef.current.delete(id);
          });
          readRequestsRef.current.set(id, request);
          return request;
        },
        onMarkReadError: (error) => {
          console.error('Lỗi khi đánh dấu đã đọc:', error);
          setMarkAllError('Không thể đánh dấu thông báo đã đọc. Vui lòng thử lại.');
        },
        getSupportCase: supportCasesApi.getMine,
      });
      if (!target) return;

      if (target.name === 'CustomerBookingDetail') {
        navigation.navigate('CustomerBookingDetail', target.params);
      } else {
        navigation.navigate('CustomerOrderDetail', target.params);
      }
    } catch (error) {
      // Never guess a destination from an inaccessible or stale reference.
      console.error('Không thể mở nội dung từ thông báo:', error);
    } finally {
      if (mayNeedAsyncResolution) {
        setResolvingReferenceId((current) => current === item.id ? null : current);
      }
    }
  };

  /** Compact timestamp: same-day drops the date, otherwise skips the year/seconds noise. */
  const formatNotificationTime = (iso: string): string => {
    const date = new Date(iso);
    const now = new Date();
    const time = vnTimeString(date, { hour: '2-digit', minute: '2-digit' });
    const sameDay = isSameVnDay(date, now);
    if (sameDay) return time;
    const day = vnDateString(date, { day: '2-digit', month: '2-digit' });
    return `${day} ${time}`;
  };

  const renderNotificationIcon = (type?: string) => {
    switch (type) {
      case 'BOOKING':
        return <Ionicons name="briefcase-outline" size={24} color={colors.primary} />;
      case 'PAYMENT':
        return <Ionicons name="cash-outline" size={24} color={colors.success} />;
      case 'PROMOTION':
        return <Ionicons name="pricetag-outline" size={24} color="#EA580C" />;
      // Kỹ thuật viên chưa xuất phát, đơn có thể tự huỷ: cảnh báo, mở đơn.
      case 'ORDER_DEPARTURE_WARNING':
        return <Ionicons name="warning-outline" size={24} color={colors.tone.danger.fg} />;
      // Không ai nhận lời mời: mở yêu cầu đặt lịch để chọn kỹ thuật viên khác.
      case 'BOOKING_MATCHING_EXHAUSTED':
        return <Ionicons name="people-outline" size={24} color={colors.tone.warning.fg} />;
      default:
        return <Ionicons name="notifications-outline" size={24} color="#7C3AED" />;
    }
  };

  const renderIconBackground = (type?: string) => {
    switch (type) {
      case 'BOOKING':
        return colors.primaryTint; // Blue
      case 'PAYMENT':
        return '#D1FAE5'; // Green
      case 'PROMOTION':
        return '#FFEDD5'; // Orange
      case 'ORDER_DEPARTURE_WARNING':
        return colors.tone.danger.bg;
      case 'BOOKING_MATCHING_EXHAUSTED':
        return colors.tone.warning.bg;
      default:
        return '#EDE9FE'; // Purple
    }
  };

  const renderItem = ({ item }: { item: CustomerNotificationItem }) => {
    const isUnread = item.isRead === false;
    
    return (
      <TouchableOpacity
        style={[
          styles.card,
          isUnread && styles.unreadCard,
          resolvingReferenceId === item.id && { opacity: 0.7 },
        ]}
        activeOpacity={0.7}
        disabled={resolvingReferenceId === item.id}
        accessibilityRole="button"
        accessibilityLabel={`${isUnread ? 'Chưa đọc' : 'Đã đọc'}. ${item.title || 'Thông báo mới'}. ${item.body || item.message || ''}`}
        accessibilityState={{ busy: resolvingReferenceId === item.id, disabled: resolvingReferenceId === item.id }}
        accessibilityHint="Mở nội dung liên quan nếu thông báo có liên kết hợp lệ"
        onPress={() => void onNotificationPress(item)}
      >
        <View style={[styles.iconContainer, { backgroundColor: renderIconBackground(item.type) }]}>
          {renderNotificationIcon(item.type)}
          {isUnread && <View style={styles.unreadDot} />}
        </View>
        <View style={styles.cardContent}>
          <View style={styles.cardTopRow}>
            <Text style={[styles.title, isUnread && styles.unreadText]} numberOfLines={2} ellipsizeMode="tail">
              {item.title || 'Thông báo mới'}
            </Text>
            {!!item.createdAt && (
              <Text style={styles.timeText}>{formatNotificationTime(item.createdAt)}</Text>
            )}
          </View>
          <Text style={styles.desc} numberOfLines={2}>
            {item.body || item.message || 'Bạn có một thông báo từ FixHome.'}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderEmpty = () => {
    if (loading) return null;
    if (loadError && notifications.length === 0) {
      return (
        <View style={styles.emptyContainer} accessibilityRole="alert">
          <View style={styles.emptyIconCircle}>
            <MaterialCommunityIcons name="wifi-off" size={64} color={colors.muted} />
          </View>
          <Text style={styles.emptyTitle}>Không tải được thông báo</Text>
          <Text style={styles.emptyDesc}>{loadError}</Text>
          <TouchableOpacity
            onPress={onRefresh}
            disabled={refreshing}
            accessibilityRole="button"
            style={styles.retryBtn}
          >
            <Text style={styles.retryText}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      );
    }
    if (unreadOnly && notifications.length > 0) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>Không có thông báo chưa đọc</Text>
        </View>
      );
    }
    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIconCircle}>
          <MaterialCommunityIcons name="bell-sleep-outline" size={64} color={colors.muted} />
        </View>
        <Text style={styles.emptyTitle}>Chưa có thông báo nào</Text>
        <Text style={styles.emptyDesc}>
          Khi có cập nhật về lịch hẹn, đơn sửa chữa hoặc yêu cầu hỗ trợ, thông báo sẽ hiển thị tại đây.
        </Text>
      </View>
    );
  };

  const renderFooter = () => {
    if (loadingMore) {
      return (
        <View style={styles.loadMoreFooter}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      );
    }
    if (loadMoreError) {
      return (
        <View style={styles.loadMoreFooter} accessibilityRole="alert">
          <Text style={styles.errorText}>{loadMoreError}</Text>
          <TouchableOpacity onPress={() => void onLoadMore()} accessibilityRole="button" accessibilityLabel="Thử tải thêm thông báo" style={styles.inlineRetryBtn}>
            <Text style={styles.retryText}>Thử tải lại</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return null;
  };

  // PO 18/10/2026: a new notification joins the list as it arrives.
  useLiveRefresh(['notification:new'], () => { if (!loadingMoreRef.current) void fetchNotifications(); }, undefined, { pollMs: 60_000 });

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
      
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle} accessibilityRole="header">Thông báo</Text>
          {!loading && <Text style={styles.headerSubtitle}>{loadedUnreadCount} chưa đọc · {notifications.length} đã tải</Text>}

        </View>
        <TouchableOpacity
          style={[styles.markAllBtn, markingAll && { opacity: 0.6 }]}
          activeOpacity={0.7}
          onPress={onMarkAllRead}
          disabled={markingAll}
          accessibilityRole="button"
          accessibilityLabel="Đánh dấu tất cả thông báo đã đọc"
          accessibilityState={{ disabled: markingAll, busy: markingAll }}
        >
          <Ionicons name="checkmark-done-outline" size={18} color={colors.primary} />
          <Text style={styles.markAllText}>Đã đọc tất cả</Text>
        </TouchableOpacity>
      </View>

      {!!markAllError && <Text style={styles.markAllError} accessibilityRole="alert">{markAllError}</Text>}
      {!loading && notifications.length > 0 && (
        <View style={styles.filterRow}>
          {([[false, 'Tất cả'], [true, `Chưa đọc (${loadedUnreadCount})`]] as const).map(([value, label]) => (
            <TouchableOpacity
              key={label}
              testID={value ? 'notifications-filter-unread' : 'notifications-filter-all'}
              style={[styles.filterChip, unreadOnly === value && styles.filterChipActive]}
              onPress={() => setUnreadOnly(value)}
              accessibilityRole="tab"
              accessibilityState={{ selected: unreadOnly === value }}
            >
              <Text style={[styles.filterChipText, unreadOnly === value && styles.filterChipTextActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      {loading && !refreshing ? (
        <View style={styles.loadingWrap}>
          <Text style={styles.loadingText}>Đang tải thông báo…</Text>
          <CustomerSkeleton variant="notification" rows={4} />
        </View>
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(item, index) => item.id?.toString() || index.toString()}
          renderItem={renderItem}
          ListHeaderComponent={
            loadError && notifications.length > 0 ? (
              <View style={styles.errorBanner} accessibilityRole="alert">
                <Text style={styles.errorText}>{loadError}</Text>
                <TouchableOpacity onPress={onRefresh} disabled={refreshing} accessibilityRole="button" accessibilityLabel="Thử tải lại thông báo" style={styles.inlineRetryBtn}>
                  <Text style={styles.retryText}>Thử lại</Text>
                </TouchableOpacity>
              </View>
            ) : null
          }
          ListEmptyComponent={renderEmpty}
          ListFooterComponent={renderFooter}
          onEndReached={() => void onLoadMore()}
          onEndReachedThreshold={0.4}
          contentContainerStyle={[styles.listContent, { paddingBottom: 88 + Math.max(insets.bottom, 16) }]}
          showsVerticalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
          }
        />
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
  headerCopy: { flex: 1, minWidth: 0, gap: 4 },
  headerOverline: { fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 1, color: colors.textSecondary },
  headerSubtitle: { fontSize: 12, lineHeight: 17, color: colors.textSecondary },
  unreadPill: { alignSelf: 'flex-start', backgroundColor: colors.primarySoft, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginTop: 2 },
  unreadPillText: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: colors.primaryStrong ?? colors.primary },
  markAllError: { fontSize: 13, lineHeight: 19, color: colors.error, paddingHorizontal: 16, paddingVertical: 12 },
  loadingWrap: { flex: 1, paddingTop: 16 },
  loadingText: { fontSize: 14, lineHeight: 20, color: colors.textSecondary, paddingHorizontal: 16, paddingBottom: 8 },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
  },
  markAllBtn: {
    minHeight: 44,
    flexShrink: 0,
    justifyContent: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  filterChip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  filterChipActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  filterChipText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  filterChipTextActive: { color: colors.primaryStrong ?? colors.primary },
  markAllText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
  },
  inlineRetryBtn: { minHeight: 44, minWidth: 88, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 12, borderRadius: 10 },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: 16,
    paddingBottom: 100, // Extra padding for tab bar
  },
  card: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    minHeight: 76,
    shadowColor: colors.border,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.01,
    shadowRadius: 8,
    elevation: 0,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  unreadCard: {
    backgroundColor: colors.background,
    borderColor: colors.border,
  },
  iconContainer: {
    width: 52,
    height: 52,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    position: 'relative',
  },
  unreadDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.error,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  cardContent: {
    minWidth: 0,
    flex: 1,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 4,
  },
  title: {
    flexShrink: 1,
    lineHeight: 22,
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  unreadText: {
    fontWeight: '800',
    color: colors.text,
  },
  desc: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  timeText: {
    flexShrink: 0,
    lineHeight: 16,
    fontSize: 12,
    color: colors.muted,
    fontWeight: '500',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 60,
  },
  emptyIconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  emptyDesc: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 32,
    lineHeight: 20,
  },
  errorBanner: {
    padding: 12,
    marginBottom: 12,
    gap: 8,
    alignItems: 'center',
    backgroundColor: colors.tone.warning.bg,
    borderRadius: 8,
  },
  errorText: {

    fontSize: 13,
    color: colors.primary,
    textAlign: 'center',
    lineHeight: 18,
  },
  retryBtn: {
    minHeight: 44,
    minWidth: 104,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
    marginTop: 8,
  },
  retryText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
  },
  loadMoreFooter: {
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
});


