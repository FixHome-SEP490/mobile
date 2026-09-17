import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../store';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../types';
import { ProfileHeader } from '../../components/profile/ProfileHeader';
import { usersApi } from '../../api/users.api';
import { ordersApi } from '../../api/orders.api';
import { authApi } from '../../api/auth.api';

export default function TechnicianProfileScreen() {
  const logout = useAuthStore((state) => state.logout);
  const { user } = useAuthStore();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [fullName, setFullName] = useState(user?.fullName || 'Kỹ thuật viên');
  const [phoneNumber, setPhoneNumber] = useState(user?.phoneNumber || '');
  const [earningsTotal, setEarningsTotal] = useState(0);

  useEffect(() => {
    let mounted = true;
    usersApi
      .getProfile()
      .then((profile) => {
        if (mounted && profile) {
          if (profile.fullName) setFullName(profile.fullName);
          if (profile.phoneNumber) setPhoneNumber(profile.phoneNumber);
        }
      })
      .catch(() => {});

    ordersApi
      .getMyOrders()
      .then((orders) => {
        if (!mounted || !Array.isArray(orders)) return;
        const completed = orders.filter((o) => String(o.status).toUpperCase() === 'COMPLETED');
        const earn = completed.reduce((sum, o) => sum + (o.laborTotal || o.grandTotal || 0), 0);
        setEarningsTotal(earn);
      })
      .catch(() => {});

    return () => {
      mounted = false;
    };
  }, []);

  const handleLogout = () => {
    Alert.alert('Đăng xuất', 'Bạn có chắc chắn muốn đăng xuất tài khoản Thợ?', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Đăng xuất',
        style: 'destructive',
        onPress: async () => {
          await authApi.logout();
          logout();
          setTimeout(() => {
            navigation.navigate('Auth');
          }, 100);
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <ProfileHeader
          name={fullName}
          phone={phoneNumber || user?.email || 'Kỹ thuật viên FixHome'}
          avatarText={fullName.charAt(0)}
        />

        <View style={styles.innerContent}>
          {/* Số dư doanh thu */}
          <View style={styles.balanceHeader}>
            <Ionicons name="wallet" size={20} color="#2563EB" />
            <Text style={styles.balanceTitle}>Thu nhập & Doanh thu</Text>
          </View>

          <View style={styles.balanceRow}>
            <View style={styles.balanceCard}>
              <View style={styles.balanceTop}>
                <Ionicons name="cash-outline" size={16} color="#2563EB" />
                <Text style={styles.balanceLabel}>Doanh thu tích lũy</Text>
              </View>
              <Text style={styles.balanceValue}>{earningsTotal.toLocaleString('vi-VN')}đ</Text>
            </View>

            <View style={styles.balanceCard}>
              <View style={styles.balanceTop}>
                <Ionicons name="shield-checkmark-outline" size={16} color="#059669" />
                <Text style={styles.balanceLabel}>Trạng thái</Text>
              </View>
              <Text style={[styles.balanceValue, { color: '#059669', fontSize: 14 }]}>Hoạt động tốt</Text>
            </View>
          </View>

          {/* CÀI ĐẶT */}
          <Text style={styles.sectionHeading}>CÀI ĐẶT</Text>
          <View style={styles.listContainer}>
            <TouchableOpacity
              style={styles.listItem}
              onPress={() => navigation.navigate('TechnicianKyc')}
            >
              <Ionicons name="shield-checkmark-outline" size={20} color="#64748B" />
              <Text style={styles.listText}>Xác minh danh tính (KYC)</Text>
              <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
            </TouchableOpacity>
            <View style={styles.divider} />
            <TouchableOpacity
              style={styles.listItem}
              onPress={() => Alert.alert('Thông báo', 'Hệ thống thông báo nhận đơn đang bật.')}
            >
              <Ionicons name="notifications-outline" size={20} color="#64748B" />
              <Text style={styles.listText}>Thông báo nhận việc</Text>
              <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
            </TouchableOpacity>
            <View style={styles.divider} />
            <TouchableOpacity
              style={styles.listItem}
              onPress={() => Alert.alert('Hỗ trợ', 'Tổng đài KTV FixHome: 1900 6868')}
            >
              <Ionicons name="headset-outline" size={20} color="#64748B" />
              <Text style={styles.listText}>Hỗ trợ kỹ thuật 24/7</Text>
              <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          {/* CHÍNH SÁCH */}
          <Text style={styles.sectionHeading}>QUY TRÌNH & NỘI QUY</Text>
          <View style={styles.listContainer}>
            <TouchableOpacity
              style={styles.listItem}
              onPress={() =>
                Alert.alert(
                  'Quy chuẩn dịch vụ',
                  '1. Đúng giờ theo lịch hẹn\n2. Mặc đồng phục, xuất trình thẻ\n3. Báo giá trước khi làm\n4. Không thu thêm phụ phí ngoài hệ thống',
                )
              }
            >
              <Ionicons name="book-outline" size={20} color="#64748B" />
              <Text style={styles.listText}>Quy chuẩn dịch vụ 5 sao</Text>
              <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
            </TouchableOpacity>
            <View style={styles.divider} />
            <TouchableOpacity
              style={styles.listItem}
              onPress={() =>
                Alert.alert(
                  'Chính sách hoa hồng',
                  'Thợ nhận 85-90% giá trị công thợ trên mỗi đơn hoàn tất thành công.',
                )
              }
            >
              <Ionicons name="document-text-outline" size={20} color="#64748B" />
              <Text style={styles.listText}>Chính sách thu nhập & Phí nền tảng</Text>
              <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
            <Text style={styles.logoutText}>Đăng xuất</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollContent: {
    paddingBottom: 40,
  },
  innerContent: {
    paddingHorizontal: 16,
  },
  balanceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    marginBottom: 12,
  },
  balanceTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  balanceRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  balanceCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  balanceTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  balanceLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  balanceValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  sectionHeading: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 8,
  },
  listContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  listText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginLeft: 48,
  },
  logoutBtn: {
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 12,
  },
  logoutText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#EF4444',
  },
});
