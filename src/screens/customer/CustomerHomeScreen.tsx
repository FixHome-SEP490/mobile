import { useAppTheme } from '../../constants/theme';
// src/screens/customer/CustomerHomeScreen.tsx
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  Dimensions,
  StatusBar,
  FlatList,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Ionicons,
  MaterialCommunityIcons,
  FontAwesome5,
} from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../types';
import { useAuthStore } from '../../store';
import { UserRole } from '../../types';
import { usersApi, AddressData } from '../../api/users.api';
import { useScrollHideTabBar } from '../../hooks/useScrollHideTabBar';
import { useChatUnreadCount } from '../../hooks/useChatUnreadCount';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BottomSheetModal, BottomSheetBackdrop } from '@gorhom/bottom-sheet';

const { width } = Dimensions.get('window');

interface ServiceItem {
  id: string;
  name: string;
  iconName: string;
  iconType: 'ionic' | 'material' | 'fa5';
  iconColor: string;
  pedestalColor: string;
  isHot?: boolean;
  imageSource?: any;
}

const getPopularServices = (colors: any): ServiceItem[] => [
  {
    id: 'ac_clean',
    name: 'Vệ sinh\nmáy lạnh',
    iconName: 'snowflake',
    iconType: 'fa5',
    iconColor: '#0284C7',
    pedestalColor: '#E0F2FE',
    imageSource: require('../../../assets/air-conditioner.png'),
  },
  {
    id: 'plumbing',
    name: 'Sửa ống\nnước',
    iconName: 'pipe-wrench',
    iconType: 'material',
    iconColor: '#0D9488',
    pedestalColor: '#CCFBF1',
    imageSource: require('../../../assets/water-pipeline.png'),
  },
  {
    id: 'electricity',
    name: 'Lắp đặt hệ\nthống điện',
    iconName: 'bolt',
    iconType: 'fa5',
    iconColor: '#EAB308',
    pedestalColor: '#FEF9C3',
    imageSource: require('../../../assets/voltage-cabinet.png'),
  },
  {
    id: 'drainage',
    name: 'Thông nghẹt\ncống',
    iconName: 'water-pump',
    iconType: 'material',
    iconColor: '#4F46E5',
    pedestalColor: '#E0E7FF',
    imageSource: require('../../../assets/unclogging-drains.png'),
  },
  {
    id: 'ac_repair',
    name: 'Sửa Tivi',
    iconName: 'tv',
    iconType: 'material',
    iconColor: colors.primary,
    pedestalColor: '#DBEAFE',
    imageSource: require('../../../assets/tv-repair.png'),
  },
  {
    id: 'ac_install',
    name: 'Điện tử\ngia dụng',
    iconName: 'tools',
    iconType: 'fa5',
    iconColor: '#059669',
    pedestalColor: '#D1FAE5',
    imageSource: require('../../../assets/home-appliance-repair.png'),
  },
  {
    id: 'washer_repair',
    name: 'Sửa máy\ngiặt',
    iconName: 'washing-machine',
    iconType: 'material',
    iconColor: '#7C3AED',
    pedestalColor: '#EDE9FE',
    imageSource: require('../../../assets/washing-machine.png'),
  },
  {
    id: 'fridge_repair',
    name: 'Sửa tủ\nlạnh',
    iconName: 'fridge-outline',
    iconType: 'material',
    iconColor: '#EA580C',
    pedestalColor: '#FFEDD5',
    imageSource: require('../../../assets/refrigerator.png'),
  },
];

export default function CustomerHomeScreen() {
  const { colors, spacing, fontSize, isDark } = useAppTheme();
  const styles = getStyles(colors, spacing, fontSize);
  const POPULAR_SERVICES = useMemo(() => getPopularServices(colors), [colors]);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const handleScroll = useScrollHideTabBar();
  const chatUnread = useChatUnreadCount();
  const [searchQuery, setSearchQuery] = useState('');

  const handleSearch = () => {
    navigation.navigate('CustomerServices', { query: searchQuery });
  };

  const { user, isAuthenticated } = useAuthStore();
  const [selectedAddress, setSelectedAddress] = useState('Đang tải địa chỉ...');
  const [addresses, setAddresses] = useState<AddressData[]>([]);
  const addressSheetRef = useRef<BottomSheetModal>(null);
  const snapPoints = useMemo(() => ['50%', '80%'], []);

  const openAddressSheet = useCallback(() => {
    addressSheetRef.current?.present();
  }, []);

  const closeAddressSheet = useCallback(() => {
    addressSheetRef.current?.dismiss();
  }, []);

  const fetchAddress = useCallback(async () => {
    try {
      if (!isAuthenticated) {
        setSelectedAddress('Vui lòng đăng nhập để xem địa chỉ');
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

  const handleSelectAddress = () => {
    openAddressSheet();
  };


  const renderServiceIcon = (item: ServiceItem) => {
    if (item.imageSource) {
      return (
        <Image 
          source={item.imageSource} 
          style={{ width: 88, height: 88 }} 
          resizeMode="contain" 
        />
      );
    }
    if (item.iconType === 'fa5') {
      return <FontAwesome5 name={item.iconName} size={26} color={item.iconColor} />;
    }
    if (item.iconType === 'material') {
      return <MaterialCommunityIcons name={item.iconName as any} size={28} color={item.iconColor} />;
    }
    return <Ionicons name={item.iconName as any} size={28} color={item.iconColor} />;
  };

  const handleServicePress = (_service: ServiceItem) => {
    navigation.navigate('CustomerServices');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      {/* 1. Header Address Selector & Messages */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.addressSelector} 
          onPress={handleSelectAddress}
          activeOpacity={0.7}
        >
          <Ionicons name="location" size={24} color={colors.error} />
          <View style={styles.addressTextContainer}>
            <Text style={styles.addressLabel}>Giao đến</Text>
            <Text style={styles.addressValue} numberOfLines={1}>{selectedAddress}</Text>
          </View>
          <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
        </TouchableOpacity>

        <View style={styles.headerActions}>
          {/* Messages */}
          <TouchableOpacity
            style={styles.headerIconBtn}
            onPress={() => navigation.navigate('ChatList')}
            activeOpacity={0.8}
          >
            <Ionicons name="chatbubble-ellipses-outline" size={22} />
            {chatUnread > 0 && (
              <View style={styles.notificationBadge}>
                <Text style={styles.notificationBadgeText}>
                  {chatUnread > 9 ? '9+' : chatUnread}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >

        {/* 2. Hero Search Banner (Xanh Dương Royal Gradient - Giống Hình 1 Vua Thợ) */}
        <LinearGradient
          colors={[colors.primaryDark, colors.primary, '#3B82F6']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroCard}
        >
          {/* Subtle Decorative Circles */}
          <View style={styles.decorCircle1} />
          <View style={styles.decorCircle2} />

          {/* Pill Search Input */}
          <View style={styles.searchBar}>
            <TextInput
              style={styles.searchInput}
              placeholder="Điện, nước, máy lạnh, thông cống..."
              placeholderTextColor="#94A3B8"
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmitEditing={handleSearch}
              returnKeyType="search"
            />
            <TouchableOpacity
              style={styles.searchBtn}
              onPress={handleSearch}
              activeOpacity={0.85}
            >
              <Ionicons name="search" size={18} color={colors.surface} />
            </TouchableOpacity>
          </View>
          
        </LinearGradient>

        {/* 5. Hero Feature Cards (3 Thẻ Lớn: Đặt thợ, AI Chẩn đoán, FixHome Mall) */}
        <View style={styles.featureCardsRow}>
          {/* Card 1: Đặt thợ */}
          <TouchableOpacity
            style={[styles.featureCard, { backgroundColor: '#E0F2FE' }]}
            activeOpacity={0.85}
            onPress={() => navigation.navigate('CustomerServices')}
          >
            <View style={styles.featureCardBadge}>
              <Text style={styles.featureCardBadgeText}>Thợ giỏi gần bạn</Text>
            </View>
            <Text style={styles.featureCardTitle}>Đặt thợ</Text>
            <Text style={styles.featureCardDesc}>Có mặt 15p</Text>
            <View style={styles.featureCardIconBox}>
              <FontAwesome5 name="user-cog" size={32} color="#0284C7" />
            </View>
          </TouchableOpacity>

          {/* Card 2: AI Chẩn đoán */}
          <TouchableOpacity
            style={[styles.featureCard, { backgroundColor: '#F3E8FF' }]}
            activeOpacity={0.85}
            onPress={() => navigation.navigate('CustomerAIDiagnosis')}
          >
            <View style={[styles.featureCardBadge, { backgroundColor: '#7C3AED' }]}>
              <Text style={styles.featureCardBadgeText}>AI 30s</Text>
            </View>
            <Text style={styles.featureCardTitle}>AI Soi lỗi</Text>
            <Text style={styles.featureCardDesc}>Báo giá ngay</Text>
            <View style={styles.featureCardIconBox}>
              <MaterialCommunityIcons name="robot-happy" size={36} color="#7C3AED" />
            </View>
          </TouchableOpacity>

        </View>

        {/* 6. Section "✨ Dịch vụ phổ biến" (Lưới Icon 3D Isometric chuẩn Hình 1) */}
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="sparkles" size={18} color={colors.primary} />
            <Text style={styles.sectionTitle}>Dịch vụ phổ biến</Text>
          </View>
          <TouchableOpacity
            onPress={() => navigation.navigate('CustomerServices')}
            activeOpacity={0.7}
          >
            <Text style={styles.viewAllText}>Xem tất cả &gt;</Text>
          </TouchableOpacity>
        </View>

        {/* Grid 2 hàng 4 cột */}
        <View style={styles.servicesGrid}>
          {POPULAR_SERVICES.map((service) => (
            <TouchableOpacity
              key={service.id}
              style={styles.serviceItem}
              onPress={() => handleServicePress(service)}
              activeOpacity={0.75}
            >
              {/* 3D Isometric Pedestal Effect */}
              <View style={styles.pedestalOuter}>
                <View
                  style={[
                    styles.pedestalPlate,
                    { backgroundColor: service.pedestalColor },
                  ]}
                >
                  {renderServiceIcon(service)}
                </View>
                <View style={styles.pedestalBaseShadow} />
                {service.isHot && (
                  <View style={styles.hotBadge}>
                    <Text style={styles.hotBadgeText}>HOT</Text>
                  </View>
                )}
              </View>

              <Text style={styles.serviceName}>{service.name}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Pagination Dots Indicator (Như trong Hình 1) */}
        <View style={styles.paginationIndicator}>
          <View style={styles.activeDotPill} />
          <View style={styles.inactiveDot} />
        </View>

        {/* 7. Promotional Campaign Banner (Chân trang phong cách Hình 1 & 2) */}
        <TouchableOpacity
          style={styles.promoBannerContainer}
          activeOpacity={0.9}
          onPress={() => navigation.navigate('CustomerServices')}
        >
          <LinearGradient
            colors={[colors.text, '#1E293B', colors.primary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.promoBanner}
          >
            <View style={styles.promoContent}>
              <View style={styles.promoTag}>
                <Text style={styles.promoTagText}>ĐẶT THỢ NGAY</Text>
              </View>
              <Text style={styles.promoTitle}>Khám phá dịch vụ FixHome</Text>
              <Text style={styles.promoSubtitle}>Xem dịch vụ và thông tin giá đang có trên hệ thống</Text>
              <View style={styles.promoButton}>
                <Text style={styles.promoButtonText}>Xem dịch vụ &gt;</Text>
              </View>
            </View>

            <View style={styles.promoIllustration}>
              <MaterialCommunityIcons name="tools" size={48} color="#60A5FA" />
            </View>
          </LinearGradient>
        </TouchableOpacity>

        {/* 8. Cam kết chất lượng FixHome */}
        <View style={styles.trustSection}>
          <View style={styles.trustItem}>
            <Ionicons name="shield-checkmark-outline" size={20} color={colors.primary} />
            <Text style={styles.trustTitle}>Thợ xác minh</Text>
            <Text style={styles.trustDesc}>Lý lịch 100% rõ ràng</Text>
          </View>
          <View style={styles.trustDivider} />
          <View style={styles.trustItem}>
            <Ionicons name="pricetag-outline" size={20} color={colors.primary} />
            <Text style={styles.trustTitle}>Giá minh bạch</Text>
            <Text style={styles.trustDesc}>Báo giá trước khi làm</Text>
          </View>
          <View style={styles.trustDivider} />
          <View style={styles.trustItem}>
            <Ionicons name="ribbon-outline" size={20} color={colors.primary} />
            <Text style={styles.trustTitle}>Theo dõi rõ ràng</Text>
            <Text style={styles.trustDesc}>Trạng thái theo từng đơn</Text>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Address Selection Modal */}
      <BottomSheetModal
        ref={addressSheetRef}
        snapPoints={snapPoints}
        backdropComponent={(props) => (
          <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.5} />
        )}
      >
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Chọn địa chỉ giao hàng</Text>
            <TouchableOpacity onPress={closeAddressSheet} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          
          {addresses.length === 0 ? (
            <View style={styles.emptyAddress}>
              <Text style={styles.emptyAddressText}>Bạn chưa có địa chỉ nào.</Text>
              <TouchableOpacity style={styles.addAddressBtn} onPress={() => {
                closeAddressSheet();
                (navigation as any).navigate('Profile');
              }}>
                <Text style={styles.addAddressBtnText}>Thêm địa chỉ mới</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={addresses}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.addressItem, selectedAddress === item.line1 && styles.addressItemActive]}
                  onPress={() => {
                    setSelectedAddress(item.line1);
                    closeAddressSheet();
                  }}
                >
                  <Ionicons 
                    name={selectedAddress === item.line1 ? "radio-button-on" : "radio-button-off"} 
                    size={22} 
                    color={selectedAddress === item.line1 ? colors.primary : "#94A3B8"} 
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
          )}
        </View>
      </BottomSheetModal>
    </SafeAreaView>
  );
}

const getStyles = (colors: any, spacing: any, fontSize: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingBottom: 20,
  },

  // Address Selector
  addressSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    marginRight: 16,
  },
  addressTextContainer: {
    flex: 1,
  },
  addressLabel: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  addressValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },

  // 1. Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarWrapper: {
    position: 'relative',
  },
  avatarImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EFF6FF',
  },
  onlineBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.success,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  userTextContainer: {
    marginLeft: 10,
  },
  greetingText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  userNameText: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  roleSwitchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  roleSwitchText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
  },
  headerIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  headerIconBtnAuth: {
    backgroundColor: '#DBEAFE',
  },
  notificationBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: colors.error,
    width: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.surface,
  },
  notificationBadgeText: {
    color: colors.surface,
    fontSize: 9,
    fontWeight: 'bold',
  },

  // 2. Hero Search Card
  heroCard: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 20,
    padding: 16,
    position: 'relative',
    overflow: 'hidden',
    shadowColor: colors.primaryDark,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  decorCircle1: {
    position: 'absolute',
    right: -20,
    top: -30,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  decorCircle2: {
    position: 'absolute',
    left: -40,
    bottom: -40,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 25,
    paddingLeft: 14,
    paddingRight: 6,
    paddingVertical: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: colors.text,
    paddingVertical: 4,
  },
  searchBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // 5. Feature Cards Row
  featureCardsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 10,
    marginTop: 4,
  },
  featureCard: {
    flex: 1,
    borderRadius: 16,
    padding: 10,
    position: 'relative',
    height: 120,
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.03)',
  },
  featureCardBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#0284C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  featureCardBadgeText: {
    color: colors.surface,
    fontSize: 9,
    fontWeight: 'bold',
  },
  featureCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    marginTop: 4,
  },
  featureCardDesc: {
    fontSize: 11,
    color: '#475569',
  },
  featureCardIconBox: {
    alignSelf: 'flex-end',
    marginTop: -8,
  },

  // 6. Popular Services Grid (Isometric Pedestal)
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginTop: 18,
    marginBottom: 10,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  viewAllText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },
  servicesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
  },
  serviceItem: {
    width: (width - 24) / 4,
    alignItems: 'center',
    marginVertical: 8,
    paddingHorizontal: 2,
  },
  pedestalOuter: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginBottom: 6,
  },
  pedestalPlate: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 3,
    zIndex: 2,
  },
  pedestalBaseShadow: {
    position: 'absolute',
    bottom: -4,
    width: 50,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#CBD5E1',
    opacity: 0.5,
    zIndex: 1,
  },
  hotBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: colors.error,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 6,
    zIndex: 3,
    borderWidth: 1,
    borderColor: colors.surface,
  },
  hotBadgeText: {
    color: colors.surface,
    fontSize: 8,
    fontWeight: 'bold',
  },
  serviceName: {
    fontSize: 11,
    textAlign: 'center',
    fontWeight: '600',
    color: '#1E293B',
    lineHeight: 15,
  },
  paginationIndicator: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    marginBottom: 14,
  },
  activeDotPill: {
    width: 24,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  inactiveDot: {
    width: 6,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#CBD5E1',
  },

  // 7. Promo Banner
  promoBannerContainer: {
    marginHorizontal: 16,
    marginTop: 4,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  promoBanner: {
    flexDirection: 'row',
    padding: 16,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  promoContent: {
    flex: 1,
  },
  promoTag: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 6,
  },
  promoTagText: {
    color: '#FDE047',
    fontSize: 10,
    fontWeight: 'bold',
  },
  promoTitle: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  promoSubtitle: {
    color: '#94A3B8',
    fontSize: 11,
    marginBottom: 10,
  },
  promoButton: {
    alignSelf: 'flex-start',
    backgroundColor: colors.warning,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  promoButtonText: {
    color: colors.text,
    fontSize: 11,
    fontWeight: '700',
  },
  promoIllustration: {
    marginLeft: 12,
    opacity: 0.9,
  },

  // 8. Trust Section
  trustSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  trustItem: {
    flex: 1,
    alignItems: 'center',
  },
  trustDivider: {
    width: 1,
    height: 30,
    backgroundColor: colors.border,
  },
  trustTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.text,
    marginTop: 4,
  },
  trustDesc: {
    fontSize: 9,
    color: colors.textSecondary,
    marginTop: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    paddingBottom: 30,
  },
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
  },
  addressItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  addressItemActive: {
    backgroundColor: '#EFF6FF',
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
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  addAddressBtnText: {
    color: colors.surface,
    fontWeight: '600',
  },
});


