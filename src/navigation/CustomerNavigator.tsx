// src/navigation/CustomerNavigator.tsx
import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Home, Clock4, Bell, User } from 'lucide-react-native';
import type { CustomerTabParamList } from '../types';
import CustomerHomeScreen from '../screens/customer/CustomerHomeScreen';
import CustomerBookingsScreen from '../screens/customer/CustomerBookingsScreen';
import CustomerNotificationsScreen from '../screens/customer/CustomerNotificationsScreen';
import CustomerProfileScreen from '../screens/customer/CustomerProfileScreen';
import CustomerAnimatedBottomBar from '../components/navigation/CustomerAnimatedBottomBar';
import { AvatarTabIcon } from '../components/navigation/AvatarTabIcon';
import { useAuthStore } from '../store';
import { useBadgeStore } from '../store/badge.store';
import { useLiveRefresh } from '../hooks/useLiveRefresh';
import { notificationsApi } from '../api/notifications.api';
import { useFocusEffect } from '@react-navigation/native';

const Tab = createBottomTabNavigator<CustomerTabParamList>();

export default function CustomerNavigator() {
  const user = useAuthStore((state) => state.user);
  const unreadCount = useBadgeStore((state) => state.unreadNotifications);
  const setUnreadCount = useBadgeStore((state) => state.setUnreadNotifications);

  useFocusEffect(
    React.useCallback(() => {
      let mounted = true;
      notificationsApi.getCountUnread().then((count) => {
        if (mounted) setUnreadCount(count);
      }).catch(() => {});
      return () => { mounted = false; };
    }, [setUnreadCount])
  );

  // Same as the technician tab: the badge follows `notification:new` instead of waiting for a refocus.
  useLiveRefresh(['notification:new'], () => {
    notificationsApi.getCountUnread().then(setUnreadCount).catch(() => {});
  }, undefined, { pollMs: 60_000 });

  return (
    <Tab.Navigator
      tabBar={(props) => <CustomerAnimatedBottomBar {...props} mode="authenticated" />}
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
              return <AvatarTabIcon uri={user.avatarUrl} size={size} color={color} focused={focused} />;
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
          tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
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
