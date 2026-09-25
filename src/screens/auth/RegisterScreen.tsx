import { useAppTheme } from '../../constants/theme';
// src/screens/auth/RegisterScreen.tsx
import React, { useState, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AuthStackParamList, RootStackParamList } from '../../types';
import { authApi } from '../../api/auth.api';
import { useAuthStore } from '../../store';
import { UserRole } from '../../types';
import GoogleSignInButton from '../../components/GoogleSignInButton';
import {
  GoogleSignInCancelled,
  startGoogleSignIn,
} from '../../services/google-auth.service';


export default function RegisterScreen() {
  const { colors, spacing, fontSize, isDark } = useAppTheme();
  const styles = getStyles(colors, spacing, fontSize);
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList & RootStackParamList>>();
  
  const [email, setEmail] = useState('');
  
  const renderRuleItem = (met: boolean, text: string) => (
    <View style={styles.ruleItem}>
      <Ionicons 
        name={met ? "checkmark-circle" : "ellipse-outline"} 
        size={14} 
        color={met ? colors.success : "#9CA3AF"} 
      />
      <Text style={[styles.ruleText, met && styles.ruleTextMet]}>{text}</Text>
    </View>
  );

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const phoneRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmPasswordRef = useRef<TextInput>(null);

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [touchedEmail, setTouchedEmail] = useState(false);
  const [touchedFullName, setTouchedFullName] = useState(false);
  const [touchedPhone, setTouchedPhone] = useState(false);
  const [touchedConfirm, setTouchedConfirm] = useState(false);

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phoneRegex = /^0[35789][0-9]{8}$/;
  
  const isEmailValid = emailRegex.test(email.trim());
  const isPhoneValid = !phone.trim() || phoneRegex.test(phone.trim());
  const isFullNameValid = fullName.trim().length >= 2;
  
  const emailError = touchedEmail ? (!email.trim() ? 'Email không được bỏ trống' : (!isEmailValid ? 'Email sai định dạng' : '')) : '';
  const fullNameError = touchedFullName ? (!fullName.trim() ? 'Họ tên không được bỏ trống' : (!isFullNameValid ? 'Họ tên tối thiểu 2 ký tự' : '')) : '';
  const phoneError = touchedPhone ? (!isPhoneValid ? 'SĐT không hợp lệ (VD: 0901234567)' : '') : '';
  const confirmError = touchedConfirm ? (password !== confirmPassword ? 'Mật khẩu xác nhận không khớp' : '') : '';

  const passwordRules = useMemo(() => {
    return {
      minLength: password.length >= 8,
      hasLower: /[a-z]/.test(password),
      hasUpper: /[A-Z]/.test(password),
      hasNumber: /[0-9]/.test(password),
      hasSpecial: /[^A-Za-z0-9]/.test(password),
    };
  }, [password]);

  const strengthScore = Object.values(passwordRules).filter(Boolean).length;
  const barColors = [colors.error, '#F97316', '#EAB308', '#84CC16', colors.success];
  const [isLoading, setIsLoading] = useState(false);

  const { setAuth } = useAuthStore();
  const [googleLoading, setGoogleLoading] = useState(false);

  /**
   * Đăng ký bằng Google không đi qua bước OTP, vì Google đã xác minh email rồi.
   * Người dùng vào thẳng ứng dụng.
   */
  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    try {
      const code = await startGoogleSignIn();
      const result = await authApi.exchangeGoogleCode(code);
      setAuth(result.accessToken, result.user);
      navigation.reset({
        index: 0,
        routes: [
          {
            name:
              result.user.role === UserRole.CUSTOMER
                ? 'CustomerMain'
                : 'TechnicianMain',
          },
        ],
      });
    } catch (err: unknown) {
      if (err instanceof GoogleSignInCancelled) return;
      const envelope = (
        err as { response?: { data?: { error?: { message?: string } } } }
      )?.response?.data?.error?.message;
      Alert.alert(
        'Lỗi đăng ký',
        envelope ||
          (err instanceof Error
            ? err.message
            : 'Đăng ký bằng Google thất bại. Vui lòng thử lại.'),
      );
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleRegister = async () => {
    setTouchedEmail(true);
    setTouchedFullName(true);
    setTouchedPhone(true);
    setTouchedConfirm(true);

    if (!email.trim() || !isEmailValid || !password || !isFullNameValid || !isPhoneValid || password !== confirmPassword) {
      Alert.alert('Lỗi', 'Vui lòng kiểm tra lại thông tin.');
      return;
    }
    if (strengthScore < 5) {
      Alert.alert('Lỗi', 'Mật khẩu chưa đủ mạnh. Vui lòng kiểm tra lại các yêu cầu.');
      return;
    }
    
    setIsLoading(true);
    try {
      const trimmedEmail = email.trim();
      await authApi.register({
        fullName: fullName.trim(),
        email: trimmedEmail,
        password,
        phoneNumber: phone.trim() || undefined,
        role: 'customer',
      });
      navigation.reset({ index: 0, routes: [{ name: 'VerifyRegisterOtp', params: { email: trimmedEmail, password } }] });
    } catch (error: any) {
      const msg =
        error?.response?.data?.message ||
        error?.message ||
        'Đăng ký thất bại. Vui lòng kiểm tra thông tin và thử lại.';
      Alert.alert('Lỗi đăng ký', Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      
          <View style={styles.header}>
            <View style={styles.iconWrapper}>
              <Ionicons name="home" size={32} color={colors.primary} />
            </View>
            <Text style={styles.title}>ĐĂNG KÝ HỘI VIÊN</Text>
            <View style={styles.divider} />
            <Text style={styles.subtitle}>GIA NHẬP HỆ THỐNG FIXHOME</Text>
          </View>

          <View style={styles.formContainer}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Họ và tên</Text>
              <View style={[
                styles.inputWrapper,
                fullNameError ? { borderColor: '#FF3B30', marginBottom: 6 } : undefined
              ]}>
                <Ionicons name="person-outline" size={18} color="#9CA3AF" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Nguyễn Văn An"
                  placeholderTextColor="#9CA3AF"
                  value={fullName}
                  onChangeText={setFullName}
                  onBlur={() => setTouchedFullName(true)}
                  returnKeyType="next"
                  onSubmitEditing={() => emailRef.current?.focus()}
                  blurOnSubmit={false}
                />
              </View>
              {fullNameError ? <Text style={styles.errorText}>{fullNameError}</Text> : null}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Email</Text>
              <View style={[
                styles.inputWrapper,
                emailError ? { borderColor: '#FF3B30', marginBottom: 6 } : undefined
              ]}>
                <Ionicons name="mail-outline" size={18} color="#9CA3AF" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="example@gmail.com"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={email}
                  onChangeText={setEmail}
                  onBlur={() => setTouchedEmail(true)}
                  ref={emailRef}
                  returnKeyType="next"
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  blurOnSubmit={false}
                />
                {emailError ? (
                  <Ionicons name="alert-circle" size={20} color="#FF3B30" />
                ) : (
                  touchedEmail && isEmailValid ? <Ionicons name="checkmark-circle" size={20} color={colors.success} /> : null
                )}
              </View>
              {emailError ? <Text style={styles.errorText}>{emailError}</Text> : null}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Mật khẩu</Text>
              <View style={[
                styles.inputWrapper,
                (password.length > 0 && strengthScore < 5) ? { borderColor: '#FF3B30', marginBottom: 6 } : undefined
              ]}>
                <Ionicons name="lock-closed-outline" size={18} color="#9CA3AF" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="••••••••"
                  placeholderTextColor="#9CA3AF"
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={setPassword}
                  autoCapitalize="none"
                  ref={passwordRef}
                  returnKeyType="next"
                  onSubmitEditing={() => confirmPasswordRef.current?.focus()}
                  blurOnSubmit={false}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={{ padding: 4 }}>
                  <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={18} color="#9CA3AF" />
                </TouchableOpacity>
              </View>
            </View>

            {password.length > 0 && (
              <View style={styles.passwordStrengthContainer}>
                <View style={styles.strengthBars}>
                  {[0, 1, 2, 3, 4].map((index) => (
                    <View 
                      key={index} 
                      style={[
                        styles.strengthBar, 
                        { backgroundColor: strengthScore > index ? barColors[index] : '#E5E7EB' }
                      ]} 
                    />
                  ))}
                </View>
                <View style={styles.rulesGrid}>
                  {renderRuleItem(passwordRules.minLength, "Ít nhất 8 ký tự")}
                  {renderRuleItem(passwordRules.hasLower, "1 chữ viết thường")}
                  {renderRuleItem(passwordRules.hasUpper, "1 chữ viết hoa")}
                  {renderRuleItem(passwordRules.hasNumber, "1 chữ số")}
                  {renderRuleItem(passwordRules.hasSpecial, "1 ký tự đặc biệt")}
                </View>
              </View>
            )}

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Xác nhận mật khẩu</Text>
              <View style={[
                styles.inputWrapper,
                confirmError ? { borderColor: '#FF3B30', marginBottom: 6 } : undefined
              ]}>
                <Ionicons name="shield-checkmark-outline" size={18} color="#9CA3AF" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="••••••••"
                  placeholderTextColor="#9CA3AF"
                  secureTextEntry={!showConfirmPassword}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  onBlur={() => setTouchedConfirm(true)}
                  autoCapitalize="none"
                  ref={confirmPasswordRef}
                  returnKeyType="next"
                  onSubmitEditing={() => phoneRef.current?.focus()}
                  blurOnSubmit={false}
                />
                <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)} style={{ padding: 4 }}>
                  <Ionicons name={showConfirmPassword ? "eye-off-outline" : "eye-outline"} size={18} color="#9CA3AF" />
                </TouchableOpacity>
              </View>
              {confirmError ? <Text style={styles.errorText}>{confirmError}</Text> : null}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Số điện thoại</Text>
              <View style={[
                styles.inputWrapper,
                phoneError ? { borderColor: '#FF3B30', marginBottom: 6 } : undefined
              ]}>
                <Ionicons name="call-outline" size={18} color="#9CA3AF" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="0901234567"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="phone-pad"
                  value={phone}
                  onChangeText={setPhone}
                  onBlur={() => setTouchedPhone(true)}
                  ref={phoneRef}
                  returnKeyType="done"
                  onSubmitEditing={handleRegister}
                />
              </View>
              {phoneError ? <Text style={styles.errorText}>{phoneError}</Text> : null}
            </View>

            <TouchableOpacity style={[styles.registerBtn, isLoading && { opacity: 0.7 }]} onPress={handleRegister} activeOpacity={0.85} disabled={isLoading}>
              <Text style={styles.registerBtnText}>{isLoading ? 'ĐANG ĐĂNG KÝ...' : 'ĐĂNG KÝ'}</Text>
            </TouchableOpacity>

            <View style={styles.googleDividerRow}>
              <View style={styles.googleDividerLine} />
              <Text style={styles.googleDividerText}>HOẶC</Text>
              <View style={styles.googleDividerLine} />
            </View>

            <GoogleSignInButton
              onPress={() => void handleGoogleSignIn()}
              loading={googleLoading}
              disabled={isLoading}
              label="Đăng ký với Google"
            />

            <View style={[styles.loginRow, { marginTop: 20 }]}>
              <Text style={styles.loginText}>Đã có tài khoản? </Text>
              <TouchableOpacity onPress={() => navigation.navigate('Login')}>
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
  backBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 24,
    marginTop: -20,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  backText: {
    fontSize: 13,
    color: '#4B5563',
    fontWeight: '600',
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
  },
  formContainer: {
    width: '100%',
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
  errorText: {
    color: '#FF3B30',
    fontSize: 11,
    fontWeight: '500',
    paddingLeft: 4,
    marginTop: -8,
  },
  passwordStrengthContainer: {
    marginBottom: 16,
    marginTop: -4,
  },
  strengthBars: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
  },
  strengthBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
  rulesGrid: {
    gap: 8,
  },
  ruleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ruleText: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  ruleTextMet: {
    color: colors.success,
  },
  registerBtn: {
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
  registerBtnText: {
    color: colors.surface,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  googleDividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 24,
    marginBottom: 16,
  },
  googleDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  googleDividerText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    color: colors.textSecondary,
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
});


