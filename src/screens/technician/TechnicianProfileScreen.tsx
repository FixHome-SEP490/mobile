import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Switch, StatusBar, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../types';
import { UserRole } from '../../types';
import { useAuthStore } from '../../store';
import { useScrollHideTabBar } from '../../hooks/useScrollHideTabBar';
import { LinearGradient } from 'expo-linear-gradient';
import { authApi } from '../../api/auth';
import { storageService } from '../../services/storage.service';
import { usersApi } from '../../api/users';

export default function TechnicianProfileScreen() {
  const { user, logout, setAuth } = useAuthStore();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const handleScroll = useScrollHideTabBar();

  const [name, setName] = useState(user?.fullName || 'Thợ Việt');
  const [phone, setPhone] = useState(user?.phoneNumber || '');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user?.avatarUrl || null);
  
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    const fetchProfileData = async () => {
      try {
        const res = await usersApi.getProfile();
        if (res.data) {
          setName(res.data.fullName || 'Thợ Việt');
          setPhone(res.data.phoneNumber || '');
          setAvatarUrl(res.data.avatarUrl || null);
        }
      } catch (error) {
        console.error('Fetch tech profile error:', error);
      }
    };
    fetchProfileData();
  }, []);

  const handleLogout = () => {
    Alert.alert('Đăng xuất', 'Bạn có chắc chắn muốn đăng xuất?', [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Đăng xuất', style: 'destructive', onPress: async () => {
        try {
          const refreshToken = await storageService.getRefreshToken();
          if (refreshToken) {
            await authApi.logout({ refreshToken });
          }
        } catch (error) {
          console.error('Logout error:', error);
        } finally {
          await storageService.removeToken();
          await storageService.removeRefreshToken();
          logout();
          setTimeout(() => {
            navigation.reset({
              index: 0,
              routes: [{ name: 'Auth' }],
            });
          }, 100);
        }
      }},
    ]);
  };

  const handleSwitchToCustomer = () => {
    setAuth('mock-customer-token', {
      id: 'cust-01',
      email: 'lacvy@fixhome.vn',
      fullName: 'Lạc Vỹ',
      role: UserRole.CUSTOMER,
    });
    navigation.navigate('CustomerMain');
  };

  return (
    <SafeAreaView style={[styles.container, isDarkMode && styles.containerDark]} edges={['top']}>
      <StatusBar barStyle={isDarkMode ? "light-content" : "dark-content"} backgroundColor={isDarkMode ? "#0F172A" : "#F8FAFC"} />
      <ScrollView 
        contentContainerStyle={{ paddingBottom: 40, paddingTop: 60 }}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.mainWrapperCard, isDarkMode && styles.cardDark]}>
          {/* Avatar Section */}
          <View style={styles.avatarSection}>
            <View style={[styles.avatarBorder, isDarkMode ? styles.avatarBorderDark : styles.avatarBorderLight]}>
              <View style={styles.avatar}>
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
                ) : (
                  <Text style={styles.avatarText}>{name.charAt(0)}</Text>
                )}
              </View>
            </View>
            <Text style={[styles.name, isDarkMode && styles.textDark]}>{name}</Text>
            <Text style={styles.phone}>{phone}</Text>
          </View>

          <Text style={[styles.sectionTitle, isDarkMode && styles.textDark]}>Ví & Doanh thu</Text>
          <View style={styles.overviewRow}>
            <LinearGradient colors={['#E0F2FE', '#F0F9FF']} style={styles.overviewCard}>
              <View style={styles.cardTopRow}>
                <View style={[styles.iconCircle, { backgroundColor: '#BAE6FD' }]}>
                  <Ionicons name="folder-open" size={16} color="#0284C7" />
                </View>
                <Text style={styles.cardLabel}>Doanh thu</Text>
              </View>
              <Text style={styles.cardValue}>0 <Text style={styles.cardUnit}>đ</Text></Text>
            </LinearGradient>

            <LinearGradient colors={['#FEF3C7', '#FFFBEB']} style={styles.overviewCard}>
              <View style={styles.cardTopRow}>
                <View style={[styles.iconCircle, { backgroundColor: '#FDE68A' }]}>
                  <Ionicons name="cash" size={16} color="#D97706" />
                </View>
                <Text style={styles.cardLabel}>Nền tảng</Text>
              </View>
              <Text style={styles.cardValue}>0 <Text style={styles.cardUnit}>đ</Text></Text>
            </LinearGradient>
          </View>

          <Text style={[styles.sectionTitle, isDarkMode && styles.textDark]}>Công cụ làm việc</Text>
          <View style={[styles.menuContainer, isDarkMode && styles.cardDark]}>
            <TouchableOpacity style={styles.menuItem} onPress={() => Alert.alert('Tính năng đang phát triển')}>
              <Ionicons name="book" size={22} color="#64748B" style={styles.menuIcon} />
              <View style={styles.menuContent}>
                <Text style={[styles.menuTitle, isDarkMode && styles.textDark]}>Nghiệp vụ</Text>
                <Text style={styles.menuDesc}>Quy trình và hướng dẫn chuẩn</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
            </TouchableOpacity>
            <View style={styles.divider} />
            <TouchableOpacity style={styles.menuItem} onPress={handleSwitchToCustomer}>
              <Ionicons name="people-outline" size={22} color="#64748B" style={styles.menuIcon} />
              <View style={styles.menuContent}>
                <Text style={[styles.menuTitle, isDarkMode && styles.textDark]}>Chuyển sang Khách hàng</Text>
                <Text style={styles.menuDesc}>Chế độ đặt dịch vụ</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          <Text style={[styles.sectionTitle, isDarkMode && styles.textDark]}>Cài đặt & Hỗ trợ</Text>
          <View style={[styles.menuContainer, isDarkMode && styles.cardDark]}>
            <TouchableOpacity style={styles.menuItem}>
              <Ionicons name="settings-outline" size={22} color="#64748B" style={styles.menuIcon} />
              <View style={styles.menuContent}>
                <Text style={[styles.menuTitle, isDarkMode && styles.textDark]}>Cài đặt hệ thống</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
            </TouchableOpacity>
            <View style={styles.divider} />
            
            <View style={styles.menuItem}>
              <Ionicons name="moon-outline" size={22} color="#64748B" style={styles.menuIcon} />
              <View style={styles.menuContent}>
                <Text style={[styles.menuTitle, isDarkMode && styles.textDark]}>Giao diện tối</Text>
              </View>
              <Switch value={isDarkMode} onValueChange={setIsDarkMode} />
            </View>
            <View style={styles.divider} />

            <TouchableOpacity style={styles.menuItem}>
              <Ionicons name="headset-outline" size={22} color="#64748B" style={styles.menuIcon} />
              <View style={styles.menuContent}>
                <Text style={[styles.menuTitle, isDarkMode && styles.textDark]}>Trung tâm trợ giúp</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          <View style={styles.footer}>
            <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
              <Text style={styles.logoutText}>Đăng xuất</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  containerDark: { backgroundColor: '#0F172A' },
  cardDark: { backgroundColor: '#1E293B' },
  textDark: { color: '#F8FAFC' },
  
  mainWrapperCard: {
    backgroundColor: '#FFFFFF',
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 40,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    marginTop: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 5,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 24,
    marginTop: -66,
  },
  avatarBorder: {
    width: 100, height: 100, borderRadius: 50,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 12, borderWidth: 4,
  },
  avatarBorderLight: { borderColor: '#FFFFFF', backgroundColor: '#FFFFFF' },
  avatarBorderDark: { borderColor: '#1E293B', backgroundColor: '#1E293B' },
  avatar: {
    width: '100%', height: '100%', borderRadius: 50,
    backgroundColor: '#DBEAFE', justifyContent: 'center', alignItems: 'center', overflow: 'hidden'
  },
  avatarImage: { width: '100%', height: '100%' },
  avatarText: { fontSize: 36, fontWeight: '700', color: '#2563EB' },
  name: { fontSize: 20, fontWeight: '700', color: '#0F172A', marginBottom: 4 },
  phone: { fontSize: 14, color: '#64748B', fontWeight: '500' },
  
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A', marginBottom: 12 },
  menuContainer: { 
    backgroundColor: '#FFFFFF', borderRadius: 16, overflow: 'hidden', 
    marginBottom: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, 
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 
  },
  menuItem: { flexDirection: 'row', padding: 16, alignItems: 'center' },
  menuIcon: { marginRight: 16 },
  menuContent: { flex: 1 },
  menuTitle: { fontSize: 15, fontWeight: '600', color: '#0F172A' },
  menuDesc: { fontSize: 13, color: '#64748B', marginTop: 2 },
  divider: { height: 1, backgroundColor: '#F1F5F9', marginLeft: 54 },
  
  overviewRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  overviewCard: { flex: 1, borderRadius: 16, padding: 16 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  iconCircle: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: 8 },
  cardLabel: { fontSize: 14, color: '#475569', fontWeight: '500' },
  cardValue: { fontSize: 22, fontWeight: '800', color: '#0F172A' },
  cardUnit: { fontSize: 14, fontWeight: '600', color: '#64748B' },
  
  footer: { alignItems: 'center', marginTop: 12, marginBottom: 32 },
  logoutBtn: { paddingVertical: 12, paddingHorizontal: 24 },
  logoutText: { fontSize: 14, fontWeight: '600', color: '#EF4444' },
});
