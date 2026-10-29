import { useAppTheme } from '../../constants/theme';
// src/screens/auth/LoginScreen.tsx
import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator, StatusBar, Image, TextInputInstance } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList, AuthStackParamList } from '../../types';
import { useAuthStore } from '../../store';
import { UserRole } from '../../types';
import { SafeAreaView } from 'react-native-safe-area-context';
import { authApi } from '../../api/auth.api';
import GoogleSignInButton from '../../components/GoogleSignInButton';
import {
  GoogleSignInCancelled,
  startGoogleSignIn,
} from '../../services/google-auth.service';
import { loginErrorMessage } from './login-error';
import { technicianLandingRoute } from '../technician/technician-onboarding';
import { handoffAuthenticatedRoute } from '../../navigation/root-navigation';
import { markCustomerFirstRunSeen } from '../../services/customer-first-run';
import BackButton from '../../components/BackButton';

export default function LoginScreen() {
  const { colors, spacing, fontSize, isDark } = useAppTheme();
  const styles = getStyles(colors, spacing, fontSize);
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList & RootStackParamList>>();
  const { setAuth } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passwordRef = useRef<TextInputInstance>(null);
  // Shared synchronous lock covers taps before React flushes loading state.
  const authAttemptInFlight = useRef(false);
  const goGuestHome = () => {
    const root = navigation.getParent<NativeStackNavigationProp<RootStackParamList>>();
    const state = root?.getState();
    const previous = state?.routes[(state.index ?? 0) - 1]?.name;
    if (root?.canGoBack() && previous && ['CustomerGuestHome', 'CustomerServices', 'CustomerServiceDetail'].includes(previous)) root.goBack();
    else (root ?? navigation).reset({ index: 0, routes: [{ name: 'CustomerGuestHome' }] });
  };
  const explore = () => {
    void markCustomerFirstRunSeen();
    (navigation.getParent<NativeStackNavigationProp<RootStackParamList>>() ?? navigation).reset({ index: 0, routes: [{ name: 'CustomerGuestHome' }] });
  };

  const handleLogin = async () => {
    if (authAttemptInFlight.current || loading || googleLoading) return;
    if (!email.trim() || !password) {
      setError('Vui lòng nhập email hoặc số điện thoại và mật khẩu.');
      return;
    }

    authAttemptInFlight.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    setError(null);
    try {
      const result = await authApi.login({ email, password });
      setAuth(result.accessToken, result.user);
      await goAfterLogin(result.user.role);
    } catch (err: unknown) {
      // `data.message` không tồn tại trong phong bì lỗi của backend, nên nhánh
      // cũ luôn rơi xuống `err.message` của axios và hiện ra cho người dùng câu
      // "Request failed with status code 401" thay vì lý do thật.
      setError(
        loginErrorMessage(err),
      );
    } finally {
      authAttemptInFlight.current = false;
      setLoading(false);
    }
  };

  const [googleLoading, setGoogleLoading] = useState(false);

  /** Sau khi có phiên thì đi tiếp y hệt đăng nhập bằng mật khẩu. */
  const goAfterLogin = async (role: UserRole) => {
    if (role !== UserRole.CUSTOMER && role !== UserRole.TECHNICIAN) return;
    const name =
      role === UserRole.CUSTOMER ? 'CustomerMain' : await technicianLandingRoute();
    if (useAuthStore.getState().user?.role === role) handoffAuthenticatedRoute(name);
  };

  const handleGoogleSignIn = async () => {
    if (authAttemptInFlight.current || loading || googleLoading) return;
    authAttemptInFlight.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setGoogleLoading(true);
    setError(null);
    try {
      const code = await startGoogleSignIn();
      const result = await authApi.exchangeGoogleCode(code);
      setAuth(result.accessToken, result.user);
      await goAfterLogin(result.user.role);
    } catch (err: unknown) {
      // Người dùng tự bấm quay lại thì không phải lỗi, đừng doạ họ bằng thông
      // báo đỏ.
      if (err instanceof GoogleSignInCancelled) return;
      const envelope = (
        err as { response?: { data?: { error?: { message?: string } } } }
      )?.response?.data?.error?.message;
      setError(
        envelope ||
          (err instanceof Error
            ? err.message
            : 'Đăng nhập bằng Google thất bại. Vui lòng thử lại.'),
      );
    } finally {
      authAttemptInFlight.current = false;
      setGoogleLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        
          <View style={styles.brandBar}><BackButton onPress={goGuestHome} /><View style={styles.brandRow}><Image source={require('../../../assets/icon.png')} style={styles.brandLogo} /><Text style={styles.brandText}>Fix<Text style={styles.accent}>Home</Text></Text></View></View>
          <View style={styles.header}>
            <Text style={styles.heroTitle} accessibilityRole="header">Chào bạn.{'\n'}<Text style={styles.accent}>Về với FixHome.</Text></Text>
          </View>

          <View style={styles.formContainer}>
            {error && (
              <View style={styles.errorBox} accessibilityRole="alert" accessibilityLiveRegion="polite">
                <Ionicons name="alert-circle" size={16} color={colors.error} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Email hoặc Số điện thoại</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="mail-outline" size={18} color={colors.textSecondary} style={styles.inputIcon} />
                <TextInput
                  accessibilityLabel="Email hoặc Số điện thoại"
                  editable={!(loading || googleLoading)}
                  autoCorrect={false}
                  autoComplete="username"
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="example@gmail.com"
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="default"
                  autoCapitalize="none"
                  returnKeyType="next"
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  blurOnSubmit={false}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Mật khẩu</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="lock-closed-outline" size={18} color={colors.textSecondary} style={styles.inputIcon} />
                <TextInput
                  accessibilityLabel="Mật khẩu"
                  editable={!(loading || googleLoading)}
                  autoCorrect={false}
                  autoComplete="current-password"
                  style={styles.input}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  placeholderTextColor={colors.textSecondary}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  ref={passwordRef}
                  returnKeyType="done"
                  onSubmitEditing={() => handleLogin()}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  style={styles.eyeButton}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                >
                  <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              style={styles.forgotPasswordRow}
              accessibilityRole="button" accessibilityLabel="Quên mật khẩu" disabled={loading || googleLoading}
              onPress={() => navigation.navigate('ForgotPassword')}
            >
              <Text style={styles.forgotPasswordText}>Quên mật khẩu?</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.loginBtn, loading && { opacity: 0.7 }]} onPress={() => handleLogin()} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Đăng nhập" accessibilityState={{ disabled: loading || googleLoading, busy: loading }} disabled={loading || googleLoading}>
              {loading ? (
                <ActivityIndicator color={colors.surface} size="small" />
              ) : (
                <><Text style={styles.loginBtnText}>Đăng nhập</Text><Ionicons name="arrow-forward" size={20} color={colors.surface} /></>
              )}
            </TouchableOpacity>

            <View style={styles.dividerRow}>
              <View style={styles.lineDivider} />
              <Text style={styles.dividerText}>hoặc</Text>
              <View style={styles.lineDivider} />
            </View>

            <GoogleSignInButton
              onPress={() => void handleGoogleSignIn()}
              loading={googleLoading}
              disabled={loading || googleLoading}
            />

            <TouchableOpacity
              style={[styles.forgotPasswordRow, { minHeight: 48, alignSelf: 'center', justifyContent: 'center' }]}
              onPress={explore}
              disabled={loading || googleLoading}
              accessibilityRole="button"
              accessibilityLabel="Khám phá dịch vụ trước khi đăng nhập"
              accessibilityState={{ disabled: loading || googleLoading }}
            >
              <Text style={styles.forgotPasswordText}>Khám phá</Text>
            </TouchableOpacity>

            <View style={[styles.registerRow, { marginTop: 16 }]}>
              <Text style={styles.registerText}>Chưa có tài khoản? </Text>
              <TouchableOpacity style={styles.linkButton} accessibilityRole="button" accessibilityLabel="Đăng ký tài khoản" disabled={loading || googleLoading} onPress={() => navigation.navigate('Register')}>
                <Text style={styles.registerLink}>Đăng ký ngay</Text>
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
  heroTitle: { fontSize: fontSize.xxxl, lineHeight: 42, fontWeight: '700', letterSpacing: -1, color: colors.text, marginBottom: 16 },
  accent: { color: colors.primaryStrong },
  formContainer: { width: '100%' },
  errorBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: colors.tone.danger.bg, padding: 12, borderRadius: 12, marginBottom: 16 },
  errorText: { flexShrink: 1, color: colors.tone.danger.text, fontSize: fontSize.xs, lineHeight: 20, marginTop: 4 },
  inputGroup: { marginBottom: 16 },
  inputLabel: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text, marginBottom: 8 },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16, paddingHorizontal: 16, minHeight: 56 },
  inputIcon: { marginRight: 12 },
  input: { flex: 1, minWidth: 0, fontSize: fontSize.md, color: colors.text, paddingVertical: 16 },
  eyeButton: { minWidth: 44, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  loginBtn: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, backgroundColor: colors.primaryStrong, minHeight: 56, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginTop: 16, padding: 12 },
  loginBtnText: { color: colors.surface, fontSize: fontSize.md, fontWeight: '600' },
  forgotPasswordRow: { alignSelf: 'flex-end', minHeight: 44, justifyContent: 'center' },
  forgotPasswordText: { fontSize: fontSize.sm, fontWeight: '500', color: colors.primaryStrong },
  registerRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  registerText: { fontSize: fontSize.sm, color: colors.textSecondary },
  registerLink: { fontSize: fontSize.sm, color: colors.primaryStrong, fontWeight: '600' },
  linkButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 24 },
  lineDivider: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { fontSize: fontSize.xs, color: colors.textSecondary, marginHorizontal: 12 },
});
