import React from 'react';
import { Text } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { OrderSessionProvider } from '../runtime/OrderSessionProvider';
import { useAuthStore } from '../../../store/auth.store';
import { orderFlowPreviewRoute } from './order-flow-preview-policy';
import OrderFlowNavigator from './OrderFlowNavigator';
import type { RootStackParamList } from '../../../types';
import type { RouteProp } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function OrderFlowEntry() {
  const route = useRoute<RouteProp<RootStackParamList, 'OrderFlowDevPreview'>>();
  const { isAuthenticated, user } = useAuthStore();
  const allowed = orderFlowPreviewRoute(__DEV__, isAuthenticated ? user?.role : null, route.params.serviceOrderId);
  if (!allowed || !isAuthenticated || !user || (user.role !== 'customer' && user.role !== 'technician')) {
    return <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#F8FAFC' }}>
      <Text accessibilityRole="header" style={{ fontSize: 20, fontWeight: '700', color: '#0F172A' }}>Không thể mở bản xem trước</Text>
      <Text style={{ marginTop: 8, color: '#475569', lineHeight: 22 }}>Phiên đăng nhập hoặc quyền xem đơn chưa hợp lệ.</Text>
    </SafeAreaView>;
  }
  return <OrderSessionProvider serviceOrderId={route.params.serviceOrderId}><OrderFlowNavigator role={user.role} /></OrderSessionProvider>;
}
