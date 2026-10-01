// src/navigation/AppNavigator.tsx
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';
import { useAuthStore } from '../store';
import AuthNavigator from './AuthNavigator';
import CustomerNavigator from './CustomerNavigator';
import TechnicianNavigator from './TechnicianNavigator';
import { UserRole } from '../types';
import CustomerServicesScreen from '../screens/customer/CustomerServicesScreen';
import CustomerServiceDetailScreen from '../screens/customer/CustomerServiceDetailScreen';
import CustomerAIDiagnosisScreen from '../screens/customer/CustomerAIDiagnosisScreen';
import CustomerBookingCreateScreen from '../screens/customer/CustomerBookingCreateScreen';
import CustomerAIChatScreen from '../screens/customer/CustomerAIChatScreen';
import CustomerMatchingScreen from '../screens/customer/CustomerMatchingScreen';
import CustomerBookingDetailScreen from '../screens/customer/CustomerBookingDetailScreen';
import CustomerOrderDetailScreen from '../screens/customer/CustomerOrderDetailScreen';
import CustomerRepairHistoryScreen from '../screens/customer/CustomerRepairHistoryScreen';
import CustomerWarrantiesScreen from '../screens/customer/CustomerWarrantiesScreen';
import CustomerSecurityScreen from '../screens/customer/CustomerSecurityScreen';
import TechnicianOrderDetailScreen from '../screens/technician/TechnicianOrderDetailScreen';
import TechnicianKycScreen from '../screens/technician/TechnicianKycScreen';
import TechnicianOnboardingScreen from '../screens/technician/TechnicianOnboardingScreen';
import TechnicianWalletScreen from '../screens/technician/TechnicianWalletScreen';
import TechnicianReviewsScreen from '../screens/technician/TechnicianReviewsScreen';
import TechnicianScheduleScreen from '../screens/technician/TechnicianScheduleScreen';
import TechnicianEarningsScreen from '../screens/technician/TechnicianEarningsScreen';
import ChatListScreen from '../screens/chat/ChatListScreen';
import ChatThreadScreen from '../screens/chat/ChatThreadScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  const { isAuthenticated, user } = useAuthStore();

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {isAuthenticated && user?.role === UserRole.TECHNICIAN ? (
          <>
            <Stack.Screen name="TechnicianMain" component={TechnicianNavigator} />
            <Stack.Screen name="CustomerMain" component={CustomerNavigator} />
            <Stack.Screen name="CustomerServices" component={CustomerServicesScreen} />
            <Stack.Screen name="CustomerServiceDetail" component={CustomerServiceDetailScreen} />
            <Stack.Screen name="CustomerAIDiagnosis" component={CustomerAIDiagnosisScreen} />
            <Stack.Screen name="CustomerBookingCreate" component={CustomerBookingCreateScreen} />
            <Stack.Screen name="CustomerAIChat" component={CustomerAIChatScreen} />
            <Stack.Screen name="CustomerMatching" component={CustomerMatchingScreen} />
            <Stack.Screen name="CustomerBookingDetail" component={CustomerBookingDetailScreen} />
            <Stack.Screen name="CustomerOrderDetail" component={CustomerOrderDetailScreen} />
            <Stack.Screen name="CustomerRepairHistory" component={CustomerRepairHistoryScreen} />
            <Stack.Screen name="CustomerWarranties" component={CustomerWarrantiesScreen} />
            <Stack.Screen name="CustomerSecurity" component={CustomerSecurityScreen} />
            <Stack.Screen name="TechnicianOrderDetail" component={TechnicianOrderDetailScreen} />
            <Stack.Screen name="TechnicianKyc" component={TechnicianKycScreen} />
            <Stack.Screen name="TechnicianOnboarding" component={TechnicianOnboardingScreen} />
            <Stack.Screen name="TechnicianWallet" component={TechnicianWalletScreen} />
            <Stack.Screen name="TechnicianReviews" component={TechnicianReviewsScreen} />
            <Stack.Screen name="TechnicianSchedule" component={TechnicianScheduleScreen} />
            <Stack.Screen name="TechnicianEarnings" component={TechnicianEarningsScreen} />
            <Stack.Screen name="ChatList" component={ChatListScreen} />
            <Stack.Screen name="ChatThread" component={ChatThreadScreen} />
            <Stack.Screen name="Auth" component={AuthNavigator} />
          </>
        ) : (
          <>
            {/* Khi vừa mở app: Vào ngay Trang chủ Khách hàng (theo chuẩn Vua Thợ / Xanh SM) */}
            <Stack.Screen name="Auth" component={AuthNavigator} />
            <Stack.Screen name="CustomerMain" component={CustomerNavigator} />
            <Stack.Screen name="TechnicianMain" component={TechnicianNavigator} />
            {/* Đăng ký/đăng nhập reset về màn này ngay sau setAuth, lúc nhánh vẫn là chưa đăng nhập. */}
            <Stack.Screen name="TechnicianOnboarding" component={TechnicianOnboardingScreen} />
            <Stack.Screen name="CustomerServices" component={CustomerServicesScreen} />
            <Stack.Screen name="CustomerServiceDetail" component={CustomerServiceDetailScreen} />
            <Stack.Screen name="CustomerAIDiagnosis" component={CustomerAIDiagnosisScreen} />
            <Stack.Screen name="CustomerBookingCreate" component={CustomerBookingCreateScreen} />
            <Stack.Screen name="CustomerAIChat" component={CustomerAIChatScreen} />
            <Stack.Screen name="CustomerMatching" component={CustomerMatchingScreen} />
            <Stack.Screen name="CustomerBookingDetail" component={CustomerBookingDetailScreen} />
            <Stack.Screen name="CustomerOrderDetail" component={CustomerOrderDetailScreen} />
            <Stack.Screen name="CustomerRepairHistory" component={CustomerRepairHistoryScreen} />
            <Stack.Screen name="CustomerWarranties" component={CustomerWarrantiesScreen} />
            <Stack.Screen name="CustomerSecurity" component={CustomerSecurityScreen} />
            <Stack.Screen name="TechnicianOrderDetail" component={TechnicianOrderDetailScreen} />
            <Stack.Screen name="ChatList" component={ChatListScreen} />
            <Stack.Screen name="ChatThread" component={ChatThreadScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
