import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { OrderSessionProvider } from '../runtime/OrderSessionProvider';
import { useAuthStore } from '../../../store/auth.store';
import OrderFlowNavigator from './OrderFlowNavigator';
import type { RootStackParamList } from '../../../types';

type DetailRouteName = 'CustomerOrderDetail' | 'TechnicianOrderDetail';

/** Production order detail: the reader role is the route's role and must equal the signed-in role; the server still owns access. */
export function orderDetailSession(routeRole: 'customer' | 'technician', authenticated: boolean, authRole: string | null | undefined, serviceOrderId: unknown) {
  const id = typeof serviceOrderId === 'string' ? serviceOrderId.trim() : '';
  return authenticated && authRole === routeRole && id ? { role: routeRole, serviceOrderId: id } : null;
}

function createOrderDetailEntry<N extends DetailRouteName>(routeRole: 'customer' | 'technician') {
  return function OrderDetailEntry() {
    const route = useRoute<RouteProp<RootStackParamList, N>>();
    const navigation = useNavigation();
    const { isAuthenticated, user } = useAuthStore();
    const session = orderDetailSession(routeRole, isAuthenticated, user?.role, route.params?.serviceOrderId);
    if (!session) {
      return <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#F8FAFC' }}>
        <Text accessibilityRole="header" style={{ fontSize: 20, fontWeight: '700', color: '#0F172A' }}>Không thể mở đơn</Text>
        <Text style={{ marginTop: 8, color: '#475569', lineHeight: 22 }}>Phiên đăng nhập hoặc quyền xem đơn chưa hợp lệ.</Text>
        <TouchableOpacity accessibilityRole="button" onPress={() => navigation.goBack()} style={{ marginTop: 16, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#2563EB', fontWeight: '700' }}>Quay lại</Text>
        </TouchableOpacity>
      </SafeAreaView>;
    }
    return <OrderSessionProvider key={session.serviceOrderId} serviceOrderId={session.serviceOrderId}><OrderFlowNavigator role={session.role} /></OrderSessionProvider>;
  };
}

export const CustomerOrderDetailEntry = createOrderDetailEntry<'CustomerOrderDetail'>('customer');
export const TechnicianOrderDetailEntry = createOrderDetailEntry<'TechnicianOrderDetail'>('technician');
