import { useAppTheme } from '../../constants/theme';
// src/screens/auth/VerifyRegisterOtpScreen.tsx
import React, { useEffect, useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator, Image, TextInputInstance } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { AuthStackParamList } from '../../types';
import { authApi } from '../../api/auth.api';
import { useAuthStore } from '../../store';
import { UserRole } from '../../types';
import { handoffAuthenticatedRoute } from '../../navigation/root-navigation';
import { extractApiErrorMessage } from '../../utils/input-validation';
import BackButton from '../../components/BackButton';

export default function VerifyRegisterOtpScreen() {
  const { colors, spacing, fontSize } = useAppTheme();
  const styles = getStyles(colors, spacing, fontSize);
  const route = useRoute<RouteProp<AuthStackParamList, 'VerifyRegisterOtp'>>();
  const { email, password } = route.params;
  const { setAuth } = useAuthStore();

  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const inputRef = useRef<TextInputInstance>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  // Kỹ thuật viên mới chưa được duyệt nên vào thẳng luồng đăng ký hồ sơ.
  const enterApp = (role: UserRole) => {
    if (role === UserRole.CUSTOMER || role === UserRole.TECHNICIAN) handoffAuthenticatedRoute(role === UserRole.TECHNICIAN ? 'TechnicianOnboarding' : 'CustomerMain');
  };

  const handleVerify = async (otpOverride?: string) => {
    if (loading || resending) return;
    const finalOtp = (typeof otpOverride === 'string' ? otpOverride : otp).trim();
    setError(null);
    if (!/^[0-9]{6}$/.test(finalOtp)) {
      setError('Vui lòng nhập đủ 6 số của mã OTP.');
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    try {
      const result = await authApi.verifyRegisterOtp(email, finalOtp);
      setAuth(result.accessToken, result.user);
      // The root handoff waits until the authenticated role routes are mounted.
      enterApp(result.user.role);
    } catch (err: any) {
      // A slow/dropped connection can mean the OTP was actually verified and
      // the account activated on the Backend, but the response never made it
      // back (client timeout) or this is a retry against an already-used
      // code. Either way the account may already be active with the
      // password just set at registration — fall back to a normal login so
      // the user still lands in the app instead of being stuck on an error.
      try {
        const loginResult = await authApi.login({ email, password });
        setAuth(loginResult.accessToken, loginResult.user);
        enterApp(loginResult.user.role);
        return;
      } catch {
        // Fall through to surfacing the original OTP error below.
      }
      setError(extractApiErrorMessage(err, 'Xác thực OTP thất bại. Vui lòng thử lại.'));
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (loading || resending || cooldown > 0) return;
    Haptics.selectionAsync();
    setError(null);
    setResending(true);
    try {
      const result = await authApi.resendRegisterOtp(email);
      const resendAt = new Date(result.resendAvailableAt).getTime();
      const seconds = Math.max(0, Math.ceil((resendAt - Date.now()) / 1000));
      setCooldown(seconds || 60);
    } catch (err: unknown) {
      setError(extractApiErrorMessage(err, 'Không thể gửi lại mã OTP. Vui lòng thử lại sau.'));
    } finally {
      setResending(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.brandBar}><BackButton /><View style={styles.brandRow}><Image source={require('../../../assets/icon.png')} style={styles.brandLogo} /><Text style={styles.brandText}>Fix<Text style={styles.accent}>Home</Text></Text></View></View>

          <View style={styles.header}>
            <View style={styles.iconWrapper}>
              <Ionicons name="shield-checkmark" size={32} color={colors.primaryStrong} />
            </View>
            <Text style={styles.title}>Xác thực email</Text><Text style={styles.heroTitle} accessibilityRole="header">Hoàn tất đăng ký.{'\n'}<Text style={styles.accent}>Xác nhận email của bạn.</Text></Text>
            <Text style={styles.subtitle}>Mã OTP gồm 6 số từ email đăng ký.</Text>
          </View>
          <Text style={styles.helperText}>Vui lòng nhập mã OTP đã được gửi đến email của bạn.</Text>

          <View style={styles.formContainer}>
            {error && (
              <View style={styles.errorBox} accessibilityRole="alert" accessibilityLiveRegion="polite">
                <Ionicons name="alert-circle" size={16} color={colors.error} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <Text style={styles.inputLabel}>Mã OTP gồm 6 số</Text>
            <TouchableOpacity accessible={false} activeOpacity={1} style={styles.otpWrapper} onPress={() => inputRef.current?.focus()}>
              <View style={styles.otpBoxesContainer} pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                {[0, 1, 2, 3, 4, 5].map((index) => {
                  const char = otp[index] || '';
                  const isFocused = otp.length === index;
                  return (
                    <View key={index} style={[styles.otpBox, char ? styles.otpBoxFilled : (isFocused ? styles.otpBoxFocused : null)]}>
                      <Text style={styles.otpBoxText}>{char}</Text>
                    </View>
                  );
                })}
              </View>
              <TextInput
                  accessibilityLabel="Mã OTP gồm 6 số"
                  editable={!(loading || resending)}
                  autoCorrect={false}
                  autoComplete="one-time-code"
                ref={inputRef}
                style={styles.hiddenOtpInput}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                maxLength={6}
                value={otp}
                onChangeText={(text) => {
                  const val = text.replace(/[^0-9]/g, '');
                  setOtp(val);
                  if (val.length === 6) {
                    void handleVerify(val);
                  }
                }}
                caretHidden={true}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.submitBtn, loading && { opacity: 0.7 }]}
              onPress={() => handleVerify()}
              activeOpacity={0.85}
              accessibilityRole="button" accessibilityLabel="Xác nhận OTP" accessibilityState={{ disabled: loading || resending, busy: loading }}
              disabled={loading || resending}
            >
              {loading ? (
                <ActivityIndicator color={colors.surface} size="small" />
              ) : (
                <><Text style={styles.submitBtnText}>Xác nhận</Text><Ionicons name="arrow-forward" size={20} color={colors.surface} /></>
              )}
            </TouchableOpacity>

            <View style={styles.resendRow}>
              <Text style={styles.resendTextWrapper}>Chưa nhận được mã?</Text>
              <TouchableOpacity
                onPress={handleResend}
                style={styles.linkButton} accessibilityRole="button" accessibilityLabel="Gửi lại OTP" accessibilityState={{ disabled: loading || resending || cooldown > 0, busy: resending }} disabled={loading || resending || cooldown > 0}
              >
                <Text style={[styles.resendText, (resending || cooldown > 0) && { color: colors.muted }]}>
                  {resending ? 'Đang gửi…' : cooldown > 0 ? `Gửi lại (${cooldown}s)` : 'Gửi lại OTP'}
                </Text>
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
  inputLabel: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text, marginBottom: 8 },
  errorBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: colors.tone.danger.bg, padding: 12, borderRadius: 12, marginBottom: 16 },
  errorText: { flexShrink: 1, color: colors.tone.danger.text, fontSize: fontSize.xs, lineHeight: 20, marginTop: 4 },
  submitBtn: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, backgroundColor: colors.primaryStrong, minHeight: 56, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginTop: 16, padding: 12 },
  submitBtnText: { color: colors.surface, fontSize: fontSize.md, fontWeight: '600' },
  linkButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  helperText: { fontSize: fontSize.sm, lineHeight: 24, color: colors.textSecondary, marginBottom: 24 },
  otpWrapper: { position: 'relative', minHeight: 60, marginBottom: 24, marginTop: 8 },
  otpBoxesContainer: { flexDirection: 'row', gap: 8, width: '100%', minHeight: 60 },
  otpBox: { flex: 1, minHeight: 56, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center' },
  otpBoxFilled: { borderColor: colors.primaryStrong },
  otpBoxFocused: { borderColor: colors.primaryStrong, borderWidth: 2 },
  otpBoxText: { fontSize: fontSize.xxl, fontWeight: '700', color: colors.text },
  hiddenOtpInput: { width: '100%', height: '100%', position: 'absolute', opacity: 0 },
  resendRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 4, marginTop: 16 },
  resendTextWrapper: { fontSize: fontSize.sm, color: colors.textSecondary },
  resendText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.primaryStrong },
});
