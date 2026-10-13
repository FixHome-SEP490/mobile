import React, { useState } from 'react';
import { FlatList, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppTheme } from '../../constants/theme';
import administrativeAreas from './customer-administrative-areas.json';

export interface CustomerAddressArea {
  ward: string;
  district: string;
  province: string;
  provinceCode?: string;
  districtCode?: string;
}

// Snapshot of Backend shared/data/vietnam-administrative-units.json.
// Since July 2025, the legacy district DTO fields carry ward/commune names/codes.
export const customerAdministrativeAreas = administrativeAreas;

export default function CustomerAdministrativeAreaPicker({ value, disabled, onChange, onOpen }: {
  value: CustomerAddressArea;
  disabled: boolean;
  onChange: (area: CustomerAddressArea) => void;
  onOpen?: () => void;
}) {
  const { colors } = useAppTheme();
  const [kind, setKind] = useState<'province' | 'district' | null>(null);
  const [query, setQuery] = useState('');
  const province = administrativeAreas.find(item => item.code === value.provinceCode);
  const options = kind === 'province' ? administrativeAreas : province?.districts ?? [];
  const open = (next: 'province' | 'district') => {
    if (disabled) return;
    onOpen?.();
    setQuery('');
    setKind(next === 'district' && !province ? 'province' : next);
  };
  return <View style={styles.fields}>
    <TouchableOpacity style={[styles.field, { borderColor: colors.border }]} accessibilityRole="button" accessibilityLabel="Chọn tỉnh/thành" disabled={disabled} onPress={() => open('province')}><Text style={{ color: colors.text }}>{value.province || 'Chọn tỉnh/thành (bắt buộc)'}</Text></TouchableOpacity>
    <TouchableOpacity style={[styles.field, { borderColor: colors.border }]} accessibilityRole="button" accessibilityLabel="Chọn phường/xã" disabled={disabled} onPress={() => open('district')}><Text style={{ color: colors.text }}>{value.district || 'Chọn phường/xã (bắt buộc)'}</Text></TouchableOpacity>
    {(!value.province.trim() || !value.district.trim()) && <Text accessibilityRole="alert" style={{ color: colors.textSecondary }}>Chọn tỉnh/thành và phường/xã để lưu vị trí này.</Text>}
    <Modal visible={kind !== null && !disabled} animationType="slide" onRequestClose={() => setKind(null)}>
      <SafeAreaView style={[styles.modal, { backgroundColor: colors.background }]}>
        <Text accessibilityRole="header" style={[styles.heading, { color: colors.text }]}>{kind === 'province' ? 'Chọn tỉnh/thành' : 'Chọn phường/xã'}</Text>
        <TouchableOpacity style={styles.option} accessibilityRole="button" accessibilityLabel="Đóng chọn khu vực" onPress={() => setKind(null)}><Text style={{ color: colors.primary }}>Đóng</Text></TouchableOpacity>
        <TextInput style={[styles.field, { borderColor: colors.border, color: colors.text }]} accessibilityLabel="Tìm khu vực" value={query} onChangeText={setQuery} placeholder="Tìm theo tên" placeholderTextColor={colors.textSecondary} />
        <FlatList keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets data={options.filter(item => item.name.toLocaleLowerCase('vi').includes(query.trim().toLocaleLowerCase('vi')))} keyExtractor={item => item.code} renderItem={({ item }) => <TouchableOpacity style={styles.option} accessibilityRole="button" accessibilityLabel={`Chọn khu vực: ${item.name}`} onPress={() => {
          if (disabled) return;
          onChange(kind === 'province'
            ? { province: item.name, provinceCode: item.code, ward: '', district: '' }
            : { ...value, ward: item.name, district: item.name, districtCode: item.code });
          setKind(null);
        }}><Text style={{ color: colors.text }}>{item.name}</Text></TouchableOpacity>} ListEmptyComponent={<Text style={{ color: colors.textSecondary }}>Không tìm thấy khu vực. Thử tên khác.</Text>} />
      </SafeAreaView>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  fields: { alignSelf: 'stretch', gap: 10 },
  field: { minHeight: 50, borderWidth: 1, borderRadius: 12, padding: 12, justifyContent: 'center' },
  modal: { flex: 1, padding: 16, gap: 10 },
  heading: { fontSize: 20, lineHeight: 28, fontWeight: '700' },
  option: { minHeight: 48, paddingVertical: 12, paddingHorizontal: 8, justifyContent: 'center' },
});
