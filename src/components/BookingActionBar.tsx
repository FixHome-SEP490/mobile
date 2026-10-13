import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { useAppTheme } from '../constants/theme';

// Place inside the screen's bottom SafeAreaView, outside its ScrollView.
export default function BookingActionBar({ children }: { children: ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <KeyboardAvoidingView
      testID="booking-sticky-actions"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      enabled={Platform.OS !== 'web'}
      style={[styles.bar, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      {children}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  bar: { flexShrink: 0, paddingHorizontal: 16, paddingVertical: 12, gap: 8, borderTopWidth: 1 },
});
