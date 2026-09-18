import React, { useState, useEffect, useCallback } from 'react';
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
  Image,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../types';
import { useAuthStore } from '../../store';
import { authApi } from '../../api/auth.api';
import { useScrollHideTabBar } from '../../hooks/useScrollHideTabBar';
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
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user?.avatarUrl || null);

  // State for theme
  const [isDarkMode, setIsDarkMode] = useState(false);

  // States for addresses & Loading
  const [addresses, setAddresses] = useState<AddressData[]>([]);
  const [loadingAddresses, setLoadingAddresses] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Modals visibility
  const [isProfileModalVisible, setProfileModalVisible] = useState(false);
  const [isAddressModalVisible, setAddressModalVisible] = useState(false);
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
      setEditAvatar(uri);
      try {
        await usersApi.updateProfile({ avatarUrl: uri });
      } catch (e) {
        console.error('Failed to update avatar', e);
      }
    }
  };
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingAddress, setSavingAddress] = useState(false);

  // Temp states for editing profile
  const [editName, setEditName] = useState(name);
  const [editPhone, setEditPhone] = useState(phone);
  const [editAvatar, setEditAvatar] = useState(avatarUrl || '');

  // Temp states for adding/editing address
  const [editAddressId, setEditAddressId] = useState<string | null>(null);
  const [addressName, setAddressName] = useState('');
  const [addressDetail, setAddressDetail] = useState('');

  const fetchProfileData = useCallback(async () => {
    try {
      const profile = await usersApi.getProfile();
      if (profile) {
        setName(profile.fullName || name);
        setPhone(profile.phoneNumber || phone);
        setAvatarUrl(profile.avatarUrl || avatarUrl);
        if (token) setAuth(token, profile);
      }
    } catch {
      // Ignore
    }
  }, [name, phone, avatarUrl, setAuth, token]);

  const refreshAddresses = useCallback(async () => {
    try {
      const list = await usersApi.getAddresses();
      setAddresses(Array.isArray(list) ? list : []);
    } catch {
      // Ignored
    } finally {
      setLoadingAddresses(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadData = async () => {
      await fetchProfileData();
      await refreshAddresses();
    };
    if (mounted) {
      loadData();
    }
    return () => { mounted = false; };
  }, [fetchProfileData, refreshAddresses]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchProfileData(), refreshAddresses()]);
    setRefreshing(false);
  };

  const handleSaveProfile = async () => {
    if (!editName.trim()) {
      Alert.alert('Lỗi', 'Vui lòng nhập họ và tên.');
      return;
    }
    setSavingProfile(true);
    try {
      // Gộp payload edit avatar theo UI v2
      const payload: any = {
        fullName: editName.trim(),
        phoneNumber: editPhone.trim() || undefined,
      };
      if (editAvatar && editAvatar.trim()) {
        payload.avatarUrl = editAvatar.trim();
      }

      const updated = await usersApi.updateProfile(payload);
      
      setName(updated.fullName || editName);
      setPhone(updated.phoneNumber || editPhone);
      setAvatarUrl(payload.avatarUrl || null); // Cập nhật lại UI Avatar
      
      if (token && user) {
        setAuth(token, { ...user, fullName: updated.fullName, phoneNumber: updated.phoneNumber, avatarUrl: payload.avatarUrl });
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
      setAddressModalVisible(false);
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
            navigation.reset({ index: 0, routes: [{ name: 'Auth' }] });
          }, 100);
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={[styles.container, isDarkMode && styles.containerDark]} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40, paddingTop: 60 }} // Padding top của v2
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2563EB']} />
        }
      >
        {/* Main Wrapper từ UI v2 */}
        <View style={[styles.mainWrapperCard, isDarkMode && styles.cardDark]}>
          
          {/* Avatar Section từ v2 */}
          <View style={styles.avatarSection}>
            <View style={[styles.avatarBorder, isDarkMode ? styles.avatarBorderDark : styles.avatarBorderLight]}>
              <TouchableOpacity onPress={() => avatarUrl && setAvatarModalVisible(true)} activeOpacity={0.8} style={styles.avatar}>
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
                ) : (
                  <Text style={styles.avatarText}>{name.charAt(0)}</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={styles.cameraIconBadge} onPress={handlePickImage} activeOpacity={0.8}>
                 <Ionicons name="camera" size={16} color="#FFF" />
              </TouchableOpacity>
            </View>
            <Text style={[styles.name, isDarkMode && styles.textDark]}>{name}</Text>
            <Text style={styles.phone}>{phone || 'Chưa cập nhật SĐT'}</Text>
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
                setEditAvatar(avatarUrl || '');
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
            <View style={styles.divider} />

            <TouchableOpacity style={styles.menuItem} onPress={() => Alert.alert('Tính năng đang phát triển')}>
              <Ionicons name="shield-checkmark-outline" size={22} color="#64748B" style={styles.menuIcon} />
              <View style={styles.menuContent}>
                <Text style={[styles.menuTitle, isDarkMode && styles.textDark]}>Bảo mật & phiên đăng nhập</Text>
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

      {/* Profile Edit Modal (Thêm input URL Avatar của v2 + Nút Loading của bản thường) */}
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
              placeholder="Số điện thoại"
              placeholderTextColor="#94A3B8"
              value={editPhone}
              onChangeText={setEditPhone}
              keyboardType="phone-pad"
            />
            <TextInput 
              style={[styles.input, isDarkMode && styles.inputDark]} 
              placeholder="Link Avatar URL (Tùy chọn)" 
              placeholderTextColor="#94A3B8" 
              value={editAvatar} 
              onChangeText={setEditAvatar} 
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

      {/* Address Edit Modal (Logic bản thường với Empty State tốt hơn) */}
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
  cardDark: { backgroundColor: '#1E293B' },
  name: { fontSize: 20, fontWeight: '700', color: '#0F172A', marginBottom: 4 },
  textDark: { color: '#F8FAFC' },

  // Giao diện Main Wrapper & Avatar của v2
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
  saveBtn: { paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12, backgroundColor: '#2563EB', justifyContent: 'center', alignItems: 'center' },
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
  cameraIconBadge: { position: 'absolute', bottom: 0, right: 0, backgroundColor: '#2563EB', width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#FFF' },
  avatarModalContainer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center' },
  closeAvatarModalBtn: { position: 'absolute', top: 50, right: 20, zIndex: 10, padding: 8 },
  fullAvatarImage: { width: '100%', height: 400 },
});