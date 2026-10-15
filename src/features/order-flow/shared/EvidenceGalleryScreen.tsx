import React from 'react';
import { Image, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useOrderSession } from '../runtime/OrderSessionProvider';
import { visibleEvidence } from './order-detail-view-models';
import { ReadOnlyNotice, TaskScreenShell } from './TaskScreenShell';
import { lightTheme as colors, spacing } from '../../../constants/theme';
import { useLoadUnloadedResources } from './useLoadUnloadedResources';

const typeLabel: Record<string, string> = { BEFORE: 'Trước sửa chữa', AFTER: 'Sau sửa chữa', CHECKIN_FACE: 'Ảnh khuôn mặt' };

export default function EvidenceGalleryScreen() {
  const { key, snapshot, refresh, loadResource } = useOrderSession();
  const navigation = useNavigation<any>();
  const canRefresh = snapshot?.access === 'current' && !!key;
  const refreshing = snapshot?.order.status === 'loading' || snapshot?.resources.evidence.status === 'loading';
  const current = snapshot?.access === 'current' && snapshot.order.status === 'ready' && !!key;
  useLoadUnloadedResources(snapshot, ['evidence'], loadResource);
  const resource = snapshot?.resources.evidence;
  const photos = current && resource?.status === 'ready' ? visibleEvidence(key!.role, resource.data) : [];
  return <TaskScreenShell title="Ảnh và bằng chứng" onBack={() => navigation.goBack()}
    secondary={{ label: 'Làm mới dữ liệu', testID: 'readonly-detail-refresh', disabled: !canRefresh || refreshing,
      onPress: () => { if (canRefresh && !refreshing) void refresh('manual'); } }}>
    {!current && <ReadOnlyNotice>{snapshot?.access === 'revoked' ? 'Quyền truy cập đã thay đổi; ảnh riêng của đơn không còn khả dụng.' : 'Ảnh chỉ tải sau khi quyền xem đơn hiện tại được xác minh.'}</ReadOnlyNotice>}
    {current && resource?.status === 'loading' && <ReadOnlyNotice>Đang tải ảnh từ máy chủ…</ReadOnlyNotice>}
    {current && resource?.status === 'error' && <ReadOnlyNotice>Chưa tải được ảnh. Dữ liệu lỗi không được xem như danh sách rỗng.</ReadOnlyNotice>}
    {current && resource?.status === 'ready' && photos.length === 0 && <ReadOnlyNotice>Đơn chưa có ảnh hiển thị cho tài khoản này.</ReadOnlyNotice>}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
      {photos.map(photo => <TouchableOpacity key={photo.id} accessibilityRole="button" accessibilityLabel={`Mở ${(typeLabel[photo.type] ?? 'ảnh bổ sung').toLowerCase()}`}
        onPress={() => navigation.push('EvidenceViewer', { evidenceId: photo.id })} style={{ width: '48%', minHeight: 130, backgroundColor: colors.surface, borderRadius: 12, overflow: 'hidden' }}>
        <Image source={{ uri: photo.mediaUrl }} resizeMode="cover" style={{ height: 112, width: '100%' }} />
        <Text style={{ color: colors.text, padding: 8, fontWeight: '600' }}>{typeLabel[photo.type] ?? 'Ảnh bổ sung'}</Text>
      </TouchableOpacity>)}
    </View>
  </TaskScreenShell>;
}
