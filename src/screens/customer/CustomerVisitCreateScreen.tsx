import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AlertCircle, CheckCircle2, Plus, X } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import BackButton from '../../components/BackButton';
import BookingSessionPicker from '../../components/BookingSessionPicker';
import { servicesApi, type ServiceItem } from '../../api/services.api';
import { usersApi, type AddressData } from '../../api/users.api';
import { mediaApi } from '../../api/media.api';
import { createIdempotencyKey } from '../../api/part-requests.api';
import { VISIT_DEVICE_LIMIT, visitGroupsApi } from '../../api/visit-groups.api';
import { iconSize, iconStroke, useAppTheme } from '../../constants/theme';
import type { RootStackParamList } from '../../types';
import type { BookingSchedule } from '../../utils/booking-session';
import { formatVnd } from '../../utils/format';
import { extractApiErrorMessage } from '../../utils/input-validation';
import { summarizeVisitDevicePrices, visitPriceText } from '../../utils/visit-device-pricing';
import { addressReadyForBooking } from './customer-booking-create';
import {
  VISIT_DESCRIPTION_MAX,
  VISIT_PHOTOS_PER_DEVICE,
  addDevice,
  buildVisitDto,
  deviceComplete,
  devicePrice,
  deviceProblem,
  visitProblem,
  type VisitDeviceDraft,
  type VisitPhotoDraft,
} from './customer-visit-draft';

type CreateRoute = RouteProp<RootStackParamList, 'CustomerVisitCreate'>;

const photoType = (mime?: string | null, name?: string | null): VisitPhotoDraft['type'] | null => {
  const m = mime?.trim().toLowerCase();
  if (m === 'image/jpg' || m === 'image/jpeg') return 'image/jpeg';
  if (m === 'image/png') return 'image/png';
  if (m === 'image/webp') return 'image/webp';
  if (m) return null;
  const ext = name?.split('.').pop()?.toLowerCase();
  return ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : null;
};

/** Book 2-3 devices in one visit: one technician, one payment (web "Đặt nhiều thiết bị"). */
export default function CustomerVisitCreateScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const prefill = useRoute<CreateRoute>().params?.prefill;

  const [services, setServices] = useState<ServiceItem[]>([]);
  const [addresses, setAddresses] = useState<AddressData[]>([]);
  const [limit, setLimit] = useState(VISIT_DEVICE_LIMIT);
  const [hotline, setHotline] = useState<string | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [loadError, setLoadError] = useState('');
  const [devices, setDevices] = useState<VisitDeviceDraft[]>([]);
  // Every device is a chip in the strip; the form below edits the active one. `picking` is the service chooser (add a device, or change the active one's service).
  const [activeKey, setActiveKey] = useState('');
  const [picking, setPicking] = useState<'add' | 'change' | null>(null);
  const [query, setQuery] = useState('');
  const [formError, setFormError] = useState('');
  const [addressId, setAddressId] = useState('');
  const [schedule, setSchedule] = useState<BookingSchedule | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // A send with no answer may have been saved; the same key makes a retry safe, but the customer is told to check first.
  const [unknownOutcome, setUnknownOutcome] = useState(false);
  const [consultText, setConsultText] = useState('');
  const [consultMsg, setConsultMsg] = useState('');
  const idempotencyKey = useRef(createIdempotencyKey('visit'));
  const prefilled = useRef(false);
  const keySeq = useRef(0);

  useEffect(() => {
    let live = true;
    void (async () => {
      const [contact, catalog, saved] = await Promise.allSettled([
        visitGroupsApi.contact(), servicesApi.getServices({ pageSize: 100 }), usersApi.getAddresses(),
      ]);
      if (!live) return;
      if (contact.status === 'fulfilled') { setEnabled(contact.value.enabled); setLimit(contact.value.deviceLimit); setHotline(contact.value.hotline); }
      else setEnabled(false);
      const list = catalog.status === 'fulfilled' ? catalog.value.data.filter((s) => s.isActive) : [];
      const addrs = saved.status === 'fulfilled' ? saved.value : [];
      setServices(list); setAddresses(addrs);
      const ready = addrs.filter(addressReadyForBooking);
      setAddressId((cur) => cur || (ready.find((a) => a.isDefault) ?? ready[0])?.id || '');
      if (catalog.status === 'rejected' && saved.status === 'rejected') setLoadError('Không tải được dịch vụ hoặc địa chỉ. Hãy thử lại khi có kết nối.');
      // Every device the assistant suggested loads as a chip, but stays unconfirmed until the customer checks it; nothing is sent on its own.
      if (!prefilled.current && prefill?.devices?.length) {
        prefilled.current = true;
        const max = contact.status === 'fulfilled' ? contact.value.deviceLimit : VISIT_DEVICE_LIMIT;
        const loaded: VisitDeviceDraft[] = prefill.devices.flatMap((suggestion, i) => {
          const svc = list.find((x) => x.id === suggestion.serviceId);
          return svc ? [{ key: `ai-${i}`, serviceId: svc.id, serviceName: svc.name, priceSummary: svc.priceSummary ?? null, description: suggestion.description, photos: [], unconfirmed: true }] : [];
        }).slice(0, max);
        if (loaded.length) { setDevices(loaded); setActiveKey(loaded[0].key); }
      }
    })();
    return () => { live = false; };
  }, [prefill]);

  const active = devices.find((d) => d.key === activeKey) ?? devices[0];
  const atLimit = devices.length >= limit;
  const q = query.trim().toLowerCase();
  const matches = (q ? services.filter((s) => s.name.toLowerCase().includes(q)) : services).slice(0, 8);
  const total = summarizeVisitDevicePrices(devices.map((d) => devicePrice(d.priceSummary)));
  const readyAddresses = addresses.filter(addressReadyForBooking);
  const problem = visitProblem(devices, readyAddresses.some((a) => a.id === addressId), schedule);
  const unconfirmedCount = devices.filter((d) => d.unconfirmed).length;

  const patch = (key: string, change: Partial<VisitDeviceDraft>) => setDevices((list) => list.map((d) => (d.key === key ? { ...d, ...change } : d)));
  const openChip = (key: string) => { setActiveKey(key); setPicking(null); setFormError(''); };
  const startPick = (mode: 'add' | 'change') => { setPicking(mode); setQuery(''); setFormError(''); };
  const pickService = (s: ServiceItem) => {
    if (picking === 'add') {
      keySeq.current += 1;
      const device: VisitDeviceDraft = { key: `d-${keySeq.current}`, serviceId: s.id, serviceName: s.name, priceSummary: s.priceSummary ?? null, description: '', photos: [] };
      setDevices((list) => addDevice(list, device, limit));
      setActiveKey(device.key);
    } else if (active) patch(active.key, { serviceId: s.id, serviceName: s.name, priceSummary: s.priceSummary ?? null });
    setPicking(null);
  };
  const removeActive = () => {
    if (!active) return;
    const rest = devices.filter((d) => d.key !== active.key);
    setDevices(rest); setActiveKey(rest[0]?.key ?? ''); setFormError(''); setPicking(null);
  };
  const confirmActive = () => {
    if (!active) return;
    const issue = deviceProblem(active);
    if (issue) { setFormError(issue); return; }
    patch(active.key, { unconfirmed: false }); setFormError('');
  };
  const pickPhotos = async () => {
    if (!active || active.photos.length >= VISIT_PHOTOS_PER_DEVICE) return;
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) { setFormError('Cho phép truy cập thư viện ảnh để đính kèm ảnh sự cố.'); return; }
      const remaining = VISIT_PHOTOS_PER_DEVICE - active.photos.length;
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: remaining > 1, selectionLimit: remaining, quality: 1 });
      if (result.canceled) return;
      const usedElsewhere = new Set(devices.filter((d) => d.key !== active.key).flatMap((d) => d.photos.map((p) => p.uri)));
      const next = [...active.photos];
      for (const asset of result.assets) {
        const type = photoType(asset.mimeType, asset.fileName);
        if (!asset.uri || next.length >= VISIT_PHOTOS_PER_DEVICE || next.some((p) => p.uri === asset.uri)) continue;
        if (usedElsewhere.has(asset.uri)) { setFormError('Ảnh của mỗi thiết bị phải riêng biệt. Ảnh này đã dùng cho máy khác.'); continue; }
        if (!type) { setFormError('Ảnh phải có định dạng JPEG, PNG hoặc WebP.'); continue; }
        if (asset.fileSize && asset.fileSize > 10 * 1024 * 1024) { setFormError('Mỗi ảnh không được vượt quá 10 MiB.'); continue; }
        next.push({ uri: asset.uri, name: asset.fileName?.trim() || `visit-photo.${type.slice(6)}`, type });
      }
      patch(active.key, { photos: next });
    } catch { setFormError('Không thể mở thư viện ảnh. Hãy thử lại.'); }
  };

  const send = async () => {
    if (busy || !schedule || problem) return;
    setBusy(true); setError('');
    try {
      // Upload each photo once; a retry reuses the ids already issued.
      const withUploads: VisitDeviceDraft[] = [];
      for (const device of devices) {
        const photos: VisitPhotoDraft[] = [];
        for (const photo of device.photos) {
          if (photo.uploadId) { photos.push(photo); continue; }
          const up = await mediaApi.uploadBookingPhoto({ uri: photo.uri, name: photo.name, type: photo.type });
          photos.push({ ...photo, uploadId: up.uploadId });
        }
        withUploads.push({ ...device, photos });
      }
      setDevices(withUploads);
      const visit = await visitGroupsApi.create(buildVisitDto({ devices: withUploads, addressId, schedule, note, idempotencyKey: idempotencyKey.current, aiSessionId: prefill?.aiSessionId }));
      navigation.replace('CustomerVisit', { visitGroupId: visit.id });
    } catch (e) {
      const noAnswer = !(e as { response?: unknown })?.response;
      if (noAnswer) { setUnknownOutcome(true); setError('Chưa xác nhận được kết quả gửi yêu cầu. Vui lòng kiểm tra Hoạt động của bạn trước khi gửi lại.'); }
      else setError(extractApiErrorMessage(e, 'Chưa gửi được lượt sửa. Vui lòng kiểm tra thông tin rồi thử lại.'));
    } finally { setBusy(false); }
  };

  const confirmSend = () => {
    if (problem || busy) { if (problem) setError(problem); return; }
    Alert.alert('Gửi lượt sửa?', `${devices.length} thiết bị, một kỹ thuật viên nhận cả lượt và bạn thanh toán một lần.`, [
      { text: 'Xem lại', style: 'cancel' },
      { text: 'Gửi yêu cầu', onPress: () => void send() },
    ]);
  };
  const sendConsult = async () => {
    const message = consultText.trim();
    if (!message) return;
    try {
      await visitGroupsApi.consultation({ message, devices: devices.map((d) => d.serviceName) });
      setConsultText(''); setConsultMsg('Đã gửi yêu cầu hỗ trợ. FixHome sẽ liên hệ với bạn.');
    } catch (e) { setConsultMsg(extractApiErrorMessage(e, 'Chưa gửi được yêu cầu hỗ trợ. Vui lòng thử lại.')); }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <BackButton />
        <Text accessibilityRole="header" style={styles.headerTitle}>Đặt nhiều thiết bị</Text>
      </View>
      {enabled === null ? <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
        : enabled === false ? (
          <View style={styles.center}>
            <Text style={styles.hint}>Hiện chưa đặt được nhiều thiết bị trong một lượt. Bạn có thể đặt từng thiết bị.</Text>
            <TouchableOpacity style={styles.secondary} onPress={() => navigation.goBack()} accessibilityRole="button"><Text style={styles.secondaryText}>Quay lại</Text></TouchableOpacity>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {!!loadError && <Text accessibilityRole="alert" style={styles.error}>{loadError}</Text>}
            <Text style={styles.hint}>Thêm từ 2 đến {limit} dịch vụ. Chọn từng máy để nhập mô tả và ảnh. Một kỹ thuật viên nhận cả lượt, bạn thanh toán một lần cho máy đã sửa xong.</Text>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow} accessibilityRole="tablist" testID="visit-chips">
              {devices.map((d, i) => {
                const selected = d.key === active?.key && !picking;
                const done = deviceComplete(d);
                return (
                  <TouchableOpacity
                    key={d.key}
                    testID={`visit-chip-${i + 1}`}
                    style={[styles.chip, selected && styles.chipOn]}
                    onPress={() => openChip(d.key)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`Máy ${i + 1}, ${d.serviceName}, ${done ? 'đã đủ thông tin' : 'cần bổ sung'}`}
                  >
                    {done
                      ? <CheckCircle2 size={iconSize.sm} color={colors.tone.success.fg} strokeWidth={iconStroke} />
                      : <AlertCircle size={iconSize.sm} color={colors.tone.warning.fg} strokeWidth={iconStroke} />}
                    <Text style={selected ? styles.chipTextOn : styles.chipText} numberOfLines={1}>Máy {i + 1} · {d.serviceName}</Text>
                  </TouchableOpacity>
                );
              })}
              {!atLimit && !busy && (
                <TouchableOpacity testID="visit-add-device" style={[styles.chip, styles.chipAdd, picking === 'add' && styles.chipOn]} onPress={() => startPick('add')} accessibilityRole="button" accessibilityLabel="Thêm dịch vụ">
                  <Plus size={iconSize.sm} color={colors.primaryStrong} strokeWidth={iconStroke} />
                  <Text style={styles.chipAddText}>Thêm dịch vụ</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
            {devices.length === 0 && !picking && <Text style={styles.hint}>Chưa có dịch vụ nào. Bấm “Thêm dịch vụ” để bắt đầu.</Text>}
            {unconfirmedCount > 0 && <Text style={styles.hint}>Trợ lý AI gợi ý {unconfirmedCount} máy. Mở từng máy để kiểm tra rồi xác nhận trước khi gửi.</Text>}

            {picking && (
              <View style={styles.card} testID="visit-service-picker">
                <Text style={styles.title}>{picking === 'add' ? `Chọn dịch vụ cho máy ${devices.length + 1}` : 'Đổi dịch vụ'}</Text>
                <TextInput value={query} onChangeText={setQuery} placeholder="Tìm dịch vụ" accessibilityLabel="Tìm dịch vụ" placeholderTextColor={colors.muted} style={styles.input} />
                {matches.map((s) => (
                  <TouchableOpacity key={s.id} style={styles.option} accessibilityRole="button" testID={`visit-service-${s.id}`} onPress={() => pickService(s)}>
                    <Text style={styles.value}>{s.name}</Text>
                  </TouchableOpacity>
                ))}
                {matches.length === 0 && <Text style={styles.hint}>Không tìm thấy dịch vụ phù hợp.</Text>}
                <TouchableOpacity style={styles.secondary} onPress={() => setPicking(null)} accessibilityRole="button"><Text style={styles.secondaryText}>Hủy</Text></TouchableOpacity>
              </View>
            )}

            {active && !picking && (
              <View style={styles.card} testID="visit-device-form">
                <View style={styles.row}>
                  <Text style={styles.title}>Máy {devices.indexOf(active) + 1}: {active.serviceName}</Text>
                </View>
                {!busy && (
                  <TouchableOpacity style={styles.linkBtn} onPress={() => startPick('change')} accessibilityRole="button" accessibilityLabel="Đổi dịch vụ"><Text style={styles.link}>Đổi dịch vụ</Text></TouchableOpacity>
                )}
                {active.unconfirmed && <Text style={styles.notice}>Trợ lý AI gợi ý máy này. Kiểm tra mô tả, thêm ảnh nếu có rồi bấm “Xác nhận máy này”.</Text>}
                <TextInput value={active.description} onChangeText={(t) => patch(active.key, { description: t })} multiline maxLength={VISIT_DESCRIPTION_MAX}
                  editable={!busy} placeholder="Mô tả tình trạng của thiết bị này" accessibilityLabel="Mô tả tình trạng" placeholderTextColor={colors.muted} style={[styles.input, styles.multiline]} />
                <View style={styles.row}>
                  <Text style={styles.hint}>Ảnh {active.photos.length}/{VISIT_PHOTOS_PER_DEVICE}</Text>
                  <TouchableOpacity style={styles.secondary} onPress={() => void pickPhotos()} disabled={busy || active.photos.length >= VISIT_PHOTOS_PER_DEVICE} accessibilityRole="button"><Text style={styles.secondaryText}>Thêm ảnh</Text></TouchableOpacity>
                </View>
                {active.photos.length > 0 && (
                  <View style={styles.photoRow}>
                    {active.photos.map((p, i) => (
                      <View key={p.uri} style={styles.photo}>
                        <Image source={{ uri: p.uri }} style={styles.photoImg} accessibilityLabel={`Ảnh ${i + 1}`} />
                        {!busy && (
                          <TouchableOpacity style={styles.photoX} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} onPress={() => patch(active.key, { photos: active.photos.filter((x) => x.uri !== p.uri) })} accessibilityRole="button" accessibilityLabel={`Bỏ ảnh ${i + 1}`}>
                            <X size={iconSize.sm} color={colors.surface} strokeWidth={iconStroke} />
                          </TouchableOpacity>
                        )}
                      </View>
                    ))}
                  </View>
                )}
                {!!formError && <Text accessibilityRole="alert" style={styles.error}>{formError}</Text>}
                {active.unconfirmed && (
                  <TouchableOpacity style={styles.primary} testID="visit-device-confirm" onPress={confirmActive} accessibilityRole="button"><Text style={styles.primaryText}>Xác nhận máy này</Text></TouchableOpacity>
                )}
                {!busy && (
                  <TouchableOpacity style={styles.linkBtn} testID="visit-device-remove" onPress={removeActive} accessibilityRole="button" accessibilityLabel={`Xóa máy ${devices.indexOf(active) + 1}`}><Text style={styles.danger}>Xóa máy này</Text></TouchableOpacity>
                )}
              </View>
            )}

            {atLimit && (
              <View style={styles.card}>
                <Text style={styles.title}>Đã đủ {limit}/{limit} thiết bị</Text>
                <Text style={styles.hint}>Cần sửa thêm? Liên hệ FixHome để được hỗ trợ.</Text>
                {!!hotline && <TouchableOpacity style={styles.linkBtn} onPress={() => void Linking.openURL(`tel:${hotline}`)} accessibilityRole="link"><Text style={styles.link}>Gọi {hotline}</Text></TouchableOpacity>}
                <TextInput value={consultText} onChangeText={setConsultText} multiline maxLength={1000} placeholder="Nội dung cần hỗ trợ" accessibilityLabel="Nội dung cần hỗ trợ" placeholderTextColor={colors.muted} style={[styles.input, styles.multiline]} />
                <TouchableOpacity style={styles.secondary} onPress={() => void sendConsult()} accessibilityRole="button"><Text style={styles.secondaryText}>Liên hệ FixHome hỗ trợ</Text></TouchableOpacity>
                {!!consultMsg && <Text style={styles.hint} accessibilityLiveRegion="polite">{consultMsg}</Text>}
              </View>
            )}

            {devices.length >= 1 && (
              <>
                <Text style={styles.section}>Địa chỉ sửa chữa</Text>
                {readyAddresses.length === 0 && <Text style={styles.error}>Chưa có địa chỉ có vị trí hợp lệ. Thêm địa chỉ trong Hồ sơ rồi quay lại.</Text>}
                {readyAddresses.map((a) => (
                  <TouchableOpacity key={a.id} style={[styles.option, addressId === a.id && styles.optionOn]} onPress={() => setAddressId(a.id)} accessibilityRole="radio" accessibilityState={{ selected: addressId === a.id }}>
                    <Text style={styles.value}>{a.label || 'Địa chỉ'}</Text>
                    <Text style={styles.hint}>{[a.line1, a.ward, a.district, a.province].filter(Boolean).join(', ')}</Text>
                  </TouchableOpacity>
                ))}
                <Text style={styles.section}>Thời gian hẹn</Text>
                <BookingSessionPicker value={schedule} onChange={setSchedule} />
                <TextInput value={note} onChangeText={setNote} multiline maxLength={1000} placeholder="Ghi chú cho thợ (không bắt buộc)" accessibilityLabel="Ghi chú cho thợ" placeholderTextColor={colors.muted} style={[styles.input, styles.multiline]} />
                <View style={styles.card} testID="visit-summary">
                  <Text style={styles.title}>Thiết bị trong lượt {devices.length}/{limit}</Text>
                  <Text style={styles.hint}>Giá công tạm tính: {visitPriceText(total, formatVnd) || 'Thợ báo giá tại nhà'}</Text>
                  <Text style={styles.hint}>{total.kind === 'firm' ? 'Tiền công theo phạm vi đã xác nhận; chưa gồm linh kiện FixHome hoặc tiền công phát sinh ngoài phạm vi. Kỹ thuật viên cần gửi báo giá, bạn duyệt trước khi thực hiện.' : 'Đây là giá tham khảo. Thợ báo giá từng máy, bạn duyệt máy nào thì sửa máy đó.'}</Text>
                </View>
                {devices.length < 2 && <Text style={styles.hint}>Hiện có 1 thiết bị. Thêm ít nhất 1 thiết bị nữa, hoặc đặt lịch thông thường cho 1 máy.</Text>}
                {devices.length >= 2 && !!problem && !error && <Text style={styles.hint} testID="visit-problem">{problem}</Text>}
                {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
                <TouchableOpacity
                  testID="visit-submit"
                  style={[styles.primary, (busy || unknownOutcome || !!problem) && styles.disabled]}
                  disabled={busy || unknownOutcome || !!problem}
                  onPress={confirmSend}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: busy || unknownOutcome || !!problem, busy }}
                >
                  {busy ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.primaryText}>{`Tiếp tục với ${devices.length} thiết bị`}</Text>}
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        )}
    </SafeAreaView>
  );
}

const getStyles = (colors: ReturnType<typeof useAppTheme>['colors']) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, gap: 4 },
  headerTitle: { flex: 1, fontSize: 18, lineHeight: 24, fontWeight: '700', color: colors.text },
  body: { padding: 16, gap: 12, paddingBottom: 48 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 16, gap: 8 },
  title: { flex: 1, fontSize: 16, lineHeight: 24, fontWeight: '600', color: colors.text },
  section: { fontSize: 16, lineHeight: 24, fontWeight: '700', color: colors.text, marginTop: 4 },
  value: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: colors.text },
  hint: { fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  notice: { fontSize: 14, lineHeight: 20, color: colors.tone.warning.text, backgroundColor: colors.tone.warning.bg, borderRadius: 8, padding: 8 },
  link: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.primaryStrong },
  linkBtn: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  danger: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.tone.danger.text },
  error: { fontSize: 14, lineHeight: 20, color: colors.tone.danger.text },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  chipRow: { gap: 8, paddingVertical: 4, alignItems: 'center' },
  chip: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: 240, paddingHorizontal: 14, borderRadius: 22, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  chipText: { flexShrink: 1, fontSize: 14, lineHeight: 20, fontWeight: '500', color: colors.textSecondary },
  chipTextOn: { flexShrink: 1, fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.primaryStrong },
  chipAdd: { borderStyle: 'dashed', borderColor: colors.primary },
  chipAddText: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.primaryStrong },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photo: { width: 72, height: 72, borderRadius: 8, overflow: 'visible' },
  photoImg: { width: 72, height: 72, borderRadius: 8, backgroundColor: colors.border },
  photoX: { position: 'absolute', top: -6, right: -6, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.text },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, color: colors.text, backgroundColor: colors.surface },
  multiline: { minHeight: 96, textAlignVertical: 'top' },
  option: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, justifyContent: 'center', gap: 2, backgroundColor: colors.surface },
  optionOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  primary: { minHeight: 48, borderRadius: 14, backgroundColor: colors.primaryStrong, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  primaryText: { color: colors.surface, fontSize: 14, fontWeight: '600' },
  secondary: { minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  secondaryText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  disabled: { opacity: 0.5 },
});
