import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
import { CircleAlert } from 'lucide-react-native';
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
  isOtherService,
  resolveServicePrice,
  serviceDetailTarget,
} from './service-catalog';
import { usersApi, type AddressData } from '../../api/users.api';
import { useAuthStore } from '../../store';
import { UserRole, type RootStackParamList } from '../../types';
import { BOOKING_START_TIMES } from '../../utils/booking-window';
import BookingSchedulePicker from '../../components/BookingSchedulePicker';
import BookingReviewSheet, { BookingReviewSummary } from '../../components/BookingReviewSheet';
import {
  buildBookingReviewSnapshot,
  type BookingReviewSnapshot,
} from './customer-booking-review';
import { vnTodayCalendarDate } from '../../utils/vn-time';

type CreateRoute = RouteProp<RootStackParamList, 'CustomerBookingCreate'>;
type UncertainBookingCreate = {
  attempt: BookingCreationAttempt;
  snapshot: BookingReviewSnapshot;
};
type CustomerCreateState =
  | ({ kind: 'in-flight' } & UncertainBookingCreate)
  | ({ kind: 'uncertain' } & UncertainBookingCreate)
  | { kind: 'created'; id: string; snapshot: BookingReviewSnapshot };

function definitiveCreateMessage(status?: number): string {
  if (status === 401) {
    return 'Phiên đăng nhập không hợp lệ nên hệ thống chưa tạo yêu cầu. Hãy đăng nhập lại rồi chủ động gửi lại.';
  }
  if (status === 403) {
    return 'Hệ thống đã từ chối trước khi tạo yêu cầu. Hãy kiểm tra quyền hoặc trạng thái tài khoản trước khi thử lại.';
  }
  if (status === 404) {
    return 'Dịch vụ hoặc địa chỉ đã lưu không còn hợp lệ. Hãy tải lại và chọn dữ liệu hiện có trước khi thử lại.';
  }
  return 'Hệ thống đã từ chối dữ liệu trước khi tạo yêu cầu. Hãy sửa thông tin rồi chủ động gửi lại.';
}

function isCurrentAuthenticatedCustomer(ownerUserId: string): boolean {
  const auth = useAuthStore.getState();
  return (
    auth.isAuthenticated &&
    auth.user?.id === ownerUserId &&
    auth.user?.role === UserRole.CUSTOMER
  );
}

export default function CustomerBookingCreateScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<CreateRoute>();
  const { colors } = useAppTheme();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const userRole = useAuthStore((state) => state.user?.role);
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const customerOwnerId =
    isAuthenticated && userRole === UserRole.CUSTOMER ? userId : null;
  const prefill = route.params?.prefill;
  const prefillServiceId = prefill?.serviceId;
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [addresses, setAddresses] = useState<AddressData[]>([]);
  const [serviceId, setServiceId] = useState('');
  const [addressId, setAddressId] = useState('');
  const [description, setDescription] = useState(prefill?.description ?? '');
  const [bookingDate, setBookingDate] = useState(() => {
    return vnTodayCalendarDate();
  });
  const [startTime, setStartTime] = useState<(typeof BOOKING_START_TIMES)[number]>('09:00');
  const [descriptionTouched, setDescriptionTouched] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [submittingByOwner, setSubmittingByOwner] = useState<Record<string, boolean>>({});
  const submittingOwnersRef = useRef(new Set<string>());
  const [createStateByOwner, setCreateStateByOwner] = useState<
    Record<string, CustomerCreateState>
  >({});
  const createStateByOwnerRef = useRef<Record<string, CustomerCreateState>>({});
  const [reviewSnapshot, setReviewSnapshot] = useState<BookingReviewSnapshot | null>(null);
  const [reconcilingByOwner, setReconcilingByOwner] = useState<Record<string, boolean>>({});
  const previousOwnerRef = useRef(customerOwnerId);
  const loadGenerationRef = useRef(0);
  const [pickerQuery, setPickerQuery] = useState('');
  const [pickerCategoryId, setPickerCategoryId] = useState<string | null>(null);
  const [pickerCategories, setPickerCategories] = useState<CategoryItem[]>([]);
  const pickerSheetRef = useRef<BottomSheetModal>(null);
  const pickerSnapPoints = useMemo(() => ['80%'], []);
  const addressSheetRef = useRef<BottomSheetModal>(null);
  const addressSnapPoints = useMemo(() => ['60%'], []);
  const reviewSheetRef = useRef<BottomSheetModal>(null);
  const descriptionInputRef = useRef<TextInput>(null);
  const descriptionTopRef = useRef(0);
  const scrollRef = useRef<ScrollView>(null);

  const setOwnerCreateState = useCallback(
    (ownerId: string, nextState: CustomerCreateState | null) => {
      const next = { ...createStateByOwnerRef.current };
      if (nextState) next[ownerId] = nextState;
      else delete next[ownerId];
      createStateByOwnerRef.current = next;
      setCreateStateByOwner(next);
    },
    [],
  );

  const setOwnerSubmitting = useCallback((ownerId: string, isSubmitting: boolean) => {
    const next = new Set(submittingOwnersRef.current);
    if (isSubmitting) next.add(ownerId);
    else next.delete(ownerId);
    submittingOwnersRef.current = next;
    setSubmittingByOwner((current) => ({
      ...current,
      [ownerId]: isSubmitting,
    }));
  }, []);

  const setOwnerReconciling = useCallback((ownerId: string, isReconciling: boolean) => {
    setReconcilingByOwner((current) => ({
      ...current,
      [ownerId]: isReconciling,
    }));
  }, []);

  useLayoutEffect(() => {
    if (previousOwnerRef.current === customerOwnerId) return;
    previousOwnerRef.current = customerOwnerId;
    reviewSheetRef.current?.dismiss();
    setReviewSnapshot(null);
    setServices([]);
    setAddresses([]);
    setServiceId('');
    setAddressId('');
    setDescription('');
    setDescriptionTouched(false);
    setBookingDate(() => {
      return vnTodayCalendarDate();
    });
    setStartTime('09:00');
    setLoadError('');
    setLoading(Boolean(customerOwnerId));
  }, [customerOwnerId]);

  const loadOptions = useCallback(async () => {
    const generation = ++loadGenerationRef.current;
    const ownerUserId = userId;
    const isCurrentLoad = () =>
      loadGenerationRef.current === generation &&
      Boolean(ownerUserId && isCurrentAuthenticatedCustomer(ownerUserId));

    if (!isAuthenticated || userRole !== UserRole.CUSTOMER || !ownerUserId) {
      if (loadGenerationRef.current === generation) setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError('');
    // Independent calls: a transient failure in one (flaky network) must not
    // block the other — the customer can still book with whichever loaded,
    // and only sees the blocking error when both fail.
    const [catalogResult, savedResult] = await Promise.allSettled([
      servicesApi.getServices({ pageSize: 100 }),
      usersApi.getAddresses(),
    ]);
    if (!isCurrentLoad()) return;
    if (catalogResult.status === 'rejected' && savedResult.status === 'rejected') {
      setLoadError('Không tải được dịch vụ hoặc địa chỉ đã lưu. Hãy thử lại khi có kết nối.');
      setLoading(false);
      return;
    }
    try {
      const catalog = catalogResult.status === 'fulfilled' ? catalogResult.value : { data: [] };
      const saved = savedResult.status === 'fulfilled' ? savedResult.value : [];

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

  const visibleReviewSnapshot =
    reviewSnapshot?.ownerUserId === customerOwnerId ? reviewSnapshot : null;
  useEffect(() => {
    if (visibleReviewSnapshot) reviewSheetRef.current?.present();
  }, [visibleReviewSnapshot]);

  const currentOwnerCreateState = customerOwnerId
    ? createStateByOwner[customerOwnerId] ?? null
    : null;
  const isSubmitting = customerOwnerId
    ? submittingByOwner[customerOwnerId] === true
    : false;
  const isReconciling = customerOwnerId
    ? reconcilingByOwner[customerOwnerId] === true
    : false;
  const visibleCreatedBooking =
    currentOwnerCreateState?.kind === 'created'
      ? {
          ownerUserId: customerOwnerId,
          id: currentOwnerCreateState.id,
          snapshot: currentOwnerCreateState.snapshot,
        }
      : null;
  const visibleCreatedBookingId = visibleCreatedBooking?.id ?? null;
  const visibleUncertainAttempt =
    currentOwnerCreateState?.kind === 'uncertain' ? currentOwnerCreateState : null;
  const selectedService =
    services.find((service) => service.id === serviceId) ?? null;
  const selectedAddress =
    addresses.find((address) => address.id === addressId) ?? null;
  const selectedAddressReady = addressReadyForBooking(selectedAddress);
  const selectedPrice = resolveServicePrice(selectedService);
  const selectedIsOtherService = isOtherService(selectedService);
  const descriptionLabel = selectedIsOtherService
    ? 'Mô tả yêu cầu (bắt buộc)'
    : 'Mô tả sự cố (bắt buộc)';
  const descriptionPlaceholder = selectedIsOtherService
    ? 'Ví dụ: Cửa tủ bếp bung bản lề, cần người đến kiểm tra và sửa'
    : 'Mô tả thiết bị và vấn đề cần sửa';
  const reviewDisabled =
    isSubmitting ||
    Boolean(currentOwnerCreateState) ||
    loading ||
    Boolean(loadError);
  const descriptionError =
    descriptionTouched && !description.trim()
      ? selectedIsOtherService
        ? 'Vui lòng mô tả công việc bạn cần hỗ trợ để tiếp tục.'
        : 'Vui lòng mô tả sự cố để tiếp tục.'
      : '';

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

  const openAddressSheet = () => {
    addressSheetRef.current?.present();
  };

  const requestReview = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (reviewDisabled || (customerOwnerId && submittingOwnersRef.current.has(customerOwnerId))) return;
    setDescriptionTouched(true);
    if (!description.trim()) {
      scrollRef.current?.scrollTo({ y: descriptionTopRef.current, animated: true });
      descriptionInputRef.current?.focus();
      return;
    }
    if (!isAuthenticated || userRole !== UserRole.CUSTOMER || !userId) {
      Alert.alert(
        'Cần tài khoản khách hàng',
        'Hãy đăng nhập bằng tài khoản khách hàng trước khi đặt lịch.',
      );
      return;
    }
    if (!selectedService || !selectedAddress) {
      Alert.alert('Thông tin chưa hợp lệ', 'Vui lòng chọn dịch vụ và địa chỉ sửa chữa.');
      return;
    }

    try {
      if (
        !services.some((service) => service.id === selectedService.id && service.isActive) ||
        !addresses.some(
          (address) => address.id === selectedAddress.id && address.userId === userId,
        )
      ) {
        throw new Error('Vui lòng chọn dịch vụ và địa chỉ thực tế từ danh sách đã tải.');
      }
      const snapshot = buildBookingReviewSnapshot({
        ownerUserId: userId,
        service: selectedService,
        address: selectedAddress,
        description,
        date: bookingDate,
        time: startTime,
        aiSessionId: prefill?.aiSessionId ?? null,
      });
      setReviewSnapshot(snapshot);
    } catch (error) {
      Alert.alert(
        'Thông tin chưa hợp lệ',
        error instanceof Error ? error.message : 'Kiểm tra lại thông tin đặt lịch.',
      );
    }
  };

  const submit = async (snapshot: BookingReviewSnapshot) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const ownerUserId = snapshot.ownerUserId;
    if (
      submittingOwnersRef.current.has(ownerUserId) ||
      createStateByOwnerRef.current[ownerUserId] ||
      loading ||
      loadError ||
      snapshot.ownerUserId !== customerOwnerId
    ) {
      return;
    }
    if (!isAuthenticated || userRole !== UserRole.CUSTOMER || !userId) {
      Alert.alert(
        'Cần tài khoản khách hàng',
        'Hãy đăng nhập bằng tài khoản khách hàng trước khi đặt lịch.',
      );
      return;
    }
    if (
      !services.some((service) => service.id === snapshot.request.serviceId && service.isActive) ||
      !addresses.some(
        (address) =>
          address.id === snapshot.request.addressId &&
          address.userId === snapshot.ownerUserId &&
          addressReadyForBooking(address),
      )
    ) {
      Alert.alert(
        'Thông tin chưa hợp lệ',
        'Dịch vụ hoặc địa chỉ đã chọn không còn khả dụng. Hãy chỉnh sửa yêu cầu rồi kiểm tra lại.',
      );
      return;
    }

    setOwnerSubmitting(ownerUserId, true);
    let baselineIds: string[] | null = null;

    try {
      try {
        const before = await bookingsApi.getMyBookingsPage(1, 100);
        if (!isCurrentAuthenticatedCustomer(ownerUserId)) return;
        baselineIds = before.data.map((booking) => booking.id);
      } catch {
        // Baseline is best-effort. If POST later becomes ambiguous, no
        // baseline means GET reconciliation cannot auto-confirm creation.
      }

      if (!isCurrentAuthenticatedCustomer(ownerUserId)) return;

      const request = snapshot.request;
      const attempt: BookingCreationAttempt = {
        ownerUserId,
        serviceId: request.serviceId,
        addressId: request.addressId,
        description: request.description,
        preferredStartAt: request.preferredStartAt,
        preferredEndAt: request.preferredEndAt,
        baselineIds,
      };

      setOwnerCreateState(ownerUserId, { kind: 'in-flight', attempt, snapshot });
      try {
        // AI preview photos are local data URIs, NOT private Booking upload IDs.
        const booking = await bookingsApi.createBooking(request);
        if (!booking.id) {
          throw new Error('Hệ thống chưa xác nhận mã yêu cầu.');
        }
        setOwnerCreateState(ownerUserId, { kind: 'created', id: booking.id, snapshot });
      } catch (error) {
        if (classifyBookingCreatePostError(error) === 'definitive') {
          setOwnerCreateState(ownerUserId, null);
          if (isCurrentAuthenticatedCustomer(ownerUserId)) {
            Alert.alert(
              'Yêu cầu chưa được tạo',
              definitiveCreateMessage(bookingCreateErrorStatus(error)),
            );
          }
          return;
        }

        setOwnerCreateState(ownerUserId, { kind: 'uncertain', attempt, snapshot });
        if (isCurrentAuthenticatedCustomer(ownerUserId)) {
          reviewSheetRef.current?.dismiss();
          Alert.alert(
            'Chưa xác minh được kết quả',
            'Yêu cầu có thể đã được hệ thống ghi nhận. Không gửi lại. Hãy dùng kiểm tra lịch sử bên dưới để đối chiếu.',
          );
        }
      }
    } finally {
      setOwnerSubmitting(ownerUserId, false);
    }
  };

  const reconcileUncertainCreate = async () => {
    const uncertainCreate = visibleUncertainAttempt;
    if (!uncertainCreate || isReconciling) return;
    const { attempt } = uncertainCreate;

    setOwnerReconciling(attempt.ownerUserId, true);
    try {
      const history = await bookingsApi.getMyBookingsPage(1, 100);
      const found = findCreatedBookingEvidence(attempt, history.data);
      if (found) {
        setOwnerCreateState(attempt.ownerUserId, {
          kind: 'created',
          id: found.id,
          snapshot: uncertainCreate.snapshot,
        });
        if (isCurrentAuthenticatedCustomer(attempt.ownerUserId)) {
          Alert.alert(
            'Đã xác minh yêu cầu',
            'Lịch sử của chính tài khoản này có một yêu cầu mới khớp chính xác. Không cần gửi lại.',
          );
        }
        return;
      }

      if (isCurrentAuthenticatedCustomer(attempt.ownerUserId)) {
        Alert.alert(
          'Chưa có bằng chứng đủ chắc chắn',
          attempt.baselineIds
            ? 'Lịch sử chưa cho thấy duy nhất một yêu cầu mới khớp. Giữ nguyên khóa và không gửi lại.'
            : 'Không có mốc lịch sử trước khi gửi nên không thể tự xác nhận an toàn. Giữ nguyên khóa và không gửi lại.',
        );
      }
    } catch {
      if (isCurrentAuthenticatedCustomer(attempt.ownerUserId)) {
        Alert.alert(
          'Không kiểm tra được lịch sử',
          'Kiểm tra lịch sử thất bại. Giữ nguyên khóa và không gửi lại.',
        );
      }
    } finally {
      setOwnerReconciling(attempt.ownerUserId, false);
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
        <Text style={[styles.title, { color: colors.text }]}>Đăng nhập bằng tài khoản khách hàng để đặt lịch.</Text>
        {action('Đăng nhập', () => navigation.navigate('Auth'))}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.page, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
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
                  {selectedIsOtherService
                    ? 'Yêu cầu ngoài danh sách — kỹ thuật viên sẽ khảo sát và báo giá'
                    : selectedService.pricingMode === 'fixed_price'
                    ? `Giá cố định: ${selectedPrice.text}`
                    : selectedService.pricingMode === 'inspection_required'
                      ? `Cần khảo sát/báo giá: ${selectedPrice.text}`
                      : selectedPrice.text}
                </Text>
                <Text style={[styles.note, { color: colors.textSecondary }]}>
                  {selectedIsOtherService
                    ? 'Mô tả càng rõ thiết bị hoặc công việc cần hỗ trợ thì kỹ thuật viên càng dễ đánh giá trước khi nhận yêu cầu.'
                    : 'Số lượng đặt hiện tại: 1. Thanh toán và bảo hành được xử lý ở các bước riêng theo trạng thái thực tế của đơn.'}
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
            {!!selectedAddress ? (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Đổi địa chỉ sửa chữa"
                style={[styles.option, { borderColor: colors.primary, backgroundColor: colors.surface }]}
                onPress={openAddressSheet}
              >
                <Text style={{ color: colors.text, fontWeight: '700' }}>
                  {selectedAddress.label || 'Địa chỉ'}
                </Text>
                <Text style={{ color: colors.textSecondary }}>
                  {[selectedAddress.line1, selectedAddress.ward, selectedAddress.district, selectedAddress.province]
                    .filter(Boolean)
                    .join(', ')}
                </Text>
                <Text style={{ color: selectedAddressReady ? colors.success : colors.error }}>
                  {selectedAddressReady ? 'Đã có vị trí GPS để đặt lịch' : 'Cần cập nhật vị trí GPS'}
                </Text>
                <Text style={{ color: colors.primary }}>Đổi địa chỉ</Text>
              </TouchableOpacity>
            ) : addresses.length > 0 ? (
              <TouchableOpacity
                accessibilityRole="button"
                style={[styles.option, { borderColor: colors.border, backgroundColor: colors.surface }]}
                onPress={openAddressSheet}
              >
                <Text style={{ color: colors.textSecondary }}>Chọn địa chỉ...</Text>
              </TouchableOpacity>
            ) : null}
            {!!selectedAddress && !selectedAddressReady && (
              <View style={styles.section}>
                <Text style={{ color: colors.error }}>
                  Địa chỉ đang chọn chưa có tọa độ hợp lệ nên hệ thống không thể tạo yêu cầu an
                  toàn.
                </Text>
                {action('Cập nhật địa chỉ trong Hồ sơ', openAddressEditor)}
              </View>
            )}

            <View
              onLayout={(event) => {
                descriptionTopRef.current = event.nativeEvent.layout.y;
              }}
            >
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                {descriptionLabel}
              </Text>
              <TextInput
                ref={descriptionInputRef}
                accessibilityLabel={selectedIsOtherService ? 'Mô tả yêu cầu' : 'Mô tả sự cố'}
                accessibilityHint={descriptionPlaceholder}
                value={description}
                onChangeText={setDescription}
                onBlur={() => setDescriptionTouched(true)}
                multiline
                maxLength={5000}
                placeholder={descriptionPlaceholder}
                placeholderTextColor={colors.textSecondary}
                style={[
                  styles.input,
                  {
                    color: colors.text,
                    borderColor: descriptionError ? colors.error : colors.border,
                    backgroundColor: colors.surface,
                  },
                ]}
              />
              {!!descriptionError && (
                <View style={styles.fieldError}>
                  <CircleAlert color={colors.error} size={16} />
                  <Text
                    accessibilityLiveRegion="polite"
                    style={[styles.fieldErrorText, { color: colors.error }]}
                  >
                    {descriptionError}
                  </Text>
                </View>
              )}
            </View>

            <Text style={[styles.sectionTitle, { color: colors.text }]}>Ngày hẹn kỹ thuật viên tại nhà</Text>
            <BookingSchedulePicker
              colors={colors}
              date={bookingDate}
              time={startTime}
              onDateChange={setBookingDate}
              onTimeChange={setStartTime}
            />

            <Text style={[styles.note, { color: colors.textSecondary }]}>
              Ảnh dùng để hỏi trợ lý AI chưa được đính kèm yêu cầu. Bạn vẫn có thể đặt lịch không
              có ảnh.
            </Text>

            <TouchableOpacity
              accessibilityRole="button"
              onPress={requestReview}
              disabled={reviewDisabled}
              style={[
                styles.action,
                { backgroundColor: reviewDisabled ? colors.border : colors.primary },
              ]}
            >
              <Text
                style={[
                  styles.actionText,
                  { color: reviewDisabled ? colors.textSecondary : colors.surface },
                ]}
              >
                {isSubmitting
                  ? 'Đang gửi yêu cầu...'
                  : visibleUncertainAttempt
                    ? 'Chờ xác minh yêu cầu'
                    : 'Xem lại yêu cầu'}
              </Text>
            </TouchableOpacity>

            {!!visibleUncertainAttempt && (
              <View style={[styles.section, { backgroundColor: colors.surface }]}>
                <Text style={{ color: colors.error, fontWeight: '700' }}>
                  Kết quả lần gửi vừa rồi chưa xác định.
                </Text>
                <Text style={[styles.note, { color: colors.textSecondary }]}>
                  Không gửi lại. Chỉ kiểm tra lịch sử của chính tài khoản này để tìm
                  một yêu cầu mới khớp chính xác.
                </Text>
                <TouchableOpacity
                  accessibilityRole="button"
                  disabled={isReconciling}
                  onPress={() => {
                    void reconcileUncertainCreate();
                  }}
                  style={[
                    styles.action,
                    {
                      backgroundColor: isReconciling ? colors.border : colors.primary,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.actionText,
                      {
                        color: isReconciling ? colors.textSecondary : colors.surface,
                      },
                    ]}
                  >
                    {isReconciling ? 'Đang kiểm tra lịch sử...' : 'Kiểm tra lịch sử'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}

        {!!visibleCreatedBookingId && (
          <View style={[styles.section, { backgroundColor: colors.surface }]}>
            <Text style={[styles.sectionTitle, { color: colors.success }]}>
              Yêu cầu đặt lịch đã được xác nhận.
            </Text>
            <Text selectable style={{ color: colors.text }}>
              Mã tham chiếu: {visibleCreatedBookingId.slice(0, 8)}
            </Text>
            <Text style={[styles.note, { color: colors.textSecondary }]}>
              Yêu cầu đã được hệ thống xác nhận hoặc được đối chiếu bằng lịch sử của chính tài khoản.
              Bước tiếp theo là chọn 1 hoặc 2 kỹ thuật viên theo thứ tự ưu tiên.
            </Text>
            {visibleCreatedBooking && (
              <BookingReviewSummary snapshot={visibleCreatedBooking.snapshot} colors={colors} />
            )}
            {action('Chọn kỹ thuật viên', () =>
              navigation.navigate('CustomerMatching', {
                bookingId: visibleCreatedBookingId,
              }),
            )}
            {action('Về trang chủ', () => navigation.navigate('CustomerMain'))}
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

      <BottomSheetModal
        ref={addressSheetRef}
        snapPoints={addressSnapPoints}
        backdropComponent={(props) => (
          <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.5} />
        )}
      >
        <View style={[styles.pickerHeader, { borderBottomColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 0 }]}>Chọn địa chỉ sửa chữa</Text>
        </View>
        <BottomSheetFlatList
          data={addresses}
          keyExtractor={(address) => address.id}
          contentContainerStyle={styles.pickerListContent}
          renderItem={({ item: address }) => {
            const ready = addressReadyForBooking(address);
            return (
              <TouchableOpacity
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
                  addressSheetRef.current?.dismiss();
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
          }}
          ListEmptyComponent={
            <Text style={{ color: colors.textSecondary, padding: 14 }}>Chưa có địa chỉ đã lưu.</Text>
          }
        />
      </BottomSheetModal>

      <BookingReviewSheet
        sheetRef={reviewSheetRef}
        snapshot={visibleReviewSnapshot}
        colors={colors}
        confirmDisabled={isSubmitting}
        confirmLabel={isSubmitting ? 'Đang gửi yêu cầu...' : 'Xác nhận đặt lịch'}
        onConfirm={() => {
          if (!visibleReviewSnapshot) return;
          const reviewedRequest = visibleReviewSnapshot;
          reviewSheetRef.current?.dismiss();
          setReviewSnapshot(null);
          void submit(reviewedRequest);
        }}
        onEdit={() => {
          reviewSheetRef.current?.dismiss();
          setReviewSnapshot(null);
        }}
        onDismiss={() => setReviewSnapshot(null)}
      />
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
  input: { minHeight: 94, padding: 12, borderWidth: 1, borderRadius: 12, textAlignVertical: 'top' },
  fieldError: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 7 },
  fieldErrorText: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: '500' },
  action: { padding: 15, marginTop: 7, borderRadius: 12, alignItems: 'center' },
  actionText: { fontWeight: '700', fontSize: 15 },
  pickerHeader: { paddingHorizontal: 18, paddingBottom: 10, borderBottomWidth: 1, gap: 8 },
  pickerListContent: { padding: 18, paddingTop: 10, gap: 10 },
});
