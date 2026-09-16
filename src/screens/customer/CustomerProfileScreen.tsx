import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../types';
import { useAuthStore } from '../../store';
import { authApi } from '../../api/auth.api';
import { useScrollHideTabBar } from '../../hooks/useScrollHideTabBar';
import { ProfileHeader } from '../../components/profile/ProfileHeader';
import { LinearGradient } from 'expo-linear-gradient';
import { usersApi, type AddressData } from '../../api/users.api';

export default function CustomerProfileScreen() {
  const { user, token, setAuth, logout } = useAuthStore();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const handleScroll = useScrollHideTabBar();

  // States for user info
  const [name, setName] = useState(user?.fullName || 'Khách hàng');
  const [email] = useState(user?.email || 'customer@fixhome.vn');
  const [phone, setPhone] = useState(user?.phoneNumber || '');

  // State for theme
  const [isDarkMode, setIsDarkMode] = useState(false);

  // States for addresses
  const [addresses, setAddresses] = useState<AddressData[]>([]);
  const [loadingAddresses, setLoadingAddresses] = useState(true);

  // Modals visibility
  const [isProfileModalVisible, setProfileModalVisible] = useState(false);
  const [isAddressModalVisible, setAddressModalVisible] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingAddress, setSavingAddress] = useState(false);

  // Temp states for editing profile
  const [editName, setEditName] = useState(name);
  const [editPhone, setEditPhone] = useState(phone);

  // Temp states for adding/editing address
  const [editAddressId, setEditAddressId] = useState<string | null>(null);
  const [addressName, setAddressName] = useState('');
  const [addressDetail, setAddressDetail] = useState('');

  useEffect(() => {
    let mounted = true;
    usersApi
      .getProfile()
      .then((profile) => {
        if (mounted && profile) {
          setName(profile.fullName || name);
          setPhone(profile.phoneNumber || phone);
          if (token) setAuth(token, profile);
        }
      })
      .catch(() => {});

    usersApi
      .getAddresses()
      .then((list) => {
        if (mounted) {
          setAddresses(Array.isArray(list) ? list : []);
          setLoadingAddresses(false);
        }
      })
      .catch(() => {
        if (mounted) setLoadingAddresses(false);
      });

    return () => {
      mounted = false;
    };
  }, [name, phone, setAuth, token]);

  const refreshAddresses = async () => {
    try {
      const list = await usersApi.getAddresses();
      setAddresses(Array.isArray(list) ? list : []);
    } catch {
      // Ignored
    }
  };

  const handleSaveProfile = async () => {
    if (!editName.trim()) {
      Alert.alert('Lỗi', 'Vui lòng nhập họ và tên.');
      return;
    }
    setSavingProfile(true);
    try {
      const updated = await usersApi.updateProfile({
        fullName: editName.trim(),
        phoneNumber: editPhone.trim() || undefined,
      });
      setName(updated.fullName || editName);
      setPhone(updated.phoneNumber || editPhone);
      if (token && user) {
        setAuth(token, { ...user, fullName: updated.fullName, phoneNumber: updated.phoneNumber });
      }
      setProfileModalVisible(false);
      Alert.alert('Thành công', 'Cập nhật thông tin thành công!');
    } catch (err: any) {
      Alert.alert('Lỗi', err?.response?.data?.message || 'Không thể cập nhật thông tin.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSaveAddress = async () => {
    if (!addressName.trim() || !addressDetail.trim()) {
      Alert.alert('Lỗi', 'Vui lòng nhập đầy đủ tên gợi nhớ và địa chỉ chi tiết.');
      return;
    }

    setSavingAddress(true);
    try {
      if (editAddressId) {
        await usersApi.updateAddress(editAddressId, {
          label: addressName.trim(),
          line1: addressDetail.trim(),
        });
      } else {
        await usersApi.createAddress({
          label: addressName.trim(),
          line1: addressDetail.trim(),
          ward: '',
          district: '',
          province: 'TP.HCM',
        });
      }
      await refreshAddresses();
      setAddressName('');
      setAddressDetail('');
      setEditAddressId(null);
    } catch (err: any) {
      Alert.alert('Lỗi', err?.response?.data?.message || 'Không thể lưu địa chỉ.');
    } finally {
      setSavingAddress(false);
    }
  };

  const handleEditAddress = (addr: AddressData) => {
    setEditAddressId(addr.id);
    setAddressName(addr.label);
    setAddressDetail(addr.line1);
  };

  const handleDeleteAddress = async (id: string) => {
    Alert.alert('Xác nhận xóa', 'Bạn có muốn xóa địa chỉ này?', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: async () => {
          try {
            await usersApi.deleteAddress(id);
            await refreshAddresses();
          } catch (err: any) {
            Alert.alert('Lỗi', err?.response?.data?.message || 'Không thể xóa địa chỉ.');
          }
        },
      },
    ]);
  };

  const handleLogout = () => {
    Alert.alert('Đăng xuất', 'Bạn có chắc chắn muốn đăng xuất?', [
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
    <SafeAreaView style={[styles.container, isDarkMode && styles.containerDark]} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        <ProfileHeader
          name={name}
          phone={phone || 'Chưa cập nhật SĐT'}
          avatarText={name.charAt(0)}
          isDarkMode={isDarkMode}
        />

        <View style={styles.scrollContent}>
          <Text style={[styles.sectionTitle, isDarkMode && styles.textDark]}>Ví & Điểm thưởng</Text>
          <View style={styles.overviewRow}>
            <LinearGradient colors={['#E0F2FE', '#F0F9FF']} style={styles.overviewCard}>
              <View style={styles.cardTopRow}>
                <View style={[styles.iconCircle, { backgroundColor: '#BAE6FD' }]}>
                  <Ionicons name="wallet" size={16} color="#0284C7" />
                </View>
                <Text style={styles.cardLabel}>Số dư</Text>
              </View>
              <Text style={styles.cardValue}>
                0 <Text style={styles.cardUnit}>đ</Text>
              </Text>
            </LinearGradient>

            <LinearGradient colors={['#FEF3C7', '#FFFBEB']} style={styles.overviewCard}>
              <View style={styles.cardTopRow}>
                <View style={[styles.iconCircle, { backgroundColor: '#FDE68A' }]}>
                  <Ionicons name="gift" size={16} color="#D97706" />
                </View>
                <Text style={styles.cardLabel}>F-Point</Text>
              </View>
              <Text style={styles.cardValue}>
                0 <Text style={styles.cardUnit}>điểm</Text>
              </Text>
            </LinearGradient>
          </View>

          <Text style={[styles.sectionTitle, isDarkMode && styles.textDark]}>Quản lý tài khoản</Text>

          <View style={[styles.menuContainer, isDarkMode && styles.cardDark]}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setEditName(name);
                setEditPhone(phone);
                setProfileModalVisible(true);
              }}
            >
              <Ionicons name="person-outline" size={22} color="#64748B" style={styles.menuIcon} />
              <View style={styles.menuContent}>
                <Text style={[styles.menuTitle, isDarkMode && styles.textDark]}>Thông tin cá nhân</Text>
                <Text style={styles.menuDesc}>{name} · {phone || email}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
            </TouchableOpacity>
            <View style={styles.divider} />

            <TouchableOpacity style={styles.menuItem} onPress={() => setAddressModalVisible(true)}>
              <Ionicons name="location-outline" size={22} color="#64748B" style={styles.menuIcon} />
              <View style={styles.menuContent}>
                <Text style={[styles.menuTitle, isDarkMode && styles.textDark]}>Địa chỉ sửa chữa</Text>
                <Text style={styles.menuDesc}>
                  {loadingAddresses ? 'Đang tải...' : `${addresses.length} địa chỉ đã lưu`}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
            </TouchableOpacity>
            <View style={styles.divider} />

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => Alert.alert('Thông báo', 'Hỗ trợ thanh toán tiền mặt và chuyển khoản khi hoàn tất.')}
            >
              <Ionicons name="card-outline" size={22} color="#64748B" style={styles.menuIcon} />
              <View style={styles.menuContent}>
                <Text style={[styles.menuTitle, isDarkMode && styles.textDark]}>Phương thức thanh toán</Text>
                <Text style={styles.menuDesc}>Tiền mặt, Chuyển khoản QR</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          <Text style={[styles.sectionTitle, isDarkMode && styles.textDark]}>Tùy chọn</Text>
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
            <TextInput
              style={[styles.input, isDarkMode && styles.inputDark]}
              placeholder="Họ và tên"
              placeholderTextColor="#94A3B8"
              value={editName}
              onChangeText={setEditName}
            />
            <TextInput
              style={[styles.input, isDarkMode && styles.inputDark, { opacity: 0.6 }]}
              placeholder="Email"
              placeholderTextColor="#94A3B8"
              value={email}
              editable={false}
            />
            <TextInput
              style={[styles.input, isDarkMode && styles.inputDark]}
              placeholder="Số điện thoại (10 số)"
              placeholderTextColor="#94A3B8"
              value={editPhone}
              onChangeText={setEditPhone}
              keyboardType="phone-pad"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setProfileModalVisible(false)}
                disabled={savingProfile}
              >
                <Text style={styles.cancelBtnText}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, savingProfile && { opacity: 0.7 }]}
                onPress={handleSaveProfile}
                disabled={savingProfile}
              >
                {savingProfile ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={styles.saveBtnText}>Lưu</Text>
                )}
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
              {addresses.length === 0 ? (
                <Text style={{ textAlign: 'center', color: '#94A3B8', marginVertical: 12 }}>
                  Chưa có địa chỉ nào được lưu.
                </Text>
              ) : (
                addresses.map((addr) => (
                  <View key={addr.id} style={[styles.addressItem, isDarkMode && styles.inputDark]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.addressName, isDarkMode && styles.textDark]}>{addr.label}</Text>
                      <Text style={styles.addressDetail}>{addr.line1}</Text>
                    </View>
                    <TouchableOpacity onPress={() => handleEditAddress(addr)} style={styles.iconBtn}>
                      <Ionicons name="pencil" size={18} color="#2563EB" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDeleteAddress(addr.id)} style={styles.iconBtn}>
                      <Ionicons name="trash" size={18} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </ScrollView>

            <Text style={[styles.sectionTitle, isDarkMode && styles.textDark, { alignSelf: 'flex-start' }]}>
              {editAddressId ? 'Sửa địa chỉ' : 'Thêm địa chỉ mới'}
            </Text>
            <TextInput
              style={[styles.input, isDarkMode && styles.inputDark]}
              placeholder="Tên gợi nhớ (VD: Nhà riêng)"
              placeholderTextColor="#94A3B8"
              value={addressName}
              onChangeText={setAddressName}
            />
            <TextInput
              style={[styles.input, isDarkMode && styles.inputDark]}
              placeholder="Địa chỉ chi tiết (số nhà, tên đường...)"
              placeholderTextColor="#94A3B8"
              value={addressDetail}
              onChangeText={setAddressDetail}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => {
                  setAddressModalVisible(false);
                  setEditAddressId(null);
                  setAddressName('');
                  setAddressDetail('');
                }}
                disabled={savingAddress}
              >
                <Text style={styles.cancelBtnText}>Đóng</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, savingAddress && { opacity: 0.7 }]}
                onPress={handleSaveAddress}
                disabled={savingAddress}
              >
                {savingAddress ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={styles.saveBtnText}>{editAddressId ? 'Cập nhật' : 'Thêm'}</Text>
                )}
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
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A', marginBottom: 12 },
  textDark: { color: '#F8FAFC' },
  menuContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  menuItem: { flexDirection: 'row', padding: 16, alignItems: 'center' },
  menuIcon: { marginRight: 16 },
  menuContent: { flex: 1 },
  menuTitle: { fontSize: 15, fontWeight: '600', color: '#0F172A' },
  menuDesc: { fontSize: 13, color: '#64748B', marginTop: 2 },
  divider: { height: 1, backgroundColor: '#F1F5F9', marginLeft: 54 },
  footer: { alignItems: 'center', marginTop: 12, marginBottom: 32 },
  logoutBtn: { paddingVertical: 12, paddingHorizontal: 24 },
  logoutText: { fontSize: 14, fontWeight: '600', color: '#EF4444' },

  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 16,
  },
  modalContent: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#0F172A', marginBottom: 16 },
  input: {
    width: '100%',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: '#0F172A',
    marginBottom: 12,
  },
  inputDark: { backgroundColor: '#334155', color: '#F8FAFC' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', width: '100%', marginTop: 8, gap: 12 },
  cancelBtn: { paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12, backgroundColor: '#F1F5F9' },
  cancelBtnText: { color: '#64748B', fontWeight: '600', fontSize: 14 },
  saveBtn: { paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12, backgroundColor: '#2563EB' },
  saveBtnText: { color: '#FFFFFF', fontWeight: '600', fontSize: 14 },
  addressItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  addressName: { fontSize: 14, fontWeight: '600', color: '#0F172A', marginBottom: 4 },
  addressDetail: { fontSize: 12, color: '#64748B' },
  iconBtn: { padding: 8, marginLeft: 4 },
  overviewRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  overviewCard: { flex: 1, borderRadius: 16, padding: 16 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  cardLabel: { fontSize: 14, color: '#475569', fontWeight: '500' },
  cardValue: { fontSize: 22, fontWeight: '800', color: '#0F172A' },
  cardUnit: { fontSize: 14, fontWeight: '600', color: '#64748B' },
});
