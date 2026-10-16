import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { reputationApi, type MyReputation } from '../api/reputation.api';
import { useAppTheme } from '../constants/theme';
import { vnDateString, vnDateTimeString } from '../utils/vn-time';

const KIND_LABELS: Record<string, string> = { violation: 'Trừ điểm', adjustment: 'Quản lý điều chỉnh', reset: 'Làm mới định kỳ' };
const signed = (delta: number) => (delta > 0 ? `+${delta}` : String(delta));

/** Điểm uy tín (start 100) on the customer's and technician's profile: score, running ban, reset date, history. */
export default function ReputationCard({ role }: { role: 'customer' | 'technician' }) {
  const { colors } = useAppTheme();
  const [data, setData] = useState<MyReputation | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const banWhat = role === 'customer' ? 'đặt lịch' : 'nhận đơn';

  const load = useCallback(async () => {
    setLoading(true); setFailed(false);
    try { setData(await reputationApi.mine()); } catch { setFailed(true); } finally { setLoading(false); }
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- load own score on mount
  useEffect(() => { void load(); }, [load]);

  const small = { fontSize: 12, lineHeight: 18, color: colors.textSecondary };
  return (
    <View testID="reputation-card" style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>Điểm uy tín</Text>
      {loading ? <Text style={small}>Đang tải điểm uy tín...</Text> : failed || !data ? (
        <View>
          <Text style={small}>Chưa tải được điểm uy tín.</Text>
          <Pressable accessibilityRole="button" onPress={() => void load()} style={styles.toggle}>
            <Text style={{ color: colors.primaryStrong, fontWeight: '700', fontSize: 13 }}>Thử lại</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <Text testID="reputation-points" style={[styles.points, { color: colors.text }]}>{data.points}<Text style={small}> /100</Text></Text>
          <View accessible accessibilityRole="progressbar" accessibilityLabel="Điểm uy tín" accessibilityValue={{ min: 0, max: 100, now: data.points }} style={[styles.track, { backgroundColor: colors.border }]}>
            <View style={[styles.fill, { width: `${Math.max(0, Math.min(100, data.points))}%`, backgroundColor: colors.primary }]} />
          </View>
          {data.locked ? (
            <Text accessibilityRole="alert" style={{ color: colors.error, fontSize: 12, lineHeight: 18 }}>
              Tài khoản đã bị khoá vì hết điểm uy tín. Vui lòng liên hệ bộ phận hỗ trợ.
            </Text>
          ) : data.suspendedUntil ? (
            <Text testID="reputation-ban" accessibilityRole="alert" style={{ color: colors.error, fontSize: 12, lineHeight: 18 }}>
              Bạn tạm thời không thể {banWhat} đến {vnDateTimeString(data.suspendedUntil)}.
            </Text>
          ) : null}
          <Text style={small}>
            Huỷ đơn khi đã có {role === 'customer' ? 'thợ nhận' : 'khách đặt'} bị trừ 10 điểm. Dưới 70 điểm tạm khoá {banWhat} 72 giờ, dưới 40 điểm 7 ngày, từ 20 điểm trở xuống 30 ngày, hết điểm thì khoá tài khoản.
            {data.resetsAt ? ` Điểm được làm mới về 100 vào ngày ${vnDateString(data.resetsAt)}.` : ''}
          </Text>
          {data.events.length > 0 && (
            <>
              <Pressable testID="reputation-history-toggle" accessibilityRole="button" onPress={() => setShowHistory((v) => !v)} style={styles.toggle}>
                <Text style={{ color: colors.primaryStrong, fontWeight: '700', fontSize: 13 }}>
                  {showHistory ? 'Ẩn lịch sử điểm' : `Xem lịch sử điểm (${data.events.length})`}
                </Text>
              </Pressable>
              {showHistory && data.events.map((e) => (
                <View key={e.id} style={[styles.event, { borderTopColor: colors.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontWeight: '600', fontSize: 12 }}>{KIND_LABELS[e.kind] ?? 'Thay đổi điểm'} · {vnDateTimeString(e.createdAt)}</Text>
                    <Text style={small}>{[e.reason, e.penalty].filter(Boolean).join(' ')}</Text>
                  </View>
                  <Text style={{ fontWeight: '700', color: e.delta < 0 ? colors.error : colors.text }}>{signed(e.delta)}</Text>
                </View>
              ))}
            </>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 14, padding: 16, gap: 8 },
  title: { fontSize: 16, fontWeight: '700' },
  points: { fontSize: 32, lineHeight: 40, fontWeight: '700' },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  toggle: { minHeight: 44, justifyContent: 'center' },
  event: { flexDirection: 'row', gap: 12, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
});
