import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../constants/theme';
import { ordersApi, type CanonicalOrderStatus } from '../../api/orders.api';
import { createJobsLoader, initialJobsState, technicianJobsUserId } from './technician-jobs-loader';
import { historicalSummaryDates, isHistoricalOrder, resolveJobsView, techOrderDetailTarget } from './technician-order-detail';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../types';
import { useAuthStore } from '../../store/auth.store';
import * as Location from 'expo-location';
import { createCheckInController, type PermissionDecision } from './technician-check-in';

type JobTab = 'all' | 'pending' | 'in_progress';

export default function TechnicianJobsScreen() {
  const { colors } = useAppTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [activeTab, setActiveTab] = useState<JobTab>('all');
  const [jobsState, setJobsState] = useState(initialJobsState);
  const { jobs, loading, refreshing, loadingMoreJobs, error, actionLoading, blockedOrderIds } = jobsState;
  const [checkInBusy, setCheckInBusy] = useState<string | null>(null);
  const technicianUserId = useAuthStore(technicianJobsUserId);
  const jobsRef = useRef(jobsState.jobs);
  useEffect(() => {
    jobsRef.current = jobsState.jobs;
  }, [jobsState.jobs]);
  const loaderRef = useRef<ReturnType<typeof createJobsLoader> | null>(null);
  if (loaderRef.current === null) {
    loaderRef.current = createJobsLoader(ordersApi.getMyOrders, setJobsState, ordersApi.enRoute, {
      getUserId: () => technicianJobsUserId(useAuthStore.getState()),
      subscribe: (listener) => useAuthStore.subscribe(listener),
    }, (title, message) => Alert.alert(title, message),
    { getOrdersPage: (page, pageSize) => ordersApi.getMyOrdersPage(page, pageSize) });
  }
  const loader = loaderRef.current;
  // P3B4 real user-tapped foreground check-in: permission + one-shot position
  // happen only inside the tap handler below, never on focus. All guards live
  // in the production controller; this only adapts Expo APIs and job state.
  // Created in an effect so no ref is read during render.
  const checkInRef = useRef<ReturnType<typeof createCheckInController> | null>(null);
  useEffect(() => {
    const jobsLoader = loaderRef.current;
    if (!jobsLoader) return;
    checkInRef.current = createCheckInController({
      getJob: (id) => jobsRef.current.find((job) => job.id === id),
      getTechnicianId: () => technicianJobsUserId(useAuthStore.getState()),
      captureFocus: () => jobsLoader.captureFocus(),
      requestPermission: async (): Promise<PermissionDecision> => {
        try {
          const servicesEnabled = await Location.hasServicesEnabledAsync();
          if (!servicesEnabled) return 'unavailable';
          const response = await Location.requestForegroundPermissionsAsync();
          return response.status === 'granted' ? 'granted' : 'denied';
        } catch {
          return 'unavailable';
        }
      },
      getPosition: async () => {
        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Highest,
        });
        return {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
        };
      },
      postCheckIn: (id, coords) => ordersApi.checkIn(id, coords),
      notify: (title, message) => Alert.alert(title, message),
      refreshJobs: () => jobsLoader.refresh(true),
      onAccessDenied: () => { void jobsLoader.refresh(true); },
      setBusy: (orderId) => setCheckInBusy(orderId),
    });
    return () => {
      checkInRef.current = null;
    };
  }, []);
  useFocusEffect(useCallback(() => {
    void loader.focus();
    return () => loader.blur();
  }, [loader]));
  const onRefresh = () => { void loader.refresh(); };
  const onLoadMoreJobs = () => { void loader.loadMoreJobs(); };

  const handleEnRoute = (orderId: string) => { void loader.handleEnRoute(orderId); };

  const handleCheckIn = (orderId: string) => { void checkInRef.current?.checkIn(orderId); };

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

  const jobsView = resolveJobsView(jobsState, activeTab);
  const { filtered: filteredJobs, showLoadMoreJobs, jobsCoverageText, emptyNote } = jobsView;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Công việc</Text>
        <TouchableOpacity
          style={styles.invitationsBtn}
          onPress={() => navigation.navigate('TechnicianInvitations')}
          disabled={!technicianUserId}
          accessibilityLabel="Xem lời mời chờ xác nhận"
        >
          <Ionicons name="mail-outline" size={18} color="#2563EB" />
          <Text style={styles.invitationsBtnText}>Lời mời</Text>
        </TouchableOpacity>
      </View>

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
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scrollContent, filteredJobs.length === 0 && styles.emptyScroll]}
          alwaysBounceVertical
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {error && (
            <View style={styles.errorBanner} accessibilityRole="alert">
              <Text style={styles.emptyDesc}>{error}</Text>
              {jobs.length > 0 && <Text style={styles.emptyDesc}>Đang hiển thị danh sách đã tải trước đó.</Text>}
              <TouchableOpacity onPress={onRefresh} disabled={refreshing} accessibilityRole="button">
                <Text style={styles.invitationsBtnText}>Thử lại</Text>
              </TouchableOpacity>
            </View>
          )}
          {filteredJobs.length === 0 && !error && (
            <View style={styles.emptyContainer}>
              <Ionicons name="briefcase-outline" size={56} color="#CBD5E1" />
              <Text style={styles.emptyTitle}>Chưa có công việc nào</Text>
              <Text style={styles.emptyDesc}>
                {emptyNote === 'more-pages'
                  ? 'Tab này chưa có công việc phù hợp ở trang đã tải. Bấm Tải thêm công việc để xem tiếp.'
                  : 'Các công việc mới từ khách hàng sẽ hiển thị ở đây.'}
              </Text>
              <TouchableOpacity onPress={onRefresh} disabled={refreshing} accessibilityRole="button" style={styles.refreshBtn}>
                <Text style={styles.invitationsBtnText}>Làm mới</Text>
              </TouchableOpacity>
            </View>
          )}
          <View style={styles.list}>
            {filteredJobs.map((job) => {
              if (isHistoricalOrder(job)) {
                const badge = getStatusBadge(job.status);
                const dates = historicalSummaryDates(job);
                return (
                  <View key={job.id || job.code} style={styles.jobCard}>
                    <View style={styles.cardHeader}>
                      <View style={styles.iconMap}>
                        <Ionicons name="archive-outline" size={24} color={colors.primary} />
                      </View>
                      <View style={styles.cardContent}>
                        <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                          <Text style={[styles.badgeText, { color: badge.color }]}>{badge.label}</Text>
                        </View>
                        <Text style={styles.jobTitle}>
                          #{job.code || (typeof job.id === 'string' ? job.id.slice(0, 8) : '—')}
                        </Text>
                        {!!dates.created && (
                          <Text style={styles.jobMeta}>Tạo: {dates.created}</Text>
                        )}
                        {!!dates.ended && (
                          <Text style={styles.jobMeta}>Kết thúc: {dates.ended}</Text>
                        )}
                        <Text style={styles.jobMeta}>Đơn lưu trữ — chỉ xem tóm tắt.</Text>
                      </View>
                    </View>
                  </View>
                );
              }
              const badge = getStatusBadge(job.status);
              const s = String(job.status).toUpperCase();
              const isActioning = actionLoading === job.id;
              const detailId = techOrderDetailTarget(job);

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
                    {!!detailId && (
                      <TouchableOpacity
                        style={styles.detailBtn}
                        onPress={() => navigation.navigate('TechnicianOrderDetail', { serviceOrderId: detailId })}
                        accessibilityRole="button"
                        accessibilityLabel="Xem chi tiết đơn"
                      >
                        <Ionicons name="document-text-outline" size={16} color="#2563EB" />
                        <Text style={styles.detailBtnText}>Xem chi tiết đơn</Text>
                      </TouchableOpacity>
                    )}
                    {s === 'ACCEPTED' && (
                      <TouchableOpacity
                        style={[styles.actionBtn, { backgroundColor: '#2563EB' }]}
                        onPress={() => handleEnRoute(job.id)}
                        disabled={isActioning || blockedOrderIds.includes(job.id) || checkInBusy === job.id}
                      >
                        {isActioning ? (
                          <ActivityIndicator size="small" color="#FFF" />
                        ) : (
                          <>
                            <Ionicons name="navigate-outline" size={16} color="#FFF" />
                            <Text style={styles.actionBtnText}>{blockedOrderIds.includes(job.id) ? 'Đã gửi · kéo xuống để kiểm tra' : 'Bắt đầu di chuyển'}</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    )}

                    {s === 'EN_ROUTE' && (
                      <TouchableOpacity
                        style={[styles.actionBtn, { backgroundColor: '#059669' }]}
                        onPress={() => handleCheckIn(job.id)}
                        disabled={isActioning || checkInBusy === job.id}
                      >
                        {isActioning || checkInBusy === job.id ? (
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
          {!!jobsCoverageText && (
            <Text style={styles.coverageText}>{jobsCoverageText}</Text>
          )}
          {showLoadMoreJobs && (
            <TouchableOpacity
              onPress={onLoadMoreJobs}
              disabled={loadingMoreJobs}
              accessibilityRole="button"
              accessibilityLabel="Tải thêm công việc"
              style={styles.loadMoreBtn}
            >
              {loadingMoreJobs ? (
                <ActivityIndicator size="small" color="#2563EB" />
              ) : (
                <Text style={styles.loadMoreText}>Tải thêm công việc</Text>
              )}
            </TouchableOpacity>
          )}
        </ScrollView>
      )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
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
    flex: 1,
  },
  invitationsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
  },
  invitationsBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2563EB',
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
  emptyScroll: {
    flexGrow: 1,
  },
  errorBanner: {
    padding: 16,
    marginBottom: 12,
    gap: 8,
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
  },
  refreshBtn: {
    padding: 12,
    marginTop: 8,
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
  detailBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
    marginBottom: 8,
  },
  detailBtnText: {
    color: '#2563EB',
    fontSize: 13,
    fontWeight: '700',
  },
  coverageText: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    paddingVertical: 4,
  },
  loadMoreBtn: {
    padding: 14,
    alignItems: 'center',
  },
  loadMoreText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2563EB',
  },
});
