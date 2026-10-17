import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
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
  const infoSheetRef = useRef<BottomSheetModal>(null);
  const banWhat = role === 'customer' ? 'đặt lịch' : 'nhận việc';

  const load = useCallback(async () => {
    setLoading(true); setFailed(false);
    try { setData(await reputationApi.mine()); } catch { setFailed(true); } finally { setLoading(false); }
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- load own score on mount
  useEffect(() => { void load(); }, [load]);

  const small = { fontSize: 12, lineHeight: 18, color: colors.textSecondary };

  return (
    <>
      <View testID="reputation-card" style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.header}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>Điểm uy tín</Text>
            {data && (
              <Text testID="reputation-points" style={[styles.points, { color: colors.text }]}>
                {data.points}<Text style={[small, { fontWeight: '500' }]}> /100</Text>
              </Text>
            )}
          </View>
          <Pressable testID="reputation-info-open" accessibilityRole="button"
            accessibilityLabel="Thông tin điểm uy tín" accessibilityHint="Mở quy định và lịch sử thay đổi điểm"
            onPress={() => infoSheetRef.current?.present()} style={styles.infoButton}>
            <Ionicons name="information-circle-outline" size={24} color={colors.primaryStrong} />
          </Pressable>
        </View>
        {!data && (loading ? <Text style={small}>Đang tải điểm uy tín...</Text> : failed ? (
          <View>
            <Text style={small}>Chưa tải được điểm uy tín.</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Thử lại điểm uy tín" onPress={() => void load()} style={styles.retry}>
              <Text style={{ color: colors.primaryStrong, fontWeight: '700', fontSize: 13 }}>Thử lại</Text>
            </Pressable>
          </View>
        ) : null)}
        {data && (
          <>
            <View accessible accessibilityRole="progressbar" accessibilityLabel="Điểm uy tín"
              accessibilityValue={{ min: 0, max: 100, now: data.points }}
              style={[styles.track, { backgroundColor: colors.border }]}>
              <View style={[styles.fill, { width: `${Math.max(0, Math.min(100, data.points))}%`, backgroundColor: colors.primary }]} />
            </View>
            {data.locked ? (
              <Text testID="reputation-ban" accessibilityRole="alert" style={{ color: colors.error, fontSize: 12, lineHeight: 18 }}>
                Tài khoản đã bị khoá vì hết điểm uy tín. Vui lòng liên hệ bộ phận hỗ trợ.
              </Text>
            ) : data.suspendedUntil ? (
              <Text testID="reputation-ban" accessibilityRole="alert" style={{ color: colors.error, fontSize: 12, lineHeight: 18 }}>
                Bạn tạm thời không thể {banWhat} đến {vnDateTimeString(data.suspendedUntil)}.
              </Text>
            ) : null}
          </>
        )}
      </View>
      <BottomSheetModal
        accessible={false}
        ref={infoSheetRef}
        snapPoints={['65%', '88%']}
        enablePanDownToClose
        backdropComponent={(props) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.5} />}
      >
        <BottomSheetScrollView contentContainerStyle={styles.sheetContent}>
          <View style={styles.header}>
            <Text accessibilityRole="header" style={[styles.sheetTitle, { flex: 1, color: colors.text }]}>Điểm uy tín</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Đóng thông tin điểm uy tín"
              onPress={() => infoSheetRef.current?.dismiss()} style={styles.infoButton}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </Pressable>
          </View>
          <Text style={[small, { color: colors.text }]}>Quy định mặc định</Text>
          <View style={[styles.policy, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <Text style={[small, { color: colors.text }]}>Bắt đầu từ 100 điểm. {role === 'customer' ? 'Hủy lịch sau khi kỹ thuật viên đã nhận lời mời' : 'Hủy đơn khi đã có khách đặt'}: mức trừ mặc định là 10 điểm.</Text>
            <Text style={[small, { color: colors.text }]}>Dưới 70 điểm: tạm khóa {banWhat} 72 giờ. Dưới 40 điểm: 7 ngày. Từ 20 điểm trở xuống: 30 ngày. Hết điểm: khóa tài khoản.</Text>
            {role === 'technician' && (
              <Text style={[small, { color: colors.text }]}>Kỹ thuật viên đã báo “Cần thay đổi thợ” cho đơn này không bị trừ điểm uy tín; quản lý dịch vụ xem xét trường hợp này.</Text>
            )}
            <Text style={[small, { color: colors.text }]}>Chu kỳ mặc định là 2 tháng và điểm được làm mới về 100, trừ tài khoản đã bị khóa.{data?.resetsAt ? ` Lần làm mới tiếp theo: ${vnDateString(data.resetsAt)}.` : ''}</Text>
          </View>
          <Text accessibilityRole="header" style={[styles.sheetSectionTitle, { color: colors.text }]}>Lịch sử điểm</Text>
          {data?.events.length ? data.events.map((event) => (
            <View key={event.id} style={[styles.event, { borderTopColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: '600', fontSize: 12 }}>{KIND_LABELS[event.kind] ?? 'Thay đổi điểm'} · {vnDateTimeString(event.createdAt)}</Text>
                <Text style={small}>{[event.reason, event.penalty].filter(Boolean).join(' ')}</Text>
              </View>
              <Text style={{ fontWeight: '700', color: event.delta < 0 ? colors.error : colors.text }}>{signed(event.delta)}</Text>
            </View>
          )) : <Text style={small}>{data ? 'Chưa có sự kiện thay đổi điểm.' : 'Chưa tải được lịch sử điểm.'}</Text>}
        </BottomSheetScrollView>
      </BottomSheetModal>
    </>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, gap: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 14, fontWeight: '700' },
  points: { fontSize: 24, lineHeight: 30, fontWeight: '700' },
  track: { height: 4, borderRadius: 2, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2 },
  infoButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  sheetContent: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32, gap: 12 },
  sheetTitle: { fontSize: 20, lineHeight: 28, fontWeight: '700' },
  sheetSectionTitle: { fontSize: 16, lineHeight: 22, fontWeight: '700', marginTop: 8 },
  policy: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
  retry: { minHeight: 44, justifyContent: 'center' },
  event: { flexDirection: 'row', gap: 12, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
});
