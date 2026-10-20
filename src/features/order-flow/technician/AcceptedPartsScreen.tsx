import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { isHistoricalOrder } from '../../../api/orders.api';
import type { CreatePartRequestPayload } from '../../../api/part-requests.api';
import type { OrderPartReadModel } from '../domain/order-session.types';
import { useOrderSession } from '../runtime/OrderSessionProvider';
import { sameOrderSession } from '../domain/order-session.types';
import { validateCreatePreRepairPayload, PART_ITEMS_MAX, PART_QUANTITY_MAX } from './parts-controller';
import { useTechnicianParts } from './useTechnicianParts';
import { fetchStrictCatalog, fetchStrictPartById } from './parts-catalog-adapter';
import { getRestoredPartsRecovery } from '../domain/extra-and-parts-recovery';
import {
  createCostItemRow,
  type CostItemCatalogOption,
  type CostItemCatalogPanel,
  type CostItemFieldErrors,
  type CostItemRow,
} from '../shared/CostItemEditor';
import { PartPickerRow } from '../shared/PartPickerRow';
import { FulfillmentMethodPicker } from '../shared/FulfillmentMethodPicker';
import { ConfirmSummary } from '../shared/ConfirmSummary';
import { ReadOnlyNotice, TaskScreenShell } from '../shared/TaskScreenShell';
import { useLoadUnloadedResources } from '../shared/useLoadUnloadedResources';
import { lightTheme as colors, spacing } from '../../../constants/theme';

const newPartRow = (): CostItemRow => ({ ...createCostItemRow('parts_equipment'), partSource: 'fixhome', quantity: '1' });

/** Inline hints after a failed submit; validateCreatePreRepairPayload stays authoritative. */
function validatePartRows(rows: CostItemRow[]): Record<string, CostItemFieldErrors> {
  const out: Record<string, CostItemFieldErrors> = {};
  for (const row of rows) {
    const e: CostItemFieldErrors = {};
    if (!row.partCatalogId) e.partCatalogId = 'Chọn một linh kiện trong danh mục FixHome.';
    if (!/^\d+$/.test(row.quantity.trim()) || Number(row.quantity) < 1 || Number(row.quantity) > PART_QUANTITY_MAX) e.quantity = `Nhập số lượng từ 1 đến ${PART_QUANTITY_MAX}.`;
    if (Object.keys(e).length) out[row.key] = e;
  }
  return out;
}

export default function AcceptedPartsScreen() {
  const { key, snapshot, refresh, loadResource, journal } = useOrderSession();
  const navigation = useNavigation<any>();
  const focused = useIsFocused();
  const { controller, state } = useTechnicianParts();

  useLoadUnloadedResources(snapshot, ['parts'], loadResource);

  const orderValue = snapshot?.order.status === 'ready' ? snapshot.order.data : null;
  const order = orderValue && !isHistoricalOrder(orderValue) ? orderValue : null;
  const current = focused && !!key && !!order && snapshot?.access === 'current' && sameOrderSession(snapshot.key, key) && key.role === 'technician' && order.id === key.serviceOrderId && order.technician?.id === key.userId;
  const isAccepted = order?.status === 'ACCEPTED';

  const partsResource = snapshot?.resources.parts;
  const partsList: OrderPartReadModel[] = partsResource?.status === 'ready' && Array.isArray(partsResource.data)
    ? partsResource.data.filter(pr => pr.serviceOrderId === key?.serviceOrderId && pr.technicianId === key?.userId)
    : [];

  const hasActivePreRepair = partsList.some(
    (pr: OrderPartReadModel) => pr.requestType === 'pre_repair' && pr.status !== 'cancelled',
  );

  const [initialRow] = useState(newPartRow);
  const [rows, setRows] = useState<CostItemRow[]>(() => [initialRow]);
  const [reason, setReason] = useState('');
  const [fulfillmentMethod, setFulfillmentMethod] = useState<'pickup' | 'delivery'>('pickup');
  const [expandedKey, setExpandedKey] = useState<string | null>(() => initialRow.key);
  const [catalog, setCatalog] = useState<CostItemCatalogPanel>({ status: 'idle', parts: [], error: null });
  const [formError, setFormError] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, CostItemFieldErrors>>({});
  const [confirmation, setConfirmation] = useState<{ key: NonNullable<typeof key>; payload: CreatePartRequestPayload } | null>(null);
  const confirming = !!confirmation && current && !!key && sameOrderSession(confirmation.key, key);
  const [draftKey, setDraftKey] = useState(key);
  const [draftCurrent, setDraftCurrent] = useState(current);
  if (draftCurrent !== current || !(draftKey === key || !!key && sameOrderSession(draftKey, key))) {
    const initial = newPartRow();
    setDraftCurrent(current); setDraftKey(key); setRows([initial]); setExpandedKey(initial.key); setReason(''); setFulfillmentMethod('pickup'); setConfirmation(null); setCatalog({ status: 'idle', parts: [], error: null }); setRowErrors({}); setFormError(null);
  }

  const recovery = useMemo(
    () => (key && snapshot ? getRestoredPartsRecovery(journal, key, snapshot) : { hasRecovery: false as const, isUnresolved: false as const }),
    [journal, key, snapshot],
  );
  const showRecovery = recovery.hasRecovery && recovery.isUnresolved && recovery.operation === 'parts-create';

  const busy = state.phase === 'submitting' || state.phase === 'verifying';
  const isUnknown = state.phase === 'unknown';
  const frozen = busy || isUnknown || showRecovery;
  const canCreate = current && isAccepted && !hasActivePreRepair && partsResource?.status === 'ready' && !frozen && state.phase !== 'resolved' && !confirming;
  const refreshing = snapshot?.order.status === 'loading' || snapshot?.resources.parts.status === 'loading';

  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
  const latest = useRef({ key, current, rows, canCreate, confirmation, confirming, frozen });
  useLayoutEffect(() => { latest.current = { key, current, rows, canCreate, confirmation, confirming, frozen }; });
  const loadGeneration = useRef(0);
  const picks = useRef<Record<string, number>>({});
  useLayoutEffect(() => { loadGeneration.current += 1; picks.current = {}; }, [key?.userId, key?.role, key?.sessionGeneration, key?.serviceOrderId, current]);
  const loadCatalog = async (search?: string) => {
    if (!canCreate) return;
    const generation = ++loadGeneration.current;
    const owner = key;
    setCatalog({ status: 'loading', parts: [], error: null });
    const valid = () => mountedRef.current && generation === loadGeneration.current && !!latest.current.key && sameOrderSession(owner, latest.current.key) && latest.current.canCreate;
    try {
      const result = await fetchStrictCatalog({ limit: 50, ...(search?.trim() ? { search: search.trim() } : {}) });
      if (!valid()) return;
      setCatalog({ status: result.data.length ? 'ready' : 'empty', parts: result.data, error: null });
    } catch { if (valid()) setCatalog({ status: 'error', parts: [], error: 'Không tải được danh mục. Hãy thử tải lại.' }); }
  };
  const onSelectPart = async (rowKey: string, option: CostItemCatalogOption) => {
    const row = rows.find(r => r.key === rowKey);
    if (!canCreate || !row || row.kind !== 'parts_equipment' || row.partSource !== 'fixhome') return;
    const generation = (picks.current[rowKey] ?? 0) + 1;
    picks.current[rowKey] = generation;
    const owner = key;
    const valid = () => {
      const live = latest.current;
      const r = live.rows.find(r => r.key === rowKey);
      return mountedRef.current && !!live.key && sameOrderSession(owner, live.key) && live.canCreate && picks.current[rowKey] === generation && r?.kind === 'parts_equipment' && r.partSource === 'fixhome';
    };
    try {
      const part = await fetchStrictPartById(option.id);
      if (!valid()) return;
      setRows(prev => prev.map(r => r.key === rowKey ? { ...r, partCatalogId: part.id, unitPrice: String(part.sellingPrice), partNameSnapshot: part.name, partSku: part.sku ?? '', warrantyPolicy: part.warrantyPolicy ?? '' } : r));
      setFormError(null);
      setRowErrors(prev => { const { [rowKey]: _drop, ...rest } = prev; return rest; });
    } catch { if (valid()) setFormError('Không tải được linh kiện đã chọn. Hãy chọn lại.'); }
  };
  const onAddRow = () => {
    if (!canCreate || rows.length >= PART_ITEMS_MAX) return;
    const newRow = newPartRow();
    setRows((prev) => [...prev, newRow]);
    setExpandedKey(newRow.key);
  };

  const onRemoveRow = (rowKey: string) => {
    if (!canCreate || rows.length <= 1) return;
    picks.current[rowKey] = (picks.current[rowKey] ?? 0) + 1;
    setRows((prev) => prev.filter((r) => r.key !== rowKey));
    if (expandedKey === rowKey) setExpandedKey(null);
  };

  const onRowChange = (updated: CostItemRow) => {
    if (!canCreate) return;
    picks.current[updated.key] = (picks.current[updated.key] ?? 0) + 1;
    setRows((prev) => prev.map((r) => (r.key === updated.key ? updated : r)));
    setRowErrors(prev => { const { [updated.key]: _drop, ...rest } = prev; return rest; });
  };

  const validateDraft = (): CreatePartRequestPayload | null => {
    const errors = validatePartRows(rows);
    setRowErrors(errors);
    const firstBad = rows.find(r => errors[r.key]);
    if (firstBad) {
      setExpandedKey(firstBad.key);
      setFormError(`Có ${Object.keys(errors).length} linh kiện cần bổ sung thông tin. Kiểm tra các mục báo đỏ bên dưới.`);
      return null;
    }
    try {
      const payload = validateCreatePreRepairPayload({
        items: rows.map(row => ({ partCatalogId: row.partSource === 'fixhome' && row.kind === 'parts_equipment' ? row.partCatalogId : '', quantity: /^\d+$/.test(row.quantity.trim()) ? Number(row.quantity) : NaN, note: row.description.trim() || undefined })),
        fulfillmentMethod, reason: reason.trim() || undefined,
      });
      setFormError(null); return payload;
    } catch (error) { setFormError(error instanceof Error ? error.message : 'Yêu cầu linh kiện không hợp lệ.'); return null; }
  };
  const onStartSubmit = () => {
    if (!canCreate || !key || !latest.current.canCreate || !sameOrderSession(latest.current.key, key)) return;
    const payload = validateDraft();
    if (!payload) return;
    setConfirmation({ key: { ...key }, payload });
    latest.current = { ...latest.current, canCreate: false };
  };
  const onCancelConfirm = () => { setConfirmation(null); latest.current = { ...latest.current, confirmation: null }; };
  const onConfirmSubmit = () => {
    const live = latest.current;
    if (!confirmation || live.confirmation !== confirmation || !live.confirming || !live.current || live.frozen || !sameOrderSession(live.key, confirmation.key) || !isAccepted || hasActivePreRepair) return;
    latest.current = { ...live, confirmation: null, canCreate: false };
    setConfirmation(null);
    void controller.createPreRepair(confirmation.key, confirmation.payload);
  };

  const onPrimary = () => {
    if (busy) return;
    if (isUnknown || showRecovery) {
      if (recovery.hasRecovery && recovery.isUnresolved && recovery.intentId && key) {
        void controller.verify(key, recovery.intentId);
      }
      return;
    }
    if (state.phase === 'resolved') {
      navigation.navigate('OrderTask');
      return;
    }
    if (confirming) {
      onConfirmSubmit();
      return;
    }
    onStartSubmit();
  };

  const onBack = () => {
    if (confirming) {
      onCancelConfirm();
      return;
    }
    navigation.goBack();
  };

  if (!current || !order) {
    return (
      <TaskScreenShell title="Chuẩn bị linh kiện" onBack={() => navigation.goBack()}>
        <ReadOnlyNotice>
          {snapshot?.access === 'historical'
            ? 'Không chuẩn bị linh kiện cho đơn lịch sử.'
            : 'Màn hình chỉ mở khi có quyền quản lý đơn hiện tại.'}
        </ReadOnlyNotice>
      </TaskScreenShell>
    );
  }

  if (!isAccepted && !showRecovery && !isUnknown && state.phase !== 'resolved') {
    return (
      <TaskScreenShell title="Chuẩn bị linh kiện" stage={1} onBack={() => navigation.goBack()}>
        <ReadOnlyNotice>
          Yêu cầu linh kiện dự kiến chỉ tạo được khi đơn ở trạng thái Đã tiếp nhận, trước khi bạn xuất phát.
        </ReadOnlyNotice>
      </TaskScreenShell>
    );
  }

  return (
    <TaskScreenShell
      title="Chuẩn bị linh kiện"
      stage={1}
      onBack={onBack}
      secondary={
        confirming
          ? {
              label: 'Hủy xác nhận',
              testID: 'pre-parts-cancel-confirm',
              disabled: busy,
              onPress: () => onCancelConfirm(),
            }
          : state.phase === 'resolved' || isUnknown || showRecovery
            ? {
                label: 'Làm mới dữ liệu',
                testID: 'task-refresh',
                disabled: busy || refreshing,
                onPress: () => {
                  if (!busy && !refreshing) void refresh('manual');
                },
              }
            : undefined
      }
      primary={{
        label: busy
          ? 'Đang gửi…'
          : isUnknown || showRecovery
            ? 'Kiểm tra lại'
            : state.phase === 'resolved'
              ? 'Tiếp tục'
              : confirming
                ? 'Xác nhận gửi yêu cầu'
                : 'Gửi yêu cầu linh kiện',
        testID: isUnknown || showRecovery
          ? 'pre-parts-verify'
          : state.phase === 'resolved'
            ? 'pre-parts-continue'
            : confirming
              ? 'pre-parts-confirm-submit'
              : 'pre-parts-submit',
        disabled: busy || (!canCreate && !confirming && !isUnknown && state.phase !== 'resolved' && !showRecovery),
        onPress: onPrimary,
      }}
    >
      {showRecovery && state.phase !== 'resolved' && (
        <ReadOnlyNotice tone="warning">
          Có thao tác yêu cầu linh kiện chưa rõ kết quả từ phiên trước. Vui lòng kiểm tra lại từ máy chủ.
        </ReadOnlyNotice>
      )}

      {hasActivePreRepair && (
        <ReadOnlyNotice tone="warning">
          Đơn hàng này đã có một yêu cầu linh kiện dự kiến đang hoạt động. Bạn không thể tạo thêm yêu cầu mới.
        </ReadOnlyNotice>
      )}

      {state.error && <ReadOnlyNotice tone="error">{state.error}</ReadOnlyNotice>}
      {formError && <ReadOnlyNotice tone="error">{formError}</ReadOnlyNotice>}
      {state.actionSuccess && <ReadOnlyNotice tone="success">{state.actionSuccess}</ReadOnlyNotice>}

      {confirming ? (
        <ConfirmSummary
          testID="pre-parts-confirm-sheet"
          title="Kiểm tra lại yêu cầu linh kiện dự kiến"
          intro="Kho sẽ chuẩn bị đúng danh sách dưới đây. Bấm “Xác nhận gửi yêu cầu” để gửi."
          items={(confirmation?.payload.items ?? []).map((item, index) => ({
            title: rows[index]?.partNameSnapshot || 'Linh kiện',
            detail: [rows[index]?.partSku ? `Mã ${rows[index].partSku}` : '', item.note ? `Ghi chú: ${item.note}` : ''].filter(Boolean).join(' · ') || undefined,
            amount: `× ${item.quantity}`,
          }))}
          lines={[
            { label: 'Hình thức nhận', value: fulfillmentMethod === 'delivery' ? 'Giao tận nơi' : 'Tự lấy tại kho' },
            ...(confirmation?.payload.reason ? [{ label: 'Lý do', value: confirmation.payload.reason }] : []),
          ]}
          total={{ label: 'Số loại linh kiện', value: String(rows.length) }}
        />
      ) : (
        <>
          <View style={styles.card}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>Hình thức nhận linh kiện</Text>
            <FulfillmentMethodPicker
              testIDPrefix="pre-parts-method"
              value={fulfillmentMethod}
              disabled={!canCreate}
              onChange={method => { if (canCreate) setFulfillmentMethod(method); }}
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.inputLabel}>Lý do chuẩn bị trước (tùy chọn)</Text>
            <TextInput accessibilityLabel="Ghi chú linh kiện"
              testID="pre-parts-reason-input"
              style={styles.reasonInput}
              multiline
              numberOfLines={2}
              placeholder="Ví dụ: Đơn máy giặt cần mang sẵn van xả và tụ motor..."
              placeholderTextColor={colors.textSecondary}
              value={reason}
              onChangeText={text => { if (canCreate) setReason(text); }}
              editable={canCreate}
              maxLength={2000}
            />
          </View>

          <View style={{ gap: 8, marginBottom: spacing.sm }}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>Danh sách linh kiện ({rows.length})</Text>
            {canCreate ? rows.map((row) => (
              <PartPickerRow
                key={row.key}
                row={row}
                errors={rowErrors[row.key]}
                catalog={catalog}
                expanded={expandedKey === row.key}
                canRemove={rows.length > 1}
                maxQuantity={PART_QUANTITY_MAX}
                onToggle={() => setExpandedKey((prev) => (prev === row.key ? null : row.key))}
                onChange={(next) => onRowChange(next)}
                onRemove={() => onRemoveRow(row.key)}
                onLoadCatalog={search => {
                  void loadCatalog(search);
                }}
                onSelectCatalogPart={(part) => onSelectPart(row.key, part)}
              />
            )) : rows.filter(row => row.partNameSnapshot).map(row => (
              <View key={row.key} style={styles.readRow}>
                <Text style={styles.readName}>{row.partNameSnapshot}</Text>
                <Text style={styles.readQty}>× {row.quantity || '—'}</Text>
              </View>
            ))}

            {canCreate && (
              <TouchableOpacity
                testID="pre-parts-add-item"
                accessibilityRole="button"
                disabled={rows.length >= PART_ITEMS_MAX}
                onPress={onAddRow}
                style={styles.addBtn}
              >
                <Text style={styles.addBtnText}>+ Thêm linh kiện</Text>
              </TouchableOpacity>
            )}
          </View>
        </>
      )}
    </TaskScreenShell>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  reasonInput: {
    minHeight: 60,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: spacing.sm,
    fontSize: 14,
    color: colors.text,
    textAlignVertical: 'top',
  },
  addBtn: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
  },
  addBtnText: {
    color: colors.primaryStrong,
    fontSize: 15,
    fontWeight: '600',
  },
  readRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  readName: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },
  readQty: { fontSize: 15, fontWeight: '600', color: colors.textSecondary },
});
