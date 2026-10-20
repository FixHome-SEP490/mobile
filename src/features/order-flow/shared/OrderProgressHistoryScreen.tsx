import React from 'react';
import { serviceOrderStatusView } from '../../../screens/technician/technician-status';
import { Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useOrderSession } from '../runtime/OrderSessionProvider';
import { DetailRow, ReadOnlyNotice, TaskScreenShell } from './TaskScreenShell';
import { vnDateTimeString } from '../../../utils/vn-time';
import { lightTheme as colors, spacing } from '../../../constants/theme';
import { useLoadUnloadedResources } from './useLoadUnloadedResources';

const ACTOR_LABELS: Record<string, string> = {
  customer: 'Khách hàng',
  technician: 'Kỹ thuật viên',
  admin: 'Quản trị viên',
  service_manager: 'Quản lý dịch vụ',
  system: 'Hệ thống',
};

export default function OrderProgressHistoryScreen() {
  const { key, snapshot, refresh, loadResource } = useOrderSession();
  const navigation = useNavigation<any>();
  const canRefresh = snapshot?.access === 'current' && !!key;
  const refreshing = snapshot?.order.status === 'loading' || snapshot?.resources.history.status === 'loading';
  const current = snapshot?.access === 'current' && snapshot.order.status === 'ready';
  const historicalTech = snapshot?.access === 'historical' && key?.role === 'technician';
  useLoadUnloadedResources(snapshot, ['history'], loadResource);
  const resource = snapshot?.resources.history;
  return <TaskScreenShell title="Lịch sử tiến độ" onBack={() => navigation.goBack()}
    secondary={{ label: 'Làm mới dữ liệu', testID: 'readonly-detail-refresh', disabled: !canRefresh || refreshing,
      onPress: () => { if (canRefresh && !refreshing) void refresh('manual'); } }}>
    {historicalTech && <ReadOnlyNotice>Đơn lịch sử chỉ có bản tóm tắt bảy trường do máy chủ cấp. Không tải lịch sử, hồ sơ đặt chỗ hoặc tài nguyên chi tiết.</ReadOnlyNotice>}
    {!current && !historicalTech && <ReadOnlyNotice>{snapshot?.access === 'revoked' ? 'Quyền truy cập đã thay đổi; dữ liệu đơn đã được xóa.' : 'Lịch sử chỉ tải sau khi xác minh quyền xem đơn hiện tại.'}</ReadOnlyNotice>}
    {current && resource?.status === 'loading' && <ReadOnlyNotice>Đang tải lịch sử từ máy chủ…</ReadOnlyNotice>}
    {current && resource?.status === 'error' && <ReadOnlyNotice>Chưa tải được lịch sử. Ứng dụng sẽ tự thử lại.</ReadOnlyNotice>}
    {current && resource?.status === 'ready' && resource.data.length === 0 && <ReadOnlyNotice>Máy chủ chưa có mục lịch sử tiến độ cho đơn này.</ReadOnlyNotice>}
    {current && resource?.status === 'ready' && resource.data.map(entry => <View key={entry.id} style={{ backgroundColor: colors.surface, borderRadius: 12, padding: spacing.md }}>
      <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700' }}>{serviceOrderStatusView(entry.toStatus).label}</Text>
      <DetailRow label="Thời điểm" value={vnDateTimeString(entry.createdAt)} />
      {entry.fromStatus && <DetailRow label="Trạng thái trước" value={serviceOrderStatusView(entry.fromStatus).label} />}
      {entry.actorRole && <DetailRow label="Vai trò thực hiện" value={ACTOR_LABELS[String(entry.actorRole).toLowerCase()] ?? 'Hệ thống'} />}
      {entry.reason && <DetailRow label="Ghi chú máy chủ" value={entry.reason} />}
    </View>)}
  </TaskScreenShell>;
}
