// src/components/account/ContactVerificationCard.tsx
// Verify the account email and phone number from the profile. A code is sent
// (email, or SMS to the saved phone number) and typed back here; the backend
// then flags the contact as verified. Changing the phone number resets its flag.
import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { authApi } from '../../api/auth.api';
import { useAppTheme } from '../../constants/theme';
import { useAuthStore } from '../../store/auth.store';
import { extractApiErrorMessage } from '../../utils/input-validation';

type Kind = 'email' | 'phone';

export default function ContactVerificationCard() {
  const { colors } = useAppTheme();
  const styles = getStyles(colors);
  const user = useAuthStore((state) => state.user);

  const [active, setActive] = useState<Kind | null>(null);
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const rows: { kind: Kind; label: string; icon: 'mail-outline' | 'call-outline'; value: string; verified: boolean }[] = [
    { kind: 'email', label: 'Email', icon: 'mail-outline', value: user?.email ?? '', verified: !!user?.isEmailVerified },
    { kind: 'phone', label: 'Số điện thoại', icon: 'call-outline', value: user?.phoneNumber ?? '', verified: !!user?.isPhoneVerified },
  ];

  const send = async (kind: Kind) => {
    if (busy) return;
    Haptics.selectionAsync();
    setBusy(true);
    setError(null);
    try {
      await authApi.sendVerification(kind);
      setActive(kind);
      setOtp('');
      setNotice(kind === 'email' ? 'Đã gửi mã tới email của bạn.' : 'Đã gửi mã qua SMS tới số điện thoại của bạn.');
    } catch (caught: unknown) {
      setError(extractApiErrorMessage(caught, 'Chưa gửi được mã xác thực, thử lại sau.'));
    } finally {
      setBusy(false);
    }
  };

  const cancel = () => {
    setActive(null);
    setOtp('');
    setError(null);
    setNotice(null);
  };

  const confirm = async () => {
    if (busy || !active) return;
    if (!/^[0-9]{6}$/.test(otp.trim())) {
      setError('Mã xác thực gồm 6 chữ số.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const flags = await authApi.confirmVerification(active, otp.trim());
      // Update only the flags: /me returns the role in another casing than the app keeps.
      const { token, user: current, setAuth } = useAuthStore.getState();
      if (token && current) setAuth(token, { ...current, ...flags });
      cancel();
    } catch (caught: unknown) {
      setError(extractApiErrorMessage(caught, 'Mã xác thực không đúng hoặc đã hết hạn.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.card} testID="contact-verification-card">
      <Text style={styles.title} accessibilityRole="header">Xác thực liên hệ</Text>

      {rows.map((row, index) => (
        <View key={row.kind} style={[styles.row, index > 0 && styles.rowBorder]}>
          <View style={styles.rowTop}>
            <Ionicons name={row.icon} size={18} color={colors.textSecondary} />
            <View style={styles.rowText}>
              <Text style={styles.label}>{row.label}</Text>
              <Text style={styles.value} numberOfLines={1}>{row.value || 'Chưa cập nhật'}</Text>
            </View>
            {row.verified ? (
              <Text style={styles.verified}>Đã xác thực</Text>
            ) : row.value && active !== row.kind ? (
              <TouchableOpacity
                style={styles.verifyBtn}
                onPress={() => void send(row.kind)}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={`Xác thực ${row.label.toLowerCase()}`}
                accessibilityState={{ disabled: busy }}
              >
                {busy ? <ActivityIndicator size="small" color={colors.primaryStrong} /> : <Text style={styles.verifyBtnText}>Xác thực</Text>}
              </TouchableOpacity>
            ) : null}
          </View>

          {active === row.kind && (
            <View style={styles.form}>
              {!!notice && <Text style={styles.notice}>{notice}</Text>}
              <TextInput
                accessibilityLabel="Mã xác thực gồm 6 số"
                style={styles.input}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                maxLength={6}
                value={otp}
                onChangeText={(text) => setOtp(text.replace(/[^0-9]/g, ''))}
                placeholder="Nhập 6 chữ số"
                placeholderTextColor={colors.textSecondary}
                editable={!busy}
              />
              <View style={styles.actions}>
                <TouchableOpacity style={styles.confirmBtn} onPress={() => void confirm()} disabled={busy} accessibilityRole="button" accessibilityLabel="Xác nhận mã" accessibilityState={{ disabled: busy }}>
                  <Text style={styles.confirmBtnText}>Xác nhận</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.linkBtn} onPress={() => void send(row.kind)} disabled={busy} accessibilityRole="button" accessibilityLabel="Gửi lại mã">
                  <Text style={styles.linkText}>Gửi lại mã</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.linkBtn} onPress={cancel} disabled={busy} accessibilityRole="button" accessibilityLabel="Hủy">
                  <Text style={styles.linkText}>Hủy</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      ))}

      {!!error && (
        <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="polite">{error}</Text>
      )}
    </View>
  );
}

const getStyles = (colors: any) => StyleSheet.create({
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 18, padding: 16, gap: 4 },
  title: { fontSize: 16, lineHeight: 22, fontWeight: '800', color: colors.text, marginBottom: 8 },
  row: { paddingVertical: 10, gap: 10 },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowText: { flex: 1 },
  label: { fontSize: 12, lineHeight: 16, color: colors.textSecondary, fontWeight: '600' },
  value: { fontSize: 14, lineHeight: 19, color: colors.text, fontWeight: '700' },
  verified: { fontSize: 12, fontWeight: '700', color: colors.success },
  verifyBtn: { minHeight: 44, minWidth: 80, borderRadius: 12, borderWidth: 1, borderColor: colors.primaryStrong, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  verifyBtnText: { fontSize: 13, fontWeight: '700', color: colors.primaryStrong },
  form: { gap: 10 },
  notice: { fontSize: 12, lineHeight: 18, color: colors.primaryStrong, fontWeight: '600' },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, fontSize: 16, color: colors.text, backgroundColor: colors.background },
  actions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  confirmBtn: { minHeight: 44, borderRadius: 12, backgroundColor: colors.primaryStrong, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  confirmBtnText: { color: colors.surface, fontSize: 14, fontWeight: '700' },
  linkBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  linkText: { fontSize: 13, fontWeight: '600', color: colors.primaryStrong },
  error: { fontSize: 12, lineHeight: 18, color: colors.error, fontWeight: '600', marginTop: 4 },
});
