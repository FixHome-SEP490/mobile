import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Clock } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { isHistoricalOrder } from '../../../api/orders.api';
import { useOrderSession } from '../runtime/OrderSessionProvider';
import { DetailRow, ReadOnlyNotice, TaskScreenShell } from '../shared/TaskScreenShell';
import TechnicianOrderHub from '../shared/TechnicianOrderHub';
import { lightTheme as colors, spacing } from '../../../constants/theme';
import { backFromFlow } from '../navigation/resume-order';
import PillText from '../../../components/PillText';

/**
 * T05W — the check-in face did not match the registered face and waits for a service manager (PO 20/11/2026).
 * Server state only: the next step opens once the manager approves; a refusal brings the face capture back.
 * The flow navigator reads the order again (live event and a short poll), so nothing here sends a command or offers a refresh.
 */
export default function FaceReviewWaitingScreen() {
  const { key, snapshot } = useOrderSession();
  const navigation = useNavigation<any>();

  const orderValue = snapshot?.order.status === 'ready' ? snapshot.order.data : null;
  const order = orderValue && !isHistoricalOrder(orderValue) ? orderValue : null;
  const current = !!key && !!order && snapshot?.access === 'current' && order.id === key.serviceOrderId && order.technician?.id === key.userId;

  if (!current || !order) {
    return (
      <TaskScreenShell title="Chờ xác nhận khuôn mặt" onBack={() => backFromFlow(navigation)}>
        <ReadOnlyNotice>Trạng thái chờ chỉ được đọc sau khi máy chủ xác minh quyền xem đơn hiện tại.</ReadOnlyNotice>
      </TaskScreenShell>
    );
  }

  return (
    <TaskScreenShell
      title="Chờ xác nhận khuôn mặt"
      stage={2}
      onBack={() => backFromFlow(navigation)}
      primary={{
        label: 'Tiếp tục',
        testID: 'face-review-continue',
        disabled: false,
        onPress: () => navigation.navigate('OrderTask'),
      }}
    >
      <View style={styles.card}>
        <View style={styles.head}>
          <Text accessibilityRole="header" style={styles.title}>Khuôn mặt check-in</Text>
          <View style={[styles.chip, { backgroundColor: colors.tone.warning.bg }]}>
            <PillText style={[styles.chipText, { color: colors.tone.warning.text }]}>Chờ xác nhận</PillText>
          </View>
        </View>
        <View style={[styles.banner, { backgroundColor: colors.tone.info.bg }]}>
          <Clock size={20} strokeWidth={1.75} color={colors.tone.info.fg} />
          <View style={styles.bannerText}>
            <Text style={[styles.bannerTitle, { color: colors.tone.info.text }]}>Đang chờ quản lý dịch vụ xác nhận khuôn mặt…</Text>
            <Text style={styles.meta}>Khuôn mặt chưa khớp rõ với ảnh đã đăng ký. Sau khi được xác nhận, bạn có thể chụp ảnh trước sửa chữa.</Text>
          </View>
        </View>
        <View style={{ backgroundColor: colors.surface, borderRadius: 14, paddingHorizontal: spacing.md }}>
          <DetailRow label="Mã đơn" value={order.code} />
          <DetailRow label="Địa chỉ" value={order.addressSummary} />
        </View>
      </View>
      <TechnicianOrderHub />
    </TaskScreenShell>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 16, padding: spacing.md, gap: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  title: { color: colors.text, fontSize: 16, fontWeight: '700', flexShrink: 1 },
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { fontSize: 12, fontWeight: '600' },
  banner: { flexDirection: 'row', gap: spacing.sm, borderRadius: 12, padding: spacing.md, alignItems: 'flex-start' },
  bannerText: { flex: 1, gap: 2 },
  bannerTitle: { fontSize: 14, fontWeight: '600' },
  meta: { color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
});
