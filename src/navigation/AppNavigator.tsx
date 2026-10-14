// src/navigation/AppNavigator.tsx
import React, { useEffect } from 'react';
import { Linking } from 'react-native';
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
import CustomerWalletScreen from '../features/order-flow/customer/CustomerWalletScreen';
import TechnicianOrderDetailScreen from '../screens/technician/TechnicianOrderDetailScreen';
import TechnicianKycScreen from '../screens/technician/TechnicianKycScreen';
import TechnicianOnboardingScreen from '../screens/technician/TechnicianOnboardingScreen';
import TechnicianWalletScreen from '../screens/technician/TechnicianWalletScreen';
import TechnicianReviewsScreen from '../screens/technician/TechnicianReviewsScreen';
import TechnicianScheduleScreen from '../screens/technician/TechnicianScheduleScreen';
import TechnicianServiceAreasScreen from '../screens/technician/TechnicianServiceAreasScreen';
import TechnicianEarningsScreen from '../screens/technician/TechnicianEarningsScreen';
import TechnicianNotificationsScreen from '../screens/technician/TechnicianNotificationsScreen';
import ChatListScreen from '../screens/chat/ChatListScreen';
import ChatThreadScreen from '../screens/chat/ChatThreadScreen';

import CustomerRoleChoiceScreen from '../screens/onboarding/CustomerRoleChoiceScreen';
import CustomerOnboardingScreen from '../screens/onboarding/CustomerOnboardingScreen';
import CustomerGuestHomeScreen from '../screens/guest/CustomerGuestHomeScreen';
import { appEntryRoute } from './app-entry';
import { flushAuthHandoff, rootNavigationRef } from './root-navigation';
import { handleWalletUrl, settleWalletQueue, type WalletReturnNav } from './customer-wallet-return';
import OrderFlowEntry from '../features/order-flow/navigation/OrderFlowEntry';

const Stack = createNativeStackNavigator<RootStackParamList>();

function readWalletNav(): WalletReturnNav {
  return {
    ready: rootNavigationRef.isReady(),
    hasWalletRoute: !!rootNavigationRef.getRootState()?.routeNames.includes('CustomerWallet'),
    navigate: name => { if (rootNavigationRef.isReady()) rootNavigationRef.navigate(name); },
  };
}

/**
 * Root-connected Customer wallet return. Cold getInitialURL and warm url
 * events land here even when the wallet screen is not mounted; only the
 * exact wallet path is accepted and only the safe Customer destination is
 * ever produced. Query flags are ignored; the screen spends the held URL
 * through the frozen GET-only hook. Google/Technician handling untouched.
 */
function CustomerWalletReturnGate() {
  const { isAuthenticated, user } = useAuthStore();
  const role = user?.role ?? null;
  useEffect(() => {
    let live = true;
    const session = () => {
      const state = useAuthStore.getState();
      return { authenticated: state.isAuthenticated, role: state.user?.role ?? null };
    };
    void Linking.getInitialURL().then(url => { if (live) handleWalletUrl(url, session(), readWalletNav()); });
    const subscription = Linking.addEventListener('url', event => { if (live) handleWalletUrl(event.url, session(), readWalletNav()); });
    return () => { live = false; subscription.remove(); };
  }, []);
  useEffect(() => {
    settleWalletQueue({ authenticated: isAuthenticated, role }, readWalletNav());
  }, [isAuthenticated, role]);
  return null;
}

export default function AppNavigator({ firstRunSeen = false }: { firstRunSeen?: boolean }) {
  const { isAuthenticated, user, sessionGeneration } = useAuthStore();

  return (
    <NavigationContainer ref={rootNavigationRef} onReady={flushAuthHandoff} onStateChange={flushAuthHandoff}>
      <CustomerWalletReturnGate />
      <Stack.Navigator key={isAuthenticated ? `${user?.role}:${user?.id}` : 'guest'} initialRouteName={appEntryRoute(isAuthenticated, user?.role ?? null, firstRunSeen, sessionGeneration)} screenOptions={{ headerShown: false }}>
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
            {__DEV__ && <Stack.Screen name="OrderFlowDevPreview" component={OrderFlowEntry} />}
            <Stack.Screen name="TechnicianKyc" component={TechnicianKycScreen} />
            <Stack.Screen name="TechnicianOnboarding" component={TechnicianOnboardingScreen} />
            <Stack.Screen name="TechnicianWallet" component={TechnicianWalletScreen} />
            <Stack.Screen name="TechnicianReviews" component={TechnicianReviewsScreen} />
            <Stack.Screen name="TechnicianSchedule" component={TechnicianScheduleScreen} />
            <Stack.Screen name="TechnicianServiceAreas" component={TechnicianServiceAreasScreen} />
            <Stack.Screen name="TechnicianEarnings" component={TechnicianEarningsScreen} />
            <Stack.Screen name="TechnicianNotifications" component={TechnicianNotificationsScreen} />
            <Stack.Screen name="ChatList" component={ChatListScreen} />
            <Stack.Screen name="ChatThread" component={ChatThreadScreen} />
            <Stack.Screen name="Auth" component={AuthNavigator} />
          </>
        ) : (
          <>
            {/* Public guest routes never mount account/order/AI screens. */}
            <Stack.Screen name="Auth" component={AuthNavigator} />
            <Stack.Screen name="CustomerRoleChoice" component={CustomerRoleChoiceScreen} />
            <Stack.Screen name="CustomerOnboarding" component={CustomerOnboardingScreen} />
            <Stack.Screen name="CustomerGuestHome" component={CustomerGuestHomeScreen} />
            <Stack.Screen name="CustomerServices" component={CustomerServicesScreen} />
            <Stack.Screen name="CustomerServiceDetail" component={CustomerServiceDetailScreen} />
            {isAuthenticated && user?.role === UserRole.CUSTOMER && <>
            <Stack.Screen name="CustomerMain" component={CustomerNavigator} />
            <Stack.Screen name="TechnicianMain" component={TechnicianNavigator} />
            {/* Đăng ký/đăng nhập reset về màn này ngay sau setAuth, lúc nhánh vẫn là chưa đăng nhập. */}
            <Stack.Screen name="TechnicianOnboarding" component={TechnicianOnboardingScreen} />
            <Stack.Screen name="CustomerAIDiagnosis" component={CustomerAIDiagnosisScreen} />
            <Stack.Screen name="CustomerBookingCreate" component={CustomerBookingCreateScreen} />
            <Stack.Screen name="CustomerAIChat" component={CustomerAIChatScreen} />
            <Stack.Screen name="CustomerMatching" component={CustomerMatchingScreen} />
            <Stack.Screen name="CustomerBookingDetail" component={CustomerBookingDetailScreen} />
            <Stack.Screen name="CustomerOrderDetail" component={CustomerOrderDetailScreen} />
            <Stack.Screen name="CustomerRepairHistory" component={CustomerRepairHistoryScreen} />
            <Stack.Screen name="CustomerWarranties" component={CustomerWarrantiesScreen} />
            <Stack.Screen name="CustomerSecurity" component={CustomerSecurityScreen} />
            <Stack.Screen name="CustomerWallet" component={CustomerWalletScreen} />
            <Stack.Screen name="TechnicianOrderDetail" component={TechnicianOrderDetailScreen} />
            {__DEV__ && <Stack.Screen name="OrderFlowDevPreview" component={OrderFlowEntry} />}
            <Stack.Screen name="ChatList" component={ChatListScreen} />
            <Stack.Screen name="ChatThread" component={ChatThreadScreen} />
            </>}
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
