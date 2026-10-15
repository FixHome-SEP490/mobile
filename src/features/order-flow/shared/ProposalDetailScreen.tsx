import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useOrderSession } from '../runtime/OrderSessionProvider';
import { DetailRow, ReadOnlyNotice, TaskScreenShell } from './TaskScreenShell';
import { formatVnd } from '../../../utils/format';
import { lightTheme as colors, spacing } from '../../../constants/theme';
import { useLoadUnloadedResources } from './useLoadUnloadedResources';
import { costLineDisplay, resolveProposalReadModel } from './order-detail-view-models';

const money = (value: number | string) => typeof value === 'number' ? formatVnd(value) : typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value) ? `${value} ₫` : 'Chưa có dữ liệu';

export default function ProposalDetailScreen() {
  const { key, snapshot, loadResource } = useOrderSession();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const current = snapshot?.access === 'current' && snapshot.order.status === 'ready' && !!key;
  useLoadUnloadedResources(snapshot, ['quotations', 'extras'], loadResource);
  const proposalId = route.params?.proposalId as string | undefined;
  const lookup = current && snapshot ? resolveProposalReadModel(snapshot, proposalId) : null;
  const proposals = lookup?.kind === 'found' ? lookup.items : [];
  return <TaskScreenShell title="Đề xuất" onBack={() => navigation.goBack()}>
    {!current && <ReadOnlyNotice>{snapshot?.access === 'historical' ? 'Đề xuất không được tải cho đơn lịch sử.' : 'Đề xuất chỉ tải sau khi quyền xem đơn hiện tại được xác minh.'}</ReadOnlyNotice>}
    {current && lookup?.kind === 'loading' && <ReadOnlyNotice>Đang tải danh sách đề xuất được phép xem…</ReadOnlyNotice>}
    {current && lookup?.kind === 'unavailable' && <ReadOnlyNotice>Chưa tải được đầy đủ đề xuất. Kết quả lỗi không được diễn giải thành danh sách trống hoặc mã không tồn tại.</ReadOnlyNotice>}
    {current && !proposalId && lookup?.kind === 'found' && proposals.length === 0 && <ReadOnlyNotice>Không có đề xuất nào đang chờ xử lý.</ReadOnlyNotice>}
    {current && !proposalId && lookup?.kind === 'found' && proposals.length > 1 && <ReadOnlyNotice>Có nhiều đề xuất đang chờ. Chọn đúng mã để xem chi tiết; màn hình không tự chọn theo thứ tự danh sách.</ReadOnlyNotice>}
    {current && !proposalId && lookup?.kind === 'found' && proposals.map(item => <TouchableOpacity key={`${item.kind}-${item.id}`} accessibilityRole="button" onPress={() => navigation.push('ProposalDetail', { proposalId: item.id })}
      style={{ backgroundColor: colors.surface, borderRadius: 12, padding: spacing.md }}>
      <Text style={{ color: colors.primaryStrong, fontSize: 16, fontWeight: '700' }}>{item.kind === 'quotation' ? 'Báo giá' : 'Chi phí phát sinh'} · {item.id}  ›</Text>
    </TouchableOpacity>)}
    {current && proposalId && lookup?.kind === 'not-found' && <ReadOnlyNotice>Không tìm thấy mã đề xuất này trong toàn bộ lịch sử được phép xem.</ReadOnlyNotice>}
    {current && proposalId && lookup?.kind === 'found' && proposals.map(proposal => <View key={`${proposal.kind}-${proposal.id}`} style={{ backgroundColor: colors.surface, borderRadius: 12, padding: spacing.md }}>
      <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>{proposal.kind === 'quotation' ? 'Báo giá' : 'Chi phí phát sinh'}</Text>
      <DetailRow label="Mã đề xuất" value={proposal.id} />
      <DetailRow label="Trạng thái" value={proposalStatusLabel(proposal.status)} />
      {proposal.kind === 'quotation' && proposal.version !== undefined && <DetailRow label="Phiên bản báo giá" value={proposal.version} />}
      {proposal.reason && <DetailRow label="Lý do" value={proposal.reason} />}
      {proposal.items.map(item => <DetailRow key={item.id} label={item.description} value={proposal.kind === 'extra'
        ? costLineDisplay(item)
        : `${item.quantity} × ${item.unitPrice === undefined ? 'Chưa có đơn giá' : money(item.unitPrice)}${item.lineTotal === undefined ? '' : ` · Thành tiền: ${money(item.lineTotal)}`}${proposal.kind === 'quotation' && String((item as { partWarrantyOption?: unknown }).partWarrantyOption ?? '').toLowerCase() === 'paid_warranty' ? ` · Bảo hành có phí${typeof (item as { warrantyFee?: unknown }).warrantyFee === 'number' || typeof (item as { warrantyFee?: unknown }).warrantyFee === 'string' ? `: ${money((item as { warrantyFee: number | string }).warrantyFee)}` : ''}${typeof (item as { warrantyTermDays?: unknown }).warrantyTermDays === 'number' ? `/${(item as { warrantyTermDays: number }).warrantyTermDays} ngày` : ''}` : ''}`} />)}
      {proposal.status.toUpperCase() === 'SENT' || proposal.status.toUpperCase() === 'PENDING_APPROVAL'
        ? <ReadOnlyNotice>Đề xuất đang chờ xử lý. Tác vụ chấp nhận hoặc từ chối chưa được bật trong M2.</ReadOnlyNotice>
        : <ReadOnlyNotice>Đây là bản ghi lịch sử chỉ xem. Không có thao tác nghiệp vụ trên màn hình này.</ReadOnlyNotice>}
    </View>)}
  </TaskScreenShell>;
}

function proposalStatusLabel(status: string) {
  switch (status.toUpperCase()) {
    case 'SENT': return 'Đang chờ phản hồi báo giá';
    case 'PENDING_APPROVAL': return 'Đang chờ duyệt chi phí';
    case 'APPROVED': return 'Đã duyệt';
    case 'REJECTED': return 'Đã từ chối';
    case 'SUPERSEDED': return 'Đã được thay thế';
    default: return status;
  }
}
