import { useAppTheme } from '../../constants/theme';
// src/screens/auth/ForgotPasswordScreen.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../../types';
import { authApi } from '../../api/auth.api';
import { extractApiErrorMessage } from '../../utils/input-validation';

export default function ForgotPasswordScreen() {
  const { colors, spacing, fontSize } = useAppTheme();
  const styles = getStyles(colors, spacing, fontSize);
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (loading) return;
    setError(null);
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setError('Vui lòng nhập email hợp lệ.');
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    try {
      await authApi.forgotPassword(trimmedEmail);
      navigation.navigate('ResetPassword', { email: trimmedEmail });
    } catch (err: unknown) {
      setError(extractApiErrorMessage(err, 'Không thể gửi mã OTP. Vui lòng thử lại.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.brandBar}><TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Quay lại"
            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
          >
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity><View style={styles.brandRow}><Image source={require('../../../assets/icon.png')} style={styles.brandLogo} /><Text style={styles.brandText}>Fix<Text style={styles.accent}>Home</Text></Text></View></View>

          <View style={styles.header}>
            <View style={styles.iconWrapper}>
              <Ionicons name="lock-closed" size={32} color={colors.primaryStrong} />
            </View>
            <Text style={styles.title}>Quên mật khẩu</Text><Text style={styles.heroTitle} accessibilityRole="header">Một bước để{'\n'}<Text style={styles.accent}>quay lại FixHome.</Text></Text>
            <Text style={styles.subtitle}>Nhận mã xác minh qua email đã đăng ký.</Text>
          </View>
          <Text style={styles.helperText}>Nhập email đã đăng ký, chúng tôi sẽ gửi mã OTP để đặt lại mật khẩu.</Text>

          <View style={styles.formContainer}>
            {error && (
              <View style={styles.errorBox} accessibilityRole="alert" accessibilityLiveRegion="polite">
                <Ionicons name="alert-circle" size={16} color={colors.error} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Email *</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="mail-outline" size={18} color={colors.textSecondary} style={styles.inputIcon} />
                <TextInput
                  accessibilityLabel="Email"
                  editable={!(loading)}
                  autoCorrect={false}
                  autoComplete="email"
                  style={styles.input}
                  placeholder="email@example.com"
                  placeholderTextColor={colors.muted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={email}
                  onChangeText={setEmail}
                />
              </View>
            </View>

            <TouchableOpacity
              style={[styles.submitBtn, loading && { opacity: 0.7 }]}
              onPress={handleSubmit}
              activeOpacity={0.85}
              accessibilityRole="button" accessibilityLabel="Gửi mã OTP" accessibilityState={{ disabled: loading, busy: loading }}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={colors.surface} size="small" />
              ) : (
                <><Text style={styles.submitBtnText}>Gửi mã OTP</Text><Ionicons name="arrow-forward" size={20} color={colors.surface} /></>
              )}
            </TouchableOpacity>

            <View style={styles.loginRow}>
              <Text style={styles.loginText}>Đã nhớ mật khẩu? </Text>
              <TouchableOpacity style={styles.linkButton} accessibilityRole="button" accessibilityLabel="Đăng nhập" disabled={loading} onPress={() => navigation.navigate('Login')}>
                <Text style={styles.loginLink}>Đăng nhập</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const getStyles = (colors: any, spacing: any, fontSize: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { flexGrow: 1, padding: spacing.lg, paddingTop: spacing.md, paddingBottom: 40, width: '100%', maxWidth: 480, alignSelf: 'center' },
  brandBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg, minHeight: 44 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandLogo: { width: 32, height: 32, borderRadius: 8 },
  brandText: { fontSize: fontSize.xxl, fontWeight: '700', letterSpacing: -1, color: colors.text },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.divider, alignItems: 'center', justifyContent: 'center' },
  header: { alignItems: 'flex-start', marginBottom: spacing.lg },
  iconWrapper: { width: 72, height: 72, borderRadius: 24, backgroundColor: colors.primaryTint, justifyContent: 'center', alignItems: 'center', marginBottom: spacing.lg },
  title: { fontSize: fontSize.xs, lineHeight: 20, fontWeight: '600', color: colors.primaryDark, marginBottom: 16 },
  heroTitle: { fontSize: fontSize.xxxl, lineHeight: 42, fontWeight: '700', letterSpacing: -1, color: colors.text, marginBottom: 16 },
  accent: { color: colors.primaryStrong },
  subtitle: { fontSize: fontSize.sm, lineHeight: 24, color: colors.textSecondary },
  formContainer: { width: '100%' },
  errorBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: colors.tone.danger.bg, padding: 12, borderRadius: 12, marginBottom: 16 },
  errorText: { flexShrink: 1, color: colors.tone.danger.text, fontSize: fontSize.xs, lineHeight: 20, marginTop: 4 },
  inputGroup: { marginBottom: 16 },
  inputLabel: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text, marginBottom: 8 },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16, paddingHorizontal: 16, minHeight: 56 },
  inputIcon: { marginRight: 12 },
  input: { flex: 1, minWidth: 0, fontSize: fontSize.md, color: colors.text, paddingVertical: 16 },
  submitBtn: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, backgroundColor: colors.primaryStrong, minHeight: 56, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginTop: 16, padding: 12 },
  submitBtnText: { color: colors.surface, fontSize: fontSize.md, fontWeight: '600' },
  loginRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  loginText: { fontSize: fontSize.sm, color: colors.textSecondary },
  loginLink: { fontSize: fontSize.sm, color: colors.primaryStrong, fontWeight: '600' },
  linkButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  helperText: { fontSize: fontSize.sm, lineHeight: 24, color: colors.textSecondary, marginBottom: 24 },
});
