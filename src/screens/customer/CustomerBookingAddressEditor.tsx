import CustomerAdministrativeAreaPicker from './CustomerAdministrativeAreaPicker';
import { canonicalCustomerAddressArea } from './customer-administrative-area';
import BookingActionBar from '../../components/BookingActionBar';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import MapView, { Marker } from '../../components/AddressMap';
import { geoApi, type PlaceSuggestion } from '../../api/geo.api';
import { usersApi, type AddressData, type CreateAddressRequest } from '../../api/users.api';
import { useAppTheme } from '../../constants/theme';
import {
  confirmExactPin,
  isValidCoordinates,
  makeCandidatePin,
  makePendingPin,
  resolveAddressSaveLocation,
  resolveReverseLookup,
  type ExactPinCoordinates,
  type ExactPinState,
} from './customer-exact-pin';

export type BookingAddressCreateAttempt = {
  payload: CreateAddressRequest;
  baselineIds: string[];
  knownId: string | null;
  /** True only while the first POST has not yet settled; do not reconcile lookalikes. */
  posting?: boolean;
  /** Process-local attempt identity prevents a late old response from clearing a newer attempt. */
  attemptToken?: number;
};

type Props = {
  ownerUserId: string;
  existingAddressIds: string[];
  isOwnerCurrent: (ownerUserId: string) => boolean;
  onCancel: () => void;
  onSaved: (selected: AddressData, all: AddressData[]) => void;
  lockedAttempt?: BookingAddressCreateAttempt | null;
  onAttemptStart?: (attempt: BookingAddressCreateAttempt) => void;
  onCreatedId?: (id: string) => void;
  onAttemptCleared?: () => void;
};

type Area = {
  ward: string;
  district: string;
  province: string;
  provinceCode?: string;
  districtCode?: string;
};

const EMPTY_AREA: Area = { ward: '', district: '', province: '' };

// The process-local ledger preserves an unresolved write across Booking route
// unmount/remount. It holds no credentials and is indexed only by the owner id.
// A fresh app process still requires manual account-history reconciliation.
const addressAttemptLedger = new Map<string, BookingAddressCreateAttempt>();
let nextAddressAttemptToken = 0;
export function getBookingAddressAttempt(ownerId: string) {
  return addressAttemptLedger.get(ownerId) ?? null;
}
export function rememberBookingAddressAttempt(ownerId: string, attempt: BookingAddressCreateAttempt) {
  addressAttemptLedger.set(ownerId, attempt);
}
export function clearBookingAddressAttempt(ownerId: string) {
  addressAttemptLedger.delete(ownerId);
}

const roundStorageCoordinate = (value: number) => Math.round(value * 1e7) / 1e7;
const matchingStorageCoordinate = (actual: number, requested: number) =>
  Number.isFinite(actual) && Number.isFinite(requested)
  && roundStorageCoordinate(actual) === roundStorageCoordinate(requested);

function isDefinitiveAddressError(error: unknown): boolean {
  const status = (error as { response?: { status?: unknown } } | null)?.response?.status;
  return typeof status === 'number' && [400, 401, 403, 404, 422].includes(status);
}

/**
 * The same Backend geo endpoints + exact-pin decision helpers as Profile.
 * A search result is only a camera suggestion; it is NEVER a confirmed pin.
 * All mutations require an explicit, owner-bound user confirmation.
 */
export default function CustomerBookingAddressEditor({
  ownerUserId, existingAddressIds, isOwnerCurrent, onCancel, onSaved,
  lockedAttempt, onAttemptStart, onCreatedId, onAttemptCleared,
}: Props) {
  const { colors } = useAppTheme();
  const [label, setLabel] = useState(lockedAttempt?.payload.label ?? '');
  const [line1, setLine1] = useState(lockedAttempt?.payload.line1 ?? '');
  const [area, setArea] = useState<Area>(lockedAttempt ? {
    ward: lockedAttempt.payload.ward, district: lockedAttempt.payload.district,
    province: lockedAttempt.payload.province,
    provinceCode: lockedAttempt.payload.provinceCode,
    districtCode: lockedAttempt.payload.districtCode,
  } : EMPTY_AREA);
  const restoredPin: ExactPinState = lockedAttempt?.payload.lat !== undefined
    && lockedAttempt?.payload.lng !== undefined
    && isValidCoordinates({ lat: lockedAttempt.payload.lat, lng: lockedAttempt.payload.lng })
    ? { status: 'confirmed', source: 'map', coordinates: {
      lat: lockedAttempt.payload.lat, lng: lockedAttempt.payload.lng,
    } } : { status: 'none' };
  const [pin, setPin] = useState<ExactPinState>(restoredPin);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [message, setMessage] = useState(lockedAttempt ? 'Yêu cầu lưu địa chỉ trước đó chưa được đối chiếu. Chỉ kiểm tra danh sách, không gửi lại.' : '');
  const [searching, setSearching] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveAttempted, setSaveAttempted] = useState(Boolean(lockedAttempt));
  const [knownId, setKnownId] = useState<string | null>(lockedAttempt?.knownId ?? null);
  const [cameraVersion, setCameraVersion] = useState(0);
  const alive = useRef(true);
  const generation = useRef(0);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveAttemptRef = useRef(Boolean(lockedAttempt));
  const baselineIds = useRef(new Set(lockedAttempt?.baselineIds ?? existingAddressIds));
  const submitted = useRef<CreateAddressRequest | null>(lockedAttempt?.payload ?? null);
  const knownIdRef = useRef<string | null>(lockedAttempt?.knownId ?? null);
  const pinRef = useRef<ExactPinState>(restoredPin);
  const ownerValid = useCallback(
    () => alive.current && isOwnerCurrent(ownerUserId),
    [isOwnerCurrent, ownerUserId],
  );

  const cancelPending = useCallback(() => {
    generation.current += 1;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = null;
    setSearching(false);
    setLookingUp(false);
    setLocating(false);
  }, []);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      generation.current += 1;
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, []);

  const changePin = (next: ExactPinState) => {
    pinRef.current = next;
    setPin(next);
  };

  const clearArea = () => setArea(EMPTY_AREA);
  const coordinates = pin.status !== 'none' && isValidCoordinates(pin.coordinates)
    ? pin.coordinates : null;
  const saveDecision = resolveAddressSaveLocation({
    isCreating: true,
    addressText: line1,
    province: area.province,
    district: area.district,
    provinceCode: area.provinceCode,
    districtCode: area.districtCode,
    pin,
  });
  const withinBackendLimits = label.trim().length <= 100
    && line1.trim().length <= 255
    && area.ward.length <= 100
    && area.district.length <= 100
    && area.province.length <= 100;
  const maySave = !saveAttempted && !saving && !lookingUp
    && label.trim().length > 0 && line1.trim().length > 0
    && withinBackendLimits && saveDecision.kind === 'confirmed';

  const searchAddress = (text: string) => {
    cancelPending();
    const request = generation.current;
    setLine1(text);
    setSuggestions([]);
    setMessage('');
    // Editing after pin placement invalidates exact location and administrative area.
    changePin({ status: 'none' });
    clearArea();
    const query = text.trim();
    if (query.length < 3) return;
    searchTimer.current = setTimeout(async () => {
      if (generation.current !== request || !ownerValid()) return;
      setSearching(true);
      try {
        const next = await geoApi.autocomplete(query);
        if (generation.current !== request || !ownerValid()) return;
        setSuggestions(next);
        if (next.length === 0) setMessage('Không có gợi ý địa chỉ. Hãy sửa từ khóa hoặc chọn ghim trên bản đồ.');
      } catch {
        if (generation.current === request && ownerValid()) {
          setMessage('Không thể tìm gợi ý. Hãy thử lại hoặc chạm bản đồ trên điện thoại.');
        }
      } finally {
        if (generation.current === request && ownerValid()) setSearching(false);
      }
    }, 350);
  };

  const chooseSuggestion = (suggestion: PlaceSuggestion) => {
    cancelPending();
    setLine1(suggestion.description);
    setArea({
      ward: suggestion.ward || '',
      district: suggestion.district || '',
      province: suggestion.province || '',
    });
    setSuggestions([]);
    changePin(makeCandidatePin({ lat: suggestion.lat, lng: suggestion.lng }));
    setCameraVersion((n) => n + 1);
    setMessage('Đây chỉ là vị trí gợi ý. Chạm đúng điểm sửa chữa trên bản đồ rồi xác nhận ghim.');
  };

  const reverse = async (point: ExactPinCoordinates, pending: ExactPinState, request: number) => {
    setLookingUp(true);
    try {
      const result = await geoApi.reverse(point.lat, point.lng);
      if (generation.current !== request || !ownerValid()) return;
      const decision = resolveReverseLookup(pinRef.current, point, result);
      if (decision.kind !== 'resolved') return;
      setLine1(result.formattedAddress || '');
      const resolvedArea = canonicalCustomerAddressArea(result);
      setArea(resolvedArea);
      setMessage(result.formattedAddress && resolvedArea.district && resolvedArea.province
        ? 'Đã tra cứu địa chỉ cho ghim. Hãy kiểm tra và xác nhận điểm này.'
        : 'Xác nhận ghim, nhập địa chỉ và chọn tỉnh/thành, phường/xã để lưu.');
    } catch {
      if (generation.current === request && ownerValid()) {
        const decision = resolveReverseLookup(pinRef.current, point, null);
        if (decision.kind === 'failed') {
          setMessage('Tra cứu địa chỉ thất bại. Ghim vẫn chưa được lưu; hãy thử tra cứu lại.');
        }
      }
    } finally {
      if (generation.current === request && ownerValid()) setLookingUp(false);
    }
    void pending;
  };

  const placePin = (point: ExactPinCoordinates, source: 'map' | 'gps') => {
    if (!ownerValid() || saveAttemptRef.current) return;
    cancelPending();
    const request = generation.current;
    const pending = makePendingPin(point, source);
    if (pending.status === 'none') {
      setMessage('Tọa độ ghim không hợp lệ.');
      return;
    }
    changePin(pending);
    setLine1('');
    clearArea();
    setSuggestions([]);
    setMessage('Đang tra cứu địa chỉ cho điểm vừa chọn…');
    void reverse(point, pending, request);
  };

  const pickGps = async () => {
    if (Platform.OS === 'web' || !ownerValid()) return;
    cancelPending();
    const request = generation.current;
    setLocating(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!ownerValid() || generation.current !== request) return;
      if (permission.status !== 'granted') {
        setMessage('Chưa được cấp quyền vị trí. Bạn có thể chọn ghim thủ công trên bản đồ.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      if (!ownerValid() || generation.current !== request) return;
      setLocating(false);
      placePin({ lat: pos.coords.latitude, lng: pos.coords.longitude }, 'gps');
      setCameraVersion((n) => n + 1);
    } catch {
      if (ownerValid() && generation.current === request) setMessage('Không lấy được vị trí. Hãy chạm điểm trên bản đồ.');
    } finally {
      if (ownerValid() && generation.current === request) setLocating(false);
    }
  };

  const confirmPin = () => {
    if (!ownerValid() || lookingUp || saveAttemptRef.current) return;
    const next = confirmExactPin(pinRef.current);
    if (next.status !== 'confirmed') return;
    changePin(next);
    setMessage('Ghim đã xác nhận. Kiểm tra tên và địa chỉ trước khi lưu.');
  };

  const retryReverse = () => {
    const active = pinRef.current;
    if (active.status !== 'pending-confirmation' && active.status !== 'confirmed') return;
    if (!isValidCoordinates(active.coordinates)) return;
    cancelPending();
    void reverse(active.coordinates, active, generation.current);
  };

  const matchingSaved = (all: AddressData[]) => {
    const request = submitted.current;
    if (!request) return null;
    const activeAttempt = getBookingAddressAttempt(ownerUserId);
    const sameAttempt = activeAttempt
      && activeAttempt.payload.label === request.label
      && activeAttempt.payload.line1 === request.line1
      && activeAttempt.payload.lat === request.lat
      && activeAttempt.payload.lng === request.lng;
    if (sameAttempt && activeAttempt.posting) return null;
    const confirmedId = sameAttempt
      ? activeAttempt.knownId ?? knownIdRef.current
      : knownIdRef.current;
    const found = all.filter((address) =>
      address.userId === ownerUserId
      // A confirmed POST id is authoritative. Never adopt a lookalike id.
      && (confirmedId
        ? address.id === confirmedId
        : !baselineIds.current.has(address.id))
      && address.label === request.label
      && address.line1 === request.line1
      && typeof request.lat === 'number'
      && typeof request.lng === 'number'
      // Backend stores decimal(10,7), so GET may round GPS precision.
      && matchingStorageCoordinate(address.lat, request.lat)
      && matchingStorageCoordinate(address.lng, request.lng)
      && isValidCoordinates({ lat: address.lat, lng: address.lng })
      && address.district && address.province,
    );
    return found.length === 1 ? found[0] : null;
  };

  const reconcileAddress = async () => {
    if (!saveAttemptRef.current || !ownerValid() || saving) return;
    setSaving(true);
    try {
      const all = await usersApi.getAddresses();
      if (!ownerValid()) return;
      const found = matchingSaved(all);
      if (found) onSaved(found, all);
      else setMessage('Chưa tìm thấy duy nhất địa chỉ mới khớp. Không gửi lại; hãy kiểm tra sau trong danh sách địa chỉ.');
    } catch {
      if (ownerValid()) setMessage('Không tải được danh sách địa chỉ. Giữ khóa tránh tạo trùng; hãy thử kiểm tra lại.');
    } finally {
      if (ownerValid()) setSaving(false);
    }
  };

  const save = async () => {
    if (!maySave || saveAttemptRef.current || !ownerValid()) return;
    const decision = resolveAddressSaveLocation({
      isCreating: true,
      addressText: line1,
      province: area.province,
      district: area.district,
      provinceCode: area.provinceCode,
      districtCode: area.districtCode,
      pin: pinRef.current,
    });
    if (decision.kind !== 'confirmed') return;
    const payload: CreateAddressRequest = {
      label: label.trim(),
      line1: line1.trim(),
      ward: area.ward,
      district: area.district,
      province: area.province,
      ...(area.provinceCode ? { provinceCode: area.provinceCode } : {}),
      ...(area.districtCode ? { districtCode: area.districtCode } : {}),
      lat: roundStorageCoordinate(decision.coordinates.lat),
      lng: roundStorageCoordinate(decision.coordinates.lng),
      isDefault: false,
    };
    saveAttemptRef.current = true;
    submitted.current = payload;
    const attemptToken = ++nextAddressAttemptToken;
    onAttemptStart?.({
      payload, baselineIds: Array.from(baselineIds.current), knownId: null, posting: true, attemptToken,
    });
    setSaveAttempted(true);
    setSaving(true);
    let postAcknowledged = false;
    try {
      const created = await usersApi.createAddress(payload);
      // A readback failure cannot retroactively turn an ACKed write into 400.
      postAcknowledged = true;
      const latestAttempt = getBookingAddressAttempt(ownerUserId);
      if (latestAttempt && latestAttempt.attemptToken === attemptToken
        && latestAttempt.payload.label === payload.label
        && latestAttempt.payload.line1 === payload.line1
        && latestAttempt.payload.lat === payload.lat
        && latestAttempt.payload.lng === payload.lng) {
        rememberBookingAddressAttempt(ownerUserId, {
          ...latestAttempt, posting: false,
          knownId: created?.id && created.userId === ownerUserId
            ? created.id : latestAttempt.knownId,
        });
      }
      if (created?.id && created.userId === ownerUserId) {
        // Preserve the confirmed id even if this editor was closed while POST
        // was in flight. The attempt belongs to its ORIGINAL owner.
        const attempt = getBookingAddressAttempt(ownerUserId);
        if (attempt && attempt.attemptToken === attemptToken
          && attempt.payload.label === payload.label
          && attempt.payload.line1 === payload.line1
          && attempt.payload.lat === payload.lat && attempt.payload.lng === payload.lng) {
          rememberBookingAddressAttempt(ownerUserId, { ...attempt, knownId: created.id });
        }
      }
      if (!ownerValid()) return;
      if (created?.id && created.userId === ownerUserId) {
        knownIdRef.current = created.id;
        setKnownId(created.id);
        onCreatedId?.(created.id);
      }
      const all = await usersApi.getAddresses();
      if (!ownerValid()) return;
      const found = matchingSaved(all);
      if (found) onSaved(found, all);
      else setMessage('Địa chỉ có thể đã lưu nhưng chưa kiểm tra được từ máy chủ. Không gửi lại; hãy kiểm tra danh sách.');
    } catch (error: unknown) {
      const rejectedBeforeCommit = !postAcknowledged && isDefinitiveAddressError(error);
      const activeAttempt = getBookingAddressAttempt(ownerUserId);
      const isThisAttempt = activeAttempt?.attemptToken === attemptToken
        && activeAttempt?.payload.label === payload.label
        && activeAttempt?.payload.line1 === payload.line1
        && activeAttempt?.payload.lat === payload.lat
        && activeAttempt?.payload.lng === payload.lng;
      if (isThisAttempt && activeAttempt) {
        if (rejectedBeforeCommit) {
          // A definite POST rejection can safely release this precise lock,
          // even when the initiating editor has already unmounted.
          clearBookingAddressAttempt(ownerUserId);
        } else if (!postAcknowledged) {
          // Unknown network outcome remains locked: GET-only reconciliation.
          rememberBookingAddressAttempt(ownerUserId, { ...activeAttempt, posting: false });
        }
      }
      if (ownerValid()) {
        if (rejectedBeforeCommit) {
          saveAttemptRef.current = false;
          submitted.current = null;
          knownIdRef.current = null;
          setSaveAttempted(false);
          setKnownId(null);
          onAttemptCleared?.();
          setMessage('Máy chủ từ chối địa chỉ. Kiểm tra lại thông tin và chọn lại ghim nếu cần trước khi lưu.');
        } else {
          setMessage('Chưa rõ địa chỉ đã được lưu hay chưa. Không gửi lại để tránh trùng; hãy kiểm tra danh sách.');
        }
      }
    } finally {
      if (ownerValid()) setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
    <View testID="booking-new-address-editor" style={[styles.card, { backgroundColor: colors.surface }]}>
      <Text accessibilityRole="header" style={[styles.heading, { color: colors.text }]}>Thêm địa chỉ tại nơi cần sửa</Text>
      <Text style={[styles.hint, { color: colors.textSecondary }]}>Tìm địa chỉ → Ghim vị trí → Xác nhận địa chỉ → Lưu</Text>
      <TextInput accessibilityLabel="Tên địa chỉ mới" placeholder="Tên gợi nhớ (Ví dụ: Nhà riêng)" value={label}
        onChangeText={setLabel} maxLength={100} editable={!saveAttempted} placeholderTextColor={colors.textSecondary}
        style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]} />
      <TextInput accessibilityLabel="Tìm địa chỉ mới" placeholder="Nhập số nhà, tên đường..." value={line1}
        onChangeText={searchAddress} maxLength={255} editable={!saveAttempted} placeholderTextColor={colors.textSecondary}
        style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]} />
      {searching && <ActivityIndicator accessibilityLabel="Đang tìm địa chỉ" color={colors.primary} />}
      {suggestions.map((suggestion) => (
        <TouchableOpacity key={suggestion.placeId} accessibilityRole="button"
          accessibilityLabel={`Chọn gợi ý địa chỉ: ${suggestion.description}`}
          style={[styles.suggestion, { backgroundColor: colors.primarySoft }]} onPress={() => chooseSuggestion(suggestion)}>
          <Text style={{ color: colors.text }}>{suggestion.description}</Text>
        </TouchableOpacity>
      ))}
      <View style={[styles.mapWrap, { borderColor: colors.border }]}>
        <MapView key={cameraVersion} style={styles.map} initialRegion={{
          latitude: coordinates?.lat ?? 0, longitude: coordinates?.lng ?? 0,
          latitudeDelta: coordinates ? 0.02 : 100, longitudeDelta: coordinates ? 0.02 : 100,
        }} onPress={(e: { nativeEvent: { coordinate: { latitude: number; longitude: number } } }) =>
          Platform.OS !== 'web' && placePin({
            lat: e.nativeEvent.coordinate.latitude, lng: e.nativeEvent.coordinate.longitude,
          }, 'map')}>
          {coordinates && <Marker coordinate={{ latitude: coordinates.lat, longitude: coordinates.lng }}
            title={pin.status === 'candidate' ? 'Vị trí gợi ý, chưa xác nhận' : 'Vị trí bạn đã chọn'} />}
        </MapView>
      </View>
      {Platform.OS === 'web' && (
        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          Bản đồ trên trình duyệt chưa hỗ trợ đặt ghim chính xác. Hãy dùng ứng dụng Android/iOS để chọn và xác nhận địa chỉ mới.
        </Text>
      )}
      {lookingUp && <Text style={{ color: colors.textSecondary }}>Đang xác định địa chỉ cho vị trí đã chọn…</Text>}
      {pin.status === 'pending-confirmation' && (
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Xác nhận ghim mới"
          disabled={lookingUp} onPress={confirmPin}
          style={[styles.action, { backgroundColor: colors.primary, opacity: lookingUp ? 0.5 : 1 }]}>
          <Text style={{ color: colors.surface, fontWeight: '700' }}>Xác nhận vị trí ghim</Text>
        </TouchableOpacity>
      )}
      {pin.status === 'confirmed' && <Text style={{ color: colors.success }}>Đã xác nhận ghim chính xác</Text>}
      {(pin.status === 'pending-confirmation' || pin.status === 'confirmed') && !lookingUp && <View style={{ gap: 8 }}>
        <Text style={{ color: colors.text, fontWeight: '600' }}>Xác nhận địa chỉ</Text>
        <Text style={{ color: colors.textSecondary }}>{line1.split(',').map(part => part.trim()).filter((part, index, all) => part && all.indexOf(part) === index).join(', ') || 'Nhập số nhà, tên đường tại ghim.'}</Text>
        <TextInput accessibilityLabel="Địa chỉ tại ghim" placeholder="Số nhà, tên đường" value={line1} onChangeText={setLine1} maxLength={255} editable={!saveAttempted} placeholderTextColor={colors.textSecondary} style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]} />
        <CustomerAdministrativeAreaPicker value={area} disabled={saveAttempted} onOpen={cancelPending} onChange={next => { if (!ownerValid() || saveAttemptRef.current) return; cancelPending(); setArea(next); setMessage(''); }} />
        {maySave && <Text style={{ color: colors.success }}>Địa chỉ sẵn sàng để lưu.</Text>}
      </View>}
      {(pin.status === 'pending-confirmation' || pin.status === 'confirmed') && !lookingUp && (
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Tra cứu lại địa chỉ"
          onPress={retryReverse} style={styles.link}>
          <Text style={{ color: colors.primary }}>Tra cứu lại địa chỉ ghim</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity accessibilityRole="button"
        accessibilityLabel={Platform.OS === 'web' ? 'Vị trí hiện tại không khả dụng trên web' : 'Dùng vị trí hiện tại để ghim'}
        disabled={Platform.OS === 'web' || locating || saveAttempted} onPress={() => { void pickGps(); }}
        style={styles.link}>
        <Text style={{ color: colors.primary, opacity: Platform.OS === 'web' ? 0.55 : 1 }}>
          {locating ? 'Đang xác định GPS…' : 'Dùng vị trí hiện tại'}
        </Text>
      </TouchableOpacity>
      {!!message && <Text accessibilityLiveRegion="polite" style={{ color: colors.textSecondary }}>{message}</Text>}
      {!withinBackendLimits && <Text accessibilityRole="alert" style={{ color: colors.textSecondary }}>
        Tên, địa chỉ hoặc khu vực dài quá giới hạn Backend. Hãy chọn một địa chỉ ngắn và đầy đủ hơn.
      </Text>}
      {!maySave && !saveAttempted && (
        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          {!label.trim()
            ? 'Nhập tên gợi nhớ cho địa chỉ để lưu.'
            : saveDecision.kind !== 'blocked'
              ? 'Hoàn tất các bước ở trên để bật nút lưu.'
              : saveDecision.reason === 'administrative-area'
                ? 'Chọn tỉnh/thành và phường/xã ở phần Xác nhận địa chỉ.'
                : 'Hãy chọn đúng điểm trên bản đồ và xác nhận ghim trước khi lưu.'}
        </Text>
      )}
      {knownId && <Text style={[styles.hint, { color: colors.textSecondary }]}>Đã nhận mã lưu; đang chờ xác minh trong danh sách.</Text>}
    </View>
      </ScrollView>
      <BookingActionBar>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Đóng thêm địa chỉ"
        onPress={onCancel} style={styles.link}>
        <Text style={{ color: colors.textSecondary }}>Đóng, quay lại danh sách</Text>
      </TouchableOpacity>
      {saveAttempted ? (
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Kiểm tra địa chỉ vừa tạo"
          disabled={saving} onPress={() => { void reconcileAddress(); }}
          style={[styles.action, { backgroundColor: colors.primary, opacity: saving ? 0.5 : 1 }]}>
          <Text style={{ color: colors.surface, fontWeight: '700' }}>{saving ? 'Đang kiểm tra…' : 'Kiểm tra địa chỉ đã lưu'}</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Lưu địa chỉ mới"
          accessibilityState={{ disabled: !maySave }} disabled={!maySave}
          onPress={() => { void save(); }}
          style={[styles.action, { backgroundColor: maySave ? colors.primary : colors.border }]}>
          <Text style={{ color: maySave ? colors.surface : colors.textSecondary, fontWeight: '700' }}>Lưu và dùng địa chỉ này</Text>
        </TouchableOpacity>
      )}

      </BookingActionBar>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 14, padding: 16, gap: 12 },
  heading: { fontSize: 20, lineHeight: 27, fontWeight: '700' },
  hint: { fontSize: 12, lineHeight: 18 },
  input: { borderWidth: 1, borderRadius: 14, minHeight: 52, fontSize: 16, paddingHorizontal: 12 },
  suggestion: { minHeight: 48, justifyContent: 'center', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12 },
  mapWrap: { height: 220, borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  map: { width: '100%', height: '100%' },
  action: { minHeight: 52, borderRadius: 14, justifyContent: 'center', alignItems: 'center', padding: 12 },
  link: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', paddingHorizontal: 2 },
});
