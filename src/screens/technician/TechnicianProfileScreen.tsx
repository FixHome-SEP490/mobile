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
  type BottomSheetBackdropProps,
  BottomSheetSectionList,
  BottomSheetScrollView,
  BottomSheetTextInput,
} from '@gorhom/bottom-sheet';
import * as Haptics from 'expo-haptics';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CalendarDays,
  CalendarOff,
  CalendarRange,
  ChartColumn,
  Camera,
  CheckSquare,
  ChevronRight,
  LocateFixed,
  LogOut,
  MapPin,
  MessageSquareText,
  ShieldCheck,
  Square,
  Star,
  Trash2,
  Wallet,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuthStore } from '../../store';
import type { RootStackParamList } from '../../types';
import { usersApi, type AddressData } from '../../api/users.api';
import { mediaApi } from '../../api/media.api';
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
import { formatVnd, parseVnDateInput } from '../../utils/format';
import StatusBadge from '../../components/StatusBadge';
import type { StatusView } from './technician-status';

import { vnDateString } from '../../utils/vn-time';
import { NO_RATING_TEXT, formatRating, ratingValue } from '../../utils/rating';
import { avatarErrorMessage, updateMyAvatar } from '../../services/avatar-upload';

const VN_DATE = { day: '2-digit', month: '2-digit', year: 'numeric' } as const;
// Floating GlassTabBar: 64pt pill + breathing room, plus the bottom inset (min 16).
const TAB_BAR_CLEARANCE = 64 + 16;

const VERIFICATION_VIEW: Record<string, StatusView> = {
  pending: { label: 'Chờ duyệt', tone: 'warning', icon: 'Clock' },
  verified: { label: 'Đã duyệt', tone: 'success', icon: 'CheckCircle2' },
  rejected: { label: 'Bị từ chối', tone: 'danger', icon: 'XCircle' },
};

const renderBackdrop = (props: BottomSheetBackdropProps) => (
  <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.5} />
);

const DAY_NAMES = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
const START_TIMES = ['06:00', '07:00', '08:00', '09:00', '10:00', '13:00', '14:00'];
const END_TIMES = ['12:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00'];

type ProfileStyles = ReturnType<typeof getStyles>;

function MenuRow({ styles, colors, Icon, title, desc, onPress }: {
  styles: ProfileStyles;
  colors: ReturnType<typeof useAppTheme>['colors'];
  Icon: LucideIcon;
  title: string;
  desc?: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.menuItem} onPress={onPress} accessibilityRole="button" accessibilityLabel={desc ? `${title}, ${desc}` : title}>
      <View style={styles.menuIconTile}>
        <Icon size={20} color={colors.primaryStrong} strokeWidth={1.75} />
      </View>
      <View style={styles.menuContent}>
        <Text style={styles.menuTitle}>{title}</Text>
        {!!desc && <Text style={styles.menuDesc} numberOfLines={1}>{desc}</Text>}
      </View>
      <ChevronRight size={20} color={colors.muted} strokeWidth={1.75} />
    </TouchableOpacity>
  );
}

export default function TechnicianProfileScreen() {
  const { colors, isDark } = useAppTheme();
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();
  const logout = useAuthStore((state) => state.logout);
  const { user } = useAuthStore();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [fullName, setFullName] = useState(user?.fullName || 'Kỹ thuật viên');
  const [phoneNumber, setPhoneNumber] = useState(user?.phoneNumber || '');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user?.avatarUrl || null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
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
  const [locationRadiusKm, setLocationRadiusKm] = useState('');
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

  // Same flow as the customer: upload to /media/upload, save the hosted URL on
  // the profile, then refresh the session user. The old photo stays on screen
  // until the server has confirmed the new one.
  const handlePickImage = async () => {
    if (uploadingAvatar) return;
    Haptics.selectionAsync();
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    setUploadingAvatar(true);
    try {
      const hostedUrl = await updateMyAvatar(
        { uri: asset.uri, fileName: asset.fileName, mimeType: asset.mimeType },
        { uploadImage: mediaApi.uploadPublicImage, updateProfile: usersApi.updateProfile },
        useAuthStore,
      );
      setAvatarUrl(hostedUrl);
      Alert.alert('Đã cập nhật ảnh đại diện', 'Ảnh mới đã được lưu vào hồ sơ của bạn.');
    } catch (err: unknown) {
      Alert.alert('Không thể cập nhật ảnh đại diện', avatarErrorMessage(err));
    } finally {
      setUploadingAvatar(false);
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
    setLocationRadiusKm(
      technicianProfile?.serviceRadiusKm != null ? String(technicianProfile.serviceRadiusKm) : '',
    );
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
    const radiusText = locationRadiusKm.trim().replace(',', '.');
    const radiusKm = Number(radiusText);
    if (!radiusText || !Number.isFinite(radiusKm) || radiusKm < 1 || radiusKm > 40) {
      Alert.alert('Lỗi', 'Bán kính hoạt động từ 1 đến 40 km.');
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
        serviceRadiusKm: radiusKm,
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
    const start = parseVnDateInput(newTimeOffStart);
    const end = parseVnDateInput(newTimeOffEnd);
    if (!start || !end) {
      Alert.alert('Lỗi', 'Vui lòng nhập đủ ngày bắt đầu và kết thúc theo dạng dd/MM/yyyy.');
      return;
    }
    if (end < start) {
      Alert.alert('Lỗi', 'Ngày kết thúc phải sau hoặc trùng ngày bắt đầu.');
      return;
    }
    setSavingTimeOff(true);
    try {
      await technicianProfileApi.createTimeOff({
        startAt: `${start}T00:00:00`,
        endAt: `${end}T23:59:59`,
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
    Alert.alert('Xóa ngày nghỉ', 'Bạn có thể được xếp việc trở lại trong khoảng ngày này sau khi xóa.', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: async () => {
          try {
            await technicianProfileApi.deleteTimeOff(id);
            setTimeOffList((prev) => prev.filter((t) => t.id !== id));
          } catch {
            Alert.alert('Lỗi', 'Không thể xóa ngày nghỉ.');
          }
        },
      },
    ]);
  };

  const handleLogout = () => {
    Alert.alert('Đăng xuất?', 'Bạn có chắc muốn đăng xuất khỏi FixHome?', [
      { text: 'Ở lại', style: 'cancel' },
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

  const phoneLine = phoneNumber || user?.email || 'Kỹ thuật viên FixHome';
  // 0 reviews or a null average is "no rating yet", never an invented score.
  const rating = technicianProfile
    ? ratingValue(technicianProfile.averageRating, technicianProfile.ratingCount)
    : null;
  const activeSkillCount = Object.values(myOfferings).filter((o) => o.isActive).length;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: TAB_BAR_CLEARANCE + Math.max(insets.bottom, 16) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.pageTitle} accessibilityRole="header">Hồ sơ kỹ thuật viên</Text>

        {/* Identity */}
        <View style={styles.identity}>
          <View style={styles.avatarBorder}>
            <TouchableOpacity
              onPress={() => avatarUrl && setAvatarModalVisible(true)}
              activeOpacity={0.8}
              style={styles.avatar}
              accessibilityRole="button"
              accessibilityLabel="Xem ảnh đại diện"
            >
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatarImage} accessibilityIgnoresInvertColors />
              ) : (
                <Text style={styles.avatarText}>{fullName.charAt(0)}</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.cameraIconBadge, uploadingAvatar && { opacity: 0.75 }]}
              onPress={handlePickImage}
              disabled={uploadingAvatar}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={uploadingAvatar ? 'Đang tải ảnh đại diện' : 'Đổi ảnh đại diện'}
              accessibilityState={{ disabled: uploadingAvatar, busy: uploadingAvatar }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              {uploadingAvatar ? (
                <ActivityIndicator size="small" color={colors.surface} />
              ) : (
                <Camera size={14} color={colors.surface} strokeWidth={2} />
              )}
            </TouchableOpacity>
          </View>
          <View style={styles.identityText}>
            <Text style={styles.name} numberOfLines={2}>{fullName}</Text>
            <Text style={styles.phone}>{phoneLine}</Text>
            {technicianProfile && (
              <View style={styles.chipRow}>
                {rating !== null ? (
                  <View style={[styles.chip, { backgroundColor: colors.tone.warning.bg }]}>
                    <Star size={14} color={colors.tone.warning.fg} strokeWidth={2} />
                    <Text style={[styles.chipText, { color: colors.tone.warning.text }]}>
                      {formatRating(rating)}
                    </Text>
                  </View>
                ) : (
                  <View style={[styles.chip, { backgroundColor: colors.background }]}>
                    <Text style={[styles.chipText, { color: colors.textSecondary }]}>{NO_RATING_TEXT}</Text>
                  </View>
                )}
                {technicianProfile.reliabilityScore !== null && (
                  <View style={[styles.chip, { backgroundColor: colors.tone.success.bg }]}>
                    <Text style={[styles.chipText, { color: colors.tone.success.text }]}>
                      Độ tin cậy {technicianProfile.reliabilityScore}%
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>
        </View>

        {/* Thu nhập & ví */}
        <View style={[styles.group, styles.incomeCard]}>
          <Text style={styles.caption}>Tổng thu nhập từ đơn đã hoàn thành</Text>
          <Text style={styles.incomeValue}>{formatVnd(earningsTotal)}</Text>
        </View>
        <View style={styles.group}>
          <MenuRow
            styles={styles}
            colors={colors}
            Icon={Wallet}
            title="Ví của tôi"
            desc="Số dư, nạp tiền, rút tiền"
            onPress={() => navigation.navigate('TechnicianWallet')}
          />
        </View>

        <View style={styles.group}>
          <MenuRow
            styles={styles}
            colors={colors}
            Icon={ChartColumn}
            title="Thống kê thu nhập"
            desc="Theo tuần, theo tháng"
            onPress={() => navigation.navigate('TechnicianEarnings')}
          />
          <View style={styles.divider} />
          <MenuRow
            styles={styles}
            colors={colors}
            Icon={CalendarRange}
            title="Lịch làm việc"
            desc="Đơn theo ngày và ngày nghỉ"
            onPress={() => navigation.navigate('TechnicianSchedule')}
          />
          <View style={styles.divider} />
          <MenuRow
            styles={styles}
            colors={colors}
            Icon={MessageSquareText}
            title="Đánh giá từ khách hàng"
            desc={
              technicianProfile
                ? rating !== null
                  ? `${formatRating(rating)} sao · ${technicianProfile.ratingCount} đánh giá`
                  : NO_RATING_TEXT
                : undefined
            }
            onPress={() => navigation.navigate('TechnicianReviews')}
          />
        </View>

        {/* HỒ SƠ NGHỀ NGHIỆP */}
        <Text style={styles.sectionTitle}>Hồ sơ nghề nghiệp</Text>
        <View style={styles.group}>
          <MenuRow
            styles={styles}
            colors={colors}
            Icon={Wrench}
            title="Kỹ năng và dịch vụ nhận làm"
            desc={activeSkillCount > 0 ? `${activeSkillCount} dịch vụ đang nhận` : 'Chọn dịch vụ bạn nhận làm'}
            onPress={openSkillsSheet}
          />
          <View style={styles.divider} />
          <MenuRow
            styles={styles}
            colors={colors}
            Icon={MapPin}
            title="Vị trí và bán kính hoạt động"
            desc={
              technicianAddress
                ? technicianProfile?.serviceRadiusKm != null
                  ? `${technicianAddress.line1} · ${technicianProfile.serviceRadiusKm} km`
                  : technicianAddress.line1
                : 'Chưa cập nhật vị trí'
            }
            onPress={openLocationSheet}
          />
          <View style={styles.divider} />
          <MenuRow
            styles={styles}
            colors={colors}
            Icon={MapPin}
            title="Khu vực phục vụ"
            desc="Quận/huyện bạn nhận việc"
            onPress={() => navigation.navigate('TechnicianServiceAreas')}
          />
          <View style={styles.divider} />
          <MenuRow
            styles={styles}
            colors={colors}
            Icon={CalendarDays}
            title="Khung giờ nhận việc"
            desc={technicianProfile ? `${technicianProfile.schedules.length} khung giờ trong tuần` : 'Đang tải…'}
            onPress={openScheduleSheet}
          />
          <View style={styles.divider} />
          <MenuRow
            styles={styles}
            colors={colors}
            Icon={CalendarOff}
            title="Ngày nghỉ"
            desc="Đăng ký các khoảng ngày không nhận việc"
            onPress={openTimeOffSheet}
          />
        </View>

        {/* TÀI KHOẢN */}
        <Text style={styles.sectionTitle}>Tài khoản</Text>
        <View style={styles.group}>
          <MenuRow
            styles={styles}
            colors={colors}
            Icon={ShieldCheck}
            title="Xác minh danh tính"
            desc="Cập nhật CCCD và thông tin"
            onPress={() => navigation.navigate('TechnicianKyc')}
          />
        </View>

        <TouchableOpacity
          onPress={handleLogout}
          style={styles.logoutBtn}
          accessibilityRole="button"
          accessibilityLabel="Đăng xuất"
        >
          <LogOut size={20} color={colors.error} strokeWidth={1.75} />
          <Text style={styles.logoutText}>Đăng xuất</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Skills sheet */}
      <BottomSheetModal
        ref={skillsSheetRef}
        snapPoints={wideSnapPoints}
        backdropComponent={renderBackdrop}
      >
        <View style={styles.sheetHeader}>
          <Text style={styles.modalTitle} accessibilityRole="header">Kỹ năng và dịch vụ nhận làm</Text>
          {pickerCategories.length > 0 && (
            <CategoryPills categories={pickerCategories} selectedId={pickerCategoryId} onSelect={setPickerCategoryId} />
          )}
        </View>
        {loadingSkills ? (
          <ActivityIndicator color={colors.primaryStrong} style={styles.sheetSpinner} />
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
              const verification = offering ? VERIFICATION_VIEW[offering.verificationStatus] : undefined;
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
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: draft.enabled }}
                      accessibilityLabel={service.name}
                    >
                      {draft.enabled ? (
                        <CheckSquare size={22} color={colors.primaryStrong} strokeWidth={1.75} />
                      ) : (
                        <Square size={22} color={colors.textSecondary} strokeWidth={1.75} />
                      )}
                      <Text style={styles.skillName} numberOfLines={2}>{service.name}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.skillSaveBtn}
                      disabled={savingSkillId === service.id}
                      onPress={() => handleSaveSkill(service)}
                      accessibilityRole="button"
                      accessibilityLabel={`Lưu ${service.name}`}
                    >
                      {savingSkillId === service.id ? (
                        <ActivityIndicator size="small" color={colors.primaryStrong} />
                      ) : (
                        <Text style={styles.skillSaveBtnText}>Lưu</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                  {draft.enabled && (
                    <>
                      <View style={styles.skillFieldsRow}>
                        {!isFixedPrice && (
                          <View style={styles.skillField}>
                            <Text style={styles.fieldLabel}>Giá công (₫)</Text>
                            <BottomSheetTextInput
                              value={draft.listedLaborPrice}
                              onChangeText={(v) =>
                                setSkillDrafts((prev) => ({ ...prev, [service.id]: { ...prev[service.id], listedLaborPrice: v } }))
                              }
                              keyboardType="numeric"
                              placeholder="Nhập giá công"
                              placeholderTextColor={colors.textSecondary}
                              accessibilityLabel={`Giá công ${service.name}`}
                              style={styles.skillFieldInput}
                            />
                          </View>
                        )}
                        <View style={styles.skillField}>
                          <Text style={styles.fieldLabel}>Bảo hành (ngày)</Text>
                          <BottomSheetTextInput
                            value={draft.typicalWarrantyDays}
                            onChangeText={(v) =>
                              setSkillDrafts((prev) => ({ ...prev, [service.id]: { ...prev[service.id], typicalWarrantyDays: v } }))
                            }
                            keyboardType="numeric"
                            placeholder="Số ngày"
                            placeholderTextColor={colors.textSecondary}
                            accessibilityLabel={`Bảo hành ${service.name}`}
                            style={styles.skillFieldInput}
                          />
                        </View>
                      </View>
                      {verification && <StatusBadge view={verification} />}
                    </>
                  )}
                </View>
              );
            }}
            ListEmptyComponent={<Text style={styles.emptyText}>Không có dịch vụ nào.</Text>}
          />
        )}
      </BottomSheetModal>

      {/* Location & radius sheet */}
      <BottomSheetModal
        ref={locationSheetRef}
        snapPoints={wideSnapPoints}
        keyboardBehavior="interactive"
        backdropComponent={renderBackdrop}
      >
        <BottomSheetScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
          <Text style={styles.modalTitle} accessibilityRole="header">Vị trí và bán kính hoạt động</Text>
          <Text style={styles.fieldLabel}>Địa chỉ</Text>
          <BottomSheetTextInput
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
          <BottomSheetTextInput
            value={locationRadiusKm}
            onChangeText={setLocationRadiusKm}
            keyboardType="numeric"
            accessibilityLabel="Bán kính hoạt động (km)"
            style={styles.input}
          />

          <View style={styles.modalActions}>
            <TouchableOpacity
              style={[styles.secondaryBtn, styles.flex1]}
              onPress={() => locationSheetRef.current?.dismiss()}
              disabled={savingLocation}
              accessibilityRole="button"
            >
              <Text style={styles.secondaryBtnText}>Đóng</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.primaryBtn, styles.flex1, savingLocation && styles.disabled]}
              onPress={handleSaveLocation}
              disabled={savingLocation}
              accessibilityRole="button"
            >
              {savingLocation ? <ActivityIndicator size="small" color={colors.surface} /> : <Text style={styles.primaryBtnText}>Lưu thay đổi</Text>}
            </TouchableOpacity>
          </View>
        </BottomSheetScrollView>
      </BottomSheetModal>

      {/* Schedule sheet */}
      <BottomSheetModal
        ref={scheduleSheetRef}
        snapPoints={wideSnapPoints}
        backdropComponent={renderBackdrop}
      >
        <BottomSheetScrollView contentContainerStyle={styles.modalContent}>
          <Text style={styles.modalTitle} accessibilityRole="header">Khung giờ nhận việc theo tuần</Text>
          {scheduleDraft.map((slot, day) => (
            <View key={day} style={styles.scheduleRow}>
              <TouchableOpacity
                style={styles.scheduleDayToggle}
                onPress={() =>
                  setScheduleDraft((prev) => prev.map((s, i) => (i === day ? { ...s, enabled: !s.enabled } : s)))
                }
                accessibilityRole="checkbox"
                accessibilityState={{ checked: slot.enabled }}
                accessibilityLabel={DAY_NAMES[day]}
              >
                {slot.enabled ? (
                  <CheckSquare size={22} color={colors.primaryStrong} strokeWidth={1.75} />
                ) : (
                  <Square size={22} color={colors.textSecondary} strokeWidth={1.75} />
                )}
                <Text style={styles.scheduleDayText}>{DAY_NAMES[day]}</Text>
              </TouchableOpacity>
              {slot.enabled && (
                <View style={styles.scheduleTimesRow}>
                  <Text style={styles.caption}>Từ</Text>
                  <View style={styles.scheduleChipRow}>
                    {START_TIMES.map((t) => (
                      <TouchableOpacity
                        key={t}
                        style={[styles.timeChip, slot.startTime === t && styles.timeChipActive]}
                        onPress={() => setScheduleDraft((prev) => prev.map((s, i) => (i === day ? { ...s, startTime: t } : s)))}
                        accessibilityRole="button"
                        accessibilityState={{ selected: slot.startTime === t }}
                        accessibilityLabel={`Bắt đầu ${t}`}
                      >
                        <Text style={[styles.timeChipText, slot.startTime === t && styles.timeChipTextActive]}>{t}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={styles.caption}>Đến</Text>
                  <View style={styles.scheduleChipRow}>
                    {END_TIMES.map((t) => (
                      <TouchableOpacity
                        key={t}
                        style={[styles.timeChip, slot.endTime === t && styles.timeChipActive]}
                        onPress={() => setScheduleDraft((prev) => prev.map((s, i) => (i === day ? { ...s, endTime: t } : s)))}
                        accessibilityRole="button"
                        accessibilityState={{ selected: slot.endTime === t }}
                        accessibilityLabel={`Kết thúc ${t}`}
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
            <TouchableOpacity
              style={[styles.secondaryBtn, styles.flex1]}
              onPress={() => scheduleSheetRef.current?.dismiss()}
              disabled={savingSchedule}
              accessibilityRole="button"
            >
              <Text style={styles.secondaryBtnText}>Đóng</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.primaryBtn, styles.flex2, savingSchedule && styles.disabled]}
              onPress={handleSaveSchedule}
              disabled={savingSchedule}
              accessibilityRole="button"
            >
              {savingSchedule ? <ActivityIndicator size="small" color={colors.surface} /> : <Text style={styles.primaryBtnText}>Lưu khung giờ</Text>}
            </TouchableOpacity>
          </View>
        </BottomSheetScrollView>
      </BottomSheetModal>

      {/* Time-off sheet */}
      <BottomSheetModal
        ref={timeOffSheetRef}
        snapPoints={wideSnapPoints}
        keyboardBehavior="interactive"
        backdropComponent={renderBackdrop}
      >
        <BottomSheetScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
          <Text style={styles.modalTitle} accessibilityRole="header">Ngày nghỉ</Text>

          <View style={styles.timeOffList}>
            {loadingTimeOff ? (
              <ActivityIndicator color={colors.primaryStrong} />
            ) : timeOffList.length === 0 ? (
              <Text style={styles.emptyText}>Chưa có ngày nghỉ nào.</Text>
            ) : (
              timeOffList.map((t) => (
                <View key={t.id} style={styles.timeOffItem}>
                  <View style={styles.flex1}>
                    <Text style={styles.timeOffDates}>
                      {vnDateString(t.startAt, VN_DATE)} – {vnDateString(t.endAt, VN_DATE)}
                    </Text>
                    {!!t.reason && <Text style={styles.timeOffReason}>{t.reason}</Text>}
                  </View>
                  <TouchableOpacity
                    onPress={() => handleDeleteTimeOff(t.id)}
                    style={styles.iconBtn}
                    accessibilityRole="button"
                    accessibilityLabel={`Xóa ngày nghỉ ${vnDateString(t.startAt, VN_DATE)} đến ${vnDateString(t.endAt, VN_DATE)}`}
                  >
                    <Trash2 size={20} color={colors.error} strokeWidth={1.75} />
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>

          <Text style={styles.subTitle}>Thêm ngày nghỉ</Text>
          <View style={styles.dateRow}>
            <View style={styles.flex1}>
              <Text style={styles.fieldLabel}>Từ ngày</Text>
              <BottomSheetTextInput
                value={newTimeOffStart}
                onChangeText={setNewTimeOffStart}
                keyboardType="numbers-and-punctuation"
                placeholder="dd/MM/yyyy"
                placeholderTextColor={colors.textSecondary}
                accessibilityLabel="Từ ngày, định dạng ngày/tháng/năm"
                style={styles.input}
              />
            </View>
            <View style={styles.flex1}>
              <Text style={styles.fieldLabel}>Đến ngày</Text>
              <BottomSheetTextInput
                value={newTimeOffEnd}
                onChangeText={setNewTimeOffEnd}
                keyboardType="numbers-and-punctuation"
                placeholder="dd/MM/yyyy"
                placeholderTextColor={colors.textSecondary}
                accessibilityLabel="Đến ngày, định dạng ngày/tháng/năm"
                style={styles.input}
              />
            </View>
          </View>
          <Text style={styles.fieldLabel}>Lý do (không bắt buộc)</Text>
          <BottomSheetTextInput
            value={newTimeOffReason}
            onChangeText={setNewTimeOffReason}
            placeholder="Nhập lý do"
            placeholderTextColor={colors.textSecondary}
            accessibilityLabel="Lý do nghỉ"
            style={styles.input}
          />
          <TouchableOpacity
            style={[styles.primaryBtn, styles.fullWidth, savingTimeOff && styles.disabled]}
            onPress={handleAddTimeOff}
            disabled={savingTimeOff}
            accessibilityRole="button"
          >
            {savingTimeOff ? <ActivityIndicator size="small" color={colors.surface} /> : <Text style={styles.primaryBtnText}>Thêm ngày nghỉ</Text>}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.secondaryBtn, styles.fullWidth]}
            onPress={() => timeOffSheetRef.current?.dismiss()}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryBtnText}>Đóng</Text>
          </TouchableOpacity>
        </BottomSheetScrollView>
      </BottomSheetModal>

      <Modal visible={isAvatarModalVisible} transparent={true} animationType="fade" onRequestClose={() => setAvatarModalVisible(false)}>
        <View style={styles.avatarModalContainer}>
          <TouchableOpacity
            style={styles.closeAvatarModalBtn}
            onPress={() => setAvatarModalVisible(false)}
            accessibilityRole="button"
            accessibilityLabel="Đóng"
          >
            <X size={28} color="#FFFFFF" strokeWidth={1.75} />
          </TouchableOpacity>
          {avatarUrl && (
            <Image source={{ uri: avatarUrl }} style={styles.fullAvatarImage} resizeMode="contain" accessibilityIgnoresInvertColors />
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const getStyles = (colors: ReturnType<typeof useAppTheme>['colors']) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex1: { flex: 1 },
  flex2: { flex: 2 },
  fullWidth: { width: '100%', marginTop: 8 },
  disabled: { opacity: 0.5 },
  scrollContent: { padding: 16, gap: 12 },
  pageTitle: { fontSize: 24, lineHeight: 32, fontWeight: '700', color: colors.text },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 8 },
  identityText: { flex: 1, gap: 2 },
  name: { fontSize: 20, lineHeight: 28, fontWeight: '600', color: colors.text },
  phone: { fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 24, paddingHorizontal: 8, borderRadius: 8 },
  chipText: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  avatarBorder: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center' },
  avatar: { width: '100%', height: '100%', borderRadius: 40, backgroundColor: colors.primaryTint, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  avatarImage: { width: '100%', height: '100%' },
  avatarText: { fontSize: 32, fontWeight: '700', color: colors.primaryStrong },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500', color: colors.textSecondary },
  incomeCard: { padding: 16, gap: 4 },
  incomeValue: { fontSize: 24, lineHeight: 32, fontWeight: '700', color: colors.text },
  sectionTitle: { fontSize: 20, lineHeight: 28, fontWeight: '600', color: colors.text, marginTop: 12 },
  group: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  menuItem: { flexDirection: 'row', minHeight: 56, paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center', gap: 12 },
  menuIconTile: { width: 36, height: 36, borderRadius: 8, backgroundColor: colors.primarySoft, justifyContent: 'center', alignItems: 'center' },
  menuContent: { flex: 1 },
  menuTitle: { fontSize: 16, lineHeight: 24, fontWeight: '500', color: colors.text },
  menuDesc: { fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  divider: { height: 1, backgroundColor: colors.divider, marginLeft: 64 },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48, marginTop: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  logoutText: { fontSize: 16, lineHeight: 24, fontWeight: '600', color: colors.error },
  cameraIconBadge: { position: 'absolute', bottom: 0, right: 0, backgroundColor: colors.primaryStrong, width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: colors.background },
  avatarModalContainer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center' },
  closeAvatarModalBtn: { position: 'absolute', top: 50, right: 12, zIndex: 10, width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  fullAvatarImage: { width: '100%', height: 400 },

  // ---- Hồ sơ nghề nghiệp sheets ----
  modalContent: { width: '100%', padding: 20, paddingBottom: 40 },
  modalTitle: { fontSize: 20, lineHeight: 28, fontWeight: '600', color: colors.text, marginBottom: 16 },
  subTitle: { fontSize: 16, lineHeight: 24, fontWeight: '600', color: colors.text, marginBottom: 8 },
  fieldLabel: { fontSize: 14, lineHeight: 20, color: colors.text, marginBottom: 6, fontWeight: '500' },
  input: { width: '100%', minHeight: 48, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.textSecondary, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, fontSize: 16, color: colors.text, marginBottom: 12 },
  emptyText: { textAlign: 'center', fontSize: 14, lineHeight: 20, color: colors.textSecondary, marginVertical: 12 },
  modalActions: { flexDirection: 'row', width: '100%', marginTop: 8, gap: 12 },
  primaryBtn: { minHeight: 48, borderRadius: 14, backgroundColor: colors.primaryStrong, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16 },
  primaryBtnText: { color: colors.surface, fontWeight: '600', fontSize: 16, lineHeight: 24 },
  secondaryBtn: { minHeight: 48, borderRadius: 14, borderWidth: 1.5, borderColor: colors.primaryStrong, backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16 },
  secondaryBtnText: { color: colors.primaryStrong, fontWeight: '600', fontSize: 16, lineHeight: 24 },
  iconBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
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

  sheetHeader: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 6, gap: 8 },
  sheetSpinner: { marginTop: 24 },
  pickerListContent: { padding: 20, paddingTop: 10, gap: 12 },
  skillSectionHeader: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.textSecondary, marginTop: 6, marginBottom: 2 },
  skillSectionCount: { fontWeight: '500' },
  skillCard: { padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 14, gap: 12, backgroundColor: colors.surface },
  skillCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  skillToggleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, minHeight: 44 },
  skillName: { fontSize: 16, lineHeight: 24, fontWeight: '600', color: colors.text, flexShrink: 1 },
  skillSaveBtn: { minHeight: 44, minWidth: 64, paddingHorizontal: 16, borderRadius: 14, backgroundColor: colors.primarySoft, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  skillSaveBtnText: { color: colors.primaryStrong, fontWeight: '700', fontSize: 14, lineHeight: 20 },
  skillFieldsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  skillField: { minWidth: 120, flex: 1 },
  skillFieldInput: { minHeight: 44, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.textSecondary, borderRadius: 14, color: colors.text, fontSize: 16, backgroundColor: colors.surface },

  scheduleRow: { width: '100%', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.divider, gap: 8 },
  scheduleDayToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  scheduleDayText: { fontSize: 16, lineHeight: 24, fontWeight: '600', color: colors.text },
  scheduleTimesRow: { paddingLeft: 30, gap: 6 },
  scheduleChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  timeChip: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border },
  timeChipActive: { backgroundColor: colors.primaryStrong, borderColor: colors.primaryStrong },
  timeChipText: { fontSize: 14, lineHeight: 20, color: colors.text },
  timeChipTextActive: { color: colors.surface, fontWeight: '700' },

  timeOffList: { width: '100%', marginBottom: 16 },
  dateRow: { flexDirection: 'row', gap: 12, width: '100%' },
  timeOffItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingLeft: 12, borderRadius: 14, marginBottom: 8, width: '100%' },
  timeOffDates: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.text },
  timeOffReason: { fontSize: 14, lineHeight: 20, color: colors.textSecondary },
});
