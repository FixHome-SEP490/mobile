// src/navigation/TechnicianNavigator.tsx
import React from 'react';
import { Text, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { TechnicianTabParamList } from '../types';
import { colors } from '../constants';
import TechnicianHomeScreen from '../screens/technician/TechnicianHomeScreen';

const Tab = createBottomTabNavigator<TechnicianTabParamList>();

// TODO: Create proper screens for other tabs

function PlaceholderScreen() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ color: '#64748B' }}>Coming soon</Text>
    </View>
  );
}

export default function TechnicianNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.secondary,
        headerShown: true,
      }}
    >
      <Tab.Screen
        name="Home"
        component={TechnicianHomeScreen}
        options={{ title: 'Dashboard' }}
      />
      <Tab.Screen
        name="Jobs"
        component={PlaceholderScreen}
        options={{ title: 'Jobs' }}
      />
      <Tab.Screen
        name="Notifications"
        component={PlaceholderScreen}
        options={{ title: 'Notifications' }}
      />
      <Tab.Screen
        name="Profile"
        component={PlaceholderScreen}
        options={{ title: 'Profile' }}
      />
    </Tab.Navigator>
  );
}
