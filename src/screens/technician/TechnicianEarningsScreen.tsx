import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertTriangle, ChevronRight, Info, WalletCards } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../types';
import { useAppTheme } from '../../constants/theme';
import { ordersApi, type ServiceOrderItem } from '../../api/orders.api';
import { formatVnd } from '../../utils/format';
import CustomerSkeleton from '../../components/customer/CustomerSkeleton';
import { fetchAllOrders, summarizeEarnings, type EarningsBucket } from './technician-earnings';
import BackButton from '../../components/BackButton';
import EarningsPeriodPanel from './EarningsPeriodPanel';

type Period = 'week' | 'month';
const CHART_HEIGHT = 140;

export default function TechnicianEarningsScreen({ embedded = false }: { embedded?: boolean }) {
  const { colors, isDark } = useAppTheme();
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const rootNavigation = embedded
    ? navigation.getParent<NativeStackNavigationProp<RootStackParamList>>() ?? navigation
    : navigation;
  const [orders, setOrders] = useState<ServiceOrderItem[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [loadedAt, setLoadedAt] = useState(0);
  const [period, setPeriod] = useState<Period>('week');
  const aliveRef = useRef(true);
  // Once a server page confirms historical access, never reinsert its former full DTO this mount.
  const revokedOrderIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    try {
      const all = await fetchAllOrders(
        (page, size) => ordersApi.getTechnicianJobsPage(page, size),
        undefined,
        (ids) => {
          if (!aliveRef.current) return;
          for (const id of ids) revokedOrderIdsRef.current.add(id);
          // Apply each confirmed revocation even if a later page / another GET fails.
          setOrders((previous) => previous.filter((item) => !revokedOrderIdsRef.current.has(item.id)));
        },
      );
      if (!aliveRef.current) return;
      setOrders(all.orders.filter((item) => !revokedOrderIdsRef.current.has(item.id)));
      setTruncated(all.truncated);
      setLoadedAt(Date.now());
      setLoadError(false);
    } catch {
      if (aliveRef.current) setLoadError(true);
    } finally {
      if (aliveRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(() => (loadedAt ? summarizeEarnings(orders, loadedAt) : null), [orders, loadedAt]);
  const buckets: EarningsBucket[] = summary ? (period === 'week' ? summary.weeks : summary.months) : [];
  const max = Math.max(1, ...buckets.map((b) => b.amount));
  const current = buckets[buckets.length - 1];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.surface} />
      <View style={styles.header}>
        {embedded ? (
          <View style={styles.iconBtn} />
        ) : (
          <BackButton />
        )}
        <View style={styles.headerTitleWrapper}>
          <Text style={styles.headerTitle} accessibilityRole="header">Thu nhập</Text>
        </View>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => rootNavigation.navigate('TechnicianWallet')}
          accessibilityRole="button"
          accessibilityLabel="Mở ví kỹ thuật viên"
        >
          <WalletCards size={23} color={colors.primaryStrong} strokeWidth={1.75} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.pad}>
          <Text style={styles.loadingText}>Đang tải…</Text>
          <CustomerSkeleton variant="booking" rows={3} />
        </View>
      ) : loadError && !summary ? (
        <View style={styles.center}>
          <AlertTriangle size={48} color={colors.error} strokeWidth={1.5} />
          <Text style={styles.emptyTitle}>Không thể tải thống kê</Text>
          <Text style={styles.emptyDesc}>Kiểm tra kết nối rồi thử lại.</Text>
          <TouchableOpacity style={styles.textBtn} onPress={() => { setLoading(true); setLoadError(false); void load(); }} accessibilityRole="button" accessibilityLabel="Thử tải lại thống kê thu nhập">
            <Text style={styles.textBtnLabel}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      ) : summary ? (
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: (embedded ? 80 : 32) + Math.max(insets.bottom, 16) },
          ]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />}
        >
          <TouchableOpacity
            style={styles.walletShortcut}
            onPress={() => rootNavigation.navigate('TechnicianWallet')}
            accessibilityRole="button"
            accessibilityLabel="Xem ví và giao dịch"
          >
            <View style={styles.walletShortcutIcon}>
              <WalletCards size={20} color={colors.primaryStrong} strokeWidth={1.75} />
            </View>
            <View style={styles.flex1}>
              <Text style={styles.walletShortcutTitle}>Ví & giao dịch</Text>
              <Text style={styles.body}>Số dư, điều kiện nhận việc, nạp/rút và lịch sử giao dịch</Text>
            </View>
            <ChevronRight size={18} color={colors.textSecondary} strokeWidth={1.75} />
          </TouchableOpacity>

          <View style={styles.segment}>
            {(['week', 'month'] as const).map((p) => {
              const active = period === p;
              return (
                <TouchableOpacity
                  key={p}
                  style={[styles.segmentBtn, active && styles.segmentBtnActive]}
                  onPress={() => setPeriod(p)}
                  accessibilityRole="button"
                  accessibilityLabel={p === 'week' ? 'Xem thu nhập theo tuần' : 'Xem thu nhập theo tháng'}
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{p === 'week' ? 'Tuần này' : 'Tháng này'}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.card}>
            <Text style={styles.caption}>Giá trị các đơn hoàn thành đã tải</Text>
            <Text style={styles.big}>{formatVnd(current?.amount ?? 0)}</Text>
            <Text style={styles.body}>{current?.count ?? 0} đơn hoàn thành</Text>
          </View>

          <View style={[styles.note, { backgroundColor: truncated || loadError ? colors.tone.warning.bg : colors.primarySoft }]}>
            <Info size={18} color={truncated || loadError ? colors.tone.warning.fg : colors.primaryStrong} strokeWidth={1.75} />
            <Text style={[styles.noteText, { color: truncated || loadError ? colors.tone.warning.text : colors.textSecondary }]}>
              {loadError && 'Không cập nhật được dữ liệu mới; đang hiển thị dữ liệu đã tải trước đó. '}
              {truncated && 'Chỉ tính trên các đơn hoàn thành gần đây nhất đã tải; tổng có thể thấp hơn thực tế. '}
              Ước tính từ các đơn đã tải; chưa xác nhận thanh toán và không phải số dư ví.
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>{period === 'week' ? '8 tuần gần nhất' : '6 tháng gần nhất'}</Text>
            <View
              style={styles.chart}
              accessible
              accessibilityLabel={`Biểu đồ thu nhập. ${buckets.map((b) => `${b.label}: ${formatVnd(b.amount)}`).join('; ')}`}
            >
              {buckets.map((b, i) => {
                const last = i === buckets.length - 1;
                return (
                  <View key={b.key} style={styles.barCol}>
                    <View style={styles.barTrack}>
                      <View
                        style={[
                          styles.bar,
                          { height: b.amount > 0 ? Math.max(4, (b.amount / max) * CHART_HEIGHT) : 2 },
                          { backgroundColor: last ? colors.primaryStrong : colors.primaryTint },
                        ]}
                      />
                    </View>
                    <Text style={[styles.barLabel, last && styles.barLabelActive]}>{b.label}</Text>
                  </View>
                );
              })}
            </View>
          </View>

          <View style={styles.statRow}>
            <View style={[styles.card, styles.flex1]}>
              <Text style={styles.caption}>Tổng tiền theo đơn</Text>
              <Text style={styles.statValue}>{formatVnd(summary.totalAmount)}</Text>
              <Text style={styles.caption}>{summary.totalCount} đơn hoàn thành</Text>
            </View>
            <View style={[styles.card, styles.flex1]}>
              <Text style={styles.caption}>Đơn có số tiền cao nhất</Text>
              <Text style={styles.statValue}>{summary.best ? formatVnd(summary.best.amount) : '—'}</Text>
              {!!summary.best && (
                <TouchableOpacity
                  style={styles.linkBtn}
                  onPress={() => rootNavigation.navigate('TechnicianOrderDetail', { serviceOrderId: summary.best!.id })}
                  accessibilityRole="button"
                  accessibilityLabel={`Xem đơn ${summary.best.code}`}
                >
                  <Text style={styles.linkText} numberOfLines={1}>#{summary.best.code}</Text>
                  <ChevronRight size={16} color={colors.primaryStrong} strokeWidth={1.75} />
                </TouchableOpacity>
              )}
            </View>
          </View>
          {summary.totalCount === 0 && (
            <Text style={styles.emptyInline}>Chưa có đơn hoàn thành trong các đơn đã tải.</Text>
          )}

          <EarningsPeriodPanel />

        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
}

const getStyles = (colors: ReturnType<typeof useAppTheme>['colors']) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex1: { flex: 1, minWidth: 0 },
  pad: { flex: 1, padding: 16 },
  loadingText: { fontSize: 14, lineHeight: 20, color: colors.textSecondary, marginBottom: 8 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: 4, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.divider },
  headerTitleWrapper: { flex: 1, alignItems: 'center', gap: 0 },
  headerTitle: { fontSize: 18, lineHeight: 24, fontWeight: '700', color: colors.text },
  iconBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 16, gap: 12 },
  segment: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 14, padding: 4, borderWidth: 1, borderColor: colors.border },
  segmentBtn: { flex: 1, minHeight: 44, justifyContent: 'center', alignItems: 'center', borderRadius: 10 },
  segmentBtnActive: { backgroundColor: colors.primarySoft },
  segmentText: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: colors.textSecondary },
  segmentTextActive: { color: colors.primaryStrong, fontWeight: '700' },
  card: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 4 },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500', color: colors.textSecondary },
  big: { fontSize: 32, lineHeight: 40, fontWeight: '700', color: colors.text },
  body: { fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  sectionTitle: { fontSize: 16, lineHeight: 24, fontWeight: '600', color: colors.text, marginBottom: 8 },
  walletShortcut: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14, minHeight: 44 },
  walletShortcutIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  walletShortcutTitle: { fontSize: 16, lineHeight: 24, fontWeight: '700', color: colors.text },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  barCol: { flex: 1, alignItems: 'center', gap: 4 },
  barTrack: { height: CHART_HEIGHT, justifyContent: 'flex-end', alignSelf: 'stretch', alignItems: 'center' },
  bar: { width: '70%', borderRadius: 6 },
  barLabel: { fontSize: 12, lineHeight: 16, fontWeight: '500', color: colors.textSecondary },
  barLabelActive: { color: colors.text, fontWeight: '700' },
  statRow: { flexDirection: 'row', gap: 12 },
  statValue: { fontSize: 18, lineHeight: 26, fontWeight: '700', color: colors.text },
  linkBtn: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  linkText: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.primaryStrong },
  note: { flexDirection: 'row', gap: 8, borderRadius: 14, padding: 12 },
  noteText: { flex: 1, fontSize: 12, lineHeight: 16 },
  center: { alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  emptyInline: { fontSize: 14, lineHeight: 20, color: colors.textSecondary, textAlign: 'center' },
  emptyTitle: { fontSize: 18, lineHeight: 26, fontWeight: '700', color: colors.text, marginTop: 8 },
  emptyDesc: { fontSize: 14, lineHeight: 20, color: colors.textSecondary, textAlign: 'center' },
  textBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16 },
  textBtnLabel: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.primaryStrong },
});
