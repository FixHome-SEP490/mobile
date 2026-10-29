import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Clock, MapPin, User, Wrench } from 'lucide-react-native';
import { isHistoricalOrder, ordersApi, type ServiceOrderItem, type TechnicianOrderItem } from '../../api/orders.api';
import { visitGroupsApi, type VisitGroupPageItem, type VisitGroupReadStatus, type VisitGroupsPage } from '../../api/visit-groups.api';
import { iconSize, iconStroke, useAppTheme } from '../../constants/theme';
import { serviceOrderDisplayView, type StatusIcon } from '../../screens/technician/technician-status';
import { formatVnd } from '../../utils/format';
import StatusBadge from '../StatusBadge';
import { useLiveRefresh } from '../../hooks/useLiveRefresh';
import { sessionLabel } from '../../utils/booking-session';
import { extractApiErrorMessage } from '../../utils/input-validation';
import { visitStatusView } from '../../screens/customer/customer-visit';
import CustomerSkeleton from './CustomerSkeleton';

const PAGE_SIZE = 20;
const SEARCH_DELAY_MS = 400;
// Visits that are over, for the history list; the server filters one status at a time.
const TERMINAL_STATUSES: VisitGroupReadStatus[] = ['completed', 'failed', 'quote_declined', 'mixed', 'cancelled'];
const TERMINAL_PAGE_SIZE = 100;
const TONE_ICON: Record<string, StatusIcon> = {
  success: 'CheckCircle2', warning: 'Clock', repair: 'Wrench', danger: 'AlertTriangle', neutral: 'Minus', info: 'ClipboardCheck', violet: 'ClipboardCheck',
};
// A device order stays EN_ROUTE after the technician has arrived (one check-in covers the visit) until its own photo and quote are done: that is "arrived", not "on the way".
const stepLabel = (o: ServiceOrderItem) => (o.status === 'EN_ROUTE' && o.arrivalVerified ? 'Đã đến nơi' : serviceOrderDisplayView(o).label);
// The status pills of the list, grouped as the order lists group theirs; they filter what is loaded, like the other lists do.
type VisitFilter = 'all' | 'progress' | 'pending' | 'repair' | 'done' | 'cancelled';
const FILTER_GROUPS: Record<Exclude<VisitFilter, 'all'>, readonly string[]> = {
  progress: ['submitted', 'matching', 'no_technician', 'accepted', 'en_route', 'under_repair'],
  pending: ['accepted', 'en_route'],
  repair: ['under_repair'],
  done: ['completed', 'failed', 'quote_declined', 'mixed'],
  cancelled: ['cancelled'],
};
const FILTERS_CUSTOMER: { key: VisitFilter; label: string }[] = [
  { key: 'all', label: 'Tất cả' }, { key: 'progress', label: 'Đang xử lý' }, { key: 'done', label: 'Hoàn tất' }, { key: 'cancelled', label: 'Đã hủy' },
];
const FILTERS_TECHNICIAN: { key: VisitFilter; label: string }[] = [
  { key: 'all', label: 'Tất cả' }, { key: 'pending', label: 'Chờ thực hiện' }, { key: 'repair', label: 'Đang sửa chữa' }, { key: 'done', label: 'Hoàn thành' }, { key: 'cancelled', label: 'Đã hủy' },
];
const matchesFilter = (status: string, filter: VisitFilter) => filter === 'all' || FILTER_GROUPS[filter].includes(status);

const OUTCOME_TEXT = { succeeded: 'Đã sửa xong', failed: 'Không sửa được', quote_declined: 'Không duyệt báo giá' } as const;

/** Multi-device visits of the customer, paged by the server (web "Lượt sửa nhiều thiết bị" tab). */
export default function VisitGroupsPanel({ search, onOpen, bottomInset = 0, terminalOnly = false, assigned = false, emptyTitle }: {
  search: string;
  /** Technician view: visits assigned to the signed-in technician (`assigned-page`). */
  assigned?: boolean;
  emptyTitle?: string;
  /** Only visits that are over (history). ponytail: newest 100 of each status, no further pages. */
  terminalOnly?: boolean;
  onOpen: (visit: VisitGroupPageItem) => void;
  bottomInset?: number;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const [rows, setRows] = useState<VisitGroupPageItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  // The orders of the devices (technician or customer, address, money, step), read apart; a failed read only leaves them out.
  const [orders, setOrders] = useState<Record<string, ServiceOrderItem>>({});
  const generation = useRef(0);
  const query = useRef('');
  const [filter, setFilter] = useState<VisitFilter>('all');

  const read = useCallback(async (page: number, mode: 'first' | 'refresh' | 'more') => {
    const mine = ++generation.current;
    if (mode === 'more') setLoadingMore(true);
    else if (mode === 'refresh') setRefreshing(true);
    try {
      const q = query.current;
      const result: VisitGroupsPage = assigned
        ? await visitGroupsApi.getAssignedPage(page, PAGE_SIZE, 'all')
        : terminalOnly
        ? await Promise.all(TERMINAL_STATUSES.map((status) => visitGroupsApi.getMyPage(1, TERMINAL_PAGE_SIZE, { status, q }))).then((pages) => {
          const data = pages.flatMap((p) => p.data).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
          return { data, total: data.length };
        })
        : await visitGroupsApi.getMyPage(page, PAGE_SIZE, { q });
      if (mine !== generation.current) return;
      setRows((current) => {
        if (page === 1) return result.data;
        const seen = new Set(current.map((row) => row.id));
        return [...current, ...result.data.filter((row) => !seen.has(row.id))];
      });
      setTotal(result.total);
      setError('');
      void (assigned ? ordersApi.getTechnicianJobs() : ordersApi.getMyOrders()).then((list) => {
        if (mine !== generation.current) return;
        setOrders(Object.fromEntries((list as TechnicianOrderItem[]).filter((o) => !isHistoricalOrder(o)).map((o) => [o.id, o as ServiceOrderItem])));
      }).catch(() => undefined);
    } catch (e) {
      if (mine === generation.current) setError(extractApiErrorMessage(e, 'Không tải được danh sách lượt sửa. Vui lòng thử lại.'));
    } finally {
      if (mine === generation.current) { setLoading(false); setRefreshing(false); setLoadingMore(false); }
    }
  }, [terminalOnly, assigned]);

  // Typing in the search box asks the server again once the customer pauses.
  useEffect(() => {
    query.current = search.trim();
    const timer = setTimeout(() => { setLoading(true); void read(1, 'first'); }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [search, read]);
  useFocusEffect(useCallback(() => { if (generation.current > 0) void read(1, 'refresh'); }, [read]));
  useLiveRefresh(['order:updated', 'booking:updated', 'realtime:resync'], () => { void read(1, 'refresh'); }, undefined, { pollMs: 30_000 });

  const hasMore = rows.length < total;
  const loadMore = () => {
    if (loading || refreshing || loadingMore || !hasMore || error) return;
    void read(Math.floor(rows.length / PAGE_SIZE) + 1, 'more');
  };

  const shown = rows.filter((row) => matchesFilter(row.status, filter));
  // A pill that leaves few rows keeps reading the next pages (the list may be too short to scroll to the end).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the read of the next page is the effect
    if (filter !== 'all' && shown.length < 6 && hasMore && !loading && !refreshing && !loadingMore && !error) loadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reads the next page once per change of what is shown
  }, [filter, shown.length, hasMore, loading, refreshing, loadingMore, error]);

  const pills = terminalOnly ? null : (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillScroll} contentContainerStyle={styles.pillRow} accessibilityRole="tablist" testID="visit-filters">
      {(assigned ? FILTERS_TECHNICIAN : FILTERS_CUSTOMER).map((pill) => {
        const active = filter === pill.key;
        const count = hasMore ? '' : ` (${rows.filter((row) => matchesFilter(row.status, pill.key)).length})`;
        return (
          <TouchableOpacity
            key={pill.key}
            testID={`visit-filter-${pill.key}`}
            style={[styles.pill, active && styles.pillActive]}
            onPress={() => setFilter(pill.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${pill.label}${count}`}
          >
            <Text style={active ? styles.pillTextActive : styles.pillText} numberOfLines={1}>{pill.label}{count}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );

  if (loading) {
    return (
      <View style={styles.fill}>
        {pills}
        <View style={styles.pad}>
          <CustomerSkeleton variant="booking" rows={3} />
          <Text style={styles.hint} accessibilityLiveRegion="polite">Đang tải lượt sửa...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.fill}>
    {pills}
    <FlatList
      testID="visit-groups-list"
      data={shown}
      keyExtractor={(row) => row.id}
      contentContainerStyle={[styles.pad, { paddingBottom: bottomInset + 16 }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void read(1, 'refresh')} />}
      onEndReached={loadMore}
      onEndReachedThreshold={0.5}
      ListHeaderComponent={error ? (
        <View style={styles.error} accessibilityRole="alert">
          <Text style={styles.hint}>{error}</Text>
          <TouchableOpacity onPress={() => void read(1, 'refresh')} accessibilityRole="button"><Text style={styles.retry}>Thử lại</Text></TouchableOpacity>
        </View>
      ) : undefined}
      ListEmptyComponent={error ? undefined : (
        <View style={styles.empty} testID="visit-groups-empty">
          <Text style={styles.title}>{search.trim() || filter !== 'all' ? 'Không có lượt sửa phù hợp' : emptyTitle ?? 'Chưa có lượt sửa nhiều thiết bị'}</Text>
          <Text style={styles.hint}>{search.trim() ? 'Hãy đổi từ khóa tìm kiếm.' : filter !== 'all' ? 'Hãy chọn bộ lọc khác.' : 'Khi bạn đặt từ 2 thiết bị trong một lần, lượt sửa sẽ hiện ở đây.'}</Text>
        </View>
      )}
      ListFooterComponent={loadingMore ? (
        <View style={styles.more} accessibilityLiveRegion="polite"><ActivityIndicator size="small" color={colors.primary} /><Text style={styles.hint}>Đang tải thêm…</Text></View>
      ) : undefined}
      renderItem={({ item }) => {
        const when = sessionLabel({ bookingMode: item.bookingMode, slot: item.slot, start: item.scheduledAt });
        const deviceOrders = item.items.map((d) => (d.orderId ? orders[d.orderId] : undefined));
        const lead = deviceOrders.find(Boolean);
        const live = deviceOrders.filter((o): o is ServiceOrderItem => !!o && o.status !== 'CANCELLED');
        // Same rule as the device rows (stepLabel): the visit stays en_route after the check-in, but it is "arrived", not "on the way".
        const arrived = item.status === 'en_route' && live.some((o) => o.status === 'EN_ROUTE' && o.arrivalVerified);
        const status = arrived ? { label: 'Đã đến nơi', tone: 'warning' as const } : visitStatusView(item.status);
        const money = live.reduce((sum, o) => sum + (o.grandTotal || 0), 0);
        const code = lead?.code ?? item.items.find((d) => d.orderCode)?.orderCode;
        const moneyLabel = assigned ? (live.every((o) => o.status === 'COMPLETED') ? 'Tổng thu' : 'Dự kiến thu') : 'Tổng thanh toán';
        return (
          <TouchableOpacity
            style={styles.card}
            onPress={() => onOpen(item)}
            accessibilityRole="button"
            accessibilityLabel={`Lượt sửa ${item.items.length} thiết bị, ${status.label}`}
            testID={`visit-group-${item.id}`}
          >
            <View style={styles.badgeRow}>
              <StatusBadge view={{ label: status.label, tone: status.tone, icon: TONE_ICON[status.tone] ?? 'Minus' }} />
              {!!code && <Text style={styles.code}>#{code}</Text>}
            </View>
            <Text style={styles.title}>Lượt sửa · {item.items.length} thiết bị</Text>
            {(!!when || money > 0) && (
              <View style={styles.splitRow}>
                {!!when && (
                  <View style={styles.iconRowFit}>
                    <Clock size={iconSize.sm} color={colors.textSecondary} strokeWidth={iconStroke} style={styles.rowIcon} />
                    <Text style={styles.whenText}>{when}</Text>
                  </View>
                )}
                {money > 0 && <Text style={styles.amount}>{moneyLabel}: {formatVnd(money)}</Text>}
              </View>
            )}
            {!assigned && !!lead?.technician?.fullName && (
              <View style={styles.iconRow}>
                <User size={iconSize.sm} color={colors.textSecondary} strokeWidth={iconStroke} style={styles.rowIcon} />
                <Text style={styles.hint} numberOfLines={2}>Kỹ thuật viên: {lead.technician.fullName}</Text>
              </View>
            )}
            {assigned && !!lead?.customerName && (
              <View style={styles.iconRow}>
                <User size={iconSize.sm} color={colors.textSecondary} strokeWidth={iconStroke} style={styles.rowIcon} />
                <Text style={styles.hint}>Khách: {lead.customerName}{lead.customerPhone ? ` · ${lead.customerPhone}` : ''}</Text>
              </View>
            )}
            {!!lead?.addressSummary && (
              <View style={styles.iconRow}>
                <MapPin size={iconSize.sm} color={colors.textSecondary} strokeWidth={iconStroke} style={styles.rowIcon} />
                <Text style={styles.hint} numberOfLines={2}>{lead.addressSummary}</Text>
              </View>
            )}
            {item.items.map((device, i) => {
              const order = deviceOrders[i];
              const step = device.outcome ? OUTCOME_TEXT[device.outcome] : order ? stepLabel(order) : '';
              return (
                <View key={device.itemId} style={styles.iconRow}>
                  <Wrench size={iconSize.sm} color={colors.textSecondary} strokeWidth={iconStroke} style={styles.rowIcon} />
                  <Text style={styles.device} numberOfLines={1}>Máy {device.sequence} · {device.serviceName || device.deviceLabel || 'Thiết bị'}</Text>
                  {!!step && <Text style={styles.outcome}>{step}</Text>}
                </View>
              );
            })}
          </TouchableOpacity>
        );
      }}
    />
    </View>
  );
}

const getStyles = (colors: ReturnType<typeof useAppTheme>['colors']) => StyleSheet.create({
  fill: { flex: 1 },
  pad: { padding: 16, gap: 12 },
  pillScroll: { flexGrow: 0, flexShrink: 0 },
  pillRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 8, alignItems: 'center' },
  pill: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  pillActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  pillText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  pillTextActive: { fontSize: 13, fontWeight: '700', color: colors.primaryStrong ?? colors.primary },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 16, gap: 6, marginBottom: 12 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  code: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: colors.textSecondary },
  amount: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.primaryStrong },
  title: { fontSize: 16, lineHeight: 24, fontWeight: '700', color: colors.text },
  hint: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  iconRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  splitRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 },
  iconRowFit: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, flexShrink: 1 },
  whenText: { fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  rowIcon: { marginTop: 2 },
  device: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.text },
  outcome: { fontSize: 12, lineHeight: 20, fontWeight: '600', color: colors.textSecondary },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 48 },
  error: { gap: 8, marginBottom: 12 },
  retry: { fontSize: 14, fontWeight: '600', color: colors.primaryStrong },
  more: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12 },
});
