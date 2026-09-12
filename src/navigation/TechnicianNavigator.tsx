// src/navigation/TechnicianNavigator.tsx
import React from 'react';
import { Text, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { TechnicianTabParamList } from '../types';
import { colors } from '../constants';
import TechnicianHomeScreen from '../screens/technician/TechnicianHomeScreen';
import TechnicianJobsScreen from '../screens/technician/TechnicianJobsScreen';
import TechnicianNotificationsScreen from '../screens/technician/TechnicianNotificationsScreen';
import TechnicianProfileScreen from '../screens/technician/TechnicianProfileScreen';

const Tab = createBottomTabNavigator<TechnicianTabParamList>();



export default function TechnicianNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.secondary,
        headerShown: false,
      }}
    >
      <Tab.Screen
        name="Home"
        component={TechnicianHomeScreen}
        options={{ title: 'Dashboard' }}
      />
      <Tab.Screen
        name="Jobs"
        component={TechnicianJobsScreen}
        options={{ title: 'Jobs' }}
      />
      <Tab.Screen
        name="Notifications"
        component={TechnicianNotificationsScreen}
        options={{ title: 'Notifications' }}
      />
      <Tab.Screen
        name="Profile"
        component={TechnicianProfileScreen}
        options={{ title: 'Profile' }}
      />
    </Tab.Navigator>
  );
}
