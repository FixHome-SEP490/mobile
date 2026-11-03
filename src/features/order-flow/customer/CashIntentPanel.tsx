import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { CashIntent } from '../../../api/cash-intents.api';
import { useAppTheme } from '../../../constants/theme';
import { formatVnd } from '../../../utils/format';

/**
 * What the server says about the customer's cash request. "Received" is the technician's report: the invoice, not
 * this panel, says the payment is done.
 */
export default function CashIntentPanel({ intent, busy, onCancel }: { intent: CashIntent | null; busy: boolean; onCancel: () => void }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => StyleSheet.create({
    box: { borderWidth: 1, borderRadius: 12, padding: 16, gap: 8 },
    title: { fontSize: 16, fontWeight: '700' },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
    label: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
    amount: { color: colors.text, fontSize: 16, fontWeight: '700' },
    body: { color: colors.text, fontSize: 14, lineHeight: 20 },
    cancel: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
    cancelText: { color: colors.primaryStrong, fontWeight: '600', fontSize: 14, lineHeight: 20 },
  }), [colors]);
  if (!intent) return null;
  if (intent.status === 'cancelled') {
    return (
      <View testID="cash-intent-cancelled" style={[styles.box, { backgroundColor: colors.tone.info.bg, borderColor: colors.tone.info.fg }]}>
        <Text style={styles.body}>Yêu cầu tiền mặt đã được hủy. Bạn có thể chọn cách thanh toán khác.</Text>
      </View>
    );
  }
  const received = intent.status === 'received';
  const tone = colors.tone[received ? 'info' : 'warning'];
  return (
    <View testID={received ? 'cash-intent-received' : 'cash-intent-pending'} style={[styles.box, { backgroundColor: tone.bg, borderColor: tone.fg }]}>
      <Text accessibilityRole="header" style={[styles.title, { color: tone.text }]}>
        {received ? 'Kỹ thuật viên đã báo nhận tiền mặt' : 'Chờ kỹ thuật viên xác nhận tiền mặt'}
      </Text>
      <View style={styles.row}>
        <Text style={styles.label}>Số tiền cần trả</Text>
        <Text style={styles.amount} testID="cash-intent-amount">{formatVnd(intent.customerDueVnd)}</Text>
      </View>
      <Text style={styles.body}>
        {received
          ? 'Hệ thống đã ghi nhận số tiền trên. Đang chờ trạng thái hóa đơn được cập nhật; chưa hiển thị là đã thanh toán.'
          : 'Hãy trả đúng số tiền trên trực tiếp cho kỹ thuật viên. Hóa đơn chỉ được cập nhật sau khi kỹ thuật viên xác nhận đã nhận.'}
      </Text>
      {received ? null : (
        <TouchableOpacity
          testID="cash-intent-cancel"
          accessibilityRole="button"
          accessibilityLabel="Hủy yêu cầu tiền mặt"
          accessibilityState={{ disabled: busy, busy }}
          disabled={busy}
          onPress={onCancel}
          style={styles.cancel}
        >
          <Text style={styles.cancelText}>{busy ? 'Đang xử lý…' : 'Hủy yêu cầu tiền mặt'}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
