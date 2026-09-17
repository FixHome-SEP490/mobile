// src/screens/auth/LoginScreen.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList, AuthStackParamList } from '../../types';
import { useAuthStore } from '../../store';
import { colors, spacing, fontSize } from '../../constants';
import { SafeAreaView } from 'react-native-safe-area-context';
import { authApi } from '../../api/auth.api';

export default function LoginScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList & RootStackParamList>>();
  const { setAuth } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (loginEmail: string, loginPassword: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await authApi.login({ email: loginEmail, password: loginPassword });
      // AppNavigator swaps to the Technician/Customer stack as soon as this
      // state updates — do not also navigate() here. Doing so races the
      // re-render: right after this call the navigator still only has the
      // unauthenticated screens mounted, so navigating to 'TechnicianMain'
      // (which only exists in the authenticated-technician stack) throws
      // "action NAVIGATE ... was not handled by any navigator".
      setAuth(result.accessToken, result.user);
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
    if (!email.trim() || !password) {
      setError('Vui lòng nhập email và mật khẩu.');
      return;
    }
    void handleLogin(email, password);
  };

  const handleLoginTechnician = () => {
    handleLoginCustomer();
  };

  const handleContinueAsGuest = () => {
    navigation.navigate('CustomerMain');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAFC' }} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      {/* Back Button */}
      <TouchableOpacity
        style={styles.backBtn}
        onPress={handleContinueAsGuest}
        activeOpacity={0.7}
      >
        <Ionicons name="arrow-back" size={22} color="#0F172A" />
        <Text style={styles.backText}>Về Trang chủ</Text>
      </TouchableOpacity>

      <Image
        source={require('../../../assets/icon.png')}
        style={styles.logo}
        resizeMode="contain"
      />
      <Text style={styles.title}>FixHome</Text>
      <Text style={styles.subtitle}>Sửa Chữa & Bảo Trì Nhà Trọn Gói</Text>

      {/* Form Login */}
      <View style={styles.formContainer}>
        <Text style={styles.formTitle}>Đăng nhập tài khoản</Text>

        {error && (
          <View style={{ backgroundColor: '#FEE2E2', padding: 10, borderRadius: 8, marginBottom: 12 }}>
            <Text style={{ color: '#DC2626', fontSize: 12, fontWeight: '500' }}>{error}</Text>
          </View>
        )}

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Email</Text>
          <View style={styles.inputWrapper}>
            <Ionicons name="mail-outline" size={18} color="#64748B" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="email@example.com"
              placeholderTextColor="#94A3B8"
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>
        </View>

        <View style={styles.inputGroup}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <Text style={styles.inputLabel}>Mật khẩu</Text>
            <TouchableOpacity onPress={() => navigation.navigate('ForgotPassword')}>
              <Text style={{ fontSize: 12, color: '#2563EB', fontWeight: '600' }}>Quên mật khẩu?</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.inputWrapper}>
            <Ionicons name="lock-closed-outline" size={18} color="#64748B" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="Nhập mật khẩu"
              placeholderTextColor="#94A3B8"
              secureTextEntry
            />
          </View>
        </View>

        <TouchableOpacity
          style={[styles.loginBtn, loading && { opacity: 0.7 }]}
          onPress={handleLoginCustomer}
          activeOpacity={0.85}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFF" size="small" />
          ) : (
            <Text style={styles.loginBtnText}>Đăng nhập</Text>
          )}
        </TouchableOpacity>

        <View style={styles.registerRow}>
          <Text style={styles.registerText}>Chưa có tài khoản? </Text>
          <TouchableOpacity onPress={() => navigation.navigate('Register')}>
            <Text style={styles.registerLink}>Đăng ký</Text>
          </TouchableOpacity>
        </View>

        {/* Quick Dev Switcher Buttons */}
        <View style={styles.dividerRow}>
          <View style={styles.divider} />
          <Text style={styles.dividerText}>HOẶC THỬ NGHIỆM VAI TRÒ</Text>
          <View style={styles.divider} />
        </View>

        <TouchableOpacity
          style={[styles.techLoginBtn, { backgroundColor: '#2563EB', marginBottom: 12 }]}
          onPress={handleLoginCustomer}
          activeOpacity={0.85}
        >
          <Ionicons name="person" size={16} color="#FFFFFF" />
          <Text style={styles.techLoginBtnText}>Vào vai Khách (Customer)</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.techLoginBtn, { backgroundColor: '#0F172A' }]}
          onPress={handleLoginTechnician}
          activeOpacity={0.85}
        >
          <Ionicons name="construct" size={16} color="#FFFFFF" />
          <Text style={styles.techLoginBtnText}>Vào vai Thợ (Technician)</Text>
        </TouchableOpacity>
      </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    padding: spacing.lg,
    paddingTop: 40,
  },
  backBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 20,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  backText: {
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '600',
  },
  logo: {
    width: 100,
    height: 100,
    marginBottom: spacing.xs,
    borderRadius: 20,
  },
  title: {
    fontSize: fontSize.xxxl,
    fontWeight: 'bold',
    color: colors.primary,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  formContainer: {
    backgroundColor: '#FFFFFF',
    padding: spacing.lg,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  formTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 6,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: '#0F172A',
  },
  loginBtn: {
    backgroundColor: colors.primary,
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  loginBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  registerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 20,
    marginBottom: 8,
  },
  registerText: {
    fontSize: 13,
    color: '#64748B',
  },
  registerLink: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2563EB',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 18,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: '#E2E8F0',
  },
  dividerText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#94A3B8',
    marginHorizontal: 8,
    letterSpacing: 0.5,
  },
  techLoginBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0F172A',
    height: 44,
    borderRadius: 10,
  },
  techLoginBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  guestBtn: {
    marginTop: 14,
    alignItems: 'center',
  },
  guestBtnText: {
    color: '#2563EB',
    fontSize: 13,
    fontWeight: '600',
  },
});
