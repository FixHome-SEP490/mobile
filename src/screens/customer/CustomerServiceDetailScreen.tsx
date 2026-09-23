import { useAppTheme } from '../../constants/theme';
import React, { useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../types';
import { LinearGradient } from 'expo-linear-gradient';
import { servicesApi } from '../../api/services.api';
import {
  createServiceDetailLoader,
  initialServiceDetailState,
  resolveServicePrice,
  serviceIdFromRoute,
} from './service-catalog';

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
    navigation.navigate('CustomerBookingCreate', {
      prefill: { serviceId: service.id, serviceName: service.name },
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Chi tiết dịch vụ</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.stateText}>Đang tải chi tiết dịch vụ...</Text>
        </View>
      ) : !service ? (
        <View style={styles.centerState}>
          <Ionicons name="alert-circle-outline" size={56} color="#CBD5E1" />
          {!!error && <Text style={styles.stateText}>{error}</Text>}
          <TouchableOpacity onPress={onRetry} accessibilityRole="button" style={styles.retryBtn}>
            <Text style={styles.retryText}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.heroSection}>
            <View style={styles.iconCircle}>
              <Ionicons name="construct-outline" size={40} color={colors.primary} />
            </View>
            <Text style={styles.serviceTitle}>{service.name}</Text>
            <Text style={styles.servicePrice}>{resolveServicePrice(service).text}</Text>
          </View>

          <View style={styles.descSection}>
            <Text style={styles.sectionTitle}>Mô tả dịch vụ</Text>
            <Text style={styles.descText}>{service.description?.trim() ? service.description : 'Chưa có mô tả chi tiết.'}</Text>
          </View>

          {!!service.scopeDescription?.trim() && (
            <View style={styles.descSection}>
              <Text style={styles.sectionTitle}>Phạm vi công việc</Text>
              <Text style={styles.descText}>{service.scopeDescription}</Text>
            </View>
          )}
        </ScrollView>
      )}

      {!!service && (
        <View style={styles.bottomBar}>
          <TouchableOpacity style={styles.bookBtn} activeOpacity={0.8} onPress={onBook}>
            <LinearGradient
              colors={[colors.primaryDark, colors.primary]}
              style={styles.bookBtnGradient}
            >
              <Text style={styles.bookBtnText}>Đặt thợ ngay</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const getStyles = (colors: any, spacing: any, fontSize: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  content: { padding: 16, paddingBottom: 100 },
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
  },
  retryText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
  },
  heroSection: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: 24,
    borderRadius: 20,
    marginBottom: 16,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  serviceTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  servicePrice: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.primary,
  },
  descSection: {
    backgroundColor: colors.surface,
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
  },
  descText: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 22,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  bookBtn: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  bookBtnGradient: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  bookBtnText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: '700',
  }
});
