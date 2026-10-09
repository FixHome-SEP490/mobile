// src/screens/technician/TechnicianOnboardingScreen.tsx
//
// Đăng ký kỹ thuật viên 5 bước, khớp `web/src/pages/technician/TechnicianOnboardingPage.vue`:
// 1 thông tin cá nhân → 2 xác minh danh tính → 3 kỹ năng → 4 địa chỉ và khu vực → 5 gửi duyệt.
// Bước 2 dùng lại TechnicianKycScreen để không nhân đôi phần chụp/tải ảnh.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../types';
import { useAppTheme, type ThemeColors } from '../../constants/theme';
import { useAuthStore } from '../../store';
import { authApi } from '../../api/auth.api';
import { geoApi, type PlaceSuggestion, type Province } from '../../api/geo.api';
import { servicesApi, type CategoryItem, type ServiceItem } from '../../api/services.api';
import { technicianProfileApi } from '../../api/technician-profile.api';
import {
  technicianOnboardingApi,
  type Gender,
  type OnboardingStatusResponse,
} from '../../api/technician-onboarding.api';
import {
  extractApiErrorMessage,
  validateFullName,
  validatePhoneNumber,
} from '../../utils/input-validation';
import {
  ONBOARDING_STEPS,
  SERVICE_RADIUS_OPTIONS_KM,
  detectArea,
  formatDobInput,
  keysToServiceAreas,
  parseDob,
  resolveOnboardingView,
  serviceAreasToKeys,
  toAreaKey,
  validateCitizenId,
  validateDob,
} from './technician-onboarding';

const GENDERS: { value: Gender; label: string }[] = [
  { value: 'male', label: 'Nam' },
  { value: 'female', label: 'Nữ' },
  { value: 'other', label: 'Khác' },
];

const MAX_YEARS = 50;
const HO_CHI_MINH_CODE = 79;

export default function TechnicianOnboardingScreen() {
  const { colors } = useAppTheme();
  const styles = getStyles(colors);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<OnboardingStatusResponse | null>(null);
  const [step, setStep] = useState(1);
  const [editingRejected, setEditingRejected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Bước 1
  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [dob, setDob] = useState('');
  const [gender, setGender] = useState<Gender>('male');
  const [citizenId, setCitizenId] = useState('');
  const [phone, setPhone] = useState(user?.phoneNumber ?? '');
  const [showStep1Errors, setShowStep1Errors] = useState(false);

  // Bước 3
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [yearsExperience, setYearsExperience] = useState(2);
  const [bio, setBio] = useState('');

  // Bước 4
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [address, setAddress] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [radiusKm, setRadiusKm] = useState(15);
  const [activeProvinceCode, setActiveProvinceCode] = useState(HO_CHI_MINH_CODE);
  const [provinceQuery, setProvinceQuery] = useState('');
  const [provincePickerOpen, setProvincePickerOpen] = useState(false);
  const [areaKeys, setAreaKeys] = useState<string[]>([]);
  const suggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const initialised = useRef(false);

  // ── Tải dữ liệu ──────────────────────────────────────────────────────

  const refreshStatus = useCallback(async () => {
    try {
      setStatus(await technicianOnboardingApi.getStatus());
      setError(null);
    } catch (err) {
      setError(
        extractApiErrorMessage(err, 'Không thể tải hồ sơ đăng ký. Vui lòng thử lại.'),
      );
    }
  }, []);

  // Quay lại từ màn Xác minh danh tính thì đọc lại trạng thái nộp ảnh.
  useFocusEffect(
    useCallback(() => {
      if (initialised.current) void refreshStatus();
    }, [refreshStatus]),
  );

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const [statusRes, servicesRes, categoriesRes, provincesRes, profileRes, offeringsRes] =
        await Promise.all([
          technicianOnboardingApi.getStatus().catch((err) => {
            if (mounted) {
              setError(
                extractApiErrorMessage(err, 'Không thể tải hồ sơ đăng ký. Vui lòng thử lại.'),
              );
            }
            return null;
          }),
          servicesApi.getServices({ pageSize: 100 }).catch(() => ({ data: [] as ServiceItem[] })),
          servicesApi.getCategories().catch(() => [] as CategoryItem[]),
          geoApi.getProvinces().catch(() => [] as Province[]),
          technicianProfileApi.getMyProfile().catch(() => null),
          technicianProfileApi.getMyServices().catch(() => []),
        ]);
      if (!mounted) return;

      setServices(servicesRes.data.filter((s) => s.isActive));
      setCategories(categoriesRes);
      setProvinces(provincesRes);

      if (statusRes) {
        setStatus(statusRes);
        setStep(Math.min(5, Math.max(1, statusRes.currentStep)));
        if (statusRes.fullAddress) setAddress(statusRes.fullAddress);
        if (statusRes.latitude !== undefined && statusRes.longitude !== undefined) {
          setCoords({ lat: statusRes.latitude, lng: statusRes.longitude });
        }
        if (statusRes.serviceRadiusKm) setRadiusKm(statusRes.serviceRadiusKm);
        if (statusRes.serviceAreas?.length) {
          setAreaKeys(serviceAreasToKeys(statusRes.serviceAreas));
          setActiveProvinceCode(Number(statusRes.serviceAreas[0].provinceCode));
        }
        if (statusRes.skillsSelected) {
          setSelectedServiceIds(offeringsRes.map((o) => o.serviceId));
          if (profileRes) {
            setYearsExperience(profileRes.yearsExperience);
            setBio(profileRes.bio ?? '');
          }
        }
      }
      initialised.current = true;
      setLoading(false);
    })();
    return () => {
      mounted = false;
      if (suggestTimer.current) clearTimeout(suggestTimer.current);
    };
  }, []);

  // ── Dẫn xuất ─────────────────────────────────────────────────────────

  const view =
    !status || (editingRejected && status.onboardingStatus === 'rejected')
      ? 'wizard'
      : resolveOnboardingView(status);
  const reachedStep = Math.max(status?.currentStep ?? 1, step);

  const servicesByCategory = useMemo(() => {
    const names = new Map(categories.map((c) => [c.id, c.name]));
    const groups = new Map<string, ServiceItem[]>();
    for (const service of services) {
      const name = service.categoryName ?? names.get(service.categoryId) ?? 'Khác';
      groups.set(name, [...(groups.get(name) ?? []), service]);
    }
    return Array.from(groups.entries());
  }, [services, categories]);

  const activeProvince = provinces.find((p) => p.code === activeProvinceCode);
  const provinceMatches = useMemo(() => {
    const q = provinceQuery.trim().toLowerCase();
    return provinces.filter((p) => !q || p.name.toLowerCase().includes(q)).slice(0, 8);
  }, [provinces, provinceQuery]);

  const step1Errors = {
    fullName: validateFullName(fullName),
    dob: validateDob(dob),
    citizenId: validateCitizenId(citizenId),
    phone: validatePhoneNumber(phone),
  };

  // ── Hành động ────────────────────────────────────────────────────────

  const run = async (action: () => Promise<OnboardingStatusResponse>, next: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSaving(true);
    try {
      setStatus(await action());
      setStep(next);
    } catch (err) {
      Alert.alert('Không thể lưu', extractApiErrorMessage(err, 'Đã xảy ra lỗi. Vui lòng thử lại.'));
    } finally {
      setSaving(false);
    }
  };

  const saveStep1 = () => {
    setShowStep1Errors(true);
    if (Object.values(step1Errors).some(Boolean)) return;
    const birth = parseDob(dob);
    if (!birth) return;
    void run(
      () =>
        technicianOnboardingApi.savePersonalInfo({
          fullName: fullName.trim(),
          dateOfBirth: birth.iso,
          gender,
          citizenIdNumber: citizenId.trim(),
          phoneNumber: phone.trim() || undefined,
        }),
      2,
    );
  };

  const continueFromKyc = () => {
    if (!status?.kycSubmitted) {
      Alert.alert('Chưa nộp ảnh', 'Vui lòng hoàn tất xác minh danh tính trước khi tiếp tục.');
      return;
    }
    setStep(3);
  };

  const saveStep3 = () => {
    if (selectedServiceIds.length === 0) {
      Alert.alert('Chưa chọn kỹ năng', 'Vui lòng chọn ít nhất 1 dịch vụ bạn có thể thực hiện.');
      return;
    }
    void run(
      () =>
        technicianOnboardingApi.saveSkills({
          serviceIds: selectedServiceIds,
          yearsExperience,
          bio: bio.trim() || undefined,
        }),
      4,
    );
  };

  const saveStep4 = () => {
    if (address.trim().length < 5) {
      Alert.alert('Thiếu địa chỉ', 'Vui lòng nhập địa chỉ cụ thể của bạn.');
      return;
    }
    if (areaKeys.length === 0) {
      Alert.alert('Chưa chọn khu vực', 'Vui lòng chọn ít nhất 1 quận/huyện bạn có thể phục vụ.');
      return;
    }
    void run(
      () =>
        technicianOnboardingApi.saveAddress({
          fullAddress: address.trim(),
          latitude: coords?.lat,
          longitude: coords?.lng,
          serviceAreas: keysToServiceAreas(areaKeys),
          serviceRadiusKm: radiusKm,
        }),
      5,
    );
  };

  const submit = () => void run(() => technicianOnboardingApi.submit(), 5);

  const handleLogout = () => {
    Alert.alert('Đăng xuất', 'Bạn có chắc muốn đăng xuất?', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Đăng xuất',
        style: 'destructive',
        onPress: async () => {
          await authApi.logout();
          logout();
          setTimeout(() => navigation.navigate('Auth'), 100);
        },
      },
    ]);
  };

  const toggleService = (id: string) =>
    setSelectedServiceIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const onAddressChange = (text: string) => {
    setAddress(text);
    setCoords(null); // toạ độ cũ không còn khớp với chữ vừa sửa
    if (suggestTimer.current) clearTimeout(suggestTimer.current);
    if (text.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    suggestTimer.current = setTimeout(() => {
      geoApi
        .autocomplete(text)
        .then(setSuggestions)
        .catch(() => setSuggestions([]));
    }, 350);
  };

  const pickSuggestion = (s: PlaceSuggestion) => {
    Haptics.selectionAsync();
    setAddress(s.description);
    setCoords({ lat: s.lat, lng: s.lng });
    setSuggestions([]);
    const { province, district } = detectArea(provinces, s.description, {
      province: s.province,
      district: s.district,
    });
    if (province) setActiveProvinceCode(province.code);
    if (province && district) {
      const key = toAreaKey(province.code, district.code);
      setAreaKeys((prev) => (prev.includes(key) ? prev : [...prev, key]));
    }
  };

  const toggleDistrict = (districtCode: number) => {
    const key = toAreaKey(activeProvinceCode, districtCode);
    setAreaKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const activeDistricts = activeProvince?.districts ?? [];
  const allActiveSelected =
    activeDistricts.length > 0 &&
    activeDistricts.every((d) => areaKeys.includes(toAreaKey(activeProvinceCode, d.code)));

  const toggleAllDistricts = () => {
    const keys = activeDistricts.map((d) => toAreaKey(activeProvinceCode, d.code));
    setAreaKeys((prev) =>
      allActiveSelected
        ? prev.filter((k) => !keys.includes(k))
        : [...prev, ...keys.filter((k) => !prev.includes(k))],
    );
  };

  // ── Giao diện từng bước ──────────────────────────────────────────────

  const renderField = (
    label: string,
    error: string,
    input: React.ReactNode,
    hint?: string,
  ) => (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {input}
      {error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : hint ? (
        <Text style={styles.hintText}>{hint}</Text>
      ) : null}
    </View>
  );

  const renderStep1 = () => (
    <>
      {renderField(
        'Họ và tên',
        showStep1Errors ? step1Errors.fullName : '',
        <TextInput
          style={styles.input}
          value={fullName}
          onChangeText={setFullName}
          placeholder="Nguyễn Văn An"
          placeholderTextColor={colors.muted}
        />,
      )}
      {renderField(
        'Ngày sinh',
        showStep1Errors ? step1Errors.dob : '',
        <TextInput
          style={styles.input}
          value={dob}
          onChangeText={(text) => setDob(formatDobInput(text))}
          placeholder="dd/MM/yyyy"
          placeholderTextColor={colors.muted}
          keyboardType="number-pad"
          maxLength={10}
        />,
        'Bạn phải đủ 18 tuổi trở lên.',
      )}
      <View style={styles.field}>
        <Text style={styles.label}>Giới tính</Text>
        <View style={styles.chipRow}>
          {GENDERS.map((g) => (
            <TouchableOpacity
              key={g.value}
              style={[styles.chip, gender === g.value && styles.chipActive]}
              onPress={() => setGender(g.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected: gender === g.value }}
            >
              <Text style={[styles.chipText, gender === g.value && styles.chipTextActive]}>
                {g.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      {renderField(
        'Số CCCD',
        showStep1Errors ? step1Errors.citizenId : '',
        <TextInput
          style={styles.input}
          value={citizenId}
          onChangeText={(t) => setCitizenId(t.replace(/\D/g, '').slice(0, 12))}
          placeholder="079123456789"
          placeholderTextColor={colors.muted}
          keyboardType="number-pad"
          maxLength={12}
        />,
      )}
      {renderField(
        'Số điện thoại',
        showStep1Errors ? step1Errors.phone : '',
        <TextInput
          style={styles.input}
          value={phone}
          onChangeText={setPhone}
          placeholder="0901234567"
          placeholderTextColor={colors.muted}
          keyboardType="phone-pad"
        />,
      )}
    </>
  );

  const renderStep2 = () => (
    <>
      <Text style={styles.paragraph}>
        Bạn cần nộp ảnh CCCD mặt trước, mặt sau và ảnh chân dung để quản trị viên xác minh danh tính.
      </Text>
      <View
        style={[
          styles.notice,
          { borderColor: status?.kycSubmitted ? colors.success : colors.warning },
        ]}
      >
        <Ionicons
          name={status?.kycSubmitted ? 'checkmark-circle' : 'time-outline'}
          size={22}
          color={status?.kycSubmitted ? colors.success : colors.warning}
        />
        <Text style={styles.noticeText}>
          {status?.kycSubmitted ? 'Đã nộp hồ sơ xác minh danh tính' : 'Chưa nộp hồ sơ xác minh danh tính'}
        </Text>
      </View>
      <TouchableOpacity
        style={styles.secondaryBtn}
        onPress={() => navigation.navigate('TechnicianKyc')}
        accessibilityRole="button"
      >
        <Ionicons name="camera-outline" size={18} color={colors.primaryStrong} />
        <Text style={styles.secondaryBtnText}>
          {status?.kycSubmitted ? 'Xem hồ sơ xác minh' : 'Chụp và nộp ảnh xác minh'}
        </Text>
      </TouchableOpacity>
    </>
  );

  const renderStep3 = () => (
    <>
      <Text style={styles.paragraph}>Chọn các dịch vụ bạn có thể thực hiện.</Text>
      {servicesByCategory.length === 0 && (
        <Text style={styles.hintText}>Chưa tải được danh sách dịch vụ.</Text>
      )}
      {servicesByCategory.map(([categoryName, list]) => (
        <View key={categoryName} style={styles.field}>
          <Text style={styles.label}>{categoryName}</Text>
          <View style={styles.chipRow}>
            {list.map((service) => {
              const selected = selectedServiceIds.includes(service.id);
              return (
                <TouchableOpacity
                  key={service.id}
                  style={[styles.chip, selected && styles.chipActive]}
                  onPress={() => toggleService(service.id)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextActive]}>
                    {service.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ))}
      <Text style={styles.hintText}>Đã chọn {selectedServiceIds.length} dịch vụ.</Text>

      <View style={styles.field}>
        <Text style={styles.label}>Số năm kinh nghiệm</Text>
        <View style={styles.stepper}>
          <TouchableOpacity
            style={styles.stepperBtn}
            onPress={() => setYearsExperience((y) => Math.max(0, y - 1))}
            accessibilityRole="button"
            accessibilityLabel="Giảm số năm kinh nghiệm"
          >
            <Ionicons name="remove" size={20} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.stepperValue}>{yearsExperience} năm</Text>
          <TouchableOpacity
            style={styles.stepperBtn}
            onPress={() => setYearsExperience((y) => Math.min(MAX_YEARS, y + 1))}
            accessibilityRole="button"
            accessibilityLabel="Tăng số năm kinh nghiệm"
          >
            <Ionicons name="add" size={20} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>
      {renderField(
        'Giới thiệu bản thân',
        '',
        <TextInput
          style={[styles.input, styles.multiline]}
          value={bio}
          onChangeText={setBio}
          placeholder="Ví dụ: Chuyên sửa điện lạnh, 5 năm kinh nghiệm"
          placeholderTextColor={colors.muted}
          multiline
          maxLength={2000}
        />,
      )}
    </>
  );

  const renderStep4 = () => (
    <>
      {renderField(
        'Địa chỉ của bạn',
        '',
        <>
          <TextInput
            style={styles.input}
            value={address}
            onChangeText={onAddressChange}
            placeholder="Số nhà, đường, phường/xã…"
            placeholderTextColor={colors.muted}
          />
          {suggestions.slice(0, 5).map((s) => (
            <TouchableOpacity
              key={s.placeId}
              style={styles.suggestion}
              onPress={() => pickSuggestion(s)}
              accessibilityRole="button"
            >
              <Ionicons name="location-outline" size={16} color={colors.textSecondary} />
              <Text style={styles.suggestionText}>{s.description}</Text>
            </TouchableOpacity>
          ))}
        </>,
        coords ? 'Đã xác định vị trí trên bản đồ.' : 'Chọn một gợi ý để xác định vị trí chính xác.',
      )}

      <View style={styles.field}>
        <Text style={styles.label}>Bán kính phục vụ</Text>
        <View style={styles.chipRow}>
          {SERVICE_RADIUS_OPTIONS_KM.map((km) => (
            <TouchableOpacity
              key={km}
              style={[styles.chip, radiusKm === km && styles.chipActive]}
              onPress={() => setRadiusKm(km)}
              accessibilityRole="radio"
              accessibilityState={{ selected: radiusKm === km }}
            >
              <Text style={[styles.chipText, radiusKm === km && styles.chipTextActive]}>
                {km} km
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Tỉnh/thành phố</Text>
        <TouchableOpacity
          style={styles.select}
          onPress={() => setProvincePickerOpen((open) => !open)}
          accessibilityRole="button"
        >
          <Text style={styles.selectText}>{activeProvince?.name ?? 'Chọn tỉnh/thành phố'}</Text>
          <Ionicons
            name={provincePickerOpen ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={colors.textSecondary}
          />
        </TouchableOpacity>
        {provincePickerOpen && (
          <View style={styles.picker}>
            <TextInput
              style={styles.input}
              value={provinceQuery}
              onChangeText={setProvinceQuery}
              placeholder="Tìm tỉnh/thành phố"
              placeholderTextColor={colors.muted}
            />
            {provinceMatches.map((p) => (
              <TouchableOpacity
                key={p.code}
                style={styles.suggestion}
                onPress={() => {
                  setActiveProvinceCode(p.code);
                  setProvincePickerOpen(false);
                  setProvinceQuery('');
                }}
                accessibilityRole="button"
              >
                <Text style={styles.suggestionText}>{p.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      <View style={styles.field}>
        <View style={styles.rowBetween}>
          <Text style={styles.label}>Quận/huyện có thể phục vụ</Text>
          {activeDistricts.length > 0 && (
            <TouchableOpacity onPress={toggleAllDistricts} accessibilityRole="button">
              <Text style={styles.link}>{allActiveSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}</Text>
            </TouchableOpacity>
          )}
        </View>
        {activeDistricts.length === 0 && (
          <Text style={styles.hintText}>Chưa tải được danh sách quận/huyện.</Text>
        )}
        <View style={styles.chipRow}>
          {activeDistricts.map((d) => {
            const selected = areaKeys.includes(toAreaKey(activeProvinceCode, d.code));
            return (
              <TouchableOpacity
                key={d.code}
                style={[styles.chip, selected && styles.chipActive]}
                onPress={() => toggleDistrict(d.code)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected }}
              >
                <Text style={[styles.chipText, selected && styles.chipTextActive]}>{d.name}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.hintText}>Đã chọn {areaKeys.length} khu vực.</Text>
      </View>
    </>
  );

  const renderSummaryRow = (label: string, value: string, targetStep: number) => (
    <View style={styles.summaryRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.summaryLabel}>{label}</Text>
        <Text style={styles.summaryValue}>{value}</Text>
      </View>
      <TouchableOpacity onPress={() => setStep(targetStep)} accessibilityRole="button">
        <Text style={styles.link}>Sửa</Text>
      </TouchableOpacity>
    </View>
  );

  const renderStep5 = () => (
    <>
      <Text style={styles.paragraph}>Kiểm tra lại thông tin trước khi gửi quản trị viên xét duyệt.</Text>
      {renderSummaryRow(
        'Thông tin cá nhân',
        status?.personalInfoCompleted ? `${fullName || user?.fullName || ''}` : 'Chưa hoàn tất',
        1,
      )}
      {renderSummaryRow(
        'Xác minh danh tính',
        status?.kycSubmitted ? 'Đã nộp ảnh' : 'Chưa nộp ảnh',
        2,
      )}
      {renderSummaryRow(
        'Kỹ năng chuyên môn',
        status?.skillsSelected ? `${selectedServiceIds.length} dịch vụ, ${yearsExperience} năm` : 'Chưa chọn',
        3,
      )}
      {renderSummaryRow(
        'Địa chỉ và khu vực',
        status?.addressSet ? `${status.fullAddress ?? address} · ${areaKeys.length} khu vực` : 'Chưa cập nhật',
        4,
      )}
      <Text style={styles.hintText}>
        Bằng việc gửi hồ sơ, bạn cam kết thông tin cung cấp là chính xác.
      </Text>
    </>
  );

  const primaryLabel = ['Lưu và tiếp tục', 'Tiếp tục', 'Lưu và tiếp tục', 'Lưu và tiếp tục', 'Gửi hồ sơ xét duyệt'][
    step - 1
  ];
  const onPrimary = [saveStep1, continueFromKyc, saveStep3, saveStep4, submit][step - 1];

  const renderStateCard = (
    icon: React.ComponentProps<typeof Ionicons>['name'],
    tint: string,
    title: string,
    body: string,
    actions: React.ReactNode,
  ) => (
    <View style={[styles.stateCard, { borderColor: tint }]}>
      <Ionicons name={icon} size={44} color={tint} />
      <Text style={styles.stateTitle}>{title}</Text>
      <Text style={styles.stateBody}>{body}</Text>
      {actions}
    </View>
  );

  const renderBody = () => {
    if (loading) return <ActivityIndicator style={{ marginTop: 48 }} color={colors.primary} />;
    if (!status) {
      return renderStateCard(
        'cloud-offline-outline',
        colors.warning,
        'Không thể tải hồ sơ',
        error ?? 'Vui lòng thử lại.',
        <TouchableOpacity style={styles.primaryBtn} onPress={() => void refreshStatus()}>
          <Text style={styles.primaryBtnText}>Thử lại</Text>
        </TouchableOpacity>,
      );
    }
    if (view === 'approved') {
      return renderStateCard(
        'checkmark-circle',
        colors.success,
        'Hồ sơ đã được duyệt',
        'Bạn đã trở thành kỹ thuật viên của FixHome và có thể bắt đầu nhận việc.',
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => navigation.reset({ index: 0, routes: [{ name: 'TechnicianMain' }] })}
        >
          <Text style={styles.primaryBtnText}>Vào trang kỹ thuật viên</Text>
        </TouchableOpacity>,
      );
    }
    if (view === 'submitted') {
      return renderStateCard(
        'time-outline',
        colors.warning,
        'Đang chờ xét duyệt',
        'Hồ sơ của bạn đã được tiếp nhận. Vui lòng đến trụ sở trong thời gian sớm nhất để tiến hành xác minh thông tin và bắt đầu công việc.',
        <TouchableOpacity style={styles.primaryBtn} onPress={() => void refreshStatus()}>
          <Text style={styles.primaryBtnText}>Kiểm tra lại trạng thái</Text>
        </TouchableOpacity>,
      );
    }
    if (view === 'rejected') {
      return renderStateCard(
        'alert-circle',
        colors.error,
        'Hồ sơ chưa đạt yêu cầu',
        status.rejectionReason || 'Vui lòng kiểm tra lại ảnh CCCD, ảnh chân dung và thông tin liên quan.',
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => {
            setEditingRejected(true);
            setStep(1);
          }}
        >
          <Text style={styles.primaryBtnText}>Chỉnh sửa hồ sơ</Text>
        </TouchableOpacity>,
      );
    }

    return (
      <>
        <View style={styles.stepper5}>
          {ONBOARDING_STEPS.map((s) => {
            const done = s.id < step;
            const active = s.id === step;
            const reachable = s.id <= reachedStep;
            return (
              <TouchableOpacity
                key={s.id}
                style={[styles.dot, (active || done) && styles.dotActive]}
                disabled={!reachable}
                onPress={() => setStep(s.id)}
                accessibilityRole="button"
                accessibilityLabel={`Bước ${s.id}: ${s.title}`}
                accessibilityState={{ selected: active, disabled: !reachable }}
              >
                {done ? (
                  <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                ) : (
                  <Text style={[styles.dotText, active && { color: '#FFFFFF' }]}>{s.id}</Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.stepTitle}>
          Bước {step}/5: {ONBOARDING_STEPS[step - 1].title}
        </Text>

        <View style={styles.card}>
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
          {step === 4 && renderStep4()}
          {step === 5 && renderStep5()}
        </View>

        <View style={styles.footer}>
          {step > 1 && (
            <TouchableOpacity
              style={[styles.secondaryBtn, { flex: 1 }]}
              disabled={saving}
              onPress={() => setStep(step - 1)}
              accessibilityRole="button"
            >
              <Text style={styles.secondaryBtnText}>Quay lại</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.primaryBtn, { flex: 2 }, saving && { opacity: 0.6 }]}
            disabled={saving}
            onPress={onPrimary}
            accessibilityRole="button"
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryBtnText}>{primaryLabel}</Text>
            )}
          </TouchableOpacity>
        </View>
      </>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Đăng ký kỹ thuật viên</Text>
        <TouchableOpacity onPress={handleLogout} accessibilityRole="button">
          <Text style={styles.logout}>Đăng xuất</Text>
        </TouchableOpacity>
      </View>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {renderBody()}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const getStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    headerTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
    logout: { fontSize: 14, fontWeight: '600', color: colors.error },
    content: { padding: 16, paddingBottom: 48 },
    stepper5: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
    dot: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    dotActive: { backgroundColor: colors.primaryStrong, borderColor: colors.primaryStrong },
    dotText: { fontSize: 14, fontWeight: '700', color: colors.textSecondary },
    stepTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 12 },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
    },
    field: { marginBottom: 16 },
    label: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 8 },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      paddingHorizontal: 12,
      minHeight: 48,
      fontSize: 16,
      color: colors.text,
      backgroundColor: colors.surface,
    },
    multiline: { minHeight: 96, paddingTop: 12, textAlignVertical: 'top' },
    errorText: { fontSize: 12, color: colors.error, marginTop: 6 },
    hintText: { fontSize: 12, color: colors.textSecondary, marginTop: 6 },
    paragraph: { fontSize: 14, color: colors.textSecondary, marginBottom: 16, lineHeight: 20 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      minHeight: 44,
      paddingHorizontal: 14,
      justifyContent: 'center',
      borderRadius: 22,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    chipActive: { backgroundColor: colors.primaryStrong, borderColor: colors.primaryStrong },
    chipText: { fontSize: 14, color: colors.text },
    chipTextActive: { color: '#FFFFFF', fontWeight: '600' },
    stepper: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    stepperBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    stepperValue: { fontSize: 16, fontWeight: '600', color: colors.text, minWidth: 64, textAlign: 'center' },
    select: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 48,
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
    },
    selectText: { fontSize: 16, color: colors.text, flex: 1 },
    picker: { marginTop: 8 },
    suggestion: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      minHeight: 44,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
    },
    suggestionText: { flex: 1, fontSize: 14, color: colors.text },
    rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    link: { fontSize: 14, fontWeight: '600', color: colors.primaryStrong },
    notice: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderWidth: 1,
      borderRadius: 12,
      padding: 12,
      marginBottom: 12,
    },
    noticeText: { flex: 1, fontSize: 14, color: colors.text },
    summaryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
    },
    summaryLabel: { fontSize: 12, color: colors.textSecondary },
    summaryValue: { fontSize: 14, fontWeight: '600', color: colors.text, marginTop: 2 },
    footer: { flexDirection: 'row', gap: 8, marginTop: 16 },
    primaryBtn: {
      minHeight: 52,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primaryStrong,
      paddingHorizontal: 16,
    },
    primaryBtnText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
    secondaryBtn: {
      minHeight: 52,
      borderRadius: 14,
      flexDirection: 'row',
      gap: 8,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingHorizontal: 16,
    },
    secondaryBtnText: { fontSize: 16, fontWeight: '600', color: colors.primaryStrong },
    stateCard: {
      alignItems: 'center',
      gap: 12,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderRadius: 20,
      padding: 24,
      marginTop: 24,
    },
    stateTitle: { fontSize: 20, fontWeight: '700', color: colors.text, textAlign: 'center' },
    stateBody: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  });
