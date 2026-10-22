import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { isHistoricalOrder } from '../../../api/orders.api';
import { useOrderSession } from '../runtime/OrderSessionProvider';
import { useTechnicianArrivalProof } from './useTechnicianArrivalProof';
import { DetailRow, ReadOnlyNotice, TaskScreenShell } from '../shared/TaskScreenShell';
import TechnicianOrderHub from '../shared/TechnicianOrderHub';
import { vnDateTimeString } from '../../../utils/vn-time';
import { lightTheme as colors, spacing } from '../../../constants/theme';

/** T02 — ACCEPTED. Explicit two-step departure through the frozen controller. No location tracking here. */
export default function AcceptedJobScreen() {
  const { key, snapshot, refresh } = useOrderSession();
  const { controller, state } = useTechnicianArrivalProof();
  const navigation = useNavigation<any>();
  // Local confirm draft is keyed by session/order owner: a revoked session,
  // reassignment, or order switch hides it without an effect-driven reset.
  const [draft, setDraft] = useState<{ owner: string | null; confirming: boolean }>({ owner: null, confirming: false });
  const owner = key ? `${key.userId}/${key.sessionGeneration}/${key.serviceOrderId}` : null;
  const confirming = draft.owner === owner && draft.confirming;

  const orderValue = snapshot?.order.status === 'ready' ? snapshot.order.data : null;
  const order = orderValue && !isHistoricalOrder(orderValue) ? orderValue : null;
  const assignmentValid = !!order && !!key && order.technician?.id === key.userId && order.id === key.serviceOrderId;
  const revoked = !snapshot || snapshot.access !== 'current' || !key || !order || !assignmentValid;
  const refreshing = snapshot?.order.status === 'loading';
  const canRefresh = snapshot?.access === 'current' && !!key && !refreshing;
  const busy = state.phase === 'submitting' || state.phase === 'verifying';

  // Re-evaluated on a 30s tick so the depart button lights up on time.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNowTick(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const opensAt = order?.departAvailableAt ? Date.parse(order.departAvailableAt) : Number.NaN;
  const timeGatePassed = !revoked && Number.isFinite(opensAt) && (opensAt as number) <= nowTick;
  const canDepart = !revoked && !busy && order?.status === 'ACCEPTED' && timeGatePassed;

  const primaryLabel = busy
    ? 'Đang xử lý…'
    : state.phase === 'unknown'
      ? 'Kiểm tra lại'
      : confirming
        ? 'Xác nhận xuất phát'
        : 'Bắt đầu di chuyển';

  const onPrimary = () => {
    if (revoked || busy) return;
    if (state.phase === 'unknown') {
      void controller.verify();
      return;
    }
    if (!confirming) {
      setDraft({ owner, confirming: true });
      return;
    }
    void controller.depart();
  };

  return (
    <TaskScreenShell
      title="Chuẩn bị di chuyển"
      stage={1}
      onBack={() => navigation.goBack()}
      secondary={{
        label: confirming ? 'Hủy xác nhận' : 'Làm mới dữ liệu',
        testID: confirming ? 'depart-cancel' : 'task-refresh',
        disabled: busy || (!confirming && !canRefresh),
        onPress: () => {
          if (busy) return;
          if (confirming) setDraft({ owner, confirming: false });
          else if (canRefresh) void refresh('manual');
        },
      }}
      primary={{
        label: primaryLabel,
        testID: 'depart-confirm',
        disabled: revoked || busy || (!canDepart && state.phase !== 'unknown'),
        onPress: onPrimary,
      }}
    >
      <View style={{ backgroundColor: colors.surface, borderRadius: 14, paddingHorizontal: spacing.md }}>
        <DetailRow label="Mã đơn" value={order?.code} />
        <DetailRow label="Dịch vụ" value={order?.serviceName} />
        <DetailRow
          label="Lịch hẹn"
          value={order?.scheduledAt ? vnDateTimeString(order.scheduledAt) : 'Chưa có thông tin'}
        />
        <DetailRow label="Địa chỉ" value={order?.addressSummary} />
        <DetailRow
          label="Được phép xuất phát từ"
          value={
            order?.departAvailableAt && Number.isFinite(Date.parse(order.departAvailableAt))
              ? vnDateTimeString(order.departAvailableAt)
              : 'Chưa có thông tin'
          }
        />
      </View>
      {revoked ? (
        <ReadOnlyNotice>Quyền xem đơn đã thay đổi hoặc phân công không còn thuộc về bạn. Bản nháp xác nhận đã được xóa; không có thao tác nào được gửi.</ReadOnlyNotice>
      ) : !timeGatePassed ? (
        <ReadOnlyNotice>Chưa đến giờ được phép xuất phát theo máy chủ. Nút xuất phát sẽ mở khi đến thời điểm cho phép.</ReadOnlyNotice>
      ) : confirming && state.phase !== 'unknown' ? (
        <ReadOnlyNotice>Hãy xác nhận bạn đã sẵn sàng di chuyển tới điểm hẹn. Chỉ nhấn xác nhận khi bạn thực sự bắt đầu đi.</ReadOnlyNotice>
      ) : null}
      {state.phase === 'denied' && state.message ? (
        <ReadOnlyNotice>{state.message}</ReadOnlyNotice>
      ) : null}
      {state.phase === 'unknown' ? (
        <ReadOnlyNotice>Chưa xác nhận được kết quả. Không gửi lại; hãy kiểm tra từ hệ thống trước khi thử lại.</ReadOnlyNotice>
      ) : null}
      {state.phase === 'resolved' ? (
        <ReadOnlyNotice>Đã ghi nhận. Đang tải trạng thái mới từ máy chủ…</ReadOnlyNotice>
      ) : null}
      <TechnicianOrderHub />
    </TaskScreenShell>
  );
}
