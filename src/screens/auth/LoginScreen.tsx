// src/screens/auth/LoginScreen.tsx
import React, { useState } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList, AuthStackParamList } from '../../types';
import { useAuthStore } from '../../store';
import { UserRole } from '../../types';
import { SafeAreaView } from 'react-native-safe-area-context';
import { authApi } from '../../api/auth.api';

export default function LoginScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList & RootStackParamList>>();
  const { setAuth } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        navigation.navigate('CustomerMain');
      }else{
        navigation.navigate('TechnicianMain');
      }
    } catch (err: any) {
      const message =
        err?.response?.data?.message ||
        err?.message ||
        'Đăng nhập thất bại. Vui lòng thử lại.';
      setError(Array.isArray(message) ? message.join(', ') : message);
    } finally {
      setLoading(false);
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
      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        
          <View style={styles.header}>
            <View style={styles.iconWrapper}>
              <Ionicons name="home" size={32} color="#2563EB" />
            </View>
            <Text style={styles.title}>ĐĂNG NHẬP</Text>
            <View style={styles.divider} />
            <Text style={styles.subtitle}>CHÀO MỪNG TRỞ LẠI FIXHOME</Text>
          </View>

          <View style={styles.formContainer}>
            {error && (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={16} color="#DC2626" />
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
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.loginBtnText}>ĐĂNG NHẬP</Text>
              )}
            </TouchableOpacity>

            <View style={styles.registerRow}>
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
              <Ionicons name="person" size={16} color="#FFFFFF" />
              <Text style={styles.techLoginBtnText}>Vào vai Khách (Customer)</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.techLoginBtn, { backgroundColor: '#111827' }]}
              onPress={handleLoginTechnician}
              activeOpacity={0.85}
            >
              <Ionicons name="construct" size={16} color="#FFFFFF" />
              <Text style={styles.techLoginBtnText}>Vào vai Thợ (Technician)</Text>
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
    backgroundColor: '#FFFFFF',
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
    backgroundColor: '#2563EB',
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
    color: '#DC2626',
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
    backgroundColor: '#FFFFFF',
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
    color: '#2563EB',
  },
  loginBtn: {
    backgroundColor: '#2563EB',
    height: 50,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  loginBtnText: {
    color: '#FFFFFF',
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
    color: '#2563EB',
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
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
