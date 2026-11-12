import React, { useEffect, useMemo, useState } from 'react';
import { warrantyCustomerPromptCopy } from '../../../screens/customer/customer-warranty';
import { Image, Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useCustomerAftercare } from '../customer/useCustomerAftercare';
import { useOrderSession } from '../runtime/OrderSessionProvider';
import { WarrantyPhotos } from './WarrantyPhotos';
import { DetailRow, ReadOnlyNotice, Section, TaskScreenShell } from '../shared/TaskScreenShell';
import { lightTheme as colors, spacing } from '../../../constants/theme';
import { vnDateTimeString } from '../../../utils/vn-time';

const label = { color: colors.text, fontSize: 15, lineHeight: 22 };
const coverageLabel: Record<string, string> = { active: 'Còn hiệu lực', expired: 'Đã hết hạn', voided: 'Đã hủy', pending: 'Đang chờ xác minh' };
/** What happens next, in the customer's words, for a claim that is not waiting for them. */
const nextStep: Record<string, string> = {
  submitted: 'Đang chờ kỹ thuật viên nhận yêu cầu. Bạn sẽ nhận thông báo khi có tiến triển.',
  accepted: 'Kỹ thuật viên đã nhận yêu cầu. Hãy giữ liên lạc và có mặt theo lịch kiểm tra.',
  inspected: 'Kỹ thuật viên đã kiểm tra. Quản lý dịch vụ đang xem xét kết quả.',
  in_progress: 'Quản lý dịch vụ đã duyệt. Kỹ thuật viên đang xử lý bảo hành cho bạn.',
  disputed: 'Phản hồi của bạn đang được quản lý dịch vụ xem xét.',
  resolved: 'Yêu cầu bảo hành đã hoàn tất.',
  rejected: 'Yêu cầu không được bảo hành. Xem phản hồi bên dưới.',
};
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
  // A sent review is read-only: no form actions are left to offer, only the way back.
  const footer = review
    ? { primary: undefined, secondary: { label: 'Quay lại', onPress: () => { controller.cancelConfirmation(); navigation.goBack(); } } }
    : { primary, secondary: { label: confirmed ? 'Sửa nội dung' : 'Để sau', disabled: busy, onPress: () => { if (confirmed) controller.cancelConfirmation(); else { controller.cancelConfirmation(); navigation.goBack(); } } } };
  return <TaskScreenShell title="Đánh giá dịch vụ" onBack={() => { controller.cancelConfirmation(); navigation.goBack(); }} primary={footer.primary} secondary={footer.secondary}>
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

let lastWarranty: { orderId: string; coverages: any[]; claims: any[] } | null = null;
/**
 * Leaving the page (or the app going to the background, a picker opening) clears the controller's data on purpose; keep the last read
 * of this order and show it, read-only, while the refresh runs, so the three warranty screens never blank or fall back to a full-page loader.
 */
function useWarrantySnapshot(state: { coverages: any; claims: any }) {
  const orderId = useOrderSession().key?.serviceOrderId;
  const last = lastWarranty?.orderId === orderId ? lastWarranty : null;
  useEffect(() => {
    if (orderId && state.coverages.status === 'ready' && state.claims.status === 'ready') lastWarranty = { orderId, coverages: state.coverages.data, claims: state.claims.data };
  }, [orderId, state.coverages, state.claims]);
  const refreshing = ['loading', 'unloaded'].includes(state.coverages.status) || ['loading', 'unloaded'].includes(state.claims.status);
  const coverages: any[] = state.coverages.status === 'ready' ? state.coverages.data : refreshing ? (last?.coverages ?? []) : [];
  const claims: any[] = state.claims.status === 'ready' ? state.claims.data : refreshing ? (last?.claims ?? []) : [];
  return { coverages, claims, refreshing };
}
export function CustomerWarrantyScreen() {
  const navigation = useNavigation<any>(); const { controller, state } = useCustomerAftercare('warranty');
  const { coverages, claims, refreshing } = useWarrantySnapshot(state);
  const isOpen = (item: any) => !['resolved', 'rejected', 'closed'].includes(String(item.status).toLowerCase());
  // The customer cannot tell a workmanship fault from a faulty part (the technician decides at inspection): one claim for the whole order,
  // filed on the free item that is covered longest.
  const free = coverages.filter((coverage: any) => String(coverage.status).toLowerCase() !== 'voided' && !claims.some((item: any) => item.warrantyCoverageId === coverage.id && isOpen(item)));
  const rank = (coverage: any) => (String(coverage.status).toLowerCase() === 'expired' ? 0 : 1) * 1e15 + (Date.parse(coverage.expiresAt) || 0);
  const best = [...free].sort((x: any, y: any) => rank(y) - rank(x))[0] as any;
  const loaded = state.coverages.status === 'ready' && state.claims.status === 'ready';
  const nothingOpen = !claims.some(isOpen);
  const returnTab = useRoute<any>().params?.returnTab as string | undefined; const [showAll, setShowAll] = useState(false);
  return <TaskScreenShell title="Bảo hành" onBack={() => navigation.goBack()} secondary={{ label: 'Làm mới', onPress: () => void controller.loadWarranty(), disabled: state.phase === 'verifying' }}>
    {refreshing && !coverages.length ? <Loading /> : null}
    {state.coverages.status === 'error' || state.claims.status === 'error' ? <Status>Chưa tải được thông tin bảo hành. Hãy thử làm mới.</Status> : null}
    {state.coverages.status === 'ready' && coverages.length === 0 ? <Status>Đơn này chưa có thông tin phạm vi bảo hành.</Status> : null}
    {loaded && coverages.length > 0 && !best ? <Status>{nothingOpen ? 'Máy này không còn hạng mục nào có thể tạo yêu cầu bảo hành (bảo hành đã hủy).' : 'Máy này đã có yêu cầu bảo hành đang xử lý.'}</Status> : null}
    {claims.filter(isOpen).map((item: any) => {
      const waiting = item.status === 'awaiting_customer' && !item.customerResponse;
      return <Section key={item.id} title={waiting ? 'Cần bạn phản hồi' : 'Yêu cầu bảo hành đang xử lý'}>
        <DetailRow label="Tình trạng" value={claimLabel[String(item.status).toLowerCase()] || 'Chưa xác định'} />
        <DetailRow label="Gửi ngày" value={vnDateTimeString(item.submittedAt)} />
        <View style={{ paddingVertical: 12 }}><Pressable accessibilityRole="button" accessibilityLabel={waiting ? 'Xem và phản hồi yêu cầu bảo hành' : 'Xem yêu cầu bảo hành'} onPress={() => navigation.navigate('CustomerWarrantyClaim', { claimId: item.id })} style={link}><Text style={linkText}>{waiting ? 'Xem và phản hồi ›' : 'Xem yêu cầu ›'}</Text></Pressable></View>
      </Section>;
    })}
    {coverages.length > 0 ? <Section title={`Hạng mục được bảo hành (${coverages.length})`}>
      {(showAll || coverages.length <= 5 ? coverages : coverages.slice(0, 3)).map((coverage: any) => {
        const days = Number(coverage.warrantyDaysSnapshot) || 0;
        const status = coverageLabel[String(coverage.status).toLowerCase()] || 'Chưa xác định';
        return <View key={coverage.id} style={{ paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: colors.border, gap: 2 }}>
          <Text style={{ ...label, fontWeight: '700' }}>{coverage.itemDescription || coverage.note || 'Bảo hành của đơn'}</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{status}{days ? ` · ${days} ngày` : ''}{coverage.expiresAt ? ` · đến ${vnDateTimeString(coverage.expiresAt)}` : ''}</Text>
          {coverage.startsAt ? <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Từ {vnDateTimeString(coverage.startsAt)}{coverage.itemType === 'labor' ? ' · Công sửa' : coverage.itemType === 'parts_equipment' ? ' · Linh kiện' : ''}</Text> : null}
        </View>;
      })}
      {coverages.length > 5 ? <Pressable accessibilityRole="button" onPress={() => setShowAll(v => !v)} style={{ paddingVertical: 12 }}><Text style={linkText}>{showAll ? 'Thu gọn ›' : `Xem thêm ${coverages.length - 3} hạng mục ›`}</Text></Pressable> : null}
    </Section> : null}
    {claims.some(item => !isOpen(item)) ? <Section title="Lịch sử yêu cầu bảo hành">
      {[...claims].filter(item => !isOpen(item)).sort((x: any, y: any) => (Date.parse(y.submittedAt) || 0) - (Date.parse(x.submittedAt) || 0)).map((item: any) => {
        const done = String(item.status).toLowerCase() === 'resolved';
        const tone = done ? colors.success : colors.textSecondary;
        return <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Xem chi tiết yêu cầu bảo hành: ${item.description}`} onPress={() => navigation.navigate('CustomerWarrantyClaim', { claimId: item.id })} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
          <View style={{ flex: 1, gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: done ? '#E7F6EC' : '#F1F3F6' }}>
                <Ionicons name={done ? 'checkmark-circle' : 'close-circle'} size={14} color={tone} />
                <Text style={{ color: tone, fontSize: 12, fontWeight: '700' }}>{claimLabel[String(item.status).toLowerCase()] || 'Chưa xác định'}</Text>
              </View>
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{vnDateTimeString(item.submittedAt)}</Text>
            </View>
            <Text numberOfLines={2} style={{ ...label, fontWeight: '600' }}>{item.description}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </Pressable>;
      })}
    </Section> : null}
    {best ? <Pressable accessibilityRole="button" accessibilityLabel="Tạo yêu cầu bảo hành" onPress={() => navigation.navigate('WarrantyClaimCreate', { coverageId: best.id, returnTab })} style={link}><Text style={linkText}>Tạo yêu cầu bảo hành mới ›</Text></Pressable> : null}
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
  const [photos, setPhotos] = useState<string[]>([]);
  const { coverages: covered } = useWarrantySnapshot(state);
  const { snapshot } = useOrderSession(); const order: any = snapshot?.order.status === 'ready' ? snapshot.order.data : null;
  useEffect(() => () => controller.cancelConfirmation(), [controller]);
  const coverage = useMemo(() => covered.find((item: any) => item.id === coverageId) ?? null, [covered, coverageId]);
  const can = !!coverageId && controller.canClaim(coverageId); const confirmed = state.confirmation?.operation === 'warranty-create'; const busy = ['verifying', 'submitting'].includes(state.phase); const locked = busy || state.phase === 'confirming' || state.phase === 'unknown' || !!state.confirmation;
  useEffect(() => {
    if (state.phase !== 'resolved' || !coverageId || state.claims.status !== 'ready') return;
    const claim = state.claims.data.find((item: any) => item.warrantyCoverageId === coverageId && item.status === 'submitted');
    if (claim) navigation.replace('CustomerWarrantyClaim', { claimId: claim.id });
  }, [navigation, state.phase, state.claims, coverageId]);
  return <TaskScreenShell hideVisitPanel title="Tạo yêu cầu bảo hành" onBack={() => { controller.cancelConfirmation(); navigation.goBack(); }} primary={confirmed ? { label: busy ? 'Đang gửi…' : 'Xác nhận gửi yêu cầu', disabled: busy || state.phase !== 'confirming', onPress: () => void controller.submitConfirmation() } : { label: busy ? 'Đang kiểm tra…' : 'Kiểm tra yêu cầu', disabled: locked || state.phase !== 'idle' || !can || description.trim().length < 10, accessibilityHint: !can ? 'Chưa xác minh phạm vi bảo hành hoặc không đủ điều kiện' : 'Kiểm tra điều kiện trước khi gửi', onPress: () => coverageId && void controller.prepareClaim({ warrantyCoverageId: coverageId, description: description.trim(), ...(photos.length ? { evidenceRefs: photos } : {}) }) }} secondary={{ label: confirmed ? 'Sửa nội dung' : 'Quay lại', disabled: busy, onPress: () => { if (confirmed) controller.cancelConfirmation(); else { controller.cancelConfirmation(); navigation.goBack(); } } }}>
    {!coverage ? <Loading>Đang xác minh phạm vi bảo hành…</Loading> : <>
      {order ? <DetailRow label="Đơn sửa chữa" value={`#${order.code} · ${order.serviceName}`} /> : null}
      <Section title="Được bảo hành">
        {covered.slice(0, 3).map((item: any) => <View key={item.id} style={{ paddingVertical: 10, gap: 2, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
          <Text style={{ ...label, fontWeight: '700' }}>{item.itemDescription || item.note || 'Bảo hành của đơn'}</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{item.warrantyDaysSnapshot ? `Bảo hành ${item.warrantyDaysSnapshot} ngày` : 'Thời hạn bảo hành theo đơn'}{item.expiresAt ? ` · đến ${vnDateTimeString(item.expiresAt)}` : ''} · {coverageLabel[String(item.status).toLowerCase()] || 'Chưa xác định'}</Text>
        </View>)}
        {covered.length > 3 ? <Text style={{ color: colors.textSecondary, paddingVertical: 8 }}>và {covered.length - 3} hạng mục khác</Text> : null}
      </Section>
      {coverage.status === 'expired' ? <Status>Phạm vi đã hết hạn. Bạn vẫn có thể gửi yêu cầu để máy chủ xem xét.</Status> : null}
      <Status>Bạn chỉ cần mô tả sự cố. Kỹ thuật viên sẽ kiểm tra và xác định lỗi do công hay do linh kiện.</Status>
      <Text style={label}>Mô tả sự cố</Text><TextInput accessibilityLabel="Mô tả sự cố" value={description} editable={!locked} onChangeText={setDescription} multiline maxLength={2000} placeholder="Mô tả từ 10 đến 2000 ký tự" placeholderTextColor={colors.textSecondary} style={[field, { minHeight: 130 }]} />
      <WarrantyPhotos urls={photos} onChange={setPhotos} onUploaded={urls => controller.registerUploadedPhotos(urls)} disabled={locked} />
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
  const { claims: known } = useWarrantySnapshot(state);
  const claim = known.find((item: any) => item.id === claimId) ?? null;
  const [decision, setDecision] = useState<'agree' | 'dispute' | null>(null); const [choice, setChoice] = useState<'agree' | 'dispute' | null>(null); const [note, setNote] = useState('');
  const confirmed = state.confirmation?.operation === 'warranty-respond-agree' || state.confirmation?.operation === 'warranty-respond-dispute';
  const busy = ['verifying', 'submitting'].includes(state.phase); const locked = busy || state.phase === 'confirming' || state.phase === 'unknown' || !!state.confirmation; const can = !!claimId && controller.canRespond(claimId);
  const prepare = (next: 'agree' | 'dispute') => { setDecision(next); void controller.prepareResponse(claimId!, { decision: next, ...(note.trim() ? { note: note.trim() } : {}) }); };
  const { snapshot } = useOrderSession(); const order: any = snapshot?.order.status === 'ready' ? snapshot.order.data : null;
  const copy = warrantyCustomerPromptCopy(claim ?? ({} as any));
  return <TaskScreenShell hideVisitPanel title="Yêu cầu bảo hành" onBack={() => { controller.cancelConfirmation(); navigation.goBack(); }} primary={confirmed ? { label: busy ? 'Đang gửi…' : 'Xác nhận phản hồi', disabled: busy || state.phase !== 'confirming', onPress: () => void controller.submitConfirmation() } : claim?.status === 'awaiting_customer' && !claim.customerResponse && can ? { label: 'Gửi phản hồi', disabled: locked || !choice || (choice === 'dispute' && note.trim().length < 10), onPress: () => choice && prepare(choice) } : undefined} secondary={{ label: confirmed ? 'Sửa nội dung' : 'Quay lại', disabled: busy, onPress: () => { if (confirmed) { controller.cancelConfirmation(); setDecision(null); } else { controller.cancelConfirmation(); navigation.goBack(); } } }}>
    {!claim ? state.claims.status === 'error' ? <Status>Không tải được yêu cầu bảo hành. Hãy quay lại và mở lại chi tiết.</Status> : <Loading>Đang tải yêu cầu bảo hành…</Loading> : <>
      {order ? <DetailRow label="Đơn sửa chữa" value={`#${order.code} · ${order.serviceName}`} /> : null}
      <DetailRow label="Tình trạng" value={claimLabel[String(claim.status).toLowerCase()] || 'Chưa xác định'} />
      {claim.technician?.fullName ? <DetailRow label="Kỹ thuật viên" value={claim.technician.fullName} /> : null}
      <DetailRow label="Gửi ngày" value={vnDateTimeString(claim.submittedAt)} />
      {claim.inspectionScheduledAt ? <DetailRow label="Lịch kiểm tra" value={vnDateTimeString(claim.inspectionScheduledAt)} /> : null}
      <DetailRow label="Mô tả" value={claim.description} />
      {claim.resolutionNotes ? <DetailRow label="Phản hồi" value={claim.resolutionNotes} /> : null}
      {claim.resolvedAt ? <DetailRow label="Hoàn tất" value={vnDateTimeString(claim.resolvedAt)} /> : null}
      {claim.evidenceRefs?.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 8 }}>
        {claim.evidenceRefs.map((url: string, index: number) => <Image key={url} source={{ uri: url }} accessibilityIgnoresInvertColors accessibilityLabel={`Ảnh đính kèm ${index + 1}`} style={{ width: 72, height: 72, borderRadius: 10 }} />)}
      </View> : null}
      {claim.status === 'awaiting_customer' || claim.customerResponse ? <DetailRow label="Phản hồi của bạn" value={claim.customerResponse === 'agreed' ? 'Đã đồng ý' : claim.customerResponse === 'disputed' ? 'Đã gửi phản hồi vấn đề' : 'Chưa phản hồi'} /> : null}
      {claim.submittedAfterExpiry ? <Status>Yêu cầu được gửi sau khi phạm vi bảo hành hết hạn. Máy chủ quyết định việc tiếp nhận và xử lý.</Status> : null}
      {claim.status === 'awaiting_customer' && claim.customerResponse ? <Status>{claim.customerResponse === 'agreed' ? copy.agreed : 'Phản hồi của bạn đã được gửi. FixHome sẽ xem xét và liên hệ lại.'}</Status> : claim.status === 'awaiting_customer' ? <>
        <Text style={{ ...label, fontWeight: '700' }}>{copy.question}</Text>
        {!can ? <Status>Phản hồi hiện chưa được phép gửi.</Status> : <View style={{ flexDirection: 'row', gap: 8 }}>
          {(['agree', 'dispute'] as const).map(value => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: choice === value, disabled: locked }} disabled={locked} onPress={() => setChoice(value)} style={[link, { flex: 1, alignItems: 'center' }, choice === value && { borderColor: colors.primaryStrong, borderWidth: 2 }]}><Text style={linkText}>{value === 'agree' ? copy.agree : copy.dispute}</Text></Pressable>)}
        </View>}
        {choice === 'dispute' ? <><Text style={label}>{copy.reason} (ít nhất 10 ký tự)</Text><TextInput accessibilityLabel="Ghi chú phản hồi" value={note} editable={!locked} onChangeText={setNote} multiline maxLength={2000} style={[field, { minHeight: 100 }]} /></> : null}
      </> : <Status>{nextStep[String(claim.status).toLowerCase()] ?? 'Yêu cầu đang được xử lý.'}</Status>}
      {confirmed ? <Status>{decision === 'agree' ? copy.agree : copy.dispute}. Bấm Xác nhận phản hồi để gửi.</Status> : null}
    </>}
    {state.message ? <Status>{state.message}</Status> : null}
  </TaskScreenShell>;
}

const link = { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, justifyContent: 'center' as const, paddingHorizontal: spacing.md };
const linkText = { color: colors.primaryStrong, fontSize: 15, fontWeight: '600' as const };
