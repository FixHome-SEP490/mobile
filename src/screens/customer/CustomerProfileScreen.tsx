import React, { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo } from 'react';
import ReputationCard from '../../components/ReputationCard';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Alert,
  Switch,
  Image,
  RefreshControl,
  ActivityIndicator,
  Platform,
  StatusBar,
} from 'react-native';
import {
  BottomSheetModal,
  BottomSheetBackdrop,
  BottomSheetView,
  BottomSheetScrollView,
  BottomSheetTextInput,
} from '@gorhom/bottom-sheet';

import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import MapView, { Marker } from '../../components/AddressMap';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../types';
import { useAuthStore } from '../../store';
import { authApi } from '../../api/auth.api';
import { useScrollHideTabBar } from '../../hooks/useScrollHideTabBar';
import { usersApi, type AddressData, type CreateAddressRequest } from '../../api/users.api';
import CustomerAdministrativeAreaPicker from './CustomerAdministrativeAreaPicker';
import { canonicalCustomerAddressArea } from './customer-administrative-area';
import { confirmedCustomerAddressWrite, customerProfileAddressWrites } from './customer-address-write';
import { mediaApi } from '../../api/media.api';
import { geoApi, type PlaceSuggestion } from '../../api/geo.api';
import { useAppTheme } from '../../constants/theme';
import { extractApiErrorMessage } from '../../utils/input-validation';
import { persistCustomerAvatar } from './customer-avatar-upload';
import { avatarErrorMessage, withPersistedAvatar } from '../../services/avatar-upload';
import AccountLogoutAction from '../../components/account/AccountLogoutAction';
import {
  addressPinAfterManualEdit,
  confirmExactPin,
  isCurrentAddressAsyncResult,
  isValidCoordinates,
  makeCandidatePin,
  makePendingPin,
  resolveAddressSaveLocation,
  resolveReverseLookup,
  type AddressAsyncContext,
  type ExactPinCoordinates,
  type ExactPinState,
} from './customer-exact-pin';

export default function CustomerProfileScreen() {
  const { user, sessionGeneration, setAuth, logout } = useAuthStore();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const handleScroll = useScrollHideTabBar();
  const { colors, isDark } = useAppTheme();
  const isDarkMode = isDark;
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();

  // States for user info
  const [name, setName] = useState(user?.fullName || 'Khách hàng');
  // Chỉ email thật của tài khoản; thiếu thì để trống, không điền email mẫu.
  const [email] = useState(user?.email ?? '');
  const [phone, setPhone] = useState(user?.phoneNumber || '');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user?.avatarUrl || null);
  const [avatarBusyGeneration, setAvatarBusyGeneration] = useState<number | null>(null);
  const uploadingAvatar = avatarBusyGeneration === sessionGeneration;
  const logoutPendingRef = useRef(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState('');

  // State for theme


  // States for addresses & Loading
  const [addresses, setAddresses] = useState<AddressData[]>([]);
  const [loadingAddresses, setLoadingAddresses] = useState(true);
  const [addressLoadError, setAddressLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Modals visibility
  const [isAvatarModalVisible, setAvatarModalVisible] = useState(false);
  const profileSheetRef = useRef<BottomSheetModal>(null);
  const addressSheetRef = useRef<BottomSheetModal>(null);
  const addressSnapPoints = useMemo(() => ['90%'], []);

  const handlePickImage = async () => {
    if (uploadingAvatar) return;
    const session = useAuthStore.getState();
    if (!isProfileSessionCurrent(session.user?.id, session.sessionGeneration)) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]
      || !isProfileSessionCurrent(session.user?.id, session.sessionGeneration)) return;

    const asset = result.assets[0];
    setAvatarBusyGeneration(session.sessionGeneration);
    try {
      const persisted = await persistCustomerAvatar(
        {
          uri: asset.uri,
          fileName: asset.fileName,
          mimeType: asset.mimeType,
        },
        {
          uploadImage: mediaApi.uploadPublicImage,
          updateProfile: (payload) => {
            if (!isProfileSessionCurrent(session.user?.id, session.sessionGeneration)) {
              throw new Error('Profile session changed');
            }
            return usersApi.updateProfile(payload);
          },
        },
      );

      if (!isProfileSessionCurrent(session.user?.id, session.sessionGeneration)) return;
      setAvatarUrl(persisted.avatarUrl);
      const current = useAuthStore.getState();
      if (current.token && current.user) {
        setAuth(current.token, withPersistedAvatar(current.user, persisted));
      }
      Alert.alert('Đã cập nhật ảnh đại diện', 'Ảnh mới đã được lưu vào hồ sơ của bạn.');
    } catch (err: unknown) {
      if (!isProfileSessionCurrent(session.user?.id, session.sessionGeneration)) return;
      Alert.alert(
        'Không thể cập nhật ảnh đại diện',
        avatarErrorMessage(err),
      );
    } finally {
      if (isProfileSessionCurrent(session.user?.id, session.sessionGeneration)) setAvatarBusyGeneration(null);
    }
  };
  const [profileBusyGeneration, setProfileBusyGeneration] = useState<number | null>(null);
  const savingProfile = profileBusyGeneration === sessionGeneration;
  const [savingAddress, setSavingAddress] = useState(false);
  const addressWriteBusyRef = useRef(false);
  const [addressWriteUnverified, setAddressWriteUnverified] = useState(false);
  const [addressPickerVersion, setAddressPickerVersion] = useState(0);

  // Temp states for editing profile
  const [editName, setEditName] = useState(name);
  const [editPhone, setEditPhone] = useState(phone);
  const [focusedProfileField, setFocusedProfileField] = useState<'name' | 'phone' | null>(null);

  const hasProfileChanges = editName.trim() !== name.trim() || editPhone.trim() !== phone.trim();
  const isProfileSaveReady = editName.trim().length > 0 && hasProfileChanges;
  const canSaveProfile = isProfileSaveReady && !savingProfile;

  const [editAddressId, setEditAddressId] = useState<string | null>(null);
  const [addressName, setAddressName] = useState('');
  const [addressDetail, setAddressDetail] = useState('');
  const [addressWard, setAddressWard] = useState('');
  const [addressDistrict, setAddressDistrict] = useState('');
  const [addressProvince, setAddressProvince] = useState('');
  const [addressProvinceCode, setAddressProvinceCode] = useState<string | undefined>(undefined);
  const [addressDistrictCode, setAddressDistrictCode] = useState<string | undefined>(undefined);
  const [addressPin, setAddressPin] = useState<ExactPinState>({ status: 'none' });
  const [addressIsDefault, setAddressIsDefault] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [addressSuggestions, setAddressSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searchingAddress, setSearchingAddress] = useState(false);
  const [addressSearchMessage, setAddressSearchMessage] = useState<string | null>(null);
  const [addressPinMessage, setAddressPinMessage] = useState<string | null>(null);
  const [reverseGeocodingAddress, setReverseGeocodingAddress] = useState(false);
  const [addressReverseRetryAvailable, setAddressReverseRetryAvailable] = useState(false);
  const [mapCameraVersion, setMapCameraVersion] = useState(0);
  const [legacyAddress, setLegacyAddress] = useState<AddressData | null>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addressRequestIdRef = useRef(0);
  const addressSessionIdRef = useRef(0);
  const addressSheetOpenRef = useRef(false);
  const screenMountedRef = useRef(true);
  const isProfileSessionCurrent = useCallback((ownerUserId: string | undefined, generation: number) => {
    const current = useAuthStore.getState();
    return screenMountedRef.current && current.isAuthenticated && Boolean(ownerUserId)
      && current.user?.id === ownerUserId && current.sessionGeneration === generation;
  }, []);
  const ownerIdRef = useRef<string | null>(user?.id ?? null);
  const previousOwnerIdRef = useRef<string | null>(user?.id ?? null);

  useLayoutEffect(() => {
    ownerIdRef.current = user?.id ?? null;
  }, [user?.id]);

  const mapCoordinates = addressPin.status !== 'none' && isValidCoordinates(addressPin.coordinates)
    ? addressPin.coordinates
    : null;
  const addressSaveLocation = resolveAddressSaveLocation({
    isCreating: !editAddressId,
    addressText: addressDetail,
    province: addressProvince,
    district: addressDistrict,
    provinceCode: addressProvinceCode,
    districtCode: addressDistrictCode,
    pin: addressPin,
    legacyAddress: legacyAddress ?? undefined,
  });
  const hasUnverifiedAddressWrite = addressWriteUnverified || !!(user?.id && customerProfileAddressWrites.has(user.id));
  const canSaveAddress = Boolean(addressName.trim() && addressDetail.trim())
    && addressSaveLocation.kind !== 'blocked'
    && !savingAddress && !reverseGeocodingAddress && !hasUnverifiedAddressWrite
    && user?.role === 'customer';

  const clearAddressDebounce = useCallback(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = null;
  }, []);

  const invalidateAddressRequests = useCallback(() => {
    clearAddressDebounce();
    addressRequestIdRef.current += 1;
    setSearchingAddress(false);
    setReverseGeocodingAddress(false);
    setGettingLocation(false);
    return addressRequestIdRef.current;
  }, [clearAddressDebounce, setSearchingAddress, setReverseGeocodingAddress, setGettingLocation]);

  const captureAddressRequest = useCallback((requestId: number): AddressAsyncContext => ({
    requestId,
    sessionId: addressSessionIdRef.current,
    ownerId: ownerIdRef.current,
    mounted: screenMountedRef.current && addressSheetOpenRef.current,
  }), []);

  const isAddressRequestCurrent = useCallback((request: AddressAsyncContext) =>
    isCurrentAddressAsyncResult(request, {
      requestId: addressRequestIdRef.current,
      sessionId: addressSessionIdRef.current,
      ownerId: ownerIdRef.current,
      mounted: screenMountedRef.current && addressSheetOpenRef.current,
    }), []);

  const resetAddressDraft = useCallback(() => {
    setAddressWriteUnverified(false);
    setAddressPickerVersion(version => version + 1);
    setLegacyAddress(null);
    setEditAddressId(null);
    setAddressName('');
    setAddressDetail('');
    setAddressWard('');
    setAddressDistrict('');
    setAddressProvince('');
    setAddressProvinceCode(undefined);
    setAddressDistrictCode(undefined);
    setAddressPin({ status: 'none' });
    setAddressIsDefault(false);
    setAddressSuggestions([]);
    setAddressSearchMessage(null);
    setAddressPinMessage(null);
    setAddressReverseRetryAvailable(false);
    setGettingLocation(false);
    setSearchingAddress(false);
    setReverseGeocodingAddress(false);
    setSavingAddress(false);
  }, [
    setAddressWriteUnverified,
    setAddressPickerVersion,
    setLegacyAddress,
    setEditAddressId,
    setAddressName,
    setAddressDetail,
    setAddressWard,
    setAddressDistrict,
    setAddressProvince,
    setAddressProvinceCode,
    setAddressDistrictCode,
    setAddressPin,
    setAddressIsDefault,
    setAddressSuggestions,
    setAddressSearchMessage,
    setAddressPinMessage,
    setAddressReverseRetryAvailable,
    setGettingLocation,
    setSearchingAddress,
    setReverseGeocodingAddress,
    setSavingAddress,
  ]);

  const finishAddressEditor = useCallback(() => {
    addressSheetOpenRef.current = false;
    addressSessionIdRef.current += 1;
    invalidateAddressRequests();
    resetAddressDraft();
  }, [invalidateAddressRequests, resetAddressDraft]);

  const handleAddressSheetAnimate = useCallback((_fromIndex: number, toIndex: number) => {
    if (toIndex === -1 && addressSheetOpenRef.current) finishAddressEditor();
  }, [finishAddressEditor]);

  const startNewAddressEditor = useCallback(() => {
    addressSessionIdRef.current += 1;
    invalidateAddressRequests();
    resetAddressDraft();
    addressSheetOpenRef.current = true;
    setMapCameraVersion((version) => version + 1);
    addressSheetRef.current?.present();
  }, [invalidateAddressRequests, resetAddressDraft, setMapCameraVersion]);

  useEffect(() => {
    screenMountedRef.current = true;
    return () => {
      screenMountedRef.current = false;
      addressSheetOpenRef.current = false;
      addressSessionIdRef.current += 1;
      addressRequestIdRef.current += 1;
      clearAddressDebounce();
    };
  }, [clearAddressDebounce]);

  useLayoutEffect(() => {
    const ownerId = user?.id ?? null;
    if (previousOwnerIdRef.current === ownerId) return;
    previousOwnerIdRef.current = ownerId;
    addressSheetOpenRef.current = false;
    addressSessionIdRef.current += 1;
    invalidateAddressRequests();
    resetAddressDraft();
    addressSheetRef.current?.dismiss();
  }, [user?.id, invalidateAddressRequests, resetAddressDraft]);

  const fetchProfileData = useCallback(async () => {
    const session = useAuthStore.getState();
    if (!isProfileSessionCurrent(session.user?.id, session.sessionGeneration)) return;
    try {
      const profile = await usersApi.getProfile();
      if (profile && profile.id === session.user?.id
        && isProfileSessionCurrent(session.user?.id, session.sessionGeneration)) {
        setName((previous) => profile.fullName || previous);
        setPhone((previous) => profile.phoneNumber || previous);
        setAvatarUrl((previous) => profile.avatarUrl || previous);
        const currentToken = useAuthStore.getState().token;
        if (currentToken) setAuth(currentToken, profile);
      }
    } catch {
      // Ignore
    }
  }, [isProfileSessionCurrent, setAuth]);

  const refreshAddresses = useCallback(async () => {
    const session = useAuthStore.getState();
    if (!isProfileSessionCurrent(session.user?.id, session.sessionGeneration)) return;
    setAddressLoadError(null);
    try {
      const list = await usersApi.getAddresses();
      if (!isProfileSessionCurrent(session.user?.id, session.sessionGeneration)) return;
      setAddresses(Array.isArray(list) ? list : []);
    } catch {
      if (isProfileSessionCurrent(session.user?.id, session.sessionGeneration)) {
        setAddressLoadError('Không thể tải địa chỉ đã lưu. Vui lòng thử lại.');
      }
    } finally {
      if (isProfileSessionCurrent(session.user?.id, session.sessionGeneration)) setLoadingAddresses(false);
    }
  }, [isProfileSessionCurrent]);

  useEffect(() => {
    let mounted = true;
    const session = useAuthStore.getState();
    const loadData = async () => {
      await fetchProfileData();
      if (!mounted || !isProfileSessionCurrent(session.user?.id, session.sessionGeneration)) return;
      await refreshAddresses();
    };
    if (mounted) {
      loadData();
    }
    return () => { mounted = false; };
  }, [fetchProfileData, refreshAddresses, isProfileSessionCurrent, user?.id]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchProfileData(), refreshAddresses()]);
    setRefreshing(false);
  };

  const handleSaveProfile = async () => {
    const session = useAuthStore.getState();
    if (!isProfileSessionCurrent(session.user?.id, session.sessionGeneration)) return;
    if (!editName.trim()) {
      Alert.alert('Lỗi', 'Vui lòng nhập họ và tên.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setProfileBusyGeneration(session.sessionGeneration);
    try {
      const payload = {
        fullName: editName.trim(),
        phoneNumber: editPhone.trim() || undefined,
      };

      const updated = await usersApi.updateProfile(payload);
      if (!isProfileSessionCurrent(session.user?.id, session.sessionGeneration)) return;

      setName(updated.fullName || editName.trim());
      setPhone(updated.phoneNumber || editPhone.trim());

      const current = useAuthStore.getState();
      if (current.token && current.user) {
        setAuth(current.token, {
          ...current.user,
          fullName: updated.fullName,
          phoneNumber: updated.phoneNumber,
          avatarUrl: avatarUrl || undefined,
        });
      }
      profileSheetRef.current?.dismiss();
      Alert.alert('Thành công', 'Cập nhật thông tin thành công!');
    } catch (err: unknown) {
      if (!isProfileSessionCurrent(session.user?.id, session.sessionGeneration)) return;
      Alert.alert('Lỗi', extractApiErrorMessage(err, 'Không thể cập nhật thông tin.'));
    } finally {
      if (isProfileSessionCurrent(session.user?.id, session.sessionGeneration)) setProfileBusyGeneration(null);
    }
  };

  const clearAddressArea = () => {
    setAddressWard('');
    setAddressDistrict('');
    setAddressProvince('');
    setAddressProvinceCode(undefined);
    setAddressDistrictCode(undefined);
  };

  const reverseAddressForPin = async (
    coordinates: ExactPinCoordinates,
    pin: ExactPinState,
    request: AddressAsyncContext,
  ) => {
    setReverseGeocodingAddress(true);
    try {
      const place = await geoApi.reverse(coordinates.lat, coordinates.lng);
      if (!isAddressRequestCurrent(request)) return;
      const decision = resolveReverseLookup(pin, coordinates, place);
      if (decision.kind !== 'resolved') return;

      setAddressDetail(place.formattedAddress || '');
      const area = canonicalCustomerAddressArea(place);
      setAddressWard(area.ward); setAddressDistrict(area.district); setAddressProvince(area.province);
      setAddressProvinceCode(area.provinceCode); setAddressDistrictCode(area.districtCode);
      const hasCompleteAddress = Boolean(
        place.formattedAddress?.trim() && area.province && area.district,
      );
      setAddressPinMessage(hasCompleteAddress
        ? 'Địa chỉ đã được tra cứu cho ghim bạn chọn. Hãy kiểm tra rồi xác nhận vị trí.'
        : 'Ghim vẫn được giữ. Xác nhận vị trí, nhập địa chỉ và chọn tỉnh/thành, phường/xã phía dưới.');
      setAddressReverseRetryAvailable(!hasCompleteAddress);
    } catch {
      if (!isAddressRequestCurrent(request)) return;
      const decision = resolveReverseLookup(pin, coordinates, null);
      if (decision.kind === 'failed') {
        setAddressPinMessage('Không thể tra cứu địa chỉ. Ghim vẫn được giữ; xác nhận vị trí rồi nhập địa chỉ và chọn khu vực phía dưới.');
        setAddressReverseRetryAvailable(true);
      }
    } finally {
      if (isAddressRequestCurrent(request)) setReverseGeocodingAddress(false);
    }
  };

  const handleSaveAddress = async () => {
    const session = useAuthStore.getState();
    if (addressWriteBusyRef.current || !addressSheetOpenRef.current || session.user?.role !== 'customer'
      || !isProfileSessionCurrent(session.user?.id, session.sessionGeneration)) return;
    if (editAddressId && legacyAddress?.userId !== session.user.id) return;
    if (customerProfileAddressWrites.has(session.user.id)) {
      setAddressWriteUnverified(true);
      setAddressPinMessage('Yêu cầu trước chưa được xác minh. Kiểm tra danh sách, không gửi lại.');
      return;
    }
    if (!addressName.trim() || !addressDetail.trim()) {
      Alert.alert('Chưa thể thêm địa chỉ', !addressName.trim() ? 'Vui lòng nhập tên gợi nhớ (ví dụ: Nhà riêng).' : 'Vui lòng nhập địa chỉ chi tiết.');
      return;
    }

    const decision = resolveAddressSaveLocation({
      isCreating: !editAddressId,
      addressText: addressDetail,
      province: addressProvince,
      district: addressDistrict,
      provinceCode: addressProvinceCode,
      districtCode: addressDistrictCode,
      pin: addressPin,
      legacyAddress: legacyAddress ?? undefined,
    });
    if (decision.kind === 'blocked') {
      const hint = decision.reason === 'administrative-area'
        ? 'Chọn tỉnh/thành và phường/xã phía trên để lưu vị trí.'
        : addressPin.status === 'candidate'
          ? 'Ghim đỏ chỉ là gợi ý. Chạm lên bản đồ đúng điểm cần sửa, rồi bấm “Xác nhận vị trí”.'
          : 'Hãy chọn vị trí chính xác trên bản đồ rồi xác nhận trước khi lưu.';
      setAddressPinMessage(hint);
      Alert.alert('Chưa thể thêm địa chỉ', hint);
      return;
    }

    const ownerId = session.user.id;
    const editorSession = addressSessionIdRef.current;
    const isCurrentSave = () => isProfileSessionCurrent(ownerId, session.sessionGeneration)
      && addressSessionIdRef.current === editorSession && useAuthStore.getState().user?.role === 'customer';
    addressWriteBusyRef.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSavingAddress(true);
    let acknowledged = false;
    try {
      const payload: Record<string, unknown> = {
        label: addressName.trim(),
        line1: addressDetail.trim(),
        isDefault: addressIsDefault,
      };

      if (decision.kind === 'confirmed') {
        Object.assign(payload, {
          ward: addressWard,
          district: addressDistrict,
          province: addressProvince,
          provinceCode: addressProvinceCode,
          districtCode: addressDistrictCode,
          lat: decision.coordinates.lat,
          lng: decision.coordinates.lng,
        });
      } else if (decision.kind === 'preserve-legacy') {
        Object.assign(payload, {
          ward: addressWard,
          district: addressDistrict,
          province: addressProvince,
          provinceCode: addressProvinceCode,
          districtCode: addressDistrictCode,
        });
        if (decision.coordinates) {
          payload.lat = decision.coordinates.lat;
          payload.lng = decision.coordinates.lng;
        } else {
          payload.lat = null;
          payload.lng = null;
        }
      } else if (decision.kind === 'candidate-text-only') {
        Object.assign(payload, {
          ward: addressWard,
          district: addressDistrict,
          province: addressProvince,
          provinceCode: addressProvinceCode,
          districtCode: addressDistrictCode,
          // The Backend DTO accepts null for its nullable coordinate columns.
          // Candidate coordinates are never sent as an exact saved pin.
          lat: null,
          lng: null,
        });
      } else {
        Object.assign(payload, {
          ward: null,
          // A manual edit has no verified pin. Backend accepts null for nullable coordinates.
          // Keep the existing required service-area fields because this API cannot clear them.
          lat: null,
          lng: null,
        });
      }

      const attempt = { ownerId, payload: payload as Partial<CreateAddressRequest>, baselineIds: addresses.map(row => row.id), knownId: editAddressId, posting: true };
      customerProfileAddressWrites.set(ownerId, attempt);
      const saved = editAddressId
        ? await usersApi.updateAddress(editAddressId, payload as Partial<CreateAddressRequest>)
        : await usersApi.createAddress(payload as unknown as CreateAddressRequest);
      acknowledged = true;
      attempt.posting = false;
      if (saved?.userId === ownerId && saved.id) attempt.knownId = saved.id;
      if (!isCurrentSave()) return;
      const rows = await usersApi.getAddresses();
      if (!isCurrentSave()) return;
      if (confirmedCustomerAddressWrite(attempt, rows)) {
        customerProfileAddressWrites.delete(ownerId);
        setAddresses(rows); setAddressWriteUnverified(false);
        addressSheetRef.current?.dismiss();
      } else {
        setAddressWriteUnverified(true);
        setAddressPinMessage('Chưa xác minh được địa chỉ đã lưu. Kiểm tra danh sách, không gửi lại.');
      }
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      const rejected = !acknowledged && typeof status === 'number' && [400, 401, 403, 404, 422].includes(status);
      const attempt = customerProfileAddressWrites.get(ownerId);
      if (attempt) attempt.posting = false;
      if (rejected) customerProfileAddressWrites.delete(ownerId);
      if (!isCurrentSave()) return;
      setAddressWriteUnverified(!rejected);
      const error = rejected ? extractApiErrorMessage(err, 'Không thể lưu địa chỉ. Kiểm tra thông tin và thử lại.')
        : 'Chưa rõ địa chỉ đã được lưu hay chưa. Kiểm tra danh sách, không gửi lại.';
      setAddressPinMessage(error);
      Alert.alert('Lỗi', error);
    } finally {
      addressWriteBusyRef.current = false;
      if (isCurrentSave()) setSavingAddress(false);
    }
  };

  const reconcileAddressWrite = async () => {
    const session = useAuthStore.getState();
    if (addressWriteBusyRef.current || session.user?.role !== 'customer' || !isProfileSessionCurrent(session.user?.id, session.sessionGeneration)) return;
    const ownerId = session.user.id;
    const attempt = customerProfileAddressWrites.get(ownerId);
    if (!attempt || attempt.posting) return;
    const editorSession = addressSessionIdRef.current;
    const isCurrent = () => isProfileSessionCurrent(ownerId, session.sessionGeneration)
      && addressSessionIdRef.current === editorSession && useAuthStore.getState().user?.role === 'customer'
      && customerProfileAddressWrites.get(ownerId) === attempt;
    addressWriteBusyRef.current = true; setSavingAddress(true);
    try {
      const rows = await usersApi.getAddresses();
      if (!isCurrent()) return;
      if (confirmedCustomerAddressWrite(attempt, rows)) {
        customerProfileAddressWrites.delete(ownerId);
        setAddresses(rows); setAddressWriteUnverified(false); addressSheetRef.current?.dismiss();
      } else setAddressPinMessage('Chưa thấy địa chỉ khớp trên máy chủ. Chưa gửi lại yêu cầu lưu.');
    } catch {
      if (isCurrent()) setAddressPinMessage('Không thể kiểm tra địa chỉ. Thử kiểm tra lại khi có kết nối.');
    } finally {
      addressWriteBusyRef.current = false;
      if (isProfileSessionCurrent(ownerId, session.sessionGeneration) && addressSessionIdRef.current === editorSession) setSavingAddress(false);
    }
  };

  const handleEditAddress = (addr: AddressData) => {
    setAddressPickerVersion(version => version + 1);
    Haptics.selectionAsync();
    addressSessionIdRef.current += 1;
    invalidateAddressRequests();
    setLegacyAddress(addr);
    setEditAddressId(addr.id);
    setAddressName(addr.label);
    setAddressDetail(addr.line1);
    setAddressWard(addr.ward || '');
    setAddressDistrict(addr.district || '');
    setAddressProvince(addr.province || '');
    setAddressProvinceCode(addr.provinceCode);
    setAddressDistrictCode(addr.districtCode);
    setAddressPin(addressPinAfterManualEdit(addr.line1, addr, { status: 'none' }));
    setAddressIsDefault(addr.isDefault);
    setAddressSuggestions([]);
    setAddressSearchMessage(null);
    setAddressPinMessage(isValidCoordinates({ lat: addr.lat, lng: addr.lng })
      ? 'Ghim đã lưu được giữ nguyên khi địa chỉ không đổi.'
      : 'Địa chỉ này chưa có ghim hợp lệ. Chưa có vị trí nào được chọn.');
    setMapCameraVersion((version) => version + 1);
  };

  const handleAddressSearchChange = (text: string) => {
    const addressChanged = text !== addressDetail;
    const previousCoordinates = mapCoordinates;
    const requestId = invalidateAddressRequests();
    setAddressDetail(text);
    setAddressSearchMessage(null);

    if (addressPin.status === 'confirmed') {
      // The user confirmed the coordinates; correcting street text does not move them.
      setAddressSuggestions([]);
      return;
    }

    if (addressChanged) {
      const nextPin = addressPinAfterManualEdit(text, legacyAddress, addressPin);
      setAddressPin(nextPin);
      setAddressSuggestions([]);
      setAddressReverseRetryAvailable(false);
      if (nextPin.status === 'legacy' && legacyAddress) {
        setAddressWard(legacyAddress.ward || '');
        setAddressDistrict(legacyAddress.district || '');
        setAddressProvince(legacyAddress.province || '');
        setAddressProvinceCode(legacyAddress.provinceCode);
        setAddressDistrictCode(legacyAddress.districtCode);
        setAddressPinMessage('Đang dùng vị trí đã lưu cho địa chỉ gốc.');
      } else {
        clearAddressArea();
        setAddressPinMessage(previousCoordinates
          ? 'Địa chỉ đã thay đổi nên ghim cũ bị bỏ. Hãy chọn lại vị trí chính xác trên bản đồ.'
          : null);
      }
      if (previousCoordinates) setMapCameraVersion((version) => version + 1);
    }

    const query = text.trim();
    if (query.length < 3) {
      setAddressSuggestions([]);
      return;
    }

    const request = captureAddressRequest(requestId);
    searchDebounceRef.current = setTimeout(async () => {
      searchDebounceRef.current = null;
      if (!isAddressRequestCurrent(request)) return;
      setSearchingAddress(true);
      try {
        const suggestions = await geoApi.autocomplete(query);
        if (!isAddressRequestCurrent(request)) return;
        setAddressSuggestions(suggestions);
        setAddressSearchMessage(suggestions.length === 0
          ? 'Không tìm thấy gợi ý. Bạn có thể sửa nội dung hoặc thử tìm lại.'
          : null);
      } catch {
        if (isAddressRequestCurrent(request)) {
          setAddressSuggestions([]);
          setAddressSearchMessage('Không thể tìm gợi ý địa chỉ. Hãy thử lại hoặc chọn vị trí trên bản đồ.');
        }
      } finally {
        if (isAddressRequestCurrent(request)) setSearchingAddress(false);
      }
    }, 350);
  };

  const handleSelectSuggestion = (suggestion: PlaceSuggestion) => {
    invalidateAddressRequests();
    setAddressSuggestions([]);
    setAddressSearchMessage(null);
    setAddressReverseRetryAvailable(false);
    setAddressDetail(suggestion.description);
    setAddressWard(suggestion.ward || '');
    setAddressDistrict(suggestion.district || '');
    setAddressProvince(suggestion.province || '');
    setAddressProvinceCode(undefined);
    setAddressDistrictCode(undefined);
    setAddressPin(makeCandidatePin({ lat: suggestion.lat, lng: suggestion.lng }));
    setAddressPinMessage('Gợi ý tìm kiếm chưa phải là ghim chính xác. Chạm đúng vị trí trên bản đồ rồi xác nhận.');
    setMapCameraVersion((version) => version + 1);
  };

  const handleGetLocation = async () => {
    if (Platform.OS === 'web') {
      setAddressPinMessage('Bản đồ trên trình duyệt không hỗ trợ chọn ghim. Hãy dùng ứng dụng di động để xác nhận vị trí.');
      return;
    }

    const requestId = invalidateAddressRequests();
    const request = captureAddressRequest(requestId);
    setGettingLocation(true);
    setAddressPinMessage(null);
    setAddressReverseRetryAvailable(false);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (!isAddressRequestCurrent(request)) return;
      if (status !== 'granted') {
        setAddressPinMessage('Quyền vị trí chưa được cấp. Bạn vẫn có thể tìm địa chỉ hoặc chọn điểm trên bản đồ.');
        return;
      }

      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      if (!isAddressRequestCurrent(request)) return;
      const coordinates = { lat: location.coords.latitude, lng: location.coords.longitude };
      const pin = makePendingPin(coordinates, 'gps');
      if (pin.status === 'none') {
        setAddressPinMessage('Không thể xác nhận tọa độ vị trí hiện tại. Hãy chọn điểm trên bản đồ.');
        return;
      }
    setAddressPin(pin);
    setAddressDetail('');
    clearAddressArea();
    setAddressSuggestions([]);
    setMapCameraVersion((version) => version + 1);
    setAddressReverseRetryAvailable(false);
      setAddressPinMessage('Đang tra cứu địa chỉ cho vị trí hiện tại. Bạn cần kiểm tra và xác nhận ghim trước khi lưu.');
      await reverseAddressForPin(coordinates, pin, request);
    } catch {
      if (isAddressRequestCurrent(request)) {
        setAddressPinMessage('Không thể lấy vị trí hiện tại. Bạn có thể thử lại hoặc chọn điểm trên bản đồ.');
      }
    } finally {
      if (isAddressRequestCurrent(request)) setGettingLocation(false);
    }
  };

  const handleMapPress = (event: { nativeEvent: { coordinate: { latitude: number; longitude: number } } }) => {
    const coordinates = {
      lat: event.nativeEvent.coordinate.latitude,
      lng: event.nativeEvent.coordinate.longitude,
    };
    const pin = makePendingPin(coordinates, 'map');
    if (pin.status === 'none') {
      setAddressPinMessage('Không thể dùng điểm này. Hãy chọn một tọa độ hợp lệ trên bản đồ.');
      return;
    }
    const requestId = invalidateAddressRequests();
    const request = captureAddressRequest(requestId);
    setAddressPin(pin);
    setAddressDetail('');
    clearAddressArea();
    setAddressSuggestions([]);
    setAddressSearchMessage(null);
    setAddressReverseRetryAvailable(false);
    setAddressPinMessage('Đang tra cứu địa chỉ cho ghim bạn chọn. Hãy kiểm tra rồi xác nhận vị trí.');
    void reverseAddressForPin(coordinates, pin, request);
  };

  const handleConfirmAddressPin = () => {
    const confirmed = confirmExactPin(addressPin);
    if (confirmed === addressPin || confirmed.status !== 'confirmed') return;
    setAddressPin(confirmed);
    setAddressPinMessage('Đã xác nhận ghim bạn chọn. Hãy kiểm tra địa chỉ trước khi lưu.');
  };

  const retryAddressReverse = () => {
    if (!mapCoordinates || (addressPin.status !== 'pending-confirmation' && addressPin.status !== 'confirmed')) return;
    const requestId = invalidateAddressRequests();
    const request = captureAddressRequest(requestId);
    setAddressPinMessage('Đang thử tra cứu lại địa chỉ cho ghim đã chọn.');
    void reverseAddressForPin(mapCoordinates, addressPin, request);
  };

  const cancelAddressEditor = () => {
    finishAddressEditor();
    addressSheetRef.current?.dismiss();
  };

  const handleSetDefaultAddress = async (id: string) => {
    if (addressWriteBusyRef.current) return;
    addressWriteBusyRef.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await usersApi.updateAddress(id, { isDefault: true });
      await refreshAddresses();
    } catch (err: unknown) {
      Alert.alert('Lỗi', extractApiErrorMessage(err, 'Không thể đặt làm địa chỉ mặc định.'));
    } finally {
      addressWriteBusyRef.current = false;
    }
  };

  const handleDeleteAddress = async (id: string) => {
    Alert.alert('Xác nhận xóa', 'Bạn có muốn xóa địa chỉ này?', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: async () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          try {
            await usersApi.deleteAddress(id);
            await refreshAddresses();
          } catch (err: unknown) {
            Alert.alert('Lỗi', extractApiErrorMessage(err, 'Không thể xóa địa chỉ.'));
          }
        },
      },
    ]);
  };

  const performLogout = async () => {
    if (logoutPendingRef.current) return;
    const session = useAuthStore.getState();
    if (!session.isAuthenticated || session.user?.id !== user?.id) return;
    logoutPendingRef.current = true;
    setLoggingOut(true);
    setLogoutError('');
    try {
      const operation = authApi.logout();
      // authApi synchronously advances the generation for this logout.
      const logoutGeneration = useAuthStore.getState().sessionGeneration;
      await operation;
      const current = useAuthStore.getState();
      if (current.user?.id === session.user?.id && current.sessionGeneration === logoutGeneration) logout();
    } catch {
      // authApi owns token removal; a storage failure must remain visible.
      setLogoutError('Không thể hoàn tất đăng xuất. Vui lòng thử lại.');
    } finally {
      logoutPendingRef.current = false;
      setLoggingOut(false);
    }
  };

  const handleLogout = () => {
    if (logoutPendingRef.current) return;
    if (Platform.OS === 'web') {
      // Alert.alert does not open on React Native Web.
      void performLogout();
      return;
    }
    Alert.alert('Đăng xuất', 'Bạn có chắc chắn muốn đăng xuất?', [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Đăng xuất', style: 'destructive', onPress: () => { void performLogout(); } },
    ]);
  };

  return (
    <SafeAreaView style={[styles.container, isDarkMode && styles.containerDark]} edges={['top', 'left', 'right']}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 96 + Math.max(insets.bottom, 16) }]}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
        }
      >
        {/* Main Wrapper từ UI v2 */}
        <View style={styles.mainWrapperCard}>
          <View style={styles.pageIntro}>
            <Text accessibilityRole="header" style={styles.pageTitle}>Tài khoản</Text>
          </View>

          {/* Avatar Section từ v2 */}
          <View style={styles.avatarSection}>
            <View style={[styles.avatarBorder, isDarkMode ? styles.avatarBorderDark : styles.avatarBorderLight]}>
              <TouchableOpacity onPress={() => avatarUrl && setAvatarModalVisible(true)} activeOpacity={0.8} style={styles.avatar} disabled={!avatarUrl} accessibilityRole="button" accessibilityLabel="Xem ảnh đại diện" accessibilityState={{ disabled: !avatarUrl }}>
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
                ) : (
                  <Text style={styles.avatarText}>{name.charAt(0)}</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.cameraIconBadge, uploadingAvatar && { opacity: 0.75 }]}
                onPress={handlePickImage}
                disabled={uploadingAvatar}
                activeOpacity={0.8}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={uploadingAvatar ? 'Đang tải ảnh đại diện' : 'Đổi ảnh đại diện'}
                accessibilityState={{ disabled: uploadingAvatar, busy: uploadingAvatar }}
              >
                 {uploadingAvatar ? (
                   <ActivityIndicator size="small" color={colors.surface} />
                 ) : (
                   <Ionicons name="camera" size={16} color={colors.surface} />
                 )}
              </TouchableOpacity>
            </View>
            <Text accessibilityRole="header" style={[styles.name, isDarkMode && styles.textDark]}>{name}</Text>
            <Text style={styles.phone}>{phone || 'Chưa cập nhật số điện thoại'}</Text>
            <TouchableOpacity
              style={styles.heroEditBtn}
              accessibilityRole="button"
              accessibilityLabel="Chỉnh sửa hồ sơ"
              activeOpacity={0.8}
              onPress={() => {
                setEditName(name);
                setEditPhone(phone);
                setFocusedProfileField(null);
                profileSheetRef.current?.present();
              }}
            >
              <Text style={styles.heroEditText}>Chỉnh sửa hồ sơ</Text>
            </TouchableOpacity>
          </View>

          <ReputationCard role="customer" />

          <Text style={[styles.sectionTitle, isDarkMode && styles.textDark]}>Quản lý tài khoản</Text>

          <View style={[styles.menuContainer, isDarkMode && styles.cardDark]}>
            <TouchableOpacity
              style={styles.menuItem}
              accessibilityRole="button"
              accessibilityLabel="Mở thông tin cá nhân"
              onPress={() => {
                setEditName(name);
                setEditPhone(phone);
                setFocusedProfileField(null);
                profileSheetRef.current?.present();
              }}
            >
              <View style={styles.menuIconTile}><Ionicons name="person-outline" size={20} color={colors.primaryStrong} /></View>
              <View style={styles.menuContent}>
                <Text style={[styles.menuTitle, isDarkMode && styles.textDark]}>Thông tin cá nhân</Text>
                <Text style={styles.menuDesc}>{[name, phone || email].filter(Boolean).join(' · ')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.muted} />
            </TouchableOpacity>
            <View style={styles.divider} />

            <TouchableOpacity style={styles.menuItem} onPress={startNewAddressEditor} accessibilityRole="button" accessibilityLabel="Quản lý địa chỉ sửa chữa">
              <View style={styles.menuIconTile}><Ionicons name="location-outline" size={20} color={colors.primaryStrong} /></View>
              <View style={styles.menuContent}>
                <Text style={[styles.menuTitle, isDarkMode && styles.textDark]}>Địa chỉ sửa chữa</Text>
                <Text style={styles.menuDesc}>
                  {loadingAddresses
                    ? 'Đang tải...'
                    : addressLoadError
                      ? 'Không thể tải địa chỉ. Hãy mở để thử lại.'
                      : `${addresses.length} địa chỉ đã lưu`}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.muted} />
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => navigation.navigate('CustomerSecurity')}
              accessibilityRole="button"
              accessibilityLabel="Mở bảo mật tài khoản"
            >
              <View style={styles.menuIconTile}><Ionicons name="shield-checkmark-outline" size={20} color={colors.primaryStrong} /></View>
              <View style={styles.menuContent}>
                <Text style={[styles.menuTitle, isDarkMode && styles.textDark]}>Bảo mật tài khoản</Text>
                <Text style={styles.menuDesc}>Đổi mật khẩu và quản lý phiên đăng nhập</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.muted} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.sectionTitle, isDarkMode && styles.textDark]}>Dịch vụ của tôi</Text>
          <View style={[styles.menuContainer, isDarkMode && styles.cardDark]}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => navigation.navigate('CustomerWarranties')}
              accessibilityRole="button"
              accessibilityLabel="Mở bảo hành"
            >
              <View style={styles.menuIconTile}><Ionicons name="shield-checkmark-outline" size={20} color={colors.primaryStrong} /></View>
              <View style={styles.menuContent}>
                <Text style={[styles.menuTitle, isDarkMode && styles.textDark]}>Bảo hành</Text>
                <Text style={styles.menuDesc}>Xem hạng mục bảo hành và yêu cầu hỗ trợ</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.muted} />
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => navigation.navigate('CustomerRepairHistory')}
              accessibilityRole="button"
              accessibilityLabel="Mở lịch sử sửa chữa"
            >
              <View style={styles.menuIconTile}><Ionicons name="time-outline" size={20} color={colors.primaryStrong} /></View>
              <View style={styles.menuContent}>
                <Text style={[styles.menuTitle, isDarkMode && styles.textDark]}>Lịch sử sửa chữa</Text>
                <Text style={styles.menuDesc}>Xem các đơn đã sửa chữa và hoàn tất</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.muted} />
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => navigation.navigate('CustomerWallet')}
              accessibilityRole="button"
              accessibilityLabel="Mở ví FixHome"
            >
              <View style={styles.menuIconTile}><Ionicons name="wallet-outline" size={20} color={colors.primaryStrong} /></View>
              <View style={styles.menuContent}>
                <Text style={[styles.menuTitle, isDarkMode && styles.textDark]}>Ví FixHome</Text>
                <Text style={styles.menuDesc}>Số dư và lịch sử giao dịch</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.muted} />
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => navigation.navigate('CustomerVouchers')}
              accessibilityRole="button"
              accessibilityLabel="Mở ưu đãi của tôi"
            >
              <View style={styles.menuIconTile}><Ionicons name="pricetag-outline" size={20} color={colors.primaryStrong} /></View>
              <View style={styles.menuContent}>
                <Text style={[styles.menuTitle, isDarkMode && styles.textDark]}>Ưu đãi của tôi</Text>
                <Text style={styles.menuDesc}>Lưu mã và xem voucher trong ví</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.muted} />
            </TouchableOpacity>
          </View>




          <View style={styles.logoutSpacer} />
          <AccountLogoutAction onPress={handleLogout} disabled={loggingOut} busy={loggingOut} error={logoutError} accessibilityLabel="Đăng xuất khỏi FixHome" />
        </View>
      </ScrollView>

      <Modal visible={isAvatarModalVisible} transparent={true} animationType="fade">
        <View style={styles.avatarModalContainer}>
          <TouchableOpacity
            style={styles.closeAvatarModalBtn}
            onPress={() => setAvatarModalVisible(false)}
            accessibilityRole="button"
            accessibilityLabel="Đóng"
          >
            <Ionicons name="close" size={30} color={colors.surface} />
          </TouchableOpacity>
          {avatarUrl && (
             <Image source={{ uri: avatarUrl }} style={styles.fullAvatarImage} resizeMode="contain" />
          )}
        </View>
      </Modal>

      {/* Profile Edit Sheet */}
      <BottomSheetModal
        ref={profileSheetRef}
        enableDynamicSizing
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        onDismiss={() => setFocusedProfileField(null)}
        backdropComponent={(props) => (
          <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.45} />
        )}
      >
        <BottomSheetView style={[styles.profileSheetContent, { backgroundColor: colors.surface }]}>
          <View style={styles.profileSheetHeader}>
            <View style={styles.profileHeaderCopy}>
              <Text style={[styles.profileSheetTitle, { color: colors.text }]}>Chỉnh sửa thông tin</Text>
              <Text style={[styles.profileSheetSubtitle, { color: colors.textSecondary }]}>
                Cập nhật thông tin cá nhân dùng cho tài khoản FixHome.
              </Text>
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Đóng chỉnh sửa thông tin"
              style={[styles.profileCloseButton, { backgroundColor: colors.background }]}
              onPress={() => profileSheetRef.current?.dismiss()}
              disabled={savingProfile}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.profileFieldGroup}>
            <Text style={[styles.profileFieldLabel, { color: colors.text }]}>Họ và tên</Text>
            <View
              style={[
                styles.profileInputShell,
                {
                  backgroundColor: colors.surface,
                  borderColor: focusedProfileField === 'name' ? colors.primary : colors.border,
                },
              ]}
            >
              <Ionicons name="person-outline" size={18} color={focusedProfileField === 'name' ? colors.primary : colors.textSecondary} />
              <BottomSheetTextInput
                style={[styles.profileInput, { color: colors.text }]}
                placeholder="Nhập họ và tên"
                placeholderTextColor={colors.muted}
                value={editName}
                onChangeText={setEditName}
                onFocus={() => setFocusedProfileField('name')}
                onBlur={() => setFocusedProfileField(null)}
                autoCapitalize="words"
                returnKeyType="next"
                accessibilityLabel="Họ và tên"
              />
            </View>
          </View>

          <View style={styles.profileFieldGroup}>
            <Text style={[styles.profileFieldLabel, { color: colors.text }]}>Số điện thoại</Text>
            <View
              style={[
                styles.profileInputShell,
                {
                  backgroundColor: colors.surface,
                  borderColor: focusedProfileField === 'phone' ? colors.primary : colors.border,
                },
              ]}
            >
              <Ionicons name="call-outline" size={18} color={focusedProfileField === 'phone' ? colors.primary : colors.textSecondary} />
              <BottomSheetTextInput
                style={[styles.profileInput, { color: colors.text }]}
                placeholder="Nhập số điện thoại"
                placeholderTextColor={colors.muted}
                value={editPhone}
                onChangeText={setEditPhone}
                onFocus={() => setFocusedProfileField('phone')}
                onBlur={() => setFocusedProfileField(null)}
                keyboardType="phone-pad"
                returnKeyType="done"
                accessibilityLabel="Số điện thoại"
              />
            </View>
          </View>

          <View style={styles.profileFieldGroup}>
            <Text style={[styles.profileFieldLabel, { color: colors.text }]}>Email</Text>
            <View
              style={[
                styles.profileInputShell,
                styles.profileReadonlyShell,
                { backgroundColor: colors.background, borderColor: colors.border },
              ]}
            >
              <Ionicons name="mail-outline" size={18} color={colors.muted} />
              <Text style={[styles.profileReadonlyValue, { color: colors.textSecondary }]} numberOfLines={1}>
                {email}
              </Text>
              <Ionicons name="lock-closed-outline" size={16} color={colors.muted} />
            </View>
            <View style={styles.profileHelperRow}>
              <Ionicons name="information-circle-outline" size={14} color={colors.muted} />
              <Text style={[styles.profileHelperText, { color: colors.textSecondary }]}>
                Email đăng nhập không thể thay đổi tại đây.
              </Text>
            </View>
          </View>

          <View style={styles.profileActions}>
            <TouchableOpacity
              accessibilityRole="button"
              style={[styles.profileCancelButton, { borderColor: colors.border, backgroundColor: colors.surface }]}
              onPress={() => profileSheetRef.current?.dismiss()}
              disabled={savingProfile}
            >
              <Text style={[styles.profileCancelText, { color: colors.textSecondary }]}>Hủy</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSaveProfile, busy: savingProfile }}
              style={[
                styles.profileSaveButton,
                { backgroundColor: isProfileSaveReady ? colors.primary : colors.border },
              ]}
              onPress={handleSaveProfile}
              disabled={!canSaveProfile}
            >
              {savingProfile ? (
                <>
                  <ActivityIndicator size="small" color={colors.surface} />
                  <Text style={styles.profileSaveText}>Đang lưu...</Text>
                </>
              ) : (
                <Text
                  style={[
                    styles.profileSaveText,
                    { color: isProfileSaveReady ? colors.surface : colors.muted },
                  ]}
                >
                  Lưu thay đổi
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </BottomSheetView>
      </BottomSheetModal>

      {/* Address Edit Sheet (Logic bản thường với Empty State tốt hơn) */}
      <BottomSheetModal
        ref={addressSheetRef}
        snapPoints={addressSnapPoints}
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        onAnimate={handleAddressSheetAnimate}
        onDismiss={finishAddressEditor}
        backdropComponent={(props) => (
          <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.5} />
        )}
      >
        <BottomSheetScrollView
          contentContainerStyle={[styles.modalContent, isDarkMode && styles.cardDark]}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[styles.modalTitle, isDarkMode && styles.textDark]}>Quản lý địa chỉ</Text>
          <View style={{ width: '100%', marginBottom: 16 }}>
            {loadingAddresses ? (
              <View style={styles.addressStateRow}>
                <ActivityIndicator
                  size="small"
                  color={colors.primary}
                  accessibilityLabel="Đang tải địa chỉ đã lưu"
                />
                <Text style={styles.addressStateText}>Đang tải địa chỉ đã lưu…</Text>
              </View>
            ) : addressLoadError ? (
              <View
                style={styles.addressErrorBox}
                accessibilityRole="alert"
              >
                <Text style={styles.addressErrorText}>{addressLoadError}</Text>
                <TouchableOpacity
                  onPress={() => void refreshAddresses()}
                  accessibilityRole="button"
                  accessibilityLabel="Thử tải lại địa chỉ đã lưu"
                  style={styles.addressRetryBtn}
                >
                  <Text style={styles.addressRetryText}>Thử lại</Text>
                </TouchableOpacity>
              </View>
            ) : addresses.length === 0 ? (
              <Text style={{ textAlign: 'center', color: colors.muted, marginVertical: 12 }}>
                Chưa có địa chỉ nào được lưu.
              </Text>
            ) : (
              addresses.map((addr) => (
                <View key={addr.id} style={[styles.addressItem, isDarkMode && styles.inputDark]}>
                  <View style={styles.addressTop}>
                    <View style={{ flex: 1 }}>
                      <View style={styles.addressNameRow}>
                        <Text style={[styles.addressName, isDarkMode && styles.textDark]}>{addr.label}</Text>
                        {addr.isDefault && (
                          <View style={styles.defaultBadge}>
                            <Ionicons name="checkmark-circle" size={12} color={colors.primary} />
                            <Text style={styles.defaultBadgeText}>Mặc định</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.addressDetail}>{addr.line1}</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => handleEditAddress(addr)}
                      style={styles.iconBtn}
                      accessibilityRole="button"
                      accessibilityLabel={`Sửa địa chỉ ${addr.label}`}
                    >
                      <Ionicons name="pencil" size={18} color={colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDeleteAddress(addr.id)}
                      style={styles.iconBtn}
                      accessibilityRole="button"
                      accessibilityLabel={`Xoá địa chỉ ${addr.label}`}
                    >
                      <Ionicons name="trash" size={18} color={colors.error} />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.addressFooter}>
                    {isValidCoordinates({ lat: addr.lat, lng: addr.lng }) ? (
                      <View style={styles.addressPinRow}>
                        <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                        <Text style={styles.addressPinStatus}>Đã có ghim chính xác</Text>
                      </View>
                    ) : (
                      <View style={styles.addressPinRow}>
                        <Ionicons name="alert-circle-outline" size={16} color={colors.textSecondary} />
                        <Text style={styles.addressPinStatus}>Chưa có ghim hợp lệ</Text>
                      </View>
                    )}
                    {!addr.isDefault && (
                      <TouchableOpacity
                        onPress={() => void handleSetDefaultAddress(addr.id)}
                        accessibilityRole="button"
                        accessibilityLabel={`Đặt ${addr.label} làm địa chỉ mặc định`}
                        style={styles.setDefaultBtn}
                      >
                        <Ionicons name="checkmark-circle-outline" size={16} color={colors.primary} />
                        <Text style={styles.defaultBadgeText}>Đặt mặc định</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              ))
            )}
          </View>

          <Text style={[styles.sectionTitle, isDarkMode && styles.textDark, { alignSelf: 'flex-start' }]}>
            {editAddressId ? 'Sửa địa chỉ' : 'Thêm địa chỉ mới'}
          </Text>
          <View style={styles.formSection}>
          <Text style={styles.fieldLabel}>Thông tin địa chỉ</Text>
          <BottomSheetTextInput
            style={[styles.input, styles.inputFlush, isDarkMode && styles.inputDark]}
            placeholder="Tên gợi nhớ (VD: Nhà riêng)"
            placeholderTextColor={colors.muted}
            value={addressName}
            onChangeText={setAddressName}
            accessibilityLabel="Tên gợi nhớ"
          />
          <View style={{ width: '100%', gap: 8 }}>
            <BottomSheetTextInput
              style={[styles.input, styles.inputFlush, isDarkMode && styles.inputDark]}
              placeholder="Tìm địa chỉ (số nhà, tên đường...)"
              placeholderTextColor={colors.muted}
              value={addressDetail}
              onChangeText={handleAddressSearchChange}
              accessibilityLabel="Địa chỉ chi tiết"
              accessibilityHint="Nhập địa chỉ để xem gợi ý. Gợi ý tìm kiếm chưa xác nhận vị trí chính xác."
            />
            {searchingAddress && (
              <ActivityIndicator
                size="small"
                color={colors.primary}
                
                accessibilityLabel="Đang tìm gợi ý địa chỉ"
              />
            )}
            {addressSearchMessage && (
              <View style={{ alignSelf: 'stretch' }}>
                <Text accessibilityLiveRegion="polite" style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 17 }}>
                  {addressSearchMessage}
                </Text>
                <TouchableOpacity
                  onPress={() => handleAddressSearchChange(addressDetail)}
                  accessibilityRole="button"
                  accessibilityLabel="Thử lại tìm địa chỉ"
                  style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}
                >
                  <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '600' }}>Thử lại tìm kiếm</Text>
                </TouchableOpacity>
              </View>
            )}
            {addressSuggestions.length > 0 && (
              <View style={[styles.suggestionBox, isDarkMode && styles.cardDark]}>
                {addressSuggestions.map((s) => (
                  <TouchableOpacity
                    key={s.placeId}
                    style={styles.suggestionItem}
                    onPress={() => handleSelectSuggestion(s)}
                    accessibilityRole="button"
                    accessibilityLabel={`Chọn gợi ý địa chỉ: ${s.description}`}
                    accessibilityHint="Vị trí gợi ý chưa được xác nhận."
                  >
                    <Text style={[styles.suggestionText, isDarkMode && styles.textDark]} numberOfLines={2}>{s.description}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
          </View>

          <View style={styles.formSection}>
          {(addressWard || addressProvince) ? (
            <Text style={{ fontSize: 12, color: colors.textSecondary, alignSelf: 'flex-start' }}>
              <Ionicons name="location" size={12} /> {[addressWard, addressProvince].filter(Boolean).join(', ')}
            </Text>
          ) : null}

          <Text style={styles.fieldLabel}>
            Chọn vị trí chính xác
          </Text>
          <Text style={{ fontSize: 12, lineHeight: 17, color: colors.textSecondary, alignSelf: 'flex-start' }}>
            {Platform.OS === 'web'
              ? 'Bản đồ không hỗ trợ chọn ghim trên trình duyệt. Bạn vẫn có thể quản lý địa chỉ đã lưu.'
              : mapCoordinates
                ? addressPin.status === 'candidate'
                  ? 'Đây là vị trí gợi ý từ tìm kiếm, chưa phải ghim đã xác nhận. Chạm đúng điểm cần sửa trên bản đồ.'
                  : addressPin.status === 'legacy'
                    ? 'Đang hiển thị ghim đã lưu trước đây. Nếu đổi địa chỉ, hãy chọn và xác nhận ghim mới.'
                    : 'Chạm bản đồ để đặt ghim tại vị trí cần sửa.'
                : 'Chưa có vị trí được chọn. Khung bản đồ mặc định không phải vị trí hiện tại của bạn; hãy tìm địa chỉ để đưa bản đồ đến gần khu vực cần chọn.'}
          </Text>
          <View style={{ width: '100%', height: 200, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: colors.border }}>
            <MapView
              key={mapCameraVersion}
              style={{ width: '100%', height: '100%' }}
              initialRegion={{
                latitude: mapCoordinates?.lat ?? 0,
                longitude: mapCoordinates?.lng ?? 0,
                latitudeDelta: mapCoordinates ? 0.02 : 100,
                longitudeDelta: mapCoordinates ? 0.02 : 100,
              }}
              onPress={handleMapPress}
            >
              {mapCoordinates && (
                <Marker
                  coordinate={{ latitude: mapCoordinates.lat, longitude: mapCoordinates.lng }}
                  title={addressPin.status === 'candidate'
                    ? 'Vị trí gợi ý, chưa xác nhận'
                    : addressPin.status === 'legacy'
                      ? 'Ghim đã lưu trước đây'
                      : 'Vị trí bạn đã chọn'}
                />
              )}
            </MapView>
          </View>

          {reverseGeocodingAddress && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start' }}>
              <ActivityIndicator size="small" color={colors.primary} accessibilityLabel="Đang tra cứu địa chỉ" />
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Đang tra cứu địa chỉ cho ghim đã chọn…</Text>
            </View>
          )}
          {addressPinMessage && (
            <Text accessibilityLiveRegion="polite" style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 17, alignSelf: 'stretch' }}>
              {addressPinMessage}
            </Text>
          )}
          {(addressPin.status === 'pending-confirmation' || addressPin.status === 'confirmed') && (
            <View style={{ flexDirection: 'row', alignSelf: 'stretch', alignItems: 'center', gap: 8 }}>
              {addressPin.status === 'pending-confirmation' ? (
                <TouchableOpacity
                  style={[styles.locationBtn, { flex: 1, opacity: reverseGeocodingAddress ? 0.6 : 1 }]}
                  onPress={handleConfirmAddressPin}
                  disabled={reverseGeocodingAddress}
                  accessibilityRole="button"
                  accessibilityLabel="Xác nhận ghim đã chọn"
                  accessibilityState={{ disabled: reverseGeocodingAddress, busy: reverseGeocodingAddress }}
                >
                  <Ionicons name="checkmark-circle-outline" size={20} color={colors.primary} />
                  <Text style={styles.locationBtnText}>Xác nhận vị trí</Text>
                </TouchableOpacity>
              ) : (
                <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '600', minHeight: 24, textAlignVertical: 'center' }}>
                  Đã xác nhận vị trí
                </Text>
              )}
              {addressReverseRetryAvailable && (
                <TouchableOpacity
                  onPress={retryAddressReverse}
                  disabled={reverseGeocodingAddress}
                  accessibilityRole="button"
                  accessibilityLabel="Thử lại tra cứu địa chỉ"
                  accessibilityState={{ disabled: reverseGeocodingAddress, busy: reverseGeocodingAddress }}
                  style={{ minHeight: 44, justifyContent: 'center' }}
                >
                  <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '600' }}>Thử lại</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          <TouchableOpacity
            style={[styles.locationBtn, isDarkMode && styles.cardDark, Platform.OS === 'web' && { opacity: 0.55 }]}
            onPress={handleGetLocation}
            disabled={gettingLocation || Platform.OS === 'web'}
            accessibilityRole="button"
            accessibilityLabel={Platform.OS === 'web' ? 'Dùng ứng dụng di động để chọn vị trí' : 'Dùng vị trí hiện tại'}
            accessibilityState={{ disabled: gettingLocation || Platform.OS === 'web', busy: gettingLocation }}
          >
            {gettingLocation ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <>
                <Ionicons name="navigate-circle-outline" size={20} color={colors.primary} />
                <Text style={styles.locationBtnText}>{Platform.OS === 'web' ? 'Chọn ghim trong ứng dụng di động' : 'Dùng vị trí hiện tại'}</Text>
              </>
            )}
          </TouchableOpacity>
          </View>

          <View style={styles.formSection}>
          <Text style={styles.fieldLabel}>Khu vực</Text>
          <CustomerAdministrativeAreaPicker
            key={`area-${addressPickerVersion}`}
            value={{ ward: addressWard, district: addressDistrict, province: addressProvince, provinceCode: addressProvinceCode, districtCode: addressDistrictCode }}
            disabled={savingAddress}
            onOpen={invalidateAddressRequests}
            onChange={area => {
              if (!screenMountedRef.current || !addressSheetOpenRef.current || savingAddress) return;
              const current = useAuthStore.getState();
              if (!current.isAuthenticated || current.user?.id !== ownerIdRef.current || current.user?.role !== 'customer') return;
              invalidateAddressRequests();
              setAddressWard(area.ward); setAddressDistrict(area.district); setAddressProvince(area.province);
              setAddressProvinceCode(area.provinceCode); setAddressDistrictCode(area.districtCode);
              setAddressPinMessage('Khu vực đã chọn. Kiểm tra tên địa chỉ và xác nhận ghim trước khi lưu.');
            }}
          />
          <View style={styles.defaultRow}>
            <Text style={[styles.locationBtnText, { color: colors.text }]}>Đặt làm địa chỉ mặc định</Text>
            <Switch value={addressIsDefault} onValueChange={setAddressIsDefault} />
          </View>
          </View>

          {addressSaveLocation.kind === 'blocked' && (
            <Text accessibilityLiveRegion="polite" style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 17, alignSelf: 'stretch', marginBottom: 12 }}>
              {!addressName.trim() || !addressDetail.trim()
                ? 'Nhập tên gợi nhớ và địa chỉ chi tiết để tiếp tục.'
                : addressSaveLocation.reason === 'administrative-area'
                  ? 'Chọn tỉnh/thành và phường/xã phía trên để lưu vị trí.'
                  : Platform.OS === 'web'
                    ? 'Dùng ứng dụng di động để đặt và xác nhận ghim chính xác.'
                    : addressPin.status === 'candidate'
                      ? 'Ghim đỏ chỉ là gợi ý. Chạm lên bản đồ đúng điểm cần sửa, rồi bấm “Xác nhận vị trí” để thêm.'
                    : addressPin.status === 'pending-confirmation'
                      ? 'Bấm “Xác nhận vị trí” phía trên bản đồ để thêm.'
                    : editAddressId
                      ? 'Địa chỉ đã đổi. Chọn gợi ý, đặt ghim mới trên bản đồ rồi xác nhận.'
                      : 'Chọn gợi ý, đặt ghim chính xác trên bản đồ rồi xác nhận trước khi lưu.'}
            </Text>
          )}
          {addressSaveLocation.kind === 'candidate-text-only' && (
            <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 17, alignSelf: 'stretch', marginBottom: 8 }}>
              Lưu nội dung từ gợi ý sẽ bỏ ghim cũ; vị trí gợi ý chưa được lưu như ghim chính xác.
            </Text>
          )}
          {addressSaveLocation.kind === 'legacy-text-only' && (
            <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 17, alignSelf: 'stretch', marginBottom: 8 }}>
              Chỉ lưu nội dung địa chỉ; ghim cũ sẽ bị xóa và khu vực đã lưu trước đây được giữ lại. Dùng ứng dụng di động để cập nhật vị trí.
            </Text>
          )}

          {hasUnverifiedAddressWrite && <TouchableOpacity style={[styles.saveBtn, { alignSelf: 'stretch', minHeight: 48, marginBottom: 12 }]} accessibilityRole="button" accessibilityLabel="Kiểm tra địa chỉ đã lưu" disabled={savingAddress} onPress={reconcileAddressWrite}><Text style={styles.saveBtnText}>Kiểm tra địa chỉ đã lưu</Text></TouchableOpacity>}
          <View style={styles.modalActions}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={cancelAddressEditor}
              disabled={savingAddress}
            >
              <Text style={styles.cancelBtnText}>Đóng</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, savingAddress && { opacity: 0.7 }]}
              onPress={handleSaveAddress}
              disabled={savingAddress || reverseGeocodingAddress || hasUnverifiedAddressWrite || user?.role !== 'customer'}
              accessibilityRole="button"
              accessibilityLabel={editAddressId ? 'Cập nhật địa chỉ' : 'Thêm địa chỉ'}
              accessibilityState={{ disabled: !canSaveAddress, busy: savingAddress }}
            >
              {savingAddress ? (
                <ActivityIndicator size="small" color={colors.surface} />
              ) : (
                <Text style={styles.saveBtnText}>{editAddressId ? 'Cập nhật' : 'Thêm'}</Text>
              )}
            </TouchableOpacity>
          </View>
        </BottomSheetScrollView>
      </BottomSheetModal>
    </SafeAreaView>
  );
}

const getStyles = (colors: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  containerDark: { backgroundColor: colors.background },
  cardDark: { backgroundColor: '#1E293B' },
  name: { fontSize: 20, lineHeight: 28, fontWeight: '700', color: colors.text, marginBottom: 4, textAlign: 'center' },
  textDark: { color: colors.text },

  // Giao diện Main Wrapper & Avatar của v2
  scrollContent: { flexGrow: 1, padding: 16 },
  pageIntro: { marginBottom: 12, paddingHorizontal: 2, gap: 4 },
  pageOverline: { fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 1, color: colors.textSecondary },
  pageTitle: { fontSize: 24, lineHeight: 32, fontWeight: '700', color: colors.text },
  pageDescription: { fontSize: 13, lineHeight: 19, color: colors.textSecondary },
  mainWrapperCard: {
    backgroundColor: colors.background,
    flexGrow: 1,
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    marginTop: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0,
    shadowRadius: 8,
    elevation: 0,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 16,
    marginTop: 0,
    paddingVertical: 24,
    paddingHorizontal: 16,
    backgroundColor: colors.primarySoft,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.primaryTint,
  },
  avatarBorder: {
    width: 88, height: 88, borderRadius: 44,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 12,
  },
  avatarBorderLight: { borderColor: colors.surface, backgroundColor: colors.surface },
  avatarBorderDark: { borderColor: '#1E293B', backgroundColor: '#1E293B' },
  avatar: {
    width: '100%', height: '100%', borderRadius: 44,
    backgroundColor: colors.primaryTint, justifyContent: 'center', alignItems: 'center', overflow: 'hidden'
  },
  avatarImage: { width: '100%', height: '100%' },
  avatarText: { fontSize: 32, fontWeight: '700', color: colors.primaryStrong },
  phone: { fontSize: 14, lineHeight: 20, color: colors.textSecondary, fontWeight: '500', textAlign: 'center' },
  heroEditBtn: { minHeight: 48, justifyContent: 'center', alignItems: 'center', marginTop: 12, paddingHorizontal: 16, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  heroEditText: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.text },
  
  sectionTitle: { fontSize: 20, lineHeight: 28, fontWeight: '600', color: colors.text, marginBottom: 12, marginTop: 12 },
  menuContainer: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, overflow: 'hidden', marginBottom: 12 },
  menuItem: { flexDirection: 'row', minHeight: 56, paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center', gap: 12 },
  menuIconTile: { width: 36, height: 36, borderRadius: 8, backgroundColor: colors.primarySoft, justifyContent: 'center', alignItems: 'center' },
  menuContent: { flex: 1, minWidth: 0 },
  menuTitle: { fontSize: 16, lineHeight: 24, fontWeight: '500', color: colors.text },
  menuDesc: { fontSize: 14, lineHeight: 20, color: colors.textSecondary, flexShrink: 1 },
  divider: { height: 1, backgroundColor: colors.divider, marginLeft: 64 },
  footer: { alignItems: 'center', marginTop: 12, marginBottom: 32 },
  logoutSpacer: { flexGrow: 1, minHeight: 12 },

  profileSheetContent: {
    width: '100%',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
  },
  profileSheetHeader: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 22,
  },
  profileHeaderCopy: { flex: 1, gap: 4 },
  profileSheetTitle: { fontSize: 20, lineHeight: 28, fontWeight: '700' },
  profileSheetSubtitle: { fontSize: 13, lineHeight: 19 },
  profileCloseButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileFieldGroup: { width: '100%', marginBottom: 16 },
  profileFieldLabel: { fontSize: 13, lineHeight: 18, fontWeight: '600', marginBottom: 8 },
  profileInputShell: {
    minHeight: 50,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
  },
  profileReadonlyShell: { opacity: 0.92 },
  profileInput: { flex: 1, minHeight: 48, paddingVertical: 0, fontSize: 15, lineHeight: 21 },
  profileReadonlyValue: { flex: 1, fontSize: 14, lineHeight: 20 },
  profileHelperRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 4, marginTop: 8, paddingHorizontal: 2 },
  profileHelperText: { flex: 1, fontSize: 12, lineHeight: 17 },
  profileActions: { width: '100%', flexDirection: 'row', gap: 8, marginTop: 4 },
  profileCancelButton: {
    minHeight: 48,
    minWidth: 92,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileCancelText: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  profileSaveButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileSaveText: { color: '#FFFFFF', fontSize: 14, lineHeight: 20, fontWeight: '700' },
  modalContent: { width: '100%', backgroundColor: colors.surface, borderRadius: 20, padding: 16, alignItems: 'center' },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 16 },
  input: { width: '100%', backgroundColor: colors.border, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 14, color: colors.text, marginBottom: 12 },
  inputFlush: { marginBottom: 0 },
  formSection: { width: '100%', gap: 12, marginBottom: 24 },
  fieldLabel: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.text },
  inputDark: { backgroundColor: '#334155', color: colors.background },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', width: '100%', marginTop: 4, gap: 12 },
  cancelBtn: { minHeight: 48, justifyContent: 'center', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, backgroundColor: colors.border },
  cancelBtnText: { color: colors.textSecondary, fontWeight: '600', fontSize: 14 },
  saveBtn: { minHeight: 48, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
  saveBtnText: { color: colors.surface, fontWeight: '600', fontSize: 14 },
  addressItem: { backgroundColor: colors.background, padding: 16, borderRadius: 14, marginBottom: 12, gap: 12 },
  addressTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  addressFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  addressPinRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  addressNameRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  addressName: { fontSize: 15, lineHeight: 21, fontWeight: '700', color: colors.text },
  addressDetail: { fontSize: 13, lineHeight: 19, color: colors.textSecondary },
  addressPinStatus: { fontSize: 12, lineHeight: 17, color: colors.textSecondary },
  addressStateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16 },
  addressStateText: { fontSize: 13, lineHeight: 19, color: colors.textSecondary },
  addressErrorBox: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 16, marginBottom: 8, backgroundColor: colors.background },
  addressErrorText: { fontSize: 13, lineHeight: 19, color: colors.text, marginBottom: 4 },
  addressRetryBtn: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  addressRetryText: { fontSize: 13, lineHeight: 19, fontWeight: '700', color: colors.primary },
  iconBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.surface },
  locationBtn: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 16, backgroundColor: colors.primaryTint, borderRadius: 12, alignSelf: 'stretch', justifyContent: 'center' },
  locationBtnText: { color: colors.primary, fontSize: 13, fontWeight: '600' },
  defaultBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primaryTint, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  setDefaultBtn: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, borderRadius: 999, backgroundColor: colors.primaryTint },
  defaultBadgeText: { fontSize: 12, lineHeight: 17, fontWeight: '700', color: colors.primaryStrong },
  suggestionBox: { width: '100%', backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  suggestionItem: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  suggestionText: { fontSize: 13, color: colors.text },
  defaultRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', minHeight: 48 },
  cameraIconBadge: { position: 'absolute', bottom: 0, right: 0, backgroundColor: colors.primaryStrong, width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: colors.surface },
  avatarModalContainer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center' },
  closeAvatarModalBtn: { position: 'absolute', top: 50, right: 20, zIndex: 10, width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  fullAvatarImage: { width: '100%', height: 400 },
});
