import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, ScrollView, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../types';

export default function CustomerTechFoundScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Kỹ thuật viên đã nhận</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Đã nhận việc</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <View style={styles.techInfo}>
            <View style={styles.avatar}>
              <Ionicons name="person" size={24} color="#2563EB" />
            </View>
            <View style={styles.techDetails}>
              <Text style={styles.techName}>Nguyễn Đức Anh</Text>
              <View style={styles.starsRow}>
                <Ionicons name="star" size={14} color="#EAB308" />
                <Text style={styles.starsText}>4.9 <Text style={styles.mutedText}>· 326 đơn</Text></Text>
              </View>
              <Text style={styles.mutedText}>Đã xác minh · Điều hòa · 3 năm kinh nghiệm</Text>
            </View>
            <TouchableOpacity style={styles.iconBtn}>
              <Ionicons name="call" size={20} color="#0F172A" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.mapPlaceholder}>
          <Ionicons name="map-outline" size={48} color="#94A3B8" />
          <Text style={styles.mapText}>Sơ đồ minh họa</Text>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>12 phút</Text>
            <Text style={styles.statLabel}>Dự kiến đến sau</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>2.4 km</Text>
            <Text style={styles.statLabel}>Khoảng cách</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Đơn #FH-240921</Text>
        <View style={styles.orderCard}>
          <Text style={styles.orderText}>Vệ sinh điều hòa · 1 máy</Text>
          <Text style={styles.orderText}>28 Duy Tân, Cầu Giấy</Text>
          <Text style={styles.orderText}>09:00–11:00 · Hôm nay</Text>
        </View>

        <View style={styles.trustRow}>
          <Ionicons name="shield-checkmark" size={20} color="#16A34A" />
          <Text style={styles.trustText}>Danh tính và kỹ năng của kỹ thuật viên đã được FixHome xác minh.</Text>
        </View>

        <TouchableOpacity style={styles.primaryBtn} onPress={() => navigation.navigate('CustomerTracking')}>
          <Text style={styles.primaryBtnText}>Theo dõi hành trình</Text>
        </TouchableOpacity>
      </ScrollView>
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
  content: { padding: 16 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#F1F5F9' },
  techInfo: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#DBEAFE', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  techDetails: { flex: 1 },
  techName: { fontSize: 16, fontWeight: '700', color: '#0F172A', marginBottom: 4 },
  starsRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  starsText: { fontSize: 12, fontWeight: '600', color: '#0F172A', marginLeft: 4 },
  mutedText: { fontSize: 12, color: '#64748B' },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center', marginLeft: 8 },
  mapPlaceholder: { height: 180, backgroundColor: '#E2E8F0', borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  mapText: { marginTop: 8, color: '#64748B', fontSize: 14, fontWeight: '500' },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  statBox: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#F1F5F9' },
  statValue: { fontSize: 20, fontWeight: '700', color: '#0F172A', marginBottom: 4 },
  statLabel: { fontSize: 12, color: '#64748B' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A', marginBottom: 12 },
  orderCard: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#F1F5F9' },
  orderText: { fontSize: 14, color: '#475569', lineHeight: 22 },
  trustRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 24, paddingHorizontal: 4 },
  trustText: { flex: 1, fontSize: 12, color: '#64748B', lineHeight: 18 },
  primaryBtn: { backgroundColor: '#2563EB', paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  primaryBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' }
});
