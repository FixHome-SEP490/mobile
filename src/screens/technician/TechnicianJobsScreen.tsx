import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../constants/theme';
import { ordersApi, type ServiceOrderItem, type CanonicalOrderStatus } from '../../api/orders.api';

type JobTab = 'all' | 'pending' | 'in_progress';

export default function TechnicianJobsScreen() {
  const { colors } = useAppTheme();
  const [activeTab, setActiveTab] = useState<JobTab>('all');
  const [jobs, setJobs] = useState<ServiceOrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    ordersApi
      .getMyOrders()
      .then((data) => {
        if (mounted) {
          setJobs(data || []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (mounted) {
          setJobs([]);
          setLoading(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  const refreshJobs = async () => {
    try {
      const data = await ordersApi.getMyOrders();
      setJobs(data || []);
    } catch {
      setJobs([]);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshJobs();
    setRefreshing(false);
  };

  const handleEnRoute = async (orderId: string) => {
    setActionLoading(orderId);
    try {
      await ordersApi.enRoute(orderId);
      Alert.alert('Thành công', 'Đã cập nhật trạng thái: Đang di chuyển đến nhà khách hàng.');
      await refreshJobs();
    } catch (err: any) {
      Alert.alert('Lỗi', err?.response?.data?.message || 'Không thể cập nhật trạng thái.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCheckIn = async (orderId: string) => {
    void orderId;
    Alert.alert('Chưa hỗ trợ định vị', 'Vui lòng mở đơn trên Web tại địa chỉ sửa chữa để check-in bằng GPS.');
  };

  const getStatusBadge = (status: CanonicalOrderStatus) => {
    const s = String(status).toUpperCase();
    switch (s) {
      case 'ACCEPTED':
        return { label: 'Chờ di chuyển', bg: '#FEF3C7', color: '#D97706' };
      case 'EN_ROUTE':
        return { label: 'Đang trên đường', bg: '#DCFCE7', color: '#16A34A' };
      case 'UNDER_REPAIR':
      case 'IN_PROGRESS':
        return { label: 'Đang sửa chữa', bg: '#DBEAFE', color: '#2563EB' };
      case 'COMPLETED':
        return { label: 'Hoàn tất', bg: '#F1F5F9', color: '#64748B' };
      default:
        return { label: s, bg: '#F1F5F9', color: '#64748B' };
    }
  };

  const filteredJobs = jobs.filter((job) => {
    const s = String(job.status).toUpperCase();
    if (activeTab === 'pending') {
      return ['ACCEPTED', 'EN_ROUTE'].includes(s);
    }
    if (activeTab === 'in_progress') {
      return ['UNDER_REPAIR', 'IN_PROGRESS'].includes(s);
    }
    return true;
  });

  return (
    <View style={styles.container}>
      {/* Tabs */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'all' && styles.tabBtnActive]}
          onPress={() => setActiveTab('all')}
        >
          <Text style={activeTab === 'all' ? styles.tabTextActive : styles.tabText}>
            Tất cả ({jobs.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'pending' && styles.tabBtnActive]}
          onPress={() => setActiveTab('pending')}
        >
          <Text style={activeTab === 'pending' ? styles.tabTextActive : styles.tabText}>
            Cần di chuyển
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'in_progress' && styles.tabBtnActive]}
          onPress={() => setActiveTab('in_progress')}
        >
          <Text style={activeTab === 'in_progress' ? styles.tabTextActive : styles.tabText}>
            Đang sửa
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Đang tải danh sách công việc...</Text>
        </View>
      ) : filteredJobs.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="briefcase-outline" size={56} color="#CBD5E1" />
          <Text style={styles.emptyTitle}>Chưa có công việc nào</Text>
          <Text style={styles.emptyDesc}>Các công việc mới từ khách hàng sẽ hiển thị ở đây.</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <View style={styles.list}>
            {filteredJobs.map((job) => {
              const badge = getStatusBadge(job.status);
              const s = String(job.status).toUpperCase();
              const isActioning = actionLoading === job.id;

              return (
                <View key={job.id || job.code} style={styles.jobCard}>
                  <View style={styles.cardHeader}>
                    <View style={styles.iconMap}>
                      <Ionicons name="construct-outline" size={24} color={colors.primary} />
                    </View>
                    <View style={styles.cardContent}>
                      <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                        <Text style={[styles.badgeText, { color: badge.color }]}>{badge.label}</Text>
                      </View>
                      <Text style={styles.jobTitle}>
                        #{job.code || job.id.slice(0, 8)} · {job.serviceName || 'Dịch vụ sửa chữa'}
                      </Text>
                      {job.customerName && (
                        <Text style={styles.jobMeta}>Khách: {job.customerName} {job.customerPhone ? `(${job.customerPhone})` : ''}</Text>
                      )}
                      {job.addressSummary && (
                        <Text style={styles.jobAddress} numberOfLines={2}>
                          📍 {job.addressSummary}
                        </Text>
                      )}
                    </View>
                  </View>

                  {/* Actions depending on status */}
                  <View style={styles.actionsRow}>
                    {s === 'ACCEPTED' && (
                      <TouchableOpacity
                        style={[styles.actionBtn, { backgroundColor: '#2563EB' }]}
                        onPress={() => handleEnRoute(job.id)}
                        disabled={isActioning}
                      >
                        {isActioning ? (
                          <ActivityIndicator size="small" color="#FFF" />
                        ) : (
                          <>
                            <Ionicons name="navigate-outline" size={16} color="#FFF" />
                            <Text style={styles.actionBtnText}>Bắt đầu di chuyển</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    )}

                    {s === 'EN_ROUTE' && (
                      <TouchableOpacity
                        style={[styles.actionBtn, { backgroundColor: '#059669' }]}
                        onPress={() => handleCheckIn(job.id)}
                        disabled={isActioning}
                      >
                        {isActioning ? (
                          <ActivityIndicator size="small" color="#FFF" />
                        ) : (
                          <>
                            <Ionicons name="location-outline" size={16} color="#FFF" />
                            <Text style={styles.actionBtnText}>Check-in tại nhà khách</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    margin: 16,
    marginBottom: 8,
    padding: 4,
    borderRadius: 12,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  tabTextActive: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  scrollContent: {
    padding: 16,
  },
  centerLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#64748B',
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
    color: '#0F172A',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyDesc: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
  },
  list: {
    gap: 12,
  },
  jobCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  iconMap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  cardContent: {
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
  jobTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  jobMeta: {
    fontSize: 13,
    color: '#334155',
    marginBottom: 2,
  },
  jobAddress: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 16,
  },
  actionsRow: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  actionBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
