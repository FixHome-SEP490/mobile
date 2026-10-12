// App.tsx - FixHome Mobile Entry Point
import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { MenuProvider } from 'react-native-popup-menu';
import AppNavigator from './src/navigation/AppNavigator';
import BootstrapSplash from './src/components/BootstrapSplash';
import { hasSeenCustomerFirstRun } from './src/services/customer-first-run';
import { storageService } from './src/services/storage.service';
import { authApi } from './src/api/auth.api';
import { useAuthStore } from './src/store/auth.store';

export default function App() {
  const isLoading = useAuthStore(state => state.isLoading);
  const [firstRunSeen, setFirstRunSeen] = useState<boolean | null>(null);
  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const seen = await hasSeenCustomerFirstRun();
        if (mounted) setFirstRunSeen(seen);
        const token = await storageService.getToken();
        if (token) {
          const user = await authApi.getProfile();
          const currentToken = await storageService.getToken();
          if (mounted && currentToken) useAuthStore.getState().setAuth(currentToken, user);
        }
      } catch {
        // Protected screens remain unavailable until profile validation succeeds.
        if (mounted) useAuthStore.getState().logout();
      } finally {
        if (mounted) useAuthStore.getState().setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);
  if (isLoading || firstRunSeen === null) return <BootstrapSplash />;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <BottomSheetModalProvider>
        <MenuProvider>
          <StatusBar style="auto" />
          <AppNavigator firstRunSeen={firstRunSeen} />
        </MenuProvider>
      </BottomSheetModalProvider>
    </GestureHandlerRootView>
  );
}
