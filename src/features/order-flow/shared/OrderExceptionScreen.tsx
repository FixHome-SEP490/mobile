import React, { useState } from 'react';
import { TextInput } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useOrderException } from '../aftercare/useOrderException';
import { DetailRow, ReadOnlyNotice, TaskScreenShell } from './TaskScreenShell';
import { lightTheme as colors, spacing } from '../../../constants/theme';
import { vnDateTimeString } from '../../../utils/vn-time';
import { backFromFlow } from '../navigation/resume-order';

export default function OrderExceptionScreen() {
  const navigation = useNavigation<any>(); const { controller, state, view } = useOrderException(); const [reason, setReason] = useState('');
  const busy = ['verifying', 'submitting'].includes(state.phase); const confirming = !!state.confirmation; const locked = busy || ['confirming', 'unknown'].includes(state.phase) || confirming;
  const primary = confirming
    ? { label: busy ? 'Đang hủy…' : 'Xác nhận hủy đơn', disabled: busy || state.phase !== 'confirming', accessibilityHint: 'Xác nhận hủy đơn theo lý do đã nhập', onPress: () => void controller.submitConfirmation() }
    : { label: busy ? 'Đang kiểm tra…' : 'Kiểm tra điều kiện hủy', disabled: locked || state.phase !== 'idle' || !controller.canCancel() || reason.trim().length < 1, accessibilityHint: !controller.canCancel() ? 'Máy chủ chưa cho phép hủy ở trạng thái hiện tại' : 'Xác minh lại quyền và trạng thái đơn trước khi hiển thị xác nhận', onPress: () => { if (!busy && state.phase === 'idle' && controller.canCancel() && reason.trim()) void controller.prepareCancellation(reason.trim()); } };
  return <TaskScreenShell title="Hủy đơn sửa chữa" onBack={() => { controller.cancelConfirmation(); backFromFlow(navigation); }} primary={primary} secondary={{ label: confirming ? 'Sửa nội dung' : 'Quay lại', disabled: busy, onPress: () => { if (confirming) { controller.cancelConfirmation(); return; } controller.cancelConfirmation(); backFromFlow(navigation); } }}>
    {view.summary ? <><ReadOnlyNotice>Đây là bản tóm tắt lịch sử được phép xem. Thông tin liên hệ, lịch hẹn và bằng chứng của đơn không khả dụng.</ReadOnlyNotice><DetailRow label="Mã đơn" value={view.summary.code} /><DetailRow label="Tình trạng cuối" value={view.summary.status === 'COMPLETED' ? 'Đã hoàn thành' : view.summary.status === 'CANCELLED' ? 'Đã hủy' : 'Chưa xác định'} /><DetailRow label="Ngày tạo" value={vnDateTimeString(view.summary.createdAt)} /><DetailRow label="Hoàn tất" value={view.summary.completedAt ? vnDateTimeString(view.summary.completedAt) : null} /><DetailRow label="Đã hủy" value={view.summary.cancelledAt ? vnDateTimeString(view.summary.cancelledAt) : null} /></> : <>
      <ReadOnlyNotice>Hủy đơn có thể bị trừ điểm uy tín của bạn.</ReadOnlyNotice>
      <TextInput accessibilityLabel="Lý do hủy đơn" placeholder="Nhập lý do hủy" value={reason} editable={!locked} onChangeText={setReason} multiline maxLength={2000} style={{ minHeight: 100, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: spacing.md, color: colors.text, backgroundColor: colors.surface, textAlignVertical: 'top' }} />
      {view.access === 'revoked' ? <ReadOnlyNotice>Quyền xem đơn đã thay đổi. Dữ liệu riêng của đơn đã được xóa.</ReadOnlyNotice> : !controller.canCancel() ? <ReadOnlyNotice>Chỉ có thể hủy khi đơn đang ở trạng thái được phép và chưa bắt đầu sửa chữa. Nếu cần trợ giúp ở bước hiện tại, hãy gửi yêu cầu hỗ trợ.</ReadOnlyNotice> : null}
      {confirming ? <ReadOnlyNotice>{`Đơn sẽ bị hủy với lý do: ${state.confirmation?.reason}`}</ReadOnlyNotice> : null}
      {state.result === 'cancelled' ? <ReadOnlyNotice>Máy chủ đã xác nhận đơn được hủy.</ReadOnlyNotice> : null}
      {state.result === 'no-longer-assigned' ? <ReadOnlyNotice>Đơn không còn được phân công cho bạn. Bản tóm tắt lịch sử đã được cập nhật.</ReadOnlyNotice> : null}
    </>}
    {state.message ? <ReadOnlyNotice>{state.message}</ReadOnlyNotice> : null}
  </TaskScreenShell>;
}
