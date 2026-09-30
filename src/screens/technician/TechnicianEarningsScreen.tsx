import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertTriangle, ChevronLeft, ChevronRight, Info } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../types';
import { useAppTheme } from '../../constants/theme';
import { ordersApi, type ServiceOrderItem } from '../../api/orders.api';
import { formatVnd } from '../../utils/format';
import CustomerSkeleton from '../../components/customer/CustomerSkeleton';
import { fetchAllOrders, summarizeEarnings, type EarningsBucket } from './technician-earnings';

type Period = 'week' | 'month';
const CHART_HEIGHT = 140;

export default function TechnicianEarningsScreen() {
  const { colors, isDark } = useAppTheme();
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [orders, setOrders] = useState<ServiceOrderItem[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [loadedAt, setLoadedAt] = useState(0);
  const [period, setPeriod] = useState<Period>('week');
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    try {
      const all = await fetchAllOrders((page, size) => ordersApi.getMyOrdersPage(page, size));
      if (!aliveRef.current) return;
      setOrders(all.orders);
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount, guarded by aliveRef
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
        <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Quay lại">
          <ChevronLeft size={26} color={colors.text} strokeWidth={1.75} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} accessibilityRole="header">Thống kê thu nhập</Text>
        <View style={styles.iconBtn} />
      </View>

      {loading ? (
        <View style={styles.pad}>
          <CustomerSkeleton variant="booking" rows={3} />
        </View>
      ) : loadError && !summary ? (
        <View style={styles.center}>
          <AlertTriangle size={48} color={colors.error} strokeWidth={1.5} />
          <Text style={styles.emptyTitle}>Không thể tải thống kê</Text>
          <Text style={styles.emptyDesc}>Kiểm tra kết nối rồi thử lại.</Text>
          <TouchableOpacity style={styles.textBtn} onPress={() => { setLoading(true); setLoadError(false); void load(); }} accessibilityRole="button">
            <Text style={styles.textBtnLabel}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      ) : summary ? (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: 32 + Math.max(insets.bottom, 16) }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />}
        >
          <View style={styles.segment}>
            {(['week', 'month'] as const).map((p) => {
              const active = period === p;
              return (
                <TouchableOpacity
                  key={p}
                  style={[styles.segmentBtn, active && styles.segmentBtnActive]}
                  onPress={() => setPeriod(p)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{p === 'week' ? 'Theo tuần' : 'Theo tháng'}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.card}>
            <Text style={styles.caption}>{period === 'week' ? 'Tuần này' : 'Tháng này'}</Text>
            <Text style={styles.big}>{formatVnd(current?.amount ?? 0)}</Text>
            <Text style={styles.body}>{current?.count ?? 0} đơn hoàn thành</Text>
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
              <Text style={styles.caption}>Tổng thu nhập</Text>
              <Text style={styles.statValue}>{formatVnd(summary.totalAmount)}</Text>
              <Text style={styles.caption}>{summary.totalCount} đơn hoàn thành</Text>
            </View>
            <View style={[styles.card, styles.flex1]}>
              <Text style={styles.caption}>Đơn cao nhất</Text>
              <Text style={styles.statValue}>{summary.best ? formatVnd(summary.best.amount) : '—'}</Text>
              {!!summary.best && (
                <TouchableOpacity
                  style={styles.linkBtn}
                  onPress={() => navigation.navigate('TechnicianOrderDetail', { serviceOrderId: summary.best!.id })}
                  accessibilityRole="button"
                  accessibilityLabel={`Xem đơn ${summary.best.code}`}
                >
                  <Text style={styles.linkText} numberOfLines={1}>#{summary.best.code}</Text>
                  <ChevronRight size={16} color={colors.primaryStrong} strokeWidth={1.75} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          <View style={[styles.note, { backgroundColor: truncated || loadError ? colors.tone.warning.bg : colors.primarySoft }]}>
            <Info size={18} color={truncated || loadError ? colors.tone.warning.fg : colors.primaryStrong} strokeWidth={1.75} />
            <Text style={[styles.noteText, { color: truncated || loadError ? colors.tone.warning.text : colors.textSecondary }]}>
              {loadError
                ? 'Không cập nhật được dữ liệu mới, đang hiển thị dữ liệu đã tải trước đó. '
                : truncated
                  ? 'Chỉ tính trên các đơn gần đây nhất nên tổng có thể thấp hơn thực tế. '
                  : ''}
              Số liệu là tiền công của đơn hoàn thành theo ngày hoàn thành, chưa trừ phí nền tảng. Đây không phải số dư ví.
            </Text>
          </View>
        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
}

const getStyles = (colors: ReturnType<typeof useAppTheme>['colors']) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex1: { flex: 1 },
  pad: { flex: 1, padding: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: 4, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.divider },
  iconBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 20, lineHeight: 28, fontWeight: '600', color: colors.text },
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
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  barCol: { flex: 1, alignItems: 'center', gap: 4 },
  barTrack: { height: CHART_HEIGHT, justifyContent: 'flex-end', alignSelf: 'stretch', alignItems: 'center' },
  bar: { width: '70%', borderRadius: 6 },
  barLabel: { fontSize: 11, lineHeight: 16, color: colors.textSecondary },
  barLabelActive: { color: colors.text, fontWeight: '700' },
  statRow: { flexDirection: 'row', gap: 12 },
  statValue: { fontSize: 18, lineHeight: 26, fontWeight: '700', color: colors.text },
  linkBtn: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  linkText: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.primaryStrong },
  note: { flexDirection: 'row', gap: 8, borderRadius: 14, padding: 12 },
  noteText: { flex: 1, fontSize: 12, lineHeight: 16 },
  center: { alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  emptyTitle: { fontSize: 18, lineHeight: 26, fontWeight: '700', color: colors.text, marginTop: 8 },
  emptyDesc: { fontSize: 14, lineHeight: 20, color: colors.textSecondary, textAlign: 'center' },
  textBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16 },
  textBtnLabel: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.primaryStrong },
});
