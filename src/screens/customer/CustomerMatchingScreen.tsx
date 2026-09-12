import React, { useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, StatusBar, Animated, Easing } from 'react-native';
import { Ionicons,MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../types';

export default function CustomerMatchingScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  // Simple pulse animation for radar
  const pulseAnim = new Animated.Value(1);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.2,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Mock finding technician after 3 seconds
    const timer = setTimeout(() => {
      // In a real app, it would navigate to a screen showing the found technician.
      // For now, navigate to TechFound screen.
      navigation.navigate('CustomerTechFound');
    }, 4000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Đang tìm kỹ thuật viên</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Đang tìm</Text>
        </View>
      </View>

      <View style={styles.content}>
        <View style={styles.mapPlaceholder}>
          <Ionicons name="map-outline" size={48} color="#94A3B8" />
          <Text style={styles.mapText}>Sơ đồ minh họa</Text>
        </View>

        <View style={styles.matchStage}>
          <Animated.View style={[styles.radarContainer, { transform: [{ scale: pulseAnim }] }]}>
            <View style={styles.radarInner}>
              <MaterialIcons name="radar" size={32} color="#2563EB" />
            </View>
          </Animated.View>
          <Text style={styles.matchTitle}>Đang tìm thợ phù hợp gần bạn</Text>
          <Text style={styles.matchDesc}>FixHome ưu tiên kỹ thuật viên đã xác minh, đúng chuyên môn và có thể đến trong khung giờ bạn chọn.</Text>
          
          <View style={styles.pointsRow}>
            <View style={styles.pointItem}>
              <Ionicons name="checkmark-circle" size={16} color="#16A34A" />
              <Text style={styles.pointText}>Đã xác minh</Text>
            </View>
            <View style={styles.pointItem}>
              <Ionicons name="build" size={16} color="#16A34A" />
              <Text style={styles.pointText}>Đúng chuyên môn</Text>
            </View>
            <View style={styles.pointItem}>
              <Ionicons name="location" size={16} color="#16A34A" />
              <Text style={styles.pointText}>Ở gần bạn</Text>
            </View>
          </View>
        </View>

        <View style={styles.noticeBox}>
          <Text style={styles.noticeText}>
            <Text style={{ fontWeight: '700' }}>Nếu chưa có thợ nhận ngay</Text>, FixHome sẽ tiếp tục tìm ứng viên khác và thông báo cho bạn. Bạn không cần thao tác lại.
          </Text>
        </View>

        <TouchableOpacity style={styles.primaryBtn} onPress={() => navigation.navigate('CustomerMain')}>
          <Text style={styles.primaryBtnText}>Hủy tìm kiếm</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9'
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#0F172A', flex: 1 },
  badge: { backgroundColor: '#DCFCE7', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  badgeText: { color: '#16A34A', fontSize: 10, fontWeight: '700' },
  content: { padding: 16, flex: 1 },
  mapPlaceholder: {
    height: 180,
    backgroundColor: '#E2E8F0',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  mapText: {
    marginTop: 8,
    color: '#64748B',
    fontSize: 14,
    fontWeight: '500',
  },
  matchStage: {
    alignItems: 'center',
    marginBottom: 24,
  },
  radarContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#DBEAFE',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  radarInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  matchTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 8,
  },
  matchDesc: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  pointsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  pointItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pointText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  noticeBox: {
    backgroundColor: '#FEF9C3',
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
  },
  noticeText: {
    color: '#854D0E',
    fontSize: 13,
    lineHeight: 20,
  },
  primaryBtn: {
    backgroundColor: '#EF4444',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 'auto',
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  }
});
