import React, { useState } from 'react';
import { serviceOrderStatusView } from '../../../screens/technician/technician-status';
import { Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { isHistoricalOrder } from '../../../api/orders.api';
import { getOrderCapabilities } from '../domain/order-capabilities';
import { useOrderSession } from '../runtime/OrderSessionProvider';
import { useTechnicianArrivalProof } from './useTechnicianArrivalProof';
import { DetailRow, ReadOnlyNotice, TaskScreenShell } from '../shared/TaskScreenShell';
import { lightTheme as colors, spacing } from '../../../constants/theme';

/**
 * TR — Backend still EN_ROUTE after proof capture. Recovery POST only when the
 * frozen capability check passes on attested policy, with explicit confirm.
 * Absent policy keeps recovery disabled with capture/refresh/support guidance.
 */
export default function RepairRecoveryScreen() {
  const { key, snapshot, refresh, loadResource } = useOrderSession();
  const { controller, state } = useTechnicianArrivalProof();
  const navigation = useNavigation<any>();
  // Confirm draft is keyed by session/order owner: revocation or reassignment
  // hides it without an effect-driven reset.
  const [draft, setDraft] = useState<{ owner: string | null; confirming: boolean }>({ owner: null, confirming: false });
  const owner = key ? `${key.userId}/${key.sessionGeneration}/${key.serviceOrderId}` : null;
  const confirming = draft.owner === owner && draft.confirming;

  const orderValue = snapshot?.order.status === 'ready' ? snapshot.order.data : null;
  const order = orderValue && !isHistoricalOrder(orderValue) ? orderValue : null;
  const assignmentValid = !!order && !!key && order.technician?.id === key.userId && order.id === key.serviceOrderId;
  const revoked = !snapshot || snapshot.access !== 'current' || !key || !order || !assignmentValid;
  const evidenceReady = snapshot?.resources.evidence.status === 'ready';
  const evidenceLoading = snapshot?.resources.evidence.status === 'loading';
  const ownEvidence = evidenceReady && snapshot?.resources.evidence.status === 'ready'
    ? snapshot.resources.evidence.data.filter(e => e.serviceOrderId === key?.serviceOrderId && e.uploaderId === key?.userId)
    : [];
  const hasOwnFace = Array.isArray(ownEvidence) && ownEvidence.some(e => e.type === 'CHECKIN_FACE');
  const beforeCount = Array.isArray(ownEvidence) ? ownEvidence.filter(e => e.type === 'BEFORE').length : 0;
  const capabilities = snapshot ? getOrderCapabilities(snapshot) : { canRecoverRepair: false };
  const policyMissing = snapshot?.proofPolicy?.beforeMinimum === undefined;
  const refreshing = snapshot?.order.status === 'loading' || evidenceLoading;
  const canRefresh = snapshot?.access === 'current' && !!key && !refreshing;
  const busy = state.phase === 'submitting' || state.phase === 'verifying';
  const hasPendingIntent = snapshot?.pendingIntent === true;
  const isUnresolved = state.phase === 'unknown' || hasPendingIntent;
  const canVerify = !revoked && !busy && isUnresolved;
  const canRecover = !revoked && !busy && !isUnresolved && !!evidenceReady && capabilities.canRecoverRepair && order?.status === 'EN_ROUTE';

  const onPrimary = () => {
    if (revoked || busy) return;
    if (canVerify) {
      void controller.verify();
      return;
    }
    if (!canRecover) return;
    if (!confirming) {
      setDraft({ owner, confirming: true });
      return;
    }
    void controller.recoverRepair(true);
  };

  return (
    <TaskScreenShell
      title="Tiếp tục sửa chữa"
      stage={2}
      onBack={() => navigation.goBack()}
      secondary={{
        label: confirming ? 'Hủy xác nhận' : 'Làm mới dữ liệu',
        testID: confirming ? 'recovery-cancel' : 'task-refresh',
        disabled: busy || (!confirming && !canRefresh),
        onPress: () => {
          if (busy) return;
          if (confirming) setDraft({ owner, confirming: false });
          else if (canRefresh) {
            if (snapshot?.resources.evidence.status === 'unloaded') void loadResource('evidence');
            void refresh('manual');
          }
        },
      }}
      primary={{
        label: busy ? 'Đang xử lý…' : canVerify ? 'Kiểm tra lại' : confirming ? 'Xác nhận phục hồi' : 'Yêu cầu tiếp tục sửa chữa',
        testID: 'recovery-confirm',
        disabled: revoked || busy || (!canVerify && !canRecover),
        onPress: onPrimary,
      }}
    >
      <View style={{ backgroundColor: colors.surface, borderRadius: 14, paddingHorizontal: spacing.md }}>
        <DetailRow label="Mã đơn" value={order?.code} />
        <DetailRow label="Trạng thái máy chủ" value={serviceOrderStatusView(order?.status).label} />
        <DetailRow label="Ảnh khuôn mặt" value={hasOwnFace ? 'Đã có ảnh của bạn' : 'Chưa có ảnh của bạn'} />
        <DetailRow label="Ảnh trước sửa chữa của bạn" value={evidenceReady ? String(beforeCount) : 'Đang tải…'} />
      </View>
      {revoked ? (
        <ReadOnlyNotice>Quyền xem đơn đã thay đổi hoặc phân công không còn thuộc về bạn. Bản nháp xác nhận đã được xóa; không có thao tác nào được gửi.</ReadOnlyNotice>
      ) : !evidenceReady && !isUnresolved ? (
        <ReadOnlyNotice>Đang tải danh sách ảnh từ máy chủ. Mọi quyết định phục hồi đều khóa cho đến khi dữ liệu ảnh đầy đủ.</ReadOnlyNotice>
      ) : isUnresolved ? (
        <ReadOnlyNotice>Chưa xác nhận được kết quả hoặc có thao tác đang chờ đối chiếu. Không gửi lại; hãy kiểm tra từ hệ thống trước khi thử lại.</ReadOnlyNotice>
      ) : (
        <ReadOnlyNotice>
          Máy chủ vẫn ghi đơn ở trạng thái đang di chuyển. Hãy làm mới để kiểm tra; chỉ khi ảnh của bạn đã đủ theo yêu cầu hệ thống mới có thể yêu cầu tiếp tục sửa chữa.
        </ReadOnlyNotice>
      )}
      {!revoked && !isUnresolved && !!evidenceReady && policyMissing ? (
        <ReadOnlyNotice>
          Chưa xác minh được số ảnh hệ thống yêu cầu. Hãy chụp thêm ảnh trước sửa chữa, làm mới dữ liệu, hoặc liên hệ hỗ trợ.
        </ReadOnlyNotice>
      ) : null}
      {!revoked && !isUnresolved && !!evidenceReady && !policyMissing && !capabilities.canRecoverRepair ? (
        <ReadOnlyNotice>Ảnh của bạn chưa đủ điều kiện phục hồi theo máy chủ. Hãy chụp thêm ảnh rồi làm mới trước khi thử lại.</ReadOnlyNotice>
      ) : null}
      {confirming && !isUnresolved ? (
        <ReadOnlyNotice>Thao tác phục hồi chỉ dùng khi máy chủ chưa tự bắt đầu sửa chữa. Chỉ xác nhận khi bạn đã đứng tại điểm hẹn và ảnh đã đủ.</ReadOnlyNotice>
      ) : null}
      {state.phase === 'denied' && state.message ? <ReadOnlyNotice>{state.message}</ReadOnlyNotice> : null}
      {state.phase === 'resolved' ? (
        <ReadOnlyNotice>Đã ghi nhận. Đang chờ máy chủ xác nhận; trạng thái mới sẽ tự cập nhật sau khi làm mới.</ReadOnlyNotice>
      ) : null}
      {!revoked && !!evidenceReady && order?.status === 'EN_ROUTE' ? (
        <TouchableOpacity
          testID="recovery-capture-link"
          accessibilityRole="button"
          accessibilityHint="Mở màn chụp ảnh trước sửa chữa với cùng quy tắc xác minh"
          onPress={() => navigation.navigate('BeforeCapture')}
          style={{
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 12,
            minHeight: 52,
            justifyContent: 'center',
            paddingHorizontal: spacing.md,
          }}
        >
          <Text style={{ color: colors.primaryStrong, fontSize: 15, fontWeight: '600' }}>Chụp thêm ảnh trước sửa chữa ›</Text>
        </TouchableOpacity>
      ) : null}
    </TaskScreenShell>
  );
}
