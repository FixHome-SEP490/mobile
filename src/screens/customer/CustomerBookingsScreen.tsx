import React, { useState, useEffect } from 'react';
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
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../types';
import { useAppTheme } from '../../constants/theme';
import { useScrollHideTabBar } from '../../hooks/useScrollHideTabBar';
import { ordersApi, type ServiceOrderItem, type CanonicalOrderStatus } from '../../api/orders.api';

type TabType = 'all' | 'in_progress' | 'completed';

export default function CustomerBookingsScreen() {
  const { colors, spacing, fontSize, isDark } = useAppTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const styles = getStyles(colors, spacing, fontSize);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [orders, setOrders] = useState<ServiceOrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const handleScroll = useScrollHideTabBar();

  useEffect(() => {
    let mounted = true;
    ordersApi
      .getMyOrders()
      .then((data) => {
        if (mounted) {
          setOrders(data || []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (mounted) {
          setOrders([]);
          setLoading(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      const data = await ordersApi.getMyOrders();
      setOrders(data || []);
    } catch {
      setOrders([]);
    } finally {
      setRefreshing(false);
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

  const filteredOrders = orders.filter((order) => {
    const s = String(order.status).toUpperCase();
    if (activeTab === 'in_progress') {
      if (!['ACCEPTED', 'EN_ROUTE', 'UNDER_REPAIR', 'IN_PROGRESS'].includes(s)) return false;
    } else if (activeTab === 'completed') {
      if (s !== 'COMPLETED') return false;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const codeMatch = order.code?.toLowerCase().includes(q);
      const serviceMatch = order.serviceName?.toLowerCase().includes(q);
      const techMatch = order.technician?.fullName?.toLowerCase().includes(q);
      return codeMatch || serviceMatch || techMatch;
    }

    return true;
  });

  const handleOrderPress = (order: ServiceOrderItem) => {
    const s = String(order.status).toUpperCase();
    if (s === 'EN_ROUTE') {
      navigation.navigate('CustomerTracking');
    } else if (s === 'UNDER_REPAIR' || s === 'IN_PROGRESS') {
      if (order.quotation && order.quotation.status === 'SENT') {
        navigation.navigate('CustomerQuotation');
      } else {
        navigation.navigate('CustomerUnderRepair');
      }
    } else if (s === 'COMPLETED') {
      navigation.navigate('CustomerCompleted');
    } else {
      navigation.navigate('CustomerTracking');
    }
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
            Tất cả ({orders.length})
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
      ) : filteredOrders.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="receipt-outline" size={56} color="#CBD5E1" />
          <Text style={styles.emptyTitle}>Chưa có đơn dịch vụ nào</Text>
          <Text style={styles.emptyDesc}>
            {searchQuery
              ? 'Không tìm thấy đơn phù hợp với từ khóa.'
              : 'Đặt lịch ngay để thợ FixHome kiểm tra tại nhà bạn.'}
          </Text>
          <TouchableOpacity
            style={[styles.bookNowBtn, { backgroundColor: colors.primary }]}
            onPress={() => navigation.navigate('CustomerServices')}
          >
            <Ionicons name="add-circle-outline" size={18} color="colors.surface" />
            <Text style={styles.bookNowText}>Đặt dịch vụ mới</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {filteredOrders.map((order) => {
            const badge = getStatusBadge(order.status);
            const total = (order.grandTotal || (order.laborTotal || 0) + (order.partsTotal || 0)).toLocaleString('vi-VN');
            const dateStr = order.createdAt
              ? new Date(order.createdAt).toLocaleDateString('vi-VN')
              : 'Gần đây';

            return (
              <TouchableOpacity
                key={order.id || order.code}
                style={styles.card}
                onPress={() => handleOrderPress(order)}
                activeOpacity={0.8}
              >
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
                      {dateStr} · {total}đ
                    </Text>
                    {order.technician?.fullName && (
                      <Text style={styles.meta}>KTV {order.technician.fullName}</Text>
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
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

