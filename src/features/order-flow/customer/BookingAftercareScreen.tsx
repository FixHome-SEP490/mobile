import React, { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useBookingAftercare } from './useBookingAftercare';
import type { SupportDraft } from '../aftercare/support-controller';
import { DetailRow, ReadOnlyNotice, TaskScreenShell } from '../shared/TaskScreenShell';
import { lightTheme as colors, spacing } from '../../../constants/theme';

const caseTypeLabel: Record<string, string> = { matching_exhausted: 'Chưa tìm được kỹ thuật viên', arrival_abnormal: 'Vấn đề khi kỹ thuật viên đến', cash_non_response: 'Chưa xác nhận tiền mặt', cash_mismatch: 'Sai lệch tiền mặt', cancellation_review: 'Xem xét hủy đơn', parts_dispute: 'Tranh chấp linh kiện', warranty_dispute: 'Vấn đề bảo hành', mid_job_interruption: 'Gián đoạn công việc', property_damage: 'Tài sản bị ảnh hưởng', quality: 'Chất lượng sửa chữa', pricing_dispute: 'Tranh chấp chi phí', conduct: 'Ứng xử', other: 'Nội dung khác', technician_replacement: 'Đổi kỹ thuật viên' };
const caseStatusLabel: Record<string, string> = { open: 'Đang mở', in_review: 'Đang được xem xét', resolved: 'Đã xử lý', rejected: 'Không được chấp nhận' };
const bookingStatusLabel: Record<string, string> = { SUBMITTED: 'Đã gửi yêu cầu', PENDING: 'Đang chờ xác nhận', MATCHING: 'Đang tìm kỹ thuật viên', MATCHED: 'Đã tìm được kỹ thuật viên', CONFIRMED: 'Đã xác nhận lịch', CLOSED: 'Đã đóng', CANCELLED: 'Đã hủy' };

const field = { minHeight: 52, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: spacing.md, color: colors.text, backgroundColor: colors.surface, textAlignVertical: 'top' as const };
const choice = { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: spacing.md, justifyContent: 'center' as const, backgroundColor: colors.surface };

/** Booking remains a separate permission context and never borrows OrderSession. */
export default function BookingAftercareScreen() {
  const route = useRoute<any>(); const bookingId = route.params?.bookingId as string | undefined;
  return <BookingAftercareForId key={bookingId ?? 'missing'} bookingId={bookingId} />;
}

function BookingAftercareForId({ bookingId }: { bookingId?: string }) {
  const navigation = useNavigation<any>();
  const { booking, support, bookingState, supportState, recovery } = useBookingAftercare(bookingId ?? null);
  useEffect(() => () => { booking.cancelConfirmation(); support.cancelConfirmation(); }, [booking, support]);
  const [reason, setReason] = useState(''); const [mode, setMode] = useState<'summary' | 'support-create' | 'support-detail'>('summary');
  const [type, setType] = useState<SupportDraft['caseType'] | null>(null); const [supportReason, setSupportReason] = useState(''); const [description, setDescription] = useState('');
  const busy = ['verifying', 'submitting'].includes(bookingState.phase); const caseBusy = ['verifying', 'submitting'].includes(supportState.phase);
  const bookingLocked = busy || ['confirming', 'unknown'].includes(bookingState.phase) || !!bookingState.confirmation;
  const supportLocked = caseBusy || ['confirming', 'unknown'].includes(supportState.phase) || !!supportState.confirmation;
  const confirmedCancel = !!bookingState.confirmation; const confirmedSupport = !!supportState.confirmation;
  const record = bookingState.booking.status === 'ready' ? bookingState.booking.data : null;
  const detail = supportState.detail.status === 'ready' ? supportState.detail.data : null;
  const supportRows = supportState.list.status === 'ready' ? supportState.list.data : [];
  useEffect(() => { if (record && supportState.list.status === 'unloaded') void support.loadList(); }, [record, support, supportState.list.status]);
  const activeMode = mode === 'support-create' && supportState.phase === 'resolved' && supportState.detail.status === 'ready' ? 'support-detail' : mode;

  const rootFooter = activeMode === 'support-create'
    ? confirmedSupport
      ? { label: caseBusy ? '\u0110ang g\u1eedi\u2026' : 'X\u00e1c nh\u1eadn g\u1eedi', disabled: caseBusy || supportState.phase !== 'confirming', onPress: () => void support.submitConfirmation() }
      : supportState.phase === 'idle' && type
        ? { label: 'Ki\u1ec3m tra y\u00eau c\u1ea7u', disabled: !support.allowedTypes().includes(type) || !supportReason.trim(), onPress: () => void support.prepare({ caseType: type, reason: supportReason.trim(), ...(description.trim() ? { description: description.trim() } : {}) }) }
        : undefined
    : confirmedCancel
      ? { label: busy ? '\u0110ang h\u1ee7y\u2026' : 'X\u00e1c nh\u1eadn h\u1ee7y y\u00eau c\u1ea7u \u0111\u1eb7t l\u1ecbch', disabled: busy || bookingState.phase !== 'confirming', onPress: () => void booking.submitConfirmation() }
      : activeMode === 'summary' && recovery.kind === 'booking' && bookingState.phase === 'idle'
        ? { label: 'Ki\u1ec3m tra \u0111i\u1ec1u ki\u1ec7n h\u1ee7y', disabled: !record || !reason.trim(), onPress: () => void booking.prepareCancellation(reason.trim()) }
        : undefined;
  return <TaskScreenShell title="Yêu cầu đặt lịch" onBack={() => { booking.cancelConfirmation(); support.cancelConfirmation(); navigation.goBack(); }} primary={rootFooter} secondary={{ label: confirmedCancel || confirmedSupport ? '\u0053\u1eeda n\u1ed9i dung' : activeMode === 'summary' ? 'Làm mới' : 'Quay lại', disabled: busy || caseBusy, onPress: () => { if (confirmedCancel) { booking.cancelConfirmation(); return; } if (confirmedSupport) { support.cancelConfirmation(); return; }
    if (activeMode !== 'summary') { booking.cancelConfirmation(); support.cancelConfirmation(); setMode('summary'); return; }
    if (bookingId) void booking.refresh();
  } }}>
    {!record ? bookingState.booking.status === 'error' ? <ReadOnlyNotice>Không thể xác minh yêu cầu đặt lịch. Hãy quay lại danh sách và mở lại yêu cầu.</ReadOnlyNotice> : <ReadOnlyNotice>Đang xác minh quyền xem yêu cầu đặt lịch…</ReadOnlyNotice> : <>
      <View style={{ backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: spacing.md }}><DetailRow label="Mã yêu cầu" value={record.id} /><DetailRow label="Tình trạng" value={bookingStatusLabel[record.status] || 'Chưa xác định'} /><DetailRow label="Đơn sửa chữa liên kết" value={record.serviceOrderId || 'Chưa liên kết'} /></View>
      {recovery.kind === 'order' ? <ReadOnlyNotice>Yêu cầu này đã liên kết với đơn sửa chữa. Hãy mở đơn liên kết để tiếp tục.</ReadOnlyNotice> : null}
      {recovery.kind === 'matching' ? <ReadOnlyNotice>Yêu cầu đang tìm kỹ thuật viên. Làm mới để kiểm tra tình trạng hiện tại.</ReadOnlyNotice> : null}
      {recovery.kind === 'reselect' ? <ReadOnlyNotice>Yêu cầu đã đóng. Hãy chọn lại lịch hiện có để tiếp tục; không tạo hoặc hủy thay cho bạn.</ReadOnlyNotice> : null}
      {recovery.kind === 'cancelled' ? <ReadOnlyNotice>Máy chủ đã xác nhận yêu cầu được hủy.</ReadOnlyNotice> : null}
      {recovery.kind === 'booking' && !confirmedCancel ? <>
        <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700' }}>Hủy yêu cầu đặt lịch</Text><TextInput accessibilityLabel="Lý do hủy yêu cầu đặt lịch" value={reason} editable={!bookingLocked} onChangeText={setReason} multiline maxLength={2000} style={[field, { minHeight: 90 }]} />
        {bookingState.phase === 'unknown' ? <ReadOnlyNotice>Chưa xác minh được kết quả. Làm mới để kiểm tra; không gửi lại yêu cầu khi kết quả chưa rõ.</ReadOnlyNotice> : null}

      </> : null}
      {confirmedCancel ? <ReadOnlyNotice>{`Yêu cầu ${record.id} sẽ bị hủy với lý do bạn nhập. Xác nhận để gửi.`}</ReadOnlyNotice> : null}
      {activeMode === 'summary' ? <>
        <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700' }}>Yêu cầu hỗ trợ đã xác minh</Text>
        {supportState.list.status === 'loading' || supportState.list.status === 'unloaded' ? <ReadOnlyNotice>Đang tải danh sách hỗ trợ…</ReadOnlyNotice> : null}
        {supportState.list.status === 'error' ? <ReadOnlyNotice>Không tải được danh sách hỗ trợ. Hãy làm mới để thử lại.</ReadOnlyNotice> : null}
        {supportState.list.status === 'ready' ? <ReadOnlyNotice>{`Đã xác minh ${supportState.knownActorOpenCount ?? 0} yêu cầu đang mở do bạn tạo. Đây là số đã biết, không phải tổng số yêu cầu đang mở.`}</ReadOnlyNotice> : null}
        {supportRows.map(item => <Pressable key={item.id} accessibilityRole="button" onPress={() => { void support.loadDetail(item.id); setMode('support-detail'); }} style={choice}><Text style={{ color: colors.primaryStrong }}>{caseTypeLabel[item.caseType] || 'Yêu cầu hỗ trợ'} · {caseStatusLabel[item.status] || 'Chưa xác định'} ›</Text></Pressable>)}
        <Pressable accessibilityRole="button" onPress={() => { setType(support.allowedTypes()[0] ?? null); setMode('support-create'); }} style={choice}><Text style={{ color: colors.primaryStrong }}>Tạo yêu cầu hỗ trợ ›</Text></Pressable>
      </> : null}
      {activeMode === 'support-create' ? <>
        <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700' }}>Tạo yêu cầu hỗ trợ</Text>
        {support.allowedTypes().map(value => <Pressable key={value} accessibilityRole="radio" disabled={supportLocked} accessibilityState={{ checked: type === value, disabled: supportLocked }} onPress={() => setType(value)} style={[choice, type === value && { borderColor: colors.primaryStrong }]}><Text style={{ color: colors.text }}>{caseTypeLabel[value] || 'Yêu cầu hỗ trợ'}</Text></Pressable>)}
        <TextInput accessibilityLabel="Lý do hỗ trợ" placeholder="Lý do" value={supportReason} editable={!supportLocked} onChangeText={setSupportReason} maxLength={2000} multiline style={field} />
        <TextInput accessibilityLabel="Mô tả thêm" placeholder="Mô tả thêm (không bắt buộc)" value={description} editable={!supportLocked} onChangeText={setDescription} maxLength={5000} multiline style={[field, { minHeight: 100 }]} />
        <ReadOnlyNotice>Ảnh mới đang chờ hỗ trợ lưu trữ riêng tư. Chỉ bằng chứng đã được cấp quyền mới có thể dùng.</ReadOnlyNotice>
        {confirmedSupport ? <ReadOnlyNotice>Hãy xem lại loại và nội dung hỗ trợ trước khi xác nhận gửi.</ReadOnlyNotice> : null}
      </> : null}
      {activeMode === 'support-detail' ? detail ? <View style={{ backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: spacing.md }}><DetailRow label="Mã yêu cầu" value={detail.id} /><DetailRow label="Tình trạng" value={caseStatusLabel[detail.status] || 'Chưa xác định'} /><DetailRow label="Loại hỗ trợ" value={caseTypeLabel[detail.caseType] || 'Yêu cầu hỗ trợ'} /><DetailRow label="Lý do" value={detail.reason} /><DetailRow label="Mô tả" value={detail.description} /><DetailRow label="Lý do xử lý" value={detail.resolutionReason} /><DetailRow label="Thời điểm xử lý" value={detail.resolvedAt} /></View> : supportState.detail.status === 'error' ? <ReadOnlyNotice>Không thể xác minh yêu cầu hỗ trợ này. Hãy mở từ danh sách và thử lại.</ReadOnlyNotice> : <ReadOnlyNotice>Đang xác minh yêu cầu hỗ trợ…</ReadOnlyNotice> : null}
      {bookingState.message || supportState.message ? <ReadOnlyNotice>{bookingState.message || supportState.message}</ReadOnlyNotice> : null}
    </>}
  </TaskScreenShell>;
}
