import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, TextInput, Alert, Switch, Image, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../types';
import { UserRole } from '../../types';
import { colors } from '../../constants';
import { useAuthStore } from '../../store';
import { useScrollHideTabBar } from '../../hooks/useScrollHideTabBar';
import { LinearGradient } from 'expo-linear-gradient';
import { authApi } from '../../api/auth';
import { storageService } from '../../services/storage.service';
import { usersApi } from '../../api/users';
import { addressesApi, AddressData } from '../../api/addresses';

export default function CustomerProfileScreen() {
  const { user, logout, setAuth } = useAuthStore();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const handleScroll = useScrollHideTabBar();
  
  // States for user info
  const [name, setName] = useState(user?.fullName || 'Khách hàng');
  const [email, setEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState(user?.phoneNumber || '');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user?.avatarUrl || null);
  
  const [addresses, setAddresses] = useState<AddressData[]>([]);

  const [refreshing, setRefreshing] = useState(false);

  const fetchProfileData = async () => {
    try {
      const profileRes = await usersApi.getProfile();
      if (profileRes.data) {
        setName(profileRes.data.fullName || 'Khách hàng');
        setEmail(profileRes.data.email || '');
        setPhone(profileRes.data.phoneNumber || '');
        setAvatarUrl(profileRes.data.avatarUrl || null);
      }
      
      if (user?.role !== UserRole.TECHNICIAN) {
        const addressesRes = await addressesApi.getAddresses();
        if (addressesRes.data) {
          setAddresses(addressesRes.data);
        }
      }
    } catch (error) {
      console.error('Fetch profile/addresses error:', error);
    }
  };

  useEffect(() => {
    fetchProfileData();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchProfileData();
    setRefreshing(false);
  };
  
  // State for theme
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Modals visibility
  const [isProfileModalVisible, setProfileModalVisible] = useState(false);
  const [isAddressModalVisible, setAddressModalVisible] = useState(false);

  // Temp states for editing profile
  const [editName, setEditName] = useState(name);
  const [editEmail, setEditEmail] = useState(email); // Typically email isn't editable, but keeping for UI
  const [editPhone, setEditPhone] = useState(phone);
  const [editAvatar, setEditAvatar] = useState(avatarUrl || '');

  // Temp states for adding/editing address
  const [editAddressId, setEditAddressId] = useState<string | null>(null);
  const [addressName, setAddressName] = useState('');
  const [addressDetail, setAddressDetail] = useState('');

  const handleSaveProfile = async () => {
    if (!editName || editName.trim().length < 2) {
      Alert.alert('Lỗi', 'Họ tên phải có ít nhất 2 ký tự.');
      return;
    }
    
    // Validate Vietnamese phone number format: 0[35789] followed by 8 digits
    const phoneRegex = /^0[35789][0-9]{8}$/;
    if (editPhone && !phoneRegex.test(editPhone.trim())) {
      Alert.alert('Lỗi', 'Số điện thoại không hợp lệ (Ví dụ: 0987654321).');
      return;
    }

    try {
      const payload: any = {
        fullName: editName.trim(),
      };
      
      if (editPhone && editPhone.trim()) {
        payload.phoneNumber = editPhone.trim();
      }
      
      if (editAvatar && editAvatar.trim()) {
        payload.avatarUrl = editAvatar.trim();
      }

      await usersApi.updateProfile(payload);
      setName(editName.trim());
      setPhone(editPhone ? editPhone.trim() : '');
      setAvatarUrl(editAvatar ? editAvatar.trim() : null);
      setProfileModalVisible(false);
      Alert.alert('Thành công', 'Cập nhật thông tin thành công!');
    } catch (error) {
      console.error(error);
      Alert.alert('Lỗi', 'Không thể cập nhật thông tin.');
    }
  };

  const handleSaveAddress = async () => {
    if (!addressName || !addressDetail) {
      Alert.alert('Lỗi', 'Vui lòng nhập đầy đủ thông tin địa chỉ.');
      return;
    }

    try {
      const payload = {
        label: addressName,
        line1: addressDetail,
        ward: 'Phường/Xã',
        district: 'Quận/Huyện',
        province: 'Tỉnh/TP',
        lat: 0,
        lng: 0,
        isDefault: addresses.length === 0
      };

      if (editAddressId) {
        await addressesApi.updateAddress(editAddressId, payload);
      } else {
        await addressesApi.createAddress(payload);
      }
      
      const res = await addressesApi.getAddresses();
      setAddresses(res.data);
      
      setAddressName('');
      setAddressDetail('');
      setEditAddressId(null);
      setAddressModalVisible(false);
      Alert.alert('Thành công', 'Lưu địa chỉ thành công');
    } catch (error) {
      console.error(error);
      Alert.alert('Lỗi', 'Không thể lưu địa chỉ');
    }
  };

  const handleEditAddress = (addr: AddressData) => {
    setEditAddressId(addr.id);
    setAddressName(addr.label);
    setAddressDetail(addr.line1);
  };

  const handleDeleteAddress = async (id: string) => {
    Alert.alert("Thông báo", "Bạn có chắc chắn muốn xoá địa chỉ này?", [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Xóa', style: 'destructive', onPress: async () => {
        await addressesApi.deleteAddress(id);
        setAddresses(addresses.filter(a => a.id !== id));
      }},
    ]);
  };

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

  return (
    <SafeAreaView style={[styles.container, isDarkMode && styles.containerDark]} edges={['top']}>
      <ScrollView 
        contentContainerStyle={{ paddingBottom: 40, paddingTop: 60 }}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2563EB']} />
        }
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

          <Text style={[styles.sectionTitle, isDarkMode && styles.textDark]}>Ví & Điểm thưởng</Text>
          <View style={styles.overviewRow}>
            <LinearGradient colors={['#E0F2FE', '#F0F9FF']} style={styles.overviewCard}>
              <View style={styles.cardTopRow}>
                <View style={[styles.iconCircle, { backgroundColor: '#BAE6FD' }]}>
                  <Ionicons name="wallet" size={16} color="#0284C7" />
                </View>
                <Text style={styles.cardLabel}>Số dư</Text>
              </View>
              <Text style={styles.cardValue}>0 <Text style={styles.cardUnit}>đ</Text></Text>
            </LinearGradient>

            <LinearGradient colors={['#FEF3C7', '#FFFBEB']} style={styles.overviewCard}>
              <View style={styles.cardTopRow}>
                <View style={[styles.iconCircle, { backgroundColor: '#FDE68A' }]}>
                  <Ionicons name="gift" size={16} color="#D97706" />
                </View>
                <Text style={styles.cardLabel}>F-Point</Text>
              </View>
              <Text style={styles.cardValue}>0 <Text style={styles.cardUnit}>điểm</Text></Text>
            </LinearGradient>
          </View>

        <Text style={[styles.sectionTitle, isDarkMode && styles.textDark]}>Quản lý tài khoản</Text>

        <View style={[styles.menuContainer, isDarkMode && styles.cardDark]}>
          <TouchableOpacity style={styles.menuItem} onPress={() => {
            setEditName(name); setEditEmail(email); setEditPhone(phone);
            setProfileModalVisible(true);
          }}>
            <Ionicons name="person-outline" size={22} color="#64748B" style={styles.menuIcon} />
            <View style={styles.menuContent}>
              <Text style={[styles.menuTitle, isDarkMode && styles.textDark]}>Thông tin cá nhân</Text>
              <Text style={styles.menuDesc}>Họ tên, avatar, số điện thoại</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
          </TouchableOpacity>
          <View style={styles.divider} />

          <TouchableOpacity style={styles.menuItem} onPress={() => setAddressModalVisible(true)}>
            <Ionicons name="location-outline" size={22} color="#64748B" style={styles.menuIcon} />
            <View style={styles.menuContent}>
              <Text style={[styles.menuTitle, isDarkMode && styles.textDark]}>Địa chỉ sửa chữa</Text>
              <Text style={styles.menuDesc}>{addresses.length} địa chỉ đã lưu</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
          </TouchableOpacity>
          <View style={styles.divider} />

          <TouchableOpacity style={styles.menuItem} onPress={() => Alert.alert('Tính năng đang phát triển')}>
            <Ionicons name="card-outline" size={22} color="#64748B" style={styles.menuIcon} />
            <View style={styles.menuContent}>
              <Text style={[styles.menuTitle, isDarkMode && styles.textDark]}>Phương thức thanh toán</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
          </TouchableOpacity>
          <View style={styles.divider} />

          <TouchableOpacity style={styles.menuItem} onPress={() => Alert.alert('Tính năng đang phát triển')}>
            <Ionicons name="shield-checkmark-outline" size={22} color="#64748B" style={styles.menuIcon} />
            <View style={styles.menuContent}>
              <Text style={[styles.menuTitle, isDarkMode && styles.textDark]}>Bảo mật & phiên đăng nhập</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
          </TouchableOpacity>
        </View>

        <Text style={[styles.sectionTitle, isDarkMode && styles.textDark]}>Cài đặt</Text>
        <View style={[styles.menuContainer, isDarkMode && styles.cardDark]}>
          <View style={styles.menuItem}>
            <Ionicons name="moon-outline" size={22} color="#64748B" style={styles.menuIcon} />
            <View style={styles.menuContent}>
              <Text style={[styles.menuTitle, isDarkMode && styles.textDark]}>Giao diện tối</Text>
            </View>
            <Switch value={isDarkMode} onValueChange={setIsDarkMode} />
          </View>
        </View>

        <View style={styles.footer}>
          <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
            <Text style={styles.logoutText}>Đăng xuất</Text>
          </TouchableOpacity>
        </View>
        </View>
      </ScrollView>

      {/* Profile Edit Modal */}
      <Modal visible={isProfileModalVisible} animationType="fade" transparent={true}>
        <View style={styles.modalContainer}>
          <View style={[styles.modalContent, isDarkMode && styles.cardDark]}>
            <Text style={[styles.modalTitle, isDarkMode && styles.textDark]}>Chỉnh sửa thông tin</Text>
            <TextInput style={[styles.input, isDarkMode && styles.inputDark]} placeholder="Họ và tên" placeholderTextColor="#94A3B8" value={editName} onChangeText={setEditName} />
            <TextInput style={[styles.input, isDarkMode && styles.inputDark]} placeholder="Email" placeholderTextColor="#94A3B8" value={editEmail} editable={false} keyboardType="email-address" />
            <TextInput style={[styles.input, isDarkMode && styles.inputDark]} placeholder="Số điện thoại" placeholderTextColor="#94A3B8" value={editPhone} onChangeText={setEditPhone} keyboardType="phone-pad" />
            <TextInput style={[styles.input, isDarkMode && styles.inputDark]} placeholder="Link Avatar URL" placeholderTextColor="#94A3B8" value={editAvatar} onChangeText={setEditAvatar} />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setProfileModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveProfile}>
                <Text style={styles.saveBtnText}>Lưu</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Address Edit Modal */}
      <Modal visible={isAddressModalVisible} animationType="fade" transparent={true}>
        <View style={styles.modalContainer}>
          <View style={[styles.modalContent, isDarkMode && styles.cardDark, { maxHeight: '80%' }]}>
            <Text style={[styles.modalTitle, isDarkMode && styles.textDark]}>Quản lý địa chỉ</Text>
            <ScrollView style={{ width: '100%', marginBottom: 16 }}>
              {addresses.map(addr => (
                <View key={addr.id} style={[styles.addressItem, isDarkMode && styles.inputDark]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.addressName, isDarkMode && styles.textDark]}>{addr.label}</Text>
                    <Text style={styles.addressDetail}>{addr.line1}</Text>
                  </View>
                  <TouchableOpacity onPress={() => handleEditAddress(addr)} style={styles.iconBtn}>
                    <Ionicons name="pencil" size={20} color="#2563EB" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDeleteAddress(addr.id)} style={styles.iconBtn}>
                    <Ionicons name="trash" size={20} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>

            <Text style={[styles.sectionTitle, isDarkMode && styles.textDark, { alignSelf: 'flex-start' }]}>
              {editAddressId ? 'Sửa địa chỉ' : 'Thêm địa chỉ mới'}
            </Text>
            <TextInput style={[styles.input, isDarkMode && styles.inputDark]} placeholder="Tên gợi nhớ (VD: Nhà riêng)" placeholderTextColor="#94A3B8" value={addressName} onChangeText={setAddressName} />
            <TextInput style={[styles.input, isDarkMode && styles.inputDark]} placeholder="Địa chỉ chi tiết" placeholderTextColor="#94A3B8" value={addressDetail} onChangeText={setAddressDetail} />
            
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => { setAddressModalVisible(false); setEditAddressId(null); setAddressName(''); setAddressDetail(''); }}>
                <Text style={styles.cancelBtnText}>Đóng</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveAddress}>
                <Text style={styles.saveBtnText}>{editAddressId ? 'Cập nhật' : 'Thêm'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  containerDark: { backgroundColor: '#0F172A' },
  scrollContent: { paddingHorizontal: 16 },
  cardDark: { backgroundColor: '#1E293B' },
  identityInfo: { flex: 1 },
  name: { fontSize: 20, fontWeight: '700', color: '#0F172A', marginBottom: 4 },
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

  modalContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)', padding: 16 },
  modalContent: { width: '100%', backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20, alignItems: 'center' },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#0F172A', marginBottom: 16 },
  input: { width: '100%', backgroundColor: '#F1F5F9', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 14, color: '#0F172A', marginBottom: 12 },
  inputDark: { backgroundColor: '#334155', color: '#F8FAFC' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', width: '100%', marginTop: 8, gap: 12 },
  cancelBtn: { paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12, backgroundColor: '#F1F5F9' },
  cancelBtnText: { color: '#64748B', fontWeight: '600', fontSize: 14 },
  saveBtn: { paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12, backgroundColor: '#2563EB' },
  saveBtnText: { color: '#FFFFFF', fontWeight: '600', fontSize: 14 },
  addressItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', padding: 12, borderRadius: 12, marginBottom: 8 },
  addressName: { fontSize: 14, fontWeight: '600', color: '#0F172A', marginBottom: 4 },
  addressDetail: { fontSize: 12, color: '#64748B' },
  iconBtn: { padding: 8, marginLeft: 4 },
  overviewRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  overviewCard: { flex: 1, borderRadius: 16, padding: 16 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  iconCircle: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: 8 },
  cardLabel: { fontSize: 14, color: '#475569', fontWeight: '500' },
  cardValue: { fontSize: 22, fontWeight: '800', color: '#0F172A' },
  cardUnit: { fontSize: 14, fontWeight: '600', color: '#64748B' },
});
