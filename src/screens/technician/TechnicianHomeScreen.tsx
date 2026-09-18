import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../store';
import { LinearGradient } from 'expo-linear-gradient';
import { ordersApi } from '../../api/orders.api';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList, TechnicianTabParamList } from '../../types';
import { useChatUnreadCount } from '../../hooks/useChatUnreadCount';
import { useScrollHideTabBar } from '../../hooks/useScrollHideTabBar';

export default function TechnicianHomeScreen() {
  const { user } = useAuthStore();
  const navigation = useNavigation<BottomTabNavigationProp<TechnicianTabParamList>>();
  // Chat lives on the root stack, not in the technician tab set.
  const rootNavigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const chatUnread = useChatUnreadCount();
  const handleScroll = useScrollHideTabBar();
  const [completedCount, setCompletedCount] = useState(0);
  const [earnings, setEarnings] = useState(0);
  const [activeCount, setActiveCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const loadStats = async () => {
    try {
      const orders = await ordersApi.getMyOrders();
      if (Array.isArray(orders)) {
        const completed = orders.filter((o) => String(o.status).toUpperCase() === 'COMPLETED');
        const active = orders.filter((o) =>
          ['ACCEPTED', 'EN_ROUTE', 'UNDER_REPAIR', 'IN_PROGRESS'].includes(String(o.status).toUpperCase())
        );
        const totalEarn = completed.reduce((sum, o) => sum + (o.laborTotal || o.grandTotal || 0), 0);
        setCompletedCount(completed.length);
        setEarnings(totalEarn);
        setActiveCount(active.length);
      }
    } catch {
      // Keep defaults
    }
  };

  useEffect(() => {
    let mounted = true;
    ordersApi
      .getMyOrders()
      .then((orders) => {
        if (!mounted || !Array.isArray(orders)) return;
        const completed = orders.filter((o) => String(o.status).toUpperCase() === 'COMPLETED');
        const active = orders.filter((o) =>
          ['ACCEPTED', 'EN_ROUTE', 'UNDER_REPAIR', 'IN_PROGRESS'].includes(String(o.status).toUpperCase())
        );
        const totalEarn = completed.reduce((sum, o) => sum + (o.laborTotal || o.grandTotal || 0), 0);
        setCompletedCount(completed.length);
        setEarnings(totalEarn);
        setActiveCount(active.length);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadStats();
    setRefreshing(false);
  };

  const targetPercentage = Math.min(Math.round((completedCount / 20) * 100), 100);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.avatarContainer}>
            <Ionicons name="person" size={24} color="#2563EB" />
          </View>
          <View>
            <Text style={styles.greetingText}>Xin chào 👋</Text>
            <Text style={styles.headerName}>{user?.fullName || 'Kỹ thuật viên'}</Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          {activeCount > 0 && (
            <TouchableOpacity
              style={styles.activeJobBadge}
              onPress={() => navigation.navigate('Jobs')}
              activeOpacity={0.8}
            >
              <Ionicons name="flash" size={14} color="#FFFFFF" />
              <Text style={styles.activeJobBadgeText}>{activeCount} đơn chờ</Text>
            </TouchableOpacity>
          )}

          {/* Messages (spec 8.6: booking chat with the customer) */}
          <TouchableOpacity
            style={styles.headerIconBtn}
            onPress={() => rootNavigation.navigate('ChatList')}
            activeOpacity={0.8}
          >
            <Ionicons name="chatbubble-ellipses-outline" size={22} color="#0F172A" />
            {chatUnread > 0 && (
              <View style={styles.chatBadge}>
                <Text style={styles.chatBadgeText}>
                  {chatUnread > 9 ? '9+' : chatUnread}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        {/* Tổng quan tuần này */}
        <View style={styles.sectionHeader}>
          <Ionicons name="bar-chart" size={20} color="#2563EB" />
          <Text style={styles.sectionTitle}>Tổng quan tuần này</Text>
        </View>

        <View style={styles.overviewRow}>
          <LinearGradient colors={['#E0F2FE', '#F0F9FF']} style={styles.overviewCard}>
            <View style={styles.cardTopRow}>
              <View style={[styles.iconCircle, { backgroundColor: '#BAE6FD' }]}>
                <Ionicons name="wallet" size={16} color="#0284C7" />
              </View>
              <Text style={styles.cardLabel}>Thu nhập</Text>
            </View>
            <Text style={styles.cardValue}>
              {earnings.toLocaleString('vi-VN')} <Text style={styles.cardUnit}>đ</Text>
            </Text>
          </LinearGradient>

          <LinearGradient colors={['#FEF3C7', '#FFFBEB']} style={styles.overviewCard}>
            <View style={styles.cardTopRow}>
              <View style={[styles.iconCircle, { backgroundColor: '#FDE68A' }]}>
                <Ionicons name="checkmark" size={16} color="#D97706" />
              </View>
              <Text style={styles.cardLabel}>Hoàn thành</Text>
            </View>
            <Text style={styles.cardValue}>
              {completedCount} <Text style={styles.cardUnit}>đơn</Text>
            </Text>
          </LinearGradient>
        </View>

        {/* Mục tiêu tuần */}
        <View style={styles.targetContainer}>
          <View style={styles.targetRow}>
            <View style={styles.targetIcon}>
              <Ionicons name="calendar" size={14} color="#2563EB" />
            </View>
            <Text style={styles.targetLabel}>Mục tiêu tuần</Text>
            <Text style={styles.targetValue}>{completedCount}/20 đơn</Text>
          </View>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${targetPercentage}%` }]} />
          </View>
        </View>

        {/* Quick CTA to Jobs */}
        <TouchableOpacity
          style={styles.jobsShortcutBtn}
          onPress={() => navigation.navigate('Jobs')}
          activeOpacity={0.85}
        >
          <View style={styles.jobsShortcutIcon}>
            <Ionicons name="briefcase" size={20} color="#2563EB" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.jobsShortcutTitle}>Quản lý công việc</Text>
            <Text style={styles.jobsShortcutSubtitle}>
              {activeCount > 0 ? `Có ${activeCount} đơn đang cần bạn xử lý` : 'Xem danh sách việc nhận'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
        </TouchableOpacity>

        {/* Lịch sử hoạt động gần đây */}
        <View style={styles.sectionHeader}>
          <Ionicons name="time" size={20} color="#2563EB" />
          <Text style={styles.sectionTitle}>Hoạt động gần đây</Text>
        </View>
        <View style={styles.historyContainer}>
          {[1, 2, 3, 4, 5].map((item) => (
             <View key={item} style={styles.historyItem}>
               <View style={styles.historyIconBox}>
                 <Ionicons name="checkmark-circle" size={16} color="#10B981" />
               </View>
               <View style={styles.historyItemContent}>
                 <Text style={styles.historyItemTitle}>Hoàn thành đơn sửa máy lạnh</Text>
                 <Text style={styles.historyItemTime}>Hôm qua, 14:30 • Thu nhập: 250.000đ</Text>
               </View>
             </View>
          ))}
        </View>

        {/* Banner Cuối */}
        <LinearGradient colors={['#93C5FD', '#BFDBFE']} style={styles.bottomBanner}>
          <View style={{ flex: 1 }}>
            <Text style={styles.bottomBannerTitle}>Đua Top KTV FixHome</Text>
            <Text style={styles.bottomBannerSubtitle}>Hoàn thành xuất sắc nhiệm vụ nhận thưởng quý và nâng hạn mức nhận việc.</Text>
            <TouchableOpacity
              style={styles.joinBtn}
              onPress={() => navigation.navigate('Jobs')}
              activeOpacity={0.8}
            >
              <Text style={styles.joinBtnText}>Nhận việc ngay</Text>
              <Ionicons name="chevron-forward" size={14} color="#000" />
            </TouchableOpacity>
          </View>
          <Ionicons name="trophy" size={60} color="#EAB308" style={{ marginLeft: 8 }} />
        </LinearGradient>
        <View style={{ height: 80 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 44,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  greetingText: {
    fontSize: 12,
    color: '#64748B',
  },
  headerName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  chatBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: '#EF4444',
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  chatBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: 'bold',
  },
  activeJobBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#2563EB',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  activeJobBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  scrollContent: {
    padding: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  overviewRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  overviewCard: {
    flex: 1,
    padding: 16,
    borderRadius: 16,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  cardValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
  },
  cardUnit: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  targetContainer: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  targetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  targetIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#DBEAFE',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  targetLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  targetValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2563EB',
  },
  progressBarBg: {
    height: 8,
    backgroundColor: '#E2E8F0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#2563EB',
    borderRadius: 4,
  },
  jobsShortcutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  jobsShortcutIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  jobsShortcutTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 2,
  },
  jobsShortcutSubtitle: {
    fontSize: 13,
    color: '#64748B',
  },
  bottomBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    borderRadius: 16,
    marginTop: 8,
  },
  bottomBannerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E3A8A',
    marginBottom: 4,
  },
  bottomBannerSubtitle: {
    fontSize: 12,
    color: '#1E40AF',
    lineHeight: 16,
    marginBottom: 12,
  },
  joinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 4,
  },
  joinBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  guideContainer: {
    marginBottom: 20,
  },
  guideCard: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  guideImage: {
    width: 80,
    height: 80,
    backgroundColor: '#CBD5E1',
  },
  guideContent: {
    flex: 1,
    padding: 10,
    justifyContent: 'center',
  },
  guideTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 4,
  },
  guideDate: {
    fontSize: 11,
    color: '#64748B',
  },
  historyContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    marginBottom: 16,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  historyIconBox: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#D1FAE5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  historyItemContent: {
    flex: 1,
  },
  historyItemTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#0F172A',
    marginBottom: 2,
  },
  historyItemTime: {
    fontSize: 12,
    color: '#64748B',
  },
});
