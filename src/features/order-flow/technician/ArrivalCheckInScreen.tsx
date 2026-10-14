import React, { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { isHistoricalOrder } from '../../../api/orders.api';
import { useOrderSession } from '../runtime/OrderSessionProvider';
import { useTechnicianArrivalProof } from './useTechnicianArrivalProof';
import { captureFreshOrderPosition } from './arrival-proof-production';
import type { FreshOrderPosition } from './arrival-proof-controller';
import { DetailRow, ReadOnlyNotice, TaskScreenShell } from '../shared/TaskScreenShell';
import { vnDateTimeString } from '../../../utils/vn-time';
import { lightTheme as colors, spacing } from '../../../constants/theme';

/**
 * Manual T04 — separate typed route, never an automatic OrderTask taskId.
 * Fresh OS sample first, then explicit confirm. Unknown outcomes only verify (GET).
 * Local resolved never advances the order; the server readback decides.
 */
export default function ArrivalCheckInScreen() {
  const { key, snapshot, refresh } = useOrderSession();
  const { controller, state } = useTechnicianArrivalProof();
  const navigation = useNavigation<any>();
  // Position draft is keyed by session/order owner: revocation or reassignment
  // hides it without an effect-driven reset. No cached or fake coordinates.
  const [draft, setDraft] = useState<{ owner: string | null; position: FreshOrderPosition | null; error: string | null }>({
    owner: null,
    position: null,
    error: null,
  });
  const [capturing, setCapturing] = useState(false);

  const orderValue = snapshot?.order.status === 'ready' ? snapshot.order.data : null;
  const order = orderValue && !isHistoricalOrder(orderValue) ? orderValue : null;
  const assignmentValid = !!order && !!key && order.technician?.id === key.userId && order.id === key.serviceOrderId;
  const revoked = !snapshot || snapshot.access !== 'current' || !key || !order || !assignmentValid;
  const refreshing = snapshot?.order.status === 'loading';
  const canRefresh = snapshot?.access === 'current' && !!key && !refreshing;
  const busy = state.phase === 'submitting' || state.phase === 'verifying' || capturing;
  const owner = key ? `${key.userId}/${key.sessionGeneration}/${key.serviceOrderId}` : null;
  const position = !revoked && draft.owner === owner ? draft.position : null;
  const captureError = !revoked && draft.owner === owner ? draft.error : null;
  const alreadyVerified = !revoked && (order?.arrivalVerified === true || order?.status === 'UNDER_REPAIR');
  const hasFreshSample = !!position && position.permission === 'granted';
  const canConfirm = !revoked && !busy && !alreadyVerified && hasFreshSample && order?.status === 'EN_ROUTE';

  const capture = async () => {
    if (revoked || capturing || alreadyVerified) return;
    setCapturing(true);
    setDraft({ owner, position: null, error: null });
    try {
      const sample = await captureFreshOrderPosition();
      if (sample.permission !== 'granted') {
        setDraft({ owner, position: null, error: 'Không có quyền vị trí. Hãy mở cài đặt thiết bị để cho phép, sau đó lấy lại vị trí.' });
        return;
      }
      setDraft({ owner, position: sample, error: null });
    } catch {
      setDraft({ owner, position: null, error: 'Chưa lấy được vị trí. Hãy thử lại ở nơi thoáng.' });
    } finally {
      setCapturing(false);
    }
  };

  const confirm = () => {
    if (!canConfirm || !position) return;
    void controller.checkIn(position);
  };

  return (
    <TaskScreenShell
      title="Xác nhận đã tới nơi"
      stage={2}
      onBack={() => navigation.goBack()}
      secondary={{
        label: capturing ? 'Đang lấy vị trí…' : 'Lấy vị trí mới',
        testID: 'capture-position',
        disabled: revoked || busy || alreadyVerified,
        onPress: () => {
          void capture();
        },
      }}
      primary={{
        label: state.phase === 'unknown' ? 'Kiểm tra lại' : alreadyVerified ? 'Tiếp tục' : 'Xác nhận đã tới nơi',
        testID: 'confirm-checkin',
        disabled: revoked || busy || (state.phase !== 'unknown' && !alreadyVerified && !canConfirm),
        onPress: () => {
          if (revoked || busy) return;
          if (state.phase === 'unknown') void controller.verify();
          else if (alreadyVerified) navigation.navigate('OrderTask');
          else confirm();
        },
      }}
    >
      <View style={{ backgroundColor: colors.surface, borderRadius: 14, paddingHorizontal: spacing.md }}>
        <DetailRow label="Mã đơn" value={order?.code} />
        <DetailRow label="Địa chỉ" value={order?.addressSummary} />
        <DetailRow
          label="Mẫu vị trí"
          value={
            position && position.permission === 'granted'
              ? `Sai số khoảng ${Number.isFinite(position.accuracyMeters) ? Math.round(position.accuracyMeters) : 'chưa rõ'} m · ${vnDateTimeString(position.timestamp)}`
              : 'Chưa có mẫu mới'
          }
        />
      </View>
      {alreadyVerified ? (
        <ReadOnlyNotice>Vị trí đã được máy chủ xác minh. Nhấn “Tiếp tục” để chuyển sang bước tiếp theo.</ReadOnlyNotice>
      ) : revoked ? (
        <ReadOnlyNotice>Quyền xem đơn đã thay đổi hoặc phân công không còn thuộc về bạn. Mẫu vị trí đã được xóa; không có thao tác nào được gửi.</ReadOnlyNotice>
      ) : (
        <ReadOnlyNotice>
          Hãy đứng tại điểm hẹn, nhấn “Lấy vị trí mới”, rồi xác nhận đúng vị trí thực tế của bạn. Mỗi lần bị từ chối cần một mẫu mới.
        </ReadOnlyNotice>
      )}
      {captureError ? <ReadOnlyNotice>{captureError}</ReadOnlyNotice> : null}
      {state.phase === 'denied' && state.message ? <ReadOnlyNotice>{state.message}</ReadOnlyNotice> : null}
      {state.phase === 'unknown' ? (
        <ReadOnlyNotice>Chưa xác nhận được kết quả. Không gửi lại; hãy kiểm tra từ hệ thống trước khi thử lại.</ReadOnlyNotice>
      ) : null}
      {state.phase === 'resolved' ? (
        <ReadOnlyNotice>Đã ghi nhận vị trí. Đang chờ máy chủ xác minh; trạng thái mới sẽ tự cập nhật sau khi làm mới.</ReadOnlyNotice>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TouchableOpacity
          testID="task-detail-link"
          accessibilityRole="button"
          disabled={revoked}
          onPress={() => {
            if (!revoked) navigation.navigate('OrderInformation');
          }}
          style={{
            flex: 1,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 12,
            minHeight: 52,
            justifyContent: 'center',
            paddingHorizontal: spacing.md,
            opacity: revoked ? 0.5 : 1,
          }}
        >
          <Text style={{ color: colors.primaryStrong, fontSize: 15, fontWeight: '600' }}>Xem thông tin đơn ›</Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="task-manual-refresh"
          accessibilityRole="button"
          disabled={!canRefresh}
          onPress={() => {
            if (canRefresh) void refresh('manual');
          }}
          style={{
            flex: 1,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 12,
            minHeight: 52,
            justifyContent: 'center',
            paddingHorizontal: spacing.md,
            opacity: !canRefresh ? 0.5 : 1,
          }}
        >
          <Text style={{ color: colors.primaryStrong, fontSize: 15, fontWeight: '600' }}>Làm mới dữ liệu ›</Text>
        </TouchableOpacity>
      </View>
    </TaskScreenShell>
  );
}
