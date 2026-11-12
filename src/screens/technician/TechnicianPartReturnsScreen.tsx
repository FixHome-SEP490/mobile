import React, { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertTriangle, ChevronRight, PackageCheck, PackageOpen } from 'lucide-react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../types';
import { iconSize, iconStroke, useAppTheme } from '../../constants/theme';
import { isPartReturnsUnavailableError, partReturnsApi, type PartCustodyReturnRecord } from '../../api/part-requests.api';
import { openOrResume } from '../../features/order-flow/navigation/resume-order';
import CustomerSkeleton from '../../components/customer/CustomerSkeleton';
import BackButton from '../../components/BackButton';
import { vnDateString } from '../../utils/vn-time';
import { filterPartReturns, groupPartReturns, type PartReturnFilter } from './technician-part-returns';
import PillText from '../../components/PillText';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Load = 'loading' | 'ready' | 'error' | 'unavailable';

const VN_DAY_MONTH = { day: '2-digit', month: '2-digit' } as const;
const FILTERS: { key: PartReturnFilter; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'declare', label: 'Cần khai trả' },
  { key: 'waiting', label: 'Chờ quản lý nhận' },
];

/** Every FixHome part the technician still owes back, one compact card per order, so none is forgotten. */
export default function TechnicianPartReturnsScreen() {
  const { colors, isDark } = useAppTheme();
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const [records, setRecords] = useState<PartCustodyReturnRecord[]>([]);
  const [state, setState] = useState<Load>('loading');
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<PartReturnFilter>('all');

  const load = useCallback(async () => {
    try {
      setRecords(await partReturnsApi.getMine());
      setState('ready');
    } catch (err) {
      setState(isPartReturnsUnavailableError(err) ? 'unavailable' : 'error');
    } finally {
      setRefreshing(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const groups = useMemo(() => groupPartReturns(records), [records]);
  const shown = useMemo(() => filterPartReturns(groups, filter), [groups, filter]);
  const owedTotal = groups.reduce((sum, g) => sum + g.owedQty, 0);
  const count = (key: PartReturnFilter) => filterPartReturns(groups, key).length;
  const emptyAll = state === 'ready' && groups.length === 0;
  const emptyFilter = state === 'ready' && groups.length > 0 && shown.length === 0;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <View style={styles.header}>
        <BackButton />
        <Text style={styles.headerTitle} accessibilityRole="header">Linh kiện cần trả</Text>
        <View style={styles.headerSpacer} />
      </View>

      {state === 'ready' && groups.length > 0 && (
        <View style={styles.filterBar}>
          <Text style={styles.summary} accessibilityLiveRegion="polite">
            {`${owedTotal} linh kiện cần trả về kho · ${groups.length} đơn`}
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {FILTERS.map(({ key, label }) => {
              const active = filter === key;
              return (
                <TouchableOpacity
                  key={key}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setFilter(key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`${label}, ${count(key)} đơn`}
                >
                  <PillText style={active ? styles.chipTextActive : styles.chipText}>{`${label} (${count(key)})`}</PillText>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {state === 'loading' ? (
        <View style={styles.skeletonWrap}><CustomerSkeleton variant="notification" /></View>
      ) : (
        <ScrollView
          style={styles.container}
          contentContainerStyle={[styles.content, shown.length === 0 && styles.contentCenter, { paddingBottom: 32 + Math.max(insets.bottom, 16) }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} colors={[colors.primaryStrong]} />}
          showsVerticalScrollIndicator={false}
        >
          {state === 'error' && (
            <View style={styles.emptyBox}>
              <AlertTriangle size={56} color={colors.error} strokeWidth={1.5} />
              <Text style={styles.emptyTitle} accessibilityRole="header">Không thể tải danh sách</Text>
              <Text style={styles.emptyDesc}>Kiểm tra kết nối rồi thử lại.</Text>
              <TouchableOpacity style={styles.textBtn} onPress={() => { setState('loading'); void load(); }} accessibilityRole="button" accessibilityLabel="Thử tải lại linh kiện cần trả">
                <Text style={styles.textBtnLabel}>Thử lại</Text>
              </TouchableOpacity>
            </View>
          )}
          {state === 'unavailable' && (
            <View style={styles.emptyBox}>
              <PackageOpen size={56} color={colors.muted} strokeWidth={1.5} />
              <Text style={styles.emptyTitle} accessibilityRole="header">Chưa mở tính năng trả linh kiện</Text>
              <Text style={styles.emptyDesc}>Khi được bật, linh kiện bạn còn giữ sẽ hiển thị tại đây.</Text>
            </View>
          )}
          {emptyAll && (
            <View style={styles.emptyBox}>
              <PackageCheck size={56} color={colors.muted} strokeWidth={1.5} />
              <Text style={styles.emptyTitle} accessibilityRole="header">Bạn không còn linh kiện nào cần trả</Text>
              <Text style={styles.emptyDesc}>Linh kiện dư sau khi sửa xong sẽ hiển thị tại đây để bạn khai trả.</Text>
            </View>
          )}
          {emptyFilter && (
            <View style={styles.emptyBox}>
              <PackageCheck size={56} color={colors.muted} strokeWidth={1.5} />
              <Text style={styles.emptyTitle} accessibilityRole="header">Không có đơn nào trong mục này</Text>
            </View>
          )}

          {shown.map((group) => {
            const tone = colors.tone[group.needsDeclare ? 'warning' : 'info'];
            const state2 = group.needsDeclare ? 'Cần khai trả' : 'Chờ quản lý nhận';
            return (
              <TouchableOpacity
                key={group.orderId}
                style={styles.card}
                onPress={() => openOrResume([group.orderId], () => navigation.navigate('TechnicianOrderDetail', { serviceOrderId: group.orderId, screen: 'PartsLifecycle' }))}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={`Đơn ${group.label}, ${state2}, còn ${group.owedQty} linh kiện. Mở để khai trả`}
              >
                <View style={styles.cardHead}>
                  <View style={styles.flex1}>
                    <View style={styles.codeRow}>
                      <Text style={styles.code}>{group.label}</Text>
                      <View style={[styles.badge, { backgroundColor: tone.bg }]}>
                        <PillText style={[styles.badgeText, { color: tone.text }]}>{state2}</PillText>
                      </View>
                    </View>
                    <Text style={styles.meta}>
                      {group.since ? `Nhận ngày ${vnDateString(group.since, VN_DAY_MONTH)} · ` : ''}còn {group.owedQty} cần trả
                    </Text>
                  </View>
                  <ChevronRight size={iconSize.md} color={colors.primaryStrong} strokeWidth={iconStroke} />
                </View>
                {group.rows.map((row) => (
                  <View key={row.partRequestItemId} style={styles.line}>
                    <Text style={styles.lineName} numberOfLines={2}>{row.partNameSnapshot || 'Linh kiện'}</Text>
                    <Text style={styles.lineQty}>{`×${row.outstandingQty}`}</Text>
                  </View>
                ))}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const getStyles = (colors: ReturnType<typeof useAppTheme>['colors']) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.surface },
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: 4, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.divider },
  headerSpacer: { width: 44, height: 44 },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 18, lineHeight: 24, fontWeight: '700', color: colors.text },
  filterBar: { backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.divider },
  summary: { paddingHorizontal: 16, paddingTop: 12, fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.text },
  chipRow: { paddingHorizontal: 16, paddingVertical: 12, gap: 8, alignItems: 'center' },
  chip: { minHeight: 44, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  chipText: { fontSize: 13, lineHeight: 18, fontWeight: '600', color: colors.textSecondary },
  chipTextActive: { fontSize: 13, lineHeight: 18, fontWeight: '700', color: colors.primaryStrong },
  skeletonWrap: { flex: 1, padding: 16, backgroundColor: colors.background },
  content: { padding: 16, gap: 12 },
  contentCenter: { flexGrow: 1, justifyContent: 'center' },
  flex1: { flex: 1, gap: 2 },
  card: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  codeRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  code: { fontSize: 16, lineHeight: 24, fontWeight: '700', color: colors.text },
  badge: { minHeight: 24, justifyContent: 'center', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  badgeText: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  meta: { fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingTop: 8, marginTop: 8, borderTopWidth: 1, borderTopColor: colors.divider },
  lineName: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.text },
  lineQty: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.primaryStrong },
  emptyBox: { alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  emptyTitle: { fontSize: 16, lineHeight: 24, fontWeight: '700', color: colors.text, marginTop: 8, textAlign: 'center' },
  emptyDesc: { fontSize: 14, lineHeight: 20, color: colors.textSecondary, textAlign: 'center' },
  textBtn: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16 },
  textBtnLabel: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.primaryStrong },
});
