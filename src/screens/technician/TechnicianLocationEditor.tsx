import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { LocateFixed, MapPin } from 'lucide-react-native';
import * as Location from 'expo-location';
import { geoApi, type PlaceSuggestion } from '../../api/geo.api';
import { usersApi, type AddressData } from '../../api/users.api';
import { technicianProfileApi } from '../../api/technician-profile.api';
import MapView, { Marker } from '../../components/AddressMap';
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
  const [locationSuggestions, setLocationSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searchingLocation, setSearchingLocation] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [savingLocation, setSavingLocation] = useState(false);
  const locationSearchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);


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
  useEffect(() => { alive.current = true; void loadTechnicianProfile(); return () => { alive.current = false; if (locationSearchDebounceRef.current) clearTimeout(locationSearchDebounceRef.current); }; }, [loadTechnicianProfile]);
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


  const handleLocationSearchChange = (text: string) => {
    setLocationLine1(text);
    if (locationSearchDebounceRef.current) clearTimeout(locationSearchDebounceRef.current);
    const query = text.trim();
    if (query.length < 3) { setLocationSuggestions([]); return; }
    locationSearchDebounceRef.current = setTimeout(async () => {
      setSearchingLocation(true);
      try {
        setLocationSuggestions(await geoApi.autocomplete(query));
      } catch {
        setLocationSuggestions([]);
      } finally {
        setSearchingLocation(false);
      }
    }, 350);
  };

  const handleSelectLocationSuggestion = (s: PlaceSuggestion) => {
    setLocationSuggestions([]);
    applyLocationPlace(s.lat, s.lng, { formattedAddress: s.description, ward: s.ward, district: s.district, province: s.province });
  };

  const handleMapPressLocation = async (e: any) => {
    const lat = e.nativeEvent.coordinate.latitude;
    const lng = e.nativeEvent.coordinate.longitude;
    setLocationLat(lat);
    setLocationLng(lng);
    try {
      applyLocationPlace(lat, lng, await geoApi.reverse(lat, lng));
    } catch {
      // Keep the pin even if reverse lookup fails.
    }
  };

  const handleGetCurrentLocation = async () => {
    setGettingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Quyền bị từ chối', 'Ứng dụng cần quyền vị trí để lấy vị trí hiện tại.');
        return;
      }
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = location.coords;
      setLocationLat(latitude);
      setLocationLng(longitude);
      try {
        applyLocationPlace(latitude, longitude, await geoApi.reverse(latitude, longitude));
      } catch {
        // Keep the raw coordinates even if reverse lookup fails.
      }
    } catch {
      Alert.alert('Lỗi', 'Không thể lấy vị trí hiện tại.');
    } finally {
      setGettingLocation(false);
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
          <Text style={styles.fieldLabel}>Địa chỉ</Text>
          <TextInput
            value={locationLine1}
            onChangeText={handleLocationSearchChange}
            placeholder="Tìm địa chỉ (số nhà, tên đường…)"
            placeholderTextColor={colors.textSecondary}
            accessibilityLabel="Địa chỉ"
            style={styles.input}
          />
          {searchingLocation && <ActivityIndicator size="small" color={colors.primaryStrong} style={styles.searchSpinner} />}
          {locationSuggestions.length > 0 && (
            <View style={styles.suggestionBox}>
              {locationSuggestions.map((s) => (
                <TouchableOpacity
                  key={s.placeId}
                  style={styles.suggestionItem}
                  onPress={() => handleSelectLocationSuggestion(s)}
                  accessibilityRole="button"
                >
                  <Text style={styles.suggestionText} numberOfLines={2}>{s.description}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {(locationWard || locationProvince) ? (
            <View style={styles.placeRow}>
              <MapPin size={14} color={colors.textSecondary} strokeWidth={1.75} />
              <Text style={styles.placeText}>{[locationWard, locationProvince].filter(Boolean).join(', ')}</Text>
            </View>
          ) : null}

          <View style={styles.mapBox}>
            <MapView
              style={styles.mapFill}
              initialRegion={{
                latitude: locationLat || 10.7769,
                longitude: locationLng || 106.7009,
                latitudeDelta: 0.05,
                longitudeDelta: 0.05,
              }}
              region={locationLat && locationLng ? {
                latitude: locationLat,
                longitude: locationLng,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
              } : undefined}
              onPress={handleMapPressLocation}
            >
              {locationLat != null && locationLng != null && (
                <Marker coordinate={{ latitude: locationLat, longitude: locationLng }} />
              )}
            </MapView>
          </View>

          <TouchableOpacity
            style={styles.locationBtn}
            onPress={handleGetCurrentLocation}
            disabled={gettingLocation}
            accessibilityRole="button"
          >
            {gettingLocation ? (
              <ActivityIndicator size="small" color={colors.primaryStrong} />
            ) : (
              <>
                <LocateFixed size={20} color={colors.primaryStrong} strokeWidth={1.75} />
                <Text style={styles.locationBtnText}>Dùng vị trí hiện tại</Text>
              </>
            )}
          </TouchableOpacity>

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
  input: { width: '100%', minHeight: 48, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.textSecondary, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, fontSize: 16, color: colors.text, marginBottom: 12 },
  locationBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 16, backgroundColor: colors.primarySoft, borderRadius: 14, alignSelf: 'flex-start', marginBottom: 16 },
  locationBtnText: { color: colors.primaryStrong, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  searchSpinner: { marginBottom: 8 },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  placeText: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  mapBox: { width: '100%', height: 200, borderRadius: 14, overflow: 'hidden', marginBottom: 12, borderWidth: 1, borderColor: colors.border },
  mapFill: { width: '100%', height: '100%' },
  suggestionBox: { width: '100%', backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 12, overflow: 'hidden' },
  suggestionItem: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.divider },
  suggestionText: { fontSize: 14, lineHeight: 20, color: colors.text },
  primaryBtn: { minHeight: 48, borderRadius: 14, backgroundColor: colors.primaryStrong, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16 },
  primaryBtnText: { color: colors.surface, fontWeight: '600', fontSize: 16, lineHeight: 24 },
});
