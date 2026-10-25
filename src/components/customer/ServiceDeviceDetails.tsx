// src/components/customer/ServiceDeviceDetails.tsx
//
// P012 (owner contract 19/10/2026), as on the web: the device facts the server needs to qualify one
// of the approved Catalog V2 scopes, plus the server's own answer for the selected service.
// This component never computes money. It only shows what `GET /services/:id/catalog-v2-pricing`
// said, and hands the booking a variant code only after the server confirmed it with FIXED_PRICE.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAppTheme } from '../../constants/theme';
import {
  catalogPricingApi,
  type BookingDeviceAttributes,
  type CatalogPricingPreview,
} from '../../api/catalog-pricing.api';
import { formatVnd } from '../../utils/format';

type LoadState = 'loading' | 'ready' | 'failed';

const MOUNTING = [{ value: 'wall', label: 'Treo tường' }, { value: 'ceiling', label: 'Âm trần cassette' }, { value: 'floor', label: 'Tủ đứng' }] as const;

const HORSEPOWER = [{ value: 'up_to_1_5', label: '≤ 1.5 HP' }, { value: '2_to_2_5', label: '2 – 2.5 HP' }] as const;
const WASHER_STYLE = [{ value: 'top', label: 'Cửa trên' }, { value: 'front', label: 'Cửa ngang' }] as const;
const WASHER_DRYER = [{ value: 'no', label: 'Không sấy' }, { value: 'yes', label: 'Có sấy' }] as const;
const WASHER_KG = [{ value: 9, label: '≤ 9 kg' }, { value: 10, label: 'Trên 9 kg' }] as const;

interface Props {
  serviceId: string;
  deviceAttributes: BookingDeviceAttributes;
  selectedVariantCode: string | null;
  disabled?: boolean;
  onChangeAttributes: (next: BookingDeviceAttributes) => void;
  onChangeVariantCode: (code: string | null) => void;
  /** Latest server answer, so later steps only repeat what the server said. */
  onPreview: (preview: CatalogPricingPreview | null) => void;
}

function Choice<T extends string | number>({ title, options, value, onPick, disabled, testID }: {
  title: string;
  options: readonly { value: T; label: string }[];
  value: T | undefined;
  onPick: (v: T) => void;
  disabled: boolean;
  testID: string;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.group} testID={testID}>
      <Text style={[styles.legend, { color: colors.text }]}>{title}</Text>
      <View style={styles.chips}>
        {options.map((o) => {
          const on = value === o.value;
          return (
            <TouchableOpacity
              key={String(o.value)}
              accessibilityRole="radio"
              accessibilityState={{ checked: on, disabled }}
              disabled={disabled}
              onPress={() => onPick(o.value)}
              style={[styles.chip, { borderColor: on ? colors.primary : colors.border, backgroundColor: colors.surface, opacity: disabled ? 0.6 : 1 }]}
            >
              <Text style={{ color: on ? colors.primaryStrong : colors.text, fontWeight: on ? '700' : '500' }}>{o.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export default function ServiceDeviceDetails({
  serviceId, deviceAttributes, selectedVariantCode, disabled = false, onChangeAttributes, onChangeVariantCode, onPreview,
}: Props) {
  const { colors } = useAppTheme();
  const [preview, setPreview] = useState<CatalogPricingPreview | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [requestedCode, setRequestedCode] = useState<string | null>(selectedVariantCode);
  const token = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const live = useRef({ selectedVariantCode, attrs: deviceAttributes, onPreview, onChangeVariantCode });
  useEffect(() => {
    live.current = { selectedVariantCode, attrs: deviceAttributes, onPreview, onChangeVariantCode };
  });

  const announce = useCallback((code: string | null) => {
    if (live.current.selectedVariantCode !== code) live.current.onChangeVariantCode(code);
  }, []);

  const load = useCallback(async (attrs: BookingDeviceAttributes, code: string | null) => {
    const mine = ++token.current;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    // A fact or scope change invalidates the previous advisory price at once.
    setPreview(null);
    live.current.onPreview(null);
    setState('loading');
    try {
      const result = await catalogPricingApi.getPreview(serviceId, { ...attrs, ...(code ? { selectedVariantCode: code } : {}) }, controller.signal);
      if (mine !== token.current) return;
      setPreview(result);
      setState('ready');
      live.current.onPreview(result);
      announce(result.status === 'FIXED_PRICE' && result.selectedVariant ? result.selectedVariant.variantCode : null);
    } catch {
      if (mine !== token.current) return;
      // A V2 service always has a preview; hiding the section here would leave the customer blocked with no way forward.
      setState('failed');
      live.current.onPreview(null);
      announce(null);
    }
  }, [serviceId, announce]);

  useEffect(() => {
    setRequestedCode(live.current.selectedVariantCode);
    void load(live.current.attrs, live.current.selectedVariantCode);
    return () => { token.current += 1; abort.current?.abort(); };
  }, [load]);

  const applyFacts = (next: BookingDeviceAttributes) => {
    onChangeAttributes(next);
    setRequestedCode(null);
    announce(null);
    void load(next, null);
  };
  const chooseScope = (code: string) => {
    setRequestedCode(code);
    announce(null);
    void load(deviceAttributes, code);
  };

  const busy = state === 'loading' || disabled;
  const missing = new Set(preview?.missingAttributes ?? []);
  const a = deviceAttributes;
  const showMounting = missing.has('acMounting') || !!a.acMounting;
  const showHp = (missing.has('acHorsepower') || !!a.acHorsepower) && a.acMounting !== 'ceiling' && a.acMounting !== 'floor';
  const hasDryer = a.washerHasDryer === true;
  const showStyle = !hasDryer && (missing.has('washerLoadingStyle') || !!a.washerLoadingStyle);
  const showKg = !hasDryer && (missing.has('washerCapacityKg') || typeof a.washerCapacityKg === 'number');
  const showDryer = showStyle || showKg || a.washerHasDryer !== undefined;
  const variants = preview?.possibleVariants ?? [];
  const showScopes = variants.length > 0 && (missing.has('service-specific-scope-confirmation')
    || (preview?.status === 'FIXED_PRICE' && variants.length > 1));
  const confirmed = preview?.status === 'FIXED_PRICE' ? preview.selectedVariant : null;
  const range = preview?.priceRange ?? null;

  // Inspection-only result: the booking price card already says "thợ khảo sát, báo giá", so the box would be a bare title.
  if (state === 'ready' && !showMounting && !showHp && !showDryer && !showScopes && !confirmed && !range) return null;

  return (
    <View style={styles.wrap} testID="service-device-details">
    <View style={styles.head}>
      <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>Thông tin thiết bị & phạm vi tiền công</Text>
      {state === 'loading' ? <ActivityIndicator size="small" color={colors.primary} accessibilityLabel="Đang kiểm tra phạm vi giá" /> : null}
    </View>
    <View style={[styles.box, { backgroundColor: colors.surface, borderColor: colors.border }]}>

      {showMounting || showHp || showStyle || showKg || showDryer ? (
        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          Trả lời vài thông tin để hệ thống đối chiếu đúng phạm vi đã được duyệt cho thiết bị của bạn.
        </Text>
      ) : null}
      {showMounting ? <Choice testID="device-fact-ac-mounting" title="Cách lắp đặt dàn lạnh" options={MOUNTING} value={a.acMounting} disabled={busy}
        onPick={(v) => { const n = { ...a, acMounting: v }; if (v === 'ceiling' || v === 'floor') delete n.acHorsepower; applyFacts(n); }} /> : null}
      {showHp ? <Choice testID="device-fact-ac-horsepower" title="Công suất máy lạnh" options={HORSEPOWER} value={a.acHorsepower} disabled={busy}
        onPick={(v) => applyFacts({ ...a, acHorsepower: v })} /> : null}
      {showDryer ? <Choice testID="device-fact-washer-dryer" title="Chức năng sấy" options={WASHER_DRYER} value={a.washerHasDryer === undefined ? undefined : a.washerHasDryer ? 'yes' : 'no'} disabled={busy}
        onPick={(v) => { const n = { ...a, washerHasDryer: v === 'yes' }; if (v === 'yes') { delete n.washerLoadingStyle; delete n.washerCapacityKg; } applyFacts(n); }} /> : null}
      {showStyle ? <Choice testID="device-fact-washer-style" title="Kiểu cửa máy giặt" options={WASHER_STYLE} value={a.washerLoadingStyle} disabled={busy}
        onPick={(v) => applyFacts({ ...a, washerLoadingStyle: v })} /> : null}
      {showKg ? <Choice testID="device-fact-washer-capacity" title="Khối lượng giặt mỗi lần" options={WASHER_KG} value={a.washerCapacityKg as 9 | 10 | undefined} disabled={busy}
        onPick={(v) => applyFacts({ ...a, washerCapacityKg: v })} /> : null}

      {showScopes ? (
        <View style={styles.group} testID="device-scope-options">
          <Text style={[styles.legend, { color: colors.text }]}>Chọn đúng phạm vi công việc</Text>
          {variants.map((o) => {
            const on = requestedCode === o.variantCode;
            return (
              <TouchableOpacity
                key={o.variantCode}
                accessibilityRole="radio"
                accessibilityState={{ checked: on, disabled: busy }}
                disabled={busy}
                onPress={() => chooseScope(o.variantCode)}
                style={[styles.scope, { borderColor: on ? colors.primary : colors.border }]}
              >
                <Text style={[styles.scopeText, { color: colors.text }]}>{o.scopeVi}</Text>
                <Text style={{ color: colors.primaryStrong, fontWeight: '700' }}>{formatVnd(o.laborPriceVnd)}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}

      {state !== 'failed' && confirmed ? (
        <View style={[styles.result, { borderColor: colors.primary }]} testID="pricing-confirmed">
          <Text style={[styles.legend, { color: colors.primaryStrong }]}>Phạm vi đã xác nhận</Text>
          <Text style={{ color: colors.text, fontWeight: '600' }}>{confirmed.scopeVi}</Text>
          <Text style={{ color: colors.primaryStrong, fontWeight: '700' }}>{`${formatVnd(confirmed.laborPriceVnd)} tiền công`}</Text>
          <Text style={[styles.hint, { color: colors.textSecondary }]}>Tiền công theo phạm vi đã chọn, chưa gồm linh kiện và vật tư.</Text>
        </View>
      ) : state !== 'failed' && range ? (
        <View style={[styles.result, { borderColor: colors.tone.warning.text, backgroundColor: colors.tone.warning.bg }]} testID="pricing-reference-range">
          <Text style={{ color: colors.tone.warning.text, fontWeight: '600' }}>Giá tham khảo — thợ khảo sát và báo giá, khách duyệt</Text>
          <Text style={{ color: colors.tone.warning.text, fontWeight: '700' }}>{`${formatVnd(range.minLaborVnd)} – ${formatVnd(range.maxLaborVnd)}`}</Text>
        </View>
      ) : null}

      {state === 'failed' ? (
        <View style={[styles.result, { borderColor: colors.error }]} accessibilityRole="alert" testID="pricing-load-error">
          <Text style={{ color: colors.error }}>Chưa tải được thông tin giá của dịch vụ.</Text>
          <TouchableOpacity onPress={() => void load(deviceAttributes, requestedCode)} accessibilityRole="button" style={styles.retry}>
            <Text style={{ color: colors.primaryStrong, fontWeight: '700' }}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  box: { borderWidth: 1, borderRadius: 14, padding: 16, gap: 12 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { fontSize: 16, lineHeight: 24, fontWeight: '700', flexShrink: 1 },
  hint: { fontSize: 12, lineHeight: 18 },
  group: { gap: 8 },
  legend: { fontSize: 12, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, paddingHorizontal: 14, borderWidth: 1, borderRadius: 10, justifyContent: 'center' },
  scope: { minHeight: 44, borderWidth: 1, borderRadius: 12, padding: 12, flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  scopeText: { flex: 1, fontSize: 13, fontWeight: '600' },
  result: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 4 },
  retry: { minHeight: 44, justifyContent: 'center' },
});
