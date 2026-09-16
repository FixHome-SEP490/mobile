// src/screens/customer/CustomerHomeScreen.tsx
import React, { useState, useEffect, useCallback } from 'react';
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
  Alert,
  RefreshControl,
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
import { useScrollHideTabBar } from '../../hooks/useScrollHideTabBar';
import { UserRole } from '../../types';
import { SafeAreaView } from 'react-native-safe-area-context';
import { addressesApi } from '../../api/addresses';

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

const POPULAR_SERVICES: ServiceItem[] = [
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
    iconColor: '#2563EB',
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
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user, isAuthenticated } = useAuthStore();
  const handleScroll = useScrollHideTabBar();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAddress, setSelectedAddress] = useState('Đang tải địa chỉ...');

  const [refreshing, setRefreshing] = useState(false);

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
      
      const res = await addressesApi.getAddresses();
      if (res.data && res.data.length > 0) {
        const defaultAddress = res.data.find(a => a.isDefault) || res.data[0];
        setSelectedAddress(defaultAddress.line1);
      } else {
        setSelectedAddress('Chưa có địa chỉ nào');
      }
    } catch (error) {
      console.error('Failed to load addresses:', error);
      setSelectedAddress('Không thể tải địa chỉ');
    }
  }, [isAuthenticated, user]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchAddress();
  }, [fetchAddress]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAddress();
    setRefreshing(false);
  };

  const handleSearch = () => {
    navigation.navigate('CustomerServices', { query: searchQuery });
  };

  const handleSelectAddress = () => {
    Alert.alert(
      'Chọn địa chỉ',
      'Để thay đổi địa chỉ mặc định, vui lòng vào Quản lý địa chỉ trong mục Tài khoản.',
      [
        { text: 'Đóng', style: 'cancel' }
      ]
    );
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

  const handleServicePress = (service: ServiceItem) => {
    navigation.navigate('CustomerServiceDetail');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* 1. Header Address Selector */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.addressSelector} 
          onPress={handleSelectAddress}
          activeOpacity={0.7}
        >
          <Ionicons name="location" size={24} color="#EF4444" />
          <View style={styles.addressTextContainer}>
            <Text style={styles.addressLabel}>Giao đến</Text>
            <Text style={styles.addressValue} numberOfLines={1}>{selectedAddress}</Text>
          </View>
          <Ionicons name="chevron-down" size={18} color="#64748B" />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2563EB']} />
        }
      >
        {/* 2. Hero Search Banner */}
        <LinearGradient
          colors={['#1D4ED8', '#2563EB', '#3B82F6']}
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
              <Ionicons name="search" size={18} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </LinearGradient>

        {/* 5. Hero Feature Cards (3 Thẻ Lớn: Đặt thợ, AI Chẩn đoán, FixHome Mall) */}
        <View style={styles.featureCardsRow}>
          {/* Card 1: Đặt thợ */}
          <TouchableOpacity
            style={[styles.featureCard, { backgroundColor: '#E0F2FE' }]}
            activeOpacity={0.85}
            onPress={() => Alert.alert('Đặt thợ', 'Mở danh sách thợ gần bạn nhất!')}
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
            onPress={() => Alert.alert('AI Chẩn đoán FixHome', 'Chụp ảnh thiết bị hư hỏng để AI phân tích nguyên nhân và báo giá tức thì!')}
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
            <Ionicons name="sparkles" size={18} color="#2563EB" />
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
          onPress={() => Alert.alert('Ưu đãi FixHome', 'Nhập mã FIXHOME30 khi đặt lịch để giảm 30%!')}
        >
          <LinearGradient
            colors={['#09f089', '#6dd0e9', '#2563EB']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.promoBanner}
          >
            <View style={styles.promoContent}>
              <View style={styles.promoTag}>
                <Text style={styles.promoTagText}>ĐẶT THỢ NGAY</Text>
              </View>
              <Text style={styles.promoTitle}>Giảm 30% đơn đầu tiên</Text>
              <Text style={styles.promoSubtitle}>Bảo hành sửa chữa 30 ngày an tâm</Text>
              <View style={styles.promoButton}>
                <Text style={styles.promoButtonText}>Tham gia ngay &gt;</Text>
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
            <Ionicons name="shield-checkmark-outline" size={20} color="#2563EB" />
            <Text style={styles.trustTitle}>Thợ xác minh</Text>
            <Text style={styles.trustDesc}>Lý lịch 100% rõ ràng</Text>
          </View>
          <View style={styles.trustDivider} />
          <View style={styles.trustItem}>
            <Ionicons name="pricetag-outline" size={20} color="#2563EB" />
            <Text style={styles.trustTitle}>Giá minh bạch</Text>
            <Text style={styles.trustDesc}>Báo giá trước khi làm</Text>
          </View>
          <View style={styles.trustDivider} />
          <View style={styles.trustItem}>
            <Ionicons name="ribbon-outline" size={20} color="#2563EB" />
            <Text style={styles.trustTitle}>Bảo hành 30 ngày</Text>
            <Text style={styles.trustDesc}>Hỗ trợ tận tâm</Text>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
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
    color: '#64748B',
  },
  addressValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },

  // 1. Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
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
    backgroundColor: '#22C55E',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  userTextContainer: {
    marginLeft: 10,
  },
  greetingText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  userNameText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
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
    color: '#2563EB',
  },
  headerIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F1F5F9',
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
    backgroundColor: '#EF4444',
    width: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  notificationBadgeText: {
    color: '#FFFFFF',
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
    shadowColor: '#1D4ED8',
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
  sloganRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  heroSlogan: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
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
    color: '#0F172A',
    paddingVertical: 4,
  },
  searchBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#2563EB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.2)',
  },
  heroStatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  heroStatText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '500',
  },

  // 3. Status Notice Pill
  statusPillWrapper: {
    paddingHorizontal: 16,
    marginTop: 10,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  statusPillIconContainer: {
    marginRight: 8,
  },
  statusPillText: {
    flex: 1,
    fontSize: 12,
    color: '#334155',
  },

  // 4. Quick Category Chips
  chipsScroll: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  chipItem: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#334155',
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
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: 'bold',
  },
  featureCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
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
    color: '#0F172A',
  },
  viewAllText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2563EB',
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
    borderColor: '#FFFFFF',
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
    backgroundColor: '#EF4444',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 6,
    zIndex: 3,
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  hotBadgeText: {
    color: '#FFFFFF',
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
    backgroundColor: '#2563EB',
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
    color: '#FFFFFF',
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
    backgroundColor: '#F59E0B',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  promoButtonText: {
    color: '#0F172A',
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
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  trustItem: {
    flex: 1,
    alignItems: 'center',
  },
  trustDivider: {
    width: 1,
    height: 30,
    backgroundColor: '#E2E8F0',
  },
  trustTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 4,
  },
  trustDesc: {
    fontSize: 9,
    color: '#64748B',
    marginTop: 2,
  },

});
