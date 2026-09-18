// App.tsx - FixHome Mobile Entry Point
import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { MenuProvider } from 'react-native-popup-menu';
import AppNavigator from './src/navigation/AppNavigator';
import { ActivityIndicator, View } from 'react-native';
import { storageService } from './src/services/storage.service';
import { authApi } from './src/api/auth.api';
import { useAuthStore } from './src/store/auth.store';

export default function App() {
  const isLoading = useAuthStore(state => state.isLoading);
  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
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
  if (isLoading) return <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator /></View>;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <BottomSheetModalProvider>
        <MenuProvider>
          <StatusBar style="auto" />
          <AppNavigator />
        </MenuProvider>
      </BottomSheetModalProvider>
    </GestureHandlerRootView>
  );
}
