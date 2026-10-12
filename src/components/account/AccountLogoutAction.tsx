import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LogOut } from 'lucide-react-native';
import { useAppTheme } from '../../constants/theme';

export default function AccountLogoutAction({ onPress, disabled = false, busy = false, error, accessibilityLabel = 'Đăng xuất' }: {
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  error?: string;
  accessibilityLabel?: string;
}) {
  const { colors } = useAppTheme();
  return <View style={styles.container}>
    {!!error && <Text accessibilityRole="alert" style={[styles.error, { color: colors.error }]}>{error}</Text>}
    <TouchableOpacity onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled, busy }} style={[styles.button, { borderColor: colors.error, backgroundColor: colors.surface }, disabled && styles.disabled]}>
      <LogOut size={20} color={colors.error} strokeWidth={1.75} />
      <Text style={[styles.label, { color: colors.error }]}>{busy ? 'Đang đăng xuất…' : 'Đăng xuất'}</Text>
    </TouchableOpacity>
  </View>;
}

const styles = StyleSheet.create({
  container: { width: '100%', marginTop: 12, gap: 8 },
  button: { width: '100%', minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12, borderRadius: 14, borderWidth: 1 },
  label: { fontSize: 16, lineHeight: 24, fontWeight: '600' },
  error: { fontSize: 14, lineHeight: 20 },
  disabled: { opacity: 0.5 },
});
