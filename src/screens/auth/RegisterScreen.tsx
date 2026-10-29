import { useAppTheme } from '../../constants/theme';
// src/screens/auth/RegisterScreen.tsx
import React, { useState, useMemo, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Alert, StatusBar, Image, TextInputInstance } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AuthStackParamList, RootStackParamList } from '../../types';
import { authApi } from '../../api/auth.api';
import { useAuthStore } from '../../store';
import { UserRole } from '../../types';
import { handoffAuthenticatedRoute } from '../../navigation/root-navigation';
import GoogleSignInButton from '../../components/GoogleSignInButton';
import {
  GoogleSignInCancelled,
  startGoogleSignIn,
} from '../../services/google-auth.service';
import {
  extractApiErrorMessage,
  validateEmail,
  validateFullName,
  validatePhoneNumber,
} from '../../utils/input-validation';
import BackButton from '../../components/BackButton';


export default function RegisterScreen() {
  const { colors, spacing, fontSize, isDark } = useAppTheme();
  const styles = getStyles(colors, spacing, fontSize);
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList & RootStackParamList>>();
  
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'customer' | 'technician'>('customer');
  const isTechnician = role === 'technician';
  
  const renderRuleItem = (met: boolean, text: string) => (
    <View style={styles.ruleItem}>
      <Ionicons 
        name={met ? "checkmark-circle" : "ellipse-outline"} 
        size={14} 
        color={met ? colors.success : colors.textSecondary}
      />
      <Text style={[styles.ruleText, met && styles.ruleTextMet]}>{text}</Text>
    </View>
  );

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const phoneRef = useRef<TextInputInstance>(null);
  const emailRef = useRef<TextInputInstance>(null);
  const passwordRef = useRef<TextInputInstance>(null);
  const confirmPasswordRef = useRef<TextInputInstance>(null);

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [touchedEmail, setTouchedEmail] = useState(false);
  const [touchedFullName, setTouchedFullName] = useState(false);
  const [touchedPhone, setTouchedPhone] = useState(false);
  const [touchedConfirm, setTouchedConfirm] = useState(false);

  // Luật ký tự giữ đúng bản backend, xem src/utils/input-validation.ts.
  const emailIssue = validateEmail(email);
  const fullNameIssue = validateFullName(fullName);
  const phoneIssue = validatePhoneNumber(phone);

  const isEmailValid = emailIssue === '';
  const isPhoneValid = phoneIssue === '';
  const isFullNameValid = fullNameIssue === '';

  const emailError = touchedEmail ? emailIssue : '';
  const fullNameError = touchedFullName ? fullNameIssue : '';
  const phoneError = touchedPhone ? phoneIssue : '';
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
  const barColors = [colors.error, colors.warning, colors.warning, colors.success, colors.success];
  const [isLoading, setIsLoading] = useState(false);

  const { setAuth } = useAuthStore();
  const [googleLoading, setGoogleLoading] = useState(false);

  /**
   * Đăng ký bằng Google không đi qua bước OTP, vì Google đã xác minh email rồi.
   * Người dùng vào thẳng ứng dụng.
   */
  const handleGoogleSignIn = async () => {
    if (isLoading || googleLoading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setGoogleLoading(true);
    try {
      const code = await startGoogleSignIn();
      const result = await authApi.exchangeGoogleCode(code);
      setAuth(result.accessToken, result.user);
      if (result.user.role === UserRole.CUSTOMER || result.user.role === UserRole.TECHNICIAN) handoffAuthenticatedRoute(result.user.role === UserRole.CUSTOMER ? 'CustomerMain' : 'TechnicianMain');
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
    if (isLoading || googleLoading) return;
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

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsLoading(true);
    try {
      const trimmedEmail = email.trim();
      await authApi.register({
        fullName: fullName.trim(),
        email: trimmedEmail,
        password,
        phoneNumber: phone.trim() || undefined,
        role,
      });
      navigation.reset({ index: 0, routes: [{ name: 'VerifyRegisterOtp', params: { email: trimmedEmail, password } }] });
    } catch (error: unknown) {
      // Phong bì lỗi của backend là `{ error: { message, details } }`, không có
      // khoá `message` ở cấp ngoài, nên trước đây mọi lỗi validation đều rơi về
      // câu chung chung.
      Alert.alert(
        'Lỗi đăng ký',
        extractApiErrorMessage(
          error,
          'Đăng ký thất bại. Vui lòng kiểm tra thông tin và thử lại.',
        ),
      );
    } finally {
      setIsLoading(false);
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
      
          <View style={styles.brandBar}><BackButton onPress={() => navigation.navigate('Login')} /><View style={styles.brandRow}><Image source={require('../../../assets/icon.png')} style={styles.brandLogo} /><Text style={styles.brandText}>Fix<Text style={styles.accent}>Home</Text></Text></View></View>
          <View style={styles.header}>
            <Text style={styles.title}>Đăng ký tài khoản</Text><Text style={styles.heroTitle} accessibilityRole="header">Chào bạn mới.{'\n'}<Text style={styles.accent}>Cùng bắt đầu nhé.</Text></Text>
            <Text style={styles.subtitle}>
              {isTechnician ? 'Tạo tài khoản, xác thực email rồi hoàn thiện hồ sơ nghề nghiệp.' : 'Tạo tài khoản để đặt lịch và theo dõi sửa chữa.'}
            </Text>
          </View>

          <Text style={styles.inputLabel} accessibilityLabel="Vai trò tài khoản">Vai trò tài khoản</Text>
          <View style={styles.roleRow}>
            {([
              { value: 'customer', title: 'Khách hàng', sub: 'Đặt lịch sửa chữa' },
              { value: 'technician', title: 'Kỹ thuật viên', sub: 'Gia nhập FixHome' },
            ] as const).map((option) => {
              const selected = role === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  style={[styles.roleBtn, selected && styles.roleBtnActive]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setRole(option.value);
                  }}
                  disabled={isLoading || googleLoading}
                  accessibilityRole="radio"
                  accessibilityLabel={`${option.title}, ${option.sub}`}
                  accessibilityState={{ checked: selected, selected }}
                  aria-checked={selected}
                >
                  <Text style={[styles.roleTitle, selected && styles.roleTitleActive]}>{option.title}</Text>
                  <Text style={styles.roleSub}>{option.sub}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {isTechnician && (
            <View style={styles.roleNotice}>
              <Ionicons name="shield-checkmark-outline" size={18} color={colors.primaryStrong} />
              <Text style={styles.roleNoticeText}>
                Đăng ký kỹ thuật viên gồm 2 giai đoạn: (1) đăng ký và xác thực email bằng OTP; (2) điền thông tin cá nhân, nộp ảnh CCCD và ảnh chân dung, chọn kỹ năng và khu vực hoạt động để quản trị viên xét duyệt.
              </Text>
            </View>
          )}

          <View style={styles.formContainer}>
            <Text style={styles.helperText}>Sau khi đăng ký, nhập mã OTP gửi qua email để xác thực tài khoản.</Text>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Họ và tên</Text>
              <View style={[
                styles.inputWrapper,
                fullNameError ? { borderColor: colors.error, marginBottom: 6 } : undefined
              ]}>
                <Ionicons name="person-outline" size={18} color={colors.textSecondary} style={styles.inputIcon} />
                <TextInput
                  accessibilityLabel="Họ và tên"
                  editable={!(isLoading || googleLoading)}
                  autoCorrect={false}
                  style={styles.input}
                  placeholder="Nguyễn Văn An"
                  placeholderTextColor={colors.textSecondary}
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
                emailError ? { borderColor: colors.error, marginBottom: 6 } : undefined
              ]}>
                <Ionicons name="mail-outline" size={18} color={colors.textSecondary} style={styles.inputIcon} />
                <TextInput
                  accessibilityLabel="Email"
                  editable={!(isLoading || googleLoading)}
                  autoCorrect={false}
                  autoComplete="email"
                  style={styles.input}
                  placeholder="example@gmail.com"
                  placeholderTextColor={colors.textSecondary}
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
                (password.length > 0 && strengthScore < 5) ? { borderColor: colors.error, marginBottom: 6 } : undefined
              ]}>
                <Ionicons name="lock-closed-outline" size={18} color={colors.textSecondary} style={styles.inputIcon} />
                <TextInput
                  accessibilityLabel="Mật khẩu"
                  editable={!(isLoading || googleLoading)}
                  autoCorrect={false}
                  autoComplete="new-password"
                  style={styles.input}
                  placeholder="••••••••"
                  placeholderTextColor={colors.textSecondary}
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={setPassword}
                  autoCapitalize="none"
                  ref={passwordRef}
                  returnKeyType="next"
                  onSubmitEditing={() => confirmPasswordRef.current?.focus()}
                  blurOnSubmit={false}
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

            {password.length > 0 && (
              <View style={styles.passwordStrengthContainer}>
                <View style={styles.strengthBars}>
                  {[0, 1, 2, 3, 4].map((index) => (
                    <View 
                      key={index} 
                      style={[
                        styles.strengthBar, 
                        { backgroundColor: strengthScore > index ? barColors[index] : colors.border }
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
                confirmError ? { borderColor: colors.error, marginBottom: 6 } : undefined
              ]}>
                <Ionicons name="shield-checkmark-outline" size={18} color={colors.textSecondary} style={styles.inputIcon} />
                <TextInput
                  accessibilityLabel="Xác nhận mật khẩu"
                  editable={!(isLoading || googleLoading)}
                  autoCorrect={false}
                  autoComplete="new-password"
                  style={styles.input}
                  placeholder="••••••••"
                  placeholderTextColor={colors.textSecondary}
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
                <TouchableOpacity
                  onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                  style={styles.eyeButton}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  accessibilityRole="button"
                  accessibilityLabel={showConfirmPassword ? 'Ẩn mật khẩu xác nhận' : 'Hiện mật khẩu xác nhận'}
                >
                  <Ionicons name={showConfirmPassword ? "eye-off-outline" : "eye-outline"} size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
              {confirmError ? <Text style={styles.errorText}>{confirmError}</Text> : null}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Số điện thoại</Text>
              <View style={[
                styles.inputWrapper,
                phoneError ? { borderColor: colors.error, marginBottom: 6 } : undefined
              ]}>
                <Ionicons name="call-outline" size={18} color={colors.textSecondary} style={styles.inputIcon} />
                <TextInput
                  accessibilityLabel="Số điện thoại"
                  editable={!(isLoading || googleLoading)}
                  autoCorrect={false}
                  style={styles.input}
                  placeholder="0901234567"
                  placeholderTextColor={colors.textSecondary}
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

            <TouchableOpacity style={[styles.registerBtn, isLoading && { opacity: 0.7 }]} onPress={handleRegister} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Đăng ký tài khoản" accessibilityState={{ disabled: isLoading || googleLoading, busy: isLoading }} disabled={isLoading || googleLoading}>
              <><Text style={styles.registerBtnText}>{isLoading ? 'Đang đăng ký…' : 'Đăng ký tài khoản'}</Text><Ionicons name="arrow-forward" size={20} color={colors.surface} /></>
            </TouchableOpacity>

            {/* Google chỉ tạo tài khoản khách hàng, nên ẩn khi đang đăng ký kỹ thuật viên. */}
            {!isTechnician && (
              <>
                <View style={styles.googleDividerRow}>
                  <View style={styles.googleDividerLine} />
                  <Text style={styles.googleDividerText}>hoặc</Text>
                  <View style={styles.googleDividerLine} />
                </View>

                <GoogleSignInButton
                  onPress={() => void handleGoogleSignIn()}
                  loading={googleLoading}
                  disabled={isLoading || googleLoading}
                  label="Đăng ký với Google"
                />
              </>
            )}

            <View style={[styles.loginRow, { marginTop: 16 }]}>
              <Text style={styles.loginText}>Đã có tài khoản? </Text>
              <TouchableOpacity style={styles.linkButton} accessibilityRole="button" accessibilityLabel="Đăng nhập" disabled={isLoading || googleLoading} onPress={() => navigation.navigate('Login')}>
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
  title: { fontSize: fontSize.xs, lineHeight: 20, fontWeight: '600', color: colors.primaryDark, marginBottom: 16 },
  heroTitle: { fontSize: fontSize.xxxl, lineHeight: 42, fontWeight: '700', letterSpacing: -1, color: colors.text, marginBottom: 16 },
  accent: { color: colors.primaryStrong },
  subtitle: { fontSize: fontSize.sm, lineHeight: 24, color: colors.textSecondary },
  helperText: { fontSize: fontSize.sm, lineHeight: 24, color: colors.textSecondary, marginBottom: 24 },
  formContainer: { width: '100%' },
  errorText: { flexShrink: 1, color: colors.tone.danger.text, fontSize: fontSize.xs, lineHeight: 20, marginTop: 4 },
  inputGroup: { marginBottom: 16 },
  inputLabel: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text, marginBottom: 8 },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16, paddingHorizontal: 16, minHeight: 56 },
  inputIcon: { marginRight: 12 },
  input: { flex: 1, minWidth: 0, fontSize: fontSize.md, color: colors.text, paddingVertical: 16 },
  eyeButton: { minWidth: 44, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  registerBtn: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, backgroundColor: colors.primaryStrong, minHeight: 56, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginTop: 16, padding: 12 },
  registerBtnText: { color: colors.surface, fontSize: fontSize.md, fontWeight: '600' },
  loginRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  loginText: { fontSize: fontSize.sm, color: colors.textSecondary },
  loginLink: { fontSize: fontSize.sm, color: colors.primaryStrong, fontWeight: '600' },
  linkButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  roleRow: { flexDirection: 'row', gap: 8, marginBottom: 24 },
  roleBtn: { flex: 1, minHeight: 64, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: colors.surface, padding: 8 },
  roleBtnActive: { borderColor: colors.primaryStrong, backgroundColor: colors.primarySoft },
  roleTitle: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  roleTitleActive: { color: colors.primaryStrong },
  roleSub: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 4 },
  roleNotice: { flexDirection: 'row', gap: 8, padding: 12, marginBottom: 24, borderRadius: 12, backgroundColor: colors.primarySoft },
  roleNoticeText: { flex: 1, fontSize: fontSize.xs, lineHeight: 20, color: colors.textSecondary },
  passwordStrengthContainer: { marginBottom: 16 },
  strengthBars: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  strengthBar: { flex: 1, height: 4, borderRadius: 2 },
  rulesGrid: { gap: 8 },
  ruleItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ruleText: { fontSize: fontSize.xs, color: colors.textSecondary },
  ruleTextMet: { color: colors.tone.success.text },
  googleDividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 24, marginBottom: 16 },
  googleDividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  googleDividerText: { fontSize: fontSize.xs, color: colors.textSecondary },
});
