import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useOrderSession } from '../runtime/OrderSessionProvider';
import { ReadOnlyNotice, TaskScreenShell } from './TaskScreenShell';
import OrderCostHistory from './OrderCostHistory';
import { lightTheme as colors, spacing } from '../../../constants/theme';
import { useLoadUnloadedResources } from './useLoadUnloadedResources';
import { resolveProposalReadModel } from './order-detail-view-models';
import { backFromFlow } from '../navigation/resume-order';

export default function ProposalDetailScreen() {
  const { key, snapshot, loadResource } = useOrderSession();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const current = snapshot?.access === 'current' && snapshot.order.status === 'ready' && !!key;
  useLoadUnloadedResources(snapshot, ['quotations', 'extras'], loadResource);
  const proposalId = route.params?.proposalId as string | undefined;
  const lookup = current && snapshot ? resolveProposalReadModel(snapshot, proposalId) : null;
  const proposals = lookup?.kind === 'found' ? lookup.items : [];
  const only = proposalId && proposals.length === 1 ? proposals[0] : null;
  const title = only ? (only.kind === 'quotation' ? 'Chi tiết báo giá' : 'Chi tiết chi phí phát sinh') : 'Báo giá và chi phí phát sinh';
  return <TaskScreenShell title={title} onBack={() => backFromFlow(navigation)}>
    {!current && <ReadOnlyNotice>{snapshot?.access === 'historical' ? 'Báo giá và chi phí phát sinh không được tải cho đơn lịch sử.' : 'Chỉ xem được sau khi hệ thống xác minh quyền xem đơn hiện tại.'}</ReadOnlyNotice>}
    {current && lookup?.kind === 'loading' && <ReadOnlyNotice>Đang tải…</ReadOnlyNotice>}
    {current && lookup?.kind === 'unavailable' && <ReadOnlyNotice>Chưa tải được đầy đủ dữ liệu. Vui lòng thử lại; đây không có nghĩa là chưa có báo giá hay chi phí phát sinh.</ReadOnlyNotice>}
    {current && !proposalId && lookup?.kind === 'found' && proposals.length === 0 && <ReadOnlyNotice>Không có báo giá hoặc chi phí phát sinh nào đang chờ duyệt.</ReadOnlyNotice>}
    {current && !proposalId && lookup?.kind === 'found' && proposals.length > 1 && <ReadOnlyNotice>Có nhiều mục đang chờ duyệt. Hãy chọn đúng mục để xem chi tiết.</ReadOnlyNotice>}
    {current && !proposalId && lookup?.kind === 'found' && proposals.map(item => <TouchableOpacity key={`${item.kind}-${item.id}`} accessibilityRole="button" onPress={() => navigation.push('ProposalDetail', { proposalId: item.id })}
      style={{ minHeight: 48, justifyContent: 'center', backgroundColor: colors.surface, borderRadius: 12, padding: spacing.md }}>
      <Text style={{ color: colors.primaryStrong, fontSize: 16, fontWeight: '600' }}>{item.kind === 'quotation' ? `Báo giá lần ${item.version ?? '—'}` : 'Chi phí phát sinh'}  ›</Text>
    </TouchableOpacity>)}
    {current && proposalId && lookup?.kind === 'not-found' && <ReadOnlyNotice>Không tìm thấy mục này trong đơn của bạn.</ReadOnlyNotice>}
    {current && only ? <OrderCostHistory onlyId={only.id} /> : null}
    {current && only?.kind === 'quotation' ? <ReadOnlyNotice>Linh kiện được tính theo số lượng thực tế đã dùng. Phần báo giá không dùng đến sẽ không bị tính tiền trên hóa đơn.</ReadOnlyNotice> : null}
  </TaskScreenShell>;
}
