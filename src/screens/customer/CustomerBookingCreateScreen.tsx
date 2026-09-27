import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import {
  BottomSheetModal,
  BottomSheetBackdrop,
  BottomSheetFlatList,
  BottomSheetTextInput,
} from '@gorhom/bottom-sheet';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import {
  useFocusEffect,
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppTheme } from '../../constants/theme';
import { bookingsApi } from '../../api/bookings.api';
import { servicesApi, type ServiceItem, type CategoryItem } from '../../api/services.api';
import CategoryPills from '../../components/CategoryPills';
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
  const [pickerQuery, setPickerQuery] = useState('');
  const [pickerCategoryId, setPickerCategoryId] = useState<string | null>(null);
  const [pickerCategories, setPickerCategories] = useState<CategoryItem[]>([]);
  const pickerSheetRef = useRef<BottomSheetModal>(null);
  const pickerSnapPoints = useMemo(() => ['80%'], []);

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

  const openPicker = () => {
    if (pickerCategories.length === 0) {
      void servicesApi
        .getCategories()
        .then(setPickerCategories)
        .catch(() => {
          // No pills, name search inside the picker still works.
        });
    }
    pickerSheetRef.current?.present();
  };

  const autoOpenedPickerRef = useRef(false);
  useEffect(() => {
    if (autoOpenedPickerRef.current) return;
    if (loading || loadError || selectedService || services.length === 0) return;
    autoOpenedPickerRef.current = true;
    openPicker();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, loadError, selectedService, services]);


  const pickerServices = services.filter((service) => {
    if (pickerCategoryId && service.categoryId !== pickerCategoryId) return false;
    const q = pickerQuery.trim().toLowerCase();
    return q === '' || service.name.toLowerCase().includes(q);
  });

  const openAddressEditor = () => {
    const rootNavigation = navigation as unknown as {
      navigate: (name: 'CustomerMain', params: { screen: 'Profile' }) => void;
    };
    rootNavigation.navigate('CustomerMain', { screen: 'Profile' });
  };

  const submit = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
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
      <Text style={[styles.actionText, { color: disabled ? colors.textSecondary : colors.surface }]}>{label}</Text>
    </TouchableOpacity>
  );

  const backBtn = (
    <TouchableOpacity
      onPress={() => navigation.goBack()}
      style={styles.backBtn}
      accessibilityRole="button"
      accessibilityLabel="Quay lại"
      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
    >
      <Ionicons name="arrow-back" size={24} color={colors.text} />
    </TouchableOpacity>
  );

  if (!isAuthenticated || userRole !== UserRole.CUSTOMER) {
    return (
      <SafeAreaView style={[styles.page, { backgroundColor: colors.background }]}>
        {backBtn}
        <Text style={[styles.title, { color: colors.text }]}>Đăng nhập bằng tài khoản khách hàng để đặt thợ.</Text>
        {action('Đăng nhập', () => navigation.navigate('Auth'))}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.page, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {backBtn}
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
              <Text style={[styles.actionText, { color: colors.surface }]}>Tải lại</Text>
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

            {!!selectedService ? (
              <TouchableOpacity
                accessibilityRole="button"
                style={[styles.option, { borderColor: colors.primary, backgroundColor: colors.surface }]}
                onPress={openPicker}
              >
                <Text style={{ color: colors.text, fontWeight: '700' }}>{selectedService.name}</Text>
                <Text style={{ color: colors.primary }}>Đổi dịch vụ</Text>
              </TouchableOpacity>
            ) : services.length > 0 ? (
              <TouchableOpacity
                accessibilityRole="button"
                style={[styles.option, { borderColor: colors.border, backgroundColor: colors.surface }]}
                onPress={openPicker}
              >
                <Text style={{ color: colors.textSecondary }}>Chọn dịch vụ...</Text>
              </TouchableOpacity>
            ) : null}

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
                  onPress={() => {
                    Haptics.selectionAsync();
                    setAddressId(address.id);
                  }}
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
                  onPress={() => {
                    Haptics.selectionAsync();
                    setDayOffset(offset);
                  }}
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
                  onPress={() => {
                    Haptics.selectionAsync();
                    setStartTime(time);
                  }}
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
                  { color: submitDisabled ? colors.textSecondary : colors.surface },
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
      </ScrollView>

      <BottomSheetModal
        ref={pickerSheetRef}
        snapPoints={pickerSnapPoints}
        backdropComponent={(props) => (
          <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.5} />
        )}
      >
        <View style={[styles.pickerHeader, { borderBottomColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 0 }]}>Chọn dịch vụ</Text>
          {pickerCategories.length > 0 && (
            <CategoryPills
              categories={pickerCategories}
              selectedId={pickerCategoryId}
              onSelect={setPickerCategoryId}
            />
          )}
          <BottomSheetTextInput
            value={pickerQuery}
            onChangeText={setPickerQuery}
            placeholder="Tìm dịch vụ..."
            placeholderTextColor={colors.textSecondary}
            style={[
              styles.input,
              { minHeight: 44, color: colors.text, borderColor: colors.border, backgroundColor: colors.background },
            ]}
          />
        </View>
        <BottomSheetFlatList
          data={pickerServices}
          keyExtractor={(service) => service.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.pickerListContent}
          renderItem={({ item: service }) => (
            <TouchableOpacity
              accessibilityRole="radio"
              accessibilityState={{ checked: serviceId === service.id }}
              style={[
                styles.option,
                {
                  borderColor: serviceId === service.id ? colors.primary : colors.border,
                  backgroundColor: colors.surface,
                },
              ]}
              onPress={() => {
                Haptics.selectionAsync();
                setServiceId(service.id);
                pickerSheetRef.current?.dismiss();
              }}
            >
              <Text style={{ color: colors.text }}>
                {service.name}
                {serviceId === service.id ? ' ✓' : ''}
              </Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <Text style={{ color: colors.textSecondary, padding: 14 }}>Không tìm thấy dịch vụ phù hợp.</Text>
          }
        />
      </BottomSheetModal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { padding: 18, paddingBottom: 40, gap: 12 },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
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
  pickerHeader: { paddingHorizontal: 18, paddingBottom: 10, borderBottomWidth: 1, gap: 8 },
  pickerListContent: { padding: 18, paddingTop: 10, gap: 10 },
});