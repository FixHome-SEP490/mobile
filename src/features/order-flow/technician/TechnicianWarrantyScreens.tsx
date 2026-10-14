import React, { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { WarrantyCommandDto } from '../aftercare/aftercare-contracts';
import { useTechnicianWarranty } from './useTechnicianWarranty';
import { DetailRow, ReadOnlyNotice, TaskScreenShell } from '../shared/TaskScreenShell';
import { lightTheme as colors, spacing } from '../../../constants/theme';
import { vnDateTimeString } from '../../../utils/vn-time';

const field = { minHeight: 52, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: spacing.md, color: colors.text, backgroundColor: colors.surface, textAlignVertical: 'top' as const };
const choice = { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: spacing.md, justifyContent: 'center' as const, backgroundColor: colors.surface };
const choiceText = { color: colors.text, fontSize: 15 };
const labels: Record<string, string> = { submitted: 'Đang chờ kỹ thuật viên', accepted: 'Đã nhận phân công', inspected: 'Đang chờ quản lý dịch vụ', in_progress: 'Đang xử lý bảo hành', awaiting_customer: 'Chờ khách hàng phản hồi', disputed: 'Đang chờ quản lý dịch vụ', resolved: 'Đã xử lý', rejected: 'Đã từ chối' };

export function TechnicianWarrantyInboxScreen() {
  const navigation = useNavigation<any>(); const { controller, state } = useTechnicianWarranty();
  const rows = state.inbox.status === 'ready' ? state.inbox.data.data : [];
  return <TaskScreenShell title="Công việc bảo hành" onBack={() => navigation.goBack()} secondary={{ label: 'Làm mới', disabled: state.inbox.status === 'loading', onPress: () => void controller.loadInbox() }}>
    {state.inbox.status === 'loading' || state.inbox.status === 'unloaded' ? <ReadOnlyNotice>Đang tải yêu cầu được phân công…</ReadOnlyNotice> : null}
    {state.inbox.status === 'error' ? <ReadOnlyNotice>Chưa tải được danh sách. Hãy làm mới để thử lại.</ReadOnlyNotice> : null}
    {state.inbox.status === 'ready' && rows.length === 0 ? <ReadOnlyNotice>Chưa có yêu cầu bảo hành được phân công.</ReadOnlyNotice> : null}
    {rows.map(claim => <Pressable key={claim.id} accessibilityRole="button" accessibilityLabel={`Mở yêu cầu bảo hành ${claim.order.code}, ${labels[claim.status] || claim.status}`} onPress={() => navigation.navigate('TechnicianWarrantyTask', { claimId: claim.id })} style={[choice, { paddingVertical: 12 }]}>
      <Text style={{ ...choiceText, fontWeight: '700' }}>{claim.order.code} · {labels[claim.status] || claim.status}</Text><Text style={{ color: colors.textSecondary, marginTop: 4 }}>{claim.order.serviceName} · {claim.coverage?.itemDescription || 'Bảo hành'}</Text>
    </Pressable>)}
  </TaskScreenShell>;
}

export function TechnicianWarrantyTaskScreen() {
  const route = useRoute<any>(); const claimId = route.params?.claimId as string | undefined;
  return <TechnicianWarrantyTaskForClaim key={claimId ?? 'missing'} claimId={claimId} />;
}

function TechnicianWarrantyTaskForClaim({ claimId }: { claimId?: string }) {
  const navigation = useNavigation<any>();
  const { controller, state } = useTechnicianWarranty(claimId ?? null);
  useEffect(() => () => controller.cancelConfirmation(), [controller]);
  const claim = state.claim.status === 'ready' ? state.claim.data : null;
  const commands = controller.availableCommands();
  const [note, setNote] = useState(''); const [reason, setReason] = useState<'busy' | 'on_leave' | 'out_of_area' | 'other'>('busy');
  const [result, setResult] = useState<'covered_workmanship' | 'covered_part' | 'not_covered' | null>(null); const [findings, setFindings] = useState(''); const [notCoveredReasonCode, setNotCoveredReasonCode] = useState('customer_misuse'); const [ref, setRef] = useState<string | null>(null);
  const evidenceRefs = controller.authorizedEvidenceRefs();
  const confirmed = !!state.confirmation; const busy = ['verifying', 'submitting'].includes(state.phase); const locked = busy || state.phase === 'confirming' || state.phase === 'unknown' || confirmed;
  const prepare = (op: string) => {
    let dto: WarrantyCommandDto = {};
    if (op === 'decline') dto = { reasonCode: reason, ...(reason === 'other' || note.trim() ? { note: note.trim() } : {}) };
    if (op === 'propose') dto = { result: result ?? undefined, findings: findings.trim(), ...(result === 'not_covered' ? { notCoveredReasonCode, ...(ref ? { evidenceRefs: [ref] } : {}) } : {}) };
    if (op === 'complete') dto = { notes: note.trim() };
    void controller.prepare(op as any, dto);
  };
  const action = confirmed
    ? { label: busy ? 'Đang gửi…' : 'Xác nhận thao tác', disabled: busy || state.phase !== 'confirming', testID: 'technician-warranty-primary-action', onPress: () => void controller.submitConfirmation() }
    : state.phase !== 'idle' || !claim ? undefined
      : state.task === 'TW02' ? { label: 'Nhận yêu cầu bảo hành', disabled: locked || !commands.includes('accept'), testID: 'technician-warranty-primary-action', onPress: () => prepare('accept') }
        : state.task === 'TW03' ? { label: 'Xác nhận đã đến kiểm tra', disabled: locked || !commands.includes('check-in'), testID: 'technician-warranty-primary-action', onPress: () => prepare('check-in') }
          : state.task === 'TW04' ? { label: 'Đề xuất kết quả kiểm tra', disabled: locked || !commands.includes('propose') || !result || findings.trim().length < 10 || (result === 'not_covered' && (!ref || evidenceRefs.length === 0)), testID: 'technician-warranty-primary-action', onPress: () => prepare('propose') }
            : state.task === 'TW05' ? { label: 'Đề xuất hoàn tất bảo hành', disabled: locked || !commands.includes('complete') || note.trim().length < 10, testID: 'technician-warranty-primary-action', onPress: () => prepare('complete') }
              : undefined;
  const secondary = confirmed
    ? { label: 'Sửa nội dung', disabled: busy, testID: 'technician-warranty-secondary-action', onPress: () => { controller.cancelConfirmation(); } }
    : state.task === 'TW02' && state.phase === 'idle' && claim
      ? { label: 'Từ chối phân công', disabled: locked || !commands.includes('decline') || (reason === 'other' && note.trim().length < 10), testID: 'technician-warranty-secondary-action', onPress: () => prepare('decline') }
      : { label: 'Làm mới', disabled: !claimId || busy, onPress: () => claimId && void controller.refreshClaim() };

  return <TaskScreenShell title="Chi tiết bảo hành" onBack={() => { controller.cancelConfirmation(); navigation.goBack(); }} primary={action} secondary={secondary}>
    {!claim ? state.access === 'revoked' || state.access === 'not-assigned' ? <ReadOnlyNotice>Yêu cầu này không còn được phân công cho tài khoản hiện tại.</ReadOnlyNotice> : state.claim.status === 'error' ? <ReadOnlyNotice>Chưa xác minh được phân công. Hãy quay lại hộp thư và mở lại yêu cầu.</ReadOnlyNotice> : <ReadOnlyNotice>Đang xác minh yêu cầu được phân công…</ReadOnlyNotice> : <>
      <View style={{ backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: spacing.md }}><DetailRow label="Mã đơn" value={claim.order.code} /><DetailRow label="Dịch vụ" value={claim.order.serviceName} /><DetailRow label="Khách hàng" value={claim.order.customerName} /><DetailRow label="Địa chỉ" value={claim.order.addressSummary} /><DetailRow label="Tình trạng yêu cầu" value={labels[claim.status] || 'Chưa xác định'} /><DetailRow label="Phạm vi" value={claim.coverage?.itemDescription || 'Chưa có thông tin'} /><DetailRow label="Lịch hẹn" value={claim.visit?.scheduledAt ? vnDateTimeString(claim.visit.scheduledAt) : 'Chưa xếp lịch'} /><DetailRow label="Kết quả kiểm tra" value={claim.visit?.findings || 'Chưa có'} /></View>
      {state.task === 'TW02' ? <>
        <ReadOnlyNotice>Chỉ yêu cầu đang được phân công mới hiển thị ở đây. Nhận hoặc từ chối cần xác nhận rõ ràng.</ReadOnlyNotice>
        <Text style={choiceText}>Nếu từ chối, chọn lý do:</Text>{(['busy', 'on_leave', 'out_of_area', 'other'] as const).map(value => <Pressable key={value} disabled={locked} accessibilityRole="radio" accessibilityState={{ disabled: locked, checked: reason === value }} onPress={() => setReason(value)} style={[choice, reason === value && { borderColor: colors.primaryStrong }]}><Text style={choiceText}>{reasonLabel[value]}</Text></Pressable>)}
        {reason === 'other' ? <TextInput accessibilityLabel="Lý do từ chối" value={note} editable={!locked} onChangeText={setNote} multiline maxLength={2000} style={field} /> : null}
        </> : null}
      {state.task === 'TW03' ? <><ReadOnlyNotice>Check-in bảo hành là lượt thăm riêng. Không dùng check-in sửa chữa hoặc yêu cầu gửi vị trí.</ReadOnlyNotice></> : null}
      {state.task === 'TW04' ? <>
        <Text style={choiceText}>Kết luận kiểm tra</Text>{(['covered_workmanship', 'covered_part', 'not_covered'] as const).map(value => <Pressable key={value} disabled={locked} accessibilityRole="radio" accessibilityState={{ disabled: locked, checked: result === value }} onPress={() => setResult(value)} style={[choice, result === value && { borderColor: colors.primaryStrong }]}><Text style={choiceText}>{resultLabel[value]}</Text></Pressable>)}
        <TextInput accessibilityLabel="Kết quả kiểm tra" placeholder="Mô tả phát hiện" value={findings} editable={!locked} onChangeText={setFindings} multiline maxLength={2000} style={[field, { minHeight: 100 }]} />
        {result === 'not_covered' ? <>
          <ReadOnlyNotice>Không thể gửi kết luận không thuộc bảo hành nếu chưa có ảnh bằng chứng đã được cấp quyền. Tính năng tải ảnh mới đang chờ lưu trữ riêng tư.</ReadOnlyNotice>
          <Text style={choiceText}>Ảnh hiện có được phép dùng</Text>
          {evidenceRefs.map((value, index) => <Pressable key={`${value}-${index}`} disabled={locked} accessibilityRole="radio" accessibilityState={{ disabled: locked, checked: ref === value }} onPress={() => setRef(value)} style={[choice, ref === value && { borderColor: colors.primaryStrong }]}><Text style={choiceText}>Chọn ảnh {index + 1}</Text></Pressable>)}
          {!evidenceRefs.length ? <Text style={{ color: colors.textSecondary }}>Chưa có ảnh đủ điều kiện để gửi kết luận này.</Text> : null}
          {reasonCodes.map(value => <Pressable key={value} disabled={locked} accessibilityRole="radio" accessibilityState={{ disabled: locked, checked: notCoveredReasonCode === value }} onPress={() => setNotCoveredReasonCode(value)} style={[choice, notCoveredReasonCode === value && { borderColor: colors.primaryStrong }]}><Text style={choiceText}>{reasonLabel[value] || value}</Text></Pressable>)}
        </> : null}
        <ReadOnlyNotice>Kết quả đề xuất chờ Quản lý dịch vụ phê duyệt. Bạn không thể tự bắt đầu sửa chữa.</ReadOnlyNotice>
      </> : null}
      {state.task === 'TW05' ? <><ReadOnlyNotice>Quản lý dịch vụ đã phê duyệt yêu cầu tiếp tục. Chỉ gửi hoàn tất khi công việc thực tế đã xong.</ReadOnlyNotice><TextInput accessibilityLabel="Ghi chú hoàn tất bảo hành" placeholder="Ghi chú hoàn tất" value={note} editable={!locked} onChangeText={setNote} multiline maxLength={2000} style={[field, { minHeight: 100 }]} /><ReadOnlyNotice>Yêu cầu sẽ chờ khách hàng phản hồi; thao tác này không đóng yêu cầu.</ReadOnlyNotice></> : null}
      {state.task === 'TW06' ? <ReadOnlyNotice>Yêu cầu đang chờ khách hàng, Quản lý dịch vụ hoặc đã kết thúc. Màn này chỉ đọc; không có thao tác duyệt hay đóng yêu cầu.</ReadOnlyNotice> : null}
      {confirmed ? <ReadOnlyNotice>Đọc lại nội dung và xác nhận rõ ràng để gửi thao tác bảo hành.</ReadOnlyNotice> : null}
    </>}
    {state.message ? <ReadOnlyNotice>{state.message}</ReadOnlyNotice> : null}
  </TaskScreenShell>;
}

const reasonLabel: Record<string, string> = { busy: 'Đang bận', on_leave: 'Đang nghỉ', out_of_area: 'Ngoài khu vực', other: 'Lý do khác', customer_misuse: 'Sử dụng không đúng cách', normal_wear: 'Hao mòn thông thường', other_component: 'Linh kiện khác', not_workmanship_related: 'Không liên quan chất lượng sửa chữa', expired: 'Đã hết hạn', cannot_reproduce: 'Không tái hiện được sự cố', customer_unavailable: 'Không liên hệ được khách hàng' };
const resultLabel = { covered_workmanship: 'Bảo hành chất lượng sửa chữa', covered_part: 'Bảo hành linh kiện', not_covered: 'Không thuộc phạm vi bảo hành' };
const reasonCodes = ['customer_misuse', 'normal_wear', 'other_component', 'not_workmanship_related', 'expired', 'cannot_reproduce', 'customer_unavailable', 'other'];
