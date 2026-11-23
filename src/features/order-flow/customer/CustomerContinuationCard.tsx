import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { AlertTriangle, StopCircle } from 'lucide-react-native';
import { customerContinuationApi, type CustomerContinuation } from '../../../api/customer-continuation.api';
import { STOPPED_FINANCE_NOTE, STOPPED_FINANCE_TITLE, STOPPED_WORK_MESSAGE, STOPPED_WORK_TITLE } from '../../../api/order-work-stopped';
import { lightTheme as colors, spacing } from '../../../constants/theme';
import ToneNote from '../../../components/ToneNote';

export const LIVE_STATUSES = ['EN_ROUTE', 'UNDER_REPAIR'];
export const CONTINUATION_READ_FAILED = 'Chưa kiểm tra được quyền đặt lịch sau gián đoạn. Dữ liệu đơn cũ vẫn được giữ nguyên.';
const TEXT_OLD_OBLIGATIONS = 'Đơn cũ chưa được hủy. Báo giá, thanh toán và nghĩa vụ linh kiện của đơn cũ được giữ nguyên để đối soát riêng.';
const TEXT_PARTS = 'Khai trả linh kiện chưa phải xác nhận đã nhận kho. Quản lý dịch vụ phải kiểm đếm và nhận thực tế; linh kiện cũ chưa có sổ theo dõi vẫn cần kiểm tra.';
const TEXT_NEW_BOOKING = 'Bạn có thể đặt lịch mới độc lập, không cần chờ xử lý đơn cũ. Hãy chọn lịch và xác nhận giá mới; tiền và ưu đãi cũ không chuyển sang đơn mới.';
const TEXT_PREFILL = 'Đặt lại dịch vụ sẽ mở biểu mẫu với thông tin mô tả của đơn cũ. Bạn vẫn chọn lịch, địa chỉ và xác nhận giá mới; đơn cũ chưa bị hủy và giữ nguyên báo giá, thanh toán, ưu đãi cùng nghĩa vụ linh kiện.';

/** The customer's way forward after the technician stopped or interrupted on site (web CustomerContinuationPanel). */
export default function CustomerContinuationCard({ order }: {
  order: { id: string; bookingId?: string | null; visitGroupId?: string | null; status: string };
}) {
  const navigation = useNavigation<any>();
  const [result, setResult] = useState<CustomerContinuation | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const generation = useRef(0);
  const status = String(order.status).toUpperCase();
  const live = LIVE_STATUSES.includes(status);
  const bookingId = order.bookingId ?? null;
  const groupId = order.visitGroupId ?? null;
  const orderId = order.id;

  // Depends on the status itself: a move from EN_ROUTE to UNDER_REPAIR is a new situation and is read again.
  const read = useCallback(() => {
    if (!LIVE_STATUSES.includes(status) || !bookingId) return () => undefined;
    const request = ++generation.current;
    setLoading(true);
    customerContinuationApi.get(orderId, bookingId, groupId)
      .then((data) => { if (request === generation.current) { setResult(data); setFailed(false); } })
      .catch(() => { if (request === generation.current) setFailed(true); })
      .finally(() => { if (request === generation.current) setLoading(false); });
    // A device or order change must not keep showing the previous receipt.
    return () => { generation.current += 1; };
  }, [status, orderId, bookingId, groupId]);

  // Read again on every focus and whenever the order's status changes (the live order feed updates `order.status`).
  useFocusEffect(useCallback(() => read(), [read]));

  const next = result?.customerContinuation;
  const sourceMatches = !!next?.source && next.source.bookingId === bookingId && next.source.serviceOrderId === orderId;
  const prefill = !!next?.eligible && next.prefilledRebookAvailable && sourceMatches;

  if (!live || !bookingId) return null;
  if (!loading && !failed && !next?.eligible) return null;
  return (
    <View testID="continuation-card" style={styles.card}>
      {loading && !result && <View style={styles.line}><ActivityIndicator size="small" color={colors.primaryStrong} /><Text style={styles.meta}>Đang kiểm tra gián đoạn…</Text></View>}
      {failed && (
        <View style={styles.stack}>
          <ToneNote tone="warning" icon={AlertTriangle} alert>{CONTINUATION_READ_FAILED}</ToneNote>
          <Pressable testID="continuation-retry" accessibilityRole="button" accessibilityLabel="Thử lại" onPress={read} style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
            <Text style={styles.secondaryText}>Thử lại</Text>
          </Pressable>
        </View>
      )}
      {!failed && !!next?.eligible && (
        <View style={styles.stack}>
          <Text accessibilityRole="header" style={styles.title}>{result?.workStopped ? STOPPED_WORK_TITLE : 'Đã ghi nhận gián đoạn'}</Text>
          {result?.workStopped && <Text style={styles.body}>{STOPPED_WORK_MESSAGE}</Text>}
          <Text style={styles.body}>{TEXT_OLD_OBLIGATIONS}</Text>
          <Text style={styles.body}>{TEXT_PARTS}</Text>
          <Text style={styles.body}>{TEXT_NEW_BOOKING}</Text>
          <Text style={[styles.body, !prefill && styles.muted]}>{prefill ? TEXT_PREFILL : 'Đặt lại với thông tin điền sẵn chưa sẵn sàng.'}</Text>
          <View style={styles.buttons}>
            {prefill && (
              <Pressable testID="continuation-prefill" accessibilityRole="button" accessibilityLabel="Đặt lại dịch vụ" disabled={loading}
                onPress={() => navigation.navigate('CustomerInterruptionRebook', { bookingId })} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
                <Text style={styles.primaryText}>Đặt lại dịch vụ</Text>
              </Pressable>
            )}
            {next.independentNewBookingAllowed && (
              <Pressable testID="continuation-new-booking" accessibilityRole="button" accessibilityLabel="Đặt lịch mới" disabled={loading}
                onPress={() => navigation.navigate('CustomerBookingCreate')} style={({ pressed }) => [prefill ? styles.secondary : styles.primary, pressed && styles.pressed]}>
                <Text style={prefill ? styles.secondaryText : styles.primaryText}>Đặt lịch mới</Text>
              </Pressable>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

/** Money block of a stopped order (web `stopped-work-finance`): the old quote is history, nothing is owed yet, nothing is refunded yet. */
export function StoppedWorkFinanceNote() {
  return (
    <View testID="stopped-work-finance" style={styles.card}>
      <View style={styles.stack}>
        <View style={styles.line}><StopCircle size={18} strokeWidth={1.75} color={colors.textSecondary} /><Text style={styles.title}>Tài chính đơn đã dừng</Text></View>
        <Text style={styles.bodyStrong}>{STOPPED_FINANCE_TITLE}</Text>
        <Text style={styles.body}>Số tiền phải trả: <Text style={styles.bodyStrong}>Chưa xác định</Text></Text>
        <Text style={styles.body}>Hoàn tiền: <Text style={styles.bodyStrong}>Chưa xác định</Text></Text>
        <Text style={styles.meta}>{STOPPED_FINANCE_NOTE}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, padding: spacing.md },
  stack: { gap: 8 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: '700' },
  body: { color: colors.text, fontSize: 14, lineHeight: 21 },
  bodyStrong: { color: colors.text, fontSize: 14, lineHeight: 21, fontWeight: '600' },
  meta: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  muted: { color: colors.textSecondary },
  buttons: { gap: 8, marginTop: 4 },
  primary: { minHeight: 48, borderRadius: 12, backgroundColor: colors.primaryStrong, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  primaryText: { color: colors.surface, fontSize: 15, fontWeight: '600' },
  secondary: { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  secondaryText: { color: colors.primaryStrong, fontSize: 15, fontWeight: '600' },
  pressed: { opacity: 0.8 },
});
