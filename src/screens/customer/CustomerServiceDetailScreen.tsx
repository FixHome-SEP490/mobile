import BookingActionBar from '../../components/BookingActionBar';
import { useAppTheme } from '../../constants/theme';
import { CUSTOMER_UI_ARTWORK } from '../../constants/customer-artwork';
import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../types';
import * as Haptics from 'expo-haptics';
import { servicesApi } from '../../api/services.api';
import {
  createServiceDetailLoader,
  initialServiceDetailState,
  resolveServicePrice,
  serviceIdFromRoute,
} from './service-catalog';
import { getServicePresentation } from '../../constants/service-presentation';
import { useAuthStore } from '../../store/auth.store';
import BackButton from '../../components/BackButton';

type DetailRoute = RouteProp<RootStackParamList, 'CustomerServiceDetail'>;

export default function CustomerServiceDetailScreen() {
  const { colors, spacing, fontSize, isDark } = useAppTheme();
  const styles = getStyles(colors, spacing, fontSize);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<DetailRoute>();
  // Fail closed on stale navigator state or deep links without params: the
  // loader UUID rejection shows the error with no GET and no Booking CTA.
  const serviceId = serviceIdFromRoute(route);
  const [detailState, setDetailState] = useState(initialServiceDetailState);
  const { service, loading, error } = detailState;
  const presentation = getServicePresentation(service?.code);
  const loaderRef = useRef<ReturnType<typeof createServiceDetailLoader> | null>(null);
  if (loaderRef.current === null) {
    loaderRef.current = createServiceDetailLoader(servicesApi.getServiceById, setDetailState);
  }
  const loader = loaderRef.current;
  useFocusEffect(useCallback(() => {
    void loader.focus(serviceId);
    return () => loader.blur();
  }, [loader, serviceId]));

  const onRetry = () => { void loader.focus(serviceId); };
  const onBook = () => {
    if (!service) return;
    if (!useAuthStore.getState().isAuthenticated) { navigation.navigate('Auth'); return; }
    Haptics.selectionAsync();
    navigation.push('CustomerBookingCreate', {
      prefill: { serviceId: service.id, serviceName: service.name },
    });
  };

  const priceView = service ? resolveServicePrice(service) : null;
  const needsInspection = service?.pricingMode === 'inspection_required';
  const hasPublishedFixedPrice = service?.pricingMode === 'fixed_price' && priceView?.kind === 'fixed';
  const pricingBadge = priceView?.kind === 'range' && priceView.caption
    ? 'Giá công đã duyệt theo thiết bị'
    : needsInspection
    ? 'Kiểm tra trước, báo giá sau'
    : hasPublishedFixedPrice
      ? 'Giá theo bảng giá dịch vụ'
      : 'Chi phí cần xác minh';

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      {/* Top nav bar */}
      <View style={styles.header}>
        <BackButton />
        <View style={styles.headerTitleBlock}>
          <Text accessibilityRole="header" style={styles.headerTitle}>Chi tiết dịch vụ</Text>
        </View>
        <View style={{ width: 44 }} />
      </View>

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={colors.primaryStrong} />
          <Text style={styles.stateText} accessibilityLiveRegion="polite">
            Đang tải chi tiết dịch vụ...
          </Text>
        </View>
      ) : !service ? (
        <View style={styles.centerState}>
          <Ionicons name="alert-circle-outline" size={56} color={colors.muted} />
          <Text style={styles.stateText} accessibilityRole="alert">
            {error ?? 'Không tìm thấy dịch vụ hoặc dịch vụ đã ngừng cung cấp.'}
          </Text>
          <TouchableOpacity
            onPress={onRetry}
            accessibilityRole="button"
            accessibilityLabel="Thử tải lại chi tiết dịch vụ"
            style={styles.retryBtn}
          >
            <Text style={styles.retryText}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>

          {/* Codex-style detail art hero: blue-tinted background + artwork + pill badge */}
          <View style={styles.detailArtContainer}>
            <View style={styles.artInner}>
              {presentation ? (
                <Image
                  source={service?.code === 'DICH_VU_KHAC' ? CUSTOMER_UI_ARTWORK.otherDetail : presentation.imageSource}
                  style={styles.serviceImage}
                  resizeMode="contain"
                  accessible={false}
                />
              ) : (
                <Ionicons name="construct-outline" size={64} color={colors.textSecondary} />
              )}
            </View>
            {/* Source-backed pricing semantics: no inspection promise for fixed-price services. */}
            <View style={styles.artPill}>
              <Text style={styles.artPillText}>{pricingBadge}</Text>
            </View>
          </View>

          {/* Large title — Codex "Tìm nguyên nhân. / Rồi mới quyết định sửa." */}
          <Text style={styles.largeTitle} accessibilityRole="header">
            {service.name}
          </Text>

          {/* Price — server-authoritative */}
          {!!priceView && (
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Chi phí:</Text>
              <Text style={styles.priceValue}>{priceView.text}</Text>
            </View>
          )}
          {!!priceView?.caption && (
            <Text style={styles.priceLabel} testID="service-price-caption">{priceView.caption}</Text>
          )}

          {/* Category name */}
          {!!service.categoryName?.trim() && (
            <Text style={styles.categoryBadge}>{service.categoryName}</Text>
          )}

          {/* Description */}
          {!!service.description?.trim() && (
            <Text style={styles.descText}>{service.description}</Text>
          )}

          {/* Scope of work section */}
          {!!service.scopeDescription?.trim() && (
            <View style={styles.descSection}>
              <Text style={styles.sectionTitle}>Phạm vi công việc</Text>
              <Text style={styles.descText}>{service.scopeDescription}</Text>
            </View>
          )}

          <Text style={styles.descText}>
            {needsInspection
              ? 'Kỹ thuật viên khảo sát và báo giá. Chỉ thực hiện khi bạn đồng ý.'
              : 'Mọi thay đổi về phạm vi hoặc chi phí đều cần bạn đồng ý trước khi thực hiện.'}
          </Text>
        </ScrollView>
      )}

      {/* Sticky bottom CTA — Codex "Đặt dịch vụ này" */}
      {!!service && (
        <BookingActionBar>
          <TouchableOpacity
            style={styles.bookBtn}
            activeOpacity={0.85}
            onPress={onBook}
            accessibilityRole="button"
            accessibilityLabel={`Đặt lịch sửa chữa ${service.name}`}
          >
            <Text style={styles.bookBtnText}>Đặt lịch sửa chữa</Text>
            <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </BookingActionBar>
      )}
    </SafeAreaView>
  );
}

const getStyles = (colors: any, spacing: any, fontSize: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  // Header nav bar
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 8,
  },
  backBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 14,
    backgroundColor: colors.divider,

    flexShrink: 0,
  },
  headerTitleBlock: {
    flex: 1,
    paddingTop: 2,
    alignItems: 'center',
  },
  headerEyebrow: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.0,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    lineHeight: 26,
  },

  // States
  centerState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 12,
  },
  stateText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  retryBtn: {
    padding: 12,
    minHeight: 44,
    minWidth: 120,
    justifyContent: 'center',
    alignItems: 'center',
  },
  retryText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primaryStrong,
  },

  // Scrollable content
  content: { padding: 16, paddingBottom: 24 },

  // Codex detail art hero: blue-tinted bg + contained image + pill
  detailArtContainer: {
    position: 'relative',
    backgroundColor: '#EFF6FF',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 36,
    marginBottom: 16,
    overflow: 'hidden',
  },
  artInner: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 96,
  },
  serviceImage: {
    width: '100%',
    height: 96,
  },
  artPill: {
    position: 'absolute',
    bottom: 12,
    left: 14,
    backgroundColor: '#DBEAFE',
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  artPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1D4ED8',
    letterSpacing: 0.1,
  },

  // Large title — Codex "Tìm nguyên nhân.\nRồi mới quyết định sửa."
  largeTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    lineHeight: 30,
    marginBottom: 8,
    textAlign: 'left',
    width: '100%',
    flexShrink: 1,
  },

  // Price
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  priceLabel: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  priceValue: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.primaryStrong,
  },

  // Category badge
  categoryBadge: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 12,
  },

  // Description
  descText: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 22,
    marginBottom: 12,
  },

  // Scope section
  descSection: {
    backgroundColor: colors.surface,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },

  // Numbered steps — Codex "01 / 02" process
  stepsSection: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 0,
    marginBottom: 8,
  },
  lineItem: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  numberDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  numberDotText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.primaryStrong,
  },
  lineItemCopy: {
    flex: 1,
  },
  lineItemTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  lineItemDesc: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 18,
  },

  // Sticky CTA — Codex full-width "Đặt dịch vụ này"
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    // Shadow for elevation
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 8,
  },
  bookBtn: {
    minHeight: 52,
    borderRadius: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.primaryStrong,
    flexDirection: 'row',
  },
  bookBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
