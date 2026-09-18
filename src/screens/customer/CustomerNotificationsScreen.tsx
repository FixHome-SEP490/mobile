import React, { useEffect, useState, useCallback } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  FlatList, 
  TouchableOpacity, 
  ActivityIndicator,
  RefreshControl,
  StatusBar
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useScrollHideTabBar } from '../../hooks/useScrollHideTabBar';
import { notificationsApi, NotificationItem } from '../../api/notifications.api';

export default function CustomerNotificationsScreen() {
  const handleScroll = useScrollHideTabBar();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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
      } else {
        setNotifications([]);
      }
    } catch (error) {
      console.error('Lỗi khi tải thông báo:', error);
      // Fallback empty on error
      setNotifications([]);
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
    void fetchNotifications();
  };

  const renderNotificationIcon = (type?: string) => {
    switch (type) {
      case 'BOOKING':
        return <Ionicons name="briefcase-outline" size={24} color="#2563EB" />;
      case 'PAYMENT':
        return <Ionicons name="cash-outline" size={24} color="#059669" />;
      case 'PROMOTION':
        return <Ionicons name="pricetag-outline" size={24} color="#EA580C" />;
      default:
        return <Ionicons name="notifications-outline" size={24} color="#7C3AED" />;
    }
  };

  const renderIconBackground = (type?: string) => {
    switch (type) {
      case 'BOOKING':
        return '#DBEAFE'; // Blue
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
      >
        <View style={[styles.iconContainer, { backgroundColor: renderIconBackground(item.type) }]}>
          {renderNotificationIcon(item.type)}
          {isUnread && <View style={styles.unreadDot} />}
        </View>
        <View style={styles.cardContent}>
          <Text style={[styles.title, isUnread && styles.unreadText]} numberOfLines={1}>
            {item.title || 'Thông báo mới'}
          </Text>
          <Text style={styles.desc} numberOfLines={2}>
            {item.body || item.message || 'Bạn có một thông báo từ FixHome.'}
          </Text>
          {item.createdAt && (
            <Text style={styles.timeText}>{new Date(item.createdAt).toLocaleString('vi-VN')}</Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderEmpty = () => {
    if (loading) return null;
    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIconCircle}>
          <MaterialCommunityIcons name="bell-sleep-outline" size={64} color="#94A3B8" />
        </View>
        <Text style={styles.emptyTitle}>Chưa có thông báo nào</Text>
        <Text style={styles.emptyDesc}>
          Khi có cập nhật về dịch vụ hoặc ưu đãi, thông báo sẽ hiển thị tại đây.
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />
      
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Thông báo</Text>
        <TouchableOpacity style={styles.markAllBtn} activeOpacity={0.7}>
          <Ionicons name="checkmark-done-outline" size={18} color="#2563EB" />
          <Text style={styles.markAllText}>Đã đọc tất cả</Text>
        </TouchableOpacity>
      </View>

      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item, index) => item.id?.toString() || index.toString()}
          renderItem={renderItem}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2563EB']} />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
  },
  markAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  markAllText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2563EB',
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
    backgroundColor: '#FFFFFF',
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
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
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
    backgroundColor: '#EF4444',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  cardContent: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 4,
  },
  unreadText: {
    fontWeight: '800',
    color: '#0F172A',
  },
  desc: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
    marginBottom: 6,
  },
  timeText: {
    fontSize: 11,
    color: '#94A3B8',
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
    backgroundColor: '#F1F5F9',
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
    color: '#64748B',
    textAlign: 'center',
    paddingHorizontal: 32,
    lineHeight: 20,
  },
});
