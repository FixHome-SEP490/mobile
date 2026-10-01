import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Navigation, Phone } from 'lucide-react-native';
import { useAppTheme } from '../constants/theme';
import { mapsUrl, openExternal, telUrl } from '../utils/external-links';

/** "Gọi khách" / "Chỉ đường" shortcuts. Renders nothing when there is no dialable phone or address. */
export default function ContactActions({ phone, address }: { phone?: string | null; address?: string | null }) {
  const { colors } = useAppTheme();
  const tel = telUrl(phone);
  const maps = mapsUrl(address);
  if (!tel && !maps) return null;
  return (
    <View style={styles.row}>
      {!!tel && (
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: colors.primarySoft }]}
          onPress={() => openExternal(tel, 'Không thể gọi', 'Thiết bị này không thể thực hiện cuộc gọi.')}
          accessibilityRole="button"
          accessibilityLabel="Gọi khách hàng"
        >
          <Phone size={18} color={colors.primaryStrong} strokeWidth={1.75} />
          <Text style={[styles.label, { color: colors.primaryStrong }]}>Gọi khách</Text>
        </TouchableOpacity>
      )}
      {!!maps && (
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: colors.primarySoft }]}
          onPress={() => openExternal(maps, 'Không thể mở bản đồ', 'Không mở được ứng dụng bản đồ trên thiết bị này.')}
          accessibilityRole="button"
          accessibilityLabel="Chỉ đường đến địa chỉ khách hàng"
        >
          <Navigation size={18} color={colors.primaryStrong} strokeWidth={1.75} />
          <Text style={[styles.label, { color: colors.primaryStrong }]}>Chỉ đường</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12 },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 48,
    borderRadius: 14,
  },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
});
