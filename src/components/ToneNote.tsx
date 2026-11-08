import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { iconSize, iconStroke, useAppTheme, type ToneName } from '../constants/theme';

/** Ghi chú ngắn: icon + chữ + tone (không chỉ dựa vào màu, DS §8.4). `alert` để trình đọc màn hình đọc ngay. */
export default function ToneNote({
  tone,
  icon: Icon,
  alert,
  busy,
  children,
}: {
  tone: ToneName;
  icon: LucideIcon;
  alert?: boolean;
  /** Đang xử lý: thay icon bằng vòng quay. */
  busy?: boolean;
  children: React.ReactNode;
}) {
  const { colors } = useAppTheme();
  const t = colors.tone[tone];
  return (
    <View
      accessibilityRole={alert ? 'alert' : undefined}
      accessibilityLiveRegion={alert ? 'polite' : undefined}
      style={[styles.note, { backgroundColor: t.bg }]}
    >
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {busy ? <ActivityIndicator size="small" color={t.fg} /> : <Icon size={iconSize.md} color={t.fg} strokeWidth={iconStroke} />}
      </View>
      <Text style={[styles.text, { color: t.text }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  note: { flexDirection: 'row', gap: 8, padding: 12, borderRadius: 12 },
  text: { flex: 1, fontSize: 14, lineHeight: 20 },
});
