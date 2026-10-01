import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertTriangle, CalendarOff, CalendarX2, ChevronLeft, ChevronRight, Clock, MapPin } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../types';
import { useAppTheme } from '../../constants/theme';
import { ordersApi, type ServiceOrderItem } from '../../api/orders.api';
import { technicianProfileApi, type TechnicianTimeOff } from '../../api/technician-profile.api';
import CustomerSkeleton from '../../components/customer/CustomerSkeleton';
import StatusBadge from '../../components/StatusBadge';
import { serviceOrderStatusView } from './technician-status';
import { fetchAllOrders } from './technician-earnings';
import { buildWeek, dayKeyVn } from './technician-schedule';

import { vnDateString, vnTimeString } from '../../utils/vn-time';

const VN_DATE = { day: '2-digit', month: '2-digit', year: 'numeric' } as const;
const VN_TIME = { hour: '2-digit', minute: '2-digit' } as const;
const LOAD_ERROR = 'Không thể tải lịch làm việc. Kiểm tra kết nối rồi thử lại.';

export default function TechnicianScheduleScreen() {
  const { colors, isDark } = useAppTheme();
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [orders, setOrders] = useState<ServiceOrderItem[]>([]);
  const [timeOff, setTimeOff] = useState<TechnicianTimeOff[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  // "Now" is fixed when data loads so render stays pure.
  const [loadedAt, setLoadedAt] = useState(0);
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    try {
      const [all, off] = await Promise.all([
        fetchAllOrders((page, size) => ordersApi.getMyOrdersPage(page, size)),
        technicianProfileApi.getMyTimeOff(),
      ]);
      if (!aliveRef.current) return;
      setOrders(all.orders);
      setTimeOff(off);
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

  const week = useMemo(
    () => (loadedAt ? buildWeek(orders, timeOff, loadedAt, weekOffset) : []),
    [orders, timeOff, loadedAt, weekOffset],
  );
  const todayKey = loadedAt ? dayKeyVn(loadedAt) : null;
  const selected = week.find((d) => d.key === selectedKey) ?? week.find((d) => d.key === todayKey) ?? week[0];
  const dm = (key: string) => `${key.slice(8, 10)}/${key.slice(5, 7)}`;
  const weekTitle = week.length ? `${dm(week[0].key)} – ${dm(week[6].key)}` : '';

  const changeWeek = (delta: number) => {
    setWeekOffset((w) => w + delta);
    setSelectedKey(null);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.surface} />
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Quay lại">
          <ChevronLeft size={26} color={colors.text} strokeWidth={1.75} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} accessibilityRole="header">Lịch làm việc</Text>
        <View style={styles.iconBtn} />
      </View>

      {loading ? (
        <View style={styles.pad}>
          <CustomerSkeleton variant="booking" />
        </View>
      ) : loadError && week.length === 0 ? (
        <View style={styles.center}>
          <AlertTriangle size={48} color={colors.error} strokeWidth={1.5} />
          <Text style={styles.emptyTitle}>Không thể tải lịch</Text>
          <Text style={styles.emptyDesc}>{LOAD_ERROR}</Text>
          <TouchableOpacity
            style={styles.textBtn}
            onPress={() => { setLoading(true); setLoadError(false); void load(); }}
            accessibilityRole="button"
          >
            <Text style={styles.textBtnLabel}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: 32 + Math.max(insets.bottom, 16) }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />}
        >
          <View style={styles.weekNav}>
            <TouchableOpacity style={styles.iconBtn} onPress={() => changeWeek(-1)} accessibilityRole="button" accessibilityLabel="Tuần trước">
              <ChevronLeft size={22} color={colors.text} strokeWidth={1.75} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => changeWeek(-weekOffset)}
              disabled={weekOffset === 0}
              accessibilityRole="button"
              accessibilityLabel={`Tuần ${weekTitle}. Về tuần này`}
              style={styles.weekTitleBtn}
            >
              <Text style={styles.weekTitle}>{weekTitle}</Text>
              <Text style={styles.caption}>{weekOffset === 0 ? 'Tuần này' : 'Bấm để về tuần này'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn} onPress={() => changeWeek(1)} accessibilityRole="button" accessibilityLabel="Tuần sau">
              <ChevronRight size={22} color={colors.text} strokeWidth={1.75} />
            </TouchableOpacity>
          </View>

          <View style={styles.dayStrip}>
            {week.map((day) => {
              const active = day.key === selected?.key;
              const isToday = day.key === todayKey;
              return (
                <TouchableOpacity
                  key={day.key}
                  style={[styles.dayChip, active && styles.dayChipActive]}
                  onPress={() => setSelectedKey(day.key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`${day.label} ngày ${day.dayOfMonth}, ${day.orders.length} công việc${day.timeOff.length ? ', ngày nghỉ' : ''}${isToday ? ', hôm nay' : ''}`}
                >
                  <Text style={[styles.dayLabel, active && styles.dayTextActive]}>{day.label}</Text>
                  <Text style={[styles.dayNumber, active && styles.dayTextActive, isToday && !active && styles.dayToday]}>{day.dayOfMonth}</Text>
                  <View style={styles.dotRow}>
                    {day.orders.length > 0 && (
                      <View style={[styles.dot, { backgroundColor: active ? colors.surface : colors.primaryStrong }]} />
                    )}
                    {day.timeOff.length > 0 && (
                      <View style={[styles.dot, { backgroundColor: active ? colors.surface : colors.tone.warning.fg }]} />
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {loadError && (
            <View style={[styles.banner, { backgroundColor: colors.tone.warning.bg }]} accessibilityRole="alert">
              <Text style={[styles.bannerText, { color: colors.tone.warning.text }]}>{LOAD_ERROR}</Text>
            </View>
          )}

          {selected?.timeOff.map((t) => (
            <View key={t.id} style={[styles.banner, { backgroundColor: colors.tone.warning.bg }]}>
              <CalendarOff size={18} color={colors.tone.warning.fg} strokeWidth={1.75} />
              <Text style={[styles.bannerText, { color: colors.tone.warning.text }]}>
                Ngày nghỉ {vnDateString(t.startAt, VN_DATE)} – {vnDateString(t.endAt, VN_DATE)}{t.reason ? ` · ${t.reason}` : ''}
              </Text>
            </View>
          ))}

          {selected && selected.orders.length === 0 ? (
            <View style={styles.center}>
              <CalendarX2 size={48} color={colors.muted} strokeWidth={1.5} />
              <Text style={styles.emptyTitle}>Không có công việc</Text>
              <Text style={styles.emptyDesc}>Ngày này bạn chưa có lịch hẹn nào.</Text>
            </View>
          ) : (
            selected?.orders.map((order) => (
              <TouchableOpacity
                key={order.id}
                style={styles.card}
                activeOpacity={0.7}
                onPress={() => navigation.navigate('TechnicianOrderDetail', { serviceOrderId: order.id })}
                accessibilityRole="button"
                accessibilityLabel={`Xem chi tiết công việc ${order.code || ''} ${order.serviceName || ''}`.trim()}
              >
                <View style={styles.rowBetween}>
                  <StatusBadge view={serviceOrderStatusView(order.status)} />
                  {!!order.code && <Text style={styles.caption}>#{order.code}</Text>}
                </View>
                <Text style={styles.cardTitle}>{order.serviceName || 'Dịch vụ sửa chữa'}</Text>
                <View style={styles.iconRow}>
                  <Clock size={16} color={colors.textSecondary} strokeWidth={1.75} style={styles.rowIcon} />
                  <Text style={styles.body}>{vnTimeString(order.scheduledAt, VN_TIME)}</Text>
                </View>
                {!!order.addressSummary && (
                  <View style={styles.iconRow}>
                    <MapPin size={16} color={colors.textSecondary} strokeWidth={1.75} style={styles.rowIcon} />
                    <Text style={styles.body} numberOfLines={2}>{order.addressSummary}</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))
          )}
          {refreshing && <ActivityIndicator color={colors.primaryStrong} />}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const getStyles = (colors: ReturnType<typeof useAppTheme>['colors']) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  pad: { flex: 1, padding: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: 4, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.divider },
  iconBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 20, lineHeight: 28, fontWeight: '600', color: colors.text },
  content: { padding: 16, gap: 12 },
  weekNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  weekTitleBtn: { alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  weekTitle: { fontSize: 16, lineHeight: 24, fontWeight: '600', color: colors.text },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500', color: colors.textSecondary },
  dayStrip: { flexDirection: 'row', gap: 6 },
  dayChip: { flex: 1, alignItems: 'center', gap: 2, minHeight: 72, paddingVertical: 8, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  dayChipActive: { backgroundColor: colors.primaryStrong, borderColor: colors.primaryStrong },
  dayLabel: { fontSize: 12, lineHeight: 16, fontWeight: '500', color: colors.textSecondary },
  dayNumber: { fontSize: 16, lineHeight: 24, fontWeight: '700', color: colors.text },
  dayToday: { color: colors.primaryStrong },
  dayTextActive: { color: colors.surface },
  dotRow: { flexDirection: 'row', gap: 4, height: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, padding: 12 },
  bannerText: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: '500' },
  card: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 8 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cardTitle: { fontSize: 16, lineHeight: 24, fontWeight: '700', color: colors.text },
  iconRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  rowIcon: { marginTop: 2 },
  body: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  center: { alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  emptyTitle: { fontSize: 18, lineHeight: 26, fontWeight: '700', color: colors.text, marginTop: 8 },
  emptyDesc: { fontSize: 14, lineHeight: 20, color: colors.textSecondary, textAlign: 'center' },
  textBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16 },
  textBtnLabel: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.primaryStrong },
});
