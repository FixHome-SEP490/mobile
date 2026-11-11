import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { usersApi, type AddressData } from '../../api/users.api';
import { technicianProfileApi } from '../../api/technician-profile.api';
import TechnicianAddressPicker from './TechnicianAddressPicker';
import { useAppTheme } from '../../constants/theme';
import { extractApiErrorMessage } from '../../utils/input-validation';

export default function TechnicianLocationEditor() {
  const { colors } = useAppTheme();
  const styles = getStyles(colors);
  const [technicianAddress, setTechnicianAddress] = useState<AddressData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const alive = useRef(true);
  const saveLock = useRef(false);
  // Location & radius
  const [locationLine1, setLocationLine1] = useState('');
  const [locationWard, setLocationWard] = useState('');
  const [locationDistrict, setLocationDistrict] = useState('');
  const [locationProvince, setLocationProvince] = useState('');
  const [locationLat, setLocationLat] = useState<number | undefined>(undefined);
  const [locationLng, setLocationLng] = useState<number | undefined>(undefined);
  const [locationRadiusKm, setLocationRadiusKm] = useState('');
  const [savingLocation, setSavingLocation] = useState(false);


  const loadTechnicianProfile = useCallback(async () => {
    try {
      const [profile, addresses] = await Promise.all([technicianProfileApi.getMyProfile(), usersApi.getAddresses()]);
      if (!alive.current) return;
      const address = addresses.find(item => item.isDefault) ?? addresses[0] ?? null;
      setTechnicianAddress(address);
      setLocationLine1(address?.line1 ?? ''); setLocationWard(address?.ward ?? '');
      setLocationDistrict(address?.district ?? ''); setLocationProvince(address?.province ?? '');
      setLocationLat(address?.lat); setLocationLng(address?.lng);
      setLocationRadiusKm(profile.serviceRadiusKm != null ? String(profile.serviceRadiusKm) : '');
      setLoadError(false);
    } catch { if (alive.current) setLoadError(true); }
    finally { if (alive.current) setLoading(false); }
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- load existing saved location on mount
  useEffect(() => { alive.current = true; void loadTechnicianProfile(); return () => { alive.current = false; }; }, [loadTechnicianProfile]);
  // ---- Location & radius sheet ----
  const applyLocationPlace = (
    lat: number,
    lng: number,
    place?: { formattedAddress?: string; ward?: string; district?: string; province?: string },
  ) => {
    setLocationLat(lat);
    setLocationLng(lng);
    if (place) {
      setLocationLine1(place.formattedAddress || locationLine1);
      setLocationWard(place.ward || '');
      setLocationDistrict(place.district || locationDistrict);
      setLocationProvince(place.province || locationProvince);
    }
  };


  const handleSaveLocation = async () => {
    if (saveLock.current || loading || loadError) return;
    if (!locationLine1.trim() || locationLat == null || locationLng == null) {
      Alert.alert('Lỗi', 'Vui lòng tìm hoặc chọn vị trí trên bản đồ trước khi lưu.');
      return;
    }
    const radiusText = locationRadiusKm.trim().replace(',', '.');
    const radiusKm = Number(radiusText);
    if (!radiusText || !Number.isFinite(radiusKm) || radiusKm < 1 || radiusKm > 40) {
      Alert.alert('Lỗi', 'Bán kính hoạt động từ 1 đến 40 km.');
      return;
    }
    saveLock.current = true;
    setSavingLocation(true);
    try {
      const addressDto = {
        label: 'Vị trí làm việc',
        line1: locationLine1.trim(),
        ward: locationWard || '',
        district: locationDistrict || locationWard || locationProvince,
        province: locationProvince,
        lat: locationLat,
        lng: locationLng,
        isDefault: true,
      };
      await (technicianAddress
        ? usersApi.updateAddress(technicianAddress.id, addressDto)
        : usersApi.createAddress(addressDto));
      await technicianProfileApi.updateMyProfile({
        serviceRadiusKm: radiusKm,
      });
      await loadTechnicianProfile();
      Alert.alert('Đã lưu', 'Vị trí và bán kính hoạt động đã được cập nhật.');
    } catch (err: unknown) {
      Alert.alert('Lỗi', extractApiErrorMessage(err, 'Không thể lưu vị trí.'));
    } finally {
      saveLock.current = false;
      if (alive.current) setSavingLocation(false);
    }
  };


  if (loading) return <ActivityIndicator color={colors.primaryStrong} />;
  if (loadError) return <View><Text style={{ color: colors.textSecondary }}>Chưa tải được vị trí và bán kính.</Text><TouchableOpacity style={styles.locationBtn} accessibilityRole="button" onPress={() => { setLoading(true); void loadTechnicianProfile(); }}><Text style={styles.locationBtnText}>Thử lại</Text></TouchableOpacity></View>;
  return <View>
    <Text style={styles.modalTitle} accessibilityRole="header">Vị trí và bán kính hoạt động</Text>
          <TechnicianAddressPicker
            line1={locationLine1}
            lat={locationLat}
            lng={locationLng}
            ward={locationWard}
            province={locationProvince}
            onTextChange={setLocationLine1}
            onPlace={applyLocationPlace}
          />

          <Text style={styles.fieldLabel}>Bán kính hoạt động (km)</Text>
          <TextInput
            value={locationRadiusKm}
            onChangeText={setLocationRadiusKm}
            keyboardType="numeric"
            accessibilityLabel="Bán kính hoạt động (km)"
            style={styles.input}
          />


    <Text style={{ color: colors.textSecondary, marginBottom: 12 }}>Bán kính từ 1 đến 40 km; khu vực phục vụ được chọn riêng bên dưới.</Text>
    <TouchableOpacity style={styles.primaryBtn} accessibilityRole="button" accessibilityLabel="Lưu vị trí và bán kính" disabled={savingLocation} onPress={() => void handleSaveLocation()}>{savingLocation ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.primaryBtnText}>Lưu vị trí và bán kính</Text>}</TouchableOpacity>
  </View>;
}
const getStyles = (colors: ReturnType<typeof useAppTheme>['colors']) => StyleSheet.create({
  modalTitle: { fontSize: 20, lineHeight: 28, fontWeight: '600', color: colors.text, marginBottom: 16 },
  fieldLabel: { fontSize: 14, lineHeight: 20, color: colors.text, marginBottom: 6, fontWeight: '500' },
  input: { width: '100%', minHeight: 48, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.textSecondary, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: colors.text, marginBottom: 12 },
  locationBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 16, backgroundColor: colors.primarySoft, borderRadius: 14, alignSelf: 'flex-start', marginBottom: 16 },
  locationBtnText: { color: colors.primaryStrong, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  searchSpinner: { marginBottom: 8 },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  placeText: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  mapBox: { width: '100%', height: 200, borderRadius: 14, overflow: 'hidden', marginBottom: 12, borderWidth: 1, borderColor: colors.border },
  mapFill: { width: '100%', height: '100%' },
  suggestionBox: { width: '100%', backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 12, overflow: 'hidden' },
  suggestionItem: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.divider },
  suggestionText: { fontSize: 14, lineHeight: 20, color: colors.text },
  primaryBtn: { minHeight: 48, borderRadius: 14, backgroundColor: colors.primaryStrong, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16 },
  primaryBtnText: { color: colors.surface, fontWeight: '600', fontSize: 16, lineHeight: 24 },
});
