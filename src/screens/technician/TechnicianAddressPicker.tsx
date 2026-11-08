import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { LocateFixed, MapPin } from 'lucide-react-native';
import * as Location from 'expo-location';
import { geoApi, type PlaceSuggestion } from '../../api/geo.api';
import MapView, { Marker } from '../../components/AddressMap';
import { useAppTheme } from '../../constants/theme';

export type PickedPlace = { formattedAddress?: string; ward?: string; district?: string; province?: string };

/**
 * Chọn địa chỉ làm việc: gõ để tìm (gợi ý), chạm bản đồ, hoặc dùng vị trí hiện tại. Dùng chung cho Hồ sơ
 * và bước 4 đăng ký. Không giữ dữ liệu: màn cha nhận `onTextChange` khi gõ và `onPlace` khi có toạ độ mới
 * (`place` rỗng nghĩa là chỉ có ghim, chưa tra được địa chỉ).
 */
export default function TechnicianAddressPicker({
  label = 'Địa chỉ',
  line1,
  lat,
  lng,
  ward,
  province,
  onTextChange,
  onPlace,
}: {
  label?: string;
  line1: string;
  lat?: number;
  lng?: number;
  ward?: string;
  province?: string;
  onTextChange: (text: string) => void;
  onPlace: (lat: number, lng: number, place?: PickedPlace) => void;
}) {
  const { colors } = useAppTheme();
  const styles = getStyles(colors);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (debounce.current) clearTimeout(debounce.current); }, []);

  const handleChange = (text: string) => {
    onTextChange(text);
    if (debounce.current) clearTimeout(debounce.current);
    const query = text.trim();
    if (query.length < 3) { setSuggestions([]); return; }
    debounce.current = setTimeout(async () => {
      setSearching(true);
      try {
        setSuggestions(await geoApi.autocomplete(query));
      } catch {
        setSuggestions([]);
      } finally {
        setSearching(false);
      }
    }, 350);
  };

  const handleSelect = (s: PlaceSuggestion) => {
    setSuggestions([]);
    onPlace(s.lat, s.lng, { formattedAddress: s.description, ward: s.ward, district: s.district, province: s.province });
  };

  const pinAndLookUp = async (latitude: number, longitude: number) => {
    onPlace(latitude, longitude);
    try {
      onPlace(latitude, longitude, await geoApi.reverse(latitude, longitude));
    } catch {
      // Giữ ghim dù không tra được địa chỉ.
    }
  };

  const handleMapPress = (e: { nativeEvent: { coordinate: { latitude: number; longitude: number } } }) =>
    pinAndLookUp(e.nativeEvent.coordinate.latitude, e.nativeEvent.coordinate.longitude);

  const handleCurrentLocation = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Quyền bị từ chối', 'Ứng dụng cần quyền vị trí để lấy vị trí hiện tại.');
        return;
      }
      const { coords } = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      await pinAndLookUp(coords.latitude, coords.longitude);
    } catch {
      Alert.alert('Lỗi', 'Không thể lấy vị trí hiện tại.');
    } finally {
      setLocating(false);
    }
  };

  const hasPin = lat != null && lng != null;
  return (
    <View>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={line1}
        onChangeText={handleChange}
        placeholder="Tìm địa chỉ (số nhà, tên đường…)"
        placeholderTextColor={colors.textSecondary}
        accessibilityLabel={label}
        style={styles.input}
      />
      {searching && <ActivityIndicator size="small" color={colors.primaryStrong} style={styles.searchSpinner} />}
      {suggestions.length > 0 && (
        <View style={styles.suggestionBox}>
          {suggestions.slice(0, 5).map((s) => (
            <TouchableOpacity
              key={s.placeId}
              style={styles.suggestionItem}
              onPress={() => handleSelect(s)}
              accessibilityRole="button"
              accessibilityLabel={`Chọn địa chỉ: ${s.description}`}
            >
              <Text style={styles.suggestionText} numberOfLines={2}>{s.description}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      {(ward || province) ? (
        <View style={styles.placeRow}>
          <MapPin size={14} color={colors.textSecondary} strokeWidth={1.75} />
          <Text style={styles.placeText}>{[ward, province].filter(Boolean).join(', ')}</Text>
        </View>
      ) : null}

      <View style={styles.mapBox}>
        <MapView
          style={styles.mapFill}
          initialRegion={{ latitude: lat || 10.7769, longitude: lng || 106.7009, latitudeDelta: 0.05, longitudeDelta: 0.05 }}
          region={hasPin ? { latitude: lat, longitude: lng, latitudeDelta: 0.01, longitudeDelta: 0.01 } : undefined}
          onPress={handleMapPress}
        >
          {hasPin && <Marker coordinate={{ latitude: lat, longitude: lng }} />}
        </MapView>
      </View>

      <TouchableOpacity style={styles.locationBtn} onPress={handleCurrentLocation} disabled={locating} accessibilityRole="button">
        {locating ? (
          <ActivityIndicator size="small" color={colors.primaryStrong} />
        ) : (
          <>
            <LocateFixed size={20} color={colors.primaryStrong} strokeWidth={1.75} />
            <Text style={styles.locationBtnText}>Dùng vị trí hiện tại</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

const getStyles = (colors: ReturnType<typeof useAppTheme>['colors']) => StyleSheet.create({
  fieldLabel: { fontSize: 14, lineHeight: 20, color: colors.text, marginBottom: 6, fontWeight: '500' },
  input: { width: '100%', minHeight: 48, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.textSecondary, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: colors.text, marginBottom: 12 },
  searchSpinner: { marginBottom: 8 },
  suggestionBox: { width: '100%', backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 12, overflow: 'hidden' },
  suggestionItem: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.divider },
  suggestionText: { fontSize: 14, lineHeight: 20, color: colors.text },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  placeText: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  mapBox: { width: '100%', height: 200, borderRadius: 14, overflow: 'hidden', marginBottom: 12, borderWidth: 1, borderColor: colors.border },
  mapFill: { width: '100%', height: '100%' },
  locationBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 16, backgroundColor: colors.primarySoft, borderRadius: 14, alignSelf: 'flex-start', marginBottom: 16 },
  locationBtnText: { color: colors.primaryStrong, fontSize: 14, lineHeight: 20, fontWeight: '600' },
});
