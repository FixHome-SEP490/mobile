import React, { useState, useEffect, useCallback } from 'react';
import ReputationCard from '../../components/ReputationCard';
import ContactVerificationCard from '../../components/account/ContactVerificationCard';
import DefaultWarrantyCard from './DefaultWarrantyCard';
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
  Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CalendarRange,
  ChartColumn,
  Camera,
  ChevronRight,
  FileText,
  MapPin,
  MessageSquareText,
  PackageCheck,
  ShieldCheck,
  Star,
  Wallet,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuthStore } from '../../store';
import type { RootStackParamList } from '../../types';
import { usersApi, type AddressData } from '../../api/users.api';
import { mediaApi } from '../../api/media.api';
import { ordersApi, isHistoricalOrder, type ServiceOrderItem } from '../../api/orders.api';
import { authApi } from '../../api/auth.api';
import {
  technicianProfileApi,
  type TechnicianProfile,
  type TechnicianServiceOffering,
} from '../../api/technician-profile.api';
import { technicianVerificationApi, type MyVerification } from '../../api/technician-verification.api';
import { useReduceMotion } from '../../hooks/useReduceMotion';
import { useAppTheme } from '../../constants/theme';
import { formatVnd } from '../../utils/format';
import StatusBadge from '../../components/StatusBadge';
import type { StatusView } from './technician-status';

import { NO_RATING_TEXT, formatRating, ratingValue } from '../../utils/rating';
import { avatarErrorMessage, updateMyAvatar } from '../../services/avatar-upload';
import AccountLogoutAction from '../../components/account/AccountLogoutAction';
import PillText from '../../components/PillText';

// Match Customer account clearance above the floating bar, plus the bottom inset.
const TAB_BAR_CLEARANCE = 96;

// Xác minh danh tính (KYC) ở Hồ sơ chỉ đọc trạng thái đã nộp từ server:
// null/chưa nộp → “Chưa nộp hồ sơ”, không suy diễn từ pending mặc định.
const KYC_VIEW: Record<MyVerification['status'], StatusView> = {
  PENDING: { label: 'Đang chờ duyệt', tone: 'warning', icon: 'Clock' },
  VERIFIED: { label: 'Đã xác minh', tone: 'success', icon: 'CheckCircle2' },
  REJECTED: { label: 'Cần cập nhật', tone: 'danger', icon: 'XCircle' },
};

type ProfileStyles = ReturnType<typeof getStyles>;

function MenuRow({ styles, colors, Icon, title, desc, badge, onPress }: {
  styles: ProfileStyles;
  colors: ReturnType<typeof useAppTheme>['colors'];
  Icon: LucideIcon;
  title: string;
  desc?: string;
  /** Nhãn trạng thái đặt ngay dưới tiêu đề, trong cùng khối chữ. */
  badge?: React.ReactNode;
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
        {!!badge && <View style={styles.menuBadge}>{badge}</View>}
      </View>
      <ChevronRight size={20} color={colors.muted} strokeWidth={1.75} />
    </TouchableOpacity>
  );
}

export default function TechnicianProfileScreen() {
  const { colors, isDark } = useAppTheme();
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const logout = useAuthStore((state) => state.logout);
  const { user, sessionGeneration } = useAuthStore();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  // Giảm chuyển động: bỏ rung phản hồi, giữ nội dung tĩnh.
  const tapFeedback = () => {
    if (!reduceMotion) void Haptics.selectionAsync();
  };

  const [fullName, setFullName] = useState(user?.fullName || 'Kỹ thuật viên');
  const [profilePhone, setProfilePhone] = useState<{
    userId: string | undefined;
    sessionGeneration: number;
    phoneNumber: string;
  } | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user?.avatarUrl || null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [earningsTotal, setEarningsTotal] = useState(0);
  const [earningsLoading, setEarningsLoading] = useState(true);
  const [earningsLoaded, setEarningsLoaded] = useState(false);

  const [isAvatarModalVisible, setAvatarModalVisible] = useState(false);

  // ---- Hồ sơ nghề nghiệp (skills / location & radius / schedule / time-off) ----
  const [technicianProfile, setTechnicianProfile] = useState<TechnicianProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [verification, setVerification] = useState<MyVerification | null>(null);
  const [verificationLoading, setVerificationLoading] = useState(true);
  const [verificationLoaded, setVerificationLoaded] = useState(false);
  const [skillsLoaded, setSkillsLoaded] = useState(false);
  const [addresses, setAddresses] = useState<AddressData[]>([]);
  const technicianAddress = addresses.find((a) => a.isDefault) ?? addresses[0] ?? null;

  // Services the technician takes (read for the count on the menu row; the Skills page edits them).
  const [myOfferings, setMyOfferings] = useState<Record<string, TechnicianServiceOffering>>({});

  // Same flow as the customer: upload to /media/upload, save the hosted URL on
  // the profile, then refresh the session user. The old photo stays on screen
  // until the server has confirmed the new one.
  const handlePickImage = async () => {
    if (uploadingAvatar) return;
    tapFeedback();
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
    const requestedUserId = user?.id;
    const requestedSessionGeneration = sessionGeneration;
    usersApi
      .getProfile()
      .then((profile) => {
        const currentAuth = useAuthStore.getState();
        const isCurrentSession = currentAuth.user?.id === requestedUserId
          && currentAuth.sessionGeneration === requestedSessionGeneration;
        if (mounted && isCurrentSession && profile) {
          if (profile.fullName) setFullName(profile.fullName);
          if (profile.phoneNumber) {
            setProfilePhone({
              userId: requestedUserId,
              sessionGeneration: requestedSessionGeneration,
              phoneNumber: profile.phoneNumber,
            });
          }
        }
      })
      .catch(() => {});

    return () => {
      mounted = false;
    };
  }, [sessionGeneration, user?.id]);

  useEffect(() => {
    let mounted = true;
    ordersApi
      .getTechnicianJobs()
      .then((orders) => {
        if (!mounted || !Array.isArray(orders)) return;
        const completed = orders.filter((o): o is ServiceOrderItem => !isHistoricalOrder(o) && String(o.status).toUpperCase() === 'COMPLETED');
        const earn = completed.reduce((sum, o) => sum + (o.laborTotal || o.grandTotal || 0), 0);
        setEarningsTotal(earn);
        setEarningsLoaded(true);
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setEarningsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const loadTechnicianProfile = useCallback(async () => {
    try {
      const [profile, addrs, offeringsResult, verificationResult] = await Promise.all([
        technicianProfileApi.getMyProfile(),
        usersApi.getAddresses().catch(() => []),
        // Lấy sớm để số lượng kỹ năng ở hàng tóm tắt là số thật từ server,
        // không phải 0 mặc định trước khi mở sheet.
        technicianProfileApi.getMyServices().then((data) => ({ loaded: true, data })).catch(() => ({ loaded: false, data: [] as TechnicianServiceOffering[] })),
        technicianVerificationApi.getMyVerification().then((data) => ({ loaded: true, data })).catch(() => ({ loaded: false, data: null as MyVerification | null })),
      ]);
      setTechnicianProfile(profile);
      setAddresses(addrs);
      const offeringsById: Record<string, TechnicianServiceOffering> = {};
      for (const o of offeringsResult.data) offeringsById[o.serviceId] = o;
      if (offeringsResult.loaded) setMyOfferings(offeringsById);
      setSkillsLoaded(offeringsResult.loaded);
      setVerification(verificationResult.data);
      setVerificationLoaded(verificationResult.loaded);
    } catch {
      // Best-effort; menu rows just show no summary yet.
    } finally {
      setProfileLoading(false);
      setVerificationLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void loadTechnicianProfile();
  }, [loadTechnicianProfile]));

  const performLogout = async () => {
    if (!reduceMotion) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    await authApi.logout();
    logout();
  };

  const handleLogout = () => {
    // Alert.alert does not open on React Native Web.
    if (Platform.OS === 'web') { void performLogout(); return; }
    Alert.alert('Đăng xuất', 'Bạn có chắc chắn muốn đăng xuất?', [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Đăng xuất', style: 'destructive', onPress: performLogout },
    ]);
  };

  const accountEmail = user?.email?.trim() || 'Chưa cập nhật';
  const scopedProfilePhone = profilePhone
    && profilePhone.userId === user?.id
    && profilePhone.sessionGeneration === sessionGeneration
    ? profilePhone.phoneNumber.trim()
    : '';
  const accountPhone = user?.phoneNumber?.trim() || scopedProfilePhone || 'Chưa cập nhật';
  const phoneLine = accountPhone;
  // 0 reviews or a null average is "no rating yet", never an invented score.
  const rating = technicianProfile
    ? ratingValue(technicianProfile.averageRating, technicianProfile.ratingCount)
    : null;
  const activeSkillCount = Object.values(myOfferings).filter((o) => o.isActive).length;
  const kycDesc = verificationLoading
    ? 'Đang tải…'
    : !verificationLoaded
      ? 'Chưa tải được trạng thái xác minh'
      : verification === null
      ? 'Chưa nộp hồ sơ'
      : verification.status === 'REJECTED' && verification.rejectionReason
        ? `Bị từ chối: ${verification.rejectionReason}`
        : KYC_VIEW[verification.status].label;
  const skillDesc = !skillsLoaded && profileLoading
    ? 'Đang tải…'
    : activeSkillCount > 0
      ? `${activeSkillCount} dịch vụ đang nhận`
      : skillsLoaded
        ? 'Chưa có dịch vụ đang nhận'
        : 'Chưa tải được danh sách dịch vụ · Mở để thử lại';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: TAB_BAR_CLEARANCE + Math.max(insets.bottom, 16) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.pageHeading}>
          <Text style={styles.pageTitle} accessibilityRole="header">Tài khoản</Text>
        </View>

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
              style={[styles.cameraTouch, uploadingAvatar && { opacity: 0.75 }]}
              onPress={handlePickImage}
              disabled={uploadingAvatar}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={uploadingAvatar ? 'Đang tải ảnh đại diện' : 'Đổi ảnh đại diện'}
              accessibilityState={{ disabled: uploadingAvatar, busy: uploadingAvatar }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <View style={styles.cameraIconBadge}>
                {uploadingAvatar ? (
                  <ActivityIndicator size="small" color={colors.surface} />
                ) : (
                  <Camera size={14} color={colors.surface} strokeWidth={2} />
                )}
              </View>
            </TouchableOpacity>
          </View>
          <View style={styles.identityText}>
            <Text style={styles.name} numberOfLines={2}>{fullName}</Text>
            <Text style={styles.phone}>{phoneLine}</Text>
            {profileLoading && !technicianProfile ? (
              <Text style={styles.caption}>Đang tải…</Text>
            ) : technicianProfile ? (
              <View style={styles.chipRow}>
                {rating !== null ? (
                  <View style={[styles.chip, { backgroundColor: colors.tone.warning.bg }]}>
                    <Star size={14} color={colors.tone.warning.fg} strokeWidth={2} />
                    <PillText style={[styles.chipText, { color: colors.tone.warning.text }]}>
                      {formatRating(rating)}
                    </PillText>
                  </View>
                ) : (
                  <View style={[styles.chip, { backgroundColor: colors.background }]}>
                    <PillText style={[styles.chipText, { color: colors.textSecondary }]}>{NO_RATING_TEXT}</PillText>
                  </View>
                )}
                {technicianProfile.reliabilityScore !== null && (
                  <View style={[styles.chip, { backgroundColor: colors.tone.success.bg }]}>
                    <PillText style={[styles.chipText, { color: colors.tone.success.text }]}>
                      Độ tin cậy {technicianProfile.reliabilityScore}%
                    </PillText>
                  </View>
                )}
              </View>
            ) : null}
          </View>
        </View>

        <ReputationCard role="technician" />

        {technicianProfile && (
          <DefaultWarrantyCard
            key={technicianProfile.defaultLaborWarrantyDays ?? 'unset'}
            saved={technicianProfile.defaultLaborWarrantyDays}
            onSaved={(days) => setTechnicianProfile({ ...technicianProfile, defaultLaborWarrantyDays: days })}
          />
        )}

        {/* Thu nhập & ví */}
        <View style={[styles.group, styles.incomeCard]}>
          <Text style={styles.caption}>Tổng thu nhập từ đơn đã hoàn thành</Text>
          <Text style={styles.incomeValue}>
            {earningsLoading ? 'Đang tải…' : earningsLoaded ? formatVnd(earningsTotal) : 'Chưa tải được thu nhập'}
          </Text>
          <Text style={styles.caption}>Tính theo tiền công, nếu thiếu thì theo tổng đơn đã tải.</Text>
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
          <View style={styles.divider} />
          <MenuRow
            styles={styles}
            colors={colors}
            Icon={Wrench}
            title="Công việc bảo hành"
            desc="Yêu cầu bảo hành được giao cho bạn"
            onPress={() => navigation.navigate('TechnicianMain', { screen: 'Jobs', params: { mode: 'warranty' } })}
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
            desc="Khung giờ nhận việc, ngày nghỉ và đơn theo ngày"
            onPress={() => navigation.navigate('TechnicianSchedule')}
          />
          <View style={styles.divider} />
          <MenuRow
            styles={styles}
            colors={colors}
            Icon={MessageSquareText}
            title="Đánh giá từ khách hàng"
            desc={
              profileLoading && !technicianProfile
                ? 'Đang tải…'
                : technicianProfile
                  ? rating !== null
                    ? `${formatRating(rating)} sao · ${technicianProfile.ratingCount} đánh giá`
                    : NO_RATING_TEXT
                  : 'Mở để xem đánh giá'
            }
            onPress={() => navigation.navigate('TechnicianReviews')}
          />
          <View style={styles.divider} />
          <MenuRow
            styles={styles}
            colors={colors}
            Icon={PackageCheck}
            title="Linh kiện cần trả"
            desc="Linh kiện còn giữ, theo từng đơn"
            onPress={() => navigation.navigate('TechnicianPartReturns')}
          />
        </View>

        {/* HỒ SƠ NGHỀ NGHIỆP */}
        <Text style={styles.sectionTitle} accessibilityRole="header">Hồ sơ nghề nghiệp</Text>
        <View style={styles.group}>
          <MenuRow
            styles={styles}
            colors={colors}
            Icon={Wrench}
            title="Kỹ năng và dịch vụ nhận làm"
            desc={skillDesc}
            onPress={() => navigation.navigate('TechnicianSkills')}
          />
          <View style={styles.divider} />
          <MenuRow
            styles={styles}
            colors={colors}
            Icon={FileText}
            title="Giấy tờ chứng minh"
            desc="Bằng cấp, chứng chỉ đã nộp cho kỹ năng"
            onPress={() => navigation.navigate('TechnicianEvidence')}
          />
          <View style={styles.divider} />
          <MenuRow
            styles={styles}
            colors={colors}
            Icon={MapPin}
            title="Khu vực hoạt động"
            desc={
              profileLoading && !technicianProfile
                ? 'Đang tải…'
                : technicianAddress
                  ? technicianProfile?.serviceRadiusKm != null
                    ? `${technicianAddress.line1} · ${technicianProfile.serviceRadiusKm} km`
                    : technicianAddress.line1
                  : 'Chưa cập nhật vị trí'
            }
            onPress={() => navigation.navigate('TechnicianServiceAreas')}
          />
        </View>

        {/* TÀI KHOẢN */}
        <Text style={styles.sectionTitle} accessibilityRole="header">Tài khoản</Text>
        <View style={styles.group}>
          <View style={styles.accountField}>
            <Text style={styles.accountLabel}>Email</Text>
            <Text style={styles.accountValue}>{accountEmail}</Text>
          </View>
          <View style={styles.accountDivider} />
          <View style={styles.accountField}>
            <Text style={styles.accountLabel}>Số điện thoại</Text>
            <Text style={styles.accountValue}>{accountPhone}</Text>
          </View>
        </View>
        <ContactVerificationCard />
        <View style={styles.group}>
          <MenuRow
            styles={styles}
            colors={colors}
            Icon={ShieldCheck}
            title="Xác minh danh tính"
            // Nhãn màu đã nói trạng thái; chỉ giữ dòng mô tả khi nó thêm thông tin (đang tải, lý do từ chối...).
            desc={verification !== null && kycDesc === KYC_VIEW[verification.status].label ? undefined : kycDesc}
            badge={verification !== null ? <StatusBadge view={KYC_VIEW[verification.status]} /> : undefined}
            onPress={() => navigation.navigate('TechnicianKyc')}
          />
        </View>

        <View style={styles.logoutSpacer} />
        <AccountLogoutAction onPress={handleLogout} />
      </ScrollView>

      <Modal visible={isAvatarModalVisible} transparent={true} animationType={reduceMotion ? 'none' : 'fade'} onRequestClose={() => setAvatarModalVisible(false)}>
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
  scrollContent: { flexGrow: 1, padding: 16, gap: 12 },
  pageHeading: { gap: 4, paddingBottom: 4 },
  pageTitle: { fontSize: 24, lineHeight: 32, fontWeight: '700', color: colors.text },
  identity: { flexDirection: 'column', alignItems: 'center', gap: 12, paddingVertical: 24, paddingHorizontal: 16, backgroundColor: colors.primarySoft, borderRadius: 22, borderWidth: 1, borderColor: colors.primaryTint },
  identityText: { width: '100%', alignItems: 'center', gap: 4 },
  name: { fontSize: 20, lineHeight: 28, fontWeight: '700', color: colors.text, textAlign: 'center' },
  phone: { fontSize: 14, lineHeight: 20, color: colors.textSecondary, textAlign: 'center' },
  chipRow: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 24, paddingHorizontal: 8, borderRadius: 8 },
  chipText: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  avatarBorder: { width: 88, height: 88, borderRadius: 44, justifyContent: 'center', alignItems: 'center' },
  avatar: { width: '100%', height: '100%', minWidth: 44, minHeight: 44, borderRadius: 44, backgroundColor: colors.primaryTint, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  avatarImage: { width: '100%', height: '100%' },
  avatarText: { fontSize: 32, fontWeight: '700', color: colors.primaryStrong },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500', color: colors.textSecondary },
  incomeCard: { padding: 16, gap: 4 },
  incomeValue: { fontSize: 24, lineHeight: 32, fontWeight: '700', color: colors.text },
  sectionTitle: { fontSize: 20, lineHeight: 28, fontWeight: '600', color: colors.text, marginTop: 12 },
  group: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  accountField: { paddingHorizontal: 16, paddingVertical: 12, gap: 2 },
  accountLabel: { fontSize: 13, lineHeight: 18, fontWeight: '600', color: colors.textSecondary },
  accountValue: { fontSize: 15, lineHeight: 22, color: colors.text },
  accountDivider: { height: 1, backgroundColor: colors.divider, marginHorizontal: 16 },
  menuItem: { flexDirection: 'row', minHeight: 56, paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center', gap: 12 },
  menuIconTile: { width: 36, height: 36, borderRadius: 8, backgroundColor: colors.primarySoft, justifyContent: 'center', alignItems: 'center' },
  menuContent: { flex: 1 },
  menuTitle: { fontSize: 16, lineHeight: 24, fontWeight: '500', color: colors.text },
  menuDesc: { fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  divider: { height: 1, backgroundColor: colors.divider, marginLeft: 64 },
  logoutSpacer: { flexGrow: 1, minHeight: 12 },
  cameraTouch: { position: 'absolute', bottom: -8, right: -8, width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  cameraIconBadge: { backgroundColor: colors.primaryStrong, width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: colors.background },
  menuBadge: { alignSelf: 'flex-start', marginTop: 6 },
  avatarModalContainer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center' },
  closeAvatarModalBtn: { position: 'absolute', top: 50, right: 12, zIndex: 10, width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  fullAvatarImage: { width: '100%', height: 400 },

  // ---- Hồ sơ nghề nghiệp sheets ----
  modalContent: { width: '100%', padding: 16, paddingBottom: 40 },
  modalTitle: { fontSize: 20, lineHeight: 28, fontWeight: '600', color: colors.text, marginBottom: 16 },
  subTitle: { fontSize: 16, lineHeight: 24, fontWeight: '600', color: colors.text, marginBottom: 8 },
  fieldLabel: { fontSize: 14, lineHeight: 20, color: colors.text, marginBottom: 6, fontWeight: '500' },
  input: { width: '100%', minHeight: 48, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.textSecondary, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: colors.text, marginBottom: 12 },
  emptyText: { textAlign: 'center', fontSize: 14, lineHeight: 20, color: colors.textSecondary, marginVertical: 12 },
  modalActions: { flexDirection: 'row', width: '100%', marginTop: 8, gap: 12 },
  primaryBtn: { minHeight: 48, borderRadius: 14, backgroundColor: colors.primaryStrong, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16 },
  primaryBtnText: { color: colors.surface, fontWeight: '600', fontSize: 16, lineHeight: 24 },
  secondaryBtn: { minHeight: 48, borderRadius: 14, borderWidth: 1.5, borderColor: colors.primaryStrong, backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16 },
  secondaryBtnText: { color: colors.primaryStrong, fontWeight: '600', fontSize: 16, lineHeight: 24 },
  iconBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },

  sheetHeader: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 6, gap: 8 },


});
