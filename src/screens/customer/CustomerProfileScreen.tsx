import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Alert,
  Switch,
  Image,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import {
  BottomSheetModal,
  BottomSheetBackdrop,
  BottomSheetView,
  BottomSheetScrollView,
  BottomSheetTextInput,
} from '@gorhom/bottom-sheet';
import { useUIStore } from '../../store/ui.store';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import MapView, { Marker } from '../../components/AddressMap';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../types';
import { useAuthStore } from '../../store';
import { authApi } from '../../api/auth.api';
import { useScrollHideTabBar } from '../../hooks/useScrollHideTabBar';
import { usersApi, type AddressData } from '../../api/users.api';
import { geoApi, type PlaceSuggestion } from '../../api/geo.api';
import { useAppTheme } from '../../constants/theme';
import { extractApiErrorMessage } from '../../utils/input-validation';

export default function CustomerProfileScreen() {
  const { user, token, setAuth, logout } = useAuthStore();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const handleScroll = useScrollHideTabBar();
  const { colors, isDark } = useAppTheme();
  const isDarkMode = isDark;
  const styles = getStyles(colors);

  // States for user info
  const [name, setName] = useState(user?.fullName || 'Khách hàng');
  const [email] = useState(user?.email || 'customer@fixhome.vn');
  const [phone, setPhone] = useState(user?.phoneNumber || '');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user?.avatarUrl || null);

  // State for theme
  const toggleTheme = useUIStore((state) => state.toggleTheme);

  // States for addresses & Loading
  const [addresses, setAddresses] = useState<AddressData[]>([]);
  const [loadingAddresses, setLoadingAddresses] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Modals visibility
  const [isAvatarModalVisible, setAvatarModalVisible] = useState(false);
  const profileSheetRef = useRef<BottomSheetModal>(null);
  const addressSheetRef = useRef<BottomSheetModal>(null);
  const profileSnapPoints = useMemo(() => ['62%'], []);
  const addressSnapPoints = useMemo(() => ['90%'], []);

  const handlePickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled) {
      const uri = result.assets[0].uri;
      setAvatarUrl(uri);
      try {
        await usersApi.updateProfile({ avatarUrl: uri });
      } catch (e) {
        console.error('Failed to update avatar', e);
      }
    }
  };
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingAddress, setSavingAddress] = useState(false);

  // Temp states for editing profile
  const [editName, setEditName] = useState(name);
  const [editPhone, setEditPhone] = useState(phone);
  const [focusedProfileField, setFocusedProfileField] = useState<'name' | 'phone' | null>(null);

  const hasProfileChanges = editName.trim() !== name.trim() || editPhone.trim() !== phone.trim();
  const isProfileSaveReady = editName.trim().length > 0 && hasProfileChanges;
  const canSaveProfile = isProfileSaveReady && !savingProfile;

  const [editAddressId, setEditAddressId] = useState<string | null>(null);
  const [addressName, setAddressName] = useState('');
  const [addressDetail, setAddressDetail] = useState('');
  const [addressWard, setAddressWard] = useState('');
  const [addressDistrict, setAddressDistrict] = useState('');
  const [addressProvince, setAddressProvince] = useState('');
  const [addressProvinceCode, setAddressProvinceCode] = useState<string | undefined>(undefined);
  const [addressDistrictCode, setAddressDistrictCode] = useState<string | undefined>(undefined);
  const [addressLat, setAddressLat] = useState<number | undefined>(undefined);
  const [addressLng, setAddressLng] = useState<number | undefined>(undefined);
  const [addressIsDefault, setAddressIsDefault] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [addressSuggestions, setAddressSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searchingAddress, setSearchingAddress] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchProfileData = useCallback(async () => {
    try {
      const profile = await usersApi.getProfile();
      if (profile) {
        setName(profile.fullName || name);
        setPhone(profile.phoneNumber || phone);
        setAvatarUrl(profile.avatarUrl || avatarUrl);
        if (token) setAuth(token, profile);
      }
    } catch {
      // Ignore
    }
  }, [name, phone, avatarUrl, setAuth, token]);

  const refreshAddresses = useCallback(async () => {
    try {
      const list = await usersApi.getAddresses();
      setAddresses(Array.isArray(list) ? list : []);
    } catch {
      // Ignored
    } finally {
      setLoadingAddresses(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadData = async () => {
      await fetchProfileData();
      await refreshAddresses();
    };
    if (mounted) {
      loadData();
    }
    return () => { mounted = false; };
  }, [fetchProfileData, refreshAddresses]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchProfileData(), refreshAddresses()]);
    setRefreshing(false);
  };

  const handleSaveProfile = async () => {
    if (!editName.trim()) {
      Alert.alert('Lỗi', 'Vui lòng nhập họ và tên.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSavingProfile(true);
    try {
      const payload = {
        fullName: editName.trim(),
        phoneNumber: editPhone.trim() || undefined,
      };

      const updated = await usersApi.updateProfile(payload);

      setName(updated.fullName || editName.trim());
      setPhone(updated.phoneNumber || editPhone.trim());

      if (token && user) {
        setAuth(token, {
          ...user,
          fullName: updated.fullName,
          phoneNumber: updated.phoneNumber,
          avatarUrl: avatarUrl || undefined,
        });
      }
      profileSheetRef.current?.dismiss();
      Alert.alert('Thành công', 'Cập nhật thông tin thành công!');
    } catch (err: unknown) {
      Alert.alert('Lỗi', extractApiErrorMessage(err, 'Không thể cập nhật thông tin.'));
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSaveAddress = async () => {
    if (!addressName.trim() || !addressDetail.trim()) {
      Alert.alert('Lỗi', 'Vui lòng nhập đầy đủ tên gợi nhớ và địa chỉ chi tiết.');
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSavingAddress(true);
    try {
      const payload = {
        label: addressName.trim(),
        line1: addressDetail.trim(),
        ward: addressWard,
        district: addressDistrict || addressWard || addressProvince,
        province: addressProvince,
        provinceCode: addressProvinceCode,
        districtCode: addressDistrictCode,
        lat: addressLat,
        lng: addressLng,
        isDefault: addressIsDefault,
      };

      if (editAddressId) {
        await usersApi.updateAddress(editAddressId, payload);
      } else {
        if (!addressProvince) {
          Alert.alert('Lỗi', 'Chưa xác định được tỉnh/thành. Vui lòng dùng vị trí hiện tại hoặc thử lại.');
          setSavingAddress(false);
          return;
        }
        await usersApi.createAddress(payload);
      }
      await refreshAddresses();
      setAddressName('');
      setAddressDetail('');
      setAddressWard('');
      setAddressDistrict('');
      setAddressProvince('');
      setAddressProvinceCode(undefined);
      setAddressDistrictCode(undefined);
      setAddressLat(undefined);
      setAddressLng(undefined);
      setAddressIsDefault(false);
      setAddressSuggestions([]);
      setEditAddressId(null);
      addressSheetRef.current?.dismiss();
    } catch (err: unknown) {
      Alert.alert('Lỗi', extractApiErrorMessage(err, 'Không thể lưu địa chỉ.'));
    } finally {
      setSavingAddress(false);
    }
  };

  const handleEditAddress = (addr: AddressData) => {
    Haptics.selectionAsync();
    setEditAddressId(addr.id);
    setAddressName(addr.label);
    setAddressDetail(addr.line1);
    setAddressWard(addr.ward || '');
    setAddressDistrict(addr.district || '');
    setAddressProvince(addr.province || '');
    setAddressProvinceCode(addr.provinceCode);
    setAddressDistrictCode(addr.districtCode);
    setAddressLat(addr.lat);
    setAddressLng(addr.lng);
    setAddressIsDefault(addr.isDefault);
    setAddressSuggestions([]);
  };

  const handleAddressSearchChange = (text: string) => {
    setAddressDetail(text);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    const query = text.trim();
    if (query.length < 3) { setAddressSuggestions([]); return; }
    searchDebounceRef.current = setTimeout(async () => {
      setSearchingAddress(true);
      try {
        setAddressSuggestions(await geoApi.autocomplete(query));
      } catch {
        setAddressSuggestions([]);
      } finally {
        setSearchingAddress(false);
      }
    }, 350);
  };

  const handleSelectSuggestion = (s: PlaceSuggestion) => {
    setAddressSuggestions([]);
    setAddressDetail(s.description);
    setAddressWard(s.ward || '');
    setAddressDistrict(s.district || '');
    setAddressProvince(s.province || '');
    setAddressLat(s.lat);
    setAddressLng(s.lng);
  };

  const handleGetLocation = async () => {
    setGettingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Quyền bị từ chối', 'Ứng dụng cần quyền truy cập vị trí để tự động lấy địa chỉ.');
        setGettingLocation(false);
        return;
      }
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const lat = location.coords.latitude;
      const lng = location.coords.longitude;
      setAddressLat(lat);
      setAddressLng(lng);

      try {
        const place = await geoApi.reverse(lat, lng);
        setAddressDetail(place.formattedAddress || '');
        setAddressWard(place.ward || '');
        setAddressDistrict(place.district || '');
        setAddressProvince(place.province || '');
        setAddressProvinceCode(place.provinceCode);
        setAddressDistrictCode(place.districtCode);
      } catch {
        // Just fail silently for geocoding if it fails but keep coordinates
      }
    } catch {
      Alert.alert('Lỗi', 'Không thể lấy vị trí hiện tại.');
    } finally {
      setGettingLocation(false);
    }
  };

  const handleMapPress = async (e: any) => {
    const lat = e.nativeEvent.coordinate.latitude;
    const lng = e.nativeEvent.coordinate.longitude;
    setAddressLat(lat);
    setAddressLng(lng);
    try {
      const place = await geoApi.reverse(lat, lng);
      setAddressDetail(place.formattedAddress || '');
      setAddressWard(place.ward || '');
      setAddressDistrict(place.district || '');
      setAddressProvince(place.province || '');
      setAddressProvinceCode(place.provinceCode);
      setAddressDistrictCode(place.districtCode);
    } catch {
      // Fail silently
    }
  };

  const handleDeleteAddress = async (id: string) => {
    Alert.alert('Xác nhận xóa', 'Bạn có muốn xóa địa chỉ này?', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: async () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          try {
            await usersApi.deleteAddress(id);
            await refreshAddresses();
          } catch (err: unknown) {
            Alert.alert('Lỗi', extractApiErrorMessage(err, 'Không thể xóa địa chỉ.'));
          }
        },
      },
    ]);
  };

  const handleLogout = () => {
    Alert.alert('Đăng xuất', 'Bạn có chắc chắn muốn đăng xuất?', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Đăng xuất',
        style: 'destructive',
        onPress: async () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          await authApi.logout();
          logout();
          setTimeout(() => {
            navigation.reset({ index: 0, routes: [{ name: 'Auth' }] });
          }, 100);
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={[styles.container, isDarkMode && styles.containerDark]} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40, paddingTop: 60 }} // Padding top của v2
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
        }
      >
        {/* Main Wrapper từ UI v2 */}
        <View style={[styles.mainWrapperCard, isDarkMode && styles.cardDark]}>
          
          {/* Avatar Section từ v2 */}
          <View style={styles.avatarSection}>
            <View style={[styles.avatarBorder, isDarkMode ? styles.avatarBorderDark : styles.avatarBorderLight]}>
              <TouchableOpacity onPress={() => avatarUrl && setAvatarModalVisible(true)} activeOpacity={0.8} style={styles.avatar}>
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
                ) : (
                  <Text style={styles.avatarText}>{name.charAt(0)}</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cameraIconBadge}
                onPress={handlePickImage}
                activeOpacity={0.8}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Đổi ảnh đại diện"
              >
                 <Ionicons name="camera" size={16} color={colors.surface} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.name, isDarkMode && styles.textDark]}>{name}</Text>
            <Text style={styles.phone}>{phone || 'Chưa cập nhật SĐT'}</Text>
          </View>

          <Text style={[styles.sectionTitle, isDarkMode && styles.textDark]}>Quản lý tài khoản</Text>

          <View style={[styles.menuContainer, isDarkMode && styles.cardDark]}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setEditName(name);
                setEditPhone(phone);
                setFocusedProfileField(null);
                profileSheetRef.current?.present();
              }}
            >
              <Ionicons name="person-outline" size={22} color={colors.textSecondary} style={styles.menuIcon} />
              <View style={styles.menuContent}>
                <Text style={[styles.menuTitle, isDarkMode && styles.textDark]}>Thông tin cá nhân</Text>
                <Text style={styles.menuDesc}>{name} · {phone || email}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.muted} />
            </TouchableOpacity>
            <View style={styles.divider} />

            <TouchableOpacity style={styles.menuItem} onPress={() => addressSheetRef.current?.present()}>
              <Ionicons name="location-outline" size={22} color={colors.textSecondary} style={styles.menuIcon} />
              <View style={styles.menuContent}>
                <Text style={[styles.menuTitle, isDarkMode && styles.textDark]}>Địa chỉ sửa chữa</Text>
                <Text style={styles.menuDesc}>
                  {loadingAddresses ? 'Đang tải...' : `${addresses.length} địa chỉ đã lưu`}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.muted} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.sectionTitle, isDarkMode && styles.textDark]}>Dịch vụ của tôi</Text>
          <View style={[styles.menuContainer, isDarkMode && styles.cardDark]}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => navigation.navigate('CustomerRepairHistory')}
              accessibilityRole="button"
              accessibilityLabel="Mở lịch sử sửa chữa"
            >
              <Ionicons name="time-outline" size={22} color={colors.textSecondary} style={styles.menuIcon} />
              <View style={styles.menuContent}>
                <Text style={[styles.menuTitle, isDarkMode && styles.textDark]}>Lịch sử sửa chữa</Text>
                <Text style={styles.menuDesc}>Xem các đơn đã sửa chữa và hoàn tất</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.muted} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.sectionTitle, isDarkMode && styles.textDark]}>Tùy chọn</Text>
          <View style={styles.menuContainer}>
            <View style={styles.menuItem}>
              <Ionicons name="moon-outline" size={22} color={colors.textSecondary} style={styles.menuIcon} />
              <View style={styles.menuContent}>
                <Text style={styles.menuTitle}>Giao diện tối</Text>
              </View>
              <Switch value={isDark} onValueChange={toggleTheme} />
            </View>
          </View>

          <View style={styles.footer}>
            <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
              <Text style={styles.logoutText}>Đăng xuất</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      <Modal visible={isAvatarModalVisible} transparent={true} animationType="fade">
        <View style={styles.avatarModalContainer}>
          <TouchableOpacity
            style={styles.closeAvatarModalBtn}
            onPress={() => setAvatarModalVisible(false)}
            accessibilityRole="button"
            accessibilityLabel="Đóng"
          >
            <Ionicons name="close" size={30} color={colors.surface} />
          </TouchableOpacity>
          {avatarUrl && (
             <Image source={{ uri: avatarUrl }} style={styles.fullAvatarImage} resizeMode="contain" />
          )}
        </View>
      </Modal>

      {/* Profile Edit Sheet */}
      <BottomSheetModal
        ref={profileSheetRef}
        snapPoints={profileSnapPoints}
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        onDismiss={() => setFocusedProfileField(null)}
        backdropComponent={(props) => (
          <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.45} />
        )}
      >
        <BottomSheetView style={[styles.profileSheetContent, { backgroundColor: colors.surface }]}>
          <View style={styles.profileSheetHeader}>
            <View style={styles.profileHeaderCopy}>
              <Text style={[styles.profileSheetTitle, { color: colors.text }]}>Chỉnh sửa thông tin</Text>
              <Text style={[styles.profileSheetSubtitle, { color: colors.textSecondary }]}>
                Cập nhật thông tin cá nhân dùng cho tài khoản FixHome.
              </Text>
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Đóng chỉnh sửa thông tin"
              style={[styles.profileCloseButton, { backgroundColor: colors.background }]}
              onPress={() => profileSheetRef.current?.dismiss()}
              disabled={savingProfile}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.profileFieldGroup}>
            <Text style={[styles.profileFieldLabel, { color: colors.text }]}>Họ và tên</Text>
            <View
              style={[
                styles.profileInputShell,
                {
                  backgroundColor: colors.surface,
                  borderColor: focusedProfileField === 'name' ? colors.primary : colors.border,
                },
              ]}
            >
              <Ionicons name="person-outline" size={18} color={focusedProfileField === 'name' ? colors.primary : colors.textSecondary} />
              <BottomSheetTextInput
                style={[styles.profileInput, { color: colors.text }]}
                placeholder="Nhập họ và tên"
                placeholderTextColor={colors.muted}
                value={editName}
                onChangeText={setEditName}
                onFocus={() => setFocusedProfileField('name')}
                onBlur={() => setFocusedProfileField(null)}
                autoCapitalize="words"
                returnKeyType="next"
              />
            </View>
          </View>

          <View style={styles.profileFieldGroup}>
            <Text style={[styles.profileFieldLabel, { color: colors.text }]}>Số điện thoại</Text>
            <View
              style={[
                styles.profileInputShell,
                {
                  backgroundColor: colors.surface,
                  borderColor: focusedProfileField === 'phone' ? colors.primary : colors.border,
                },
              ]}
            >
              <Ionicons name="call-outline" size={18} color={focusedProfileField === 'phone' ? colors.primary : colors.textSecondary} />
              <BottomSheetTextInput
                style={[styles.profileInput, { color: colors.text }]}
                placeholder="Nhập số điện thoại"
                placeholderTextColor={colors.muted}
                value={editPhone}
                onChangeText={setEditPhone}
                onFocus={() => setFocusedProfileField('phone')}
                onBlur={() => setFocusedProfileField(null)}
                keyboardType="phone-pad"
                returnKeyType="done"
              />
            </View>
          </View>

          <View style={styles.profileFieldGroup}>
            <Text style={[styles.profileFieldLabel, { color: colors.text }]}>Email</Text>
            <View
              style={[
                styles.profileInputShell,
                styles.profileReadonlyShell,
                { backgroundColor: colors.background, borderColor: colors.border },
              ]}
            >
              <Ionicons name="mail-outline" size={18} color={colors.muted} />
              <Text style={[styles.profileReadonlyValue, { color: colors.textSecondary }]} numberOfLines={1}>
                {email}
              </Text>
              <Ionicons name="lock-closed-outline" size={16} color={colors.muted} />
            </View>
            <View style={styles.profileHelperRow}>
              <Ionicons name="information-circle-outline" size={14} color={colors.muted} />
              <Text style={[styles.profileHelperText, { color: colors.textSecondary }]}>
                Email đăng nhập không thể thay đổi tại đây.
              </Text>
            </View>
          </View>

          <View style={styles.profileActions}>
            <TouchableOpacity
              accessibilityRole="button"
              style={[styles.profileCancelButton, { borderColor: colors.border, backgroundColor: colors.surface }]}
              onPress={() => profileSheetRef.current?.dismiss()}
              disabled={savingProfile}
            >
              <Text style={[styles.profileCancelText, { color: colors.textSecondary }]}>Hủy</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSaveProfile, busy: savingProfile }}
              style={[
                styles.profileSaveButton,
                { backgroundColor: isProfileSaveReady ? colors.primary : colors.border },
              ]}
              onPress={handleSaveProfile}
              disabled={!canSaveProfile}
            >
              {savingProfile ? (
                <>
                  <ActivityIndicator size="small" color={colors.surface} />
                  <Text style={styles.profileSaveText}>Đang lưu...</Text>
                </>
              ) : (
                <Text
                  style={[
                    styles.profileSaveText,
                    { color: isProfileSaveReady ? colors.surface : colors.muted },
                  ]}
                >
                  Lưu thay đổi
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </BottomSheetView>
      </BottomSheetModal>

      {/* Address Edit Sheet (Logic bản thường với Empty State tốt hơn) */}
      <BottomSheetModal
        ref={addressSheetRef}
        snapPoints={addressSnapPoints}
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        backdropComponent={(props) => (
          <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.5} />
        )}
      >
        <BottomSheetScrollView
          contentContainerStyle={[styles.modalContent, isDarkMode && styles.cardDark]}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[styles.modalTitle, isDarkMode && styles.textDark]}>Quản lý địa chỉ</Text>
          <View style={{ width: '100%', marginBottom: 16 }}>
            {addresses.length === 0 ? (
              <Text style={{ textAlign: 'center', color: colors.muted, marginVertical: 12 }}>
                Chưa có địa chỉ nào được lưu.
              </Text>
            ) : (
              addresses.map((addr) => (
                <View key={addr.id} style={[styles.addressItem, isDarkMode && styles.inputDark]}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={[styles.addressName, isDarkMode && styles.textDark]}>{addr.label}</Text>
                      {addr.isDefault && (
                        <View style={styles.defaultBadge}>
                          <Ionicons name="star" size={10} color={colors.primary} />
                          <Text style={styles.defaultBadgeText}>Mặc định</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.addressDetail}>{addr.line1}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => handleEditAddress(addr)}
                    style={styles.iconBtn}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    accessibilityRole="button"
                    accessibilityLabel="Sửa địa chỉ"
                  >
                    <Ionicons name="pencil" size={18} color={colors.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleDeleteAddress(addr.id)}
                    style={styles.iconBtn}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    accessibilityRole="button"
                    accessibilityLabel="Xoá địa chỉ"
                  >
                    <Ionicons name="trash" size={18} color={colors.error} />
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>

          <Text style={[styles.sectionTitle, isDarkMode && styles.textDark, { alignSelf: 'flex-start' }]}>
            {editAddressId ? 'Sửa địa chỉ' : 'Thêm địa chỉ mới'}
          </Text>
          <BottomSheetTextInput
            style={[styles.input, isDarkMode && styles.inputDark]}
            placeholder="Tên gợi nhớ (VD: Nhà riêng)"
            placeholderTextColor={colors.muted}
            value={addressName}
            onChangeText={setAddressName}
          />
          <View style={{ width: '100%' }}>
            <BottomSheetTextInput
              style={[styles.input, isDarkMode && styles.inputDark]}
              placeholder="Tìm địa chỉ (số nhà, tên đường...)"
              placeholderTextColor={colors.muted}
              value={addressDetail}
              onChangeText={handleAddressSearchChange}
            />
            {searchingAddress && <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: -8, marginBottom: 8 }} />}
            {addressSuggestions.length > 0 && (
              <View style={[styles.suggestionBox, isDarkMode && styles.cardDark]}>
                {addressSuggestions.map((s) => (
                  <TouchableOpacity key={s.placeId} style={styles.suggestionItem} onPress={() => handleSelectSuggestion(s)}>
                    <Text style={[styles.suggestionText, isDarkMode && styles.textDark]} numberOfLines={2}>{s.description}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {(addressWard || addressProvince) ? (
            <Text style={{ fontSize: 12, color: colors.textSecondary, alignSelf: 'flex-start', marginBottom: 12 }}>
              <Ionicons name="location" size={12} /> {[addressWard, addressProvince].filter(Boolean).join(', ')}
            </Text>
          ) : null}

          <Text style={{ fontSize: 13, color: colors.textSecondary, alignSelf: 'flex-start', marginBottom: 6, fontWeight: '500' }}>
            Chọn trên bản đồ:
          </Text>
          <View style={{ width: '100%', height: 200, borderRadius: 12, overflow: 'hidden', marginBottom: 12, borderWidth: 1, borderColor: colors.border }}>
            <MapView
              style={{ width: '100%', height: '100%' }}
              initialRegion={{
                latitude: addressLat || 10.7769,
                longitude: addressLng || 106.7009,
                latitudeDelta: 0.05,
                longitudeDelta: 0.05,
              }}
              region={addressLat && addressLng ? {
                latitude: addressLat,
                longitude: addressLng,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
              } : undefined}
              onPress={handleMapPress}
            >
              {addressLat && addressLng && (
                <Marker coordinate={{ latitude: addressLat, longitude: addressLng }} />
              )}
            </MapView>
          </View>

          <TouchableOpacity
            style={[styles.locationBtn, isDarkMode && styles.cardDark]}
            onPress={handleGetLocation}
            disabled={gettingLocation}
          >
            {gettingLocation ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <>
                <Ionicons name="navigate-circle-outline" size={20} color={colors.primary} />
                <Text style={styles.locationBtnText}>Dùng vị trí hiện tại</Text>
              </>
            )}
          </TouchableOpacity>

          <View style={styles.defaultRow}>
            <Text style={[styles.locationBtnText, { color: colors.text }]}>Đặt làm địa chỉ mặc định</Text>
            <Switch value={addressIsDefault} onValueChange={setAddressIsDefault} />
          </View>

          <View style={styles.modalActions}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => {
                addressSheetRef.current?.dismiss();
                setEditAddressId(null);
                setAddressName('');
                setAddressDetail('');
                setAddressWard('');
                setAddressDistrict('');
                setAddressProvince('');
                setAddressProvinceCode(undefined);
                setAddressDistrictCode(undefined);
                setAddressLat(undefined);
                setAddressLng(undefined);
                setAddressIsDefault(false);
                setAddressSuggestions([]);
              }}
              disabled={savingAddress}
            >
              <Text style={styles.cancelBtnText}>Đóng</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, savingAddress && { opacity: 0.7 }]}
              onPress={handleSaveAddress}
              disabled={savingAddress}
            >
              {savingAddress ? (
                <ActivityIndicator size="small" color={colors.surface} />
              ) : (
                <Text style={styles.saveBtnText}>{editAddressId ? 'Cập nhật' : 'Thêm'}</Text>
              )}
            </TouchableOpacity>
          </View>
        </BottomSheetScrollView>
      </BottomSheetModal>
    </SafeAreaView>
  );
}

const getStyles = (colors: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  containerDark: { backgroundColor: colors.background },
  cardDark: { backgroundColor: '#1E293B' },
  name: { fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: 4 },
  textDark: { color: colors.text },

  // Giao diện Main Wrapper & Avatar của v2
  mainWrapperCard: {
    backgroundColor: colors.surface,
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 40,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    marginTop: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 5,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 24,
    marginTop: -66,
  },
  avatarBorder: {
    width: 100, height: 100, borderRadius: 50,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 12, borderWidth: 4,
  },
  avatarBorderLight: { borderColor: colors.surface, backgroundColor: colors.surface },
  avatarBorderDark: { borderColor: '#1E293B', backgroundColor: '#1E293B' },
  avatar: {
    width: '100%', height: '100%', borderRadius: 50,
    backgroundColor: colors.primaryTint, justifyContent: 'center', alignItems: 'center', overflow: 'hidden'
  },
  avatarImage: { width: '100%', height: '100%' },
  avatarText: { fontSize: 36, fontWeight: '700', color: colors.primary },
  phone: { fontSize: 14, color: colors.textSecondary, fontWeight: '500' },
  
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 12 },
  menuContainer: { backgroundColor: colors.surface, borderRadius: 16, overflow: 'hidden', marginBottom: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  menuItem: { flexDirection: 'row', padding: 16, alignItems: 'center' },
  menuIcon: { marginRight: 16 },
  menuContent: { flex: 1 },
  menuTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  menuDesc: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.border, marginLeft: 54 },
  footer: { alignItems: 'center', marginTop: 12, marginBottom: 32 },
  logoutBtn: { paddingVertical: 12, paddingHorizontal: 24 },
  logoutText: { fontSize: 14, fontWeight: '600', color: colors.error },

  profileSheetContent: {
    width: '100%',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 24,
  },
  profileSheetHeader: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 22,
  },
  profileHeaderCopy: { flex: 1, gap: 4 },
  profileSheetTitle: { fontSize: 20, lineHeight: 28, fontWeight: '700' },
  profileSheetSubtitle: { fontSize: 13, lineHeight: 19 },
  profileCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileFieldGroup: { width: '100%', marginBottom: 16 },
  profileFieldLabel: { fontSize: 13, lineHeight: 18, fontWeight: '600', marginBottom: 7 },
  profileInputShell: {
    minHeight: 50,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
  },
  profileReadonlyShell: { opacity: 0.92 },
  profileInput: { flex: 1, minHeight: 48, paddingVertical: 0, fontSize: 15, lineHeight: 21 },
  profileReadonlyValue: { flex: 1, fontSize: 14, lineHeight: 20 },
  profileHelperRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 5, marginTop: 7, paddingHorizontal: 2 },
  profileHelperText: { flex: 1, fontSize: 12, lineHeight: 17 },
  profileActions: { width: '100%', flexDirection: 'row', gap: 10, marginTop: 4 },
  profileCancelButton: {
    minHeight: 48,
    minWidth: 92,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileCancelText: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  profileSaveButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    paddingHorizontal: 18,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileSaveText: { color: '#FFFFFF', fontSize: 14, lineHeight: 20, fontWeight: '700' },
  modalContent: { width: '100%', backgroundColor: colors.surface, borderRadius: 20, padding: 20, alignItems: 'center' },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 16 },
  input: { width: '100%', backgroundColor: colors.border, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 14, color: colors.text, marginBottom: 12 },
  inputDark: { backgroundColor: '#334155', color: colors.background },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', width: '100%', marginTop: 8, gap: 12 },
  cancelBtn: { paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12, backgroundColor: colors.border },
  cancelBtnText: { color: colors.textSecondary, fontWeight: '600', fontSize: 14 },
  saveBtn: { paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
  saveBtnText: { color: colors.surface, fontWeight: '600', fontSize: 14 },
  addressItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.background, padding: 12, borderRadius: 12, marginBottom: 8 },
  addressName: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 4 },
  addressDetail: { fontSize: 12, color: colors.textSecondary },
  iconBtn: { padding: 8, marginLeft: 4 },
  locationBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 16, backgroundColor: '#E0F2FE', borderRadius: 8, alignSelf: 'flex-start', marginBottom: 16 },
  locationBtnText: { color: colors.primary, fontSize: 13, fontWeight: '600' },
  defaultBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.primaryTint, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  defaultBadgeText: { fontSize: 10, fontWeight: '700', color: colors.primary },
  suggestionBox: { width: '100%', backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, marginTop: -8, marginBottom: 12, overflow: 'hidden' },
  suggestionItem: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  suggestionText: { fontSize: 13, color: colors.text },
  defaultRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: 8 },
  cameraIconBadge: { position: 'absolute', bottom: 0, right: 0, backgroundColor: colors.primary, width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: colors.surface },
  avatarModalContainer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center' },
  closeAvatarModalBtn: { position: 'absolute', top: 50, right: 20, zIndex: 10, padding: 8 },
  fullAvatarImage: { width: '100%', height: 400 },
});
