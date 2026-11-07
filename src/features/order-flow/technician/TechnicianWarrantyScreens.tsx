import React, { useEffect, useState } from 'react';
import { Alert, Image, Linking, Pressable, Text, TextInput, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { WarrantyCommandDto } from '../aftercare/aftercare-contracts';
import { useTechnicianWarranty } from './useTechnicianWarranty';
import { technicianWarrantyApi } from '../../../api/technician-warranty.api';
import { partRequestsApi } from '../../../api/part-requests.api';
import { WarrantyPhotos } from '../aftercare/WarrantyPhotos';
import { DetailRow, ReadOnlyNotice, TaskScreenShell } from '../shared/TaskScreenShell';
import { lightTheme as colors, spacing } from '../../../constants/theme';
import { vnDateTimeString } from '../../../utils/vn-time';
import BookingSessionPicker from '../../../components/BookingSessionPicker';
import { scheduleSummary, sessionWindow, type BookingSchedule } from '../../../utils/booking-session';
import { formatVnd } from '../../../utils/format';
import { findChatForBooking } from '../../../screens/technician/technician-chat-shortcut';
import { backFromFlow } from '../navigation/resume-order';
import { technicianClaimLabel, type WarrantyTone } from '../../../screens/technician/warranty/technician-warranty-groups';

const field = { minHeight: 52, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: spacing.md, color: colors.text, backgroundColor: colors.surface, textAlignVertical: 'top' as const };
const choice = { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: spacing.md, justifyContent: 'center' as const, backgroundColor: colors.surface };
const choiceText = { color: colors.text, fontSize: 15 };

/** The warranty claims live in the "Bảo hành" part of the Jobs tab; the old entry points land there. */
export function TechnicianWarrantyInboxScreen() {
  const navigation = useNavigation<any>();
  useEffect(() => { navigation.replace('TechnicianMain', { screen: 'Jobs', params: { mode: 'warranty' } }); }, [navigation]);
  return null;
}

export function TechnicianWarrantyTaskScreen() {
  const route = useRoute<any>(); const claimId = route.params?.claimId as string | undefined;
  return <TechnicianWarrantyTaskForClaim key={claimId ?? 'missing'} claimId={claimId} />;
}

/** The inspection session agreed with the customer, same date + morning/afternoon/evening choice as booking. */
function SlotPicker({ value, onChange, disabled }: { value: string | null; onChange: (iso: string | null) => void; disabled: boolean }) {
  const [schedule, setSchedule] = useState<BookingSchedule | null>(null);
  const pick = (next: BookingSchedule | null) => {
    setSchedule(next);
    const window = next && next.mode === 'scheduled' ? sessionWindow(next) : null;
    // A session already under way starts "in a few minutes", so the server still sees a future time.
    onChange(window ? new Date(Math.max(window.start.getTime(), Date.now() + 10 * 60_000)).toISOString() : null);
  };
  return <View style={{ gap: spacing.sm }} pointerEvents={disabled ? 'none' : 'auto'}>
    <Text style={choiceText}>Chọn buổi kiểm tra đã hẹn với khách (bắt buộc):</Text>
    <BookingSessionPicker value={schedule} onChange={pick} allowUrgent={false} />
    {value && schedule ? <Text style={{ color: colors.textSecondary }}>Đã chọn: {scheduleSummary(schedule)}</Text> : null}
  </View>;
}

const incomingText: Record<string, string> = { requested: 'Kho đang chuẩn bị linh kiện thay thế.', ready: 'Linh kiện đã sẵn sàng, hãy nhận hàng và quét mã QR xác nhận.', delivering: 'Linh kiện đang được giao, quét mã QR khi nhận.' };
function TechnicianWarrantyTaskForClaim({ claimId }: { claimId?: string }) {
  const navigation = useNavigation<any>();
  const { controller, state } = useTechnicianWarranty(claimId ?? null);
  useEffect(() => () => controller.cancelConfirmation(), [controller]);
  const claim = state.claim.status === 'ready' ? state.claim.data : null;
  const commands = controller.availableCommands();
  const [slot, setSlot] = useState<string | null>(null); const [moving, setMoving] = useState(false); const [moveError, setMoveError] = useState<string | null>(null); const [note, setNote] = useState(''); const [reason, setReason] = useState<'busy' | 'on_leave' | 'out_of_area' | 'other'>('busy');
  const [result, setResult] = useState<'covered_workmanship' | 'covered_part' | 'not_covered' | null>(null); const [findings, setFindings] = useState(''); const [notCoveredReasonCode, setNotCoveredReasonCode] = useState('customer_misuse'); const [photos, setPhotos] = useState<string[]>([]); const [openedAt] = useState(() => Date.now()); const [faultyIds, setFaultyIds] = useState<string[]>([]); const [faultyCounts, setFaultyCounts] = useState<Record<string, number>>({}); const [returning, setReturning] = useState(false); const [returnError, setReturnError] = useState<string | null>(null);
  const bookingId = claim?.order.bookingId;
  const partLines = claim?.order.partLines ?? [];
  const part = claim?.partRequest && ['received', 'completed'].includes(claim.partRequest.status.toLowerCase()) ? claim.partRequest : null;
  const incoming = claim?.partRequest && ['requested', 'ready', 'delivering'].includes(claim.partRequest.status.toLowerCase()) ? claim.partRequest : null;
  const partOverdue = !!part && !part.faultyReturnedAt && !!part.faultyReturnDueAt && Date.parse(part.faultyReturnDueAt) < openedAt;
  const returnFaulty = async () => {
    if (!part || returning) return;
    setReturning(true); setReturnError(null);
    try { await technicianWarrantyApi.returnFaultyPart(part.id); await controller.refreshClaim(); }
    catch { setReturnError('Chưa ghi nhận được. Vui lòng thử lại.'); }
    finally { setReturning(false); }
  };
  const markUsage = async (itemId: string, usage: 'used' | 'returned') => {
    if (!part || returning) return;
    setReturning(true); setReturnError(null);
    try { await partRequestsApi.updateItemUsage(part.id, itemId, usage); await controller.refreshClaim(); }
    catch { setReturnError('Chưa ghi nhận được. Vui lòng thử lại.'); }
    finally { setReturning(false); }
  };
  const reschedule = async () => {
    if (!claim || !slot || moving) return;
    setMoving(true); setMoveError(null);
    try { await technicianWarrantyApi.rescheduleVisit(claim.id, slot); setSlot(null); await controller.refreshClaim(); }
    catch { setMoveError('Chưa đổi được lịch. Vui lòng thử lại.'); }
    finally { setMoving(false); }
  };
  const openChat = async () => {
    if (!bookingId) return;
    try {
      const target = await findChatForBooking(bookingId);
      if (!target) { Alert.alert('Chưa có cuộc trò chuyện', 'Chưa có cuộc trò chuyện nào cho đơn này.'); return; }
      navigation.navigate('ChatThread', { conversationId: target.conversationId, counterpartName: target.counterpartName, serviceName: target.serviceName });
    } catch { Alert.alert('Không mở được', 'Không thể mở cuộc trò chuyện. Vui lòng thử lại.'); }
  };
  const confirmed = !!state.confirmation; const busy = ['verifying', 'submitting'].includes(state.phase); const locked = busy || state.phase === 'confirming' || state.phase === 'unknown' || confirmed;
  const prepare = (op: string) => {
    let dto: WarrantyCommandDto = {};
    if (op === 'accept') dto = { scheduledAt: slot ?? undefined };
    if (op === 'decline') dto = { reasonCode: reason, ...(reason === 'other' || note.trim() ? { note: note.trim() } : {}) };
    if (op === 'propose') dto = { result: result ?? undefined, ...(result === 'covered_part' ? { faultyInvoiceItemIds: faultyIds, faultyQuantities: Object.fromEntries(faultyIds.map(id => [id, faultyCounts[id] ?? partLines.find(l => l.id === id)?.quantity ?? 1])) } : {}), findings: findings.trim(), ...(result === 'not_covered' ? { notCoveredReasonCode } : {}), ...(result !== 'covered_workmanship' && photos.length ? { evidenceRefs: photos } : {}) };
    if (op === 'complete') dto = { notes: note.trim(), ...(photos.length ? { evidenceRefs: photos } : {}) };
    void controller.prepare(op as any, dto);
  };
  const action = confirmed
    ? { label: busy ? 'Đang gửi…' : 'Xác nhận thao tác', disabled: busy || state.phase !== 'confirming', testID: 'technician-warranty-primary-action', onPress: () => void controller.submitConfirmation() }
    : (state.phase !== 'idle' && state.phase !== 'resolved') || !claim ? undefined
      : state.task === 'TW02' ? { label: 'Nhận yêu cầu bảo hành', disabled: locked || !commands.includes('accept') || !slot, testID: 'technician-warranty-primary-action', onPress: () => prepare('accept') }
        : state.task === 'TW03' ? { label: 'Xác nhận đã đến kiểm tra', disabled: locked || !commands.includes('check-in'), testID: 'technician-warranty-primary-action', onPress: () => prepare('check-in') }
          : state.task === 'TW04' ? { label: 'Đề xuất kết quả kiểm tra', disabled: locked || !commands.includes('propose') || !result || findings.trim().length < 10 || (result === 'covered_part' && faultyIds.length === 0) || ((result === 'not_covered' || result === 'covered_part') && photos.length === 0) || (result === 'not_covered' && !notCoveredReasonCode), testID: 'technician-warranty-primary-action', onPress: () => prepare('propose') }
            : state.task === 'TW05' ? { label: 'Đề xuất hoàn tất bảo hành', disabled: locked || !commands.includes('complete') || note.trim().length < 10, testID: 'technician-warranty-primary-action', onPress: () => prepare('complete') }
              : undefined;
  const secondary = confirmed
    ? { label: 'Sửa nội dung', disabled: busy, testID: 'technician-warranty-secondary-action', onPress: () => { controller.cancelConfirmation(); } }
    : state.task === 'TW02' && state.phase === 'idle' && claim
      ? { label: 'Từ chối phân công', disabled: locked || !commands.includes('decline') || (reason === 'other' && note.trim().length < 10), testID: 'technician-warranty-secondary-action', onPress: () => prepare('decline') }
      : { label: 'Làm mới', disabled: !claimId || busy, onPress: () => claimId && void controller.refreshClaim() };

  return <TaskScreenShell title="Chi tiết bảo hành" onBack={() => { controller.cancelConfirmation(); backFromFlow(navigation); }} primary={action} secondary={secondary}>
    {!claim ? state.access === 'revoked' || state.access === 'not-assigned' ? <ReadOnlyNotice>Yêu cầu này không còn được phân công cho tài khoản hiện tại.</ReadOnlyNotice> : state.claim.status === 'error' ? <ReadOnlyNotice>Chưa xác minh được phân công. Hãy quay lại hộp thư và mở lại yêu cầu.</ReadOnlyNotice> : <ReadOnlyNotice>Đang xác minh yêu cầu được phân công…</ReadOnlyNotice> : <>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Xem đơn gốc" onPress={() => navigation.navigate('TechnicianOrderDetail', { serviceOrderId: claim.order.id })}><Text style={{ color: colors.primaryStrong, fontWeight: '700' }}>#{claim.order.code}</Text></Pressable>
          <StatusPill claim={claim} />
          {claim.submittedAfterExpiry ? <Text style={{ color: colors.tone.warning.text, fontWeight: '700', fontSize: 12 }}>Gửi sau hạn</Text> : null}
        </View>
        <Text accessibilityRole="header" style={{ fontSize: 20, lineHeight: 28, fontWeight: '800', color: colors.text }}>{claim.order.serviceName || 'Bảo hành dịch vụ'}</Text>
        <Text style={choiceText}>{claim.order.customerName}{claim.status !== 'submitted' && claim.order.customerPhone ? `  ${claim.order.customerPhone}` : ''}</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20 }}>{claim.order.addressSummary}</Text>
        {claim.status !== 'submitted' ? <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {claim.order.customerPhone ? <Pressable accessibilityRole="button" accessibilityLabel="Gọi khách hàng" onPress={() => void Linking.openURL(`tel:${claim.order.customerPhone}`)} style={[choice, { flex: 1, alignItems: 'center' }]}><Text style={{ ...choiceText, fontWeight: '700' }}>Gọi điện</Text></Pressable> : null}
          {bookingId ? <Pressable accessibilityRole="button" accessibilityLabel="Nhắn tin cho khách hàng" onPress={() => void openChat()} style={[choice, { flex: 1, alignItems: 'center' }]}><Text style={{ ...choiceText, fontWeight: '700' }}>Nhắn tin</Text></Pressable> : null}
        </View> : null}
      </Card>
      <Card title="Thông tin">
        <DetailRow label="Dịch vụ" value={claim.order.serviceName} />
        {claim.coverage ? <DetailRow label="Bảo hành đến" value={vnDateTimeString(claim.coverage.expiresAt)} /> : null}
        {claim.visit?.scheduledAt ? <DetailRow label="Lịch kiểm tra" value={vnDateTimeString(claim.visit.scheduledAt)} /> : null}
        {claim.visit?.checkedInAt ? <DetailRow label="Đã có mặt lúc" value={vnDateTimeString(claim.visit.checkedInAt)} /> : null}
        <DetailRow label="Gửi lúc" value={vnDateTimeString(claim.submittedAt)} />
        {claim.outcomeCode ? <DetailRow label="Kết cục" value={outcomeLabel[claim.outcomeCode]} /> : null}
        {claim.outcomeCode === 'unfixed' && claim.refundAmount ? <DetailRow label="Đã hoàn cho khách" value={formatVnd(claim.refundAmount)} /> : null}
      </Card>
      <Card title="Khách mô tả">
        <Text style={{ ...choiceText, lineHeight: 22 }}>{claim.description}</Text>
        {claim.evidenceRefs?.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {claim.evidenceRefs.map((url, index) => <Image key={url} source={{ uri: url }} accessibilityIgnoresInvertColors accessibilityLabel={`Ảnh khách gửi ${index + 1}`} style={{ width: 72, height: 72, borderRadius: 10 }} />)}
        </View> : null}
      </Card>
      {claim.visit?.proposedResult ? <Card title="Kết luận bạn đã đề xuất">
        <Text style={{ ...choiceText, fontWeight: '700' }}>{resultLabel[claim.visit.proposedResult]}</Text>
        {claim.visit.findings ? <Text style={{ color: colors.textSecondary, lineHeight: 20 }}>{claim.visit.findings}</Text> : null}
      </Card> : null}
      {claim.resolutionNotes ? <Card title="Phản hồi của quản lý dịch vụ"><Text style={choiceText}>{claim.resolutionNotes}</Text></Card> : null}
      {incoming ? <Card title="Nhận linh kiện thay thế">
        <Text style={choiceText}>{incomingText[incoming.status.toLowerCase()]}</Text>
        {['ready', 'delivering'].includes(incoming.status.toLowerCase()) ? <Pressable accessibilityRole="button" accessibilityLabel="Nhận linh kiện" onPress={() => navigation.push('TechnicianOrderDetail', { serviceOrderId: claim.order.id, screen: 'PartsLifecycle', params: { from: 'warranty' } })} style={[choice, { alignItems: 'center' }]}><Text style={{ ...choiceText, fontWeight: '700' }}>Nhận linh kiện</Text></Pressable> : null}
      </Card> : null}
      {part ? <Card title="Linh kiện thay thế đã nhận">
        {part.items?.map(item => <View key={item.id} style={{ gap: 6 }}>
          <Text style={choiceText}>{item.name} × {item.quantity}</Text>
          {item.usageStatus === 'pending' ? <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Đã lắp ${item.name}`} disabled={returning} onPress={() => void markUsage(item.id, 'used')} style={[choice, { flex: 1, alignItems: 'center' }]}><Text style={{ ...choiceText, fontWeight: '700' }}>Đã lắp</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={`Trả lại ${item.name}`} disabled={returning} onPress={() => void markUsage(item.id, 'returned')} style={[choice, { flex: 1, alignItems: 'center' }]}><Text style={choiceText}>Trả lại</Text></Pressable>
          </View> : <Text style={{ color: colors.textSecondary }}>{item.usageStatus === 'used' ? 'Đã lắp' : 'Đã trả lại'}</Text>}
        </View>)}
        <Pressable accessibilityRole="button" accessibilityLabel="Mở màn linh kiện" onPress={() => navigation.push('TechnicianOrderDetail', { serviceOrderId: claim.order.id, screen: 'PartsLifecycle', params: { from: 'warranty' } })} style={[choice, { alignItems: 'center' }]}><Text style={{ ...choiceText, fontWeight: '700' }}>Mở màn linh kiện</Text></Pressable>
      </Card> : null}
      {part ? <Card title="Nộp linh kiện hỏng về kho">
        {part.faultyReturnedAt ? <ReadOnlyNotice>Đã nộp lúc {vnDateTimeString(part.faultyReturnedAt)}. {part.faultyInspectionResult ? 'Quản lý dịch vụ đã kiểm tra.' : 'Chờ quản lý dịch vụ kiểm tra.'}</ReadOnlyNotice>
          : <>
            <ReadOnlyNotice tone={partOverdue || part.faultyReturnChargedAt ? 'warning' : 'info'}>{part.faultyReturnChargedAt ? 'Quá hạn nộp nên giá linh kiện thay thế đã bị trừ vào ví. Nộp về kho và được kiểm tra không do lắp đặt sẽ được hoàn lại.' : partOverdue ? 'Đã quá hạn nộp. Giá linh kiện thay thế sẽ bị trừ vào ví.' : `Hạn nộp: ${part.faultyReturnDueAt ? vnDateTimeString(part.faultyReturnDueAt) : 'sau khi nhận linh kiện thay thế'}. Quá hạn, giá linh kiện thay thế sẽ bị trừ vào ví.`}</ReadOnlyNotice>
            <Pressable accessibilityRole="button" accessibilityLabel="Đã nộp linh kiện hỏng" disabled={returning} onPress={() => void returnFaulty()} style={[choice, { alignItems: 'center' }]}><Text style={{ ...choiceText, fontWeight: '700' }}>{returning ? 'Đang ghi nhận…' : 'Đã nộp linh kiện hỏng'}</Text></Pressable>
            {returnError ? <ReadOnlyNotice tone="error">{returnError}</ReadOnlyNotice> : null}
          </>}
      </Card> : null}
      {claim.outcomeCode === 'unfixed' ? <ReadOnlyNotice tone="warning">Không khắc phục được trong hạn: tiền đã hoàn cho khách và trừ vào ví của bạn.</ReadOnlyNotice> : null}
      {state.task === 'TW02' ? <Card title="Nhận hay không nhận yêu cầu">
        <ReadOnlyNotice>Chỉ yêu cầu đang được phân công mới hiển thị ở đây. Nhận hoặc từ chối cần xác nhận rõ ràng.</ReadOnlyNotice>
        <ReadOnlyNotice tone="warning">Từ chối vì nghỉ phép hoặc ngoài khu vực sẽ được hệ thống kiểm tra. Lý do khác phải chờ quản lý dịch vụ xét, nếu không chính đáng sẽ bị trừ điểm uy tín. Sát hạn bảo hành, chỉ hai lý do trên được từ chối.</ReadOnlyNotice>
        <SlotPicker value={slot} onChange={setSlot} disabled={locked} />
        <Text style={choiceText}>Nếu từ chối, chọn lý do:</Text>{(['busy', 'on_leave', 'out_of_area', 'other'] as const).map(value => <Pressable key={value} disabled={locked} accessibilityRole="radio" accessibilityState={{ disabled: locked, checked: reason === value }} onPress={() => setReason(value)} style={[choice, reason === value && { borderColor: colors.primaryStrong }]}><Text style={choiceText}>{reasonLabel[value]}</Text></Pressable>)}
        {reason === 'other' ? <TextInput accessibilityLabel="Lý do từ chối" value={note} editable={!locked} onChangeText={setNote} multiline maxLength={2000} style={field} /> : null}
        </Card> : null}
      {state.task === 'TW03' ? <Card title="Đến nơi kiểm tra"><ReadOnlyNotice>Check-in bảo hành là lượt thăm riêng. Không dùng check-in sửa chữa hoặc yêu cầu gửi vị trí.</ReadOnlyNotice></Card> : null}
      {state.task === 'TW03' && claim.visit?.status === 'scheduled' ? <Card title="Khách bận, cần đổi lịch?">
        <SlotPicker value={slot} onChange={setSlot} disabled={locked || moving} />
        <Pressable accessibilityRole="button" accessibilityLabel="Đổi lịch kiểm tra" disabled={locked || moving || !slot} onPress={() => void reschedule()} style={[choice, { alignItems: 'center', opacity: locked || moving || !slot ? 0.5 : 1 }]}><Text style={{ ...choiceText, fontWeight: '700' }}>{moving ? 'Đang đổi…' : 'Đổi lịch và báo khách'}</Text></Pressable>
        {moveError ? <ReadOnlyNotice tone="error">{moveError}</ReadOnlyNotice> : null}
      </Card> : null}
      {state.task === 'TW04' ? <Card title="Kết luận kiểm tra">
        <Text style={choiceText}>Bạn thấy lỗi thuộc loại nào?</Text>{(['covered_workmanship', 'covered_part', 'not_covered'] as const).map(value => <Pressable key={value} disabled={locked} accessibilityRole="radio" accessibilityState={{ disabled: locked, checked: result === value }} onPress={() => setResult(value)} style={[choice, result === value && { borderColor: colors.primaryStrong }]}><Text style={choiceText}>{resultLabel[value]}</Text></Pressable>)}
        <TextInput accessibilityLabel="Kết quả kiểm tra" placeholder="Mô tả phát hiện" value={findings} editable={!locked} onChangeText={setFindings} multiline maxLength={2000} style={[field, { minHeight: 100 }]} />
        {result === 'covered_part' ? <>
          <Text style={choiceText}>Linh kiện nào bị hỏng?</Text>
          {partLines.length === 0 ? <Text style={{ color: colors.textSecondary }}>Đơn gốc không có linh kiện. Hãy chọn kết luận khác.</Text> : null}
          {partLines.map(line => {
            const on = faultyIds.includes(line.id); const count = faultyCounts[line.id] ?? line.quantity;
            const step = (delta: number) => setFaultyCounts(current => ({ ...current, [line.id]: Math.min(line.quantity, Math.max(1, count + delta)) }));
            return <View key={line.id} style={[choice, on && { borderColor: colors.primaryStrong }]}>
              <Pressable disabled={locked} accessibilityRole="checkbox" accessibilityState={{ disabled: locked, checked: on }} onPress={() => setFaultyIds(current => on ? current.filter(id => id !== line.id) : [...current, line.id])}><Text style={choiceText}>{line.name} (đã dùng {line.quantity})</Text></Pressable>
              {on && line.quantity > 1 ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 }}>
                <Text style={choiceText}>Số cái bị hỏng:</Text>
                <Pressable disabled={locked || count <= 1} accessibilityRole="button" accessibilityLabel={`Giảm số lượng hỏng ${line.name}`} onPress={() => step(-1)} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Text style={choiceText}>−</Text></Pressable>
                <Text accessibilityLabel={`${count} trên ${line.quantity} cái hỏng`} style={choiceText}>{count}/{line.quantity}</Text>
                <Pressable disabled={locked || count >= line.quantity} accessibilityRole="button" accessibilityLabel={`Tăng số lượng hỏng ${line.name}`} onPress={() => step(1)} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Text style={choiceText}>+</Text></Pressable>
              </View> : null}
            </View>;
          })}
        </> : null}
        {result === 'not_covered' || result === 'covered_part' ? <>
          <ReadOnlyNotice>Cần ít nhất 1 ảnh do bạn chụp.</ReadOnlyNotice>
          <WarrantyPhotos urls={photos} onChange={setPhotos} onUploaded={urls => controller.registerUploadedPhotos(urls)} disabled={locked} />
          {result === 'not_covered' ? <>{reasonCodes.map(value => <Pressable key={value} disabled={locked} accessibilityRole="radio" accessibilityState={{ disabled: locked, checked: notCoveredReasonCode === value }} onPress={() => setNotCoveredReasonCode(value)} style={[choice, notCoveredReasonCode === value && { borderColor: colors.primaryStrong }]}><Text style={choiceText}>{reasonLabel[value] || value}</Text></Pressable>)}</> : null}
        </> : null}
        <ReadOnlyNotice>Chờ quản lý duyệt rồi mới được sửa.</ReadOnlyNotice>
      </Card> : null}
      {state.task === 'TW05' ? <Card title="Báo hoàn tất bảo hành"><ReadOnlyNotice>Chỉ gửi khi đã sửa xong.</ReadOnlyNotice><TextInput accessibilityLabel="Ghi chú hoàn tất bảo hành" placeholder="Ghi chú hoàn tất (ít nhất 10 ký tự: đã làm gì, thay gì)" value={note} editable={!locked} onChangeText={setNote} multiline maxLength={2000} style={[field, { minHeight: 100 }]} /></Card> : null}
      {state.task === 'TW06' ? <ReadOnlyNotice>Yêu cầu đang chờ khách hàng, Quản lý dịch vụ hoặc đã kết thúc. Màn này chỉ đọc; không có thao tác duyệt hay đóng yêu cầu.</ReadOnlyNotice> : null}
      {confirmed ? <ReadOnlyNotice>Đọc lại nội dung và xác nhận rõ ràng để gửi thao tác bảo hành.</ReadOnlyNotice> : null}
    </>}
    {state.message ? <ReadOnlyNotice>{state.message}</ReadOnlyNotice> : null}
  </TaskScreenShell>;
}

const toneBg: Record<WarrantyTone, { bg: string; text: string }> = { info: colors.tone.info, warning: colors.tone.warning, repair: colors.tone.repair, success: colors.tone.success, neutral: colors.tone.neutral };
function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return <View style={{ backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.sm }}>
    {title ? <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 15, fontWeight: '800' }}>{title}</Text> : null}
    {children}
  </View>;
}
function StatusPill({ claim }: { claim: Parameters<typeof technicianClaimLabel>[0] }) {
  const status = technicianClaimLabel(claim); const tone = toneBg[status.tone];
  return <View style={{ backgroundColor: tone.bg, borderRadius: 8, paddingHorizontal: 8, minHeight: 24, justifyContent: 'center' }}><Text style={{ color: tone.text, fontSize: 12, fontWeight: '700' }}>{status.label}</Text></View>;
}
const reasonLabel: Record<string, string> = { busy: 'Đang bận', on_leave: 'Đang nghỉ', out_of_area: 'Ngoài khu vực', other: 'Lý do khác', customer_misuse: 'Sử dụng không đúng cách', normal_wear: 'Hao mòn thông thường', other_component: 'Linh kiện khác', not_workmanship_related: 'Không liên quan chất lượng sửa chữa', expired: 'Đã hết hạn', cannot_reproduce: 'Không tái hiện được sự cố', customer_unavailable: 'Không liên hệ được khách hàng', third_party_repair: 'Đã có người khác sửa', force_majeure: 'Thiên tai, cháy nổ, ngập', transport_damage: 'Hỏng do vận chuyển' };
const outcomeLabel = { fixed: 'Đã khắc phục', unfixed: 'Không khắc phục được', rejected: 'Không được bảo hành' };
const resultLabel = { covered_workmanship: 'Bảo hành chất lượng sửa chữa', covered_part: 'Bảo hành linh kiện', not_covered: 'Không thuộc phạm vi bảo hành' };
const reasonCodes = ['customer_misuse', 'normal_wear', 'other_component', 'not_workmanship_related', 'expired', 'cannot_reproduce', 'customer_unavailable', 'third_party_repair', 'force_majeure', 'transport_damage', 'other'];
