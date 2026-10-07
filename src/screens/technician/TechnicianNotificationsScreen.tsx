import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StatusBar,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertTriangle, Bell, BellOff, Briefcase, CheckCheck, Tag, Wallet } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../types';
import { useAppTheme, type ToneName } from '../../constants/theme';
import { notificationsApi, type NotificationItem } from '../../api/notifications.api';
import { useBadgeStore } from '../../store/badge.store';
import CustomerSkeleton from '../../components/customer/CustomerSkeleton';
import {
  formatNotificationTime,
  groupNotificationsByDay,
  mergeNotificationPage,
  technicianNotificationOrderId,
} from './technician-notifications';

const PAGE_SIZE = 20;
// Floating GlassTabBar: 64pt pill + breathing room, plus the bottom inset (min 16).
const TAB_BAR_CLEARANCE = 64 + 16;
const LOAD_ERROR = 'Không thể tải thông báo. Kiểm tra kết nối rồi thử lại.';

const TYPE_VIEW: Record<string, { tone: ToneName; Icon: typeof Bell }> = {
  BOOKING: { tone: 'repair', Icon: Briefcase },
  PAYMENT: { tone: 'success', Icon: Wallet },
  PROMOTION: { tone: 'neutral', Icon: Tag },
  // Giờ hẹn đã tới mà chưa bấm "Đang đến": cảnh báo, chạm để mở đơn.
  ORDER_DEPARTURE_WARNING: { tone: 'danger', Icon: AlertTriangle },
};
const DEFAULT_VIEW = { tone: 'info' as ToneName, Icon: Bell };

function pageItems(res: Awaited<ReturnType<typeof notificationsApi.getNotifications>>): NotificationItem[] | null {
  if (!res.success) return null;
  if (res.data && Array.isArray(res.data.data)) return res.data.data;
  if (Array.isArray(res.data)) return res.data;
  return [];
}

export default function TechnicianNotificationsScreen() {
  const { colors, isDark } = useAppTheme();
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const unreadCount = useBadgeStore((s) => s.unreadNotifications);
  const setUnreadCount = useBadgeStore((s) => s.setUnreadNotifications);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Day grouping is evaluated at fetch time (render must stay pure).
  const [loadedAt, setLoadedAt] = useState(0);
  const pageRef = useRef(1);

  const syncUnreadCount = useCallback(() => {
    notificationsApi.getCountUnread().then(setUnreadCount).catch(() => {});
  }, [setUnreadCount]);

  const fetchFirstPage = useCallback(async () => {
    try {
      const items = pageItems(await notificationsApi.getNotifications(1, PAGE_SIZE));
      if (items === null) {
        setLoadError(LOAD_ERROR);
      } else {
        pageRef.current = 1;
        setNotifications(items);
        setHasMore(items.length >= PAGE_SIZE);
        setLoadedAt(Date.now());
        setLoadError(null);
        syncUnreadCount();
      }
    } catch {
      // A failed load is not an empty inbox: keep the last list and show retry.
      setLoadError(LOAD_ERROR);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [syncUnreadCount]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    void fetchFirstPage();
  }, [fetchFirstPage]);

  const onRefresh = () => {
    setRefreshing(true);
    void fetchFirstPage();
  };

  const onEndReached = async () => {
    if (!hasMore || loadingMore || loading || refreshing) return;
    setLoadingMore(true);
    try {
      const next = pageRef.current + 1;
      const items = pageItems(await notificationsApi.getNotifications(next, PAGE_SIZE));
      if (items === null) return;
      pageRef.current = next;
      setNotifications((prev) => mergeNotificationPage(prev, items));
      setHasMore(items.length >= PAGE_SIZE);
    } catch {
      // Keep what is loaded; scrolling to the end again retries.
    } finally {
      setLoadingMore(false);
    }
  };

  const [markingAll, setMarkingAll] = useState(false);
  const localUnread = notifications.filter((n) => n.isRead === false).length;
  const totalUnread = Math.max(unreadCount, localUnread);

  const onMarkAllRead = async () => {
    if (markingAll) return;
    setMarkingAll(true);
    try {
      await notificationsApi.readAll();
      setNotifications((prev) => prev.map((item) => ({ ...item, isRead: true })));
      setUnreadCount(0);
    } catch {
      setLoadError('Không thể đánh dấu đã đọc. Vui lòng thử lại.');
    } finally {
      setMarkingAll(false);
    }
  };

  const setRead = (id: string, isRead: boolean) =>
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead } : n)));

  const onNotificationPress = (item: NotificationItem) => {
    if (item.isRead === false && item.id) {
      const id = item.id;
      setRead(id, true);
      setUnreadCount(unreadCount - 1);
      notificationsApi.readNotification(id).catch(() => {
        // Roll back so the badge never claims something the server has not recorded.
        setRead(id, false);
        syncUnreadCount();
      });
    }
    const serviceOrderId = technicianNotificationOrderId(item);
    if (serviceOrderId) navigation.navigate('TechnicianOrderDetail', { serviceOrderId });
  };

  const sections = useMemo(() => groupNotificationsByDay(notifications, loadedAt), [notifications, loadedAt]);

  const renderItem = ({ item }: { item: NotificationItem }) => {
    const isUnread = item.isRead === false;
    const { tone, Icon } = TYPE_VIEW[item.type ?? ''] ?? DEFAULT_VIEW;
    const title = item.title || 'Thông báo mới';
    const body = item.body || item.message || 'Bạn có một thông báo từ FixHome.';
    return (
      <TouchableOpacity
        style={[styles.row, isUnread && styles.rowUnread]}
        activeOpacity={0.7}
        onPress={() => onNotificationPress(item)}
        accessibilityRole="button"
        accessibilityLabel={`${isUnread ? 'Chưa đọc. ' : ''}${title}. ${body}`}
      >
        <View style={[styles.iconTile, { backgroundColor: colors.tone[tone].bg }]}>
          <Icon size={20} color={colors.tone[tone].fg} strokeWidth={1.75} />
        </View>
        <View style={styles.rowContent}>
          <View style={styles.rowTop}>
            <Text style={[styles.title, isUnread && styles.titleUnread]} numberOfLines={1}>
              {title}
            </Text>
            {!!item.createdAt && (
              <Text style={styles.timeText}>{formatNotificationTime(item.createdAt, loadedAt)}</Text>
            )}
          </View>
          <Text style={styles.desc} numberOfLines={2}>{body}</Text>
        </View>
        {isUnread && <View style={styles.unreadDot} />}
      </TouchableOpacity>
    );
  };

  const renderEmpty = () => {
    if (loading) return null;
    if (loadError) {
      return (
        <View style={styles.empty}>
          <AlertTriangle size={48} color={colors.error} strokeWidth={1.5} />
          <Text style={styles.emptyTitle}>Không thể tải thông báo</Text>
          <Text style={styles.emptyDesc}>{loadError}</Text>
          <TouchableOpacity onPress={onRefresh} style={styles.textBtn} accessibilityRole="button">
            <Text style={styles.textBtnLabel}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <View style={styles.empty}>
        <BellOff size={56} color={colors.muted} strokeWidth={1.5} />
        <Text style={styles.emptyTitle}>Chưa có thông báo nào</Text>
        <Text style={styles.emptyDesc}>
          Khi có lời mời nhận việc hoặc cập nhật đơn, thông báo sẽ hiển thị tại đây.
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.surface} />

      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle} accessibilityRole="header">Thông báo</Text>
          {!loading && totalUnread > 0 && (
            <Text style={styles.headerSubtitle}>{totalUnread} chưa đọc</Text>
          )}
        </View>
        {totalUnread > 0 && (
          <TouchableOpacity
            style={[styles.markAllBtn, markingAll && styles.disabled]}
            activeOpacity={0.7}
            onPress={onMarkAllRead}
            disabled={markingAll}
            accessibilityRole="button"
            accessibilityLabel="Đánh dấu đã đọc tất cả"
          >
            <CheckCheck size={18} color={colors.primaryStrong} strokeWidth={1.75} />
            <Text style={styles.markAllText}>Đã đọc tất cả</Text>
          </TouchableOpacity>
        )}
      </View>

      {loadError && notifications.length > 0 && (
        <View style={[styles.errorBanner, { backgroundColor: colors.tone.warning.bg }]} accessibilityRole="alert">
          <Text style={[styles.errorBannerText, { color: colors.tone.warning.text }]}>{loadError}</Text>
          <TouchableOpacity onPress={onRefresh} style={styles.textBtn} accessibilityRole="button">
            <Text style={[styles.textBtnLabel, { color: colors.tone.warning.text }]}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      )}

      {loading && !refreshing ? (
        <View style={styles.skeletonWrap}>
          <CustomerSkeleton variant="notification" />
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item, index) => item.id?.toString() || index.toString()}
          renderItem={renderItem}
          renderSectionHeader={({ section }) => <Text style={styles.sectionTitle}>{section.title}</Text>}
          stickySectionHeadersEnabled={false}
          ListEmptyComponent={renderEmpty}
          ListFooterComponent={loadingMore ? <ActivityIndicator style={styles.footerSpinner} color={colors.primaryStrong} /> : null}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          contentContainerStyle={[
            sections.length === 0 && styles.emptyFlex,
            { paddingBottom: TAB_BAR_CLEARANCE + Math.max(insets.bottom, 16) },
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primaryStrong]} />
          }
        />
      )}
    </SafeAreaView>
  );
}

const getStyles = (colors: ReturnType<typeof useAppTheme>['colors']) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  headerText: { flex: 1 },
  headerTitle: { fontSize: 24, lineHeight: 32, fontWeight: '700', color: colors.text },
  headerSubtitle: { fontSize: 14, lineHeight: 20, color: colors.textSecondary, marginTop: 2 },
  markAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 22,
    backgroundColor: colors.primarySoft,
  },
  markAllText: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.primaryStrong },
  disabled: { opacity: 0.6 },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    paddingLeft: 12,
    borderRadius: 14,
  },
  errorBannerText: { flex: 1, fontSize: 14, lineHeight: 20 },
  skeletonWrap: { flex: 1, padding: 16 },
  sectionTitle: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    color: colors.textSecondary,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    backgroundColor: colors.surface,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 72,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  rowUnread: { backgroundColor: colors.primarySoft },
  iconTile: { width: 40, height: 40, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  rowContent: { flex: 1, gap: 2 },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  title: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: '500', color: colors.text },
  titleUnread: { fontWeight: '700' },
  desc: { fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  timeText: { fontSize: 12, lineHeight: 16, fontWeight: '500', color: colors.textSecondary },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primaryStrong },
  emptyFlex: { flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  emptyTitle: { fontSize: 18, lineHeight: 26, fontWeight: '700', color: colors.text, marginTop: 8 },
  emptyDesc: { fontSize: 14, lineHeight: 20, color: colors.textSecondary, textAlign: 'center' },
  textBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
  textBtnLabel: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.primaryStrong },
  footerSpinner: { paddingVertical: 16 },
});
