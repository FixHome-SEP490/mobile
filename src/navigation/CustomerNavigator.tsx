// src/navigation/CustomerNavigator.tsx
import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import type { CustomerTabParamList } from '../types';
import { colors } from '../constants';
import CustomerHomeScreen from '../screens/customer/CustomerHomeScreen';
import CustomerBookingsScreen from '../screens/customer/CustomerBookingsScreen';
import CustomerNotificationsScreen from '../screens/customer/CustomerNotificationsScreen';
import CustomerProfileScreen from '../screens/customer/CustomerProfileScreen';

const Tab = createBottomTabNavigator<CustomerTabParamList>();



export default function CustomerNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: '#94A3B8',
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: '#F1F5F9',
          borderTopWidth: 1,
          elevation: 8,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -3 },
          shadowOpacity: 0.06,
          shadowRadius: 6,
          height: 62,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap = 'home';

          if (route.name === 'Home') {
            iconName = focused ? 'home' : 'home-outline';
          } else if (route.name === 'Bookings') {
            iconName = focused ? 'calendar' : 'calendar-outline';
          } else if (route.name === 'Notifications') {
            iconName = focused ? 'notifications' : 'notifications-outline';
          } else if (route.name === 'Profile') {
            iconName = focused ? 'person' : 'person-outline';
          }

          return (
            <View style={focused ? styles.activeTabIconWrapper : undefined}>
              <Ionicons name={iconName} size={size} color={color} />
            </View>
          );
        },
      })}
    >
      <Tab.Screen
        name="Home"
        component={CustomerHomeScreen}
        options={{
          title: 'Trang chủ',
          headerShown: false,
        }}
      />
      <Tab.Screen
        name="Bookings"
        component={CustomerBookingsScreen}
        options={{
          title: 'Đơn của tôi',
          headerTitle: 'Lịch sử & Hoạt động',
        }}
      />
      <Tab.Screen
        name="Notifications"
        component={CustomerNotificationsScreen}
        options={{
          title: 'Thông báo',
          headerTitle: 'Thông báo & Ưu đãi',
          tabBarBadge: 1,
          tabBarBadgeStyle: {
            backgroundColor: '#EF4444',
            fontSize: 10,
            fontWeight: 'bold',
          },
        }}
      />
      <Tab.Screen
        name="Profile"
        component={CustomerProfileScreen}
        options={{
          title: 'Tài khoản',
          headerTitle: 'Hồ sơ cá nhân',
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({

  activeTabIconWrapper: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 12,
    paddingVertical: 2,
    borderRadius: 12,
  },
});
