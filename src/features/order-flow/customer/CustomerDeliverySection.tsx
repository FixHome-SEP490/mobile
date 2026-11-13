import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { partRequestsApi, type PartRequest } from '../../../api/part-requests.api';
import { w3DeliveryApi, type CustomerDeliveryState } from '../../../api/w3-delivery.api';
import { useAppTheme } from '../../../constants/theme';
import { extractApiErrorMessage } from '../../../utils/input-validation';
import {
  canCustomerConsent, ceilingRows, consentSummary, deliveryKind, deliveryProgress, isW3DeliveryRequest, splitPreview,
} from './customer-delivery';

type Row = { request: PartRequest; state: CustomerDeliveryState | null; error: string | null };

export default function CustomerDeliverySection({ orderId, refreshKey }: { orderId: string; refreshKey?: unknown }) {
  const { colors } = useAppTheme();
  const styles = getStyles(colors);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<Record<string, string>>({});
  const generation = useRef(0);

  const load = useCallback(async () => {
    const token = ++generation.current;
    setLoading(true);
    try {
      const requests = (await partRequestsApi.getByOrderId(orderId)).filter(isW3DeliveryRequest);
      const next = await Promise.all(requests.map(async (request): Promise<Row> => {
        try {
          let state = deliveryKind(request) === 'free'
            ? await w3DeliveryApi.readFree(request.id)
            : await w3DeliveryApi.readPaid(request.id);
          if (state?.kind === 'paid') {
            // Physical progress lives on the base delivery read for both kinds.
            const physical = await w3DeliveryApi.readFree(request.id).catch(() => null);
            state = { ...state, physicalStatus: physical?.physicalStatus ?? null };
          }
          return { request, state, error: null };
        } catch (error) {
          const status = (error as { response?: { status?: number } })?.response?.status;
          return { request, state: null, error: status === 404 || status === 403 || status === 503 ? null : 'Chưa tải được thông tin giao linh kiện.' };
        }
      }));
      if (token === generation.current) setRows(next);
    } catch {
      if (token === generation.current) setRows([]);
    } finally {
      if (token === generation.current) setLoading(false);
    }
  }, [orderId]);

  useEffect(() => { void load(); }, [load, refreshKey]);

  const consent = async (row: Row) => {
    if (!row.state || busyId) return;
    setBusyId(row.request.id);
    setMessage(prev => ({ ...prev, [row.request.id]: '' }));
    try {
      await w3DeliveryApi.consent(row.request.id, row.state);
      setAccepted(prev => ({ ...prev, [row.request.id]: false }));
      await load();
    } catch (error) {
      setMessage(prev => ({ ...prev, [row.request.id]: extractApiErrorMessage(error, 'Chưa ghi nhận được đồng ý. Vui lòng tải lại và thử lại.') }));
      await load();
    } finally {
      setBusyId(null);
    }
  };

  if (!rows.length) return loading ? <ActivityIndicator style={{ marginVertical: 8 }} color={colors.primary} /> : null;

  return (
    <View style={styles.card} testID="customer-delivery-section">
      <Text style={styles.title}>Giao linh kiện</Text>
      {rows.map((row) => {
        const { request, state } = row;
        const preview = state ? splitPreview(state) : null;
        const ceilings = state ? ceilingRows(state) : [];
        const progress = state ? deliveryProgress(state) : [];
        const allowed = canCustomerConsent(state, request.shippingFee);
        return (
          <View key={request.id} style={styles.block} testID={`customer-delivery-${request.id}`}>
            <Text style={styles.meta}>{request.items.map(item => `${item.partNameSnapshot} × ${item.quantity}`).join(', ') || 'Linh kiện phát sinh'}</Text>
            {row.error ? <Text style={styles.error}>{row.error}</Text> : null}
            {!state && !row.error ? <Text style={styles.meta}>Đang chờ quản lý dịch vụ đề xuất phí giao.</Text> : null}
            {state ? <Text style={styles.text} testID={`customer-delivery-summary-${request.id}`}>{consentSummary(state)}</Text> : null}
            {preview ? (
              <View style={styles.box} testID={`customer-delivery-preview-${request.id}`}>
                <Text style={styles.boxTitle}>{preview.title}</Text>
                {preview.rows.map(([label, value]) => (
                  <View key={label} style={styles.row}><Text style={styles.meta}>{label}</Text><Text style={styles.value}>{value}</Text></View>
                ))}
              </View>
            ) : null}
            {ceilings.length ? (
              <View style={styles.box} testID={`customer-delivery-ceilings-${request.id}`}>
                <Text style={styles.boxTitle}>Mức trần đã ghi nhận</Text>
                {ceilings.map(([label, value]) => (
                  <View key={label} style={styles.row}><Text style={styles.meta}>{label}</Text><Text style={styles.value}>{value}</Text></View>
                ))}
              </View>
            ) : null}
            {state?.actualShippingFee !== null && state?.actualShippingFee !== undefined ? (
              <View style={styles.row}><Text style={styles.meta}>Phí giao thực tế</Text><Text style={styles.value}>{`${state.actualShippingFee.toLocaleString('vi-VN')} ₫`}</Text></View>
            ) : null}
            {allowed ? (
              <View style={styles.consent}>
                <View style={styles.row}>
                  <Text style={[styles.text, { flex: 1 }]}>
                    {state?.kind === 'free'
                      ? 'Tôi đồng ý nhận linh kiện qua giao hàng với phí giao 0 ₫.'
                      : 'Tôi đồng ý trả phần phí giao của mình theo tỷ lệ 70/30, không vượt mức trần ở trên.'}
                  </Text>
                  <Switch testID={`customer-delivery-accept-${request.id}`} accessibilityLabel="Đồng ý điều khoản giao linh kiện"
                    value={!!accepted[request.id]} onValueChange={(value) => setAccepted(prev => ({ ...prev, [request.id]: value }))} />
                </View>
                <TouchableOpacity testID={`customer-delivery-consent-${request.id}`} accessibilityRole="button"
                  disabled={!accepted[request.id] || busyId !== null}
                  style={[styles.button, (!accepted[request.id] || busyId !== null) && { opacity: 0.5 }]}
                  onPress={() => void consent(row)}>
                  {busyId === request.id ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Đồng ý điều khoản giao</Text>}
                </TouchableOpacity>
              </View>
            ) : null}
            {message[request.id] ? <Text style={styles.error}>{message[request.id]}</Text> : null}
            {state?.customerConsented && state.technicianConsented ? (
              <View testID={`customer-delivery-progress-${request.id}`} style={{ gap: 4 }}>
                <Text style={styles.boxTitle}>Tiến trình giao</Text>
                {progress.map(step => (
                  <Text key={step.label} style={[styles.meta, step.done && { color: colors.text, fontWeight: '600' }]}>
                    {step.done ? '✓ ' : '○ '}{step.label}
                  </Text>
                ))}
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const getStyles = (colors: any) => StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 16, padding: 16, gap: 12 },
  title: { fontSize: 18, lineHeight: 26, fontWeight: '700', color: colors.text },
  block: { gap: 8, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 },
  text: { fontSize: 14, lineHeight: 20, color: colors.text },
  meta: { fontSize: 13, lineHeight: 19, color: colors.textSecondary },
  value: { fontSize: 14, fontWeight: '600', color: colors.text },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  box: { gap: 4, padding: 12, borderRadius: 10, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  boxTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  consent: { gap: 8 },
  button: { minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryStrong },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  error: { fontSize: 13, color: colors.danger },
});
