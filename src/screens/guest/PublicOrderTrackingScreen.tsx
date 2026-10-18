import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useIsFocused, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../types';
import {
  publicOrderTrackingApi,
  PublicOrderTrackingRateLimitError,
  type PublicOrderTrackingQuery,
  type PublicOrderTrackingResult,
} from '../../api/public-order-tracking.api';
import { lightTheme as colors, spacing } from '../../constants/theme';
import { serviceOrderStatusView } from '../technician/technician-status';
import { vnDateTimeString } from '../../utils/vn-time';
import PublicOrderTrackingMap from './PublicOrderTrackingMap';

const POLL_INTERVAL_MS = 15_000;
const MAX_LOCATION_AGE_MS = 120_000;
const ACTIVE_STATUSES = new Set(['EN_ROUTE', 'UNDER_REPAIR']);

type PublicOrderTrackingView = Omit<PublicOrderTrackingResult, 'technicianLocation' | 'destination'> & { technicianLocationUpdatedAt: string | null };
type Coordinates = { lat: number; lng: number };
type FreshMapCoordinates = {
  technicianLocation: Coordinates;
  destination: Coordinates | null;
  updatedAt: number;
  expiresAt: number;
};

function validCoordinates(value: Coordinates | null | undefined): Coordinates | null {
  if (!value || !Number.isFinite(value.lat) || Math.abs(value.lat) > 90
    || !Number.isFinite(value.lng) || Math.abs(value.lng) > 180) return null;
  return { lat: value.lat, lng: value.lng };
}

function freshMapCoordinates(result: PublicOrderTrackingResult, now: number): FreshMapCoordinates | null {
  const location = result.technicianLocation;
  const technicianLocation = validCoordinates(location);
  const updatedAt = location?.updatedAt ? Date.parse(location.updatedAt) : Number.NaN;
  const age = now - updatedAt;
  if (!ACTIVE_STATUSES.has(result.status) || !technicianLocation || !Number.isFinite(updatedAt)
    || age < -60_000 || age > MAX_LOCATION_AGE_MS) return null;
  return {
    technicianLocation,
    destination: validCoordinates(result.destination),
    updatedAt,
    expiresAt: updatedAt + MAX_LOCATION_AGE_MS,
  };
}

function lookupErrorText(error: unknown): string {
  if (error instanceof PublicOrderTrackingRateLimitError) {
    return `Quá nhiều lượt tra cứu. Vui lòng thử lại sau ${Math.max(1, Math.ceil(error.retryAfterMs / 1000))} giây.`;
  }
  return error instanceof Error && error.message
    ? error.message
    : 'Không thể tra cứu lúc này. Vui lòng thử lại.';
}

export default function PublicOrderTrackingScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const focused = useIsFocused();
  const [orderCode, setOrderCode] = useState('');
  const [phone, setPhone] = useState('');
  const [tracking, setTracking] = useState<PublicOrderTrackingView | null>(null);
  const [mapCoordinates, setMapCoordinates] = useState<FreshMapCoordinates | null>(null);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const mapCoordinatesRef = useRef<FreshMapCoordinates | null>(null);
  const updateMapCoordinates = useCallback((next: FreshMapCoordinates | null) => {
    mapCoordinatesRef.current = next;
    setMapCoordinates(next);
  }, []);
  const focusedRef = useRef(false);
  const appStateRef = useRef(AppState.currentState ?? 'active');
  const requestSequenceRef = useRef(0);
  const inFlightRef = useRef(0);
  const pollEnabledRef = useRef(false);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const queryInputRef = useRef<PublicOrderTrackingQuery>({ orderCode: '', phone: '' });
  const latestQueryRef = useRef<PublicOrderTrackingQuery | null>(null);

  const clearPrivateState = useCallback(() => {
    requestSequenceRef.current += 1;
    pollEnabledRef.current = false;
    latestQueryRef.current = null;
    queryInputRef.current = { orderCode: '', phone: '' };
    setOrderCode('');
    setPhone('');
    setTracking(null);
    updateMapCoordinates(null);
    setError('');
    setLoading(false);
  }, [updateMapCoordinates]);

  const performLookup = useCallback(async (source: 'manual' | 'poll') => {
    if (!focusedRef.current || appStateRef.current !== 'active') return;
    if (source === 'poll' && (!pollEnabledRef.current || inFlightRef.current > 0)) return;
    const query = source === 'manual' ? queryInputRef.current : latestQueryRef.current;
    if (!query) return;
    if (!query.orderCode.trim() || !query.phone.trim()) {
      if (source === 'manual') setError('Nhập mã đơn và số điện thoại đã đăng ký.');
      return;
    }

    const sequence = ++requestSequenceRef.current;
    if (source === 'manual') {
      pollEnabledRef.current = false;
      latestQueryRef.current = { orderCode: query.orderCode.trim(), phone: query.phone.trim() };
      setTracking(null);
      updateMapCoordinates(null);
      setError('');
      setLoading(true);
    }
    inFlightRef.current += 1;
    try {
      const next = await publicOrderTrackingApi.lookup(query);
      if (sequence !== requestSequenceRef.current || !focusedRef.current || appStateRef.current !== 'active') return;
      const freshCoordinates = freshMapCoordinates(next, Date.now());
      const safeResult: PublicOrderTrackingView = {
        code: next.code,
        status: next.status,
        ...(next.serviceName !== undefined ? { serviceName: next.serviceName } : {}),
        ...(next.technician ? { technician: next.technician } : {}),
        timeline: next.timeline,
        technicianLocationUpdatedAt: freshCoordinates ? next.technicianLocation?.updatedAt ?? null : null,
      };
      setTracking(safeResult);
      updateMapCoordinates(freshCoordinates);
      setError('');
      pollEnabledRef.current = ACTIVE_STATUSES.has(safeResult.status);
    } catch (lookupError) {
      if (sequence !== requestSequenceRef.current || !focusedRef.current || appStateRef.current !== 'active') return;
      pollEnabledRef.current = false;
      setTracking(null);
      updateMapCoordinates(null);
      setError(lookupErrorText(lookupError));
    } finally {
      inFlightRef.current = Math.max(0, inFlightRef.current - 1);
      if (sequence === requestSequenceRef.current) setLoading(false);
    }
  }, [updateMapCoordinates]);

  const onQueryChange = (key: 'orderCode' | 'phone', value: string) => {
    requestSequenceRef.current += 1;
    pollEnabledRef.current = false;
    latestQueryRef.current = null;
    queryInputRef.current = { ...queryInputRef.current, [key]: value };
    setTracking(null);
    updateMapCoordinates(null);
    setError('');
    setLoading(false);
    if (key === 'orderCode') setOrderCode(value);
    else setPhone(value);
  };

  useFocusEffect(useCallback(() => {
    focusedRef.current = true;
    pollTimerRef.current = setInterval(() => {
      if (focusedRef.current && appStateRef.current === 'active' && pollEnabledRef.current) void performLookup('poll');
    }, POLL_INTERVAL_MS);
    return () => {
      focusedRef.current = false;
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
      clearPrivateState();
    };
  }, [clearPrivateState, performLookup]));

  useEffect(() => {
    appStateRef.current = AppState.currentState ?? 'active';
    setForeground(appStateRef.current === 'active');
    const subscription = AppState.addEventListener('change', nextState => {
      appStateRef.current = nextState;
      setForeground(nextState === 'active');
      if (nextState !== 'active') clearPrivateState();
    });
    return () => subscription.remove();
  }, [clearPrivateState]);

  useEffect(() => {
    if (!mapCoordinates) return undefined;
    const timeout = setTimeout(() => {
      if (mapCoordinatesRef.current !== mapCoordinates) return;
      updateMapCoordinates(null);
      setTracking(current => current?.technicianLocationUpdatedAt
        && Date.parse(current.technicianLocationUpdatedAt) === mapCoordinates.updatedAt
        ? { ...current, technicianLocationUpdatedAt: null }
        : current);
    }, Math.max(1, mapCoordinates.expiresAt - Date.now() + 1));
    return () => clearTimeout(timeout);
  }, [mapCoordinates, updateMapCoordinates]);

  const statusLabel = tracking ? serviceOrderStatusView(tracking.status).label : '';

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable testID="public-tracking-back" accessibilityRole="button" accessibilityLabel="Quay lại" onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <Text style={styles.title} accessibilityRole="header">Tra cứu đơn sửa chữa</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.intro}>Nhập mã đơn và số điện thoại đã đăng ký trên đơn.</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Mã đơn</Text>
          <TextInput
            testID="public-tracking-code"
            value={orderCode}
            onChangeText={value => onQueryChange('orderCode', value)}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={50}
            returnKeyType="next"
            placeholder="Ví dụ FH-20261017-AB12CD34"
            placeholderTextColor={colors.muted}
            accessibilityLabel="Mã đơn sửa chữa"
            style={styles.input}
          />
          <Text style={styles.label}>Số điện thoại đã đăng ký</Text>
          <TextInput
            testID="public-tracking-phone"
            value={phone}
            onChangeText={value => onQueryChange('phone', value)}
            keyboardType="phone-pad"
            autoComplete="tel"
            maxLength={20}
            returnKeyType="search"
            onSubmitEditing={() => void performLookup('manual')}
            placeholder="Số điện thoại đăng ký đơn"
            placeholderTextColor={colors.muted}
            accessibilityLabel="Số điện thoại đã đăng ký"
            style={styles.input}
          />
          <Pressable
            testID="public-tracking-submit"
            accessibilityRole="button"
            accessibilityState={{ disabled: loading, busy: loading }}
            disabled={loading}
            onPress={() => void performLookup('manual')}
            style={[styles.submitButton, loading && styles.disabledButton]}
          >
            {loading ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.submitText}>Tra cứu</Text>}
          </Pressable>
        </View>
        {error ? <Text testID="public-tracking-error" accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {tracking ? (
          <View testID="public-tracking-result" style={styles.card}>
            <Text style={styles.orderCode}>{tracking.code}</Text>
            {tracking.serviceName ? <Text style={styles.body}>{tracking.serviceName}</Text> : null}
            <Text style={styles.status}>{statusLabel}</Text>
            {tracking.technician?.fullName ? <Text style={styles.body}>Kỹ thuật viên {tracking.technician.fullName}</Text> : null}
            {ACTIVE_STATUSES.has(tracking.status) ? (
              <View testID="public-tracking-location" style={styles.location}>
                <Text style={styles.locationTitle}>Vị trí kỹ thuật viên</Text>
                <Text style={styles.body}>{tracking.technicianLocationUpdatedAt ? `Đang cập nhật · ${vnDateTimeString(tracking.technicianLocationUpdatedAt)}` : 'Chưa có vị trí mới từ thợ.'}</Text>
                {mapCoordinates && focused && foreground ? (
                  <PublicOrderTrackingMap
                    technicianLocation={mapCoordinates.technicianLocation}
                    destination={mapCoordinates.destination}
                  />
                ) : null}
              </View>
            ) : null}
            <Text style={styles.timelineTitle}>Cập nhật đơn hàng</Text>
            {tracking.timeline.map((item, index) => (
              <View key={`${item.status}-${item.timestamp}-${index}`} style={styles.timelineRow}>
                <Text style={styles.timelineStatus}>{serviceOrderStatusView(item.status as PublicOrderTrackingResult['status']).label}</Text>
                <Text style={styles.timelineTime}>{vnDateTimeString(item.timestamp)}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = {
  safeArea: { flex: 1, backgroundColor: colors.background },
  header: { minHeight: 56, paddingHorizontal: spacing.md, flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  backButton: { width: 44, height: 44, alignItems: 'center' as const, justifyContent: 'center' as const },
  backText: { fontSize: 30, lineHeight: 34, color: colors.primaryStrong },
  title: { color: colors.text, fontSize: 18, fontWeight: '700' as const },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  intro: { color: colors.textSecondary, fontSize: 14, lineHeight: 21 },
  card: { padding: spacing.md, gap: spacing.sm, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  label: { color: colors.text, fontSize: 14, fontWeight: '600' as const, marginTop: spacing.xs },
  input: { minHeight: 48, paddingHorizontal: spacing.sm, borderRadius: 10, borderWidth: 1, borderColor: colors.border, color: colors.text, backgroundColor: colors.background, fontSize: 15 },
  submitButton: { minHeight: 50, marginTop: spacing.xs, alignItems: 'center' as const, justifyContent: 'center' as const, borderRadius: 12, backgroundColor: colors.primaryStrong },
  disabledButton: { opacity: 0.65 },
  submitText: { color: colors.surface, fontSize: 15, fontWeight: '700' as const },
  error: { color: colors.error, fontSize: 14, lineHeight: 20 },
  orderCode: { color: colors.text, fontSize: 18, fontWeight: '800' as const },
  body: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
  status: { color: colors.primaryStrong, fontSize: 16, fontWeight: '700' as const, marginTop: spacing.xs },
  location: { marginTop: spacing.xs, padding: spacing.sm, borderRadius: 10, backgroundColor: colors.primarySoft, gap: 4 },
  locationTitle: { color: colors.primaryStrong, fontSize: 13, fontWeight: '700' as const },
  timelineTitle: { color: colors.text, fontSize: 15, fontWeight: '700' as const, marginTop: spacing.md },
  timelineRow: { paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider, gap: 2 },
  timelineStatus: { color: colors.text, fontSize: 14, fontWeight: '600' as const },
  timelineTime: { color: colors.textSecondary, fontSize: 12 },
};
