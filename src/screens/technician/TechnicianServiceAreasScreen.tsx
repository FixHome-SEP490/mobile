import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useAppTheme } from '../../constants/theme';
import { geoApi, type Province } from '../../api/geo.api';
import { technicianProfileApi } from '../../api/technician-profile.api';
import { areasChanged, initialProvince, keysToServiceAreas, serviceAreasToKeys, toAreaKey } from './technician-service-areas';

/** The technician edits the districts they serve after onboarding (same picker as onboarding). */
export default function TechnicianServiceAreasScreen() {
  const { colors } = useAppTheme();
  const styles = getStyles(colors);
  const navigation = useNavigation();
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [saved, setSaved] = useState<{ provinceCode: string; districtCode: string }[]>([]);
  const [keys, setKeys] = useState<string[]>([]);
  const [province, setProvince] = useState(79);
  const [query, setQuery] = useState('');
  const [picking, setPicking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useFocusEffect(useCallback(() => {
    let alive = true;
    setLoading(true);
    setError('');
    Promise.all([geoApi.getProvinces(), technicianProfileApi.getMyServiceAreas()])
      .then(([list, areas]) => {
        if (!alive) return;
        const current = serviceAreasToKeys(areas);
        setProvinces(list);
        setSaved(areas);
        setKeys(current);
        setProvince(initialProvince(current));
      })
      .catch(() => alive && setError('Chưa tải được khu vực. Kéo xuống hoặc mở lại để thử lại.'))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []));

  const active = provinces.find((p) => p.code === province);
  const districts = active?.districts ?? [];
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (q ? provinces.filter((p) => p.name.toLowerCase().includes(q)) : provinces).slice(0, 12);
  }, [provinces, query]);
  const allSelected = districts.length > 0 && districts.every((d) => keys.includes(toAreaKey(province, d.code)));

  const toggle = (districtCode: number) => {
    const key = toAreaKey(province, districtCode);
    setKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };
  const toggleAll = () => {
    const all = districts.map((d) => toAreaKey(province, d.code));
    setKeys((prev) => (allSelected ? prev.filter((k) => !all.includes(k)) : [...prev, ...all.filter((k) => !prev.includes(k))]));
  };

  const save = async () => {
    if (keys.length === 0) {
      Alert.alert('Chưa chọn khu vực', 'Chọn ít nhất một quận/huyện bạn có thể phục vụ.');
      return;
    }
    setSaving(true);
    try {
      const areas = keysToServiceAreas(keys);
      await technicianProfileApi.updateMyServiceAreas(areas);
      setSaved(areas);
      Alert.alert('Đã lưu', `Bạn đang phục vụ ${keys.length} khu vực.`);
    } catch {
      Alert.alert('Chưa lưu được', 'Kiểm tra kết nối rồi thử lại.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Quay lại">
          <ChevronLeft size={26} color={colors.text} strokeWidth={1.75} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} accessibilityRole="header">Khu vực phục vụ</Text>
        <View style={styles.iconBtn} />
      </View>
      {loading ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {!!error && <Text style={styles.error}>{error}</Text>}
          <Text style={styles.label}>Tỉnh/thành phố</Text>
          <TouchableOpacity style={styles.select} onPress={() => setPicking((v) => !v)} accessibilityRole="button" testID="areas-province">
            <Text style={styles.selectText}>{active?.name ?? 'Chọn tỉnh/thành phố'}</Text>
          </TouchableOpacity>
          {picking && (
            <View style={styles.picker}>
              <TextInput style={styles.input} value={query} onChangeText={setQuery} placeholder="Tìm tỉnh/thành phố" placeholderTextColor={colors.muted} />
              {matches.map((p) => (
                <TouchableOpacity key={p.code} style={styles.option} onPress={() => { setProvince(p.code); setPicking(false); setQuery(''); }} accessibilityRole="button">
                  <Text style={styles.selectText}>{p.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          <View style={styles.rowBetween}>
            <Text style={styles.label}>Quận/huyện có thể phục vụ</Text>
            {districts.length > 0 && (
              <TouchableOpacity onPress={toggleAll} accessibilityRole="button">
                <Text style={styles.link}>{allSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}</Text>
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.chips}>
            {districts.map((d) => {
              const on = keys.includes(toAreaKey(province, d.code));
              return (
                <TouchableOpacity key={d.code} style={[styles.chip, on && styles.chipOn]} onPress={() => toggle(d.code)} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{d.name}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={styles.hint}>Đã chọn {keys.length} khu vực.</Text>
          <TouchableOpacity
            testID="areas-save"
            style={[styles.saveBtn, (!areasChanged(saved, keys) || saving) && styles.saveBtnOff]}
            disabled={!areasChanged(saved, keys) || saving}
            onPress={save}
            accessibilityRole="button"
          >
            <Text style={styles.saveText}>{saving ? 'Đang lưu…' : 'Lưu khu vực'}</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const getStyles = (colors: ReturnType<typeof useAppTheme>['colors']) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: 4, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.divider },
  iconBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 20, lineHeight: 28, fontWeight: '600', color: colors.text },
  loader: { marginTop: 32 },
  content: { padding: 16, gap: 10 },
  error: { color: colors.textSecondary, fontSize: 14 },
  label: { fontSize: 14, fontWeight: '600', color: colors.text },
  select: { minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, justifyContent: 'center', backgroundColor: colors.surface },
  selectText: { fontSize: 15, color: colors.text },
  picker: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.surface, padding: 8, gap: 4 },
  input: { minHeight: 40, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 10, color: colors.text },
  option: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 4 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  link: { color: colors.primaryStrong, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipOn: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  chipText: { fontSize: 13, color: colors.text },
  chipTextOn: { color: colors.primaryStrong, fontWeight: '600' },
  hint: { fontSize: 13, color: colors.textSecondary },
  saveBtn: { marginTop: 8, minHeight: 48, borderRadius: 12, backgroundColor: colors.primaryStrong, alignItems: 'center', justifyContent: 'center' },
  saveBtnOff: { opacity: 0.45 },
  saveText: { color: colors.surface, fontSize: 16, fontWeight: '600' },
});
