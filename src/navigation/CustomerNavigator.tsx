// src/navigation/CustomerNavigator.tsx
import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Home, Clock4, Bell, User } from 'lucide-react-native';
import type { CustomerTabParamList } from '../types';
import CustomerHomeScreen from '../screens/customer/CustomerHomeScreen';
import CustomerBookingsScreen from '../screens/customer/CustomerBookingsScreen';
import CustomerNotificationsScreen from '../screens/customer/CustomerNotificationsScreen';
import CustomerProfileScreen from '../screens/customer/CustomerProfileScreen';
import { GlassTabBar } from '../components/navigation/GlassTabBar';
import { useAuthStore } from '../store';
import { Image } from 'react-native';
import { notificationsApi } from '../api/notifications.api';
import { useFocusEffect } from '@react-navigation/native';

const Tab = createBottomTabNavigator<CustomerTabParamList>();

export default function CustomerNavigator() {
  const user = useAuthStore((state) => state.user);
  const [unreadCount, setUnreadCount] = React.useState(0);

  useFocusEffect(
    React.useCallback(() => {
      let mounted = true;
      notificationsApi.getCountUnread().then((count) => {
        if (mounted) setUnreadCount(count);
      }).catch(() => {});
      return () => { mounted = false; };
    }, [])
  );

  return (
    <Tab.Navigator
      tabBar={(props) => <GlassTabBar {...props} />}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused, color, size }) => {
          if (route.name === 'Home') {
            return <Home size={size} color={color} strokeWidth={focused ? 2.5 : 2} />;
          } else if (route.name === 'Bookings') {
            return <Clock4 size={size} color={color} strokeWidth={focused ? 2.5 : 2} />;
          } else if (route.name === 'Notifications') {
            return <Bell size={size} color={color} strokeWidth={focused ? 2.5 : 2} />;
          } else if (route.name === 'Profile') {
            if (user?.avatarUrl) {
              return <Image source={{ uri: user.avatarUrl }} style={{ width: size + 5, height: size + 5, borderRadius: (size + 5) / 2, borderColor: '#FFFFFF' }} />;
            }
            return <User size={size} color={color} strokeWidth={focused ? 2.5 : 2} />;
          }
          return null;
        },
      })}
    >
      <Tab.Screen
        name="Home"
        component={CustomerHomeScreen}
        options={{
          title: 'Trang chủ',
        }}
      />
      <Tab.Screen
        name="Bookings"
        component={CustomerBookingsScreen}
        options={{
          title: 'Đơn của tôi',
          headerShown: false,
          headerTitle: 'Lịch sử & Hoạt động',
        }}
      />
      <Tab.Screen
        name="Notifications"
        component={CustomerNotificationsScreen}
        options={{
          title: 'Thông báo',
          headerShown: false,
          headerTitle: 'Thông báo & Ưu đãi',
          tabBarBadge: unreadCount,
        }}
      />
      <Tab.Screen
        name="Profile"
        component={CustomerProfileScreen}
        options={{
          title: 'Tài khoản',
          headerShown: false,
          headerTitle: 'Hồ sơ cá nhân',
        }}
      />
    </Tab.Navigator>
  );
}
