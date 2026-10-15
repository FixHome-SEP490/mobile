import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { technicianEarningsApi, type EarningsPayout, type EarningsSummary } from '../../api/technician-earnings.api';
import { useAppTheme } from '../../constants/theme';
import { formatVnd } from '../../utils/format';
import { periodRange, type EarningsPeriod } from './earnings-period';

const PAGE_SIZE = 10;
const LABELS: Record<EarningsPeriod, string> = { day: 'Ngày', week: 'Tuần', month: 'Tháng' };
const fmtDay = (key: string) => `${key.slice(8, 10)}/${key.slice(5, 7)}/${key.slice(0, 4)}`;

/** Server-side totals and paginated completed orders for a day / week / month, with prev/next. */
export default function EarningsPeriodPanel({ nowMs }: { nowMs?: number }) {
  const { colors } = useAppTheme();
  const [now] = useState(() => nowMs ?? Date.now());
  const [period, setPeriod] = useState<EarningsPeriod>('week');
  const [offset, setOffset] = useState(0);
  const [summary, setSummary] = useState<EarningsSummary | null>(null);
  const [rows, setRows] = useState<EarningsPayout[]>([]);
  const [loading, setLoading] = useState(true);
  const [moreLoading, setMoreLoading] = useState(false);
  const [error, setError] = useState(false);
  const seq = useRef(0);
  const range = periodRange(period, offset, now);

  const load = useCallback(async (page: number) => {
    const mine = ++seq.current;
    if (page === 1) { setLoading(true); setRows([]); } else setMoreLoading(true);
    setError(false);
    try {
      const r = await technicianEarningsApi.getMyEarnings({ ...periodRange(period, offset, now), page, pageSize: PAGE_SIZE });
      if (mine !== seq.current) return;
      setSummary(r);
      setRows((prev) => (page === 1 ? r.payouts : [...prev, ...r.payouts]));
    } catch {
      if (mine === seq.current) setError(true);
    } finally {
      if (mine === seq.current) { setLoading(false); setMoreLoading(false); }
    }
  }, [period, offset, now]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- reload when the period changes
  useEffect(() => { void load(1); }, [load]);

  const small = { fontSize: 12, lineHeight: 18, color: colors.textSecondary };
  const text = { fontSize: 14, lineHeight: 20, color: colors.text };
  const page = Math.ceil(rows.length / PAGE_SIZE);
  return (
    <View testID="earnings-period-panel" style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>Thu nhập theo kỳ (từ máy chủ)</Text>
      <View style={styles.row}>
        {(Object.keys(LABELS) as EarningsPeriod[]).map((p) => (
          <Pressable
            key={p}
            testID={`earnings-period-${p}`}
            accessibilityRole="button"
            accessibilityState={{ selected: period === p }}
            onPress={() => { setPeriod(p); setOffset(0); }}
            style={[styles.seg, { backgroundColor: period === p ? colors.primarySoft : 'transparent' }]}
          >
            <Text style={{ color: period === p ? colors.primaryStrong : colors.textSecondary, fontWeight: '700' }}>{LABELS[p]}</Text>
          </Pressable>
        ))}
      </View>
      <View style={[styles.row, { justifyContent: 'space-between' }]}>
        <Pressable testID="earnings-prev" accessibilityRole="button" accessibilityLabel="Kỳ trước" onPress={() => setOffset((o) => o + 1)} style={styles.nav}><ChevronLeft size={22} color={colors.text} strokeWidth={1.75} /></Pressable>
        <Text style={text}>{range.from === range.to ? fmtDay(range.from) : `${fmtDay(range.from)} – ${fmtDay(range.to)}`}</Text>
        <Pressable testID="earnings-next" accessibilityRole="button" accessibilityLabel="Kỳ sau" disabled={offset === 0} onPress={() => setOffset((o) => Math.max(0, o - 1))} style={[styles.nav, offset === 0 && { opacity: 0.3 }]}><ChevronRight size={22} color={colors.text} strokeWidth={1.75} /></Pressable>
      </View>

      {loading ? <ActivityIndicator color={colors.primary} /> : error && !summary ? (
        <View>
          <Text style={small}>Chưa tải được thu nhập.</Text>
          <Pressable accessibilityRole="button" onPress={() => void load(1)} style={styles.nav}><Text style={{ color: colors.primaryStrong, fontWeight: '700' }}>Thử lại</Text></Pressable>
        </View>
      ) : summary ? (
        <>
          <Text testID="earnings-net" style={[styles.big, { color: colors.text }]}>{formatVnd(summary.totalNet)}</Text>
          <Text style={small}>Thực nhận sau phí{summary.commissionRatePercent != null ? ` (phí ${summary.commissionRatePercent}%)` : ''} · {summary.totalCompletedOrders} đơn hoàn thành</Text>
          <Text style={small}>Tiền công {formatVnd(summary.totalGross)} · Phí nền tảng {formatVnd(summary.totalCommission)}</Text>
          {summary.pendingDueCount > 0 && <Text style={small}>Chờ thanh toán: {summary.pendingDueCount} đơn · {formatVnd(summary.pendingDueAmount)}</Text>}
          {rows.length === 0 && <Text style={small}>Không có đơn hoàn thành trong kỳ này.</Text>}
          {rows.map((p) => (
            <View key={p.orderId} style={[styles.item, { borderTopColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ ...text, fontWeight: '600' }}>#{p.orderCode} · {p.serviceName ?? 'Dịch vụ'}</Text>
                <Text style={small}>{p.date}{p.customer ? ` · ${p.customer}` : ''} · {p.paid ? 'Đã thanh toán' : 'Chưa thanh toán'}</Text>
              </View>
              <Text style={{ ...text, fontWeight: '700' }}>{formatVnd(p.net)}</Text>
            </View>
          ))}
          {error && <Text style={{ ...small, color: colors.error }}>Không tải thêm được.</Text>}
          {rows.length < summary.total && (
            <Pressable testID="earnings-more" accessibilityRole="button" disabled={moreLoading} onPress={() => void load(page + 1)} style={styles.nav}>
              {moreLoading ? <ActivityIndicator color={colors.primary} /> : <Text style={{ color: colors.primaryStrong, fontWeight: '700' }}>Tải thêm ({rows.length}/{summary.total})</Text>}
            </Pressable>
          )}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 14, padding: 16, gap: 8 },
  title: { fontSize: 16, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  seg: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  nav: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  big: { fontSize: 28, lineHeight: 36, fontWeight: '700' },
  item: { flexDirection: 'row', gap: 12, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, alignItems: 'center' },
});
