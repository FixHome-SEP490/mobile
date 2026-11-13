// W3 part delivery for the technician (TECHNICIAN 58-62): terms + split preview, consent by quote
// version, warehouse reserve, receipt evidence. Same routes as web DeliveryOperationsPanel/DeliveryTermsPanel.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { partRequestsApi, type PartRequest } from '../../../api/part-requests.api';
import { newCommandId, w3DeliveryApi, type DeliveryState } from '../../../api/w3-delivery.api';
import { useAppTheme } from '../../../constants/theme';
import { extractApiErrorMessage } from '../../../utils/input-validation';
import { deliveryKind, isW3DeliveryRequest } from '../customer/customer-delivery';
import { captureCameraPhoto } from './camera-capture';
import {
  canRecordReceipt, canReserve, canTechnicianConsent, physicalStatusText, technicianCeilingRows,
  technicianDeliverySummary, technicianSplitPreview,
} from './technician-delivery';

type Row = { request: PartRequest; state: DeliveryState | null; error: string | null };

async function readState(request: PartRequest): Promise<DeliveryState | null> {
  if (deliveryKind(request) === 'free') return w3DeliveryApi.readFree(request.id);
  const paid = await w3DeliveryApi.readPaid(request.id);
  if (!paid) return null;
  // Physical progress lives on the base delivery read for both kinds.
  const base = await w3DeliveryApi.readFree(request.id).catch(() => null);
  return { ...paid, physicalStatus: base?.physicalStatus ?? null, physicalVersion: base?.physicalVersion ?? null,
    physicalWarehouseId: base?.physicalWarehouseId ?? null };
}

export default function TechnicianDeliverySection({ orderId, refreshKey, onChanged }: { orderId: string; refreshKey?: unknown; onChanged?: () => void }) {
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
          return { request, state: await readState(request), error: null };
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

  const run = async (row: Row, work: (state: DeliveryState) => Promise<string | null>, failure: string) => {
    if (!row.state || busyId) return;
    const id = row.request.id;
    setBusyId(id);
    setMessage(prev => ({ ...prev, [id]: '' }));
    try {
      const done = await work(row.state);
      if (done !== null) {
        setMessage(prev => ({ ...prev, [id]: done }));
        onChanged?.();
      }
    } catch (error) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      setMessage(prev => ({ ...prev, [id]: status === 409 ? 'Trạng thái giao đã thay đổi. Đã tải lại, vui lòng xem lại.' : extractApiErrorMessage(error, failure) }));
    } finally {
      setBusyId(null);
      await load();
    }
  };

  const consent = (row: Row) => run(row, async (state) => {
    await w3DeliveryApi.consent(row.request.id, state, 'technician');
    setAccepted(prev => ({ ...prev, [row.request.id]: false }));
    return 'Đã ghi nhận bạn đồng ý điều khoản giao.';
  }, 'Chưa ghi nhận được đồng ý. Vui lòng thử lại.');

  const reserve = (row: Row) => run(row, async (state) => {
    await w3DeliveryApi.physical(row.request.id, 'reserve', { commandId: newCommandId(), expectedVersion: state.physicalVersion ?? 0 });
    return 'Đã gửi yêu cầu kho giữ linh kiện.';
  }, 'Chưa giữ được linh kiện ở kho. Vui lòng thử lại.');

  const receipt = (row: Row) => run(row, async (state) => {
    if (!state.quote || !state.physicalWarehouseId) return null;
    const shot = await captureCameraPhoto();
    if (!shot.ok) {
      setMessage(prev => ({ ...prev, [row.request.id]: shot.reason === 'cancelled' ? '' : shot.message }));
      return null;
    }
    const evidenceId = await w3DeliveryApi.uploadReceiptEvidence(row.request.id,
      { warehouseId: state.physicalWarehouseId, quoteVersion: state.quote.quoteVersion, image: shot.asset });
    await w3DeliveryApi.physical(row.request.id, 'receipt', { commandId: newCommandId(), expectedVersion: state.physicalVersion ?? 0, evidenceId });
    return 'Đã ghi nhận bạn nhận linh kiện kèm ảnh.';
  }, 'Chưa ghi nhận được việc nhận linh kiện. Vui lòng thử lại.');

  if (!rows.length) return loading ? <ActivityIndicator style={{ marginVertical: 8 }} color={colors.primary} /> : null;

  return (
    <View style={styles.card} testID="technician-delivery-section">
      <Text style={styles.title}>Giao linh kiện tới bạn</Text>
      {rows.map((row) => {
        const { request, state } = row;
        const preview = state ? technicianSplitPreview(state) : null;
        const ceilings = state ? technicianCeilingRows(state) : [];
        const busy = busyId !== null;
        return (
          <View key={request.id} style={styles.block} testID={`technician-delivery-${request.id}`}>
            <Text style={styles.meta}>{request.items.map(item => `${item.partNameSnapshot} × ${item.quantity}`).join(', ') || 'Linh kiện phát sinh'}</Text>
            {row.error ? <Text style={styles.error}>{row.error}</Text> : null}
            {!state && !row.error ? <Text style={styles.meta}>Đang chờ quản lý dịch vụ đề xuất phí giao.</Text> : null}
            {state ? <Text style={styles.text} testID={`technician-delivery-summary-${request.id}`}>{technicianDeliverySummary(state)}</Text> : null}
            {state?.quote ? <Text style={styles.meta}>Báo giá phí giao phiên bản {state.quote.quoteVersion}</Text> : null}
            {preview ? (
              <View style={styles.box} testID={`technician-delivery-preview-${request.id}`}>
                <Text style={styles.boxTitle}>{preview.title}</Text>
                {preview.rows.map(([label, value]) => (
                  <View key={label} style={styles.row}><Text style={styles.meta}>{label}</Text><Text style={styles.value}>{value}</Text></View>
                ))}
              </View>
            ) : null}
            {ceilings.length ? (
              <View style={styles.box} testID={`technician-delivery-ceilings-${request.id}`}>
                <Text style={styles.boxTitle}>Mức trần đã ghi nhận</Text>
                {ceilings.map(([label, value]) => (
                  <View key={label} style={styles.row}><Text style={styles.meta}>{label}</Text><Text style={styles.value}>{value}</Text></View>
                ))}
              </View>
            ) : null}
            {state?.actualShippingFee !== null && state?.actualShippingFee !== undefined ? (
              <View style={styles.row}><Text style={styles.meta}>Phí giao thực tế</Text><Text style={styles.value}>{`${state.actualShippingFee.toLocaleString('vi-VN')} ₫`}</Text></View>
            ) : null}
            {state ? <View style={styles.row}><Text style={styles.meta}>Giao nhận</Text><Text style={styles.value} testID={`technician-delivery-status-${request.id}`}>{physicalStatusText(state)}</Text></View> : null}

            {canTechnicianConsent(state, request.shippingFee) ? (
              <View style={styles.consent}>
                <View style={styles.row}>
                  <Text style={[styles.text, { flex: 1 }]}>
                    {state?.kind === 'free'
                      ? 'Tôi đồng ý nhận linh kiện qua giao hàng với phí giao 0 ₫.'
                      : 'Tôi đồng ý chịu phần phí giao 30% của mình, không vượt mức ở trên.'}
                  </Text>
                  <Switch testID={`technician-delivery-accept-${request.id}`} accessibilityLabel="Đồng ý điều khoản giao linh kiện"
                    value={!!accepted[request.id]} onValueChange={(value) => setAccepted(prev => ({ ...prev, [request.id]: value }))} />
                </View>
                <TouchableOpacity testID={`technician-delivery-consent-${request.id}`} accessibilityRole="button"
                  disabled={!accepted[request.id] || busy}
                  style={[styles.button, (!accepted[request.id] || busy) && { opacity: 0.5 }]}
                  onPress={() => void consent(row)}>
                  {busyId === request.id ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Đồng ý điều khoản giao</Text>}
                </TouchableOpacity>
              </View>
            ) : null}
            {canReserve(state) ? (
              <TouchableOpacity testID={`technician-delivery-reserve-${request.id}`} accessibilityRole="button" disabled={busy}
                style={[styles.ghost, busy && { opacity: 0.5 }]} onPress={() => void reserve(row)}>
                {busyId === request.id ? <ActivityIndicator color={colors.primary} /> : <Text style={styles.ghostText}>Yêu cầu kho giữ linh kiện</Text>}
              </TouchableOpacity>
            ) : null}
            {canRecordReceipt(state) ? (
              <TouchableOpacity testID={`technician-delivery-receipt-${request.id}`} accessibilityRole="button" disabled={busy}
                style={[styles.button, busy && { opacity: 0.5 }]} onPress={() => void receipt(row)}>
                {busyId === request.id ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Chụp ảnh và xác nhận đã nhận</Text>}
              </TouchableOpacity>
            ) : null}
            {message[request.id] ? <Text style={styles.note}>{message[request.id]}</Text> : null}
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
  value: { fontSize: 14, fontWeight: '600', color: colors.text, flexShrink: 1, textAlign: 'right' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  box: { gap: 4, padding: 12, borderRadius: 10, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  boxTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  consent: { gap: 8 },
  button: { minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryStrong },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  ghost: { minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.primaryStrong },
  ghostText: { color: colors.primaryStrong, fontWeight: '700', fontSize: 15 },
  note: { fontSize: 13, color: colors.text },
  error: { fontSize: 13, color: colors.danger },
});
