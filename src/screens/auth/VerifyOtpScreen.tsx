// src/screens/auth/VerifyOtpScreen.tsx
import React, { useState, useRef, useEffect } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AuthStackParamList, RootStackParamList } from '../../types';
import { authApi } from '../../api/auth.api';
import { useAuthStore } from '../../store';
import { colors, spacing, fontSize } from '../../constants';

type RouteProps = RouteProp<AuthStackParamList, 'VerifyOtp'>;

export default function VerifyOtpScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<AuthStackParamList & RootStackParamList>>();
  const route = useRoute<RouteProps>();
  const { setAuth } = useAuthStore();

  const email = route.params?.email || '';

  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const inputRefs = useRef<Array<TextInput | null>>([]);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // 60s Resend Cooldown
  const [cooldown, setCooldown] = useState(60);
  // 5-minute expiry countdown
  const [expireSeconds, setExpireSeconds] = useState(300);

  useEffect(() => {
    // Focus first input on mount
    const timer = setTimeout(() => {
      inputRefs.current[0]?.focus();
    }, 300);
    return () => clearTimeout(timer);
  }, []);

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

  useEffect(() => {
    const interval = setInterval(() => {
      setExpireSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formattedExpireTime = () => {
    if (expireSeconds <= 0) return 'Đã hết hạn';
    const m = Math.floor(expireSeconds / 60);
    const s = expireSeconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleDigitChange = (index: number, text: string) => {
    setError(null);
    setSuccess(null);
    const cleanText = text.replace(/\D/g, '');

    const newDigits = [...digits];

    if (cleanText.length > 1) {
      // Handle paste of multiple characters
      const pasted = cleanText.slice(0, 6).split('');
      pasted.forEach((char, idx) => {
        if (index + idx < 6) {
          newDigits[index + idx] = char;
        }
      });
      setDigits(newDigits);
      const nextIndex = Math.min(index + pasted.length, 5);
      inputRefs.current[nextIndex]?.focus();
      if (newDigits.every((d) => d.length === 1)) {
        void submitOtp(newDigits.join(''));
      }
      return;
    }

    newDigits[index] = cleanText;
    setDigits(newDigits);

    if (cleanText.length === 1 && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    if (newDigits.every((d) => d.length === 1)) {
      void submitOtp(newDigits.join(''));
    }
  };

  const handleKeyPress = (index: number, key: string) => {
    if (key === 'Backspace') {
      if (!digits[index] && index > 0) {
        const newDigits = [...digits];
        newDigits[index - 1] = '';
        setDigits(newDigits);
        inputRefs.current[index - 1]?.focus();
      }
    }
  };

  const submitOtp = async (code: string) => {
    if (code.length !== 6) {
      setError('Vui lòng nhập đầy đủ mã OTP 6 chữ số.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await authApi.verifyRegisterOtp({
        email: email.trim().toLowerCase(),
        otp: code,
      });

      // AppNavigator reacts to setAuth and automatically displays CustomerMain
      setAuth(response.accessToken, response.user);
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        'Mã OTP không chính xác hoặc đã hết hạn.';
      setError(Array.isArray(msg) ? msg.join(', ') : msg);
      // Re-focus first input
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleManualSubmit = () => {
    const code = digits.join('');
    void submitOtp(code);
  };

  const handleResend = async () => {
    if (cooldown > 0 || resending) return;

    setResending(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await authApi.resendRegisterOtp({
        email: email.trim().toLowerCase(),
      });
      setSuccess(res?.message || 'Mã OTP mới đã được gửi đến email của bạn!');
      setDigits(['', '', '', '', '', '']);
      setCooldown(60);
      setExpireSeconds(300);
      inputRefs.current[0]?.focus();
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

  const isComplete = digits.every((d) => d.length === 1);

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
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={22} color="#0F172A" />
            <Text style={styles.backText}>Quay lại</Text>
          </TouchableOpacity>

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.iconCircle}>
              <Ionicons name="shield-checkmark" size={36} color={colors.primary} />
            </View>
            <Text style={styles.title}>Xác thực tài khoản</Text>
            <Text style={styles.subtitle}>
              Nhập mã xác thực 6 chữ số đã được gửi về email của bạn:
            </Text>

            {/* Email Badge */}
            <View style={styles.emailBadge}>
              <Ionicons name="mail" size={16} color={colors.primary} style={{ marginRight: 6 }} />
              <Text style={styles.emailText} numberOfLines={1}>
                {email}
              </Text>
            </View>
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

          {/* 6-box OTP Input */}
          <View style={styles.otpContainer}>
            {digits.map((digit, idx) => (
              <TextInput
                key={idx}
                ref={(el) => {
                  inputRefs.current[idx] = el;
                }}
                value={digit}
                onChangeText={(text) => handleDigitChange(idx, text)}
                onKeyPress={({ nativeEvent: { key } }) => handleKeyPress(idx, key)}
                keyboardType="number-pad"
                maxLength={1}
                selectTextOnFocus
                style={[
                  styles.otpInput,
                  digit ? styles.otpInputFilled : null,
                  error ? styles.otpInputError : null,
                ]}
              />
            ))}
          </View>

          {/* Expiry & Resend Actions */}
          <View style={styles.timerRow}>
            <View style={styles.expireBlock}>
              <Ionicons
                name="time-outline"
                size={14}
                color={expireSeconds < 60 ? '#DC2626' : colors.textSecondary}
              />
              <Text
                style={[
                  styles.expireText,
                  expireSeconds < 60 ? { color: '#DC2626', fontWeight: '700' } : null,
                ]}
              >
                Thời hạn: {formattedExpireTime()}
              </Text>
            </View>

            {cooldown > 0 ? (
              <Text style={styles.cooldownText}>Gửi lại sau {cooldown}s</Text>
            ) : (
              <TouchableOpacity
                onPress={handleResend}
                disabled={resending}
                activeOpacity={0.7}
                style={styles.resendBtn}
              >
                {resending ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <>
                    <Ionicons name="refresh" size={14} color={colors.primary} style={{ marginRight: 4 }} />
                    <Text style={styles.resendText}>Gửi lại mã OTP</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>

          {/* Submit Button */}
          <TouchableOpacity
            style={[
              styles.submitBtn,
              !isComplete || loading || expireSeconds <= 0 ? styles.submitBtnDisabled : null,
            ]}
            onPress={handleManualSubmit}
            disabled={!isComplete || loading || expireSeconds <= 0}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.submitBtnText}>Xác nhận & Kích hoạt</Text>
            )}
          </TouchableOpacity>

          {/* Change email link */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Nhập sai email? </Text>
            <TouchableOpacity onPress={() => navigation.goBack()}>
              <Text style={styles.footerLink}>Đổi địa chỉ email</Text>
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
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  title: {
    fontSize: fontSize.xxl,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  emailBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginTop: 4,
  },
  emailText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.primary,
    maxWidth: 240,
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
  otpContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: spacing.md,
    gap: 8,
  },
  otpInput: {
    flex: 1,
    height: 56,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '700',
    color: '#0F172A',
  },
  otpInputFilled: {
    borderColor: colors.primary,
    backgroundColor: '#F0F7FF',
  },
  otpInputError: {
    borderColor: '#EF4444',
  },
  timerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xl,
    paddingHorizontal: 4,
  },
  expireBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  expireText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  cooldownText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  resendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  resendText: {
    fontSize: fontSize.xs,
    color: colors.primary,
    fontWeight: '700',
  },
  submitBtn: {
    backgroundColor: colors.primary,
    height: 52,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  submitBtnDisabled: {
    backgroundColor: '#94A3B8',
    shadowOpacity: 0,
    elevation: 0,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing.xl,
  },
  footerText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  footerLink: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: '700',
  },
});
