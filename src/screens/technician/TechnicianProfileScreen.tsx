import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Alert,
  Image,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuthStore } from '../../store';
import type { RootStackParamList } from '../../types';
import { usersApi } from '../../api/users.api';
import { ordersApi } from '../../api/orders.api';
import { authApi } from '../../api/auth.api';

export default function TechnicianProfileScreen() {
  const logout = useAuthStore((state) => state.logout);
  const { user } = useAuthStore();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [fullName, setFullName] = useState(user?.fullName || 'Kỹ thuật viên');
  const [phoneNumber, setPhoneNumber] = useState(user?.phoneNumber || '');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user?.avatarUrl || null);
  const [earningsTotal, setEarningsTotal] = useState(0);

  const [isAvatarModalVisible, setAvatarModalVisible] = useState(false);

  const handlePickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled) {
      const uri = result.assets[0].uri;
      setAvatarUrl(uri);
      try {
        await usersApi.updateProfile({ avatarUrl: uri });
      } catch (e) {
        console.error('Failed to update avatar', e);
      }
    }
  };

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
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40, paddingTop: 60 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.mainWrapperCard}>
          {/* Avatar Section */}
          <View style={styles.avatarSection}>
            <View style={styles.avatarBorder}>
              <TouchableOpacity onPress={() => avatarUrl && setAvatarModalVisible(true)} activeOpacity={0.8} style={styles.avatar}>
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
                ) : (
                  <Text style={styles.avatarText}>{fullName.charAt(0)}</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={styles.cameraIconBadge} onPress={handlePickImage} activeOpacity={0.8}>
                 <Ionicons name="camera" size={16} color="#FFF" />
              </TouchableOpacity>
            </View>
            <Text style={styles.name}>{fullName}</Text>
            <Text style={styles.phone}>{phoneNumber || user?.email || 'Kỹ thuật viên FixHome'}</Text>
          </View>

          {/* Thu nhập & Trạng thái */}
          <Text style={styles.sectionTitle}>Thu nhập & Trạng thái</Text>
          <View style={styles.overviewRow}>
            <LinearGradient colors={['#E0F2FE', '#F0F9FF']} style={styles.overviewCard}>
              <View style={styles.cardTopRow}>
                <View style={[styles.iconCircle, { backgroundColor: '#BAE6FD' }]}>
                  <Ionicons name="cash" size={16} color="#0284C7" />
                </View>
                <Text style={styles.cardLabel}>Doanh thu</Text>
              </View>
              <Text style={styles.cardValue}>
                {earningsTotal.toLocaleString('vi-VN')} <Text style={styles.cardUnit}>đ</Text>
              </Text>
            </LinearGradient>

            <LinearGradient colors={['#DCFCE7', '#F0FDF4']} style={styles.overviewCard}>
              <View style={styles.cardTopRow}>
                <View style={[styles.iconCircle, { backgroundColor: '#BBF7D0' }]}>
                  <Ionicons name="shield-checkmark" size={16} color="#16A34A" />
                </View>
                <Text style={styles.cardLabel}>Trạng thái</Text>
              </View>
              <Text style={[styles.cardValue, { color: '#16A34A', fontSize: 18 }]}>
                Tốt
              </Text>
            </LinearGradient>
          </View>

          {/* CÀI ĐẶT */}
          <Text style={styles.sectionTitle}>Cài đặt</Text>
          <View style={styles.menuContainer}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => navigation.navigate('TechnicianKyc')}
            >
              <Ionicons name="person-outline" size={22} color="#64748B" style={styles.menuIcon} />
              <View style={styles.menuContent}>
                <Text style={styles.menuTitle}>Xác minh danh tính (KYC)</Text>
                <Text style={styles.menuDesc}>Cập nhật CCCD & Thông tin</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
            </TouchableOpacity>
            <View style={styles.divider} />

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => Alert.alert('Thông báo', 'Hệ thống thông báo nhận đơn đang bật.')}
            >
              <Ionicons name="notifications-outline" size={22} color="#64748B" style={styles.menuIcon} />
              <View style={styles.menuContent}>
                <Text style={styles.menuTitle}>Thông báo nhận việc</Text>
                <Text style={styles.menuDesc}>Đang bật</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
            </TouchableOpacity>
            <View style={styles.divider} />

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => Alert.alert('Hỗ trợ', 'Tổng đài KTV FixHome: 1900 6868')}
            >
              <Ionicons name="headset-outline" size={22} color="#64748B" style={styles.menuIcon} />
              <View style={styles.menuContent}>
                <Text style={styles.menuTitle}>Hỗ trợ kỹ thuật 24/7</Text>
                <Text style={styles.menuDesc}>Hotline: 1900 6868</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          {/* QUY TRÌNH & NỘI QUY */}
          <Text style={styles.sectionTitle}>Quy trình & Nội quy</Text>
          <View style={styles.menuContainer}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() =>
                Alert.alert(
                  'Quy chuẩn dịch vụ',
                  '1. Đúng giờ theo lịch hẹn\n2. Mặc đồng phục, xuất trình thẻ\n3. Báo giá trước khi làm\n4. Không thu thêm phụ phí ngoài hệ thống',
                )
              }
            >
              <Ionicons name="book-outline" size={22} color="#64748B" style={styles.menuIcon} />
              <View style={styles.menuContent}>
                <Text style={styles.menuTitle}>Quy chuẩn dịch vụ 5 sao</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
            </TouchableOpacity>
            <View style={styles.divider} />

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() =>
                Alert.alert(
                  'Chính sách hoa hồng',
                  'Thợ nhận 85-90% giá trị công thợ trên mỗi đơn hoàn tất thành công.',
                )
              }
            >
              <Ionicons name="document-text-outline" size={22} color="#64748B" style={styles.menuIcon} />
              <View style={styles.menuContent}>
                <Text style={styles.menuTitle}>Chính sách thu nhập & Phí</Text>
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

      <Modal visible={isAvatarModalVisible} transparent={true} animationType="fade">
        <View style={styles.avatarModalContainer}>
          <TouchableOpacity style={styles.closeAvatarModalBtn} onPress={() => setAvatarModalVisible(false)}>
            <Ionicons name="close" size={30} color="#FFF" />
          </TouchableOpacity>
          {avatarUrl && (
             <Image source={{ uri: avatarUrl }} style={styles.fullAvatarImage} resizeMode="contain" />
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  name: { fontSize: 20, fontWeight: '700', color: '#0F172A', marginBottom: 4 },

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
    marginBottom: 12, borderWidth: 4, borderColor: '#FFFFFF', backgroundColor: '#FFFFFF'
  },
  avatar: {
    width: '100%', height: '100%', borderRadius: 50,
    backgroundColor: '#DBEAFE', justifyContent: 'center', alignItems: 'center', overflow: 'hidden'
  },
  avatarImage: { width: '100%', height: '100%' },
  avatarText: { fontSize: 36, fontWeight: '700', color: '#2563EB' },
  phone: { fontSize: 14, color: '#64748B', fontWeight: '500' },

  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A', marginBottom: 12 },
  menuContainer: { backgroundColor: '#FFFFFF', borderRadius: 16, overflow: 'hidden', marginBottom: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  menuItem: { flexDirection: 'row', padding: 16, alignItems: 'center' },
  menuIcon: { marginRight: 16 },
  menuContent: { flex: 1 },
  menuTitle: { fontSize: 15, fontWeight: '600', color: '#0F172A' },
  menuDesc: { fontSize: 13, color: '#64748B', marginTop: 2 },
  divider: { height: 1, backgroundColor: '#F1F5F9', marginLeft: 54 },
  footer: { alignItems: 'center', marginTop: 12, marginBottom: 32 },
  logoutBtn: { paddingVertical: 12, paddingHorizontal: 24 },
  logoutText: { fontSize: 14, fontWeight: '600', color: '#EF4444' },

  overviewRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  overviewCard: { flex: 1, borderRadius: 16, padding: 16 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  iconCircle: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: 8 },
  cardLabel: { fontSize: 14, color: '#475569', fontWeight: '500' },
  cardValue: { fontSize: 22, fontWeight: '800', color: '#0F172A' },
  cardUnit: { fontSize: 14, fontWeight: '600', color: '#64748B' },
  cameraIconBadge: { position: 'absolute', bottom: 0, right: 0, backgroundColor: '#2563EB', width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#FFF' },
  avatarModalContainer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center' },
  closeAvatarModalBtn: { position: 'absolute', top: 50, right: 20, zIndex: 10, padding: 8 },
  fullAvatarImage: { width: '100%', height: 400 },
});
