// src/screens/guest/CustomerGuestHomeScreen.tsx
//
// Zero-network guest home: Codex CustomerHome visual hierarchy rendered with
// static native content only. No API imports, no storage/service POST, no
// protected tab mounting, no fake price/ratings/ETA/account/order/location.
// Hero and category art are owner-supplied transparent PNGs; category tiles
// and search browse the existing public
// `CustomerServices` catalogue route; booking, AI and account actions stay
// behind explicit Auth. The four-item bottom bar is guest-local: Home scrolls
// to top, the protected tabs open the existing Auth route.
import React from 'react';
import { View, Text, Pressable, StyleSheet, TouchableOpacity, ScrollView, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ArrowUpRight, LogIn, MapPin, Search, Wrench } from 'lucide-react-native';
import { useAppTheme } from '../../constants/theme';
import { CUSTOMER_UI_ARTWORK } from '../../constants/customer-artwork';
import ServiceArtwork from '../../components/customer/ServiceArtwork';
import CustomerAnimatedBottomBar from '../../components/navigation/CustomerAnimatedBottomBar';
import { useReduceMotion } from '../../hooks/useReduceMotion';
import type { RootStackParamList } from '../../types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const HERO_SCENE = CUSTOMER_UI_ARTWORK.homeHero;

// Static recognition shortcuts only. The Home search opens discovery without
// typing; the discovery screen owns real backend search.
const GUEST_CATEGORIES = [
  { label: 'Vệ sinh máy lạnh', query: 'Vệ sinh máy lạnh', artCode: 'VE_SINH_DIEU_HOA_1HP' },
  { label: 'Thay công tắc điện', query: 'Thay công tắc điện', artCode: 'THAY_CONG_TAC_DIEN' },
  { label: 'Sửa rò rỉ nước', query: 'Sửa rò rỉ nước', artCode: 'SUA_RO_RI_NUOC' },
] as const;

export default function CustomerGuestHomeScreen() {
  const { colors, spacing, fontSize } = useAppTheme();
  const styles = getStyles(colors, spacing, fontSize);
  const navigation = useNavigation<Nav>();
  const scrollRef = React.useRef<ScrollView>(null);
  const reduceMotion = useReduceMotion();
  const goLogin = () => {
    navigation.navigate('Auth');
  };

  const goBrowseAll = () => {
    navigation.navigate('CustomerServices');
  };

  const goBrowseCategory = (query: string) => {
    navigation.navigate('CustomerServices', { query });
  };

  const openDiscovery = () => navigation.navigate('CustomerServices');

  const goHomeTop = () => {
    scrollRef.current?.scrollTo({ y: 0, animated: !reduceMotion });
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
      <ScrollView ref={scrollRef} style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.brandRow}>
          <View style={styles.brandLeft}>
            <View style={styles.brandMark}>
              <Wrench size={18} color={colors.surface} />
            </View>
            <Text style={styles.brandName}>
              Fix<Text style={styles.brandNameAccent}>Home</Text>
            </Text>
          </View>
          <View style={styles.guestPill}>
            <Text style={styles.guestPillText}>Khách</Text>
          </View>
        </View>

        <View style={styles.locationStrip}>
          <MapPin size={17} color={colors.primaryStrong} />
          <View style={styles.locationText}>
            <Text style={styles.locationTitle}>Khám phá dịch vụ tại nhà</Text>
            <Text style={styles.locationSub}>Chưa cần chọn khu vực</Text>
          </View>
        </View>

        <View style={styles.hero}>
          <View style={styles.heroCopy}>
            <Text style={styles.heroTitle} accessibilityRole="header">
              Nhà cần sửa.{'\n'}
              <Text style={styles.heroTitleAccent}>Mình có nhau.</Text>
            </Text>
          </View>
          <Image
            source={HERO_SCENE}
            style={styles.heroArt}
            resizeMode="contain"
            accessible={false}
            testID="guest-hero-art"
          />
        </View>

        <Pressable
          style={styles.searchBar}
          accessibilityRole="button"
          accessibilityLabel="Tìm dịch vụ tại nhà"
          accessibilityHint="Mở danh mục dịch vụ công khai. Chạm vào ô tìm kiếm ở trang tiếp theo để nhập từ khóa."
          onPress={openDiscovery}
        >
          <Search size={20} color={colors.textSecondary} />
          <Text style={styles.searchPlaceholder}>Nhà bạn cần sửa gì?</Text>
          <View
            style={styles.searchGo}
          >
            <ArrowUpRight size={18} color={colors.primaryStrong} />
          </View>
        </Pressable>

        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle} accessibilityRole="header">Dịch vụ cho nhà bạn</Text>
          <TouchableOpacity
            style={styles.seeAll}
            accessibilityRole="button"
            accessibilityLabel="Xem tất cả dịch vụ"
            onPress={goBrowseAll}
            activeOpacity={0.8}
          >
            <Text style={styles.seeAllText}>Xem tất cả</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.railContent}
          accessibilityLabel="Các nhóm dịch vụ cho nhà bạn"
        >
          {GUEST_CATEGORIES.map((category) => (
            <TouchableOpacity
              key={category.label}
              style={styles.railTile}
              accessibilityRole="button"
              accessibilityLabel={`Xem dịch vụ ${category.label}`}
              accessibilityHint="Mở danh mục dịch vụ công khai"
              onPress={() => goBrowseCategory(category.query)}
              activeOpacity={0.85}
            >
              <View style={styles.railArt}>
                <ServiceArtwork code={category.artCode} name={`Minh họa ${category.label}`} size={64} />
              </View>
              <Text style={styles.railName}>{category.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <TouchableOpacity
          style={styles.aiEntry}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Tìm hiểu gợi ý AI, cần đăng nhập"
          accessibilityHint="Đăng nhập để dùng gợi ý AI"
          onPress={goLogin}
        >
          <View style={styles.aiIcon}>
            <Image source={CUSTOMER_UI_ARTWORK.aiHelper} style={{ width: 36, height: 36 }} resizeMode="contain" accessible={false} testID="guest-ai-art" />
          </View>
          <View style={styles.aiText}>
            <Text style={styles.aiTitle}>Chưa biết bắt đầu từ đâu?</Text>
            <Text style={styles.aiSub}>FixHome AI gợi ý, bạn quyết định.</Text>
          </View>
          <ArrowUpRight size={19} color={colors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.primaryBtn}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Đăng nhập hoặc tạo tài khoản"
          onPress={goLogin}
        >
          <LogIn size={18} color={colors.surface} />
          <Text style={styles.primaryText}>Đăng nhập / Tạo tài khoản</Text>
        </TouchableOpacity>
        <Text style={styles.note}>
          Bạn đang xem với vai trò khách. Đặt lịch và xem đơn cần đăng nhập.
        </Text>
      </ScrollView>

      <CustomerAnimatedBottomBar
        mode="guest"
        activeRouteName="Home"
        onGuestTabPress={(routeName) => routeName === 'Home' ? goHomeTop() : goLogin()}
        onGuestBookingChoice={goLogin}
      />
    </SafeAreaView>
  );
}

const getStyles = (colors: any, spacing: any, fontSize: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scroll: { flex: 1 },
    content: { flexGrow: 1, padding: spacing.md, paddingBottom: 112 },
    brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
    brandLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    brandMark: { width: 32, height: 32, borderRadius: 10, backgroundColor: colors.primaryStrong, alignItems: 'center', justifyContent: 'center' },
    brandName: { fontSize: fontSize.xl, fontWeight: '700', color: colors.text, letterSpacing: -0.5 },
    brandNameAccent: { color: colors.primaryStrong },
    guestPill: { borderRadius: 8, backgroundColor: colors.primaryTint, paddingHorizontal: 10, paddingVertical: 6 },
    guestPillText: { fontSize: fontSize.xs, fontWeight: '600', color: colors.primaryStrong },
    locationStrip: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14, minHeight: 44 },
    locationText: { flex: 1 },
    locationTitle: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
    locationSub: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 1 },
    hero: {
      height: 244,
      backgroundColor: colors.primaryTint,
      borderRadius: 26,
      padding: 23,
      overflow: 'hidden',
      marginBottom: 4,
    },
    heroCopy: { position: 'relative', zIndex: 2, maxWidth: 210 },
    heroTitle: { fontSize: 29, lineHeight: 38, fontWeight: '700', color: colors.text, marginTop: 10 },
    heroTitleAccent: { color: colors.primaryStrong },
    heroArt: { position: 'absolute', width: 184, height: 124, right: 12, bottom: 8, zIndex: 1 },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      minHeight: 56,
      marginTop: -12,
      marginHorizontal: 12,
      shadowColor: '#244871',
      shadowOpacity: 0.06,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 2,
    },
  searchPlaceholder: { flex: 1, fontSize: fontSize.md, color: colors.textSecondary, minHeight: 48, textAlignVertical: 'center' },
    searchGo: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, marginBottom: 12 },
    sectionTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
    seeAll: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, paddingLeft: 12 },
    seeAllText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.primaryStrong },
    railContent: { gap: 10, paddingRight: spacing.md },
    railTile: {
      width: 112,
      borderRadius: 19,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      paddingBottom: 12,
      overflow: 'hidden',
    },
    railArt: { height: 88, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
    railName: { fontSize: fontSize.xs, fontWeight: '600', color: colors.text, paddingHorizontal: 10, marginTop: 10 },
    aiEntry: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 19,
      padding: 16,
      marginTop: spacing.md,
      minHeight: 72,
    },
    aiIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' },
    aiText: { flex: 1 },
    aiTitle: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
    aiSub: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2, lineHeight: 18 },
    primaryBtn: {
      flexDirection: 'row',
      minHeight: 44,
      borderRadius: 14,
      backgroundColor: colors.primaryStrong,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginTop: spacing.md,
    },
    primaryText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.surface },
    note: { fontSize: fontSize.xs, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.md },
  });
