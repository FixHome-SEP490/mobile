import { useAppTheme } from '../../constants/theme';
// src/screens/auth/VerifyRegisterOtpScreen.tsx
import React, { useEffect, useState, useRef } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { AuthStackParamList, RootStackParamList } from '../../types';
import { authApi } from '../../api/auth.api';
import { useAuthStore } from '../../store';

export default function VerifyRegisterOtpScreen() {
  const { colors, spacing, fontSize } = useAppTheme();
  const styles = getStyles(colors, spacing, fontSize);
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList & RootStackParamList>>();
  const route = useRoute<RouteProp<AuthStackParamList, 'VerifyRegisterOtp'>>();
  const { email, password } = route.params;
  const { setAuth } = useAuthStore();

  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleVerify = async (otpOverride?: string) => {
    const finalOtp = (typeof otpOverride === 'string' ? otpOverride : otp).trim();
    setError(null);
    if (!/^[0-9]{6}$/.test(finalOtp)) {
      setError('Vui lòng nhập đủ 6 số của mã OTP.');
      return;
    }

    setLoading(true);
    try {
      const result = await authApi.verifyRegisterOtp(email, finalOtp);
      setAuth(result.accessToken, result.user);
      // Self-service OTP registration is Customer-only (Backend rejects any
      // other role at /auth/register), and 'CustomerMain' is registered in
      // every branch of AppNavigator regardless of auth state — so it's
      // always safe to navigate there directly instead of hoping the state
      // update alone moves the user off this screen (it won't: the screens
      // list doesn't change for a Customer, so nothing auto-navigates them).
      navigation.reset({ index: 0, routes: [{ name: 'CustomerMain' }] });
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
        navigation.reset({ index: 0, routes: [{ name: 'CustomerMain' }] });
        return;
      } catch {
        // Fall through to surfacing the original OTP error below.
      }
      const message =
        err?.response?.data?.message ||
        err?.message ||
        'Xác thực OTP thất bại. Vui lòng thử lại.';
      setError(Array.isArray(message) ? message.join(', ') : message);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError(null);
    setResending(true);
    try {
      const result = await authApi.resendRegisterOtp(email);
      const resendAt = new Date(result.resendAvailableAt).getTime();
      const seconds = Math.max(0, Math.ceil((resendAt - Date.now()) / 1000));
      setCooldown(seconds || 60);
    } catch (err: any) {
      const message =
        err?.response?.data?.message ||
        err?.message ||
        'Không thể gửi lại mã OTP. Vui lòng thử lại sau.';
      setError(Array.isArray(message) ? message.join(', ') : message);
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
          
          <View style={styles.header}>
            <View style={styles.iconWrapper}>
              <Ionicons name="shield-checkmark" size={32} color={colors.primary} />
            </View>
            <Text style={styles.title}>XÁC THỰC OTP</Text>
            <View style={styles.divider} />
            <Text style={styles.subtitle}>HOÀN TẤT ĐĂNG KÝ</Text>
          </View>
          <Text style={styles.helperText}>Vui lòng nhập mã OTP đã được gửi đến email của bạn.</Text>

          <View style={styles.formContainer}>
            {error && (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={16} color={colors.error} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <TouchableOpacity activeOpacity={1} style={styles.otpWrapper} onPress={() => inputRef.current?.focus()}>
              <View style={styles.otpBoxesContainer} pointerEvents="none">
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
                ref={inputRef}
                style={styles.hiddenOtpInput}
                keyboardType="number-pad"
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
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={colors.surface} size="small" />
              ) : (
                <Text style={styles.submitBtnText}>Xác nhận</Text>
              )}
            </TouchableOpacity>

            <View style={styles.resendRow}>
              <Text style={styles.resendTextWrapper}>Chưa nhận được mã?</Text>
              <TouchableOpacity
                onPress={handleResend}
                disabled={resending || cooldown > 0}
              >
                <Text style={[styles.resendText, (resending || cooldown > 0) && { color: '#94A3B8' }]}>
                  {resending ? 'Đang gửi...' : cooldown > 0 ? `Gửi lại (${cooldown}s)` : 'Gửi lại OTP'}
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
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
    paddingTop: 60,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  iconWrapper: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: '#DBEAFE',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: '#111827',
    marginBottom: 12,
  },
  divider: {
    width: 40,
    height: 4,
    backgroundColor: colors.primary,
    borderRadius: 2,
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 10,
    fontWeight: '700',
    color: '#6B7280',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  formContainer: {
    width: '100%',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEE2E2',
    padding: 10,
    borderRadius: 8,
    marginBottom: 14,
  },
  errorText: {
    flex: 1,
    color: colors.error,
    fontSize: 12,
    fontWeight: '500',
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4B5563',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 50,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: '#111827',
  },
  submitBtn: {
    backgroundColor: colors.primary,
    height: 50,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  submitBtnText: {
    color: colors.surface,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  loginRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 24,
  },
  loginText: {
    fontSize: 13,
    color: '#6B7280',
  },
  loginLink: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '700',
  },
  otpWrapper: {
    position: 'relative',
    height: 60,
    marginBottom: 24,
    marginTop: 8,
  },
  otpBoxesContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  otpBox: {
    width: 45,
    height: 55,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#BFDBFE',
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  otpBoxFilled: {
    borderColor: '#3B82F6',
  },
  otpBoxFocused: {
    borderColor: colors.primary,
    borderWidth: 2,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  otpBoxText: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
  },
  hiddenOtpInput: {
    width: '100%',
    height: '100%',
    position: 'absolute',
    opacity: 0,
  },
  resendRow: {
    alignItems: 'center',
    marginTop: 20,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4,
  },
  resendTextWrapper: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  resendText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },
  helperText: {
    fontSize: 13,
    color: '#4B5563',
    textAlign: 'center',
    marginBottom: 24,
    marginTop: -16,
    paddingHorizontal: 16,
  },
  timerText: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '600',
  },
  resendBtn: {
    padding: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  resendBtnText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  resendBtnDisabled: {
    color: '#9CA3AF',
  }
});



