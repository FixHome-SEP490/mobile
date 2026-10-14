import React, { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuthStore } from '../../../store/auth.store';
import { SafeAreaView } from 'react-native-safe-area-context';
import { lightTheme as colors, spacing } from '../../../constants/theme';

/** Development-only entry for real IDs; the destination hooks still verify ownership. */
export default function M7AftercareDevPreviewScreen() {
  const navigation = useNavigation<any>(); const role = useAuthStore(state => state.user?.role);
  const [bookingId, setBookingId] = useState(''); const [claimId, setClaimId] = useState('');
  if (!__DEV__ || !role || !['customer', 'technician'].includes(String(role))) return <SafeAreaView style={styles.page}><Text style={styles.title}>Bản xem trước không khả dụng</Text></SafeAreaView>;
  return <SafeAreaView edges={['top', 'left', 'right']} style={styles.page}>
    <View style={styles.header}><Text accessibilityRole="header" style={styles.title}>Bản xem trước hậu mãi</Text><Text style={styles.help}>Chỉ nhập mã booking hoặc yêu cầu bảo hành đã có. Màn đích vẫn xác minh quyền qua dữ liệu thật.</Text></View>
    {role === 'customer' ? <>
      <TextInput accessibilityLabel="Mã yêu cầu đặt lịch hiện có" value={bookingId} onChangeText={setBookingId} autoCapitalize="none" style={styles.input} placeholder="Mã yêu cầu đặt lịch hiện có" />
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: !bookingId.trim() }} disabled={!bookingId.trim()} onPress={() => navigation.navigate('BookingAftercareDevPreview', { bookingId: bookingId.trim() })} style={styles.button}><Text style={styles.buttonText}>Mở hỗ trợ đặt lịch</Text></Pressable>
    </> : <>
      <TextInput accessibilityLabel="Mã yêu cầu bảo hành hiện có (không bắt buộc)" value={claimId} onChangeText={setClaimId} autoCapitalize="none" style={styles.input} placeholder="Mã yêu cầu bảo hành (để trống mở hộp thư)" />
      <Pressable accessibilityRole="button" onPress={() => navigation.navigate('TechnicianWarrantyDevPreview', { ...(claimId.trim() ? { claimId: claimId.trim() } : {}) })} style={styles.button}><Text style={styles.buttonText}>{claimId.trim() ? 'Mở chi tiết yêu cầu' : 'Mở hộp thư bảo hành'}</Text></Pressable>
    </>}
    <Text style={styles.help}>Bản xem trước không cung cấp dữ liệu giả và không bỏ qua xác minh quyền.</Text>
  </SafeAreaView>;
}

const styles = {
  page: { flex: 1, backgroundColor: colors.background, padding: spacing.md, gap: spacing.md },
  header: { gap: 8 }, title: { color: colors.text, fontSize: 20, fontWeight: '700' as const },
  help: { color: colors.textSecondary, fontSize: 14, lineHeight: 21 },
  input: { minHeight: 52, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: spacing.md, color: colors.text, backgroundColor: colors.surface },
  button: { minHeight: 52, borderRadius: 12, backgroundColor: colors.primaryStrong, justifyContent: 'center' as const, alignItems: 'center' as const, paddingHorizontal: spacing.md },
  buttonText: { color: colors.surface, fontSize: 16, fontWeight: '700' as const },
};
