import React, { useState, useEffect, useCallback } from 'react';
import {
  AccessibilityInfo,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  RefreshControl,
  Image,
  Switch,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock,
  Inbox,
  MapPin,
  MessageCircle,
  ShieldAlert,
  User,
} from 'lucide-react-native';
import { useAuthStore } from '../../store';
import { ordersApi, type ServiceOrderItem } from '../../api/orders.api';
import {
  technicianOnboardingApi,
  type OnboardingStatusResponse,
} from '../../api/technician-onboarding.api';
import { resolveOnboardingView } from './technician-onboarding';
import { createHomeOrdersReadGuard, pickPriorityJob, weeklyStats } from './technician-home';
import { serviceOrderStatusView } from './technician-status';
import { techOrderDetailTarget } from './technician-order-detail';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList, TechnicianTabParamList } from '../../types';
import { useChatUnreadCount } from '../../hooks/useChatUnreadCount';
import { useInvitationCount } from '../../hooks/useInvitationCount';
import { useBadgeStore } from '../../store/badge.store';
import { useTechnicianAvailability } from '../../hooks/useTechnicianAvailability';
import { useScrollHideTabBar } from '../../hooks/useScrollHideTabBar';
import { useAppTheme } from '../../constants/theme';
import { formatVnd } from '../../utils/format';
import CustomerSkeleton from '../../components/customer/CustomerSkeleton';
import StatusBadge from '../../components/StatusBadge';

import { vnDateTimeString, vnDateString } from '../../utils/vn-time';

const VN_DATETIME = { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' } as const;
const VN_DATE = { day: '2-digit', month: '2-digit', year: 'numeric' } as const;
// Floating GlassTabBar: 64pt pill + breathing room, plus the bottom inset (min 16).
const TAB_BAR_CLEARANCE = 64 + 16;

export default function TechnicianHomeScreen() {
  const { colors, isDark } = useAppTheme();
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const navigation = useNavigation<BottomTabNavigationProp<TechnicianTabParamList>>();
  // Order detail and chat live on the root stack, not in the technician tab set.
  const rootNavigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const chatUnread = useChatUnreadCount();
  const notificationUnread = useBadgeStore((state) => state.unreadNotifications);
  const invitationCount = useInvitationCount();
  const availability = useTechnicianAvailability();
  const handleScroll = useScrollHideTabBar();
  const [orders, setOrders] = useState<ServiceOrderItem[]>([]);
  const [homeReadGuard] = useState(createHomeOrdersReadGuard);
  const [loaded, setLoaded] = useState(false);
  // Week boundary is evaluated at fetch time (render must stay pure).
  const [loadedAt, setLoadedAt] = useState(0);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [onboarding, setOnboarding] = useState<OnboardingStatusResponse | null>(null);
  const onboardingView = onboarding ? resolveOnboardingView(onboarding) : 'approved';
  // Reduced motion: keep content static (no auto-hide tab bar on scroll).
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    let mounted = true;
    const reduceMotionPromise = AccessibilityInfo.isReduceMotionEnabled?.() as
      | Promise<boolean>
      | undefined;
    reduceMotionPromise
      ?.then((enabled) => { if (mounted) setReduceMotion(!!enabled); })
      .catch(() => {});
    const subscription = (
      AccessibilityInfo as unknown as {
        addEventListener?: (event: string, handler: (v: boolean) => void) => { remove?: () => void };
      }
    ).addEventListener?.('reduceMotionChanged', (enabled) => {
      if (mounted) setReduceMotion(!!enabled);
    });
    return () => {
      mounted = false;
      subscription?.remove?.();
    };
  }, []);

  // Hồ sơ chưa được duyệt thì nhắc hoàn tất, giống banner ở bản web.
  useFocusEffect(
    React.useCallback(() => {
      technicianOnboardingApi.getStatus().then(setOnboarding).catch(() => {});
    }, []),
  );

  const loadOrders = useCallback(async () => {
    const request = homeReadGuard.begin();
    try {
      const result = await ordersApi.getTechnicianJobs();
      const { orders: current, revokedIds } = homeReadGuard.resolve(request, result);
      if (revokedIds.length) {
        // Revocation is independent of request ordering: even a stale GET
        // can prove the prior full DTO is no longer safe to display.
        const denied = new Set(revokedIds);
        setOrders((previous) => previous.filter((item) => !denied.has(item.id)));
      }
      if (!current) return; // A newer request or unmount invalidated this GET.
      setOrders(current);
      setLoadError(false);
      setLoadedAt(Date.now());
    } catch {
      if (homeReadGuard.isCurrent(request)) setLoadError(true);
    } finally {
      if (homeReadGuard.isCurrent(request)) setLoaded(true);
    }
  }, [homeReadGuard]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    void loadOrders();
    return () => homeReadGuard.invalidate();
  }, [loadOrders, homeReadGuard]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadOrders();
    setRefreshing(false);
  };

  const week = weeklyStats(orders, loadedAt);
  const priority = pickPriorityJob(orders);
  const todayKey = loadedAt ? vnDateString(loadedAt, VN_DATE) : '';
  const todayJobs = loadedAt
    ? orders
        .filter((order) => {
          const status = String(order.status).toUpperCase();
          return (
            !!order.scheduledAt &&
            vnDateString(order.scheduledAt, VN_DATE) === todayKey &&
            status !== 'COMPLETED' &&
            status !== 'CANCELLED'
          );
        })
        .sort((a, b) => String(a.scheduledAt ?? '').localeCompare(String(b.scheduledAt ?? '')))
        .slice(0, 3)
    : [];

  const openDetail = (order: ServiceOrderItem) => {
    const id = techOrderDetailTarget(order);
    if (id) rootNavigation.navigate('TechnicianOrderDetail', { serviceOrderId: id });
  };

  // Accept/en-route/check-in actions live in the Jobs tab; only a repair in progress opens the detail.
  const priorityStatus = priority ? String(priority.status).toUpperCase() : '';
  const priorityOpensDetail = priorityStatus === 'UNDER_REPAIR' || priorityStatus === 'IN_PROGRESS';
  const openPriority = () => {
    if (!priority) return;
    if (priorityOpensDetail) openDetail(priority);
    else navigation.navigate('Jobs');
  };

  const displayName = user?.fullName || 'Kỹ thuật viên';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.surface} />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.avatar}>
            {user?.avatarUrl ? (
              <Image source={{ uri: user.avatarUrl }} style={styles.avatarImage} accessibilityIgnoresInvertColors />
            ) : (
              <User size={22} color={colors.primaryStrong} strokeWidth={1.75} />
            )}
          </View>
          <View style={styles.headerText}>
            <Text style={styles.greetingText}>Xin chào,</Text>
            <Text style={styles.headerName} numberOfLines={1}>{displayName}</Text>
          </View>
        </View>

        <View style={styles.headerActions}>
          {/* Messages (spec 8.6: booking chat with the customer) */}
          <TouchableOpacity
            style={styles.headerIconBtn}
            onPress={() => rootNavigation.navigate('ChatList')}
            activeOpacity={0.8}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={chatUnread > 0 ? `Tin nhắn, ${chatUnread} tin chưa đọc` : 'Tin nhắn'}
          >
            <MessageCircle size={22} color={colors.text} strokeWidth={1.75} />
            {chatUnread > 0 && (
              <View style={styles.chatBadge}>
                <Text style={styles.chatBadgeText}>{chatUnread > 9 ? '9+' : chatUnread}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerIconBtn}
            onPress={() => rootNavigation.navigate('TechnicianNotifications')}
            activeOpacity={0.8}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={notificationUnread > 0 ? `Thông báo, ${notificationUnread} chưa đọc` : 'Thông báo'}
          >
            <Bell size={22} color={colors.text} strokeWidth={1.75} />
            {notificationUnread > 0 && (
              <View style={styles.chatBadge}>
                <Text style={styles.chatBadgeText}>{notificationUnread > 9 ? '9+' : notificationUnread}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: TAB_BAR_CLEARANCE + Math.max(insets.bottom, 16) },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        onScroll={reduceMotion ? undefined : handleScroll}
        scrollEventThrottle={16}
      >
        {/* Blocker đứng trước availability theo shift-cockpit owner lock. */}
        {onboardingView !== 'approved' && (
          <TouchableOpacity
            style={[styles.card, styles.noticeCard, { backgroundColor: colors.tone.warning.bg }]}
            onPress={() => rootNavigation.navigate('TechnicianOnboarding')}
            activeOpacity={0.85}
            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            accessibilityRole="button"
          >
            <ShieldAlert size={22} color={colors.tone.warning.fg} strokeWidth={1.75} />
            <View style={styles.flex1}>
              <Text style={[styles.rowTitle, { color: colors.tone.warning.text }]}>
                {onboardingView === 'submitted'
                  ? 'Hồ sơ đang chờ xét duyệt'
                  : onboardingView === 'rejected'
                    ? 'Hồ sơ cần bổ sung'
                    : 'Hồ sơ kỹ thuật viên chưa hoàn tất'}
              </Text>
              <Text style={[styles.rowBody, { color: colors.tone.warning.text }]}>
                {onboardingView === 'submitted'
                  ? 'Xem trạng thái xét duyệt.'
                  : 'Hoàn tất hồ sơ để nhận việc.'}
              </Text>
            </View>
            <ChevronRight size={18} color={colors.tone.warning.text} strokeWidth={1.75} />
          </TouchableOpacity>
        )}

        {/* Keep the section label short; the technician greeting is already in the app header. */}
        <View style={styles.shiftHeading}>
          <Text style={styles.shiftTitle} accessibilityRole="header">Tổng quan</Text>
        </View>

        {/* Trạng thái nhận việc: white control, real hook only, no demo wallet gate. */}
        {availability.isAvailable !== null && (
          <View style={[styles.card, styles.availabilityCard]}>
            <View style={styles.rowBetween}>
              <View style={[styles.iconRow, styles.centerRow]}>
                <View
                  style={[
                    styles.dot,
                    { backgroundColor: (availability.status?.receiving ?? availability.isAvailable) ? colors.tone.success.fg : colors.muted },
                  ]}
                />
                <View style={{ flexShrink: 1 }}>
                  <Text style={styles.rowTitle}>
                    {availability.status?.title ?? (availability.isAvailable ? 'Sẵn sàng nhận việc' : 'Đang tạm nghỉ')}
                  </Text>
                  {!!availability.status?.detail && <Text style={styles.caption}>{availability.status.detail}</Text>}
                </View>
              </View>
              <Switch
                value={availability.isAvailable}
                onValueChange={availability.toggle}
                disabled={availability.toggling}
                trackColor={{ false: colors.border, true: colors.primaryStrong }}
                accessibilityRole="switch"
                accessibilityLabel="Nhận đơn mới"
                accessibilityState={{ checked: availability.isAvailable, disabled: availability.toggling }}
                accessibilityHint={availability.toggling ? 'Đang cập nhật trạng thái nhận việc' : undefined}
              />
            </View>
            {availability.toggling && (
              <Text style={styles.caption}>Đang cập nhật…</Text>
            )}
          </View>
        )}

        {loadError && (
          <View style={[styles.card, styles.noticeCard, { backgroundColor: colors.tone.danger.bg }]} accessibilityRole="alert">
            <AlertTriangle size={22} color={colors.tone.danger.fg} strokeWidth={1.75} />
            <Text style={[styles.rowBody, styles.flex1, { color: colors.tone.danger.text }]}>
              Không thể tải danh sách công việc. Vui lòng thử lại.
            </Text>
            <TouchableOpacity onPress={onRefresh} style={styles.textBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel="Thử tải lại danh sách công việc">
              <Text style={[styles.textBtnLabel, { color: colors.tone.danger.text }]}>Thử lại</Text>
            </TouchableOpacity>
          </View>
        )}

        {!loaded ? (
          <View accessibilityRole="progressbar" accessibilityLabel="Đang tải danh sách công việc">
            <Text style={styles.loadingText}>Đang tải…</Text>
            <CustomerSkeleton variant="booking" rows={3} />
          </View>
        ) : loadError ? null : (
          <>
            {/* Codex navy hero: one real priority job, else real invitation hero. No demo fixtures. */}
            {priority ? (
              <View style={styles.heroCard}>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={openPriority}
                  hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                  accessibilityRole="button"
                  accessibilityLabel={`Công việc ${priority.code || ''} ${priority.serviceName || ''}`.trim()}
                  style={styles.heroInfo}
                >
                  <Text style={styles.heroEyebrow}>MỘT CÔNG VIỆC ĐANG MỞ</Text>
                  <Text style={styles.heroTitle}>{priority.serviceName || 'Dịch vụ sửa chữa'}</Text>
                  <View style={styles.heroBadgeRow}>
                    <StatusBadge view={serviceOrderStatusView(priority.status)} />
                    {!!priority.code && <Text style={styles.heroMeta}>#{priority.code}</Text>}
                  </View>
                  {!!priority.scheduledAt && (
                    <View style={styles.iconRow}>
                      <Clock size={16} color={colors.primaryTint} strokeWidth={1.75} style={styles.rowIcon} />
                      <Text style={styles.heroMeta}>{vnDateTimeString(priority.scheduledAt, VN_DATETIME)}</Text>
                    </View>
                  )}
                  {!!priority.addressSummary && (
                    <View style={styles.iconRow}>
                      <MapPin size={16} color={colors.primaryTint} strokeWidth={1.75} style={styles.rowIcon} />
                      <Text style={[styles.heroMeta, styles.flex1]} numberOfLines={2}>{priority.addressSummary}</Text>
                    </View>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.heroCta}
                  onPress={openPriority}
                  activeOpacity={0.85}
                  hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                  accessibilityRole="button"
                  accessibilityLabel={priorityOpensDetail ? 'Tiếp tục công việc' : 'Xử lý công việc'}
                >
                  <Text style={styles.heroCtaText}>
                    {priorityOpensDetail ? 'Tiếp tục công việc' : 'Xử lý công việc'}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : invitationCount > 0 ? (
              <TouchableOpacity
                style={[styles.heroCard, styles.heroPressable]}
                onPress={() => navigation.navigate('Invitations')}
                activeOpacity={0.85}
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                accessibilityRole="button"
                accessibilityLabel={`Bạn có ${invitationCount} lời mời nhận việc mới, xem ngay`}
              >
                <Text style={styles.heroEyebrow}>LỜI MỜI NHẬN VIỆC</Text>
                <Text style={styles.heroTitle}>Nhà đang cần bạn kiểm tra.</Text>
                <Text style={styles.heroMeta}>
                  {invitationCount} lời mời nhận việc mới
                </Text>
                <Text style={[styles.heroMeta, styles.heroSubtle]}>
                  Xem thông tin trước khi quyết định nhận hoặc từ chối.
                </Text>
                <View style={styles.heroCta}>
                  <Text style={styles.heroCtaText}>Xem lời mời</Text>
                </View>
              </TouchableOpacity>
            ) : (
              <View style={[styles.card, styles.emptyCard]}>
                <CheckCircle2 size={28} color={colors.tone.success.fg} strokeWidth={1.75} />
                <Text style={styles.rowTitle}>Chưa có việc cần xử lý</Text>
                {availability.isAvailable === false && (
                  <Text style={[styles.rowBody, styles.centerText]}>
                    Bật nhận đơn mới để nhận thêm lời mời.
                  </Text>
                )}
              </View>
            )}

            {/* Codex two shortcuts with real tab links only. */}
            <View style={styles.shortcutRow}>
              <TouchableOpacity
                style={[styles.card, styles.shortcutCard]}
                onPress={() => navigation.navigate('Jobs')}
                activeOpacity={0.85}
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                accessibilityRole="button"
                accessibilityLabel="Mở danh sách công việc"
              >
                <Inbox size={22} color={colors.primaryStrong} strokeWidth={1.75} />
                <Text style={styles.rowTitle}>Công việc</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.card, styles.shortcutCard]}
                onPress={() => rootNavigation.navigate('TechnicianEarnings')}
                activeOpacity={0.85}
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                accessibilityRole="button"
                accessibilityLabel="Mở chi tiết thu nhập"
              >
                <CircleDollarSign size={22} color={colors.primaryStrong} strokeWidth={1.75} />
                <Text style={styles.rowTitle}>Thu nhập</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitleInline} accessibilityRole="header">Hôm nay</Text>
              <TouchableOpacity
                onPress={() => navigation.navigate('Jobs')}
                style={styles.textBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Xem lịch công việc hôm nay"
              >
                <Text style={[styles.textBtnLabel, { color: colors.primaryStrong }]}>Xem lịch</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.card}>
              {todayJobs.length === 0 ? (
                <Text style={[styles.rowBody, styles.centerText]}>Chưa có công việc đang hoạt động được lên lịch hôm nay.</Text>
              ) : (
                todayJobs.map((order, index) => {
                  const canOpen = !!techOrderDetailTarget(order);
                  return (
                    <TouchableOpacity
                      key={order.id}
                      style={[styles.historyItem, index > 0 && styles.historyItemBorder]}
                      onPress={() => openDetail(order)}
                      disabled={!canOpen}
                      accessibilityRole={canOpen ? 'button' : undefined}
                    >
                      <View style={styles.agendaTimeCol}>
                        <Clock size={16} color={colors.primaryStrong} strokeWidth={1.75} />
                        <Text style={styles.agendaTime}>
                          {vnDateTimeString(order.scheduledAt, { hour: '2-digit', minute: '2-digit' })}
                        </Text>
                      </View>
                      <View style={styles.flex1}>
                        <Text style={styles.rowTitle} numberOfLines={1}>{order.serviceName || 'Dịch vụ sửa chữa'}</Text>
                        <StatusBadge view={serviceOrderStatusView(order.status)} />
                      </View>
                      {canOpen && <ChevronRight size={18} color={colors.muted} strokeWidth={1.75} />}
                    </TouchableOpacity>
                  );
                })
              )}
            </View>

            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitleInline} accessibilityRole="header">Thu nhập</Text>
              <TouchableOpacity
                onPress={() => rootNavigation.navigate('TechnicianEarnings')}
                style={styles.textBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Xem chi tiết thu nhập"
              >
                <Text style={[styles.textBtnLabel, { color: colors.primaryStrong }]}>Chi tiết</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.statsRow}>
              <View style={[styles.card, styles.statCard]}>
                <Text style={styles.caption}>Tuần này</Text>
                <Text style={styles.statValue} numberOfLines={2}>{formatVnd(week.earnings)}</Text>
              </View>
              <View style={[styles.card, styles.statCard]}>
                <Text style={styles.caption}>Đã hoàn thành</Text>
                <Text style={styles.statValue} numberOfLines={2}>{week.completed} đơn</Text>
              </View>
            </View>

            {/* Trao đổi theo công việc: mục phụ cuối Home, số chưa đọc thật theo từng đơn đã nhận. */}
            <TouchableOpacity
              style={[styles.card, styles.noticeCard]}
              onPress={() => rootNavigation.navigate('ChatList')}
              activeOpacity={0.85}
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
              accessibilityRole="button"
              accessibilityLabel={
                chatUnread > 0
                  ? `Tin nhắn trao đổi theo công việc, ${chatUnread} tin chưa đọc`
                  : 'Tin nhắn trao đổi theo công việc'
              }
            >
              <MessageCircle size={22} color={colors.primaryStrong} strokeWidth={1.75} />
              <View style={styles.flex1}>
                <Text style={styles.rowTitle}>Tin nhắn trao đổi theo công việc</Text>
                <Text style={styles.rowBody}>
                  {chatUnread > 0
                    ? `${chatUnread > 9 ? '9+' : chatUnread} tin chưa đọc trong các công việc đã nhận.`
                    : 'Trao đổi với khách hàng trong từng công việc đã nhận.'}
                </Text>
              </View>
              <ChevronRight size={18} color={colors.muted} strokeWidth={1.75} />
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (colors: ReturnType<typeof useAppTheme>['colors']) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex1: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  headerLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerText: { flex: 1 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: colors.primarySoft,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarImage: { width: 44, height: 44 },
  greetingText: { fontSize: 12, lineHeight: 16, color: colors.textSecondary },
  headerName: { fontSize: 16, lineHeight: 24, fontWeight: '700', color: colors.text },
  headerIconBtn: {
    width: 44,
    height: 44,
    minWidth: 44,
    minHeight: 44,
    borderRadius: 22,
    backgroundColor: colors.divider,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chatBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: colors.error,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.surface,
  },
  chatBadgeText: { color: '#FFFFFF', fontSize: 12, lineHeight: 16, fontWeight: '700' },
  loadingText: { fontSize: 14, lineHeight: 20, color: colors.textSecondary, marginBottom: 8 },
  scrollContent: { padding: 16, gap: 12 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  noticeCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderColor: 'transparent', minHeight: 44 },
  shiftHeading: { gap: 8, paddingVertical: 4 },
  shiftTitle: { fontSize: 28, lineHeight: 36, fontWeight: '700', color: colors.text },
  availabilityCard: { minHeight: 70, justifyContent: 'center' },
  // Codex navy hero is a local surface (#1c416f per demo DESIGN_SYSTEM); shared theme.ts is untouched.
  heroCard: { backgroundColor: '#1c416f', borderRadius: 22, padding: 16, gap: 12 },
  heroPressable: { minHeight: 44 },
  heroInfo: { gap: 8, minHeight: 44, justifyContent: 'center' },
  heroEyebrow: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: colors.primaryTint, letterSpacing: 1 },
  heroTitle: { fontSize: 20, lineHeight: 28, fontWeight: '700', color: '#FFFFFF' },
  heroBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroMeta: { fontSize: 14, lineHeight: 20, color: colors.primaryTint },
  heroSubtle: { opacity: 0.9 },
  heroCta: {
    marginTop: 4,
    minHeight: 56,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  heroCtaText: { color: '#1c416f', fontSize: 16, lineHeight: 24, fontWeight: '700' },
  shortcutRow: { flexDirection: 'row', gap: 12 },
  shortcutCard: { flex: 1, minWidth: 0, flexShrink: 1, gap: 8, minHeight: 96 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  iconRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, flexShrink: 1 },
  rowIcon: { marginTop: 2 },
  centerRow: { alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  rowTitle: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.text },
  rowBody: { fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500', color: colors.textSecondary },
  centerText: { textAlign: 'center' },
  sectionTitle: { fontSize: 20, lineHeight: 28, fontWeight: '600', color: colors.text, marginTop: 12 },
  sectionTitleInline: { fontSize: 20, lineHeight: 28, fontWeight: '600', color: colors.text },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  textBtn: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 8 },
  textBtnLabel: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  priorityInfo: { gap: 8, minHeight: 44, justifyContent: 'center' },
  priorityTitle: { fontSize: 16, lineHeight: 24, fontWeight: '700', color: colors.text },
  primaryBtn: {
    marginTop: 12,
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: colors.primaryStrong,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryBtnText: { color: colors.surface, fontSize: 16, lineHeight: 24, fontWeight: '700' },
  emptyCard: { alignItems: 'center', gap: 8, paddingVertical: 24 },
  statsRow: { flexDirection: 'row', gap: 12 },
  statCard: { flex: 1, minWidth: 0, flexShrink: 1, gap: 4 },
  statValue: { fontSize: 20, lineHeight: 28, fontWeight: '700', color: colors.text },
  historyItem: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 },
  historyItemBorder: { borderTopWidth: 1, borderTopColor: colors.divider },
  historyIcon: { width: 36, height: 36, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  agendaTimeCol: { width: 54, alignItems: 'center', gap: 2 },
  agendaTime: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: colors.primaryStrong },
});
