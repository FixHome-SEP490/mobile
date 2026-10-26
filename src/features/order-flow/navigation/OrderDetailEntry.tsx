import React, { useCallback, useState } from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaView } from 'react-native-safe-area-context';
import { OrderSessionProvider } from '../runtime/OrderSessionProvider';
import { useAuthStore } from '../../../store/auth.store';
import OrderFlowNavigator from './OrderFlowNavigator';
import type { RootStackParamList } from '../../../types';
import { lightTheme } from '../../../constants/theme';
import { VisitDevicesContext, visitDeviceTabName } from './visit-device-tabs';

const DeviceTabs = createBottomTabNavigator();
type DeviceTabParams = Record<string, { serviceOrderId: string } | undefined>;

// Module-level on purpose (a render callback would be a new component on every render and remount the order).
const createDeviceScreen = (role: 'customer' | 'technician') => function DeviceScreen() {
  const serviceOrderId = useRoute<RouteProp<DeviceTabParams, string>>().params?.serviceOrderId ?? '';
  return <OrderSessionProvider serviceOrderId={serviceOrderId}><OrderFlowNavigator role={role} /></OrderSessionProvider>;
};
const DEVICE_SCREEN = { customer: createDeviceScreen('customer'), technician: createDeviceScreen('technician') };

/**
 * The order screen. Every device of a visit is its own order and its own tab: a switch only shows another tab,
 * so the order left behind keeps its session, photos and drafts, and nothing reloads. A single order is one tab and looks as before.
 */
function OrderDeviceTabs({ role, firstId }: { role: 'customer' | 'technician'; firstId: string }) {
  const [others, setOthers] = useState<string[]>([]);
  // Only ever adds: a panel that has not read its visit yet reports no devices, which must not take a tab (and the focus) away.
  const register = useCallback((ids: string[]) => {
    setOthers((current) => {
      const added = ids.filter((id) => id && id !== firstId && !current.includes(id));
      return added.length ? [...current, ...added] : current;
    });
  }, [firstId]);
  return (
    <VisitDevicesContext.Provider value={register}>
      <DeviceTabs.Navigator
        initialRouteName={visitDeviceTabName(firstId)}
        backBehavior="none"
        tabBar={() => null}
        screenOptions={{ headerShown: false, lazy: true, animation: 'fade', sceneStyle: { backgroundColor: lightTheme.background } }}
      >
        {[firstId, ...others].map((id) => (
          <DeviceTabs.Screen key={id} name={visitDeviceTabName(id)} component={DEVICE_SCREEN[role]} initialParams={{ serviceOrderId: id }} />
        ))}
      </DeviceTabs.Navigator>
    </VisitDevicesContext.Provider>
  );
}

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
    return <OrderDeviceTabs key={session.serviceOrderId} role={session.role} firstId={session.serviceOrderId} />;
  };
}

export const CustomerOrderDetailEntry = createOrderDetailEntry<'CustomerOrderDetail'>('customer');
export const TechnicianOrderDetailEntry = createOrderDetailEntry<'TechnicianOrderDetail'>('technician');
