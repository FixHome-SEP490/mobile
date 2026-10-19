// src/navigation/TechnicianNavigator.tsx
import React from 'react';
import { useTechnicianLocationPing } from '../hooks/useTechnicianLocationPing';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Home, MailOpen, Briefcase, Wallet, User } from 'lucide-react-native';
import type { TechnicianTabParamList } from '../types';
import TechnicianHomeScreen from '../screens/technician/TechnicianHomeScreen';
import TechnicianInvitationsScreen from '../screens/technician/TechnicianInvitationsScreen';
import TechnicianJobsScreen from '../screens/technician/TechnicianJobsScreen';
import TechnicianWalletScreen from '../screens/technician/TechnicianWalletScreen';
import TechnicianProfileScreen from '../screens/technician/TechnicianProfileScreen';
import { GlassTabBar } from '../components/navigation/GlassTabBar';
import { AvatarTabIcon } from '../components/navigation/AvatarTabIcon';
import { useAuthStore } from '../store';
import { useBadgeStore } from '../store/badge.store';
import { useInvitationCount } from '../hooks/useInvitationCount';
import { useAppTheme } from '../constants/theme';
import { notificationsApi } from '../api/notifications.api';
import { useFocusEffect } from '@react-navigation/native';
import { useLiveRefresh } from '../hooks/useLiveRefresh';

const Tab = createBottomTabNavigator<TechnicianTabParamList>();

export default function TechnicianNavigator() {
  const user = useAuthStore((state) => state.user);
  useTechnicianLocationPing(!!user);
  const { colors } = useAppTheme();
  const setUnreadCount = useBadgeStore((state) => state.setUnreadNotifications);
  const invitationCount = useInvitationCount();

  useFocusEffect(
    React.useCallback(() => {
      let mounted = true;
      notificationsApi.getCountUnread().then((count) => {
        if (mounted) setUnreadCount(count);
      }).catch(() => {});
      return () => { mounted = false; };
    }, [setUnreadCount])
  );

  // PO 18/10/2026: the unread count on the tab follows `notification:new` instead of waiting for a refocus.
  useLiveRefresh(['notification:new'], () => {
    notificationsApi.getCountUnread().then(setUnreadCount).catch(() => {});
  }, undefined, { pollMs: 60_000 });

  return (
    <Tab.Navigator
      tabBar={(props) => <GlassTabBar {...props} showAssistant={false} technicianResponsive />}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused, color, size }) => {
          if (route.name === 'Home') {
            return <Home size={size} color={color} strokeWidth={focused ? 2.5 : 2} />;
          } else if (route.name === 'Invitations') {
            return <MailOpen size={size} color={color} strokeWidth={focused ? 2.5 : 2} />;
          } else if (route.name === 'Jobs') {
            return <Briefcase size={size} color={color} strokeWidth={focused ? 2.5 : 2} />;
          } else if (route.name === 'Wallet') {
            return <Wallet size={size} color={color} strokeWidth={focused ? 2.5 : 2} />;
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
        component={TechnicianHomeScreen}
        options={{ 
          title: 'Trang chủ',
          headerShown: false,
         }}
      />
      <Tab.Screen
        name="Invitations"
        component={TechnicianInvitationsScreen}
        options={{
          title: 'Lời mời',
          headerShown: false,
          tabBarBadge: invitationCount,
          // warning.text, not .fg: white badge digits need >= 4.5:1
          tabBarBadgeStyle: { backgroundColor: colors.tone.warning.text },
          tabBarAccessibilityLabel: invitationCount > 0 ? `Lời mời, ${invitationCount} chờ xác nhận` : 'Lời mời',
        }}
      />
      <Tab.Screen
        name="Jobs"
        component={TechnicianJobsScreen}
        options={{ 
          title: 'Công việc',
          headerShown: false,
         }}
      />
      <Tab.Screen
        name="Wallet"
        component={TechnicianWalletScreen}
        options={{ 
          title: 'Ví',
          headerShown: false,
          tabBarAccessibilityLabel: 'Ví',
         }}
      />
      <Tab.Screen
        name="Profile"
        component={TechnicianProfileScreen}
        options={{ title: 'Hồ sơ' }}
      />
    </Tab.Navigator>
  );
}
