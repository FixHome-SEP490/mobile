import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useCustomerAftercare } from '../customer/useCustomerAftercare';
import { DetailRow, ReadOnlyNotice, TaskScreenShell } from '../shared/TaskScreenShell';
import { lightTheme as colors, spacing } from '../../../constants/theme';
import { vnDateTimeString } from '../../../utils/vn-time';

const label = { color: colors.text, fontSize: 15, lineHeight: 22 };
const coverageLabel: Record<string, string> = { active: 'Còn hiệu lực', expired: 'Đã hết hạn', voided: 'Đã hủy', pending: 'Đang chờ xác minh' };
const claimLabel: Record<string, string> = { submitted: 'Đã gửi yêu cầu', accepted: 'Đã tiếp nhận', inspected: 'Đang chờ kết quả kiểm tra', in_progress: 'Đang xử lý bảo hành', awaiting_customer: 'Chờ bạn phản hồi', disputed: 'Đang chờ quản lý dịch vụ', resolved: 'Đã xử lý', rejected: 'Đã từ chối' };
const field = { minHeight: 52, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: spacing.md, color: colors.text, backgroundColor: colors.surface, textAlignVertical: 'top' as const };
function Status({ children }: { children: React.ReactNode }) { return <ReadOnlyNotice>{children}</ReadOnlyNotice>; }
function Loading({ children = 'Đang tải dữ liệu…' }: { children?: string }) { return <Status>{children}</Status>; }

export function CustomerReviewScreen() {
  const navigation = useNavigation<any>();
  const { controller, state } = useCustomerAftercare('review');
  const [rating, setRating] = useState(5); const [comment, setComment] = useState('');
  const busy = ['verifying', 'submitting'].includes(state.phase);
  const locked = busy || state.phase === 'confirming' || state.phase === 'unknown' || !!state.confirmation;
  const can = controller.canSubmitReview();
  const confirmed = state.confirmation?.operation === 'review-create';
  const primary = confirmed
    ? { label: busy ? 'Đang gửi…' : 'Xác nhận gửi đánh giá', disabled: busy || state.phase !== 'confirming', accessibilityHint: 'Gửi đánh giá sau khi xác nhận', onPress: () => void controller.submitConfirmation() }
    : { label: busy ? 'Đang kiểm tra…' : 'Chuẩn bị gửi đánh giá', disabled: locked || state.phase !== 'idle' || !can || !Number.isInteger(rating) || comment.length > 2000, accessibilityHint: !can ? 'Đánh giá hiện chưa được phép gửi' : 'Kiểm tra điều kiện và xem lại nội dung trước khi gửi', onPress: () => void controller.prepareReview({ rating, ...(comment.trim() ? { comment: comment.trim() } : {}) }) };
  const review = state.review.status === 'ready' ? state.review.data : null;
  return <TaskScreenShell title="Đánh giá dịch vụ" onBack={() => { controller.cancelConfirmation(); navigation.goBack(); }} primary={primary} secondary={{ label: confirmed ? 'Sửa nội dung' : 'Để sau', disabled: busy, onPress: () => { if (confirmed) controller.cancelConfirmation(); else { controller.cancelConfirmation(); navigation.goBack(); } } }}>
    {state.review.status === 'loading' || state.review.status === 'unloaded' ? <Loading /> : null}
    {state.review.status === 'error' ? <Status>Chưa tải được đánh giá. Hãy quay lại và mở lại màn hình này để thử lại.</Status> : null}
    {review ? <><Status>Bạn đã gửi đánh giá cho đơn này.</Status><DetailRow label="Số sao" value={`${review.rating} / 5`} /><DetailRow label="Nhận xét" value={review.comment || 'Không có nhận xét'} /><DetailRow label="Ngày gửi" value={vnDateTimeString(review.createdAt)} /></> : null}
    {!review && state.review.status === 'ready' ? <>
      <Text accessibilityRole="header" style={{ ...label, fontSize: 20, fontWeight: '700' }}>Chia sẻ trải nghiệm sửa chữa</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel="Chọn số sao" style={{ flexDirection: 'row', gap: 8 }}>
        {[1, 2, 3, 4, 5].map(value => <Pressable key={value} disabled={locked} accessibilityRole="radio" accessibilityLabel={`${value} sao`} accessibilityState={{ checked: rating === value, disabled: locked }} onPress={() => setRating(value)} style={{ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: rating === value ? colors.primaryStrong : colors.border, backgroundColor: rating === value ? '#EAF1FE' : colors.surface, opacity: locked ? 0.6 : 1 }}><Text style={{ color: colors.text, fontSize: 17 }}>{value}★</Text></Pressable>)}
      </View>
      <Text style={label}>Nhận xét (không bắt buộc)</Text>
      <TextInput accessibilityLabel="Nhận xét" value={comment} editable={!locked} onChangeText={setComment} maxLength={2000} multiline style={[field, { minHeight: 120 }]} />
      {!can ? <Status>Đánh giá chỉ khả dụng khi đơn đã hoàn thành và bạn chưa gửi đánh giá.</Status> : null}
      {confirmed ? <Status>Đánh giá {state.confirmation?.operation === 'review-create' ? rating : ''} sao sẽ được gửi sau khi bạn xác nhận.</Status> : null}
    </> : null}
    {state.message ? <Status>{state.message}</Status> : null}
  </TaskScreenShell>;
}

export function CustomerWarrantyScreen() {
  const navigation = useNavigation<any>(); const { controller, state } = useCustomerAftercare('warranty');
  const coverages = state.coverages.status === 'ready' ? state.coverages.data : [];
  const claims = state.claims.status === 'ready' ? state.claims.data : [];
  return <TaskScreenShell title="Bảo hành" onBack={() => navigation.goBack()} secondary={{ label: 'Làm mới', onPress: () => void controller.loadWarranty(), disabled: state.phase === 'verifying' }}>
    {state.coverages.status === 'loading' || state.coverages.status === 'unloaded' ? <Loading /> : null}
    {state.coverages.status === 'error' || state.claims.status === 'error' ? <Status>Chưa tải được thông tin bảo hành. Hãy thử làm mới.</Status> : null}
    {state.coverages.status === 'ready' && coverages.length === 0 ? <Status>Đơn này chưa có thông tin phạm vi bảo hành.</Status> : null}
    {coverages.map((coverage: any) => {
      const claim = claims.find((item: any) => item.warrantyCoverageId === coverage.id && !['resolved', 'rejected', 'closed'].includes(String(item.status).toLowerCase()));
      const expired = String(coverage.status).toLowerCase() === 'expired';
      return <View key={coverage.id} style={{ backgroundColor: colors.surface, borderRadius: 12, padding: spacing.md, gap: 8 }}>
        <Text style={{ ...label, fontWeight: '700' }}>{coverage.note || 'Phạm vi bảo hành'}</Text>
        <DetailRow label="Tình trạng" value={coverageLabel[String(coverage.status).toLowerCase()] || 'Chưa xác định'} />
        <DetailRow label="Hết hạn" value={coverage.expiresAt ? vnDateTimeString(coverage.expiresAt) : 'Chưa có thông tin'} />
        {claim ? <Pressable accessibilityRole="button" accessibilityLabel="Mở yêu cầu bảo hành" onPress={() => navigation.navigate('CustomerWarrantyClaim', { claimId: claim.id })} style={link}><Text style={linkText}>Mở yêu cầu bảo hành ›</Text></Pressable>
          : <Pressable accessibilityRole="button" accessibilityLabel="Tạo yêu cầu bảo hành" onPress={() => navigation.navigate('WarrantyClaimCreate', { coverageId: coverage.id })} style={link}><Text style={linkText}>Tạo yêu cầu bảo hành ›</Text></Pressable>}
        {expired ? <Text style={{ color: colors.textSecondary }}>Phạm vi đã hết hạn. Máy chủ vẫn xác định khả năng tiếp nhận yêu cầu.</Text> : null}
      </View>;
    })}
    {state.message ? <Status>{state.message}</Status> : null}
  </TaskScreenShell>;
}

export function WarrantyClaimCreateScreen() {
  const route = useRoute<any>(); const coverageId = route.params?.coverageId as string | undefined;
  return <WarrantyClaimCreateForCoverage key={coverageId ?? 'missing'} coverageId={coverageId} />;
}

function WarrantyClaimCreateForCoverage({ coverageId }: { coverageId?: string }) {
  const navigation = useNavigation<any>();
  const { controller, state } = useCustomerAftercare('warranty'); const [description, setDescription] = useState('');
  useEffect(() => () => controller.cancelConfirmation(), [controller]);
  const coverage = useMemo(() => state.coverages.status === 'ready' ? state.coverages.data.find((item: any) => item.id === coverageId) : null, [state.coverages, coverageId]);
  const can = !!coverageId && controller.canClaim(coverageId); const confirmed = state.confirmation?.operation === 'warranty-create'; const busy = ['verifying', 'submitting'].includes(state.phase); const locked = busy || state.phase === 'confirming' || state.phase === 'unknown' || !!state.confirmation;
  useEffect(() => {
    if (state.phase !== 'resolved' || !coverageId || state.claims.status !== 'ready') return;
    const claim = state.claims.data.find((item: any) => item.warrantyCoverageId === coverageId && item.status === 'submitted');
    if (claim) navigation.replace('CustomerWarrantyClaim', { claimId: claim.id });
  }, [navigation, state.phase, state.claims, coverageId]);
  return <TaskScreenShell title="Tạo yêu cầu bảo hành" onBack={() => { controller.cancelConfirmation(); navigation.goBack(); }} primary={confirmed ? { label: busy ? 'Đang gửi…' : 'Xác nhận gửi yêu cầu', disabled: busy || state.phase !== 'confirming', onPress: () => void controller.submitConfirmation() } : { label: busy ? 'Đang kiểm tra…' : 'Kiểm tra yêu cầu', disabled: locked || state.phase !== 'idle' || !can || description.trim().length < 10, accessibilityHint: !can ? 'Chưa xác minh phạm vi bảo hành hoặc không đủ điều kiện' : 'Kiểm tra điều kiện trước khi gửi', onPress: () => coverageId && void controller.prepareClaim({ warrantyCoverageId: coverageId, description: description.trim() }) }} secondary={{ label: confirmed ? 'Sửa nội dung' : 'Quay lại', disabled: busy, onPress: () => { if (confirmed) controller.cancelConfirmation(); else { controller.cancelConfirmation(); navigation.goBack(); } } }}>
    {!coverage ? <Loading>Đang xác minh phạm vi bảo hành…</Loading> : <>
      <DetailRow label="Phạm vi" value={coverage.note || 'Bảo hành'} /><DetailRow label="Tình trạng" value={coverageLabel[String(coverage.status).toLowerCase()] || 'Chưa xác định'} />
      {coverage.status === 'expired' ? <Status>Phạm vi đã hết hạn. Bạn vẫn có thể gửi yêu cầu để máy chủ xem xét.</Status> : null}
      <Text style={label}>Mô tả sự cố</Text><TextInput accessibilityLabel="Mô tả sự cố" value={description} editable={!locked} onChangeText={setDescription} multiline maxLength={2000} style={[field, { minHeight: 130 }]} />
      <Status>Ảnh mới đang chờ hỗ trợ lưu trữ riêng tư. Hiện chưa thể đính kèm ảnh.</Status>
      {!can ? <Status>Chưa thể tạo yêu cầu. Hãy làm mới thông tin phạm vi hoặc kiểm tra yêu cầu đang mở.</Status> : null}
    </>}
    {confirmed ? <Status>Yêu cầu sẽ được gửi với phạm vi đã chọn và mô tả bạn vừa nhập.</Status> : null}{state.message ? <Status>{state.message}</Status> : null}
  </TaskScreenShell>;
}

export function CustomerWarrantyClaimScreen() {
  const route = useRoute<any>(); const claimId = route.params?.claimId as string | undefined;
  return <CustomerWarrantyClaimForId key={claimId ?? 'missing'} claimId={claimId} />;
}

function CustomerWarrantyClaimForId({ claimId }: { claimId?: string }) {
  const navigation = useNavigation<any>(); const { controller, state } = useCustomerAftercare('warranty');
  useEffect(() => () => controller.cancelConfirmation(), [controller]);
  const claim = state.claims.status === 'ready' ? state.claims.data.find((item: any) => item.id === claimId) : null;
  const [decision, setDecision] = useState<'agree' | 'dispute' | null>(null); const [note, setNote] = useState('');
  const confirmed = state.confirmation?.operation === 'warranty-respond-agree' || state.confirmation?.operation === 'warranty-respond-dispute';
  const busy = ['verifying', 'submitting'].includes(state.phase); const locked = busy || state.phase === 'confirming' || state.phase === 'unknown' || !!state.confirmation; const can = !!claimId && controller.canRespond(claimId);
  const prepare = (next: 'agree' | 'dispute') => { setDecision(next); void controller.prepareResponse(claimId!, { decision: next, ...(note.trim() ? { note: note.trim() } : {}) }); };
  return <TaskScreenShell title="Yêu cầu bảo hành" onBack={() => { controller.cancelConfirmation(); navigation.goBack(); }} primary={confirmed ? { label: busy ? 'Đang gửi…' : 'Xác nhận phản hồi', disabled: busy || state.phase !== 'confirming', onPress: () => void controller.submitConfirmation() } : undefined} secondary={{ label: confirmed ? 'Sửa nội dung' : 'Quay lại', disabled: busy, onPress: () => { if (confirmed) { controller.cancelConfirmation(); setDecision(null); } else { controller.cancelConfirmation(); navigation.goBack(); } } }}>
    {!claim ? state.claims.status === 'error' ? <Status>Không tải được yêu cầu bảo hành. Hãy quay lại và mở lại chi tiết.</Status> : <Loading>Đang tải yêu cầu bảo hành…</Loading> : <>
      <DetailRow label="Tình trạng" value={claimLabel[String(claim.status).toLowerCase()] || 'Chưa xác định'} /><DetailRow label="Mô tả" value={claim.description} /><DetailRow label="Phản hồi của bạn" value={claim.customerResponse === 'agreed' ? 'Đã đồng ý' : claim.customerResponse === 'disputed' ? 'Đã gửi phản hồi vấn đề' : 'Chưa phản hồi'} />
      {claim.submittedAfterExpiry ? <Status>Yêu cầu được gửi sau khi phạm vi bảo hành hết hạn. Máy chủ quyết định việc tiếp nhận và xử lý.</Status> : null}
      {claim.status === 'awaiting_customer' ? <>
        <Status>Phản hồi của bạn không đóng yêu cầu. Việc hoàn tất do quy trình bảo hành xác nhận.</Status>
        <Text style={label}>Ghi chú (không bắt buộc khi đồng ý)</Text><TextInput accessibilityLabel="Ghi chú phản hồi" value={note} editable={!locked} onChangeText={setNote} multiline maxLength={2000} style={[field, { minHeight: 100 }]} />
        {!can ? <Status>Phản hồi hiện chưa được phép gửi.</Status> : <View style={{ gap: 8 }}>
          <Pressable accessibilityRole="button" disabled={locked || !!decision || !can} onPress={() => prepare('agree')} style={link}><Text style={linkText}>Đồng ý với kết quả</Text></Pressable>
          <Pressable accessibilityRole="button" disabled={locked || !!decision || !can || note.trim().length < 10} onPress={() => prepare('dispute')} style={[link, (!can || note.trim().length < 10) && { opacity: 0.5 }]}><Text style={linkText}>Gửi phản hồi vấn đề</Text></Pressable>
          {!note.trim() || note.trim().length < 10 ? <Text style={{ color: colors.textSecondary }}>Phản hồi vấn đề cần ghi chú ít nhất 10 ký tự.</Text> : null}
        </View>}
      </> : <Status>Yêu cầu đang ở trạng thái chỉ xem. Bạn không thể đóng hoặc thay đổi quyết định của nhân viên.</Status>}
      {confirmed ? <Status>{decision === 'agree' ? 'Bạn sẽ đồng ý với kết quả.' : 'Bạn sẽ gửi phản hồi vấn đề.'} Yêu cầu vẫn chờ bước tiếp theo.</Status> : null}
    </>}
    {state.message ? <Status>{state.message}</Status> : null}
  </TaskScreenShell>;
}

const link = { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, justifyContent: 'center' as const, paddingHorizontal: spacing.md };
const linkText = { color: colors.primaryStrong, fontSize: 15, fontWeight: '600' as const };
