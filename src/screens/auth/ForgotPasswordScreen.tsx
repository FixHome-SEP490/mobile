// src/screens/auth/ForgotPasswordScreen.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../../types';
import { authApi } from '../../api/auth.api';
import { colors, spacing, fontSize } from '../../constants';

export default function ForgotPasswordScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();

  // Step 1 = Enter Email, Step 2 = Enter OTP & New Password
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (cooldown > 0) {
      interval = setInterval(() => {
        setCooldown((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [cooldown]);

  const handleRequestOtp = async () => {
    if (!email.trim() || !email.includes('@')) {
      setError('Vui lòng nhập email hợp lệ.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await authApi.forgotPassword({ email: email.trim().toLowerCase() });
      setSuccess(res?.message || 'Mã OTP đặt lại mật khẩu đã được gửi đến email của bạn.');
      setStep(2);
      setCooldown(60);
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        'Không thể gửi yêu cầu đặt lại mật khẩu. Vui lòng thử lại.';
      setError(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (otp.trim().length !== 6) {
      setError('Mã OTP phải gồm 6 chữ số.');
      return;
    }
    if (newPassword.length < 8) {
      setError('Mật khẩu mới phải từ 8 ký tự trở lên.');
      return;
    }
    const pwdRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/;
    if (!pwdRegex.test(newPassword)) {
      setError('Mật khẩu cần ít nhất: chữ hoa, chữ thường, số và ký tự đặc biệt.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await authApi.resetPassword({
        email: email.trim().toLowerCase(),
        otp: otp.trim(),
        newPassword,
      });

      Alert.alert(
        'Thành công',
        res?.message || 'Đặt lại mật khẩu thành công! Vui lòng đăng nhập bằng mật khẩu mới.',
        [{ text: 'Đăng nhập', onPress: () => navigation.navigate('Login') }],
      );
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        'Đặt lại mật khẩu thất bại. Mã OTP có thể không đúng hoặc đã hết hạn.';
      setError(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || resending) return;

    setResending(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await authApi.forgotPassword({ email: email.trim().toLowerCase() });
      setSuccess(res?.message || 'Mã OTP mới đã được gửi!');
      setCooldown(60);
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        'Không thể gửi lại mã OTP. Vui lòng thử lại sau.';
      setError(Array.isArray(msg) ? msg.join(', ') : msg);
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
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Back Button */}
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => (step === 2 ? setStep(1) : navigation.goBack())}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={22} color="#0F172A" />
            <Text style={styles.backText}>{step === 2 ? 'Đổi email' : 'Quay lại'}</Text>
          </TouchableOpacity>

          <View style={styles.header}>
            <View style={styles.iconCircle}>
              <Ionicons name="key" size={34} color={colors.primary} />
            </View>
            <Text style={styles.title}>Quên mật khẩu</Text>
            <Text style={styles.subtitle}>
              {step === 1
                ? 'Nhập email đã đăng ký tài khoản để nhận mã OTP đặt lại mật khẩu.'
                : `Nhập mã OTP 6 số đã gửi về ${email} và mật khẩu mới.`}
            </Text>
          </View>

          {/* Error Message */}
          {error && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={18} color="#DC2626" style={{ marginRight: 8 }} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Success Message */}
          {success && (
            <View style={styles.successBox}>
              <Ionicons name="checkmark-circle" size={18} color="#16A34A" style={{ marginRight: 8 }} />
              <Text style={styles.successText}>{success}</Text>
            </View>
          )}

          {step === 1 ? (
            /* STEP 1: Enter Email */
            <View style={styles.formCard}>
              <Text style={styles.label}>Email tài khoản</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="mail-outline" size={20} color="#94A3B8" style={{ marginRight: 10 }} />
                <TextInput
                  style={styles.input}
                  placeholder="example@fixhome.vn"
                  placeholderTextColor="#94A3B8"
                  value={email}
                  onChangeText={(text) => {
                    setEmail(text);
                    setError(null);
                  }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>

              <TouchableOpacity
                style={[styles.submitBtn, loading ? styles.submitBtnDisabled : null]}
                onPress={handleRequestOtp}
                disabled={loading}
                activeOpacity={0.8}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitBtnText}>Gửi mã xác thực OTP</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            /* STEP 2: Enter OTP & New Password */
            <View style={styles.formCard}>
              {/* OTP */}
              <View style={styles.fieldGroup}>
                <View style={styles.rowBetween}>
                  <Text style={styles.label}>Mã OTP (6 chữ số)</Text>
                  {cooldown > 0 ? (
                    <Text style={styles.cooldownSmall}>Gửi lại sau {cooldown}s</Text>
                  ) : (
                    <TouchableOpacity onPress={handleResend} disabled={resending}>
                      <Text style={styles.resendLinkSmall}>Gửi lại mã</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <View style={styles.inputWrapper}>
                  <Ionicons name="shield-outline" size={20} color="#94A3B8" style={{ marginRight: 10 }} />
                  <TextInput
                    style={[styles.input, { letterSpacing: 4, fontWeight: '700' }]}
                    placeholder="123456"
                    placeholderTextColor="#94A3B8"
                    value={otp}
                    onChangeText={(text) => {
                      setOtp(text.replace(/\D/g, ''));
                      setError(null);
                    }}
                    keyboardType="number-pad"
                    maxLength={6}
                  />
                </View>
              </View>

              {/* New Password */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Mật khẩu mới (≥ 8 ký tự)</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="lock-closed-outline" size={20} color="#94A3B8" style={{ marginRight: 10 }} />
                  <TextInput
                    style={styles.input}
                    placeholder="••••••••"
                    placeholderTextColor="#94A3B8"
                    value={newPassword}
                    onChangeText={(text) => {
                      setNewPassword(text);
                      setError(null);
                    }}
                    secureTextEntry={!showPassword}
                  />
                  <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                    <Ionicons
                      name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={20}
                      color="#94A3B8"
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Confirm New Password */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Xác nhận mật khẩu mới</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="lock-closed-outline" size={20} color="#94A3B8" style={{ marginRight: 10 }} />
                  <TextInput
                    style={styles.input}
                    placeholder="••••••••"
                    placeholderTextColor="#94A3B8"
                    value={confirmPassword}
                    onChangeText={(text) => {
                      setConfirmPassword(text);
                      setError(null);
                    }}
                    secureTextEntry={!showPassword}
                  />
                </View>
              </View>

              <TouchableOpacity
                style={[styles.submitBtn, loading ? styles.submitBtnDisabled : null]}
                onPress={handleResetPassword}
                disabled={loading}
                activeOpacity={0.8}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitBtnText}>Cập nhật mật khẩu mới</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.footer}>
            <TouchableOpacity onPress={() => navigation.navigate('Login')}>
              <Text style={styles.footerLink}>Quay về màn hình Đăng nhập</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: Platform.OS === 'android' ? 24 : 12,
    paddingBottom: 40,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
    alignSelf: 'flex-start',
  },
  backText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: '#0F172A',
    marginLeft: 6,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  title: {
    fontSize: fontSize.xxl,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 10,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    borderColor: '#FECACA',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: spacing.md,
  },
  errorText: {
    color: '#DC2626',
    fontSize: fontSize.xs,
    fontWeight: '500',
    flex: 1,
  },
  successBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    borderColor: '#BBF7D0',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: spacing.md,
  },
  successText: {
    color: '#16A34A',
    fontSize: fontSize.xs,
    fontWeight: '500',
    flex: 1,
  },
  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: spacing.md,
  },
  fieldGroup: {
    marginBottom: spacing.md,
  },
  label: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: '#334155',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  resendLinkSmall: {
    fontSize: fontSize.xs,
    color: colors.primary,
    fontWeight: '700',
  },
  cooldownSmall: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 48,
    backgroundColor: '#FFFFFF',
  },
  input: {
    flex: 1,
    fontSize: fontSize.sm,
    color: '#0F172A',
  },
  submitBtn: {
    backgroundColor: colors.primary,
    height: 50,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  submitBtnDisabled: {
    backgroundColor: '#94A3B8',
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  footer: {
    alignItems: 'center',
    marginTop: spacing.md,
  },
  footerLink: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: '700',
  },
});
