import React from 'react';
import { TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAppTheme } from '../constants/theme';
import { useAuthStore } from '../store';

/** One back control for every header: 44pt target, arrow-back 24. */
function BackIcon({ onPress, label = 'Quay lại' }: { onPress: () => void; label?: string }) {
  const { colors } = useAppTheme();
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
      style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
    >
      <Ionicons name="arrow-back" size={24} color={colors.text} />
    </TouchableOpacity>
  );
}

/** Goes back, or to the user's home when nothing is below (deep link, reset). */
function HistoryBackButton() {
  const navigation = useNavigation<any>();
  const goBack = () => {
    if (navigation.canGoBack?.() !== false) return navigation.goBack();
    const role = useAuthStore.getState().user?.role;
    navigation.navigate(role === 'technician' ? 'TechnicianMain' : role === 'customer' ? 'CustomerMain' : 'CustomerGuestHome');
  };
  return <BackIcon onPress={goBack} />;
}

export default function BackButton({ onPress, label }: { onPress?: () => void; label?: string }) {
  return onPress ? <BackIcon onPress={onPress} label={label} /> : <HistoryBackButton />;
}

// Lazy: root-navigation builds a container ref at import, which screen tests that mock @react-navigation/native lack.
export const goHome = () => { void import('../navigation/root-navigation').then((m) => m.goHome()); };

/** Header shortcut that skips every screen in between. */
export function HomeButton() {
  const { colors } = useAppTheme();
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel="Về trang chủ"
      onPress={goHome}
      style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
    >
      <Ionicons name="home-outline" size={22} color={colors.text} />
    </TouchableOpacity>
  );
}
