import { useAppTheme } from '../../constants/theme';
// src/screens/auth/ResetPasswordScreen.tsx
import React, { useEffect, useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Alert, ActivityIndicator, Image, TextInputInstance } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { AuthStackParamList } from '../../types';
import { authApi } from '../../api/auth.api';
import { extractApiErrorMessage } from '../../utils/input-validation';
import BackButton from '../../components/BackButton';

const PASSWORD_RULE_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/;

export default function ResetPasswordScreen() {
  const { colors, spacing, fontSize } = useAppTheme();
  const styles = getStyles(colors, spacing, fontSize);
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const route = useRoute<RouteProp<AuthStackParamList, 'ResetPassword'>>();
  const { email } = route.params;

  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
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

  const handleSubmit = async () => {
    if (loading || resending) return;
    setError(null);

    if (!/^[0-9]{6}$/.test(otp.trim())) {
      setError('Vui lòng nhập đủ 6 số của mã OTP.');
      return;
    }
    if (newPassword.length < 8) {
      setError('Mật khẩu phải từ 8 ký tự trở lên.');
      return;
    }
    if (!PASSWORD_RULE_REGEX.test(newPassword)) {
      setError('Mật khẩu cần ít nhất: chữ hoa, chữ thường, số và ký tự đặc biệt.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp.');
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    try {
      await authApi.resetPassword(email, otp.trim(), newPassword);
      Alert.alert('Thành công', 'Đặt lại mật khẩu thành công. Vui lòng đăng nhập lại.', [
        { text: 'Đăng nhập', onPress: () => navigation.reset({ index: 0, routes: [{ name: 'Login' }] }) },
      ]);
    } catch (err: unknown) {
      setError(extractApiErrorMessage(err, 'Đặt lại mật khẩu thất bại. Vui lòng thử lại.'));
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
      await authApi.forgotPassword(email);
      setCooldown(60);
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
              <Ionicons name="key" size={32} color={colors.primaryStrong} />
            </View>
            <Text style={styles.title}>Đặt lại mật khẩu</Text><Text style={styles.heroTitle} accessibilityRole="header">Mật khẩu mới.{'\n'}<Text style={styles.accent}>An tâm trở lại.</Text></Text>
            <Text style={styles.subtitle}>Xác minh bằng OTP trước khi đổi mật khẩu.</Text>
          </View>
          <Text style={styles.helperText}>Vui lòng nhập mã OTP đã được gửi đến email và mật khẩu mới.</Text>

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
                onChangeText={(text) => setOtp(text.replace(/[^0-9]/g, ''))}
                caretHidden={true}
              />
            </TouchableOpacity>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Mật khẩu mới *</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="lock-closed-outline" size={18} color={colors.textSecondary} style={styles.inputIcon} />
                <TextInput
                  accessibilityLabel="Mật khẩu mới"
                  editable={!(loading || resending)}
                  autoCorrect={false}
                  autoComplete="new-password"
                  style={styles.input}
                  placeholder="Tối thiểu 8 ký tự (hoa, thường, số, đặc biệt)"
                  placeholderTextColor={colors.muted}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  value={newPassword}
                  onChangeText={setNewPassword}
                />
                <TouchableOpacity style={styles.eyeButton} accessibilityRole="button" accessibilityLabel={showPassword ? 'Ẩn mật khẩu mới' : 'Hiện mật khẩu mới'} accessibilityState={{ selected: showPassword }} onPress={() => setShowPassword(!showPassword)}>
                  <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Xác nhận mật khẩu mới *</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="shield-checkmark-outline" size={18} color={colors.textSecondary} style={styles.inputIcon} />
                <TextInput
                  accessibilityLabel="Xác nhận mật khẩu mới"
                  editable={!(loading || resending)}
                  autoCorrect={false}
                  autoComplete="new-password"
                  style={styles.input}
                  placeholder="Nhập lại mật khẩu mới"
                  placeholderTextColor={colors.muted}
                  secureTextEntry={!showConfirmPassword}
                  autoCapitalize="none"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                />
                <TouchableOpacity style={styles.eyeButton} accessibilityRole="button" accessibilityLabel={showConfirmPassword ? 'Ẩn mật khẩu xác nhận' : 'Hiện mật khẩu xác nhận'} accessibilityState={{ selected: showConfirmPassword }} onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
                  <Ionicons name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.submitBtn, loading && { opacity: 0.7 }]}
              onPress={handleSubmit}
              activeOpacity={0.85}
              accessibilityRole="button" accessibilityLabel="Đặt lại mật khẩu" accessibilityState={{ disabled: loading || resending, busy: loading }}
              disabled={loading || resending}
            >
              {loading ? (
                <ActivityIndicator color={colors.surface} size="small" />
              ) : (
                <><Text style={styles.submitBtnText}>Đặt lại mật khẩu</Text><Ionicons name="arrow-forward" size={20} color={colors.surface} /></>
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
  errorBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: colors.tone.danger.bg, padding: 12, borderRadius: 12, marginBottom: 16 },
  errorText: { flexShrink: 1, color: colors.tone.danger.text, fontSize: fontSize.xs, lineHeight: 20, marginTop: 4 },
  inputGroup: { marginBottom: 16 },
  inputLabel: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text, marginBottom: 8 },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16, paddingHorizontal: 16, minHeight: 56 },
  inputIcon: { marginRight: 12 },
  input: { flex: 1, minWidth: 0, fontSize: fontSize.md, color: colors.text, paddingVertical: 16 },
  eyeButton: { minWidth: 44, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
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
