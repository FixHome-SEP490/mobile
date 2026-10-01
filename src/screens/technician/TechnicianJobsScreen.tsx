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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Archive,
  ArrowRight,
  Briefcase,
  CheckCircle2,
  Clock,
  MapPin,
  MessageCircle,
  User,
  Navigation,
  RefreshCw,
} from 'lucide-react-native';
import { useAppTheme } from '../../constants/theme';
import { ordersApi } from '../../api/orders.api';
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
import CustomerSkeleton from '../../components/customer/CustomerSkeleton';
import StatusBadge from '../../components/StatusBadge';
import ContactActions from '../../components/ContactActions';
import { serviceOrderStatusView } from './technician-status';
import { formatDateTime, formatVnd } from '../../utils/format';

type JobTab = 'all' | 'pending' | 'in_progress' | 'completed';

// Floating GlassTabBar: 64pt pill + breathing room, plus the bottom inset (min 16).
const TAB_BAR_CLEARANCE = 64 + 16;

export default function TechnicianJobsScreen() {
  const { colors, isDark } = useAppTheme();
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [activeTab, setActiveTab] = useState<JobTab>('all');
  const [jobsState, setJobsState] = useState(getCachedJobsState);
  const { jobs, loading, refreshing, loadingMoreJobs, error, actionLoading, blockedOrderIds } = jobsState;
  const [checkInBusy, setCheckInBusy] = useState<string | null>(null);
  const [arrivalStates, setArrivalStates] = useState<Record<string, Exclude<ArrivalVerificationState, 'clear'>>>({});
  const technicianUserId = useAuthStore(technicianJobsUserId);
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

  const jobsView = resolveJobsView(jobsState, activeTab);
  const { filtered: filteredJobs, showLoadMoreJobs, jobsCoverageText, emptyNote } = jobsView;
  // Counts only mean something once every page is loaded (filtering is loaded-only).
  const showCounts = !showLoadMoreJobs && !loading;
  const tabCount = (tab: JobTab) => (showCounts ? ` ${resolveJobsView(jobsState, tab).filtered.length}` : '');
  const tabs: { key: JobTab; label: string }[] = [
    { key: 'all', label: 'Tất cả' },
    { key: 'pending', label: 'Chờ thực hiện' },
    { key: 'in_progress', label: 'Đang sửa chữa' },
    { key: 'completed', label: 'Hoàn thành' },
  ];

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.surface} />
      <View style={styles.header}>
        <Text style={styles.headerTitle} accessibilityRole="header">Công việc</Text>
      </View>

      <View style={styles.container}>
        {/* Filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipScroll}
          contentContainerStyle={styles.chipRow}
        >
          {tabs.map(({ key, label }) => {
            const active = activeTab === key;
            return (
              <TouchableOpacity
                key={key}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setActiveTab(key)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${label}${tabCount(key)}`}
              >
                <Text style={active ? styles.chipTextActive : styles.chipText}>
                  {label}
                  {tabCount(key)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {loading ? (
          <View style={styles.skeletonWrap}>
            <CustomerSkeleton variant="booking" />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: TAB_BAR_CLEARANCE + Math.max(insets.bottom, 16) },
              filteredJobs.length === 0 && styles.emptyScroll,
            ]}
            alwaysBounceVertical
            refreshControl={<RefreshControl refreshing={manualRefreshing} onRefresh={onRefresh} />}
          >
            {error && (
              <View style={[styles.errorBanner, { backgroundColor: colors.tone.warning.bg }]} accessibilityRole="alert">
                <Text style={[styles.errorText, { color: colors.tone.warning.text }]}>{error}</Text>
                {jobs.length > 0 && (
                  <Text style={[styles.errorText, { color: colors.tone.warning.text }]}>
                    Đang hiển thị danh sách đã tải trước đó.
                  </Text>
                )}
                <TouchableOpacity onPress={onRefresh} disabled={refreshing} accessibilityRole="button" style={styles.textBtn}>
                  <Text style={styles.textBtnLabel}>Thử lại</Text>
                </TouchableOpacity>
              </View>
            )}
            {filteredJobs.length === 0 && !error && (
              <View style={styles.emptyContainer}>
                <Briefcase size={56} color={colors.muted} strokeWidth={1.5} />
                <Text style={styles.emptyTitle}>Chưa có công việc nào</Text>
                <Text style={styles.emptyDesc}>
                  {emptyNote === 'more-pages'
                    ? 'Mục này chưa có công việc phù hợp trong phần đã tải. Chọn “Tải thêm công việc” để xem tiếp.'
                    : 'Các công việc mới từ khách hàng sẽ hiển thị ở đây.'}
                </Text>
                <TouchableOpacity onPress={onRefresh} disabled={refreshing} accessibilityRole="button" style={styles.textBtn}>
                  <Text style={styles.textBtnLabel}>Làm mới</Text>
                </TouchableOpacity>
              </View>
            )}
            <View style={styles.list}>
              {filteredJobs.map((job) => {
                const statusView = serviceOrderStatusView(job.status);
                if (isHistoricalOrder(job)) {
                  const dates = historicalSummaryDates(job);
                  return (
                    <View key={job.id || job.code} style={[styles.jobCard, styles.jobCardMuted]}>
                      <View style={styles.badgeRow}>
                        <StatusBadge view={statusView} />
                        <Archive size={18} color={colors.muted} strokeWidth={1.75} />
                      </View>
                      <Text style={styles.jobTitle}>
                        #{job.code || (typeof job.id === 'string' ? job.id.slice(0, 8) : '—')}
                      </Text>
                      {!!dates.created && <Text style={styles.jobMeta}>Tạo: {dates.created}</Text>}
                      {!!dates.ended && <Text style={styles.jobMeta}>Kết thúc: {dates.ended}</Text>}
                      <Text style={styles.jobMeta}>Đơn lưu trữ — chỉ xem tóm tắt.</Text>
                    </View>
                  );
                }
                const s = String(job.status).toUpperCase();
                const isActioning = actionLoading === job.id;
                const detailId = techOrderDetailTarget(job);
                const code = job.code || job.id.slice(0, 8);
                const hasActions =
                  !!job.bookingId || s === 'ACCEPTED' || s === 'EN_ROUTE';

                const info = (
                  <View style={styles.info}>
                    <View style={styles.badgeRow}>
                      <StatusBadge view={statusView} />
                      <Text style={styles.jobCode}>#{code}</Text>
                    </View>
                    <Text style={styles.jobTitle}>{job.serviceName || 'Dịch vụ sửa chữa'}</Text>
                    <View style={styles.jobMetaRow}>
                      {!!job.scheduledAt && (
                        <View style={styles.iconRow}>
                          <Clock size={16} color={colors.textSecondary} strokeWidth={1.75} style={styles.rowIcon} />
                          <Text style={styles.jobMeta}>{formatDateTime(job.scheduledAt)}</Text>
                        </View>
                      )}
                      {typeof job.grandTotal === 'number' && (
                        <Text style={styles.jobAmount}>Dự kiến thu: {formatVnd(job.grandTotal)}</Text>
                      )}
                    </View>
                    {!!job.customerName && (
                      <View style={styles.iconRow}>
                        <User size={16} color={colors.textSecondary} strokeWidth={1.75} style={styles.rowIcon} />
                        <Text style={styles.jobMeta}>
                          Khách: {job.customerName}
                          {job.customerPhone ? ` · ${job.customerPhone}` : ''}
                        </Text>
                      </View>
                    )}
                    {!!job.addressSummary && (
                      <View style={styles.iconRow}>
                        <MapPin size={16} color={colors.textSecondary} strokeWidth={1.75} style={styles.rowIcon} />
                        <Text style={styles.jobAddress} numberOfLines={2}>{job.addressSummary}</Text>
                      </View>
                    )}
                  </View>
                );

                return (
                  <View key={job.id || job.code} style={styles.jobCard}>
                    {detailId ? (
                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => navigation.navigate('TechnicianOrderDetail', { serviceOrderId: detailId })}
                        accessibilityRole="button"
                        accessibilityLabel={`Xem chi tiết công việc ${code}`}
                      >
                        {info}
                      </TouchableOpacity>
                    ) : (
                      info
                    )}

                    {(s === 'ACCEPTED' || s === 'EN_ROUTE') && (
                      <View style={styles.contactRow}>
                        <ContactActions phone={job.customerPhone} address={job.addressSummary} />
                      </View>
                    )}

                    {/* Actions depending on status */}
                    {hasActions && (
                      <View style={styles.actionsRow}>
                        <View style={styles.primaryRow}>
                          <View style={styles.primaryCol}>
                            {s === 'ACCEPTED' && (
                              <TouchableOpacity
                                style={[styles.actionBtn, { backgroundColor: colors.primaryStrong }]}
                                onPress={() => handleEnRoute(job.id)}
                                disabled={isActioning || blockedOrderIds.includes(job.id) || checkInBusy === job.id}
                                accessibilityRole="button"
                              >
                                {isActioning ? (
                                  <ActivityIndicator size="small" color={colors.surface} />
                                ) : (
                                  <>
                                    <Navigation size={18} color={colors.surface} strokeWidth={1.75} />
                                    <Text style={styles.actionBtnText}>
                                      {blockedOrderIds.includes(job.id) ? 'Đã gửi · kéo xuống để kiểm tra' : 'Bắt đầu di chuyển'}
                                    </Text>
                                  </>
                                )}
                              </TouchableOpacity>
                            )}

                            {s === 'EN_ROUTE' && arrivalStates[job.id] === 'verified' && (
                              <View style={[styles.stateBox, { backgroundColor: colors.tone.success.bg }]}>
                                <View style={styles.stateBoxRow}>
                                  <CheckCircle2 size={18} color={colors.tone.success.fg} strokeWidth={1.75} style={styles.rowIcon} />
                                  <Text style={[styles.stateBoxText, { color: colors.tone.success.text }]}>
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
                                  <ArrowRight size={18} color={colors.surface} strokeWidth={1.75} />
                                  <Text style={styles.actionBtnText}>Tiếp tục công việc</Text>
                                </TouchableOpacity>
                              </View>
                            )}

                            {s === 'EN_ROUTE' && arrivalStates[job.id] === 'pending' && (
                              <View style={[styles.stateBox, { backgroundColor: colors.tone.warning.bg }]}>
                                <Text style={[styles.stateBoxText, { color: colors.tone.warning.text }]}>
                                  Check-in đang chờ xác minh. Chưa gửi lại để tránh trùng lặp.
                                </Text>
                                <TouchableOpacity
                                  style={[styles.actionBtn, { backgroundColor: colors.tone.warning.text }]}
                                  onPress={() => handleReconcileCheckIn(job.id)}
                                  disabled={checkInBusy === job.id}
                                  accessibilityRole="button"
                                  accessibilityLabel="Kiểm tra lại check-in"
                                >
                                  {checkInBusy === job.id ? (
                                    <ActivityIndicator size="small" color={colors.surface} />
                                  ) : (
                                    <>
                                      <RefreshCw size={18} color={colors.surface} strokeWidth={1.75} />
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
                                accessibilityRole="button"
                              >
                                {isActioning || checkInBusy === job.id ? (
                                  <ActivityIndicator size="small" color={colors.surface} />
                                ) : (
                                  <>
                                    <MapPin size={18} color={colors.surface} strokeWidth={1.75} />
                                    <Text style={styles.actionBtnText}>Check-in tại nhà khách</Text>
                                  </>
                                )}
                              </TouchableOpacity>
                            )}
                          </View>

                          {!!job.bookingId && (
                            <TouchableOpacity
                              style={styles.chatBtn}
                              onPress={() => handleOpenChat(job.bookingId)}
                              disabled={openingChatFor === job.bookingId}
                              accessibilityRole="button"
                              accessibilityLabel="Nhắn tin với khách hàng"
                            >
                              {openingChatFor === job.bookingId ? (
                                <ActivityIndicator size="small" color={colors.primaryStrong} />
                              ) : (
                                <>
                                  <MessageCircle size={18} color={colors.primaryStrong} strokeWidth={1.75} />
                                  <Text style={styles.chatBtnText}>Nhắn tin với khách</Text>
                                </>
                              )}
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
            {!!jobsCoverageText && <Text style={styles.coverageText}>{jobsCoverageText}</Text>}
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
                  <Text style={styles.textBtnLabel}>Tải thêm công việc</Text>
                )}
              </TouchableOpacity>
            )}
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}

const getStyles = (colors: ReturnType<typeof useAppTheme>['colors']) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.surface },
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  headerTitle: { fontSize: 24, lineHeight: 32, fontWeight: '700', color: colors.text },
  chipScroll: { flexGrow: 0 },
  chipRow: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  chip: {
    minHeight: 44,
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primaryStrong, borderColor: colors.primaryStrong },
  chipText: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: colors.textSecondary },
  chipTextActive: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.surface },
  skeletonWrap: { flex: 1, paddingHorizontal: 16 },
  emptyScroll: { flexGrow: 1 },
  errorBanner: { padding: 16, marginBottom: 12, gap: 8, alignItems: 'center', borderRadius: 14 },
  errorText: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  textBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16 },
  textBtnLabel: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.primaryStrong },
  scrollContent: { paddingHorizontal: 16, paddingTop: 4 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 8 },
  emptyTitle: { fontSize: 18, lineHeight: 26, fontWeight: '700', color: colors.text, marginTop: 8 },
  emptyDesc: { fontSize: 14, lineHeight: 20, color: colors.textSecondary, textAlign: 'center' },
  list: { gap: 12 },
  jobCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  jobCardMuted: { gap: 4 },
  info: { gap: 6 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  jobCode: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: colors.textSecondary },
  jobTitle: { fontSize: 16, lineHeight: 24, fontWeight: '700', color: colors.text },
  jobMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 },
  iconRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, flexShrink: 1 },
  rowIcon: { marginTop: 2 },
  jobMeta: { fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  jobAmount: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.primaryStrong },
  jobAddress: { flexShrink: 1, fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  actionsRow: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  contactRow: { marginTop: 12 },
  primaryRow: { gap: 8 },
  primaryCol: { gap: 8 },
  stateBox: { gap: 8, padding: 12, borderRadius: 14 },
  stateBoxRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  stateBoxText: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: '500' },
  actionBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 12,
    borderRadius: 14,
  },
  actionBtnText: { color: colors.surface, fontSize: 14, lineHeight: 20, fontWeight: '700', flexShrink: 1 },
  chatBtn: {
    flexDirection: 'row',
    minHeight: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.primarySoft,
  },
  chatBtnText: { color: colors.primaryStrong, fontSize: 14, lineHeight: 20, fontWeight: '700' },
  coverageText: { fontSize: 12, lineHeight: 16, color: colors.textSecondary, textAlign: 'center', paddingVertical: 8 },
  loadMoreBtn: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
});
