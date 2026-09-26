import React, { useCallback, useRef, useState } from 'react';
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
import {
  useFocusEffect,
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppTheme } from '../../constants/theme';
import { bookingsApi } from '../../api/bookings.api';
import { servicesApi, type ServiceItem } from '../../api/services.api';
import {
  addressReadyForBooking,
  bookingCreateErrorStatus,
  classifyBookingCreatePostError,
  findCreatedBookingEvidence,
  type BookingCreationAttempt,
} from './customer-booking-create';

import {
  resolveServicePrice,
  serviceDetailTarget,
} from './service-catalog';
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

function definitiveCreateMessage(status?: number): string {
  if (status === 401) {
    return 'Phiên đăng nhập không hợp lệ nên Backend chưa tạo yêu cầu. Hãy đăng nhập lại rồi chủ động gửi lại.';
  }
  if (status === 403) {
    return 'Backend đã từ chối trước khi tạo yêu cầu. Hãy kiểm tra quyền hoặc trạng thái tài khoản trước khi thử lại.';
  }
  if (status === 404) {
    return 'Dịch vụ hoặc địa chỉ đã lưu không còn hợp lệ. Hãy tải lại và chọn dữ liệu hiện có trước khi thử lại.';
  }
  return 'Backend đã từ chối dữ liệu trước khi tạo yêu cầu. Hãy sửa thông tin rồi chủ động gửi lại.';
}

export default function CustomerBookingCreateScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<CreateRoute>();
  const { colors } = useAppTheme();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const userRole = useAuthStore((state) => state.user?.role);
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const prefill = route.params?.prefill;
  const prefillServiceId = prefill?.serviceId;
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
  const [uncertainAttempt, setUncertainAttempt] = useState<BookingCreationAttempt | null>(null);
  const [createdBooking, setCreatedBooking] = useState<{ ownerUserId: string; id: string } | null>(null);
  const [reconciling, setReconciling] = useState(false);
  const submittingRef = useRef(false);
  const loadGenerationRef = useRef(0);

  const loadOptions = useCallback(async () => {
    const generation = ++loadGenerationRef.current;
    const ownerUserId = userId;
    const isCurrentLoad = () =>
      loadGenerationRef.current === generation &&
      useAuthStore.getState().user?.id === ownerUserId &&
      useAuthStore.getState().user?.role === UserRole.CUSTOMER;

    if (!isAuthenticated || userRole !== UserRole.CUSTOMER || !ownerUserId) {
      if (loadGenerationRef.current === generation) setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError('');
    try {
      const [catalog, saved] = await Promise.all([
        servicesApi.getServices({ pageSize: 100 }),
        usersApi.getAddresses(),
      ]);
      if (!isCurrentLoad()) return;

      const activeServices = catalog.data.filter((service) => service.isActive);
      const wantedId = serviceDetailTarget(prefillServiceId);
      if (wantedId && !activeServices.some((service) => service.id === wantedId)) {
        try {
          const single = await servicesApi.getServiceById(wantedId);
          if (
            isCurrentLoad() &&
            single &&
            single.id === wantedId &&
            single.isActive !== false
          ) {
            activeServices.push(single);
          }
        } catch {
          // Keep the prefill unselected when the authoritative service GET fails.
        }
      }
      if (!isCurrentLoad()) return;

      setServices(activeServices);
      setAddresses(saved);
      setServiceId((existing) => {
        if (activeServices.some((service) => service.id === existing)) return existing;
        return activeServices.find((service) => service.id === prefillServiceId)?.id ?? '';
      });
      setAddressId((existing) => {
        if (saved.some((address) => address.id === existing)) return existing;
        return saved.find((address) => address.isDefault)?.id ?? saved[0]?.id ?? '';
      });
    } catch {
      if (!isCurrentLoad()) return;
      setLoadError('Không tải được dịch vụ hoặc địa chỉ đã lưu. Hãy thử lại khi có kết nối.');
    } finally {
      if (isCurrentLoad()) setLoading(false);
    }
  }, [isAuthenticated, prefillServiceId, userId, userRole]);

  useFocusEffect(
    useCallback(() => {
      void loadOptions();
      return () => {
        loadGenerationRef.current += 1;
      };
    }, [loadOptions]),
  );

  const visibleCreatedBookingId =
    createdBooking?.ownerUserId === userId ? createdBooking.id : null;
  const visibleUncertainAttempt =
    uncertainAttempt?.ownerUserId === userId ? uncertainAttempt : null;
  const selectedService =
    services.find((service) => service.id === serviceId) ?? null;
  const selectedAddress =
    addresses.find((address) => address.id === addressId) ?? null;
  const selectedAddressReady = addressReadyForBooking(selectedAddress);
  const selectedPrice = resolveServicePrice(selectedService);
  const submitDisabled =
    submitting ||
    Boolean(visibleUncertainAttempt) ||
    !selectedService ||
    !selectedAddress ||
    !selectedAddressReady ||
    !description.trim();

  const openAddressEditor = () => {
    const rootNavigation = navigation as unknown as {
      navigate: (name: 'CustomerMain', params: { screen: 'Profile' }) => void;
    };
    rootNavigation.navigate('CustomerMain', { screen: 'Profile' });
  };

  const submit = async () => {
    if (
      submittingRef.current ||
      visibleCreatedBookingId ||
      visibleUncertainAttempt ||
      loading ||
      loadError
    ) {
      return;
    }
    if (!isAuthenticated || userRole !== UserRole.CUSTOMER || !userId) {
      Alert.alert(
        'Cần tài khoản khách hàng',
        'Hãy đăng nhập bằng tài khoản khách hàng trước khi đặt thợ.',
      );
      return;
    }

    let fields: ReturnType<typeof validateBookingFields>;
    let window: ReturnType<typeof buildBookingWindow>;
    try {
      fields = validateBookingFields({
        serviceId,
        addressId,
        description,
        quantity: 1,
      });
      if (
        !services.some((service) => service.id === fields.serviceId) ||
        !addresses.some((address) => address.id === fields.addressId)
      ) {
        throw new Error(
          'Vui lòng chọn dịch vụ và địa chỉ thực tế từ danh sách đã tải.',
        );
      }
      if (!selectedAddressReady) {
        throw new Error(
          'Địa chỉ này chưa có vị trí hợp lệ. Hãy cập nhật địa chỉ trong Hồ sơ trước khi đặt lịch.',
        );
      }
      window = buildBookingWindow({ dayOffset, time: startTime });
    } catch (error) {
      Alert.alert(
        'Thông tin chưa hợp lệ',
        error instanceof Error
          ? error.message
          : 'Kiểm tra lại thông tin đặt lịch.',
      );
      return;
    }

    const ownerUserId = userId;
    submittingRef.current = true;
    setSubmitting(true);
    let baselineIds: string[] | null = null;

    try {
      try {
        const before = await bookingsApi.getMyBookingsPage(1, 100);
        if (useAuthStore.getState().user?.id !== ownerUserId) return;
        baselineIds = before.data.map((booking) => booking.id);
      } catch {
        // Baseline is best-effort. If POST later becomes ambiguous, no
        // baseline means GET reconciliation cannot auto-confirm creation.
      }

      if (useAuthStore.getState().user?.id !== ownerUserId) return;

      const attempt: BookingCreationAttempt = {
        ownerUserId,
        serviceId: fields.serviceId,
        addressId: fields.addressId,
        description: fields.description,
        preferredStartAt: window.preferredStartAt,
        preferredEndAt: window.preferredEndAt,
        baselineIds,
      };

      try {
        // AI preview photos are local data URIs, NOT private Booking upload IDs.
        const booking = await bookingsApi.createBooking({
          ...fields,
          ...window,
          urgency: 'NORMAL',
        });
        if (!booking.id) {
          throw new Error('Backend chưa xác nhận mã Booking.');
        }
        if (useAuthStore.getState().user?.id !== ownerUserId) return;
        setCreatedBooking({ ownerUserId, id: booking.id });
      } catch (error) {
        if (useAuthStore.getState().user?.id !== ownerUserId) return;

        if (classifyBookingCreatePostError(error) === 'definitive') {
          Alert.alert(
            'Yêu cầu chưa được tạo',
            definitiveCreateMessage(bookingCreateErrorStatus(error)),
          );
          return;
        }

        setUncertainAttempt(attempt);
        Alert.alert(
          'Chưa xác minh được kết quả',
          'POST có thể đã được Backend ghi nhận. Không gửi lại. Hãy dùng kiểm tra lịch sử bên dưới để đối chiếu bằng GET.',
        );
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const reconcileUncertainCreate = async () => {
    const attempt = visibleUncertainAttempt;
    if (!attempt || reconciling) return;

    setReconciling(true);
    try {
      const history = await bookingsApi.getMyBookingsPage(1, 100);
      if (useAuthStore.getState().user?.id !== attempt.ownerUserId) return;

      const found = findCreatedBookingEvidence(attempt, history.data);
      if (found) {
        setCreatedBooking({
          ownerUserId: attempt.ownerUserId,
          id: found.id,
        });
        setUncertainAttempt(null);
        Alert.alert(
          'Đã xác minh yêu cầu',
          'Lịch sử của chính tài khoản này có một Booking mới khớp chính xác. Không cần gửi POST lại.',
        );
        return;
      }

      Alert.alert(
        'Chưa có bằng chứng đủ chắc chắn',
        attempt.baselineIds
          ? 'GET lịch sử chưa cho thấy duy nhất một Booking mới khớp yêu cầu. Giữ nguyên khóa và không gửi lại POST.'
          : 'Không có mốc lịch sử trước khi gửi nên không thể tự xác nhận an toàn. Giữ nguyên khóa và không gửi lại POST.',
      );
    } catch {
      if (useAuthStore.getState().user?.id !== attempt.ownerUserId) return;
      Alert.alert(
        'Không kiểm tra được lịch sử',
        'GET lịch sử thất bại. Giữ nguyên khóa và không gửi lại POST.',
      );
    } finally {
      setReconciling(false);
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
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => {
                void loadOptions();
              }}
              style={[styles.action, { backgroundColor: colors.primary }]}
            >
              <Text style={[styles.actionText, { color: '#FFFFFF' }]}>Tải lại</Text>
            </TouchableOpacity>
          </View>
        )}
        {!loading && !loadError && !visibleCreatedBookingId && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Dịch vụ</Text>
            {services.length === 0 && (
              <Text style={{ color: colors.textSecondary }}>
                Chưa có dịch vụ khả dụng. Vui lòng thử lại sau.
              </Text>
            )}
            {services.map((service) => (
              <TouchableOpacity
                key={service.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: serviceId === service.id }}
                style={[
                  styles.option,
                  {
                    borderColor: serviceId === service.id ? colors.primary : colors.border,
                    backgroundColor: colors.surface,
                  },
                ]}
                onPress={() => setServiceId(service.id)}
              >
                <Text style={{ color: colors.text }}>
                  {service.name}
                  {serviceId === service.id ? ' ✓' : ''}
                </Text>
              </TouchableOpacity>
            ))}

            {!!selectedService && (
              <View style={[styles.section, { backgroundColor: colors.surface }]}>
                <Text style={{ color: colors.text, fontWeight: '700' }}>
                  {selectedService.pricingMode === 'fixed_price'
                    ? `Giá cố định: ${selectedPrice.text}`
                    : selectedService.pricingMode === 'inspection_required'
                      ? `Cần khảo sát/báo giá: ${selectedPrice.text}`
                      : selectedPrice.text}
                </Text>
                <Text style={[styles.note, { color: colors.textSecondary }]}>
                  Số lượng đặt hiện tại: 1. Thanh toán và bảo hành được xử lý ở các bước riêng theo
                  trạng thái thực tế của đơn.
                </Text>
              </View>
            )}

            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Địa chỉ sửa chữa đã lưu
            </Text>
            {addresses.length === 0 && (
              <View style={styles.section}>
                <Text style={{ color: colors.textSecondary }}>
                  Chưa có địa chỉ. Hãy thêm địa chỉ có vị trí bản đồ trong Hồ sơ trước khi đặt lịch.
                </Text>
                {action('Mở Hồ sơ để thêm địa chỉ', openAddressEditor)}
              </View>
            )}
            {addresses.map((address) => {
              const ready = addressReadyForBooking(address);
              return (
                <TouchableOpacity
                  key={address.id}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: addressId === address.id }}
                  style={[
                    styles.option,
                    {
                      borderColor: addressId === address.id ? colors.primary : colors.border,
                      backgroundColor: colors.surface,
                    },
                  ]}
                  onPress={() => setAddressId(address.id)}
                >
                  <Text style={{ color: colors.text }}>
                    {address.label || 'Địa chỉ'}
                    {addressId === address.id ? ' ✓' : ''}
                  </Text>
                  <Text style={{ color: colors.textSecondary }}>
                    {[address.line1, address.ward, address.district, address.province]
                      .filter(Boolean)
                      .join(', ')}
                  </Text>
                  <Text style={{ color: ready ? colors.success : colors.error }}>
                    {ready ? 'Đã có vị trí GPS để đặt lịch' : 'Cần cập nhật vị trí GPS'}
                  </Text>
                </TouchableOpacity>
              );
            })}
            {!!selectedAddress && !selectedAddressReady && (
              <View style={styles.section}>
                <Text style={{ color: colors.error }}>
                  Địa chỉ đang chọn chưa có tọa độ hợp lệ nên Backend sẽ không thể tạo Booking an
                  toàn.
                </Text>
                {action('Cập nhật địa chỉ trong Hồ sơ', openAddressEditor)}
              </View>
            )}

            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Mô tả sự cố (bắt buộc)
            </Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              multiline
              maxLength={5000}
              placeholder="Mô tả thiết bị và vấn đề cần sửa"
              placeholderTextColor={colors.textSecondary}
              style={[
                styles.input,
                {
                  color: colors.text,
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                },
              ]}
            />

            <Text style={[styles.sectionTitle, { color: colors.text }]}>Ngày sửa chữa</Text>
            <View style={styles.choices}>
              {DATE_OFFSETS.map((offset) => (
                <TouchableOpacity
                  key={offset}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: dayOffset === offset }}
                  onPress={() => setDayOffset(offset)}
                  style={[
                    styles.chip,
                    {
                      borderColor: dayOffset === offset ? colors.primary : colors.border,
                      backgroundColor: colors.surface,
                    },
                  ]}
                >
                  <Text style={{ color: colors.text }}>{dateLabel(offset)}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Giờ bắt đầu · khung đến dự kiến 2 giờ
            </Text>
            <View style={styles.choices}>
              {START_TIMES.map((time) => (
                <TouchableOpacity
                  key={time}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: startTime === time }}
                  onPress={() => setStartTime(time)}
                  style={[
                    styles.chip,
                    {
                      borderColor: startTime === time ? colors.primary : colors.border,
                      backgroundColor: colors.surface,
                    },
                  ]}
                >
                  <Text style={{ color: colors.text }}>{time}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.note, { color: colors.textSecondary }]}>
              Ảnh dùng để hỏi trợ lý AI chưa được đính kèm Booking. Bạn vẫn có thể đặt lịch không
              có ảnh.
            </Text>

            <TouchableOpacity
              accessibilityRole="button"
              onPress={submit}
              disabled={submitDisabled}
              style={[
                styles.action,
                { backgroundColor: submitDisabled ? colors.border : colors.primary },
              ]}
            >
              <Text
                style={[
                  styles.actionText,
                  { color: submitDisabled ? colors.textSecondary : '#FFFFFF' },
                ]}
              >
                {submitting
                  ? 'Đang gửi yêu cầu...'
                  : visibleUncertainAttempt
                    ? 'Chờ xác minh yêu cầu'
                    : 'Tạo yêu cầu đặt thợ'}
              </Text>
            </TouchableOpacity>

            {!!visibleUncertainAttempt && (
              <View style={[styles.section, { backgroundColor: colors.surface }]}>
                <Text style={{ color: colors.error, fontWeight: '700' }}>
                  Kết quả lần gửi vừa rồi chưa xác định.
                </Text>
                <Text style={[styles.note, { color: colors.textSecondary }]}>
                  Không gửi POST lại. Chỉ kiểm tra lịch sử của chính tài khoản này bằng GET để tìm
                  một Booking mới khớp chính xác.
                </Text>
                {action(
                  reconciling ? 'Đang kiểm tra lịch sử...' : 'Kiểm tra lịch sử bằng GET',
                  () => {
                    void reconcileUncertainCreate();
                  },
                  reconciling,
                )}
              </View>
            )}
          </>
        )}

        {!!visibleCreatedBookingId && (
          <View style={[styles.section, { backgroundColor: colors.surface }]}>
            <Text style={[styles.sectionTitle, { color: colors.success }]}>
              Đã xác minh yêu cầu đặt thợ.
            </Text>
            <Text selectable style={{ color: colors.text }}>
              Mã Booking: {visibleCreatedBookingId}
            </Text>
            <Text style={[styles.note, { color: colors.textSecondary }]}>
              Booking đã được Backend xác nhận hoặc được đối chiếu bằng lịch sử của chính tài khoản.
              Bước tiếp theo là chọn 1 hoặc 2 kỹ thuật viên theo thứ tự ưu tiên.
            </Text>
            {action('Chọn kỹ thuật viên', () =>
              navigation.navigate('CustomerMatching', {
                bookingId: visibleCreatedBookingId,
              }),
            )}
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