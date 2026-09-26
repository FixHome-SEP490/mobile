// src/components/GoogleSignInButton.tsx
//
// Nút "Đăng nhập với Google", dùng chung cho màn đăng nhập và đăng ký.
//
// Khác bản web ở chỗ web để chính Google vẽ nút, còn ở đây không có thư viện
// nào vẽ hộ nên ta tự dựng theo đúng quy định thương hiệu của Google: nền
// trắng, viền xám, chữ "Sign in with Google" hoặc bản dịch, logo nhiều màu bên
// trái. Logo vẽ bằng bốn mảnh màu thay vì nhúng ảnh, để không phải kèm thêm
// tệp tài nguyên nào.
import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAppTheme } from '../constants/theme';

interface Props {
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  label?: string;
}

/**
 * Chữ G bốn màu của Google, dựng bằng View lồng nhau.
 *
 * Không phải bản vẽ chuẩn từng nét, nhưng giữ đúng bốn màu thương hiệu và đọc
 * ra ngay là Google ở kích thước nút thật.
 */
function GoogleMark() {
  return (
    <View style={markStyles.frame}>
      <View style={[markStyles.quarter, markStyles.topLeft]} />
      <View style={[markStyles.quarter, markStyles.topRight]} />
      <View style={[markStyles.quarter, markStyles.bottomLeft]} />
      <View style={[markStyles.quarter, markStyles.bottomRight]} />
      <View style={markStyles.hole} />
      <View style={markStyles.bar} />
    </View>
  );
}

export default function GoogleSignInButton({
  onPress,
  loading = false,
  disabled = false,
  label = 'Đăng nhập với Google',
}: Props) {
  const { colors } = useAppTheme();
  const isBlocked = loading || disabled;

  return (
    <TouchableOpacity
      style={[
        styles.button,
        { borderColor: colors.border },
        isBlocked && styles.blocked,
      ]}
      onPress={onPress}
      disabled={isBlocked}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isBlocked, busy: loading }}
    >
      {loading ? (
        <ActivityIndicator size="small" color="#3C4043" />
      ) : (
        <>
          <GoogleMark />
          <Text style={styles.label}>{label}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

// Nút Google luôn nền trắng chữ xám đậm kể cả ở chế độ tối, vì đó là yêu cầu
// nhận diện thương hiệu chứ không phải lựa chọn thẩm mỹ.
const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: '#FFFFFF',
  },
  blocked: { opacity: 0.6 },
  label: {
    color: '#3C4043',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});

const markStyles = StyleSheet.create({
  frame: {
    width: 20,
    height: 20,
    borderRadius: 10,
    overflow: 'hidden',
  },
  quarter: { position: 'absolute', width: 10, height: 10 },
  topLeft: { top: 0, left: 0, backgroundColor: '#EA4335' },
  topRight: { top: 0, right: 0, backgroundColor: '#FBBC05' },
  bottomLeft: { bottom: 0, left: 0, backgroundColor: '#34A853' },
  bottomRight: { bottom: 0, right: 0, backgroundColor: '#4285F4' },
  hole: {
    position: 'absolute',
    top: 5,
    left: 5,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FFFFFF',
  },
  bar: {
    position: 'absolute',
    top: 8,
    right: 0,
    width: 10,
    height: 4,
    backgroundColor: '#4285F4',
  },
});
