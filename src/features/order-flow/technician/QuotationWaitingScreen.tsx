import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Clock } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { isHistoricalOrder } from '../../../api/orders.api';
import { useOrderSession } from '../runtime/OrderSessionProvider';
import { useTechnicianQuotation } from './useTechnicianQuotation';
import { getRestoredQuotationRecovery } from '../domain/quotation-recovery';
import type { OrderQuotation } from '../domain/order-session.types';
import { ReadOnlyNotice, TaskScreenShell } from '../shared/TaskScreenShell';
import TechnicianOrderHub from '../shared/TechnicianOrderHub';
import { quoteMoneyText } from '../shared/DecisionSummary';
import { useLoadUnloadedResources } from '../shared/useLoadUnloadedResources';
import { vnDateTimeString } from '../../../utils/vn-time';
import { lightTheme as colors, spacing } from '../../../constants/theme';

function latestOwnQuote(quotations: OrderQuotation[] | undefined, serviceOrderId: string, technicianId: string): OrderQuotation | null {
  if (!quotations) return null;
  const own = quotations.filter(q => q.serviceOrderId === serviceOrderId && q.technicianId === technicianId);
  if (!own.length) return null;
  return [...own].sort((a, b) => (b.version ?? 0) - (a.version ?? 0))[0];
}

/**
 * T08 — technician waits for the customer decision on the exact current own
 * SENT quote. Server state only: compact version/time/total and who is
 * awaited. Navigation follows the readback server state; history and BEFORE
 * evidence stay on their own screens, never faked from here.
 */
export default function QuotationWaitingScreen() {
  const { key, snapshot, refresh, loadResource, journal } = useOrderSession();
  const navigation = useNavigation<any>();
  const { controller, state } = useTechnicianQuotation();

  useLoadUnloadedResources(snapshot, ['quotations'], loadResource);

  const orderValue = snapshot?.order.status === 'ready' ? snapshot.order.data : null;
  const order = orderValue && !isHistoricalOrder(orderValue) ? orderValue : null;
  const current = !!key && !!order && snapshot?.access === 'current' && order.id === key.serviceOrderId && order.technician?.id === key.userId;
  const quotationsReady = snapshot?.resources.quotations.status === 'ready';
  const latest = current && quotationsReady
    ? latestOwnQuote(
        (snapshot?.resources.quotations.status === 'ready' ? snapshot.resources.quotations.data : undefined),
        key!.serviceOrderId,
        key!.userId,
      )
    : null;
  const sentQuote = latest && String(latest.status).toUpperCase() === 'SENT' ? latest : null;

  const recovery = useMemo(
    () => (key && snapshot ? getRestoredQuotationRecovery(journal, key, snapshot) : { hasRecovery: false as const, isUnresolved: false as const }),
    [journal, key, snapshot],
  );
  const showRecovery = recovery.hasRecovery && recovery.operation === 'quote-create';

  const busy = state.phase === 'submitting' || state.phase === 'verifying';
  const refreshing = snapshot?.order.status === 'loading' || snapshot?.resources.quotations.status === 'loading';

  const approved = latest && String(latest.status).toUpperCase() === 'APPROVED';
  const serverNext = approved && order?.status === 'UNDER_REPAIR'
    ? 'Khách đã duyệt. Đơn đang sửa chữa.'
    : approved
      ? 'Khách đã duyệt. Chờ máy chủ chuyển bước.'
      : latest && String(latest.status).toUpperCase() === 'REJECTED' && order?.status === 'CANCELLED'
        ? 'Báo giá bị từ chối, đơn đã hủy.'
        : null;

  const onPrimary = () => {
    if (busy) return;
    if (state.phase === 'unknown' || (state.phase === 'idle' && showRecovery)) {
      void controller.verify();
      return;
    }
    navigation.navigate('OrderTask');
  };

  if (!current || !order) {
    return (
      <TaskScreenShell title="Chờ duyệt báo giá" onBack={() => navigation.goBack()}>
        <ReadOnlyNotice>
          {snapshot?.access === 'historical'
            ? 'Báo giá không được tải cho đơn lịch sử.'
            : 'Trạng thái chờ chỉ được đọc sau khi máy chủ xác minh quyền xem đơn hiện tại.'}
        </ReadOnlyNotice>
      </TaskScreenShell>
    );
  }

  return (
    <TaskScreenShell
      title="Chờ duyệt báo giá"
      stage={2}
      onBack={() => navigation.goBack()}
      secondary={{
        label: 'Làm mới dữ liệu',
        testID: 'task-refresh',
        disabled: busy || refreshing,
        onPress: () => {
          if (!busy && !refreshing) void refresh('manual');
        },
      }}
      primary={{
        label: busy ? 'Đang xử lý.' : state.phase === 'unknown' || (state.phase === 'idle' && showRecovery) ? 'Kiểm tra lại' : 'Tiếp tục',
        testID: state.phase === 'unknown' || (state.phase === 'idle' && showRecovery) ? 'quote-verify' : 'quote-continue',
        disabled: busy,
        onPress: onPrimary,
      }}
    >
      {showRecovery && (
        <ReadOnlyNotice>
          Có thao tác tạo báo giá chưa rõ kết quả từ phiên trước (mã {recovery.hasRecovery ? recovery.entityId : ''}). Hãy kiểm tra lại từ máy chủ, không tạo mới.
        </ReadOnlyNotice>
      )}

      {!quotationsReady && <ReadOnlyNotice>Đang tải báo giá từ máy chủ.</ReadOnlyNotice>}

      {sentQuote && (
        <View style={styles.card}>
          <View style={styles.head}>
            <Text accessibilityRole="header" style={styles.title}>Báo giá lần {sentQuote.version ?? '—'}</Text>
            <View style={[styles.chip, { backgroundColor: colors.tone.warning.bg }]}>
              <Text style={[styles.chipText, { color: colors.tone.warning.text }]}>Chờ duyệt báo giá</Text>
            </View>
          </View>
          {sentQuote.sentAt ? <Text style={styles.meta}>Gửi lúc {vnDateTimeString(sentQuote.sentAt)}</Text> : null}
          <View style={[styles.banner, { backgroundColor: colors.tone.info.bg }]}>
            <Clock size={20} strokeWidth={1.75} color={colors.tone.info.fg} />
            <View style={styles.bannerText}>
              <Text style={[styles.bannerTitle, { color: colors.tone.info.text }]}>Đang chờ khách hàng duyệt</Text>
              <Text style={styles.meta}>Sau khi khách duyệt, bạn có thể bắt đầu sửa chữa.</Text>
            </View>
          </View>
          <View style={styles.totals}>
            <View style={styles.row}><Text style={styles.label}>Tiền công</Text><Text style={styles.value}>{quoteMoneyText(sentQuote.laborTotal)}</Text></View>
            <View style={styles.row}><Text style={styles.label}>Linh kiện</Text><Text style={styles.value}>{quoteMoneyText(sentQuote.partsTotal)}</Text></View>
          </View>
        </View>
      )}

      {!sentQuote && quotationsReady && latest && String(latest.status).toUpperCase() === 'SUPERSEDED' && (
        <ReadOnlyNotice>Báo giá này đã được thay thế bằng phiên bản mới hơn. Màn hình hiển thị đúng phạm vi hiện tại sau khi làm mới; không coi bản cũ là đang chờ.</ReadOnlyNotice>
      )}
      {!sentQuote && quotationsReady && (!latest || !['SUPERSEDED', 'APPROVED', 'REJECTED'].includes(String(latest.status).toUpperCase())) && (
        <ReadOnlyNotice>Chưa có báo giá nào đang chờ duyệt cho đơn này.</ReadOnlyNotice>
      )}

      {serverNext && <ReadOnlyNotice>{serverNext}</ReadOnlyNotice>}
      {state.phase === 'unknown' && <ReadOnlyNotice>{state.message ?? 'Kết quả chưa xác định. Không gửi lại.'}</ReadOnlyNotice>}

      {sentQuote && (
        <TouchableOpacity
          testID="quote-proposal-link"
          accessibilityRole="button"
          onPress={() => navigation.navigate('ProposalDetail', { proposalId: sentQuote.id })}
          style={styles.link}
        >
          <Text style={styles.linkText}>Xem chi tiết báo giá</Text>
        </TouchableOpacity>
      )}
      <TechnicianOrderHub />
    </TaskScreenShell>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, padding: spacing.md, gap: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  title: { color: colors.text, fontSize: 20, lineHeight: 28, fontWeight: '600' },
  chip: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, minHeight: 24, justifyContent: 'center' },
  chipText: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  meta: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  banner: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderRadius: 12, padding: spacing.md },
  bannerText: { flex: 1, minWidth: 0, gap: 2 },
  bannerTitle: { fontSize: 15, lineHeight: 22, fontWeight: '600' },
  totals: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 12, gap: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 },
  label: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
  value: { color: colors.text, fontSize: 14, lineHeight: 20, fontWeight: '600', fontVariant: ['tabular-nums'] },
  link: { minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12 },
  linkText: { color: colors.primaryStrong, fontSize: 15, fontWeight: '600' },
});
