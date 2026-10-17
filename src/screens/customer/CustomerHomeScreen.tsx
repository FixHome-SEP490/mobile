import { useAppTheme } from '../../constants/theme';
import { CUSTOMER_UI_ARTWORK } from '../../constants/customer-artwork';
// src/screens/customer/CustomerHomeScreen.tsx
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { MessageCircle } from 'lucide-react-native';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TouchableOpacity,
  Image,
  StatusBar,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../types';
import { useAuthStore } from '../../store';
import { UserRole } from '../../types';
import { usersApi, AddressData } from '../../api/users.api';
import { bookingsApi } from '../../api/bookings.api';
import { ordersApi } from '../../api/orders.api';
import { homeResumeTarget, type HomeResumeItem } from './customer-bookings-history';
import {
  HOME_POPULAR_SERVICE_TARGETS,
  getHomePopularGridColumns,
} from './customer-home-pager';
import { orderDetailTarget } from './customer-order-detail';
import { OTHER_SERVICE_CATEGORY_CODE } from './service-catalog';
import ServiceArtwork from '../../components/customer/ServiceArtwork';
import { useScrollHideTabBar } from '../../hooks/useScrollHideTabBar';
import { useChatUnreadCount } from '../../hooks/useChatUnreadCount';
import { SafeAreaView } from 'react-native-safe-area-context';
import CustomerAnimatedBottomBar from '../../components/navigation/CustomerAnimatedBottomBar';
import { useReduceMotion } from '../../hooks/useReduceMotion';
import { BottomSheetModal, BottomSheetBackdrop, BottomSheetFlatList } from '@gorhom/bottom-sheet';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';

interface PopularServiceItem {
  code: string;
  name: string;
  // Deep-link target on CustomerServices: categoryCode filters by the
  // Backend's seeded category; query pre-fills the existing server search.
  categoryCode?: string;
  query?: string;
}

const getPopularServices = (): PopularServiceItem[] => [
  {
    code: 'VE_SINH_DIEU_HOA_1HP',
    name: 'Vệ sinh máy lạnh',
    categoryCode: HOME_POPULAR_SERVICE_TARGETS[0].categoryCode,
    query: 'Vệ sinh máy lạnh',
  },
  {
    code: 'THAY_VOI_NUOC',
    name: 'Thay vòi nước',
    categoryCode: HOME_POPULAR_SERVICE_TARGETS[1].categoryCode,
    query: 'Thay vòi nước',
  },
  {
    code: 'THAY_CONG_TAC_DIEN',
    name: 'Thay công tắc điện',
    categoryCode: HOME_POPULAR_SERVICE_TARGETS[2].categoryCode,
    query: 'Thay công tắc điện',
  },
  {
    code: 'SUA_RO_RI_NUOC',
    name: 'Sửa rò rỉ nước',
    categoryCode: HOME_POPULAR_SERVICE_TARGETS[3].categoryCode,
    query: 'Sửa rò rỉ nước',
  },
  {
    code: 'LAP_TV_GIA_TREO',
    name: 'Lắp TV treo tường',
    query: 'Lắp TV treo tường',
  },
  {
    code: 'SUA_BEP_TU',
    name: 'Sửa bếp từ',
    categoryCode: HOME_POPULAR_SERVICE_TARGETS[5].categoryCode,
    query: 'Sửa bếp từ',
  },
  {
    code: 'SUA_MAY_GIAT',
    name: 'Sửa máy giặt',
    categoryCode: HOME_POPULAR_SERVICE_TARGETS[6].categoryCode,
    query: 'Sửa máy giặt',
  },
  {
    code: 'SUA_TU_LANH',
    name: 'Sửa tủ lạnh',
    categoryCode: HOME_POPULAR_SERVICE_TARGETS[7].categoryCode,
    query: 'Sửa tủ lạnh',
  },
];

export default function CustomerHomeScreen() {
  const { colors, spacing, fontSize } = useAppTheme();
  const { width: windowWidth, height: windowHeight, fontScale } = useWindowDimensions();
  const popularColumns = getHomePopularGridColumns(windowWidth, fontScale);
  const heroArtWidth = Math.min(210, Math.max(154, Math.round(windowWidth * 0.46)));
  const popularArtSize = popularColumns === 4
    ? Math.min(60, Math.max(50, Math.round(windowWidth / 6.4)))
    : 68;
  const stackHero = fontScale >= 1.2;
  const styles = getStyles(colors, spacing, fontSize, fontScale, windowWidth, popularColumns, heroArtWidth);
  const POPULAR_SERVICES = useMemo(() => getPopularServices(), []);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const handleScroll = useScrollHideTabBar();
  const chatUnread = useChatUnreadCount();

  const handleSearch = () => navigation.navigate('CustomerServices');

  const { user, isAuthenticated } = useAuthStore();
  const isGuest = !isAuthenticated;
  const scrollRef = useRef<ScrollView>(null);
  const reduceMotion = useReduceMotion();
  const [selectedAddress, setSelectedAddress] = useState('Đang tải địa chỉ...');
  const [addresses, setAddresses] = useState<AddressData[]>([]);
  const [resume, setResume] = useState<HomeResumeItem | null>(null);
  const addressSheetRef = useRef<BottomSheetModal>(null);

  const closeAddressSheet = useCallback(() => {
    addressSheetRef.current?.dismiss();
  }, []);

  const fetchAddress = useCallback(async () => {
    try {
      if (!isAuthenticated) {
        setAddresses([]);
        setSelectedAddress('Khám phá dịch vụ tại nhà');
        return;
      }
      
      if (user?.role === UserRole.TECHNICIAN) {
        setSelectedAddress('Không áp dụng cho Thợ');
        return;
      }
      
      const res = await usersApi.getAddresses();
      if (res && res.length > 0) {
        setAddresses(res);
        const defaultAddress = res.find(a => a.isDefault) || res[0];
        setSelectedAddress(defaultAddress.line1);
      } else {
        setAddresses([]);
        setSelectedAddress('Chưa có địa chỉ nào');
      }
    } catch (error) {
      console.error('Failed to load addresses:', error);
      setSelectedAddress('Không thể tải địa chỉ');
    }
  }, [isAuthenticated, user, setSelectedAddress]);

  useEffect(() => {
    const load = async () => {
      await fetchAddress();
    };
    load();
  }, [fetchAddress]);

  // Active-order resume (read-only): at most one concise card from real
  // Booking/Order data. Hidden on error/unknown data — never a false claim.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const session = useAuthStore.getState();
      const ownerId = session.user?.id ?? null;
      if (!session.isAuthenticated || session.user?.role !== UserRole.CUSTOMER || !ownerId) {
        setResume(null);
        return;
      }
      void (async () => {
        try {
          const [bookingsPage, orders] = await Promise.all([
            bookingsApi.getMyBookingsPage(1, 5),
            ordersApi.getMyOrders(),
          ]);
          if (cancelled || useAuthStore.getState().user?.id !== ownerId) return;
          setResume(homeResumeTarget(bookingsPage.data ?? [], orders ?? []));
        } catch {
          if (!cancelled) setResume(null);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, []),
  );

  const openResume = useCallback(() => {
    if (!resume) return;
    Haptics.selectionAsync();
    if (resume.kind === 'order') {
      const target = orderDetailTarget(resume.orderId);
      if (target) navigation.navigate('CustomerOrderDetail', { serviceOrderId: target });
    } else {
      navigation.navigate('CustomerMatching', { bookingId: resume.bookingId });
    }
  }, [navigation, resume]);


  const handleServicePress = (service: PopularServiceItem) => {
    Haptics.selectionAsync();
    navigation.navigate('CustomerServices', {
      categoryCode: service.categoryCode,
      query: service.query,
    });
  };

  const greetUser = () => {
    const hour = new Date().getHours();
    const name = user?.fullName?.split(' ').pop() ?? '';
    if (hour < 12) return name ? `Chào buổi sáng, ${name}` : 'Chào buổi sáng';
    if (hour < 18) return name ? `Chào buổi chiều, ${name}` : 'Chào buổi chiều';
    return name ? `Chào buổi tối, ${name}` : 'Chào buổi tối';
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor="#1D4ED8" />

      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        {/* One continuous blue gradient carries the brand bar into the hero. */}
        <LinearGradient
          colors={['#1D4ED8', '#2563EB', '#3B82F6']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroGradient}
        >
          <View style={styles.topBar}>
            <View style={styles.brandRow}>
              <View style={styles.brandIcon}>
                <Image source={require('../../../assets/icon.png')} style={styles.brandIconImg} />
              </View>
              <Text style={styles.brandName}>FixHome</Text>
            </View>
            <View style={styles.topBarActions}>
              <TouchableOpacity
                style={styles.topBarIconBtn}
                onPress={() => navigation.navigate(isGuest ? 'Auth' : 'ChatList')}
                activeOpacity={0.8}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={chatUnread > 0 ? `Tin nhắn, ${chatUnread} tin chưa đọc` : 'Tin nhắn'}
              >
                <MessageCircle
                  size={22}
                  color="rgba(255,255,255,0.96)"
                  strokeWidth={2.1}
                  testID="home-chat-message-icon"
                  accessible={false}
                />
                {chatUnread > 0 && (
                  <View style={styles.notificationBadge}>
                    <Text style={styles.notificationBadgeText}>{chatUnread > 9 ? '9+' : chatUnread}</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.hero}>
            <Text accessibilityRole="header" style={styles.heroGreeting} accessibilityLabel={greetUser()}>
              {greetUser()}
            </Text>
            <TouchableOpacity
              style={styles.addressStrip}
              onPress={() => isGuest ? navigation.navigate('Auth') : addressSheetRef.current?.present()}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={`Địa chỉ: ${selectedAddress}`}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="location-outline" size={15} color="rgba(255,255,255,0.9)" />
              <Text style={styles.addressText} numberOfLines={1}>{selectedAddress}</Text>
              <Ionicons name="chevron-down" size={14} color="rgba(255,255,255,0.8)" />
            </TouchableOpacity>

            <View style={[styles.heroHeadlineRow, stackHero && styles.heroHeadlineStack]}>
              <View style={styles.heroHeadlineCopy} testID="home-hero-headline-copy">
                <Text accessibilityRole="header" style={styles.heroHeadline} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>
                  Nhà cần sửa.
                </Text>
                <Text style={[styles.heroHeadline, styles.heroHeadlineAccent]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>
                  Mình có nhau.
                </Text>
              </View>
              <Image
                source={CUSTOMER_UI_ARTWORK.homeHero}
                style={[styles.heroSceneArt, stackHero && styles.heroSceneArtStacked]}
                resizeMode="contain"
                accessible={false}
                testID="home-hero-art"
              />
            </View>
          </View>
        </LinearGradient>

        {/* 3. Overlapping search bar — floats below hero */}
        <View style={styles.searchCard}>
          <Pressable
            style={styles.searchBar}
            onPress={handleSearch}
            accessibilityRole="button"
            accessibilityLabel="Tìm dịch vụ tại nhà"
            accessibilityHint="Mở danh mục dịch vụ. Chạm vào ô tìm kiếm ở trang tiếp theo để nhập từ khóa."
          >
            <Ionicons name="search" size={20} color={colors.primaryStrong} />
            <Text style={styles.searchPlaceholder}>Nhà bạn cần sửa gì?</Text>
            <View
              style={styles.searchBtn}
            >
              <Ionicons name="arrow-forward" size={19} color={colors.surface} />
            </View>
          </Pressable>
        </View>

        {/* 4. Active-order resume: one concise card only with real active data */}
        {!!resume && (
          <TouchableOpacity
            style={styles.resumeCard}
            onPress={openResume}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`${resume.title}. ${resume.detail}`}
          >
            <View style={styles.resumePulseDot} />
            <View style={styles.resumeTextBox}>
              <Text style={styles.resumeTitle}>{resume.title}</Text>
              <Text style={styles.resumeDetail} numberOfLines={1}>{resume.detail}</Text>
            </View>
            <View style={styles.resumeCta}>
              <Text style={styles.resumeCtaText}>Tiếp tục</Text>
              <Ionicons name="open-outline" size={17} color={colors.primaryStrong} />
            </View>
          </TouchableOpacity>
        )}

        {/* 5. Service section heading */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Dịch vụ cho nhà bạn</Text>
          <TouchableOpacity
            onPress={() => navigation.navigate('CustomerServices')}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Xem tất cả dịch vụ"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <View style={styles.viewAllRow}>
              <Text style={styles.viewAllText}>Xem tất cả</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Eight production-linked services remain visible in the same compact grid. */}
        <View style={styles.servicesGrid} testID="popular-services-grid">
          {POPULAR_SERVICES.map((service) => (
            <TouchableOpacity
              key={service.code}
              style={[styles.serviceItem, { width: `${100 / popularColumns}%` }]}
              onPress={() => handleServicePress(service)}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel={service.name}
              accessibilityHint={`Tìm ${service.name} trong danh mục`}
            >
              <ServiceArtwork code={service.code} name={service.name} size={popularArtSize} />
              <Text style={styles.serviceName} numberOfLines={2}>{service.name}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* 7. AI entry — Codex "Chưa biết bắt đầu từ đâu?" */}
        <TouchableOpacity
          style={styles.aiEntry}
          activeOpacity={0.8}
          onPress={() => navigation.navigate(isGuest ? 'Auth' : 'CustomerAIDiagnosis')}
          accessibilityRole="button"
          accessibilityLabel="Hỏi FixHome AI"
          accessibilityHint="Mở chẩn đoán sơ bộ bằng AI"
        >
          <View style={styles.aiIconBox}>
            <Image source={CUSTOMER_UI_ARTWORK.aiHelper} style={{ width: 36, height: 36 }} resizeMode="contain" accessible={false} testID="home-ai-art" />
          </View>
          <View style={styles.aiCopy}>
            <Text style={styles.aiTitle}>Chưa biết bắt đầu từ đâu?</Text>
          </View>
          <Ionicons name="open-outline" size={19} color={colors.muted} />
        </TouchableOpacity>

        {/* 8. "Other" service entry */}
        <TouchableOpacity
          style={styles.otherServiceCard}
          activeOpacity={0.8}
          onPress={() =>
            navigation.navigate('CustomerServices', {
              categoryCode: OTHER_SERVICE_CATEGORY_CODE,
              query: 'Khác',
            })
          }
          accessibilityRole="button"
          accessibilityLabel="Đặt dịch vụ khác"
        >
          <View style={styles.otherServiceIcon}>
            <Ionicons name="ellipsis-horizontal" size={24} color={colors.primaryStrong} />
          </View>
          <View style={styles.otherServiceCopy}>
            <Text style={styles.otherServiceTitle}>Không thấy dịch vụ bạn cần?</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.muted} />
        </TouchableOpacity>

        {/* Like the web account menu: wallet and warranty one tap from Home (Profile keeps them too). */}
        {!isGuest && (
          <View style={styles.quickRow}>
            {([
              ['CustomerWallet', 'wallet-outline', 'Ví của tôi'],
              ['CustomerWarranties', 'shield-checkmark-outline', 'Bảo hành'],
            ] as const).map(([route, icon, label]) => (
              <TouchableOpacity
                key={route}
                testID={`home-quick-${route}`}
                style={styles.quickItem}
                activeOpacity={0.8}
                onPress={() => navigation.navigate(route)}
                accessibilityRole="button"
                accessibilityLabel={label}
              >
                <Ionicons name={icon} size={22} color={colors.primaryStrong} />
                <Text style={styles.quickLabel}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* 9. Restrained, source-honest info */}

        {isGuest && <TouchableOpacity style={[styles.searchBar, { margin: 16, justifyContent: 'center' }]} accessibilityRole="button" accessibilityLabel="Đăng nhập hoặc tạo tài khoản" onPress={() => navigation.navigate('Auth')}><Text style={{ color: colors.primaryStrong, fontWeight: '600' }}>Đăng nhập / Tạo tài khoản</Text></TouchableOpacity>}
        <View style={{ height: isGuest ? 112 : 40 }} />
      </ScrollView>

      {isGuest && <CustomerAnimatedBottomBar mode="guest" activeRouteName="Home" onGuestTabPress={name => name === 'Home' ? scrollRef.current?.scrollTo({ y: 0, animated: !reduceMotion }) : navigation.navigate('Auth')} onGuestBookingChoice={() => navigation.navigate('Auth')} />}

      {/* Address Selection Bottom Sheet */}
      <BottomSheetModal
        ref={addressSheetRef}
        enableDynamicSizing
        maxDynamicContentSize={Math.round(windowHeight * 0.8)}
        backdropComponent={(props) => (
          <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.5} />
        )}
      >
        {/* Sized to its rows (header and empty state live inside the list so the sheet measures them). */}
        <BottomSheetFlatList
          data={addresses}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.addressListContent}
          ListHeaderComponent={
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Chọn địa chỉ</Text>
              <TouchableOpacity
                onPress={closeAddressSheet}
                style={styles.closeBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Đóng"
              >
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyAddress}>
              <Text style={styles.emptyAddressText}>Bạn chưa có địa chỉ nào.</Text>
              <TouchableOpacity style={styles.addAddressBtn} onPress={() => {
                closeAddressSheet();
                (navigation as any).navigate('Profile');
              }}>
                <Text style={styles.addAddressBtnText}>Thêm địa chỉ mới</Text>
              </TouchableOpacity>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.addressItem, selectedAddress === item.line1 && styles.addressItemActive]}
              onPress={() => {
                Haptics.selectionAsync();
                setSelectedAddress(item.line1);
                closeAddressSheet();
              }}
            >
              <Ionicons
                name={selectedAddress === item.line1 ? "radio-button-on" : "radio-button-off"}
                size={22}
                color={selectedAddress === item.line1 ? colors.primary : colors.muted}
              />
              <View style={styles.addressItemTextContainer}>
                <Text style={[styles.addressItemLabel, selectedAddress === item.line1 && styles.addressItemLabelActive]}>
                  {item.label || (item.isDefault ? 'Mặc định' : 'Địa chỉ')}
                </Text>
                <Text style={styles.addressItemLine} numberOfLines={2}>
                  {item.line1}
                </Text>
              </View>
            </TouchableOpacity>
          )}
        />
      </BottomSheetModal>
    </SafeAreaView>
  );
}

const HERO_BG = '#1D4ED8'; // brand[700] — deep blue hero, matches Codex
const HERO_ACCENT = '#DBEAFE'; // high-contrast light brand accent over the blue hero

const getStyles = (
  colors: any,
  spacing: any,
  fontSize: any,
  fontScale: number,
  windowWidth: number,
  popularColumns: number,
  heroArtWidth: number,
) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingBottom: 16,
  },

  // 1. Top bar (lives inside hero blue bg)
  heroGradient: {
    width: '100%',
    paddingBottom: 22,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'transparent',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  brandIcon: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  brandIconImg: {
    width: 32,
    height: 32,
    borderRadius: 9,
  },
  brandName: {
    fontSize: 21,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  topBarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  topBarIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  notificationBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: colors.error,
    width: 14,
    height: 14,
    borderRadius: 7,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: HERO_BG,
  },
  notificationBadgeText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: 'bold',
  },

  // 2. Blue hero — Codex canonical
  hero: {
    backgroundColor: 'transparent',
    paddingHorizontal: 16,
    paddingTop: 2,
    paddingBottom: 0,
  },
  heroGreeting: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.75)',
    marginBottom: 1,
    letterSpacing: 0.2,
  },
  addressStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 30,
    marginBottom: 8,
  },
  addressText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
    flex: 1,
  },
  heroHeadlineRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    position: 'relative',
    minHeight: Math.round(heroArtWidth * 0.78),
  },
  heroHeadlineStack: {
    flexDirection: 'column',
    alignItems: 'stretch',
    justifyContent: 'flex-start',
    minHeight: 0,
  },
  heroHeadlineCopy: {
    width: '100%',
    position: 'relative',
    zIndex: 2,
  },
  heroEyebrow: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: 'rgba(255,255,255,0.65)',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  heroHeadline: {
    fontSize: windowWidth < 390 ? 25 : 29,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: windowWidth < 390 ? 31 : 35,
    letterSpacing: -0.7,
    includeFontPadding: false,
    textShadowColor: 'rgba(15,23,42,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  heroHeadlineAccent: {
    color: HERO_ACCENT,
  },
  heroSubtitle: {
    fontSize: 13,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.75)',
  },
  heroSceneArt: {
    position: 'absolute',
    right: -6,
    bottom: 0,
    width: heroArtWidth,
    height: Math.round(heroArtWidth * 0.78),
    marginTop: 0,
    marginBottom: 0,
    flexShrink: 0,
    alignSelf: 'flex-end',
    zIndex: 0,
  },
  heroSceneArtStacked: {
    position: 'relative',
    right: 0,
    bottom: 0,
    alignSelf: 'flex-end',
    marginTop: 0,
    marginBottom: 0,
  },

  // 3. Overlapping search card
  searchCard: {
    paddingHorizontal: 16,
    marginTop: -18,
    marginBottom: 4,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 56,
    paddingHorizontal: 16,
    gap: 8,
    // Card-like elevation
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  searchPlaceholder: {
    flex: 1,
    fontSize: 14,
    color: colors.textSecondary,
    paddingVertical: 12,
  },
  searchBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.primaryStrong,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // 4. Resume card (real Booking/Order data only)
  resumeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    marginTop: 12,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 3,
    borderLeftColor: colors.primaryStrong,
    gap: 8,
  },
  resumePulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primaryStrong,
    flexShrink: 0,
  },
  resumeTextBox: {
    flex: 1,
  },
  resumeTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  resumeDetail: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
    marginTop: 1,
  },
  resumeCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    flexShrink: 0,
  },
  resumeCtaText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primaryStrong,
  },

  // 5. Section header
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    lineHeight: 26,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.4,
  },
  viewAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minHeight: 44,
  },
  viewAllText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primaryStrong,
  },

  // 6. Popular services — all eight real choices in a responsive grid
  servicesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    alignItems: 'stretch',
  },
  serviceItem: {
    width: `${100 / popularColumns}%`,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 4,
    minHeight: 96,
  },
  serviceName: {
    fontSize: fontScale >= 1.2 ? 12 : 11,
    lineHeight: fontScale >= 1.2 ? 18 : 15,
    textAlign: 'center',
    fontWeight: '600',
    color: colors.text,
    marginBottom: 2,
    paddingHorizontal: 2,
  },
  serviceExploreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  serviceExploreText: {
    fontSize: 10,
    color: colors.primaryStrong,
    fontWeight: '500',
  },

  // 7. AI entry — Codex style border-top/border-bottom separator
  aiEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderTopColor: colors.border,
    borderBottomColor: colors.border,
    paddingVertical: 16,
    backgroundColor: 'transparent',
  },
  aiIconBox: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  aiCopy: { flex: 1 },
  aiTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },

  // 8. Other service card
  quickRow: { flexDirection: 'row', gap: 12, marginHorizontal: 16, marginBottom: 8 },
  quickItem: { flex: 1, minHeight: 56, paddingHorizontal: 16, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: 8 },
  quickLabel: { fontSize: 15, fontWeight: '600', color: colors.text },
  otherServiceCard: {
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  otherServiceIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otherServiceCopy: { flex: 1, gap: 2 },
  otherServiceTitle: { fontSize: 14, fontWeight: '700', color: colors.text },

  // 9. Quiet copy — Codex bottom note
  quietCopy: {
    paddingHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
  },
  quietText: {
    fontSize: 12,
    lineHeight: 19,
    color: colors.textSecondary,
  },

  // Address modal
  addressListContent: { paddingBottom: 32 },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  closeBtn: {
    padding: 4,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addressItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    minHeight: 64,
  },
  addressItemActive: {
    backgroundColor: colors.primarySoft,
  },
  addressItemTextContainer: {
    marginLeft: 12,
    flex: 1,
  },
  addressItemLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  addressItemLabelActive: {
    color: colors.primary,
  },
  addressItemLine: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  emptyAddress: {
    padding: 24,
    alignItems: 'center',
  },
  emptyAddressText: {
    fontSize: 15,
    color: colors.textSecondary,
    marginBottom: 16,
  },
  addAddressBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addAddressBtnText: {
    color: colors.surface,
    fontWeight: '600',
  },
});

