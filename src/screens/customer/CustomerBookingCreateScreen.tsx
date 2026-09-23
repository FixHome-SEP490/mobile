import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppTheme } from '../../constants/theme';
import { bookingsApi } from '../../api/bookings.api';
import { servicesApi, type ServiceItem } from '../../api/services.api';
import { usersApi, type AddressData } from '../../api/users.api';
import { useAuthStore } from '../../store';
import { UserRole, type RootStackParamList } from '../../types';
import { buildBookingWindow, validateBookingFields } from '../../utils/booking-window';

type CreateRoute = RouteProp<RootStackParamList, 'CustomerBookingCreate'>;
const DATE_OFFSETS = [0, 1, 2, 3];
const START_TIMES = ['09:00', '10:00', '13:00', '14:00', '15:00', '16:00'];

function dateLabel(offset: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return `${offset === 0 ? 'Hôm nay' : offset === 1 ? 'Ngày mai' : 'Ngày'} · ${date.getDate()}/${date.getMonth() + 1}`;
}

export default function CustomerBookingCreateScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<CreateRoute>();
  const { colors } = useAppTheme();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const userRole = useAuthStore((state) => state.user?.role);
  const prefill = route.params?.prefill;
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [addresses, setAddresses] = useState<AddressData[]>([]);
  const [serviceId, setServiceId] = useState('');
  const [addressId, setAddressId] = useState('');
  const [description, setDescription] = useState(prefill?.description ?? '');
  const [dayOffset, setDayOffset] = useState(0);
  const [startTime, setStartTime] = useState('09:00');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [uncertainSubmission, setUncertainSubmission] = useState(false);
  const [createdBookingId, setCreatedBookingId] = useState<string | null>(null);
  const submittingRef = useRef(false);

  const loadOptions = useCallback(async () => {
    if (!isAuthenticated || userRole !== UserRole.CUSTOMER) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError('');
    try {
      const [catalog, saved] = await Promise.all([
        servicesApi.getServices({ pageSize: 100 }),
        usersApi.getAddresses(),
      ]);
      const activeServices = catalog.data.filter((service) => service.isActive);
      setServices(activeServices);
      setAddresses(saved);
      setServiceId((existing) => {
        if (activeServices.some((service) => service.id === existing)) return existing;
        return activeServices.find((service) => service.id === prefill?.serviceId)?.id ?? '';
      });
      setAddressId((existing) => {
        if (saved.some((address) => address.id === existing)) return existing;
        return saved.find((address) => address.isDefault)?.id ?? saved[0]?.id ?? '';
      });
    } catch {
      setLoadError('Không tải được dịch vụ hoặc địa chỉ đã lưu. Hãy thử lại khi có kết nối.');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, prefill?.serviceId, userRole]);

  useEffect(() => {
    // Defer the async catalog/address refresh; never synchronously set state in an effect body.
    void Promise.resolve().then(loadOptions);
  }, [loadOptions]);

  const submit = async () => {
    if (submittingRef.current || createdBookingId || uncertainSubmission || loading || loadError) return;
    if (!isAuthenticated || userRole !== UserRole.CUSTOMER) {
      Alert.alert('Cần tài khoản khách hàng', 'Hãy đăng nhập bằng tài khoản khách hàng trước khi đặt thợ.');
      return;
    }
    let fields: ReturnType<typeof validateBookingFields>;
    let window: ReturnType<typeof buildBookingWindow>;
    try {
      fields = validateBookingFields({ serviceId, addressId, description, quantity: 1 });
      if (!services.some((service) => service.id === fields.serviceId) ||
          !addresses.some((address) => address.id === fields.addressId)) {
        throw new Error('Vui lòng chọn dịch vụ và địa chỉ thực tế từ danh sách đã tải.');
      }
      window = buildBookingWindow({ dayOffset, time: startTime });
    } catch (error) {
      Alert.alert('Thông tin chưa hợp lệ', error instanceof Error ? error.message : 'Kiểm tra lại thông tin đặt lịch.');
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    try {
      // AI preview photos are local data URIs, NOT private Booking upload IDs.
      const booking = await bookingsApi.createBooking({ ...fields, ...window, urgency: 'NORMAL' });
      if (!booking.id) throw new Error('Backend chưa xác nhận mã Booking.');
      setCreatedBookingId(booking.id);
    } catch {
      // POST may have succeeded before a network timeout: never retry blindly.
      setUncertainSubmission(true);
      Alert.alert('Chưa xác minh được kết quả', 'Yêu cầu có thể đã được tạo. Không gửi lại ngay; hãy kiểm tra lịch sử đặt thợ hoặc liên hệ hỗ trợ.');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const action = (label: string, onPress: () => void, disabled = false) => (
    <TouchableOpacity accessibilityRole="button" disabled={disabled} onPress={onPress}
      style={[styles.action, { backgroundColor: disabled ? colors.border : colors.primary }]}>
      <Text style={[styles.actionText, { color: disabled ? colors.textSecondary : '#FFFFFF' }]}>{label}</Text>
    </TouchableOpacity>
  );

  if (!isAuthenticated || userRole !== UserRole.CUSTOMER) {
    return (
      <SafeAreaView style={[styles.page, { backgroundColor: colors.background }]}>
        <Text style={[styles.title, { color: colors.text }]}>Đăng nhập bằng tài khoản khách hàng để đặt thợ.</Text>
        {action('Đăng nhập', () => navigation.navigate('Auth'))}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.page, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.title, { color: colors.text }]}>Đặt lịch sửa chữa</Text>
        <Text style={[styles.note, { color: colors.textSecondary }]}>Chọn dịch vụ, địa chỉ đã lưu và khung giờ thật. AI chỉ hỗ trợ gợi ý, không tự đặt lịch.</Text>
        {loading && <ActivityIndicator color={colors.primary} accessibilityLabel="Đang tải dịch vụ và địa chỉ" />}
        {!!loadError && (
          <View style={styles.section}>
            <Text style={{ color: colors.error }}>{loadError}</Text>
            {action('Tải lại', () => { void loadOptions(); })}
          </View>
        )}
        {!loading && !loadError && !createdBookingId && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Dịch vụ</Text>
            {services.length === 0 && <Text style={{ color: colors.textSecondary }}>Chưa có dịch vụ khả dụng. Vui lòng thử lại sau.</Text>}
            {services.map((service) => (
              <TouchableOpacity key={service.id} accessibilityRole="radio" accessibilityState={{ checked: serviceId === service.id }}
                style={[styles.option, { borderColor: serviceId === service.id ? colors.primary : colors.border, backgroundColor: colors.surface }]}
                onPress={() => setServiceId(service.id)}>
                <Text style={{ color: colors.text }}>{service.name}{serviceId === service.id ? ' ✓' : ''}</Text>
              </TouchableOpacity>
            ))}

            <Text style={[styles.sectionTitle, { color: colors.text }]}>Địa chỉ sửa chữa đã lưu</Text>
            {addresses.length === 0 && <Text style={{ color: colors.textSecondary }}>Chưa có địa chỉ. Vui lòng thêm địa chỉ trong Hồ sơ trước khi đặt lịch.</Text>}
            {addresses.map((address) => (
              <TouchableOpacity key={address.id} accessibilityRole="radio" accessibilityState={{ checked: addressId === address.id }}
                style={[styles.option, { borderColor: addressId === address.id ? colors.primary : colors.border, backgroundColor: colors.surface }]}
                onPress={() => setAddressId(address.id)}>
                <Text style={{ color: colors.text }}>{address.label || 'Địa chỉ'}{addressId === address.id ? ' ✓' : ''}</Text>
                <Text style={{ color: colors.textSecondary }}>{[address.line1, address.ward, address.district, address.province].filter(Boolean).join(', ')}</Text>
              </TouchableOpacity>
            ))}

            <Text style={[styles.sectionTitle, { color: colors.text }]}>Mô tả sự cố (bắt buộc)</Text>
            <TextInput value={description} onChangeText={setDescription} multiline maxLength={5000}
              placeholder="Mô tả thiết bị và vấn đề cần sửa" placeholderTextColor={colors.textSecondary}
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]} />

            <Text style={[styles.sectionTitle, { color: colors.text }]}>Ngày sửa chữa</Text>
            <View style={styles.choices}>
              {DATE_OFFSETS.map((offset) => (
                <TouchableOpacity key={offset} accessibilityRole="radio" accessibilityState={{ checked: dayOffset === offset }}
                  onPress={() => setDayOffset(offset)} style={[styles.chip, { borderColor: dayOffset === offset ? colors.primary : colors.border, backgroundColor: colors.surface }]}>
                  <Text style={{ color: colors.text }}>{dateLabel(offset)}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Giờ bắt đầu · khung đến dự kiến 2 giờ</Text>
            <View style={styles.choices}>
              {START_TIMES.map((time) => (
                <TouchableOpacity key={time} accessibilityRole="radio" accessibilityState={{ checked: startTime === time }}
                  onPress={() => setStartTime(time)} style={[styles.chip, { borderColor: startTime === time ? colors.primary : colors.border, backgroundColor: colors.surface }]}>
                  <Text style={{ color: colors.text }}>{time}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={[styles.note, { color: colors.textSecondary }]}>Ảnh dùng để hỏi trợ lý AI chưa được đính kèm Booking. Bạn vẫn có thể đặt lịch không có ảnh.</Text>
            <TouchableOpacity accessibilityRole="button" onPress={submit}
              disabled={submitting || uncertainSubmission || !serviceId || !addressId || !description.trim()}
              style={[styles.action, { backgroundColor: submitting || uncertainSubmission ? colors.border : colors.primary }]}>
              <Text style={[styles.actionText, { color: '#FFFFFF' }]}>
                {submitting ? 'Đang gửi yêu cầu...' : uncertainSubmission ? 'Chờ xác minh yêu cầu' : 'Tạo yêu cầu đặt thợ'}
              </Text>
            </TouchableOpacity>
            {uncertainSubmission && <Text style={{ color: colors.error }}>Không gửi lại yêu cầu này vì phản hồi mạng chưa xác định. Hãy liên hệ hỗ trợ để kiểm tra trước khi đặt lần nữa.</Text>}
          </>
        )}
        {!!createdBookingId && (
          <View style={[styles.section, { backgroundColor: colors.surface }]}>
            <Text style={[styles.sectionTitle, { color: colors.success }]}>Đã tạo yêu cầu đặt thợ.</Text>
            <Text selectable style={{ color: colors.text }}>Mã Booking: {createdBookingId}</Text>
            <Text style={[styles.note, { color: colors.textSecondary }]}>Yêu cầu đã được lưu. Hãy chọn đúng hai kỹ thuật viên phù hợp để gửi lời mời theo thứ tự ưu tiên.</Text>
            {action('Chọn hai kỹ thuật viên', () => navigation.navigate('CustomerMatching', { bookingId: createdBookingId }))}
          </View>
        )}
        {action('Quay lại', () => navigation.goBack())}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { padding: 18, paddingBottom: 40, gap: 12 },
  title: { fontSize: 23, fontWeight: '700', marginVertical: 8 },
  section: { padding: 14, borderRadius: 12, gap: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginTop: 12 },
  note: { lineHeight: 21, fontSize: 13 },
  option: { padding: 13, borderWidth: 1, borderRadius: 12, gap: 5 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderRadius: 9 },
  input: { minHeight: 94, padding: 12, borderWidth: 1, borderRadius: 12, textAlignVertical: 'top' },
  action: { padding: 15, marginTop: 7, borderRadius: 12, alignItems: 'center' },
  actionText: { fontWeight: '700', fontSize: 15 },
});