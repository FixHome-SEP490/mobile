import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuthStore } from '../../../store/auth.store';
import type { RootStackParamList } from '../../../types';
import { orderFlowPreviewRoute } from './order-flow-preview-policy';

export default function OrderFlowDevPreviewAction({ serviceOrderId }: { serviceOrderId: string }) {
  const role = useAuthStore(state => state.user?.role);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = orderFlowPreviewRoute(__DEV__, role, serviceOrderId);
  if (!route) return null;
  return <TouchableOpacity accessibilityRole="button" accessibilityLabel="Mở bản xem trước luồng đơn mới" onPress={() => navigation.navigate(route.name, route.params)}
    style={{ minHeight: 48, paddingHorizontal: 14, borderWidth: 1, borderColor: '#2563EB', borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}>
    <Text style={{ color: '#2563EB', fontWeight: '700', textAlign: 'center' }}>Xem trước luồng đơn mới</Text>
  </TouchableOpacity>;
}
