import React, { useState, useEffect, useCallback } from 'react';
import {
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
  CheckCircle2,
  ChevronRight,
  Clock,
  MailOpen,
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
import { pickPriorityJob, weeklyStats, completedAt, orderIncome } from './technician-home';
import { serviceOrderStatusView } from './technician-status';
import { techOrderDetailTarget } from './technician-order-detail';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList, TechnicianTabParamList } from '../../types';
import { useChatUnreadCount } from '../../hooks/useChatUnreadCount';
import { useInvitationCount } from '../../hooks/useInvitationCount';
import { useTechnicianAvailability } from '../../hooks/useTechnicianAvailability';
import { useScrollHideTabBar } from '../../hooks/useScrollHideTabBar';
import { useAppTheme } from '../../constants/theme';
import { formatDate, formatDateTime, formatVnd } from '../../utils/format';
import CustomerSkeleton from '../../components/customer/CustomerSkeleton';
import StatusBadge from '../../components/StatusBadge';

// Floating GlassTabBar: 64pt pill + breathing room, plus the bottom inset (min 16).
const TAB_BAR_CLEARANCE = 64 + 16;
const RECENT_LIMIT = 5;

export default function TechnicianHomeScreen() {
  const { colors, isDark } = useAppTheme();
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const navigation = useNavigation<BottomTabNavigationProp<TechnicianTabParamList>>();
  // Order detail and chat live on the root stack, not in the technician tab set.
  const rootNavigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const chatUnread = useChatUnreadCount();
  const invitationCount = useInvitationCount();
  const availability = useTechnicianAvailability();
  const handleScroll = useScrollHideTabBar();
  const [orders, setOrders] = useState<ServiceOrderItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  // Week boundary is evaluated at fetch time (render must stay pure).
  const [loadedAt, setLoadedAt] = useState(0);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [onboarding, setOnboarding] = useState<OnboardingStatusResponse | null>(null);
  const onboardingView = onboarding ? resolveOnboardingView(onboarding) : 'approved';

  // Hồ sơ chưa được duyệt thì nhắc hoàn tất, giống banner ở bản web.
  useFocusEffect(
    React.useCallback(() => {
      technicianOnboardingApi.getStatus().then(setOnboarding).catch(() => {});
    }, []),
  );

  const loadOrders = useCallback(async () => {
    try {
      const result = await ordersApi.getMyOrders();
      setOrders(Array.isArray(result) ? result : []);
      setLoadError(false);
      setLoadedAt(Date.now());
    } catch {
      setLoadError(true);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    void loadOrders();
  }, [loadOrders]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadOrders();
    setRefreshing(false);
  };

  const week = weeklyStats(orders, loadedAt);
  const priority = pickPriorityJob(orders);
  const recentCompleted = orders
    .filter((o) => String(o.status).toUpperCase() === 'COMPLETED')
    .sort((a, b) => completedAt(b).localeCompare(completedAt(a)))
    .slice(0, RECENT_LIMIT);

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

        {/* Messages (spec 8.6: booking chat with the customer) */}
        <TouchableOpacity
          style={styles.headerIconBtn}
          onPress={() => rootNavigation.navigate('ChatList')}
          activeOpacity={0.8}
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
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: TAB_BAR_CLEARANCE + Math.max(insets.bottom, 16) },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        {/* Nhận đơn mới */}
        {availability.isAvailable !== null && (
          <View style={styles.card}>
            <View style={styles.rowBetween}>
              <View style={[styles.iconRow, styles.centerRow]}>
                <View
                  style={[
                    styles.dot,
                    { backgroundColor: availability.isAvailable ? colors.tone.success.fg : colors.muted },
                  ]}
                />
                <Text style={styles.rowTitle}>
                  {availability.isAvailable ? 'Đang nhận đơn mới' : 'Tạm dừng nhận đơn mới'}
                </Text>
              </View>
              <Switch
                value={availability.isAvailable}
                onValueChange={availability.toggle}
                disabled={availability.toggling}
                trackColor={{ false: colors.border, true: colors.primaryStrong }}
                accessibilityLabel="Nhận đơn mới"
              />
            </View>
          </View>
        )}

        {onboardingView !== 'approved' && (
          <TouchableOpacity
            style={[styles.card, styles.noticeCard, { backgroundColor: colors.tone.warning.bg }]}
            onPress={() => rootNavigation.navigate('TechnicianOnboarding')}
            activeOpacity={0.85}
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

        {invitationCount > 0 && (
          <TouchableOpacity
            style={[styles.card, styles.noticeCard, { backgroundColor: colors.tone.warning.bg }]}
            onPress={() => navigation.navigate('Invitations')}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`Bạn có ${invitationCount} lời mời nhận việc mới, xem ngay`}
          >
            <MailOpen size={22} color={colors.tone.warning.fg} strokeWidth={1.75} />
            <View style={styles.flex1}>
              <Text style={[styles.rowTitle, { color: colors.tone.warning.text }]}>
                {invitationCount} lời mời nhận việc mới
              </Text>
              <Text style={[styles.rowBody, { color: colors.tone.warning.text }]}>
                Xác nhận sớm để không bỏ lỡ đơn.
              </Text>
            </View>
            <ChevronRight size={18} color={colors.tone.warning.text} strokeWidth={1.75} />
          </TouchableOpacity>
        )}

        {loadError && (
          <View style={[styles.card, styles.noticeCard, { backgroundColor: colors.tone.danger.bg }]} accessibilityRole="alert">
            <AlertTriangle size={22} color={colors.tone.danger.fg} strokeWidth={1.75} />
            <Text style={[styles.rowBody, styles.flex1, { color: colors.tone.danger.text }]}>
              Không thể tải danh sách công việc. Vui lòng thử lại.
            </Text>
            <TouchableOpacity onPress={onRefresh} style={styles.textBtn} accessibilityRole="button">
              <Text style={[styles.textBtnLabel, { color: colors.tone.danger.text }]}>Thử lại</Text>
            </TouchableOpacity>
          </View>
        )}

        {!loaded ? (
          <CustomerSkeleton variant="booking" rows={3} />
        ) : (
          <>
            {/* Cần xử lý ngay */}
            <Text style={styles.sectionTitle}>Cần xử lý ngay</Text>
            {priority ? (
              <View style={styles.card}>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={openPriority}
                  accessibilityRole="button"
                  accessibilityLabel={`Công việc ${priority.code || ''} ${priority.serviceName || ''}`.trim()}
                  style={styles.priorityInfo}
                >
                  <View style={styles.rowBetween}>
                    <StatusBadge view={serviceOrderStatusView(priority.status)} />
                    {!!priority.code && <Text style={styles.caption}>#{priority.code}</Text>}
                  </View>
                  <Text style={styles.priorityTitle}>{priority.serviceName || 'Dịch vụ sửa chữa'}</Text>
                  {!!priority.scheduledAt && (
                    <View style={styles.iconRow}>
                      <Clock size={16} color={colors.textSecondary} strokeWidth={1.75} style={styles.rowIcon} />
                      <Text style={styles.rowBody}>{formatDateTime(priority.scheduledAt)}</Text>
                    </View>
                  )}
                  {!!priority.addressSummary && (
                    <View style={styles.iconRow}>
                      <MapPin size={16} color={colors.textSecondary} strokeWidth={1.75} style={styles.rowIcon} />
                      <Text style={[styles.rowBody, styles.flex1]} numberOfLines={2}>{priority.addressSummary}</Text>
                    </View>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.primaryBtn}
                  onPress={openPriority}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                >
                  <Text style={styles.primaryBtnText}>
                    {priorityOpensDetail ? 'Tiếp tục công việc' : 'Xử lý công việc'}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={[styles.card, styles.emptyCard]}>
                <CheckCircle2 size={28} color={colors.tone.success.fg} strokeWidth={1.75} />
                <Text style={styles.rowTitle}>Chưa có việc cần xử lý</Text>
                <Text style={[styles.rowBody, styles.centerText]}>
                  {availability.isAvailable === false
                    ? 'Bật nhận đơn mới để nhận thêm lời mời.'
                    : 'Công việc mới sẽ xuất hiện ở đây.'}
                </Text>
              </View>
            )}

            {/* Tuần này */}
            <Text style={styles.sectionTitle}>Tuần này</Text>
            <View style={styles.statsRow}>
              <View style={[styles.card, styles.statCard]}>
                <Text style={styles.caption}>Thu nhập</Text>
                <Text style={styles.statValue}>{formatVnd(week.earnings)}</Text>
              </View>
              <View style={[styles.card, styles.statCard]}>
                <Text style={styles.caption}>Hoàn thành</Text>
                <Text style={styles.statValue}>{week.completed} đơn</Text>
              </View>
            </View>

            {/* Hoạt động gần đây */}
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitleInline}>Hoạt động gần đây</Text>
              {recentCompleted.length > 0 && (
                <TouchableOpacity
                  onPress={() => navigation.navigate('Jobs')}
                  style={styles.textBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Xem tất cả công việc"
                >
                  <Text style={[styles.textBtnLabel, { color: colors.primaryStrong }]}>Xem tất cả</Text>
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.card}>
              {recentCompleted.length === 0 ? (
                <Text style={[styles.rowBody, styles.centerText]}>Chưa có hoạt động nào.</Text>
              ) : (
                recentCompleted.map((order, index) => {
                  const canOpen = !!techOrderDetailTarget(order);
                  return (
                    <TouchableOpacity
                      key={order.id}
                      style={[styles.historyItem, index > 0 && styles.historyItemBorder]}
                      onPress={() => openDetail(order)}
                      disabled={!canOpen}
                      accessibilityRole={canOpen ? 'button' : undefined}
                    >
                      <View style={[styles.historyIcon, { backgroundColor: colors.tone.success.bg }]}>
                        <CheckCircle2 size={18} color={colors.tone.success.fg} strokeWidth={1.75} />
                      </View>
                      <View style={styles.flex1}>
                        <Text style={styles.rowTitle} numberOfLines={1}>{order.serviceName || 'Dịch vụ sửa chữa'}</Text>
                        <Text style={styles.rowBody}>
                          {formatDate(completedAt(order))} · {formatVnd(orderIncome(order))}
                        </Text>
                      </View>
                      {canOpen && <ChevronRight size={18} color={colors.muted} strokeWidth={1.75} />}
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
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
  chatBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
  scrollContent: { padding: 16, gap: 12 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  noticeCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderColor: 'transparent' },
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
  textBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  textBtnLabel: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  priorityInfo: { gap: 8 },
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
  statCard: { flex: 1, gap: 4 },
  statValue: { fontSize: 20, lineHeight: 28, fontWeight: '700', color: colors.text },
  historyItem: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 },
  historyItemBorder: { borderTopWidth: 1, borderTopColor: colors.divider },
  historyIcon: { width: 36, height: 36, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
});
