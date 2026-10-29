import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { BottomSheetBackdrop, BottomSheetModal } from '@gorhom/bottom-sheet';
import * as Haptics from 'expo-haptics';
import { Package, Plus, Trash2 } from 'lucide-react-native';
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
import { PartPickerRow, partLineTotal } from '../shared/PartPickerRow';
import { formatVnd } from '../../../utils/format';
import { FulfillmentMethodPicker } from '../shared/FulfillmentMethodPicker';
import { ConfirmSummary } from '../shared/ConfirmSummary';
import { ReadOnlyNotice, TaskScreenShell } from '../shared/TaskScreenShell';
import { useLoadUnloadedResources } from '../shared/useLoadUnloadedResources';
import { lightTheme as colors, spacing } from '../../../constants/theme';
import { backFromFlow } from '../navigation/resume-order';

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

  const [picked, setPicked] = useState<CostItemRow[]>([]);
  const [rows, setRows] = useState<CostItemRow[]>([]);
  const [reason, setReason] = useState('');
  const [fulfillmentMethod, setFulfillmentMethod] = useState<'pickup' | 'delivery'>('pickup');
  const [catalog, setCatalog] = useState<CostItemCatalogPanel>({ status: 'idle', parts: [], error: null });
  const [formError, setFormError] = useState<string | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{ key: NonNullable<typeof key>; payload: CreatePartRequestPayload } | null>(null);
  const confirming = !!confirmation && current && !!key && sameOrderSession(confirmation.key, key);
  const [draftKey, setDraftKey] = useState(key);
  const [draftCurrent, setDraftCurrent] = useState(current);
  if (draftCurrent !== current || !(draftKey === key || !!key && sameOrderSession(draftKey, key))) {
    setDraftCurrent(current); setDraftKey(key); setRows([]); setPicked([]); setReason(''); setFulfillmentMethod('pickup'); setConfirmation(null); setCatalog({ status: 'idle', parts: [], error: null }); setPickError(null); setFormError(null);
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

  const sheetRef = useRef<BottomSheetModal>(null);
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
  const latest = useRef({ key, current, canCreate, confirmation, confirming, frozen });
  useLayoutEffect(() => { latest.current = { key, current, canCreate, confirmation, confirming, frozen }; });
  const loadGeneration = useRef(0);
  const wanted = useRef(new Set<string>());
  useLayoutEffect(() => { loadGeneration.current += 1; wanted.current.clear(); }, [key?.userId, key?.role, key?.sessionGeneration, key?.serviceOrderId, current]);
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
  /** Tick or untick a catalog part; the picks outlive new searches. Price and name come from the strict by-id read. */
  const onTogglePart = async (option: CostItemCatalogOption) => {
    if (!canCreate) return;
    setPickError(null);
    if (wanted.current.has(option.id)) {
      wanted.current.delete(option.id);
      setPicked(prev => prev.filter(r => r.partCatalogId !== option.id));
      return;
    }
    wanted.current.add(option.id);
    const owner = key;
    const valid = () => {
      const live = latest.current;
      return mountedRef.current && !!live.key && sameOrderSession(owner, live.key) && live.canCreate && wanted.current.has(option.id);
    };
    try {
      const part = await fetchStrictPartById(option.id);
      if (!valid()) return;
      setPicked(prev => prev.some(r => r.partCatalogId === part.id) ? prev : [...prev, { ...newPartRow(), partCatalogId: part.id, unitPrice: String(part.sellingPrice), partNameSnapshot: part.name, partSku: part.sku ?? '', warrantyPolicy: part.warrantyPolicy ?? '' }]);
    } catch {
      if (!wanted.current.has(option.id)) return;
      wanted.current.delete(option.id);
      if (mountedRef.current) setPickError('Không tải được linh kiện đã chọn. Hãy chọn lại.');
    }
  };
  const onPickQuantity = (rowKey: string, quantity: string) => {
    if (!canCreate) return;
    setPickError(null);
    setPicked(prev => prev.map(r => r.key === rowKey ? { ...r, quantity } : r));
  };
  /** Moves every pick into the list; a part already listed adds up its quantity. */
  const onAddRows = () => {
    if (!canCreate || !picked.length) return;
    if (Object.keys(validatePartRows(picked)).length) { setPickError(`Nhập số lượng từ 1 đến ${PART_QUANTITY_MAX} cho mọi linh kiện đã chọn.`); return; }
    const merged = [...rows];
    for (const item of picked) {
      const i = merged.findIndex(r => r.partCatalogId === item.partCatalogId);
      if (i >= 0) merged[i] = { ...merged[i], quantity: String(Math.min(PART_QUANTITY_MAX, Number(merged[i].quantity) + Number(item.quantity))) };
      else merged.push(item);
    }
    if (merged.length > PART_ITEMS_MAX) { setPickError(`Tối đa ${PART_ITEMS_MAX} linh kiện trong một yêu cầu.`); return; }
    setRows(merged);
    wanted.current.clear(); setPicked([]);
    setFormError(null);
    void Haptics.selectionAsync();
    sheetRef.current?.dismiss();
  };
  /** A closed sheet leaves nothing half-picked behind and reloads the full catalog next time. */
  const onSheetDismiss = () => {
    wanted.current.clear();
    setPicked([]); setPickError(null);
    setCatalog({ status: 'idle', parts: [], error: null });
  };

  const estimate = rows.reduce((sum, r) => sum + (partLineTotal(r) ?? 0), 0);
  const onRemoveRow = (rowKey: string) => {
    if (!canCreate) return;
    setRows(prev => prev.filter(r => r.key !== rowKey));
  };

  const validateDraft = (): CreatePartRequestPayload | null => {
    if (!rows.length) { setFormError('Thêm ít nhất một linh kiện vào danh sách.'); return null; }
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
    backFromFlow(navigation);
  };

  if (!current || !order) {
    return (
      <TaskScreenShell title="Chuẩn bị linh kiện" onBack={() => backFromFlow(navigation)}>
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
      <TaskScreenShell title="Chuẩn bị linh kiện" stage={1} onBack={() => backFromFlow(navigation)}>
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
            { label: 'Số loại linh kiện', value: String(rows.length) },
            ...(confirmation?.payload.reason ? [{ label: 'Lý do', value: confirmation.payload.reason }] : []),
          ]}
          total={{ label: 'Tạm tính', value: formatVnd(estimate) }}
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

          <View style={styles.card}>
            <View style={styles.listHead}>
              <Text accessibilityRole="header" style={[styles.sectionTitle, { marginBottom: 0 }]}>Danh sách linh kiện</Text>
              <View style={styles.countBadge}><Text style={styles.countText}>{rows.length}</Text></View>
            </View>
            {!rows.length && (
              <View testID="pre-parts-empty" style={styles.empty}>
                <Package size={28} color={colors.muted} />
                <Text style={styles.emptyTitle}>Chưa có linh kiện nào</Text>
                {canCreate && <Text style={styles.emptyText}>Chọn linh kiện FixHome cần mang theo, kho sẽ chuẩn bị đúng số lượng.</Text>}
              </View>
            )}
            {rows.map((row, index) => {
              const line = partLineTotal(row);
              return (
                <View key={row.key} testID={`pre-parts-item-${row.key}`} style={[styles.item, index > 0 && styles.itemDivider]}>
                  <View style={styles.itemText}>
                    <Text style={styles.itemName}>{row.partNameSnapshot}</Text>
                    <Text style={styles.itemMeta}>{[row.partSku ? `Mã ${row.partSku}` : '', `${formatVnd(Number(row.unitPrice))} × ${row.quantity}`].filter(Boolean).join(' · ')}</Text>
                  </View>
                  <Text style={styles.itemTotal}>{line === null ? '—' : formatVnd(line)}</Text>
                  {canCreate && (
                    <TouchableOpacity testID={`pre-parts-remove-${row.key}`} accessibilityRole="button" accessibilityLabel={`Xóa ${row.partNameSnapshot}`} onPress={() => onRemoveRow(row.key)} style={styles.itemRemove}>
                      <Trash2 size={20} color={colors.error} />
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
            {rows.length > 0 && (
              <View testID="pre-parts-summary" style={styles.summary}>
                <View style={styles.summaryLine}><Text style={styles.summaryLabel}>Số loại linh kiện</Text><Text style={styles.summaryValue}>{rows.length}</Text></View>
                <View style={styles.summaryLine}><Text style={styles.summaryLabel}>Tổng số lượng</Text><Text style={styles.summaryValue}>{rows.reduce((sum, r) => sum + Number(r.quantity), 0)}</Text></View>
                <View style={styles.summaryLine}><Text style={styles.summaryTotalLabel}>Tạm tính</Text><Text style={styles.summaryTotal}>{formatVnd(estimate)}</Text></View>
              </View>
            )}
            {canCreate && (
              <TouchableOpacity testID="pre-parts-open-sheet" accessibilityRole="button" accessibilityHint="Mở khung tìm và chọn linh kiện" onPress={() => sheetRef.current?.present()} style={styles.openBtn}>
                <Plus size={20} color={colors.primaryStrong} />
                <Text style={styles.openBtnText}>Thêm linh kiện</Text>
              </TouchableOpacity>
            )}
          </View>

          {canCreate && (
            <BottomSheetModal
              ref={sheetRef}
              snapPoints={['90%']}
              enableDynamicSizing={false}
              enablePanDownToClose
              keyboardBehavior="interactive"
              keyboardBlurBehavior="restore"
              android_keyboardInputMode="adjustResize"
              onDismiss={onSheetDismiss}
              backdropComponent={props => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.5} />}
            >
              <PartPickerRow
                picked={picked}
                catalog={catalog}
                error={pickError}
                maxQuantity={PART_QUANTITY_MAX}
                canAdd={canCreate}
                onToggle={onTogglePart}
                onQuantity={onPickQuantity}
                onAdd={onAddRows}
                onClose={() => sheetRef.current?.dismiss()}
                onLoadCatalog={search => { void loadCatalog(search); }}
              />
            </BottomSheetModal>
          )}
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
  listHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  countBadge: { minWidth: 24, height: 24, borderRadius: 12, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  countText: { fontSize: 13, fontWeight: '700', color: colors.primaryStrong },
  empty: { alignItems: 'center', gap: 4, paddingVertical: spacing.md },
  emptyTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  emptyText: { fontSize: 13, lineHeight: 19, color: colors.textSecondary, textAlign: 'center' },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 56, paddingVertical: spacing.sm },
  itemDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  itemText: { flex: 1, minWidth: 0, gap: 2 },
  itemName: { fontSize: 15, fontWeight: '600', color: colors.text },
  itemMeta: { fontSize: 13, color: colors.textSecondary },
  itemTotal: { fontSize: 15, fontWeight: '700', color: colors.text },
  summary: { marginTop: spacing.sm, paddingTop: spacing.sm, gap: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  summaryLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryLabel: { fontSize: 14, color: colors.textSecondary },
  summaryValue: { fontSize: 14, fontWeight: '600', color: colors.text },
  summaryTotalLabel: { fontSize: 15, fontWeight: '700', color: colors.text },
  summaryTotal: { fontSize: 17, fontWeight: '800', color: colors.primaryStrong },
  itemRemove: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  openBtn: { minHeight: 48, marginTop: spacing.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: colors.primaryStrong, borderRadius: 12 },
  openBtnText: { color: colors.primaryStrong, fontSize: 15, fontWeight: '700' },
});
