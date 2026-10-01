import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Alert,
  Image,
  Modal,
  ActivityIndicator,
} from 'react-native';
import {
  BottomSheetModal,
  BottomSheetBackdrop,
  BottomSheetSectionList,
  BottomSheetScrollView,
  BottomSheetTextInput,
} from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuthStore } from '../../store';
import type { RootStackParamList } from '../../types';
import { usersApi, type AddressData } from '../../api/users.api';
import { ordersApi } from '../../api/orders.api';
import { authApi } from '../../api/auth.api';
import { geoApi, type PlaceSuggestion } from '../../api/geo.api';
import { servicesApi, type ServiceItem, type CategoryItem } from '../../api/services.api';
import {
  technicianProfileApi,
  type TechnicianProfile,
  type TechnicianScheduleSlot,
  type TechnicianServiceOffering,
  type TechnicianTimeOff,
} from '../../api/technician-profile.api';
import CategoryPills from '../../components/CategoryPills';
import MapView, { Marker } from '../../components/AddressMap';
import { useAppTheme } from '../../constants/theme';
import { extractApiErrorMessage } from '../../utils/input-validation';
import { vnDateString } from '../../utils/vn-time';

const DAY_NAMES = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
const START_TIMES = ['06:00', '07:00', '08:00', '09:00', '10:00', '13:00', '14:00'];
const END_TIMES = ['12:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00'];

export default function TechnicianProfileScreen() {
  const { colors, isDark } = useAppTheme();
  const styles = getStyles(colors);
  const logout = useAuthStore((state) => state.logout);
  const { user } = useAuthStore();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [fullName, setFullName] = useState(user?.fullName || 'Kỹ thuật viên');
  const [phoneNumber, setPhoneNumber] = useState(user?.phoneNumber || '');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user?.avatarUrl || null);
  const [earningsTotal, setEarningsTotal] = useState(0);

  const [isAvatarModalVisible, setAvatarModalVisible] = useState(false);

  // ---- Hồ sơ nghề nghiệp (skills / location & radius / schedule / time-off) ----
  const [technicianProfile, setTechnicianProfile] = useState<TechnicianProfile | null>(null);
  const [addresses, setAddresses] = useState<AddressData[]>([]);
  const technicianAddress = addresses.find((a) => a.isDefault) ?? addresses[0] ?? null;

  const skillsSheetRef = useRef<BottomSheetModal>(null);
  const locationSheetRef = useRef<BottomSheetModal>(null);
  const scheduleSheetRef = useRef<BottomSheetModal>(null);
  const timeOffSheetRef = useRef<BottomSheetModal>(null);
  const wideSnapPoints = useMemo(() => ['90%'], []);

  // Skills
  const [loadingSkills, setLoadingSkills] = useState(false);
  const [catalogServices, setCatalogServices] = useState<ServiceItem[]>([]);
  const [pickerCategories, setPickerCategories] = useState<CategoryItem[]>([]);
  const [pickerCategoryId, setPickerCategoryId] = useState<string | null>(null);
  const [myOfferings, setMyOfferings] = useState<Record<string, TechnicianServiceOffering>>({});
  const [skillDrafts, setSkillDrafts] = useState<
    Record<string, { enabled: boolean; listedLaborPrice: string; typicalWarrantyDays: string; level: string }>
  >({});
  const [savingSkillId, setSavingSkillId] = useState<string | null>(null);
  const filteredCatalogServices = catalogServices.filter(
    (s) => !pickerCategoryId || s.categoryId === pickerCategoryId,
  );
  const skillSections = useMemo(() => {
    const verified: ServiceItem[] = [];
    const unverified: ServiceItem[] = [];
    const unregistered: ServiceItem[] = [];
    for (const service of filteredCatalogServices) {
      const offering = myOfferings[service.id];
      if (offering?.verificationStatus === 'verified') verified.push(service);
      else if (offering) unverified.push(service);
      else unregistered.push(service);
    }
    return [
      { title: 'Đã duyệt', key: 'verified', data: verified },
      { title: 'Chờ duyệt / Bị từ chối', key: 'unverified', data: unverified },
      { title: 'Chưa đăng ký — có thể xin duyệt', key: 'unregistered', data: unregistered },
    ].filter((section) => section.data.length > 0);
  }, [filteredCatalogServices, myOfferings]);

  // Location & radius
  const [locationLine1, setLocationLine1] = useState('');
  const [locationWard, setLocationWard] = useState('');
  const [locationDistrict, setLocationDistrict] = useState('');
  const [locationProvince, setLocationProvince] = useState('');
  const [locationLat, setLocationLat] = useState<number | undefined>(undefined);
  const [locationLng, setLocationLng] = useState<number | undefined>(undefined);
  const [locationRadiusKm, setLocationRadiusKm] = useState('10');
  const [locationSuggestions, setLocationSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searchingLocation, setSearchingLocation] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [savingLocation, setSavingLocation] = useState(false);
  const locationSearchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Schedule
  const [scheduleDraft, setScheduleDraft] = useState(
    Array.from({ length: 7 }, () => ({ enabled: false, startTime: '08:00', endTime: '17:00' })),
  );
  const [savingSchedule, setSavingSchedule] = useState(false);

  // Time off
  const [timeOffList, setTimeOffList] = useState<TechnicianTimeOff[]>([]);
  const [loadingTimeOff, setLoadingTimeOff] = useState(false);
  const [savingTimeOff, setSavingTimeOff] = useState(false);
  const [newTimeOffStart, setNewTimeOffStart] = useState('');
  const [newTimeOffEnd, setNewTimeOffEnd] = useState('');
  const [newTimeOffReason, setNewTimeOffReason] = useState('');

  const handlePickImage = async () => {
    Haptics.selectionAsync();
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

  useEffect(() => {
    let mounted = true;
    usersApi
      .getProfile()
      .then((profile) => {
        if (mounted && profile) {
          if (profile.fullName) setFullName(profile.fullName);
          if (profile.phoneNumber) setPhoneNumber(profile.phoneNumber);
        }
      })
      .catch(() => {});

    ordersApi
      .getMyOrders()
      .then((orders) => {
        if (!mounted || !Array.isArray(orders)) return;
        const completed = orders.filter((o) => String(o.status).toUpperCase() === 'COMPLETED');
        const earn = completed.reduce((sum, o) => sum + (o.laborTotal || o.grandTotal || 0), 0);
        setEarningsTotal(earn);
      })
      .catch(() => {});

    return () => {
      mounted = false;
    };
  }, []);

  const loadTechnicianProfile = useCallback(async () => {
    try {
      const [profile, addrs] = await Promise.all([
        technicianProfileApi.getMyProfile(),
        usersApi.getAddresses().catch(() => []),
      ]);
      setTechnicianProfile(profile);
      setAddresses(addrs);
    } catch {
      // Best-effort; menu rows just show no summary yet.
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    void loadTechnicianProfile();
  }, [loadTechnicianProfile]);

  const [togglingAvailability, setTogglingAvailability] = useState(false);
  const toggleAvailability = async () => {
    if (!technicianProfile || togglingAvailability) return;
    Haptics.selectionAsync();
    const next = !technicianProfile.isAvailable;
    setTogglingAvailability(true);
    try {
      const updated = await technicianProfileApi.updateMyProfile({ isAvailable: next });
      setTechnicianProfile(updated);
    } catch (err: unknown) {
      Alert.alert('Lỗi', extractApiErrorMessage(err, 'Không thể cập nhật trạng thái nhận việc.'));
    } finally {
      setTogglingAvailability(false);
    }
  };

  // ---- Skills sheet ----
  const openSkillsSheet = async () => {
    Haptics.selectionAsync();
    skillsSheetRef.current?.present();
    setLoadingSkills(true);
    try {
      const [services, categories, offerings] = await Promise.all([
        servicesApi.getServices({ pageSize: 100 }),
        servicesApi.getCategories(),
        technicianProfileApi.getMyServices(),
      ]);
      setCatalogServices(services.data);
      setPickerCategories(categories);
      const offeringsById: Record<string, TechnicianServiceOffering> = {};
      for (const o of offerings) offeringsById[o.serviceId] = o;
      setMyOfferings(offeringsById);
      const drafts: typeof skillDrafts = {};
      for (const service of services.data) {
        const offering = offeringsById[service.id];
        drafts[service.id] = {
          enabled: offering?.isActive ?? false,
          listedLaborPrice: offering?.listedLaborPrice != null ? String(offering.listedLaborPrice) : '',
          typicalWarrantyDays: offering?.typicalWarrantyDays != null ? String(offering.typicalWarrantyDays) : '30',
          level: offering?.level ?? 'INTERMEDIATE',
        };
      }
      setSkillDrafts(drafts);
    } catch {
      setCatalogServices([]);
    } finally {
      setLoadingSkills(false);
    }
  };

  const handleSaveSkill = async (service: ServiceItem) => {
    const draft = skillDrafts[service.id];
    if (!draft) return;
    setSavingSkillId(service.id);
    try {
      const isFixedPrice = String(service.pricingMode).toLowerCase() === 'fixed_price';
      const offering = await technicianProfileApi.setSkillPricing(service.id, {
        isActive: draft.enabled,
        level: draft.level.trim() || 'INTERMEDIATE',
        typicalWarrantyDays: draft.typicalWarrantyDays ? Number(draft.typicalWarrantyDays) : null,
        listedLaborPrice: isFixedPrice
          ? null
          : draft.listedLaborPrice
            ? Number(draft.listedLaborPrice)
            : null,
      });
      setMyOfferings((prev) => ({ ...prev, [service.id]: offering }));
      await loadTechnicianProfile();
    } catch (err: unknown) {
      Alert.alert('Lỗi', extractApiErrorMessage(err, 'Không thể lưu kỹ năng này.'));
    } finally {
      setSavingSkillId(null);
    }
  };

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

  const openLocationSheet = () => {
    Haptics.selectionAsync();
    setLocationLine1(technicianAddress?.line1 ?? '');
    setLocationWard(technicianAddress?.ward ?? '');
    setLocationDistrict(technicianAddress?.district ?? '');
    setLocationProvince(technicianAddress?.province ?? '');
    setLocationLat(technicianAddress?.lat);
    setLocationLng(technicianAddress?.lng);
    setLocationRadiusKm(String(technicianProfile?.serviceRadiusKm ?? 10));
    setLocationSuggestions([]);
    locationSheetRef.current?.present();
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
    if (!locationLine1.trim() || locationLat == null || locationLng == null) {
      Alert.alert('Lỗi', 'Vui lòng tìm hoặc chọn vị trí trên bản đồ trước khi lưu.');
      return;
    }
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
        serviceRadiusKm: Number(locationRadiusKm) || 10,
      });
      await loadTechnicianProfile();
      locationSheetRef.current?.dismiss();
    } catch (err: unknown) {
      Alert.alert('Lỗi', extractApiErrorMessage(err, 'Không thể lưu vị trí.'));
    } finally {
      setSavingLocation(false);
    }
  };

  // ---- Schedule sheet ----
  const openScheduleSheet = () => {
    Haptics.selectionAsync();
    const byDay = new Map((technicianProfile?.schedules ?? []).map((s) => [s.dayOfWeek, s]));
    setScheduleDraft(
      Array.from({ length: 7 }, (_, day) => {
        const existing = byDay.get(day);
        return existing
          ? { enabled: true, startTime: existing.startTime, endTime: existing.endTime }
          : { enabled: false, startTime: '08:00', endTime: '17:00' };
      }),
    );
    scheduleSheetRef.current?.present();
  };

  const handleSaveSchedule = async () => {
    setSavingSchedule(true);
    try {
      const schedules: TechnicianScheduleSlot[] = scheduleDraft
        .map((slot, dayOfWeek) => ({ ...slot, dayOfWeek }))
        .filter((slot) => slot.enabled)
        .map(({ dayOfWeek, startTime, endTime }) => ({ dayOfWeek, startTime, endTime }));
      await technicianProfileApi.updateMySchedule(schedules);
      await loadTechnicianProfile();
      scheduleSheetRef.current?.dismiss();
    } catch (err: unknown) {
      Alert.alert('Lỗi', extractApiErrorMessage(err, 'Không thể lưu khung giờ nhận việc.'));
    } finally {
      setSavingSchedule(false);
    }
  };

  // ---- Time-off sheet ----
  const openTimeOffSheet = async () => {
    Haptics.selectionAsync();
    setNewTimeOffStart('');
    setNewTimeOffEnd('');
    setNewTimeOffReason('');
    timeOffSheetRef.current?.present();
    setLoadingTimeOff(true);
    try {
      setTimeOffList(await technicianProfileApi.getMyTimeOff());
    } catch {
      setTimeOffList([]);
    } finally {
      setLoadingTimeOff(false);
    }
  };

  const handleAddTimeOff = async () => {
    if (!newTimeOffStart || !newTimeOffEnd) {
      Alert.alert('Lỗi', 'Vui lòng nhập đủ ngày bắt đầu và kết thúc (YYYY-MM-DD).');
      return;
    }
    setSavingTimeOff(true);
    try {
      await technicianProfileApi.createTimeOff({
        startAt: `${newTimeOffStart}T00:00:00`,
        endAt: `${newTimeOffEnd}T23:59:59`,
        reason: newTimeOffReason.trim() || undefined,
      });
      setNewTimeOffStart('');
      setNewTimeOffEnd('');
      setNewTimeOffReason('');
      setTimeOffList(await technicianProfileApi.getMyTimeOff());
    } catch (err: unknown) {
      Alert.alert('Lỗi', extractApiErrorMessage(err, 'Không thể thêm ngày nghỉ. Kiểm tra lại khoảng ngày.'));
    } finally {
      setSavingTimeOff(false);
    }
  };

  const handleDeleteTimeOff = (id: string) => {
    Alert.alert('Xoá ngày nghỉ', 'Bạn có thể được xếp việc trở lại trong khoảng ngày này sau khi xoá.', [
      { text: 'Huỷ', style: 'cancel' },
      {
        text: 'Xoá',
        style: 'destructive',
        onPress: async () => {
          try {
            await technicianProfileApi.deleteTimeOff(id);
            setTimeOffList((prev) => prev.filter((t) => t.id !== id));
          } catch {
            Alert.alert('Lỗi', 'Không thể xoá ngày nghỉ.');
          }
        },
      },
    ]);
  };

  const handleLogout = () => {
    Alert.alert('Đăng xuất', 'Bạn có chắc chắn muốn đăng xuất tài khoản Thợ?', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Đăng xuất',
        style: 'destructive',
        onPress: async () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          await authApi.logout();
          logout();
          setTimeout(() => {
            navigation.navigate('Auth');
          }, 100);
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40, paddingTop: 60 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.mainWrapperCard}>
          {/* Avatar Section */}
          <View style={styles.avatarSection}>
            <View style={styles.avatarBorder}>
              <TouchableOpacity
                onPress={() => avatarUrl && setAvatarModalVisible(true)}
                activeOpacity={0.8}
                style={styles.avatar}
                accessibilityRole="button"
                accessibilityLabel="Xem ảnh đại diện"
              >
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
                ) : (
                  <Text style={styles.avatarText}>{fullName.charAt(0)}</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cameraIconBadge}
                onPress={handlePickImage}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Đổi ảnh đại diện"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                 <Ionicons name="camera" size={16} color={colors.surface} />
              </TouchableOpacity>
            </View>
            <Text style={styles.name}>{fullName}</Text>
            <Text style={styles.phone}>{phoneNumber || user?.email || 'Kỹ thuật viên FixHome'}</Text>
          </View>

          {/* Thu nhập & Trạng thái */}
          <Text style={styles.sectionTitle}>Thu nhập & Trạng thái</Text>
          <View style={styles.overviewRow}>
            <LinearGradient colors={['#E0F2FE', '#F0F9FF']} style={styles.overviewCard}>
              <View style={styles.cardTopRow}>
                <View style={[styles.iconCircle, { backgroundColor: '#BAE6FD' }]}>
                  <Ionicons name="cash" size={16} color="#0284C7" />
                </View>
                <Text style={styles.cardLabel}>Doanh thu</Text>
              </View>
              <Text style={styles.cardValue}>
                {earningsTotal.toLocaleString('vi-VN')} <Text style={styles.cardUnit}>đ</Text>
              </Text>
            </LinearGradient>

            <LinearGradient colors={['#DCFCE7', '#F0FDF4']} style={styles.overviewCard}>
              <View style={styles.cardTopRow}>
                <View style={[styles.iconCircle, { backgroundColor: '#BBF7D0' }]}>
                  <Ionicons name="star" size={16} color={colors.success} />
                </View>
                <Text style={styles.cardLabel}>Đánh giá</Text>
              </View>
              <Text style={[styles.cardValue, { color: colors.success, fontSize: 18 }]}>
                {technicianProfile ? `${technicianProfile.averageRating.toFixed(2)} ★` : '—'}
              </Text>
              <Text style={styles.cardUnit}>
                {technicianProfile ? `Độ tin cậy ${technicianProfile.reliabilityScore}%` : ''}
              </Text>
            </LinearGradient>
          </View>

          <TouchableOpacity
            style={[
              styles.availabilityToggle,
              { backgroundColor: technicianProfile?.isAvailable ? '#ECFDF5' : colors.border },
            ]}
            disabled={!technicianProfile || togglingAvailability}
            onPress={toggleAvailability}
          >
            <View style={styles.availabilityToggleLeft}>
              <View
                style={[
                  styles.availabilityDot,
                  { backgroundColor: technicianProfile?.isAvailable ? colors.success : colors.muted },
                ]}
              />
              <Text style={styles.availabilityText}>
                {technicianProfile?.isAvailable ? 'Đang nhận đơn mới' : 'Tạm dừng nhận đơn mới'}
              </Text>
            </View>
            {togglingAvailability ? (
              <ActivityIndicator size="small" color={colors.textSecondary} />
            ) : (
              <Text style={styles.availabilityToggleAction}>
                {technicianProfile?.isAvailable ? 'Tạm dừng' : 'Bật lại'}
              </Text>
            )}
          </TouchableOpacity>

          <View style={styles.menuContainer}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => navigation.navigate('TechnicianWallet')}
            >
              <Ionicons name="wallet-outline" size={22} color={colors.textSecondary} style={styles.menuIcon} />
              <View style={styles.menuContent}>
                <Text style={styles.menuTitle}>Ví của tôi</Text>
                <Text style={styles.menuDesc}>Số dư, nạp tiền, rút tiền</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.muted} />
            </TouchableOpacity>
          </View>

          {/* HỒ SƠ NGHỀ NGHIỆP */}
          <Text style={styles.sectionTitle}>Hồ sơ nghề nghiệp</Text>
          <View style={styles.menuContainer}>
            <TouchableOpacity style={styles.menuItem} onPress={openSkillsSheet}>
              <Ionicons name="construct-outline" size={22} color={colors.textSecondary} style={styles.menuIcon} />
              <View style={styles.menuContent}>
                <Text style={styles.menuTitle}>Kỹ năng & dịch vụ nhận làm</Text>
                <Text style={styles.menuDesc}>
                  {Object.values(myOfferings).some((o) => o.isActive)
                    ? `${Object.values(myOfferings).filter((o) => o.isActive).length} dịch vụ đang nhận`
                    : 'Chọn dịch vụ bạn nhận làm'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.muted} />
            </TouchableOpacity>
            <View style={styles.divider} />

            <TouchableOpacity style={styles.menuItem} onPress={openLocationSheet}>
              <Ionicons name="location-outline" size={22} color={colors.textSecondary} style={styles.menuIcon} />
              <View style={styles.menuContent}>
                <Text style={styles.menuTitle}>Vị trí & bán kính hoạt động</Text>
                <Text style={styles.menuDesc}>
                  {technicianAddress
                    ? `${technicianAddress.line1} · ${technicianProfile?.serviceRadiusKm ?? 10} km`
                    : 'Chưa cập nhật vị trí'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.muted} />
            </TouchableOpacity>
            <View style={styles.divider} />

            <TouchableOpacity style={styles.menuItem} onPress={openScheduleSheet}>
              <Ionicons name="calendar-outline" size={22} color={colors.textSecondary} style={styles.menuIcon} />
              <View style={styles.menuContent}>
                <Text style={styles.menuTitle}>Khung giờ nhận việc</Text>
                <Text style={styles.menuDesc}>
                  {technicianProfile ? `${technicianProfile.schedules.length} khung giờ trong tuần` : 'Đang tải...'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.muted} />
            </TouchableOpacity>
            <View style={styles.divider} />

            <TouchableOpacity style={styles.menuItem} onPress={openTimeOffSheet}>
              <Ionicons name="airplane-outline" size={22} color={colors.textSecondary} style={styles.menuIcon} />
              <View style={styles.menuContent}>
                <Text style={styles.menuTitle}>Ngày nghỉ</Text>
                <Text style={styles.menuDesc}>Đăng ký các khoảng ngày không nhận việc</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.muted} />
            </TouchableOpacity>
          </View>

          {/* CÀI ĐẶT */}
          <Text style={styles.sectionTitle}>Cài đặt</Text>
          <View style={styles.menuContainer}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => navigation.navigate('TechnicianKyc')}
            >
              <Ionicons name="person-outline" size={22} color={colors.textSecondary} style={styles.menuIcon} />
              <View style={styles.menuContent}>
                <Text style={styles.menuTitle}>Xác minh danh tính (KYC)</Text>
                <Text style={styles.menuDesc}>Cập nhật CCCD & Thông tin</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.muted} />
            </TouchableOpacity>
            <View style={styles.divider} />

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => Alert.alert('Thông báo', 'Hệ thống thông báo nhận đơn đang bật.')}
            >
              <Ionicons name="notifications-outline" size={22} color={colors.textSecondary} style={styles.menuIcon} />
              <View style={styles.menuContent}>
                <Text style={styles.menuTitle}>Thông báo nhận việc</Text>
                <Text style={styles.menuDesc}>Đang bật</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.muted} />
            </TouchableOpacity>
            <View style={styles.divider} />

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => Alert.alert('Hỗ trợ', 'Tổng đài KTV FixHome: 1900 6868')}
            >
              <Ionicons name="headset-outline" size={22} color={colors.textSecondary} style={styles.menuIcon} />
              <View style={styles.menuContent}>
                <Text style={styles.menuTitle}>Hỗ trợ kỹ thuật 24/7</Text>
                <Text style={styles.menuDesc}>Hotline: 1900 6868</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.muted} />
            </TouchableOpacity>
          </View>

          {/* QUY TRÌNH & NỘI QUY */}
          <Text style={styles.sectionTitle}>Quy trình & Nội quy</Text>
          <View style={styles.menuContainer}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() =>
                Alert.alert(
                  'Quy chuẩn dịch vụ',
                  '1. Đúng giờ theo lịch hẹn\n2. Mặc đồng phục, xuất trình thẻ\n3. Báo giá trước khi làm\n4. Không thu thêm phụ phí ngoài hệ thống',
                )
              }
            >
              <Ionicons name="book-outline" size={22} color={colors.textSecondary} style={styles.menuIcon} />
              <View style={styles.menuContent}>
                <Text style={styles.menuTitle}>Quy chuẩn dịch vụ 5 sao</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.muted} />
            </TouchableOpacity>
            <View style={styles.divider} />

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() =>
                Alert.alert(
                  'Chính sách hoa hồng',
                  'Thợ nhận 85-90% giá trị công thợ trên mỗi đơn hoàn tất thành công.',
                )
              }
            >
              <Ionicons name="document-text-outline" size={22} color={colors.textSecondary} style={styles.menuIcon} />
              <View style={styles.menuContent}>
                <Text style={styles.menuTitle}>Chính sách thu nhập & Phí</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.muted} />
            </TouchableOpacity>
          </View>

          <View style={styles.footer}>
            <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
              <Text style={styles.logoutText}>Đăng xuất</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* Skills sheet */}
      <BottomSheetModal
        ref={skillsSheetRef}
        snapPoints={wideSnapPoints}
        backdropComponent={(props) => (
          <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.5} />
        )}
      >
        <View style={styles.sheetHeader}>
          <Text style={styles.modalTitle}>Kỹ năng & dịch vụ nhận làm</Text>
          {pickerCategories.length > 0 && (
            <CategoryPills categories={pickerCategories} selectedId={pickerCategoryId} onSelect={setPickerCategoryId} />
          )}
        </View>
        {loadingSkills ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
        ) : (
          <BottomSheetSectionList
            sections={skillSections}
            keyExtractor={(s) => s.id}
            contentContainerStyle={styles.pickerListContent}
            renderSectionHeader={({ section }) => (
              <Text style={styles.skillSectionHeader}>
                {section.title} <Text style={styles.skillSectionCount}>({section.data.length})</Text>
              </Text>
            )}
            renderItem={({ item: service }) => {
              const draft = skillDrafts[service.id];
              if (!draft) return null;
              const offering = myOfferings[service.id];
              const isFixedPrice = String(service.pricingMode).toLowerCase() === 'fixed_price';
              return (
                <View style={styles.skillCard}>
                  <View style={styles.skillCardHeader}>
                    <TouchableOpacity
                      style={styles.skillToggleRow}
                      onPress={() =>
                        setSkillDrafts((prev) => ({
                          ...prev,
                          [service.id]: { ...prev[service.id], enabled: !prev[service.id].enabled },
                        }))
                      }
                    >
                      <Ionicons
                        name={draft.enabled ? 'checkbox' : 'square-outline'}
                        size={20}
                        color={draft.enabled ? colors.primary : colors.muted}
                      />
                      <Text style={styles.skillName} numberOfLines={2}>{service.name}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.skillSaveBtn}
                      disabled={savingSkillId === service.id}
                      onPress={() => handleSaveSkill(service)}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      {savingSkillId === service.id ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                      ) : (
                        <Text style={styles.skillSaveBtnText}>Lưu</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                  {draft.enabled && (
                    <>
                      <View style={styles.skillFieldsRow}>
                        {!isFixedPrice && (
                          <BottomSheetTextInput
                            value={draft.listedLaborPrice}
                            onChangeText={(v) =>
                              setSkillDrafts((prev) => ({ ...prev, [service.id]: { ...prev[service.id], listedLaborPrice: v } }))
                            }
                            keyboardType="numeric"
                            placeholder="Giá công"
                            placeholderTextColor={colors.muted}
                            style={styles.skillFieldInput}
                          />
                        )}
                        <BottomSheetTextInput
                          value={draft.typicalWarrantyDays}
                          onChangeText={(v) =>
                            setSkillDrafts((prev) => ({ ...prev, [service.id]: { ...prev[service.id], typicalWarrantyDays: v } }))
                          }
                          keyboardType="numeric"
                          placeholder="Bảo hành (ngày)"
                          placeholderTextColor={colors.muted}
                          style={styles.skillFieldInput}
                        />
                      </View>
                      {offering && (
                        <View style={styles.verificationBadgeRow}>
                          <View style={styles.verificationBadge}>
                            <Text style={styles.verificationBadgeText}>
                              {{ pending: 'Chờ duyệt', verified: 'Đã duyệt', rejected: 'Bị từ chối' }[offering.verificationStatus]}
                            </Text>
                          </View>
                        </View>
                      )}
                    </>
                  )}
                </View>
              );
            }}
            ListEmptyComponent={<Text style={{ color: colors.textSecondary, padding: 14 }}>Không có dịch vụ nào.</Text>}
          />
        )}
      </BottomSheetModal>

      {/* Location & radius sheet */}
      <BottomSheetModal
        ref={locationSheetRef}
        snapPoints={wideSnapPoints}
        keyboardBehavior="interactive"
        backdropComponent={(props) => (
          <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.5} />
        )}
      >
        <BottomSheetScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
          <Text style={styles.modalTitle}>Vị trí & bán kính hoạt động</Text>
          <View style={{ width: '100%' }}>
            <BottomSheetTextInput
              value={locationLine1}
              onChangeText={handleLocationSearchChange}
              placeholder="Tìm địa chỉ (số nhà, tên đường...)"
              placeholderTextColor={colors.muted}
              style={styles.input}
            />
            {searchingLocation && <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: -8, marginBottom: 8 }} />}
            {locationSuggestions.length > 0 && (
              <View style={styles.suggestionBox}>
                {locationSuggestions.map((s) => (
                  <TouchableOpacity key={s.placeId} style={styles.suggestionItem} onPress={() => handleSelectLocationSuggestion(s)}>
                    <Text style={styles.suggestionText} numberOfLines={2}>{s.description}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
          {(locationWard || locationProvince) ? (
            <Text style={{ fontSize: 12, color: colors.textSecondary, alignSelf: 'flex-start', marginBottom: 12 }}>
              <Ionicons name="location" size={12} /> {[locationWard, locationProvince].filter(Boolean).join(', ')}
            </Text>
          ) : null}

          <View style={{ width: '100%', height: 200, borderRadius: 12, overflow: 'hidden', marginBottom: 12, borderWidth: 1, borderColor: colors.border }}>
            <MapView
              style={{ width: '100%', height: '100%' }}
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

          <TouchableOpacity style={styles.locationBtn} onPress={handleGetCurrentLocation} disabled={gettingLocation}>
            {gettingLocation ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <>
                <Ionicons name="navigate-circle-outline" size={20} color={colors.primary} />
                <Text style={styles.locationBtnText}>Dùng vị trí hiện tại</Text>
              </>
            )}
          </TouchableOpacity>

          <Text style={styles.fieldLabel}>Bán kính hoạt động (km)</Text>
          <BottomSheetTextInput
            value={locationRadiusKm}
            onChangeText={setLocationRadiusKm}
            keyboardType="numeric"
            style={styles.input}
          />

          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => locationSheetRef.current?.dismiss()} disabled={savingLocation}>
              <Text style={styles.cancelBtnText}>Đóng</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.saveBtn, savingLocation && { opacity: 0.7 }]} onPress={handleSaveLocation} disabled={savingLocation}>
              {savingLocation ? <ActivityIndicator size="small" color={colors.surface} /> : <Text style={styles.saveBtnText}>Lưu</Text>}
            </TouchableOpacity>
          </View>
        </BottomSheetScrollView>
      </BottomSheetModal>

      {/* Schedule sheet */}
      <BottomSheetModal
        ref={scheduleSheetRef}
        snapPoints={wideSnapPoints}
        backdropComponent={(props) => (
          <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.5} />
        )}
      >
        <BottomSheetScrollView contentContainerStyle={styles.modalContent}>
          <Text style={styles.modalTitle}>Khung giờ nhận việc theo tuần</Text>
          {scheduleDraft.map((slot, day) => (
            <View key={day} style={styles.scheduleRow}>
              <TouchableOpacity
                style={styles.scheduleDayToggle}
                onPress={() =>
                  setScheduleDraft((prev) => prev.map((s, i) => (i === day ? { ...s, enabled: !s.enabled } : s)))
                }
              >
                <Ionicons
                  name={slot.enabled ? 'checkbox' : 'square-outline'}
                  size={18}
                  color={slot.enabled ? colors.primary : colors.muted}
                />
                <Text style={styles.scheduleDayText}>{DAY_NAMES[day]}</Text>
              </TouchableOpacity>
              {slot.enabled && (
                <View style={styles.scheduleTimesRow}>
                  <View style={styles.scheduleChipRow}>
                    {START_TIMES.map((t) => (
                      <TouchableOpacity
                        key={t}
                        style={[styles.timeChip, slot.startTime === t && styles.timeChipActive]}
                        onPress={() => setScheduleDraft((prev) => prev.map((s, i) => (i === day ? { ...s, startTime: t } : s)))}
                      >
                        <Text style={[styles.timeChipText, slot.startTime === t && styles.timeChipTextActive]}>{t}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={{ color: colors.textSecondary, marginVertical: 4 }}>đến</Text>
                  <View style={styles.scheduleChipRow}>
                    {END_TIMES.map((t) => (
                      <TouchableOpacity
                        key={t}
                        style={[styles.timeChip, slot.endTime === t && styles.timeChipActive]}
                        onPress={() => setScheduleDraft((prev) => prev.map((s, i) => (i === day ? { ...s, endTime: t } : s)))}
                      >
                        <Text style={[styles.timeChipText, slot.endTime === t && styles.timeChipTextActive]}>{t}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
            </View>
          ))}
          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => scheduleSheetRef.current?.dismiss()} disabled={savingSchedule}>
              <Text style={styles.cancelBtnText}>Đóng</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.saveBtn, savingSchedule && { opacity: 0.7 }]} onPress={handleSaveSchedule} disabled={savingSchedule}>
              {savingSchedule ? <ActivityIndicator size="small" color={colors.surface} /> : <Text style={styles.saveBtnText}>Lưu lịch làm việc</Text>}
            </TouchableOpacity>
          </View>
        </BottomSheetScrollView>
      </BottomSheetModal>

      {/* Time-off sheet */}
      <BottomSheetModal
        ref={timeOffSheetRef}
        snapPoints={wideSnapPoints}
        keyboardBehavior="interactive"
        backdropComponent={(props) => (
          <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.5} />
        )}
      >
        <BottomSheetScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
          <Text style={styles.modalTitle}>Ngày nghỉ</Text>

          <View style={{ width: '100%', marginBottom: 16 }}>
            {loadingTimeOff ? (
              <ActivityIndicator color={colors.primary} />
            ) : timeOffList.length === 0 ? (
              <Text style={{ textAlign: 'center', color: colors.muted, marginVertical: 12 }}>Chưa có ngày nghỉ nào.</Text>
            ) : (
              timeOffList.map((t) => (
                <View key={t.id} style={styles.timeOffItem}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.timeOffDates}>
                      {vnDateString(t.startAt)} – {vnDateString(t.endAt)}
                    </Text>
                    {!!t.reason && <Text style={styles.timeOffReason}>{t.reason}</Text>}
                  </View>
                  <TouchableOpacity onPress={() => handleDeleteTimeOff(t.id)} style={styles.iconBtn} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                    <Ionicons name="trash" size={18} color={colors.error} />
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>

          <Text style={[styles.sectionTitle, { alignSelf: 'flex-start' }]}>Thêm ngày nghỉ</Text>
          <View style={{ flexDirection: 'row', gap: 8, width: '100%' }}>
            <BottomSheetTextInput
              value={newTimeOffStart}
              onChangeText={setNewTimeOffStart}
              placeholder="Từ (YYYY-MM-DD)"
              placeholderTextColor={colors.muted}
              style={[styles.input, { flex: 1 }]}
            />
            <BottomSheetTextInput
              value={newTimeOffEnd}
              onChangeText={setNewTimeOffEnd}
              placeholder="Đến (YYYY-MM-DD)"
              placeholderTextColor={colors.muted}
              style={[styles.input, { flex: 1 }]}
            />
          </View>
          <BottomSheetTextInput
            value={newTimeOffReason}
            onChangeText={setNewTimeOffReason}
            placeholder="Lý do (không bắt buộc)"
            placeholderTextColor={colors.muted}
            style={styles.input}
          />
          <TouchableOpacity
            style={[styles.saveBtn, { width: '100%', marginBottom: 16 }, savingTimeOff && { opacity: 0.7 }]}
            onPress={handleAddTimeOff}
            disabled={savingTimeOff}
          >
            {savingTimeOff ? <ActivityIndicator size="small" color={colors.surface} /> : <Text style={styles.saveBtnText}>Thêm ngày nghỉ</Text>}
          </TouchableOpacity>

          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => timeOffSheetRef.current?.dismiss()}>
              <Text style={styles.cancelBtnText}>Đóng</Text>
            </TouchableOpacity>
          </View>
        </BottomSheetScrollView>
      </BottomSheetModal>

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
    </SafeAreaView>
  );
}

const getStyles = (colors: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  name: { fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: 4 },

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
    marginBottom: 12, borderWidth: 4, borderColor: colors.surface, backgroundColor: colors.surface
  },
  avatar: {
    width: '100%', height: '100%', borderRadius: 50,
    backgroundColor: colors.primaryTint, justifyContent: 'center', alignItems: 'center', overflow: 'hidden'
  },
  avatarImage: { width: '100%', height: '100%' },
  avatarText: { fontSize: 36, fontWeight: '700', color: colors.primaryStrong },
  phone: { fontSize: 14, color: colors.textSecondary, fontWeight: '500' },

  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 12 },
  menuContainer: { backgroundColor: colors.surface, borderRadius: 16, overflow: 'hidden', marginBottom: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  menuItem: { flexDirection: 'row', padding: 16, alignItems: 'center' },
  menuIcon: { marginRight: 16 },
  menuContent: { flex: 1 },
  menuTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  menuDesc: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.divider, marginLeft: 54 },
  footer: { alignItems: 'center', marginTop: 12, marginBottom: 32 },
  logoutBtn: { paddingVertical: 12, paddingHorizontal: 24 },
  logoutText: { fontSize: 14, fontWeight: '600', color: colors.error },

  overviewRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  availabilityToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderRadius: 14, marginBottom: 24 },
  availabilityToggleLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  availabilityDot: { width: 10, height: 10, borderRadius: 5 },
  availabilityText: { fontSize: 14, fontWeight: '700', color: colors.text },
  availabilityToggleAction: { fontSize: 13, fontWeight: '700', color: colors.primaryStrong },
  overviewCard: { flex: 1, borderRadius: 16, padding: 16 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  iconCircle: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: 8 },
  cardLabel: { fontSize: 14, color: '#475569', fontWeight: '500' },
  cardValue: { fontSize: 22, fontWeight: '800', color: colors.text },
  cardUnit: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  cameraIconBadge: { position: 'absolute', bottom: 0, right: 0, backgroundColor: colors.primaryStrong, width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: colors.surface },
  avatarModalContainer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center' },
  closeAvatarModalBtn: { position: 'absolute', top: 50, right: 20, zIndex: 10, padding: 8 },
  fullAvatarImage: { width: '100%', height: 400 },

  // ---- Hồ sơ nghề nghiệp sheets ----
  modalContent: { width: '100%', padding: 20, alignItems: 'center' },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 16, alignSelf: 'flex-start' },
  input: { width: '100%', backgroundColor: colors.border, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 14, color: colors.text, marginBottom: 12 },
  fieldLabel: { fontSize: 13, color: colors.textSecondary, alignSelf: 'flex-start', marginBottom: 6, fontWeight: '500' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', width: '100%', marginTop: 8, gap: 12 },
  cancelBtn: { paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12, backgroundColor: colors.border },
  cancelBtnText: { color: colors.textSecondary, fontWeight: '600', fontSize: 14 },
  saveBtn: { paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
  saveBtnText: { color: colors.surface, fontWeight: '600', fontSize: 14 },
  iconBtn: { padding: 8, marginLeft: 4 },
  locationBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 16, backgroundColor: '#E0F2FE', borderRadius: 8, alignSelf: 'flex-start', marginBottom: 16 },
  locationBtnText: { color: colors.primary, fontSize: 13, fontWeight: '600' },
  suggestionBox: { width: '100%', backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, marginTop: -8, marginBottom: 12, overflow: 'hidden' },
  suggestionItem: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  suggestionText: { fontSize: 13, color: colors.text },

  sheetHeader: { paddingHorizontal: 18, paddingTop: 4, paddingBottom: 6, gap: 8 },
  pickerListContent: { padding: 18, paddingTop: 10, gap: 10 },
  skillSectionHeader: { fontSize: 13, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', marginTop: 6, marginBottom: 2 },
  skillSectionCount: { fontWeight: '500', textTransform: 'none' },
  skillCard: { padding: 13, borderWidth: 1, borderColor: colors.border, borderRadius: 12, gap: 10 },
  skillCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  skillToggleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  skillName: { fontSize: 14, fontWeight: '600', color: colors.text, flexShrink: 1 },
  skillSaveBtn: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 8, backgroundColor: colors.primaryTint, flexShrink: 0 },
  skillSaveBtnText: { color: colors.primary, fontWeight: '700', fontSize: 12 },
  skillFieldsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingLeft: 28 },
  skillFieldInput: { minWidth: 110, flex: 1, height: 38, paddingHorizontal: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 8, color: colors.text, fontSize: 13 },
  verificationBadgeRow: { paddingLeft: 28 },
  verificationBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: colors.border, justifyContent: 'center' },
  verificationBadgeText: { fontSize: 10, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase' },

  scheduleRow: { width: '100%', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 8 },
  scheduleDayToggle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scheduleDayText: { fontSize: 14, fontWeight: '600', color: colors.text },
  scheduleTimesRow: { paddingLeft: 26 },
  scheduleChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  timeChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: colors.border },
  timeChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  timeChipText: { fontSize: 12, color: colors.text },
  timeChipTextActive: { color: colors.surface, fontWeight: '700' },

  timeOffItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.background, padding: 12, borderRadius: 12, marginBottom: 8, width: '100%' },
  timeOffDates: { fontSize: 13, fontWeight: '600', color: colors.text },
  timeOffReason: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
});
