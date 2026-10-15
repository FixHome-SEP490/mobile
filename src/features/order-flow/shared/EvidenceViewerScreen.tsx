import React from 'react';
import { Image, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useOrderSession } from '../runtime/OrderSessionProvider';
import { resolveEvidenceViewerItem } from './order-detail-view-models';
import { ReadOnlyNotice, TaskScreenShell } from './TaskScreenShell';
import { lightTheme as colors, spacing } from '../../../constants/theme';

export default function EvidenceViewerScreen() {
  const { key, snapshot } = useOrderSession();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const evidence = snapshot?.access === 'current' && snapshot.resources.evidence.status === 'ready'
    ? resolveEvidenceViewerItem(key?.role ?? 'customer', snapshot.resources.evidence.data, route.params?.evidenceId ?? '')
    : null;
  return <TaskScreenShell title="Xem ảnh" onBack={() => navigation.goBack()} contentStyle={{ flexGrow: 1 }}>
    {!evidence && <ReadOnlyNotice>Ảnh này không khả dụng trong phiên hiện tại. Có thể quyền đã thay đổi hoặc ảnh không thuộc danh sách được phép xem.</ReadOnlyNotice>}
    {evidence && <View style={{ flex: 1, minHeight: 300, justifyContent: 'center', backgroundColor: colors.text, borderRadius: 12, overflow: 'hidden' }}>
      <Image source={{ uri: evidence.mediaUrl }} resizeMode="contain" style={{ width: '100%', height: '100%', minHeight: 320 }} />
      <Text style={{ color: colors.surface, padding: spacing.md }}>{evidence.note || evidence.type}</Text>
    </View>}
  </TaskScreenShell>;
}
