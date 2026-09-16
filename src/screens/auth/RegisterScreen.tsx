import React, { useState, useMemo } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AuthStackParamList, RootStackParamList } from '../../types';
import { authApi } from '../../api/auth';

const RuleItem = ({ met, text }: { met: boolean, text: string }) => (
  <View style={styles.ruleItem}>
    <Ionicons 
      name={met ? "checkmark-circle" : "ellipse-outline"} 
      size={14} 
      color={met ? "#22C55E" : "#9CA3AF"} 
    />
    <Text style={[styles.ruleText, met && styles.ruleTextMet]}>{text}</Text>
  </View>
);

export default function RegisterScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList & RootStackParamList>>();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [touchedEmail, setTouchedEmail] = useState(false);
  const [touchedFullName, setTouchedFullName] = useState(false);
  const [touchedPhone, setTouchedPhone] = useState(false);

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phoneRegex = /^0[35789][0-9]{8}$/;
  
  const isEmailValid = emailRegex.test(email.trim());
  const isPhoneValid = phoneRegex.test(phone.trim());
  const isFullNameValid = fullName.trim().length >= 2;
  
  const emailError = touchedEmail ? (!email.trim() ? 'Email không được bỏ trống' : (!isEmailValid ? 'Email sai định dạng' : '')) : '';
  const fullNameError = touchedFullName ? (!fullName.trim() ? 'Họ tên không được bỏ trống' : (!isFullNameValid ? 'Họ tên tối thiểu 2 ký tự' : '')) : '';
  const phoneError = touchedPhone ? (!phone.trim() ? 'Số điện thoại không được bỏ trống' : (!isPhoneValid ? 'SĐT không hợp lệ (VD: 0901234567)' : '')) : '';

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
  const barColors = ['#EF4444', '#F97316', '#EAB308', '#84CC16', '#22C55E'];
  const [isLoading, setIsLoading] = useState(false);

  const handleRegister = async () => {
    setTouchedEmail(true);
    setTouchedFullName(true);
    setTouchedPhone(true);

    if (!email.trim() || !isEmailValid || !password || !isFullNameValid || !isPhoneValid) {
      Alert.alert('Lỗi', 'Vui lòng kiểm tra lại thông tin.');
      return;
    }
    if (strengthScore < 5) {
      Alert.alert('Lỗi', 'Mật khẩu chưa đủ mạnh. Vui lòng kiểm tra lại các yêu cầu.');
      return;
    }
    
    setIsLoading(true);
    try {
      await authApi.register({
        email,
        password,
        fullName,
        phoneNumber: phone,
        role: 'customer'
      });
      Alert.alert('Thành công', 'Đăng ký tài khoản thành công.', [
        { text: 'OK', onPress: () => navigation.goBack() }
      ]);
    } catch (error: any) {
      const errorData = error.response?.data?.error;
      if (errorData && errorData.details && errorData.details.length > 0) {
        Alert.alert('Lỗi đăng ký', errorData.details.join('\n'));
      } else {
        Alert.alert('Lỗi đăng ký', errorData?.message || error.response?.data?.message || 'Có lỗi xảy ra, vui lòng thử lại.');
      }
    } finally {
      setIsLoading(false);
    }
  };

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
                />
                {emailError ? (
                  <Ionicons name="alert-circle" size={20} color="#FF3B30" />
                ) : (
                  touchedEmail && isEmailValid ? <Ionicons name="checkmark-circle" size={20} color="#22C55E" /> : null
                )}
              </View>
              {emailError ? <Text style={styles.errorText}>{emailError}</Text> : null}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Mật khẩu</Text>
              <View style={[
                styles.inputWrapper,
                (password.length > 0 && strengthScore < 4) ? { borderColor: '#FF3B30', marginBottom: 6 } : undefined
              ]}>
                <Ionicons name="lock-closed-outline" size={18} color="#9CA3AF" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Abc12345@"
                  placeholderTextColor="#9CA3AF"
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={setPassword}
                  autoCapitalize="none"
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
                  <RuleItem met={passwordRules.minLength} text="Ít nhất 8 ký tự" />
                  <RuleItem met={passwordRules.hasLower} text="1 chữ viết thường" />
                  <RuleItem met={passwordRules.hasUpper} text="1 chữ viết hoa" />
                  <RuleItem met={passwordRules.hasNumber} text="1 chữ số" />
                  <RuleItem met={passwordRules.hasSpecial} text="1 ký tự đặc biệt" />
                </View>
              </View>
            )}

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
                />
              </View>
              {phoneError ? <Text style={styles.errorText}>{phoneError}</Text> : null}
            </View>

            <TouchableOpacity style={[styles.registerBtn, isLoading && { opacity: 0.7 }]} onPress={handleRegister} activeOpacity={0.85} disabled={isLoading}>
              <Text style={styles.registerBtnText}>{isLoading ? 'ĐANG ĐĂNG KÝ...' : 'ĐĂNG KÝ'}</Text>
            </TouchableOpacity>

            <View style={styles.loginRow}>
              <Text style={styles.loginText}>Đã có tài khoản? </Text>
              <TouchableOpacity onPress={() => navigation.goBack()}>
                <Text style={styles.loginLink}>Đăng nhập</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6', // Light gray background to match image
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
    backgroundColor: '#FEF3C7', // Light orange/yellow background
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
    color: '#22C55E', // Green if met
  },
  registerBtn: {
    backgroundColor: '#D97706', // Orange
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
  registerBtnText: {
    color: '#FFFFFF',
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
    color: '#D97706',
    fontWeight: '700',
  },
});
