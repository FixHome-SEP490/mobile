import { useAppTheme } from '../../constants/theme';
// src/screens/auth/LoginScreen.tsx
import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
import { extractApiErrorMessage } from '../../utils/input-validation';

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

  const passwordRef = useRef<TextInput>(null);

  const handleLogin = async (loginEmail?: string, loginPassword?: string) => {
    const finalEmail = loginEmail ?? email;
    const finalPassword = loginPassword ?? password;

    if (!finalEmail.trim() || !finalPassword) {
      setError('Vui lòng nhập email và mật khẩu.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await authApi.login({ email: finalEmail, password: finalPassword });
      setAuth(result.accessToken, result.user);
      if (result.user.role === UserRole.CUSTOMER) {
        navigation.reset({ index: 0, routes: [{ name: 'CustomerMain' }] });
      }else{
        navigation.reset({ index: 0, routes: [{ name: 'TechnicianMain' }] });
      }
    } catch (err: unknown) {
      // `data.message` không tồn tại trong phong bì lỗi của backend, nên nhánh
      // cũ luôn rơi xuống `err.message` của axios và hiện ra cho người dùng câu
      // "Request failed with status code 401" thay vì lý do thật.
      setError(
        extractApiErrorMessage(err, 'Đăng nhập thất bại. Vui lòng thử lại.'),
      );
    } finally {
      setLoading(false);
    }
  };

  const [googleLoading, setGoogleLoading] = useState(false);

  /** Sau khi có phiên thì đi tiếp y hệt đăng nhập bằng mật khẩu. */
  const goAfterLogin = (role: UserRole) => {
    navigation.reset({
      index: 0,
      routes: [
        { name: role === UserRole.CUSTOMER ? 'CustomerMain' : 'TechnicianMain' },
      ],
    });
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setError(null);
    try {
      const code = await startGoogleSignIn();
      const result = await authApi.exchangeGoogleCode(code);
      setAuth(result.accessToken, result.user);
      goAfterLogin(result.user.role);
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
      setGoogleLoading(false);
    }
  };

  const handleLoginCustomer = () => {
    void handleLogin('testlog01@gmail.com', 'Ahihi113@');
  };

  const handleLoginTechnician = () => {
    void handleLogin('tech1@fixhome.vn', 'Password123!');
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
            <Text style={styles.title}>ĐĂNG NHẬP</Text>
            <View style={styles.divider} />
            <Text style={styles.subtitle}>CHÀO MỪNG TRỞ LẠI FIXHOME</Text>
          </View>

          <View style={styles.formContainer}>
            {error && (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={16} color={colors.error} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Email</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="mail-outline" size={18} color="#9CA3AF" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="example@gmail.com"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="email-address"
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
                <Ionicons name="lock-closed-outline" size={18} color="#9CA3AF" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  placeholderTextColor="#9CA3AF"
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  ref={passwordRef}
                  returnKeyType="done"
                  onSubmitEditing={() => handleLogin()}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={{ padding: 4 }}>
                  <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={18} color="#9CA3AF" />
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              style={styles.forgotPasswordRow}
              onPress={() => navigation.navigate('ForgotPassword')}
            >
              <Text style={styles.forgotPasswordText}>Quên mật khẩu?</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.loginBtn, loading && { opacity: 0.7 }]} onPress={() => handleLogin()} activeOpacity={0.85} disabled={loading}>
              {loading ? (
                <ActivityIndicator color={colors.surface} size="small" />
              ) : (
                <Text style={styles.loginBtnText}>ĐĂNG NHẬP</Text>
              )}
            </TouchableOpacity>

            <View style={styles.dividerRow}>
              <View style={styles.lineDivider} />
              <Text style={styles.dividerText}>HOẶC</Text>
              <View style={styles.lineDivider} />
            </View>

            <GoogleSignInButton
              onPress={() => void handleGoogleSignIn()}
              loading={googleLoading}
              disabled={loading}
            />

            <View style={[styles.registerRow, { marginTop: 20 }]}>
              <Text style={styles.registerText}>Chưa có tài khoản? </Text>
              <TouchableOpacity onPress={() => navigation.navigate('Register')}>
                <Text style={styles.registerLink}>Đăng ký ngay</Text>
              </TouchableOpacity>
            </View>

            {/* Quick Dev Switcher Buttons */}
            <View style={styles.dividerRow}>
              <View style={styles.lineDivider} />
              <Text style={styles.dividerText}>HOẶC THỬ NGHIỆM VAI TRÒ</Text>
              <View style={styles.lineDivider} />
            </View>

            <TouchableOpacity
              style={[styles.techLoginBtn, { backgroundColor: '#3B82F6', marginBottom: 12 }]}
              onPress={handleLoginCustomer}
              activeOpacity={0.85}
            >
              <Ionicons name="person" size={16} color={colors.surface} />
              <Text style={styles.techLoginBtnText}>Vào vai Khách (Customer)</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.techLoginBtn, { backgroundColor: '#111827' }]}
              onPress={handleLoginTechnician}
              activeOpacity={0.85}
            >
              <Ionicons name="construct" size={16} color={colors.surface} />
              <Text style={styles.techLoginBtnText}>Vào vai Thợ (Technician)</Text>
            </TouchableOpacity>
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
  forgotPasswordRow: {
    alignItems: 'flex-end',
    marginTop: -4,
    marginBottom: 4,
  },
  forgotPasswordText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },
  loginBtn: {
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
  loginBtnText: {
    color: colors.surface,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  registerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 24,
  },
  registerText: {
    fontSize: 13,
    color: '#6B7280',
  },
  registerLink: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '700',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  lineDivider: {
    flex: 1,
    height: 1,
    backgroundColor: '#D1D5DB',
  },
  dividerText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#9CA3AF',
    marginHorizontal: 8,
    letterSpacing: 0.5,
  },
  techLoginBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#111827',
    height: 48,
    borderRadius: 8,
  },
  techLoginBtnText: {
    color: colors.surface,
    fontSize: 13,
    fontWeight: '700',
  },
});


