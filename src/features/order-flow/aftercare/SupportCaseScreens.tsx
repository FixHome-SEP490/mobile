import React, { useEffect, useState } from 'react';
import { Pressable, Text, TextInput } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { SupportDraft } from './support-controller';
import { useOrderSupport } from './useOrderSupport';
import { DetailRow, ReadOnlyNotice, Section, TaskScreenShell } from '../shared/TaskScreenShell';
import { lightTheme as colors, spacing } from '../../../constants/theme';

const input = { minHeight: 52, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: spacing.md, color: colors.text, backgroundColor: colors.surface, textAlignVertical: 'top' as const };
const row = { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: spacing.md, justifyContent: 'center' as const, backgroundColor: colors.surface };
const rowText = { color: colors.primaryStrong, fontSize: 15, fontWeight: '600' as const };
const phaseBusy = (phase: string) => ['verifying', 'submitting'].includes(phase);
const phaseLocked = (phase: string) => ['verifying', 'confirming', 'submitting', 'unknown'].includes(phase);
const caseTypeLabel: Record<string, string> = { matching_exhausted: 'Chưa tìm được kỹ thuật viên', arrival_abnormal: 'Vấn đề khi kỹ thuật viên đến', cash_non_response: 'Chưa xác nhận tiền mặt', cash_mismatch: 'Sai lệch tiền mặt', cancellation_review: 'Xem xét hủy đơn', parts_dispute: 'Tranh chấp linh kiện', warranty_dispute: 'Vấn đề bảo hành', mid_job_interruption: 'Gián đoạn công việc', property_damage: 'Tài sản bị ảnh hưởng', quality: 'Chất lượng sửa chữa', pricing_dispute: 'Tranh chấp chi phí', conduct: 'Ứng xử', other: 'Nội dung khác', technician_replacement: 'Đổi kỹ thuật viên' };
const caseStatusLabel: Record<string, string> = { open: 'Đang mở', in_review: 'Đang được xem xét', resolved: 'Đã xử lý', rejected: 'Không được chấp nhận' };

export function SupportCaseListScreen() {
  const navigation = useNavigation<any>(); const { controller, state } = useOrderSupport();
  useEffect(() => { if (state.list.status === 'unloaded') void controller.loadList(); }, [controller, state.list.status]);
  const rows = state.list.status === 'ready' ? state.list.data : [];
  return <TaskScreenShell title="Hỗ trợ đơn sửa chữa" onBack={() => navigation.goBack()} primary={{ label: 'Tạo yêu cầu hỗ trợ', onPress: () => navigation.navigate('SupportCreate') }} secondary={{ label: 'Làm mới', disabled: state.phase === 'verifying', onPress: () => void controller.loadList() }}>
    {state.list.status === 'loading' || state.list.status === 'unloaded' ? <ReadOnlyNotice>Đang tải danh sách yêu cầu hỗ trợ…</ReadOnlyNotice> : null}
    {state.list.status === 'error' ? <ReadOnlyNotice>Chưa tải được danh sách. Hãy làm mới để thử lại.</ReadOnlyNotice> : null}
    {state.list.status === 'ready' && rows.length === 0 ? <ReadOnlyNotice>Chưa có yêu cầu hỗ trợ cho đơn này.</ReadOnlyNotice> : null}
    {state.list.status === 'ready' ? <ReadOnlyNotice>{`Đã xác minh ${state.knownActorOpenCount ?? 0} yêu cầu đang mở do bạn tạo. Đây là số đã biết, không phải tổng số yêu cầu đang mở.`}</ReadOnlyNotice> : null}
    {rows.map(item => <Pressable key={item.id} testID={`support-case-${item.id}`} accessibilityRole="button" accessibilityLabel={`Mở yêu cầu hỗ trợ, trạng thái ${caseStatusLabel[item.status] || 'chưa xác định'}`} onPress={() => navigation.navigate('SupportCaseDetail', { caseId: item.id })} style={row}>
      <Text style={rowText}>{caseTypeLabel[item.caseType] || 'Yêu cầu hỗ trợ'} · {caseStatusLabel[item.status] || 'Chưa xác định'} ›</Text>
    </Pressable>)}
    {state.message ? <ReadOnlyNotice>{state.message}</ReadOnlyNotice> : null}
  </TaskScreenShell>;
}

export function SupportCaseCreateScreen() {
  const navigation = useNavigation<any>(); const { controller, state, allowedTypes } = useOrderSupport();
  const [caseType, setCaseType] = useState<SupportDraft['caseType'] | null>(null); const [reason, setReason] = useState(''); const [description, setDescription] = useState(''); const [urgent, setUrgent] = useState(false);
  const confirmed = !!state.confirmation; const busy = phaseBusy(state.phase); const locked = phaseLocked(state.phase) || confirmed; const can = !!caseType && allowedTypes.includes(caseType);
  useEffect(() => {
    if (state.phase === 'resolved' && state.detail.status === 'ready') navigation.replace('SupportCaseDetail', { caseId: state.detail.data.id });
  }, [navigation, state.phase, state.detail]);
  const submit = () => { if (!caseType) return; void controller.prepare({ caseType, reason: reason.trim(), ...(description.trim() ? { description: description.trim() } : {}), isUrgent: urgent }); };
  return <TaskScreenShell title="Tạo yêu cầu hỗ trợ" onBack={() => { controller.cancelConfirmation(); navigation.goBack(); }} primary={{ label: confirmed ? busy ? 'Đang gửi…' : 'Xác nhận gửi' : busy ? 'Đang kiểm tra…' : 'Kiểm tra yêu cầu', disabled: confirmed ? busy : locked || state.phase !== 'idle' || !can || reason.trim().length < 1, accessibilityHint: !can ? 'Chọn một loại hỗ trợ được phép cho trạng thái hiện tại' : 'Kiểm tra điều kiện và xác nhận trước khi gửi', onPress: confirmed ? () => void controller.submitConfirmation() : submit }} secondary={{ label: confirmed ? 'Sửa nội dung' : 'Quay lại', disabled: busy, onPress: () => { if (confirmed) controller.cancelConfirmation(); else { controller.cancelConfirmation(); navigation.goBack(); } } }}>
    <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>Chọn nội dung cần hỗ trợ</Text>
    {allowedTypes.length === 0 ? <ReadOnlyNotice>Hiện chưa có loại hỗ trợ phù hợp với trạng thái đơn.</ReadOnlyNotice> : allowedTypes.map(value => <Pressable key={value} disabled={locked} accessibilityRole="radio" accessibilityState={{ checked: caseType === value, disabled: locked }} onPress={() => setCaseType(value)} style={[row, caseType === value && { borderColor: colors.primaryStrong, backgroundColor: '#EAF1FE' }, locked && { opacity: 0.6 }]}><Text style={rowText}>{caseTypeLabel[value] || 'Yêu cầu hỗ trợ'}</Text></Pressable>)}
    <Text style={label}>Lý do</Text><TextInput accessibilityLabel="Lý do hỗ trợ" value={reason} editable={!locked} onChangeText={setReason} maxLength={2000} multiline style={[input, { minHeight: 90 }]} />
    <Text style={label}>Mô tả thêm (không bắt buộc)</Text><TextInput accessibilityLabel="Mô tả thêm" value={description} editable={!locked} onChangeText={setDescription} maxLength={5000} multiline style={[input, { minHeight: 120 }]} />
    <Pressable accessibilityRole="checkbox" disabled={locked} accessibilityState={{ checked: urgent, disabled: locked }} onPress={() => setUrgent(value => !value)} style={[row, locked && { opacity: 0.6 }]}><Text style={label}>{urgent ? '✓ ' : ''}Cần được xem sớm</Text></Pressable>
    <ReadOnlyNotice>Ảnh mới đang chờ hỗ trợ lưu trữ riêng tư. Chỉ ảnh đã có quyền trong hồ sơ này mới có thể dùng.</ReadOnlyNotice>
    {confirmed ? <ReadOnlyNotice>Hãy xem lại loại yêu cầu và nội dung trước khi xác nhận gửi.</ReadOnlyNotice> : null}
    {state.message ? <ReadOnlyNotice>{state.message}</ReadOnlyNotice> : null}
  </TaskScreenShell>;
}

export function SupportCaseDetailScreen() {
  const navigation = useNavigation<any>(); const route = useRoute<any>(); const { controller, state } = useOrderSupport(); const id = route.params?.caseId as string | undefined;
  useEffect(() => { if (id) void controller.loadDetail(id); return () => controller.invalidatePresentation(); }, [controller, id]);
  const item = state.detail.status === 'ready' ? state.detail.data : null;
  return <TaskScreenShell title="Chi tiết yêu cầu hỗ trợ" onBack={() => navigation.goBack()} secondary={{ label: 'Làm mới', disabled: !id || state.phase === 'verifying', onPress: () => id && void controller.loadDetail(id) }}>
    {state.detail.status === 'loading' || state.detail.status === 'unloaded' ? <ReadOnlyNotice>Đang xác minh yêu cầu hỗ trợ…</ReadOnlyNotice> : null}
    {state.detail.status === 'error' ? <ReadOnlyNotice>Không thể xác minh yêu cầu này. Hãy mở từ danh sách của bạn và thử làm mới.</ReadOnlyNotice> : null}
    {item ? <Section title="Yêu cầu hỗ trợ">
      <DetailRow label="Mã yêu cầu" value={item.id} /><DetailRow label="Tình trạng" value={caseStatusLabel[item.status] || 'Chưa xác định'} /><DetailRow label="Loại hỗ trợ" value={caseTypeLabel[item.caseType] || 'Yêu cầu hỗ trợ'} /><DetailRow label="Lý do" value={item.reason} /><DetailRow label="Mô tả" value={item.description} /><DetailRow label="Hạn phản hồi" value={item.respondBy} /><DetailRow label="Lý do xử lý" value={item.resolutionReason} /><DetailRow label="Thời điểm xử lý" value={item.resolvedAt} />
    </Section> : null}
  </TaskScreenShell>;
}

const label = { color: colors.text, fontSize: 15, lineHeight: 22 };
