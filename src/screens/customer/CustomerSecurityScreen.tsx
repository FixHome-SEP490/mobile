import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { authApi } from '../../api/auth.api';
import { useAppTheme } from '../../constants/theme';
import { useAuthStore } from '../../store/auth.store';
import type { RootStackParamList } from '../../types';
import { extractApiErrorMessage } from '../../utils/input-validation';
import {
  customerSecuritySession,
  isSameCustomerSecuritySession,
  validateCustomerPasswordReset,
} from './customer-security';

const RESEND_COOLDOWN_SECONDS = 60;

export default function CustomerSecurityScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors, isDark } = useAppTheme();
  const styles = getStyles(colors);
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const sessionGeneration = useAuthStore((state) => state.sessionGeneration);

  const [resetOpen, setResetOpen] = useState(false);
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [requestingOtp, setRequestingOtp] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [loggingOutAll, setLoggingOutAll] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((current) => Math.max(0, current - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  useEffect(() => {
    const snapshot = customerSecuritySession({
      isAuthenticated,
      user,
      sessionGeneration,
    });
    if (!snapshot) {
      navigation.reset({ index: 0, routes: [{ name: 'Auth' }] });
    }
  }, [isAuthenticated, navigation, sessionGeneration, user]);

  const beginSnapshot = () => customerSecuritySession(useAuthStore.getState());
  const snapshotStillCurrent = (
    snapshot: NonNullable<ReturnType<typeof customerSecuritySession>>,
  ) => isSameCustomerSecuritySession(snapshot, useAuthStore.getState());

  const requestPasswordOtp = async () => {
    const snapshot = beginSnapshot();
    const email = user?.email?.trim();
    if (!snapshot || !email) return;

    setError(null);
    setNotice(null);
    setRequestingOtp(true);
    Haptics.selectionAsync();
    try {
      await authApi.forgotPassword(email);
      if (!snapshotStillCurrent(snapshot)) return;
      setResetOpen(true);
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setNotice('Mã OTP đã được gửi đến email tài khoản của bạn.');
    } catch (caught: unknown) {
      if (!snapshotStillCurrent(snapshot)) return;
      setError(extractApiErrorMessage(
        caught,
        'Không thể gửi mã OTP. Vui lòng thử lại sau.',
      ));
    } finally {
      if (snapshotStillCurrent(snapshot)) setRequestingOtp(false);
    }
  };

  const resetPassword = async () => {
    const validation = validateCustomerPasswordReset(
      otp,
      newPassword,
      confirmPassword,
    );
    if (validation) {
      setError(validation);
      return;
    }

    const snapshot = beginSnapshot();
    const email = user?.email?.trim();
    if (!snapshot || !email) return;

    setError(null);
    setNotice(null);
    setResettingPassword(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await authApi.resetPassword(email, otp.trim(), newPassword);
      if (!snapshotStillCurrent(snapshot)) return;

      // Backend reset-password already revokes every refresh-token session.
      // Clear this device immediately so a revoked session is never presented
      // as still signed in.
      await authApi.logout();
      useAuthStore.getState().logout();
      navigation.reset({ index: 0, routes: [{ name: 'Auth' }] });
      Alert.alert(
        'Mật khẩu đã được cập nhật',
        'Tất cả phiên đăng nhập cũ đã hết hiệu lực. Vui lòng đăng nhập lại.',
      );
    } catch (caught: unknown) {
      if (!snapshotStillCurrent(snapshot)) return;
      setError(extractApiErrorMessage(
        caught,
        'Không thể cập nhật mật khẩu. Vui lòng kiểm tra mã OTP và thử lại.',
      ));
      setResettingPassword(false);
    }
  };

  const confirmLogoutAll = () => {
    Alert.alert(
      'Đăng xuất tất cả thiết bị?',
      'Tất cả phiên đăng nhập của tài khoản này sẽ hết hiệu lực, bao gồm thiết bị hiện tại.',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Đăng xuất tất cả',
          style: 'destructive',
          onPress: async () => {
            const snapshot = beginSnapshot();
            if (!snapshot) return;

            setError(null);
            setNotice(null);
            setLoggingOutAll(true);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            try {
              // Empty body is the Backend contract for revoking all sessions.
              await authApi.revokeAllSessions();
              if (!snapshotStillCurrent(snapshot)) return;

              await authApi.logout();
              useAuthStore.getState().logout();
              navigation.reset({ index: 0, routes: [{ name: 'Auth' }] });
            } catch (caught: unknown) {
              if (!snapshotStillCurrent(snapshot)) return;
              setError(extractApiErrorMessage(
                caught,
                'Chưa thể đăng xuất các thiết bị khác. Phiên hiện tại vẫn được giữ.',
              ));
              setLoggingOutAll(false);
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={[styles.container, isDark && styles.containerDark]} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Quay lại"
            onPress={() => navigation.goBack()}
            style={styles.headerButton}
            hitSlop={8}
          >
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={[styles.title, { color: colors.text }]}>Bảo mật tài khoản</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Mật khẩu và phiên đăng nhập
            </Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {!!error && (
            <View style={[styles.messageCard, { borderColor: colors.error }]}>
              <Ionicons name="alert-circle-outline" size={20} color={colors.error} />
              <Text style={[styles.messageText, { color: colors.error }]}>{error}</Text>
            </View>
          )}
          {!!notice && (
            <View style={[styles.messageCard, { borderColor: colors.success }]}>
              <Ionicons name="checkmark-circle-outline" size={20} color={colors.success} />
              <Text style={[styles.messageText, { color: colors.success }]}>{notice}</Text>
            </View>
          )}

          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.cardHeader}>
              <View style={[styles.iconBox, { backgroundColor: colors.primarySoft }]}>
                <Ionicons name="key-outline" size={22} color={colors.primaryStrong} />
              </View>
              <View style={styles.cardHeaderText}>
                <Text style={[styles.cardTitle, { color: colors.text }]}>Mật khẩu</Text>
                <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>
                  Đổi hoặc tạo mật khẩu bằng mã OTP gửi tới email tài khoản.
                </Text>
              </View>
            </View>

            <View style={[styles.emailBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <Ionicons name="mail-outline" size={18} color={colors.textSecondary} />
              <View style={styles.emailTextWrap}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Email tài khoản</Text>
                <Text style={[styles.emailText, { color: colors.text }]} numberOfLines={1}>
                  {user?.email || 'Chưa có email'}
                </Text>
              </View>
            </View>

            {!resetOpen ? (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Gửi mã OTP để đổi mật khẩu"
                disabled={requestingOtp || !user?.email}
                onPress={() => void requestPasswordOtp()}
                style={[
                  styles.primaryButton,
                  { backgroundColor: requestingOtp || !user?.email ? colors.border : colors.primary },
                ]}
              >
                {requestingOtp ? (
                  <ActivityIndicator color={colors.surface} />
                ) : (
                  <Text style={styles.primaryButtonText}>Gửi mã để đổi mật khẩu</Text>
                )}
              </TouchableOpacity>
            ) : (
              <View style={styles.resetForm}>
                <View>
                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Mã OTP</Text>
                  <TextInput
                    accessibilityLabel="Mã OTP đổi mật khẩu"
                    value={otp}
                    onChangeText={(value) => setOtp(value.replace(/[^0-9]/g, ''))}
                    keyboardType="number-pad"
                    maxLength={6}
                    placeholder="6 chữ số"
                    placeholderTextColor={colors.muted}
                    style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                  />
                </View>

                <View>
                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Mật khẩu mới</Text>
                  <View style={[styles.passwordInputWrap, { borderColor: colors.border, backgroundColor: colors.background }]}>
                    <TextInput
                      accessibilityLabel="Mật khẩu mới"
                      value={newPassword}
                      onChangeText={setNewPassword}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      textContentType="newPassword"
                      placeholder="Ít nhất 8 ký tự"
                      placeholderTextColor={colors.muted}
                      style={[styles.passwordInput, { color: colors.text }]}
                    />
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                      onPress={() => setShowPassword((current) => !current)}
                      hitSlop={8}
                    >
                      <Ionicons
                        name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                        size={20}
                        color={colors.textSecondary}
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                <View>
                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Xác nhận mật khẩu</Text>
                  <TextInput
                    accessibilityLabel="Xác nhận mật khẩu mới"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    textContentType="newPassword"
                    placeholder="Nhập lại mật khẩu mới"
                    placeholderTextColor={colors.muted}
                    style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                  />
                </View>

                <Text style={[styles.passwordRule, { color: colors.textSecondary }]}>
                  Cần chữ hoa, chữ thường, số và ký tự đặc biệt; tối đa 72 byte.
                </Text>

                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Xác nhận đổi mật khẩu"
                  disabled={resettingPassword}
                  onPress={() => void resetPassword()}
                  style={[
                    styles.primaryButton,
                    { backgroundColor: resettingPassword ? colors.border : colors.primary },
                  ]}
                >
                  {resettingPassword ? (
                    <ActivityIndicator color={colors.surface} />
                  ) : (
                    <Text style={styles.primaryButtonText}>Cập nhật mật khẩu</Text>
                  )}
                </TouchableOpacity>

                <View style={styles.secondaryActions}>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Hủy đổi mật khẩu"
                    onPress={() => {
                      setResetOpen(false);
                      setOtp('');
                      setNewPassword('');
                      setConfirmPassword('');
                      setError(null);
                      setNotice(null);
                    }}
                  >
                    <Text style={[styles.secondaryLink, { color: colors.textSecondary }]}>Hủy</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Gửi lại mã OTP"
                    disabled={requestingOtp || cooldown > 0}
                    onPress={() => void requestPasswordOtp()}
                  >
                    <Text style={[styles.secondaryLink, { color: cooldown > 0 ? colors.muted : colors.primaryStrong }]}>
                      {requestingOtp ? 'Đang gửi…' : cooldown > 0 ? `Gửi lại sau ${cooldown}s` : 'Gửi lại OTP'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>

          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.cardHeader}>
              <View style={[styles.iconBox, { backgroundColor: colors.primarySoft }]}>
                <Ionicons name="phone-portrait-outline" size={22} color={colors.primaryStrong} />
              </View>
              <View style={styles.cardHeaderText}>
                <Text style={[styles.cardTitle, { color: colors.text }]}>Phiên đăng nhập</Text>
                <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>
                  Khi nghi ngờ tài khoản bị truy cập trái phép, bạn có thể kết thúc tất cả phiên đăng nhập.
                </Text>
              </View>
            </View>

            <View style={[styles.infoNote, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <Ionicons name="information-circle-outline" size={19} color={colors.textSecondary} />
              <Text style={[styles.infoText, { color: colors.textSecondary }]}>
                Hệ thống hiện hỗ trợ kết thúc phiên, chưa cung cấp danh sách chi tiết từng thiết bị.
              </Text>
            </View>

            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Đăng xuất tất cả thiết bị"
              disabled={loggingOutAll}
              onPress={confirmLogoutAll}
              style={[styles.dangerButton, { borderColor: colors.error }]}
            >
              {loggingOutAll ? (
                <ActivityIndicator color={colors.error} />
              ) : (
                <>
                  <Ionicons name="log-out-outline" size={18} color={colors.error} />
                  <Text style={[styles.dangerButtonText, { color: colors.error }]}>
                    Đăng xuất tất cả thiết bị
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const getStyles = (colors: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  containerDark: { backgroundColor: colors.background },
  flex: { flex: 1 },
  header: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    backgroundColor: colors.surface,
  },
  headerButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1, paddingRight: 42 },
  title: { fontSize: 20, lineHeight: 27, fontWeight: '800' },
  subtitle: { fontSize: 12, lineHeight: 17, marginTop: 1 },
  content: { padding: 16, paddingBottom: 40, gap: 14 },
  messageCard: {
    minHeight: 46,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
  },
  messageText: { flex: 1, fontSize: 12, lineHeight: 18, fontWeight: '600' },
  card: { borderWidth: 1, borderRadius: 18, padding: 16, gap: 16 },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  iconBox: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  cardHeaderText: { flex: 1, gap: 3 },
  cardTitle: { fontSize: 16, lineHeight: 22, fontWeight: '800' },
  cardDescription: { fontSize: 12, lineHeight: 18 },
  emailBox: { minHeight: 58, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  emailTextWrap: { flex: 1 },
  fieldLabel: { fontSize: 11, lineHeight: 16, fontWeight: '700', marginBottom: 5 },
  emailText: { fontSize: 14, lineHeight: 19, fontWeight: '700' },
  primaryButton: { minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 14, lineHeight: 19, fontWeight: '800' },
  resetForm: { gap: 14 },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, fontSize: 14 },
  passwordInputWrap: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 8 },
  passwordInput: { flex: 1, fontSize: 14, minHeight: 46 },
  passwordRule: { fontSize: 11, lineHeight: 17, marginTop: -4 },
  secondaryActions: { minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  secondaryLink: { fontSize: 12, lineHeight: 17, fontWeight: '700' },
  infoNote: { borderWidth: 1, borderRadius: 13, padding: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  infoText: { flex: 1, fontSize: 12, lineHeight: 18 },
  dangerButton: { minHeight: 48, borderWidth: 1, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  dangerButtonText: { fontSize: 14, lineHeight: 19, fontWeight: '800' },
});
