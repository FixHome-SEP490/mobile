import { useAppTheme } from '../../constants/theme';
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  StatusBar
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useScrollHideTabBar } from '../../hooks/useScrollHideTabBar';
import CustomerSkeleton from '../../components/customer/CustomerSkeleton';
import { notificationsApi, NotificationItem } from '../../api/notifications.api';
import { isSameVnDay, vnDateString, vnTimeString } from '../../utils/vn-time';

export default function CustomerNotificationsScreen() {
  const { colors, spacing, fontSize, isDark } = useAppTheme();
  const styles = getStyles(colors, spacing, fontSize);
  const handleScroll = useScrollHideTabBar();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await notificationsApi.getNotifications(1, 20); // Note: Backend page usually starts at 1, not 0
      if (res.success) {
        if (res.data && Array.isArray(res.data.data)) {
          setNotifications(res.data.data);
        } else if (Array.isArray(res.data)) {
          setNotifications(res.data);
        } else {
          setNotifications([]);
        }
        setLoadError(null);
      } else {
        // A failed load is not an empty inbox: keep the last list and show retry.
        setLoadError('Không thể tải thông báo. Kiểm tra kết nối rồi thử lại.');
      }
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
    setRefreshing(true);
    setLoadError(null);
    void fetchNotifications();
  };

  const [markingAll, setMarkingAll] = useState(false);

  const onMarkAllRead = async () => {
    if (markingAll) return;
    setMarkingAll(true);
    try {
      await notificationsApi.readAll();
      setNotifications((prev) => prev.map((item) => ({ ...item, isRead: true })));
    } catch (error) {
      console.error('Lỗi khi đánh dấu đã đọc tất cả:', error);
    } finally {
      setMarkingAll(false);
    }
  };

  const onNotificationPress = (item: NotificationItem) => {
    if (item.isRead !== false || !item.id) return;
    setNotifications((prev) =>
      prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n)),
    );
    notificationsApi.readNotification(item.id).catch((error) => {
      console.error('Lỗi khi đánh dấu đã đọc:', error);
    });
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
      default:
        return '#EDE9FE'; // Purple
    }
  };

  const renderItem = ({ item }: { item: NotificationItem }) => {
    const isUnread = item.isRead === false;
    
    return (
      <TouchableOpacity
        style={[styles.card, isUnread && styles.unreadCard]}
        activeOpacity={0.7}
        onPress={() => onNotificationPress(item)}
      >
        <View style={[styles.iconContainer, { backgroundColor: renderIconBackground(item.type) }]}>
          {renderNotificationIcon(item.type)}
          {isUnread && <View style={styles.unreadDot} />}
        </View>
        <View style={styles.cardContent}>
          <View style={styles.cardTopRow}>
            <Text style={[styles.title, isUnread && styles.unreadText]} numberOfLines={1}>
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
    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIconCircle}>
          <MaterialCommunityIcons name="bell-sleep-outline" size={64} color={colors.muted} />
        </View>
        <Text style={styles.emptyTitle}>Chưa có thông báo nào</Text>
        <Text style={styles.emptyDesc}>
          Khi có cập nhật về dịch vụ hoặc ưu đãi, thông báo sẽ hiển thị tại đây.
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
      
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Thông báo</Text>
        <TouchableOpacity
          style={[styles.markAllBtn, markingAll && { opacity: 0.6 }]}
          activeOpacity={0.7}
          onPress={onMarkAllRead}
          disabled={markingAll}
        >
          <Ionicons name="checkmark-done-outline" size={18} color={colors.primary} />
          <Text style={styles.markAllText}>Đã đọc tất cả</Text>
        </TouchableOpacity>
      </View>

      {loading && !refreshing ? (
        <CustomerSkeleton variant="notification" rows={4} />
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item, index) => item.id?.toString() || index.toString()}
          renderItem={renderItem}
          ListHeaderComponent={
            loadError && notifications.length > 0 ? (
              <View style={styles.errorBanner} accessibilityRole="alert">
                <Text style={styles.errorText}>{loadError}</Text>
                <TouchableOpacity onPress={onRefresh} disabled={refreshing} accessibilityRole="button">
                  <Text style={styles.retryText}>Thử lại</Text>
                </TouchableOpacity>
              </View>
            ) : null
          }
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={styles.listContent}
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
  markAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  markAllText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
  },
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
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
    marginRight: 14,
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
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#334155',
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
    fontSize: 11,
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
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#334155',
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
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
  },
  errorText: {
    fontSize: 13,
    color: colors.primary,
    textAlign: 'center',
    lineHeight: 18,
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
});


