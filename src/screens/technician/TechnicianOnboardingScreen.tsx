// src/screens/technician/TechnicianOnboardingScreen.tsx
//
// Đăng ký kỹ thuật viên 5 bước, khớp `web/src/pages/technician/TechnicianOnboardingPage.vue`:
// 1 thông tin cá nhân → 2 xác minh danh tính → 3 kỹ năng → 4 địa chỉ và khu vực → 5 gửi duyệt.
// Bước 2 dùng lại TechnicianKycScreen để không nhân đôi phần chụp/tải ảnh.
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../types';
import { iconSize, iconStroke, useAppTheme, type ThemeColors } from '../../constants/theme';
import { useAuthStore } from '../../store';
import { geoApi, type Province } from '../../api/geo.api';
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
  SERVICE_RADIUS_OPTIONS_KM,
  detectArea,
  formatDobInput,
  getKycSummaryLabel,
  isoToDob,
  getOnboardingStepProgress,
  keysToServiceAreas,
  parseCccdQr,
  parseDob,
  resolveBackAction,
  resolveOnboardingView,
  serviceAreasToKeys,
  toAreaKey,
  validateCitizenId,
  validateDob,
} from './technician-onboarding';
import { CheckCircle2, ChevronRight, Info, PenLine, QrCode } from 'lucide-react-native';
import ToneNote from '../../components/ToneNote';
import { useLiveRefresh } from '../../hooks/useLiveRefresh';
import { DEFAULT_SKILL_LEVEL, SKILL_LEVELS } from '../../utils/skill-levels';
import BackButton from '../../components/BackButton';
import { CccdQrScanner } from './CccdQrScanner';
import { formatVisitTime } from './TechnicianOfficeVisitScreen';
import OnboardingStepper from './OnboardingStepper';
import TechnicianAddressPicker, { type PickedPlace } from './TechnicianAddressPicker';
import { KEYBOARD_AVOIDING_BEHAVIOR } from '../../constants/keyboard';
import PillText from '../../components/PillText';

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

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<OnboardingStatusResponse | null>(null);
  const [step, setStep] = useState(1);
  // The system back (Android button, iOS swipe) steps back like "Quay lại" instead of leaving the wizard.
  const stepRef = useRef(step);
  const wizardRef = useRef(false);
  useLayoutEffect(() => { stepRef.current = step; });
  useEffect(() => navigation.addListener('beforeRemove', (event) => {
    if (wizardRef.current && stepRef.current > 1) { event.preventDefault(); setStep(stepRef.current - 1); }
  }), [navigation]);
  const [editingRejected, setEditingRejected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Bước 1
  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [dob, setDob] = useState('');
  const [gender, setGender] = useState<Gender>('male');
  const [citizenId, setCitizenId] = useState('');
  const [phone, setPhone] = useState(user?.phoneNumber ?? '');
  const [showStep1Errors, setShowStep1Errors] = useState(false);
  // Lần đầu vào bước 1 thợ chọn quét QR CCCD hoặc nhập thủ công; sau đó luôn ở form.
  const [entryMode, setEntryMode] = useState<'choose' | 'scan' | 'form'>('form');
  const [scannedFromCccd, setScannedFromCccd] = useState(false);

  // Chuỗi QR chỉ được phân tích tại máy rồi điền vào form như nhập tay; không lưu, không gửi đi đâu.
  const handleCccdScan = (raw: string): boolean => {
    const info = parseCccdQr(raw);
    if (!info) return false;
    setCitizenId(info.citizenId);
    if (info.fullName) setFullName(info.fullName);
    if (info.dob) setDob(info.dob);
    setGender(info.gender);
    setScannedFromCccd(true);
    setEntryMode('form');
    return true;
  };

  // Bước 3
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [skillLevels, setSkillLevels] = useState<Record<string, string>>({});
  const [defaultLevel, setDefaultLevel] = useState<string>(DEFAULT_SKILL_LEVEL);
  const [showLevelDetail, setShowLevelDetail] = useState(false);
  const [yearsExperience, setYearsExperience] = useState(2);
  const [bio, setBio] = useState('');

  // Bước 4
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [address, setAddress] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [placeInfo, setPlaceInfo] = useState<{ ward?: string; province?: string }>({});
  const [radiusKm, setRadiusKm] = useState(15);
  const [activeProvinceCode, setActiveProvinceCode] = useState(HO_CHI_MINH_CODE);
  const [provinceQuery, setProvinceQuery] = useState('');
  const [provincePickerOpen, setProvincePickerOpen] = useState(false);
  const [areaKeys, setAreaKeys] = useState<string[]>([]);

  const initialised = useRef(false);

  // ── Tải dữ liệu ──────────────────────────────────────────────────────

  const [checking, setChecking] = useState(false);
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

  // Admin vừa xử lý hồ sơ: thông báo realtime tới thì đọc lại trạng thái, màn tự đổi bước.
  useLiveRefresh(['notification:new', 'realtime:resync'], () => { if (initialised.current) void refreshStatus(); });

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
        const firstStep = Math.min(5, Math.max(1, statusRes.currentStep));
        setStep(firstStep);
        if (firstStep === 1 && !statusRes.citizenIdNumber) setEntryMode('choose');
        // Điền lại bước 1 từ hồ sơ đã lưu để quay lại xem hoặc sửa không phải nhập lại.
        if (statusRes.fullName) setFullName(statusRes.fullName);
        if (statusRes.dateOfBirth) setDob(isoToDob(statusRes.dateOfBirth));
        if (statusRes.gender) setGender(statusRes.gender);
        if (statusRes.citizenIdNumber) setCitizenId(statusRes.citizenIdNumber);
        if (statusRes.phoneNumber) setPhone(statusRes.phoneNumber);
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
          setSkillLevels(
            Object.fromEntries((statusRes.skills ?? []).map((k) => [k.serviceId, k.declaredLevel ?? k.level])),
          );
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
    };
  }, []);

  // ── Dẫn xuất ─────────────────────────────────────────────────────────

  const view =
    !status || (editingRejected && status.onboardingStatus === 'rejected')
      ? 'wizard'
      : resolveOnboardingView(status);
  useLayoutEffect(() => { wizardRef.current = view === 'wizard'; });
  const stepProgress = status ? getOnboardingStepProgress(status, step) : [];
  const kycRejected = status?.verificationStatus?.toLowerCase() === 'rejected';
  const kycNeedsUpdate = !status?.kycSubmitted || kycRejected;
  // Đã nộp giấy tờ xác minh (chờ duyệt hoặc đã duyệt) thì thông tin cá nhân phải khớp giấy tờ, không sửa nữa.
  const personalLocked = !!status?.kycSubmitted && !kycRejected;

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
    if (personalLocked) { setStep(2); return; }
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
          skills: selectedServiceIds.map((serviceId) => ({
            serviceId,
            level: skillLevels[serviceId] ?? defaultLevel,
          })),
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

  const goTechnicianHome = () => navigation.reset({ index: 0, routes: [{ name: 'TechnicianMain' }] });

  const handleBack = () => {
    const action = resolveBackAction({ loading, hasStatus: !!status, view, step, entryMode });
    if (action === 'prev-step') { setStep(step - 1); return; }
    if (action === 'close-scan') { setEntryMode('form'); return; }
    goTechnicianHome();
  };

  const toggleService = (id: string) =>
    setSelectedServiceIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  /** Chọn hoặc bỏ cả một nhóm (hoặc tất cả) bằng một chạm. */
  const setGroupSelected = (ids: string[], selected: boolean) =>
    setSelectedServiceIds((prev) =>
      selected ? [...prev, ...ids.filter((id) => !prev.includes(id))] : prev.filter((id) => !ids.includes(id)),
    );

  /** Cấp độ chung: áp cho mọi dịch vụ đang chọn và cho dịch vụ chọn thêm sau đó. */
  const applyDefaultLevel = (level: string) => {
    setDefaultLevel(level);
    setSkillLevels((prev) => ({ ...prev, ...Object.fromEntries(selectedServiceIds.map((id) => [id, level])) }));
  };

  const cycleLevel = (id: string) =>
    setSkillLevels((prev) => {
      const i = SKILL_LEVELS.findIndex((l) => l.value === (prev[id] ?? defaultLevel));
      return { ...prev, [id]: SKILL_LEVELS[(i + 1) % SKILL_LEVELS.length].value };
    });

  const onAddressChange = (text: string) => {
    setAddress(text);
    setCoords(null); // toạ độ cũ không còn khớp với chữ vừa sửa
    setPlaceInfo({});
  };

  // Gợi ý, chạm bản đồ hoặc vị trí hiện tại; `place` rỗng nghĩa là mới có ghim, chưa tra được địa chỉ.
  const onPlace = (lat: number, lng: number, place?: PickedPlace) => {
    setCoords({ lat, lng });
    if (!place) return;
    Haptics.selectionAsync();
    if (place.formattedAddress) setAddress(place.formattedAddress);
    setPlaceInfo({ ward: place.ward, province: place.province });
    const { province, district } = detectArea(provinces, place.formattedAddress ?? address, {
      province: place.province,
      district: place.district,
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

  const renderStep1 = () => {
    if (entryMode === 'scan') {
      return <CccdQrScanner onScan={handleCccdScan} onCancel={() => setEntryMode('form')} />;
    }
    if (entryMode === 'choose') {
      return (
        <View style={styles.choiceList}>
          <Text style={styles.label}>Bạn muốn điền thông tin bằng cách nào?</Text>
          <TouchableOpacity
            style={[styles.choiceCard, styles.choiceCardPrimary]}
            onPress={() => setEntryMode('scan')}
            accessibilityRole="button"
            accessibilityLabel="Quét QR trên CCCD, tự điền họ tên, ngày sinh, số CCCD"
          >
            <View style={styles.choiceIcon}>
              <QrCode size={iconSize.lg} color={colors.primaryStrong} strokeWidth={iconStroke} />
            </View>
            <View style={styles.choiceText}>
              <Text style={styles.choiceTitle}>Quét QR trên CCCD</Text>
              <Text style={styles.choiceSub}>Tự điền họ tên, ngày sinh, số CCCD</Text>
            </View>
            <ChevronRight size={iconSize.md} color={colors.textSecondary} strokeWidth={iconStroke} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.choiceCard}
            onPress={() => setEntryMode('form')}
            accessibilityRole="button"
            accessibilityLabel="Nhập thủ công, tự gõ từng thông tin"
          >
            <View style={styles.choiceIcon}>
              <PenLine size={iconSize.lg} color={colors.primaryStrong} strokeWidth={iconStroke} />
            </View>
            <View style={styles.choiceText}>
              <Text style={styles.choiceTitle}>Nhập thủ công</Text>
              <Text style={styles.choiceSub}>Tự gõ từng thông tin</Text>
            </View>
            <ChevronRight size={iconSize.md} color={colors.textSecondary} strokeWidth={iconStroke} />
          </TouchableOpacity>
          <ToneNote tone="info" icon={Info}>
            CCCD gắn chip và thẻ căn cước mới có mã QR. CCCD mẫu cũ không có mã QR, bạn hãy nhập thủ công.
          </ToneNote>
        </View>
      );
    }
    return (
    <>
      <View style={styles.scanBar}>
        {personalLocked ? (
          <ToneNote tone="info" icon={Info}>
            Thông tin này khớp với giấy tờ bạn đã nộp để xác minh nên không thể sửa.
          </ToneNote>
        ) : null}
        {!personalLocked && scannedFromCccd ? (
          <ToneNote tone="success" icon={CheckCircle2}>
            Đã điền từ CCCD. Vui lòng kiểm tra lại thông tin.
          </ToneNote>
        ) : null}
        {!personalLocked && scannedFromCccd && !dob ? (
          <ToneNote tone="warning" icon={Info}>
            Mã QR trên thẻ này không có ngày sinh, bạn hãy tự nhập.
          </ToneNote>
        ) : null}
        {!personalLocked && (
          <TouchableOpacity
            style={styles.scanBtn}
            onPress={() => setEntryMode('scan')}
            accessibilityRole="button"
            accessibilityLabel={scannedFromCccd ? 'Quét lại bằng CCCD' : 'Quét QR trên CCCD để tự điền'}
          >
            <QrCode size={iconSize.md} color={colors.primaryStrong} strokeWidth={iconStroke} />
            <Text style={styles.scanBtnText}>{scannedFromCccd ? 'Quét lại bằng CCCD' : 'Quét QR trên CCCD để tự điền'}</Text>
          </TouchableOpacity>
        )}
      </View>
      {renderField(
        'Họ và tên',
        showStep1Errors ? step1Errors.fullName : '',
        <TextInput
          style={[styles.input, personalLocked && styles.inputLocked]}
          editable={!personalLocked}
          value={fullName}
          onChangeText={setFullName}
          placeholder="Nguyễn Văn An"
          placeholderTextColor={colors.muted}
          accessibilityLabel="Họ và tên"
        />,
      )}
      {renderField(
        'Ngày sinh',
        showStep1Errors ? step1Errors.dob : '',
        <TextInput
          style={[styles.input, personalLocked && styles.inputLocked]}
          editable={!personalLocked}
          value={dob}
          onChangeText={(text) => setDob(formatDobInput(text))}
          placeholder="dd/MM/yyyy"
          placeholderTextColor={colors.muted}
          keyboardType="number-pad"
          maxLength={10}
          accessibilityLabel="Ngày sinh, ngày tháng năm"
        />,
        'Bạn phải đủ 18 tuổi trở lên.',
      )}
      <View style={styles.field}>
        <Text style={styles.label}>Giới tính</Text>
        <View style={styles.chipRow}>
          {GENDERS.map((g) => (
            <TouchableOpacity
              key={g.value}
              style={[styles.chip, gender === g.value && styles.chipActive, personalLocked && gender !== g.value && { opacity: 0.5 }]}
              onPress={() => setGender(g.value)}
              disabled={personalLocked}
              accessibilityRole="radio"
              accessibilityLabel={g.label}
              accessibilityState={{ selected: gender === g.value, disabled: personalLocked }}
            >
              <PillText style={[styles.chipText, gender === g.value && styles.chipTextActive]}>
                {g.label}
              </PillText>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      {renderField(
        'Số CCCD',
        showStep1Errors ? step1Errors.citizenId : '',
        <TextInput
          style={[styles.input, personalLocked && styles.inputLocked]}
          editable={!personalLocked}
          value={citizenId}
          onChangeText={(t) => setCitizenId(t.replace(/\D/g, '').slice(0, 12))}
          placeholder="079123456789"
          placeholderTextColor={colors.muted}
          keyboardType="number-pad"
          maxLength={12}
          accessibilityLabel="Số căn cước công dân"
        />,
      )}
      {renderField(
        'Số điện thoại',
        showStep1Errors ? step1Errors.phone : '',
        <TextInput
          style={[styles.input, personalLocked && styles.inputLocked]}
          editable={!personalLocked}
          value={phone}
          onChangeText={setPhone}
          placeholder="0901234567"
          placeholderTextColor={colors.muted}
          keyboardType="phone-pad"
          accessibilityLabel="Số điện thoại"
        />,
      )}
    </>
    );
  };

  const renderStep2 = () => (
    <>
      <Text style={styles.paragraph}>
        Bạn cần nộp ảnh CCCD mặt trước, mặt sau và ảnh chân dung để quản trị viên xác minh danh tính.
      </Text>
      <View
        style={[
          styles.notice,
          { borderColor: kycRejected ? colors.error : status?.kycSubmitted ? colors.success : colors.warning },
        ]}
        accessibilityLiveRegion="polite"
      >
        <Ionicons
          name={kycRejected ? 'alert-circle' : status?.kycSubmitted ? 'checkmark-circle' : 'time-outline'}
          size={22}
          color={kycRejected ? colors.error : status?.kycSubmitted ? colors.success : colors.warning}
        />
        <Text style={styles.noticeText}>
          {kycRejected
            ? 'Hồ sơ xác minh cần được cập nhật'
            : status?.kycSubmitted && status.verificationStatus?.toLowerCase() === 'verified'
              ? 'Đã xác minh danh tính'
              : status?.kycSubmitted && status.verificationStatus?.toLowerCase() === 'pending'
                ? 'Hồ sơ xác minh đang chờ duyệt'
                : status?.kycSubmitted
                  ? 'Đã nộp hồ sơ xác minh danh tính'
                  : 'Chưa nộp hồ sơ xác minh danh tính'}
        </Text>
      </View>
      {status?.kycSubmitted && !kycRejected ? (
        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => navigation.navigate('TechnicianKyc')}
          accessibilityRole="button"
          accessibilityLabel="Xem trạng thái xác minh danh tính"
        >
          <Ionicons name="document-text-outline" size={18} color={colors.primaryStrong} />
          <Text style={styles.secondaryBtnText}>Xem trạng thái xác minh</Text>
        </TouchableOpacity>
      ) : null}
    </>
  );

  const renderStep3 = () => (
    <>
      <Text style={styles.paragraph}>Chọn các dịch vụ bạn có thể thực hiện.</Text>
      {servicesByCategory.length === 0 && (
        <Text style={styles.hintText}>Chưa tải được danh sách dịch vụ.</Text>
      )}
      {services.length > 0 && (
        <View style={styles.rowBetween}>
          <Text style={styles.hintText}>Đã chọn {selectedServiceIds.length}/{services.length} dịch vụ</Text>
          <TouchableOpacity
            style={styles.linkBtn}
            onPress={() => setGroupSelected(services.map((x) => x.id), selectedServiceIds.length < services.length)}
            accessibilityRole="button"
          >
            <Text style={styles.linkText}>{selectedServiceIds.length < services.length ? 'Chọn tất cả' : 'Bỏ chọn tất cả'}</Text>
          </TouchableOpacity>
        </View>
      )}
      {servicesByCategory.map(([categoryName, list]) => {
        const ids = list.map((x) => x.id);
        const picked = ids.filter((id) => selectedServiceIds.includes(id)).length;
        const all = picked === ids.length;
        return (
          <View key={categoryName} style={styles.field}>
            <View style={styles.rowBetween}>
              <Text style={[styles.label, { marginBottom: 0, flex: 1 }]}>{categoryName} ({picked}/{ids.length})</Text>
              <TouchableOpacity
                style={styles.linkBtn}
                onPress={() => setGroupSelected(ids, !all)}
                accessibilityRole="button"
                accessibilityLabel={`${all ? 'Bỏ chọn' : 'Chọn'} cả nhóm ${categoryName}`}
              >
                <Text style={styles.linkText}>{all ? 'Bỏ nhóm' : 'Chọn cả nhóm'}</Text>
              </TouchableOpacity>
            </View>
            <View style={[styles.chipRow, { marginTop: 8 }]}>
              {list.map((service) => {
                const selected = selectedServiceIds.includes(service.id);
                return (
                  <TouchableOpacity
                    key={service.id}
                    style={[styles.chip, selected && styles.chipActive]}
                    onPress={() => toggleService(service.id)}
                    accessibilityRole="checkbox"
                    accessibilityLabel={service.name}
                    accessibilityState={{ checked: selected }}
                  >
                    <PillText style={[styles.chipText, selected && styles.chipTextActive]}>{service.name}</PillText>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        );
      })}

      {selectedServiceIds.length > 0 && (
        <View style={styles.field}>
          <Text style={styles.label}>Cấp độ tay nghề (tự khai)</Text>
          <Text style={styles.hintText}>
            Chọn một cấp cho tất cả dịch vụ đã chọn. FixHome sẽ xác nhận cấp thật khi bạn mang bản công chứng bằng cấp lên trụ sở.
          </Text>
          <View style={[styles.chipRow, { marginTop: 8 }]}>
            {SKILL_LEVELS.map((lv) => {
              const active = defaultLevel === lv.value;
              return (
                <TouchableOpacity
                  key={lv.value}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => applyDefaultLevel(lv.value)}
                  accessibilityRole="radio"
                  accessibilityLabel={`Áp dụng cấp ${lv.label} cho tất cả dịch vụ đã chọn`}
                  accessibilityState={{ selected: active }}
                >
                  <PillText style={[styles.chipText, active && styles.chipTextActive]}>{lv.label}</PillText>
                </TouchableOpacity>
              );
            })}
          </View>
          {selectedServiceIds.length > 1 && (
            <TouchableOpacity
              style={[styles.linkBtn, { alignSelf: 'flex-start', marginTop: 8 }]}
              onPress={() => setShowLevelDetail((v) => !v)}
              accessibilityRole="button"
              accessibilityState={{ expanded: showLevelDetail }}
            >
              <Text style={styles.linkText}>
                {showLevelDetail ? 'Ẩn chỉnh riêng từng dịch vụ' : `Chỉnh riêng từng dịch vụ (${selectedServiceIds.length})`}
              </Text>
            </TouchableOpacity>
          )}
          {(showLevelDetail || selectedServiceIds.length === 1) &&
            selectedServiceIds.map((id) => {
              const name = services.find((x) => x.id === id)?.name ?? 'Dịch vụ';
              const label = SKILL_LEVELS.find((l) => l.value === (skillLevels[id] ?? defaultLevel))?.label;
              return (
                <View key={id} style={styles.levelRow}>
                  <Text style={styles.levelName} numberOfLines={2}>{name}</Text>
                  <TouchableOpacity
                    style={styles.levelBtn}
                    onPress={() => cycleLevel(id)}
                    accessibilityRole="button"
                    accessibilityLabel={`${name}: ${label}. Chạm để đổi cấp độ`}
                  >
                    <Text style={styles.levelBtnText}>{label}</Text>
                    <Ionicons name="swap-vertical" size={16} color={colors.primaryStrong} />
                  </TouchableOpacity>
                </View>
              );
            })}
        </View>
      )}

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
          accessibilityLabel="Giới thiệu bản thân"
        />,
      )}
    </>
  );

  const renderStep4 = () => (
    <>
      <View style={styles.field}>
        <TechnicianAddressPicker
          label="Địa chỉ của bạn"
          line1={address}
          lat={coords?.lat}
          lng={coords?.lng}
          ward={placeInfo.ward}
          province={placeInfo.province}
          onTextChange={onAddressChange}
          onPlace={onPlace}
        />
        <Text style={styles.hintText}>
          {coords ? 'Đã xác định vị trí trên bản đồ.' : 'Chọn một gợi ý hoặc chạm vào bản đồ để xác định vị trí.'}
        </Text>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Bán kính phục vụ</Text>
        <View style={styles.chipRow}>
          {SERVICE_RADIUS_OPTIONS_KM.map((km) => (
            <TouchableOpacity
              key={km}
              style={[styles.chip, radiusKm === km && styles.chipActive]}
              onPress={() => setRadiusKm(km)}
              accessibilityRole="radio"
              accessibilityLabel={`Bán kính phục vụ ${km} km`}
              accessibilityState={{ selected: radiusKm === km }}
            >
              <PillText style={[styles.chipText, radiusKm === km && styles.chipTextActive]}>
                {km} km
              </PillText>
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
          accessibilityLabel={`Tỉnh/thành phố: ${activeProvince?.name ?? 'chưa chọn'}`}
          accessibilityState={{ expanded: provincePickerOpen }}
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
              accessibilityLabel="Tìm tỉnh/thành phố"
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
                accessibilityLabel={`Chọn tỉnh/thành phố ${p.name}`}
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
            <TouchableOpacity
              onPress={toggleAllDistricts}
              accessibilityRole="button"
              accessibilityLabel={allActiveSelected ? 'Bỏ chọn tất cả khu vực' : 'Chọn tất cả khu vực'}
            >
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
                accessibilityLabel={d.name}
                accessibilityState={{ checked: selected }}
              >
                <PillText style={[styles.chipText, selected && styles.chipTextActive]}>{d.name}</PillText>
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
      <TouchableOpacity
        onPress={() => setStep(targetStep)}
        accessibilityRole="button"
        accessibilityLabel={`Sửa ${label}`}
      >
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
        getKycSummaryLabel(status),
        2,
      )}
      {renderSummaryRow(
        'Kỹ năng',
        status?.skillsSelected ? `${selectedServiceIds.length} dịch vụ, ${yearsExperience} năm` : 'Chưa chọn',
        3,
      )}
      {renderSummaryRow(
        'Địa chỉ & khu vực',
        status?.addressSet ? `${status.fullAddress ?? address} · ${areaKeys.length} khu vực` : 'Chưa cập nhật',
        4,
      )}
      <Text style={styles.hintText}>
        Bằng việc gửi hồ sơ, bạn cam kết thông tin cung cấp là chính xác.
      </Text>
    </>
  );

  const primaryLabel = step === 2
    ? kycRejected
      ? 'Cập nhật hồ sơ xác minh'
      : kycNeedsUpdate
        ? 'Xác minh danh tính'
        : 'Tiếp tục'
    : ['Lưu và tiếp tục', '', 'Lưu và tiếp tục', 'Lưu và tiếp tục', 'Gửi hồ sơ xét duyệt'][step - 1];
  const onPrimary = step === 2 && kycNeedsUpdate
    ? () => navigation.navigate('TechnicianKyc')
    : [saveStep1, continueFromKyc, saveStep3, saveStep4, submit][step - 1];

  const renderRefreshError = () => error && status ? (
    <View style={[styles.notice, { borderColor: colors.error }]} accessibilityLiveRegion="polite">
      <Text style={[styles.noticeText, { color: colors.error }]}>{error}</Text>
      <TouchableOpacity
        style={styles.retryButton}
        onPress={() => void refreshStatus()}
        accessibilityRole="button"
        accessibilityLabel="Thử tải lại trạng thái hồ sơ"
      >
        <Text style={styles.link}>Thử lại</Text>
      </TouchableOpacity>
    </View>
  ) : null;

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
      {renderRefreshError()}
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
        <TouchableOpacity accessibilityRole="button" style={styles.primaryBtn} onPress={() => void refreshStatus()}>
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
        <TouchableOpacity accessibilityRole="button"
          style={styles.primaryBtn}
          onPress={goTechnicianHome}
        >
          <Text style={styles.primaryBtnText}>Vào trang kỹ thuật viên</Text>
        </TouchableOpacity>,
      );
    }
    if (view === 'submitted' && kycRejected) {
      return renderStateCard(
        'alert-circle',
        colors.error,
        'Hồ sơ xác minh cần cập nhật',
        status.rejectionReason || 'Trạng thái xác minh đã bị từ chối. Mở hồ sơ xác minh để xem hướng xử lý.',
        <View style={styles.stateActions}>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => navigation.navigate('TechnicianKyc')}
            accessibilityRole="button"
          >
            <Text style={styles.primaryBtnText}>Cập nhật hồ sơ xác minh</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => void refreshStatus()}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryBtnText}>Kiểm tra lại trạng thái</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" style={styles.secondaryBtn} onPress={goTechnicianHome}>
            <Text style={styles.secondaryBtnText}>Về trang chủ</Text>
          </TouchableOpacity>
        </View>,
      );
    }
    if (view === 'submitted') {
      const stage = status.reviewStage;
      const openVisit = () => navigation.navigate('TechnicianOfficeVisit');
      const homeBtn = (
        <TouchableOpacity accessibilityRole="button" style={styles.secondaryBtn} onPress={goTechnicianHome}>
          <Text style={styles.secondaryBtnText}>Về trang chủ</Text>
        </TouchableOpacity>
      );
      const primary = (label: string, onPress: () => void) => (
        <TouchableOpacity accessibilityRole="button" style={styles.primaryBtn} onPress={onPress}>
          <Text style={styles.primaryBtnText}>{label}</Text>
        </TouchableOpacity>
      );
      if (stage === 'visit_required') {
        return renderStateCard(
          'calendar-outline',
          colors.primary,
          'Đặt lịch lên trụ sở',
          'Danh tính của bạn đã được xác nhận. Hãy chọn trụ sở và giờ lên gặp, nhớ mang bản công chứng bằng cấp để FixHome duyệt hồ sơ.',
          <View style={styles.stateActions}>{primary('Chọn trụ sở và giờ hẹn', openVisit)}{homeBtn}</View>,
        );
      }
      if (stage === 'visit_scheduled') {
        const v = status.officeVisit;
        return renderStateCard(
          'calendar-outline',
          colors.success,
          'Bạn đã có lịch hẹn',
          v
            ? `${formatVisitTime(v.scheduledAt)} tại ${v.officeName} (${v.officeAddress}). Vui lòng mang bản công chứng bằng cấp.`
            : 'Vui lòng đến trụ sở đúng giờ hẹn và mang bản công chứng bằng cấp.',
          <View style={styles.stateActions}>
            {primary('Xem hoặc đổi lịch hẹn', openVisit)}
            {homeBtn}
          </View>,
        );
      }
      if (stage === 'visit_blocked') {
        const phone = status.supportPhone;
        return renderStateCard(
          'alert-circle',
          colors.error,
          'Cần liên hệ quản lý dịch vụ',
          phone
            ? `Bạn đã vắng buổi hẹn nhiều lần. Vui lòng liên hệ quản lý dịch vụ qua số ${phone} để được hỗ trợ.`
            : 'Bạn đã vắng buổi hẹn nhiều lần. Vui lòng liên hệ quản lý dịch vụ để được hỗ trợ.',
          <View style={styles.stateActions}>
            {phone ? primary(`Gọi ${phone}`, () => void Linking.openURL(`tel:${phone}`)) : null}
            {homeBtn}
          </View>,
        );
      }
      if (stage === 'profile_rejected') {
        return renderStateCard(
          'alert-circle',
          colors.error,
          'Hồ sơ chưa được duyệt',
          status.profileRejectionReason || 'FixHome chưa duyệt hồ sơ của bạn. Vui lòng liên hệ trụ sở để biết thêm chi tiết.',
          <View style={styles.stateActions}>
            {primary('Cập nhật hồ sơ', () => { setEditingRejected(true); setStep(1); })}
            {homeBtn}
          </View>,
        );
      }
      const waiting =
        stage === 'profile_review'
          ? 'Bạn đã gặp FixHome. Hồ sơ và bằng cấp đang được duyệt, bạn sẽ nhận thông báo khi có kết quả.'
          : 'Hồ sơ của bạn đã được tiếp nhận. FixHome đang xác nhận danh tính, bạn sẽ nhận thông báo để đặt lịch lên trụ sở.';
      return renderStateCard(
        'time-outline',
        colors.warning,
        'Đang chờ xét duyệt',
        waiting,
        <View style={styles.stateActions}>
          {primary(checking ? 'Đang kiểm tra...' : 'Kiểm tra lại trạng thái', () => {
            if (checking) return;
            setChecking(true);
            void refreshStatus().finally(() => setChecking(false));
          })}
          {homeBtn}
        </View>,
      );
    }
    if (view === 'rejected') {
      return renderStateCard(
        'alert-circle',
        colors.error,
        'Hồ sơ chưa đạt yêu cầu',
        status.rejectionReason || 'Quản trị viên chưa cung cấp lý do chi tiết. Bạn có thể chỉnh sửa hồ sơ trước khi gửi lại.',
        <TouchableOpacity accessibilityRole="button"
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
        {(status.onboardingStatus === 'rejected' || kycRejected) && status.rejectionReason ? (
          <View style={[styles.notice, { borderColor: colors.error }]} accessibilityLiveRegion="polite">
            <Ionicons name="alert-circle" size={22} color={colors.error} />
            <Text style={[styles.noticeText, { color: colors.error }]}>
              Lý do cần cập nhật: {status.rejectionReason}
            </Text>
          </View>
        ) : null}
        {renderRefreshError()}
        <OnboardingStepper progress={stepProgress} step={step} onSelect={setStep} />

        <View style={styles.card}>
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
          {step === 4 && renderStep4()}
          {step === 5 && renderStep5()}
        </View>

        {(step !== 1 || entryMode === 'form') && (
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
            accessibilityState={{ disabled: saving, busy: saving }}
            accessibilityLabel={primaryLabel}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryBtnText}>{primaryLabel}</Text>
            )}
          </TouchableOpacity>
        </View>
        )}
      </>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <BackButton onPress={handleBack} />
        <Text style={styles.headerTitle} accessibilityRole="header">Đăng ký kỹ thuật viên</Text>
        <View style={styles.headerBtn} />
      </View>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={KEYBOARD_AVOIDING_BEHAVIOR}
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
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerBtn: { width: 44, height: 44 },
    headerTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '700', color: colors.text },
    content: { padding: 16, paddingBottom: 48 },
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
    linkBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
    linkText: { fontSize: 14, fontWeight: '700', color: colors.primaryStrong },
    levelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 48, borderBottomWidth: 1, borderBottomColor: colors.border },
    levelName: { flex: 1, fontSize: 14, color: colors.text },
    levelBtn: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, borderRadius: 22, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
    levelBtnText: { fontSize: 14, fontWeight: '600', color: colors.text },
    chip: {
      minHeight: 44,
      paddingHorizontal: 16,
      justifyContent: 'center',
      borderRadius: 22,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    chipActive: { backgroundColor: colors.primaryStrong, borderColor: colors.primaryStrong },
    chipText: { fontSize: 14, color: colors.text },
    inputLocked: { backgroundColor: colors.background, color: colors.textSecondary },
    choiceList: { gap: 12 },
    choiceCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      minHeight: 72,
      padding: 12,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    choiceCardPrimary: { borderColor: colors.primaryStrong, backgroundColor: colors.primarySoft },
    choiceIcon: {
      width: 44,
      height: 44,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primaryTint,
    },
    choiceText: { flex: 1 },
    choiceTitle: { fontSize: 16, lineHeight: 24, fontWeight: '600', color: colors.text },
    choiceSub: { fontSize: 14, lineHeight: 20, color: colors.textSecondary },
    scanBar: { gap: 12, marginBottom: 16 },
    scanBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      minHeight: 48,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingHorizontal: 16,
    },
    scanBtnText: { fontSize: 14, fontWeight: '600', color: colors.primaryStrong },
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
    retryButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
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
    stateActions: { width: '100%', gap: 8 },
    stateTitle: { fontSize: 20, fontWeight: '700', color: colors.text, textAlign: 'center' },
    stateBody: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  });
