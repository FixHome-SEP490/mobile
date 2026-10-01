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
import { createJobsLoader, getCachedJobsState, technicianJobsUserId } from './technician-jobs-loader';
import { historicalSummaryDates, isHistoricalOrder, resolveJobsView, techOrderDetailTarget } from './technician-order-detail';
import { findChatForBooking } from './technician-chat-shortcut';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../types';
import { useAuthStore } from '../../store/auth.store';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import {
  checkInAttemptState,
  createCheckInController,
  type ArrivalVerificationState,
  type PermissionDecision,
} from './technician-check-in';
import { useInvitationCount } from '../../hooks/useInvitationCount';
import { vnDateString } from '../../utils/vn-time';

type JobTab = 'all' | 'pending' | 'in_progress' | 'completed';

export default function TechnicianJobsScreen() {
  const { colors } = useAppTheme();
  const styles = getStyles(colors);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [activeTab, setActiveTab] = useState<JobTab>('all');
  const [jobsState, setJobsState] = useState(getCachedJobsState);
  const { jobs, loading, refreshing, loadingMoreJobs, error, actionLoading, blockedOrderIds } = jobsState;
  const [checkInBusy, setCheckInBusy] = useState<string | null>(null);
  const [arrivalStates, setArrivalStates] = useState<Record<string, Exclude<ArrivalVerificationState, 'clear'>>>({});
  const technicianUserId = useAuthStore(technicianJobsUserId);
  const invitationCount = useInvitationCount();
  const jobsRef = useRef(jobsState.jobs);
  useEffect(() => {
    jobsRef.current = jobsState.jobs;
  }, [jobsState.jobs]);
  const [loader] = useState(() => createJobsLoader(ordersApi.getMyOrders, setJobsState, ordersApi.enRoute, {
    getUserId: () => technicianJobsUserId(useAuthStore.getState()),
    subscribe: (listener) => useAuthStore.subscribe(listener),
  }, (title, message) => Alert.alert(title, message),
  { getOrdersPage: (page, pageSize) => ordersApi.getMyOrdersPage(page, pageSize) }));
  // P3B4 real user-tapped foreground check-in: permission + one-shot position
  // happen only inside the tap handler below, never on focus. All guards live
  // in the production controller; this only adapts Expo APIs and job state.
  // Created in an effect so no ref is read during render.
  const checkInRef = useRef<ReturnType<typeof createCheckInController> | null>(null);
  useEffect(() => {
    checkInRef.current = createCheckInController({
      getJob: (id) => jobsRef.current.find((job) => job.id === id),
      getTechnicianId: () => technicianJobsUserId(useAuthStore.getState()),
      captureFocus: () => loader.captureFocus(),
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
      getOrderDetail: (id) => ordersApi.getOrder(id),
      notify: (title, message) => Alert.alert(title, message),
      refreshJobs: () => loader.refresh(true),
      onAccessDenied: () => { void loader.refresh(true); },
      setBusy: (orderId) => setCheckInBusy(orderId),
      onVerificationState: (orderId, state) => {
        setArrivalStates((previous) => {
          if (state === 'clear') {
            if (!(orderId in previous)) return previous;
            const next = { ...previous };
            delete next[orderId];
            return next;
          }
          if (previous[orderId] === state) return previous;
          return { ...previous, [orderId]: state };
        });
      },
    });
    return () => {
      checkInRef.current = null;
    };
  }, [loader]);
  useFocusEffect(useCallback(() => {
    void loader.focus();
    return () => loader.blur();
  }, [loader]));
  // Switching back into this tab reuses the cached list silently (background
  // refresh, no visible spinner). Tapping the tab icon while already on it is
  // the explicit "reload" gesture — same pattern as CustomerBookingsScreen.
  const [manualRefreshing, setManualRefreshing] = useState(false);
  useEffect(() => {
    return (navigation as any).addListener('tabPress', () => {
      if (!navigation.isFocused()) return;
      setManualRefreshing(true);
      void loader.refresh(true).finally(() => setManualRefreshing(false));
    });
  }, [navigation, loader]);
  useEffect(() => {
    const controller = checkInRef.current;
    if (!controller || !technicianUserId) return;

    for (const job of jobsState.jobs) {
      if (
        job.historical === true ||
        String(job.status).toUpperCase() !== 'EN_ROUTE'
      ) {
        continue;
      }
      if (
        job.arrivalVerified === true ||
        checkInAttemptState(technicianUserId, job.id) !== 'clear'
      ) {
        void controller.reconcile(job.id);
      }
    }
  }, [jobsState.jobs, technicianUserId]);

  const onRefresh = () => {
    setManualRefreshing(true);
    void loader.refresh(true).finally(() => setManualRefreshing(false));
  };
  const onLoadMoreJobs = () => { void loader.loadMoreJobs(); };

  const handleEnRoute = (orderId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    void loader.handleEnRoute(orderId);
  };

  const handleCheckIn = (orderId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    void checkInRef.current?.checkIn(orderId);
  };
  const handleReconcileCheckIn = (orderId: string) => { void checkInRef.current?.reconcile(orderId); };

  const [openingChatFor, setOpeningChatFor] = useState<string | null>(null);
  const handleOpenChat = async (bookingId: string) => {
    if (openingChatFor) return;
    setOpeningChatFor(bookingId);
    try {
      const target = await findChatForBooking(bookingId);
      if (!target) {
        Alert.alert('Chưa có cuộc trò chuyện', 'Chưa có cuộc trò chuyện nào cho đơn này.');
        return;
      }
      navigation.navigate('ChatThread', {
        conversationId: target.conversationId,
        counterpartName: target.counterpartName,
        serviceName: target.serviceName,
      });
    } catch {
      Alert.alert('Lỗi', 'Không thể mở cuộc trò chuyện. Vui lòng thử lại.');
    } finally {
      setOpeningChatFor(null);
    }
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
        return { label: 'Đang sửa chữa', bg: colors.primaryTint, color: colors.primaryStrong };
      case 'COMPLETED':
        return { label: 'Hoàn tất', bg: colors.divider, color: colors.textSecondary };
      default:
        return { label: s, bg: colors.divider, color: colors.textSecondary };
    }
  };

  const jobsView = resolveJobsView(jobsState, activeTab);
  const { filtered: filteredJobs, showLoadMoreJobs, jobsCoverageText, emptyNote } = jobsView;
  const completedCount = jobs.filter((job) => String(job.status).toUpperCase() === 'COMPLETED').length;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.surface} />
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Công việc</Text>
        <TouchableOpacity
          style={styles.invitationsBtn}
          onPress={() => navigation.navigate('TechnicianInvitations')}
          disabled={!technicianUserId}
          accessibilityRole="button"
          accessibilityLabel={
            invitationCount > 0 ? `Xem lời mời chờ xác nhận, ${invitationCount} lời mời mới` : 'Xem lời mời chờ xác nhận'
          }
        >
          <Ionicons name="mail-outline" size={18} color={colors.primaryStrong} />
          <Text style={styles.invitationsBtnText}>Lời mời</Text>
          {invitationCount > 0 && (
            <View style={styles.invitationsBtnBadge}>
              <Text style={styles.invitationsBtnBadgeText}>{invitationCount > 9 ? '9+' : invitationCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.container}>

      {invitationCount > 0 && (
        <TouchableOpacity
          style={styles.invitationBanner}
          onPress={() => navigation.navigate('TechnicianInvitations')}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`Bạn có ${invitationCount} lời mời nhận việc mới, xem ngay`}
        >
          <View style={styles.invitationBannerIcon}>
            <Ionicons name="mail-unread" size={20} color="#D97706" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.invitationBannerTitle}>
              {invitationCount} lời mời nhận việc mới
            </Text>
            <Text style={styles.invitationBannerSubtitle}>Xác nhận sớm để không bỏ lỡ đơn</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#D97706" />
        </TouchableOpacity>
      )}

      {/* Tabs */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'all' && styles.tabBtnActive]}
          onPress={() => setActiveTab('all')}
        >
          <Text
            style={activeTab === 'all' ? styles.tabTextActive : styles.tabText}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
          >
            Tất cả ({jobs.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'pending' && styles.tabBtnActive]}
          onPress={() => setActiveTab('pending')}
        >
          <Text
            style={activeTab === 'pending' ? styles.tabTextActive : styles.tabText}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
          >
            Cần di chuyển
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'in_progress' && styles.tabBtnActive]}
          onPress={() => setActiveTab('in_progress')}
        >
          <Text
            style={activeTab === 'in_progress' ? styles.tabTextActive : styles.tabText}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
          >
            Đang sửa
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'completed' && styles.tabBtnActive]}
          onPress={() => setActiveTab('completed')}
        >
          <Text
            style={activeTab === 'completed' ? styles.tabTextActive : styles.tabText}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
          >
            Hoàn thành ({completedCount})
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
          refreshControl={<RefreshControl refreshing={manualRefreshing} onRefresh={onRefresh} />}
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
                      <View style={styles.jobMetaRow}>
                        {!!job.scheduledAt && (
                          <Text style={styles.jobMeta}>{vnDateString(job.scheduledAt)}</Text>
                        )}
                        {typeof job.grandTotal === 'number' && (
                          <Text style={styles.jobAmount}>Dự kiến thu: {job.grandTotal.toLocaleString('vi-VN')}đ</Text>
                        )}
                      </View>
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
                    {(!!detailId || !!job.bookingId) && (
                      <View style={styles.secondaryRow}>
                        {!!detailId && (
                          <TouchableOpacity
                            style={styles.detailBtn}
                            onPress={() => navigation.navigate('TechnicianOrderDetail', { serviceOrderId: detailId })}
                            accessibilityRole="button"
                            accessibilityLabel="Xem chi tiết đơn"
                          >
                            <Ionicons name="document-text-outline" size={16} color={colors.primaryStrong} />
                            <Text style={styles.detailBtnText}>Chi tiết đơn</Text>
                          </TouchableOpacity>
                        )}
                        {!!job.bookingId && (
                          <TouchableOpacity
                            style={styles.detailBtn}
                            onPress={() => handleOpenChat(job.bookingId)}
                            disabled={openingChatFor === job.bookingId}
                            accessibilityRole="button"
                            accessibilityLabel="Nhắn tin với khách"
                          >
                            {openingChatFor === job.bookingId ? (
                              <ActivityIndicator size="small" color={colors.primaryStrong} />
                            ) : (
                              <>
                                <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.primaryStrong} />
                                <Text style={styles.detailBtnText}>Nhắn tin</Text>
                              </>
                            )}
                          </TouchableOpacity>
                        )}
                      </View>
                    )}
                    {s === 'ACCEPTED' && (
                      <TouchableOpacity
                        style={[styles.actionBtn, { backgroundColor: colors.primaryStrong }]}
                        onPress={() => handleEnRoute(job.id)}
                        disabled={isActioning || blockedOrderIds.includes(job.id) || checkInBusy === job.id}
                      >
                        {isActioning ? (
                          <ActivityIndicator size="small" color={colors.surface} />
                        ) : (
                          <>
                            <Ionicons name="navigate-outline" size={16} color={colors.surface} />
                            <Text style={styles.actionBtnText}>{blockedOrderIds.includes(job.id) ? 'Đã gửi · kéo xuống để kiểm tra' : 'Bắt đầu di chuyển'}</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    )}

                    {s === 'EN_ROUTE' && arrivalStates[job.id] === 'verified' && (
                      <View style={styles.arrivalVerifiedBox}>
                        <View style={styles.arrivalVerifiedRow}>
                          <Ionicons name="checkmark-circle-outline" size={18} color="#047857" />
                          <Text style={styles.arrivalVerifiedText}>
                            Đã đến nơi. Đơn sẽ chuyển sang đang sửa khi bạn bắt đầu sửa chữa.
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={[styles.actionBtn, { backgroundColor: colors.success }]}
                          onPress={() =>
                            navigation.navigate('TechnicianOrderDetail', {
                              serviceOrderId: job.id,
                            })
                          }
                          accessibilityRole="button"
                          accessibilityLabel="Tiếp tục công việc"
                        >
                          <Ionicons name="arrow-forward-outline" size={16} color={colors.surface} />
                          <Text style={styles.actionBtnText}>Tiếp tục công việc</Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {s === 'EN_ROUTE' && arrivalStates[job.id] === 'pending' && (
                      <View style={styles.arrivalPendingBox}>
                        <Text style={styles.arrivalPendingText}>
                          Check-in đang chờ xác minh. Chưa gửi lại để tránh trùng lặp.
                        </Text>
                        <TouchableOpacity
                          style={[styles.actionBtn, { backgroundColor: '#D97706' }]}
                          onPress={() => handleReconcileCheckIn(job.id)}
                          disabled={checkInBusy === job.id}
                          accessibilityRole="button"
                          accessibilityLabel="Kiểm tra lại check-in"
                        >
                          {checkInBusy === job.id ? (
                            <ActivityIndicator size="small" color={colors.surface} />
                          ) : (
                            <>
                              <Ionicons name="refresh-outline" size={16} color={colors.surface} />
                              <Text style={styles.actionBtnText}>Kiểm tra check-in</Text>
                            </>
                          )}
                        </TouchableOpacity>
                      </View>
                    )}

                    {s === 'EN_ROUTE' && !arrivalStates[job.id] && (
                      <TouchableOpacity
                        style={[styles.actionBtn, { backgroundColor: colors.success }]}
                        onPress={() => handleCheckIn(job.id)}
                        disabled={isActioning || checkInBusy === job.id}
                      >
                        {isActioning || checkInBusy === job.id ? (
                          <ActivityIndicator size="small" color={colors.surface} />
                        ) : (
                          <>
                            <Ionicons name="location-outline" size={16} color={colors.surface} />
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
                <ActivityIndicator size="small" color={colors.primaryStrong} />
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

const getStyles = (colors: any) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.surface,
  },
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
    borderBottomColor: colors.divider,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    flex: 1,
  },
  invitationsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
  },
  invitationsBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primaryStrong,
  },
  invitationsBtnBadge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: colors.error,
    justifyContent: 'center',
    alignItems: 'center',
  },
  invitationsBtnBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.surface,
  },
  invitationBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  invitationBannerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FDE68A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  invitationBannerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#92400E',
  },
  invitationBannerSubtitle: {
    fontSize: 12,
    color: '#92400E',
    marginTop: 2,
  },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: colors.divider,
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
    backgroundColor: colors.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  tabTextActive: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
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
    color: colors.textSecondary,
    textAlign: 'center',
  },
  list: {
    gap: 12,
  },
  jobCard: {
    backgroundColor: colors.surface,
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
    backgroundColor: colors.divider,
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
    color: colors.text,
    marginBottom: 4,
  },
  jobMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  jobMeta: {
    fontSize: 13,
    color: '#334155',
    marginBottom: 2,
  },
  jobAmount: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primaryStrong,
  },
  jobAddress: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 16,
  },
  arrivalVerifiedBox: {
    flex: 1,
    gap: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  arrivalVerifiedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  arrivalVerifiedText: {
    flex: 1,
    color: '#047857',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
  },
  arrivalPendingBox: {
    flex: 1,
    gap: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  arrivalPendingText: {
    color: '#92400E',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
  },
  actionsRow: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    gap: 10,
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: 10,
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
    color: colors.surface,
    fontSize: 13,
    fontWeight: '700',
  },
  detailBtn: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.primarySoft,
  },
  detailBtnText: {
    color: colors.primaryStrong,
    fontSize: 13,
    fontWeight: '700',
  },
  coverageText: {
    fontSize: 12,
    color: colors.textSecondary,
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
    color: colors.primaryStrong,
  },
});
