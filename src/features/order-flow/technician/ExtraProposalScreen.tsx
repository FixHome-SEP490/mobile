import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useIsFocused, useNavigation, useRoute } from '@react-navigation/native';
import { isHistoricalOrder, type CreateAdditionalCostPayload, type CreateAdditionalCostItem, type CostRequest } from '../../../api/orders.api';
import { useOrderSession } from '../runtime/OrderSessionProvider';
import { sameOrderSession } from '../domain/order-session.types';
import { QUOTE_MAX_ITEMS, validateQuotationPayload } from './technician-quotation-controller';
import { useTechnicianExtraCost } from './useTechnicianExtraCost';
import { fetchStrictCatalog, fetchStrictPartById } from './parts-catalog-adapter';
import { getRestoredExtraRecovery } from '../domain/extra-and-parts-recovery';
import { isCostDecisionBlocked } from '../../../screens/customer/customer-additional-cost-decision';
import {
  CostItemEditor,
  costItemRowToPayloadItem,
  costItemRowSubtotal,
  createCostItemRow,
  validateCostItemRows,
  type CostItemCatalogOption,
  type CostItemCatalogPanel,
  type CostItemFieldErrors,
  type CostItemRow,
} from '../shared/CostItemEditor';
import { FulfillmentMethodPicker } from '../shared/FulfillmentMethodPicker';
import { ConfirmSummary } from '../shared/ConfirmSummary';
import { EVIDENCE_MAX, EvidencePhotoPicker } from './EvidencePhotoPicker';
import { DetailRow, ReadOnlyNotice, TaskScreenShell } from '../shared/TaskScreenShell';
import { useLoadUnloadedResources } from '../shared/useLoadUnloadedResources';
import { formatVnd } from '../../../utils/format';
import { lightTheme as colors, spacing } from '../../../constants/theme';

export const EXTRA_REASON_MAX = 2000;
// Compare the same private server asset across renewed short-lived signatures.
const evidenceAsset = (url: string) => url.replace(/\/s--[^/]+\//, '/').split('?')[0];

export default function ExtraProposalScreen() {
  const { key, snapshot, refresh, loadResource, journal } = useOrderSession();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { controller, state } = useTechnicianExtraCost();

  const focused = useIsFocused();
  const revisingCostId: string | undefined = route.params?.proposalId ?? route.params?.costId;
  useLoadUnloadedResources(snapshot, ['extras', 'evidence'], loadResource);
  const orderValue = snapshot?.order.status === 'ready' ? snapshot.order.data : null;
  const order = orderValue && !isHistoricalOrder(orderValue) ? orderValue : null;
  const current = focused && !!key && !!order && snapshot?.access === 'current' && sameOrderSession(snapshot.key, key) && key.role === 'technician' && order.id === key.serviceOrderId && order.technician?.id === key.userId;
  const isUnderRepair = order?.status === 'UNDER_REPAIR' && !order.completionRequestedAt;
  const extrasResource = snapshot?.resources.extras;
  const rawExtras = extrasResource?.status === 'ready' ? extrasResource.data : [];
  const revisingTarget = rawExtras.find(c => c.id === revisingCostId && c.serviceOrderId === key?.serviceOrderId && c.technicianId === key?.userId) ?? null;
  const canRevise = !revisingCostId || (!!revisingTarget && String(revisingTarget.status).toUpperCase() === 'PENDING_APPROVAL' && !isCostDecisionBlocked(revisingTarget.expiresAt) && !rawExtras.some(c => c.serviceOrderId === key?.serviceOrderId && c.supersedesId === revisingCostId));
  const [initialRow] = useState(() => createCostItemRow('labor'));
  const [rows, setRows] = useState<CostItemRow[]>([initialRow]);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [fulfillmentMethod, setFulfillmentMethod] = useState<'pickup' | 'delivery'>('pickup');
  const [shippingFee, setShippingFee] = useState('');
  const [evidenceRefs, setEvidenceRefs] = useState<string[]>([]);
  const [expandedKey, setExpandedKey] = useState<string | null>(initialRow.key);
  const [catalog, setCatalog] = useState<CostItemCatalogPanel>({ status: 'idle', parts: [], error: null });
  const [confirmation, setConfirmation] = useState<{ payload: CreateAdditionalCostPayload; key: NonNullable<typeof key>; revision: string | undefined; signature: string } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, CostItemFieldErrors>>({});
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [draftScope, setDraftScope] = useState({ key, revision: revisingCostId, current, hydrated: false });
  const evidence = current && snapshot?.resources.evidence.status === 'ready' ? snapshot.resources.evidence.data.filter(e => e.serviceOrderId === key?.serviceOrderId && e.uploaderId === key?.userId && (e.type === 'BEFORE' || e.type === 'AFTER') && /^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/authenticated\/s--[^/]+\//.test(e.mediaUrl)) : [];
  // Prefill exactly once per owned revision. Never infer the latest root.
  if (!(draftScope.key === key || !!key && sameOrderSession(draftScope.key, key)) || draftScope.current !== current || draftScope.revision !== revisingCostId || (!draftScope.hydrated && current && canRevise && !!revisingTarget)) {
    const target = current && canRevise ? revisingTarget : null;
    const next = target?.items.length ? target.items.map(rawItem => { const item = rawItem as unknown as CreateAdditionalCostItem; return ({
      ...createCostItemRow(String(item.type).toLowerCase() === 'labor' ? 'labor' : 'parts_equipment'),
      description: item.description, quantity: String(item.quantity), unitPrice: String(item.unitPrice),
      partSource: item.partSource === 'fixhome' || item.partSource === 'external' ? item.partSource : 'technician',
      partCatalogId: item.partCatalogId ?? '', partNameSnapshot: item.partNameSnapshot ?? '', partSku: item.partSku ?? '', warrantyPolicy: item.warrantyPolicy ?? '',
      partWarrantyOption: item.partWarrantyOption === 'paid_warranty' ? 'paid_warranty' : 'no_warranty',
      warrantyTermDays: item.warrantyTermDays == null ? '' : String(item.warrantyTermDays), warrantyFee: item.warrantyFee == null ? '' : String(item.warrantyFee),
      laborWarrantyDays: item.warrantyDays == null ? '' : String(item.warrantyDays),
    } as CostItemRow); }) : [createCostItemRow('labor')];
    setDraftScope({ key, revision: revisingCostId, current, hydrated: !!target });
    setRows(next); setExpandedKey(next[0].key); setReason(target?.reason ?? '');
    setNote((target as (CostRequest & { note?: string }) | null)?.note ?? '');
    setFulfillmentMethod(target?.fulfillmentMethod ?? 'pickup');
    setShippingFee(target?.shippingFee == null ? '' : String(target.shippingFee));
    setEvidenceRefs(target?.evidenceUrls ?? []);
    setConfirmation(null); setFormError(null); setRowErrors({}); setReasonError(null); setCatalog({ status: 'idle', parts: [], error: null });
  }
  const recovery = useMemo(() => key && snapshot ? getRestoredExtraRecovery(journal, key, snapshot) : { hasRecovery: false as const, isUnresolved: false as const }, [journal, key, snapshot]);
  const showRecovery = recovery.hasRecovery && recovery.isUnresolved && (recovery.operation === 'extra-create' || recovery.operation === 'extra-revise');
  const busy = state.phase === 'submitting' || state.phase === 'verifying';
  const isUnknown = state.phase === 'unknown';
  const signature = JSON.stringify(revisingTarget);
  const confirming = !!confirmation && current && !!key && sameOrderSession(confirmation.key, key) && confirmation.revision === revisingCostId && confirmation.signature === signature;
  const frozen = busy || isUnknown || showRecovery;
  const canEdit = current && isUnderRepair && canRevise && extrasResource?.status === 'ready' && !frozen && state.phase !== 'resolved' && !confirming;
  const refreshing = snapshot?.order.status === 'loading' || extrasResource?.status === 'loading';
  const hasFixHome = rows.some(r => r.kind === 'parts_equipment' && r.partSource === 'fixhome');
  const buildPayload = (): CreateAdditionalCostPayload => {
    const trimmedReason = reason.trim();
    if (!trimmedReason || trimmedReason.length > EXTRA_REASON_MAX) throw new Error('Vui lòng nhập lý do phát sinh, tối đa 2000 ký tự.');
    if (rows.some(row => row.partNameSnapshot.length > 255 || row.partSku.length > 100 || row.warrantyPolicy.length > 255)) throw new Error('Thông tin linh kiện vượt giới hạn cho phép. Hãy chọn lại danh mục.');
    const valid = validateQuotationPayload({ items: rows.map(costItemRowToPayloadItem), note });
    // Use the frozen M4 money validator for the shipping DTO's identical integer bounds.
    const fee = hasFixHome && fulfillmentMethod === 'delivery' ? validateQuotationPayload({ items: [{ type: 'labor', description: 'Phí giao linh kiện', quantity: 1, unitPrice: shippingFee }] }).items[0].unitPrice : 0;
    if (evidenceRefs.some(ref => !evidence.some(e => evidenceAsset(e.mediaUrl) === evidenceAsset(ref)))) throw new Error('Ảnh đã chọn không còn khả dụng. Hãy tải lại ảnh.');
    const evidenceUrls = evidence.filter(e => evidenceRefs.some(ref => evidenceAsset(e.mediaUrl) === evidenceAsset(ref))).map(e => e.mediaUrl);
    if (evidenceUrls.length > 10) throw new Error('Chọn tối đa 10 ảnh bằng chứng.');
    return { reason: trimmedReason, ...valid, ...(hasFixHome ? { fulfillmentMethod, shippingFee: fee } : {}), ...(evidenceUrls.length ? { evidenceUrls } : {}) };
  };
  // Unknown is never zero: any row (or the delivery fee) that is not a valid integer makes the whole estimate unknown.
  const rowSubtotals = rows.map(costItemRowSubtotal);
  const shippingNeeded = hasFixHome && fulfillmentMethod === 'delivery';
  const shippingValue = !shippingNeeded ? 0 : /^\d+$/.test(shippingFee.trim()) ? Number(shippingFee) : null;
  const estimatedTotal: number | null = rowSubtotals.some(v => v === null) || shippingValue === null
    ? null
    : (rowSubtotals as number[]).reduce((sum, v) => sum + v, 0) + shippingValue;
  const missingForTotal = rowSubtotals.filter(v => v === null).length;
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
  // Explicit return from AFTER capture: reload owned evidence once so a newly
  // confirmed image can be attached. Draft rows/reason/note stay untouched;
  // selection below still admits only authorized BEFORE/AFTER server assets.
  const capturedAfterReturn = route.params?.capturedAfter === true;
  useEffect(() => {
    if (!capturedAfterReturn || !focused || !current) return;
    navigation.setParams({ capturedAfter: undefined });
    void loadResource('evidence');
  }, [capturedAfterReturn, focused, current, navigation, loadResource]);
  const latest = useRef({ key, current, rows, canEdit, confirmation, confirming, frozen });
  useLayoutEffect(() => { latest.current = { key, current, rows, canEdit, confirmation, confirming, frozen }; });
  const loadGeneration = useRef(0);
  const picks = useRef<Record<string, number>>({});
  useLayoutEffect(() => { loadGeneration.current += 1; picks.current = {}; }, [key?.userId, key?.role, key?.sessionGeneration, key?.serviceOrderId, current]);
  const loadCatalog = async (search?: string) => {
    if (!canEdit) return;
    const generation = ++loadGeneration.current;
    const owner = key;
    setCatalog({ status: 'loading', parts: [], error: null });
    const valid = () => mountedRef.current && generation === loadGeneration.current && !!latest.current.key && sameOrderSession(owner, latest.current.key) && latest.current.canEdit;
    try {
      const result = await fetchStrictCatalog({ limit: 50, ...(search?.trim() ? { search: search.trim() } : {}) });
      if (!valid()) return;
      setCatalog({ status: result.data.length ? 'ready' : 'empty', parts: result.data, error: null });
    } catch { if (valid()) setCatalog({ status: 'error', parts: [], error: 'Không tải được danh mục. Hãy thử tải lại.' }); }
  };
  const onSelectPart = async (rowKey: string, option: CostItemCatalogOption) => {
    const row = rows.find(r => r.key === rowKey);
    if (!canEdit || !row || row.kind !== 'parts_equipment' || row.partSource !== 'fixhome') return;
    const generation = (picks.current[rowKey] ?? 0) + 1;
    picks.current[rowKey] = generation;
    const owner = key;
    const valid = () => {
      const live = latest.current;
      const r = live.rows.find(r => r.key === rowKey);
      return mountedRef.current && !!live.key && sameOrderSession(owner, live.key) && live.canEdit && picks.current[rowKey] === generation && r?.kind === 'parts_equipment' && r.partSource === 'fixhome';
    };
    try {
      const part = await fetchStrictPartById(option.id);
      if (!valid()) return;
      setRows(prev => prev.map(r => r.key === rowKey ? { ...r, partCatalogId: part.id, description: part.name, unitPrice: String(part.sellingPrice), partNameSnapshot: part.name, partSku: part.sku ?? '', warrantyPolicy: part.warrantyPolicy ?? '' } : r));
      setFormError(null);
      setRowErrors(prev => { const { [rowKey]: _drop, ...rest } = prev; return rest; });
    } catch { if (valid()) setFormError('Không tải được linh kiện đã chọn. Hãy chọn lại.'); }
  };
  const onAddRow = (kind: 'labor' | 'parts_equipment') => {
    if (!canEdit || rows.length >= QUOTE_MAX_ITEMS) return;
    const row = createCostItemRow(kind); setRows(prev => [...prev, row]); setExpandedKey(row.key);
  };
  const onRemoveRow = (rowKey: string) => {
    if (!canEdit || rows.length <= 1) return;
    picks.current[rowKey] = (picks.current[rowKey] ?? 0) + 1;
    setRows(prev => prev.filter(r => r.key !== rowKey));
    if (expandedKey === rowKey) setExpandedKey(null);
  };
  const onRowChange = (row: CostItemRow) => {
    if (!canEdit) return;
    picks.current[row.key] = (picks.current[row.key] ?? 0) + 1;
    setRows(prev => prev.map(r => r.key === row.key ? row : r));
    setRowErrors(prev => { const { [row.key]: _drop, ...rest } = prev; return rest; });
  };
  const onStartSubmit = () => {
    if (!canEdit || !key || !latest.current.canEdit || !sameOrderSession(latest.current.key, key)) return;
    const errors = validateCostItemRows(rows);
    const missingReason = !reason.trim();
    setRowErrors(errors); setReasonError(missingReason ? 'Nhập lý do phát sinh để khách hàng hiểu vì sao cần thêm chi phí.' : null);
    const firstBad = rows.find(r => errors[r.key]);
    if (firstBad || missingReason) {
      if (firstBad) setExpandedKey(firstBad.key);
      const n = Object.keys(errors).length;
      setFormError([missingReason ? 'Chưa nhập lý do phát sinh.' : '', n ? `${n} hạng mục cần bổ sung thông tin (báo đỏ bên dưới).` : ''].filter(Boolean).join(' '));
      return;
    }
    try {
      const payload = buildPayload();
      setConfirmation({ payload, key: { ...key }, revision: revisingCostId, signature });
      latest.current = { ...latest.current, canEdit: false };
      setFormError(null);
    } catch (error) { setFormError(error instanceof Error ? error.message : 'Dữ liệu đề xuất không hợp lệ.'); }
  };
  const onConfirmSubmit = () => {
    const live = latest.current;
    if (!confirmation || live.confirmation !== confirmation || !live.confirming || !live.current || live.frozen || !sameOrderSession(live.key, confirmation.key)) return;
    latest.current = { ...live, confirmation: null, canEdit: false };
    setConfirmation(null);
    if (confirmation.revision) void controller.reviseProposal(confirmation.key, confirmation.revision, confirmation.payload);
    else void controller.createProposal(confirmation.key, confirmation.payload);
  };
  const onCancelConfirm = () => { setConfirmation(null); latest.current = { ...latest.current, confirmation: null }; };

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
      <TaskScreenShell title={revisingCostId ? 'Sửa đề xuất phát sinh' : 'Đề xuất chi phí phát sinh'} onBack={() => navigation.goBack()}>
        <ReadOnlyNotice>
          {snapshot?.access === 'historical'
            ? 'Không thể tạo đề xuất chi phí cho đơn lịch sử.'
            : 'Đề xuất chi phí chỉ mở khi có quyền quản lý đơn hiện tại.'}
        </ReadOnlyNotice>
      </TaskScreenShell>
    );
  }

  if (!isUnderRepair && !showRecovery && !isUnknown && state.phase !== 'resolved') {
    return (
      <TaskScreenShell title="Đề xuất chi phí phát sinh" stage={3} onBack={() => navigation.goBack()}>
        <ReadOnlyNotice>
          Chỉ có thể đề xuất chi phí phát sinh khi đơn đang sửa chữa và chưa yêu cầu hoàn tất.
        </ReadOnlyNotice>
      </TaskScreenShell>
    );
  }

  if (revisingCostId && !canRevise && !showRecovery && !isUnknown && state.phase !== 'resolved') {
    return (
      <TaskScreenShell title="Sửa đề xuất phát sinh" stage={3} onBack={() => navigation.goBack()}>
        <ReadOnlyNotice>
          Đề xuất này không còn ở trạng thái chờ duyệt hoặc đã hết hạn, không thể sửa đổi. Hãy tạo đề xuất mới nếu cần.
        </ReadOnlyNotice>
      </TaskScreenShell>
    );
  }

  return (
    <TaskScreenShell
      title={revisingCostId ? 'Sửa đề xuất phát sinh' : 'Đề xuất chi phí phát sinh'}
      stage={3}
      onBack={onBack}
      summary={
        <View testID="proposal-estimate-total" accessibilityLabel={`Tổng ước tính, chưa phải hóa đơn: ${estimatedTotal === null ? 'chưa xác định' : formatVnd(estimatedTotal)}`}>
          <View style={styles.totalBar}>
            <Text style={styles.totalLabel}>Tổng ước tính (chưa phải hóa đơn)</Text>
            <Text style={styles.totalValue}>{estimatedTotal === null ? 'Chưa xác định' : formatVnd(estimatedTotal)}</Text>
          </View>
          {estimatedTotal === null && <Text style={styles.totalHint}>{missingForTotal > 0 ? `Nhập đủ số lượng và đơn giá cho ${missingForTotal} hạng mục để tính tổng.` : 'Nhập phí giao linh kiện để tính tổng.'}</Text>}
        </View>
      }
      secondary={
        confirming
          ? {
              label: 'Hủy xác nhận',
              testID: 'proposal-confirm-cancel',
              disabled: busy,
              onPress: onCancelConfirm,
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
                ? revisingCostId
                  ? 'Xác nhận sửa đổi'
                  : 'Xác nhận gửi đề xuất'
                : revisingCostId
                  ? 'Gửi bản sửa đổi'
                  : 'Gửi đề xuất chi phí',
        testID: isUnknown || showRecovery
          ? 'proposal-verify'
          : state.phase === 'resolved'
            ? 'proposal-continue'
            : confirming
              ? 'proposal-confirm-submit'
              : 'proposal-submit',
        disabled: busy || (!canEdit && !confirming && !isUnknown && state.phase !== 'resolved' && !showRecovery),
        onPress: onPrimary,
      }}
    >
      {showRecovery && state.phase !== 'resolved' && (
        <ReadOnlyNotice tone="warning">
          Có thao tác đề xuất chi phí chưa rõ kết quả từ phiên trước. Vui lòng kiểm tra lại từ máy chủ trước khi tiếp tục.
        </ReadOnlyNotice>
      )}

      {state.error && <ReadOnlyNotice tone="error">{state.error}</ReadOnlyNotice>}
      {formError && <ReadOnlyNotice tone="error">{formError}</ReadOnlyNotice>}
      {state.actionSuccess && <ReadOnlyNotice tone="success">{state.actionSuccess}</ReadOnlyNotice>}

      {revisingCostId ? (
        <View style={styles.card}>
          <Text style={styles.inputLabel}>Đang sửa đề xuất #{revisingCostId.slice(-6).toUpperCase()}</Text>
          <Text style={styles.infoText}>Bản sửa đổi sẽ tạo một mã đề xuất mới thay thế cho bản cũ.</Text>
        </View>
      ) : null}

      {confirming && confirmation ? (
        <ConfirmSummary
          testID="proposal-confirm-sheet"
          title={revisingCostId ? 'Kiểm tra lại bản sửa đổi' : 'Kiểm tra lại đề xuất chi phí'}
          intro="Khách hàng sẽ nhận thông báo để duyệt đề xuất này. Bấm nút xác nhận bên dưới để gửi."
          items={confirmation.payload.items.map(item => ({
            title: item.description,
            detail: `${item.type === 'labor' ? 'Tiền công' : item.partSource === 'fixhome' ? 'Linh kiện FixHome' : item.partSource === 'external' ? 'Linh kiện mua ngoài' : 'Linh kiện thợ tự mang'} · ${item.quantity} × ${formatVnd(item.unitPrice)}`,
            amount: formatVnd(item.quantity * item.unitPrice),
          }))}
          lines={[
            { label: 'Lý do', value: confirmation.payload.reason },
            ...(confirmation.payload.fulfillmentMethod ? [{ label: 'Nhận linh kiện', value: confirmation.payload.fulfillmentMethod === 'delivery' ? `Giao tận nơi (phí ${formatVnd(confirmation.payload.shippingFee ?? 0)})` : 'Tự lấy tại kho' }] : []),
            ...(confirmation.payload.note ? [{ label: 'Ghi chú', value: confirmation.payload.note }] : []),
            { label: 'Ảnh bằng chứng', value: `${confirmation.payload.evidenceUrls?.length ?? 0} ảnh` },
          ]}
          total={{ label: 'Tổng ước tính', value: formatVnd(confirmation.payload.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, confirmation.payload.shippingFee ?? 0)) }}
        />
      ) : (
        <>
          <View style={styles.card}>
            <Text style={styles.inputLabel}>Lý do phát sinh chi phí *</Text>
            <TextInput
              testID="proposal-reason-input"
              style={[styles.reasonInput, !!reasonError && styles.inputError]}
              multiline
              numberOfLines={3}
              placeholder="Nhập lý do chi tiết (ví dụ: phát hiện hỏng van áp suất gas trong lúc sửa)..."
              placeholderTextColor={colors.textSecondary}
              value={reason}
              onChangeText={text => { if (canEdit) { setReason(text); if (reasonError) setReasonError(null); } }}
              editable={canEdit}
              accessibilityLabel="Lý do phát sinh chi phí"
              accessibilityHint={reasonError ?? undefined}
              maxLength={EXTRA_REASON_MAX}
            />
            {reasonError ? <Text testID="proposal-reason-error" accessibilityRole="alert" style={styles.fieldError}>{reasonError}</Text> : null}
            <Text style={styles.charCount}>{reason.length}/{EXTRA_REASON_MAX}</Text>
          </View>

          <View style={{ gap: 8, marginBottom: spacing.sm }}>
            <Text accessibilityRole="header" style={styles.inputLabel}>Hạng mục chi phí ({rows.length})</Text>
            {canEdit ? rows.map((row) => (
              <CostItemEditor
                key={row.key}
                row={row}
                errors={rowErrors[row.key]}
                catalog={catalog}
                expanded={expandedKey === row.key}
                canRemove={rows.length > 1}
                onToggle={() => setExpandedKey((prev) => (prev === row.key ? null : row.key))}
                onChange={(next) => onRowChange(next)}
                onRemove={() => onRemoveRow(row.key)}
                onLoadCatalog={search => {
                  void loadCatalog(search);
                }}
                onSelectCatalogPart={(part) => onSelectPart(row.key, part)}
              />
            )) : rows.map((row, index) => {
              const subtotal = rowSubtotals[index];
              return <View key={row.key} style={styles.card}><DetailRow label={row.description || 'Hạng mục'} value={subtotal === null ? `${row.quantity || '—'} × ${row.unitPrice || '—'}` : `${row.quantity} × ${formatVnd(Number(row.unitPrice))} = ${formatVnd(subtotal)}`} /></View>;
            })}
            {canEdit && (
              <View style={styles.addRow}>
                <TouchableOpacity
                  testID="proposal-add-parts"
                  accessibilityRole="button"
                  disabled={rows.length >= QUOTE_MAX_ITEMS}
                  onPress={() => onAddRow('parts_equipment')}
                  style={[styles.addBtn, styles.addHalf]}
                >
                  <Text style={styles.addBtnText}>+ Thêm linh kiện</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  testID="proposal-add-labor"
                  accessibilityRole="button"
                  disabled={rows.length >= QUOTE_MAX_ITEMS}
                  onPress={() => onAddRow('labor')}
                  style={[styles.addBtn, styles.addHalf]}
                >
                  <Text style={styles.addBtnText}>+ Thêm tiền công</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {hasFixHome && (
            <View style={styles.card}>
              <Text accessibilityRole="header" style={styles.inputLabel}>Hình thức nhận linh kiện</Text>
              <FulfillmentMethodPicker
                testIDPrefix="proposal-method"
                value={fulfillmentMethod}
                disabled={!canEdit}
                onChange={method => { if (canEdit) setFulfillmentMethod(method); }}
              />
              {fulfillmentMethod === 'delivery' && (
                <View style={styles.shipping}>
                  <Text style={styles.inputLabel}>Phí giao linh kiện (đ) *</Text>
                  <TextInput testID="proposal-shipping-fee" accessibilityLabel="Phí giao linh kiện" keyboardType="number-pad" placeholder="25000" placeholderTextColor={colors.textSecondary} value={shippingFee} editable={canEdit} onChangeText={text => { if (canEdit) setShippingFee(text); }} style={[styles.reasonInput, styles.singleLine]} />
                  <Text style={styles.infoText}>{shippingValue !== null && shippingNeeded ? `Khách sẽ thấy phí giao ${formatVnd(shippingValue)}.` : 'Nhập số nguyên, đơn vị đồng (nhập 0 nếu không thu phí).'}</Text>
                </View>
              )}
            </View>
          )}

          <View style={styles.card}>
            <Text style={styles.inputLabel}>Ghi chú (tùy chọn)</Text>
            <TextInput accessibilityLabel="Ghi chú đề xuất" placeholder="Thông tin thêm cho khách hàng" placeholderTextColor={colors.textSecondary} value={note} editable={canEdit} onChangeText={text => { if (canEdit) setNote(text); }} multiline style={styles.reasonInput} />
          </View>

          <View style={styles.card}>
            <Text style={styles.inputLabel}>Ảnh bằng chứng (tùy chọn)</Text>
            <EvidencePhotoPicker
              photos={evidence}
              isSelected={photo => evidenceRefs.some(ref => evidenceAsset(ref) === evidenceAsset(photo.mediaUrl))}
              disabled={!canEdit}
              loaded={snapshot?.resources.evidence.status === 'ready'}
              onToggle={photo => { if (canEdit) setEvidenceRefs(refs => refs.some(ref => evidenceAsset(ref) === evidenceAsset(photo.mediaUrl)) ? refs.filter(ref => evidenceAsset(ref) !== evidenceAsset(photo.mediaUrl)) : refs.length < EVIDENCE_MAX ? [...refs, photo.mediaUrl] : refs); }}
              onCapture={() => { if (canEdit) navigation.navigate('AfterEvidence', { fromProposal: true, ...(revisingCostId ? { proposalId: revisingCostId } : {}) }); }}
              onReload={() => { void loadResource('evidence'); }}
            />
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
  inputLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  reasonInput: {
    minHeight: 80,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: spacing.sm,
    fontSize: 14,
    color: colors.text,
    textAlignVertical: 'top',
  },
  singleLine: { minHeight: 48, textAlignVertical: 'center' },
  inputError: { borderColor: colors.error, borderWidth: 2 },
  fieldError: { color: colors.error, fontSize: 13, lineHeight: 19, marginTop: 4 },
  shipping: { marginTop: spacing.sm, gap: 4 },
  charCount: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'right',
    marginTop: 4,
  },
  infoText: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 4,
  },
  addRow: { flexDirection: 'row', gap: 8 },
  addHalf: { flex: 1 },
  addBtn: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 8,
  },
  addBtnText: {
    color: colors.primaryStrong,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  totalBar: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  totalLabel: { flex: 1, fontSize: 14, color: colors.textSecondary },
  totalValue: { fontSize: 18, fontWeight: '700', color: colors.primaryStrong },
  totalHint: { fontSize: 12, color: colors.textSecondary, lineHeight: 17 },
});
