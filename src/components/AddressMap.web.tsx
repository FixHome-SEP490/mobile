import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

interface AddressMapWebProps {
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

/**
 * Web-only (Chrome) placeholder resolved by Metro `.web` extension.
 * Interactive map selection is unavailable on web: no coordinates are
 * fabricated, no press is handled, and no marker is rendered. Native
 * camera/GPS behavior lives in `AddressMap.tsx` and is untouched.
 */
export default function AddressMapWeb({ style, children }: AddressMapWebProps) {
  void children;
  return (
    <View style={[styles.placeholder, style]}>
      <Text style={styles.title}>Bản đồ chưa khả dụng trên trình duyệt</Text>
      <Text style={styles.body}>
        Vui lòng nhập địa chỉ chi tiết hoặc dùng ứng dụng di động để chọn vị trí trên bản đồ.
      </Text>
    </View>
  );
}

/** Web marker renders nothing; the map never fabricates coordinates. */
export function Marker() {
  return null;
}

const styles = StyleSheet.create({
  placeholder: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    padding: 16,
    backgroundColor: '#F1F5F9',
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'center',
  },
  body: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 17,
  },
});
