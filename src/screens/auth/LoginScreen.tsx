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
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList, AuthStackParamList } from '../../types';
import { useAuthStore } from '../../store';
import { UserRole } from '../../types';
import { SafeAreaView } from 'react-native-safe-area-context';
import { authApi } from '../../api/auth';
import { storageService } from '../../services/storage.service';

export default function LoginScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList & RootStackParamList>>();
  const { setAuth } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (roleOverride?: UserRole, forcedEmail?: string, forcedPassword?: string) => {
    const finalEmail = forcedEmail || email;
    const finalPassword = forcedPassword || password;

    if (!finalEmail.trim() || !finalPassword) {
      Alert.alert('Lỗi', 'Vui lòng nhập email và mật khẩu');
      return;
    }
    
    setIsLoading(true);
    try {
      const res = await authApi.login({
        email: finalEmail,
        password: finalPassword,
      });
      
      const { accessToken, refreshToken, user } = res.data;
      
      await storageService.setToken(accessToken);
      if (refreshToken) {
        await storageService.setRefreshToken(refreshToken);
      }
      
      const finalUser = { ...user };
      if (roleOverride) {
        finalUser.role = roleOverride;
      }
      
      setAuth(accessToken, finalUser);
      
      if (finalUser.role === UserRole.TECHNICIAN) {
        navigation.reset({
          index: 0,
          routes: [{ name: 'TechnicianMain' }],
        });
      } else {
        navigation.reset({
          index: 0,
          routes: [{ name: 'CustomerMain' }],
        });
      }
    } catch (error: any) {
      const msg = error.response?.data?.message || error.response?.data?.error?.message || 'Đăng nhập thất bại';
      Alert.alert('Lỗi', msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoginCustomer = () => handleLogin(undefined, 'testlog01@gmail.com', 'Ahihi113@');
  const handleLoginTechnician = () => handleLogin(UserRole.TECHNICIAN, 'tech1@fixhome.vn', 'Password123!');

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

          <View style={styles.header}>
            <View style={styles.iconWrapper}>
              <Ionicons name="home" size={32} color="#D97706" />
            </View>
            <Text style={styles.title}>ĐĂNG NHẬP</Text>
            <View style={styles.divider} />
            <Text style={styles.subtitle}>CHÀO MỪNG TRỞ LẠI FIXHOME</Text>
          </View>

          <View style={styles.formContainer}>
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
                  placeholder="Abc12345@"
                  placeholderTextColor="#9CA3AF"
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={{ padding: 4 }}>
                  <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={18} color="#9CA3AF" />
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity style={styles.loginBtn} onPress={() => handleLogin()} activeOpacity={0.85}>
              <Text style={styles.loginBtnText}>ĐĂNG NHẬP</Text>
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
    backgroundColor: '#F3F4F6', // Light gray background to match RegisterScreen
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
    backgroundColor: '#FEF3C7',
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
    backgroundColor: '#D97706',
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
  loginBtn: {
    backgroundColor: '#D97706',
    height: 50,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
    shadowColor: '#D97706',
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
    color: '#D97706',
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
