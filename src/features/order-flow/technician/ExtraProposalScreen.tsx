import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { BottomSheetBackdrop, BottomSheetModal } from '@gorhom/bottom-sheet';
import * as Haptics from 'expo-haptics';
import { useIsFocused, useNavigation, useRoute } from '@react-navigation/native';
import { isHistoricalOrder, type CreateAdditionalCostPayload, type CreateAdditionalCostItem, type CostRequest } from '../../../api/orders.api';
import { useOrderSession } from '../runtime/OrderSessionProvider';
import { sameOrderSession } from '../domain/order-session.types';
import { QUOTE_MAX_ITEMS, validateQuotationPayload } from './technician-quotation-controller';
import { useTechnicianExtraCost } from './useTechnicianExtraCost';
import { fetchStrictCatalog, fetchStrictPartById } from './parts-catalog-adapter';
import { PART_QUANTITY_MAX } from './parts-controller';
import { getRestoredExtraRecovery } from '../domain/extra-and-parts-recovery';
import { isCostDecisionBlocked } from '../../../screens/customer/customer-additional-cost-decision';
import {
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
import { PartPickerRow } from '../shared/PartPickerRow';
import { heldParts as computeHeldParts } from './held-parts';
import { AddRow, GroupLabel, HeldPartCard, LaborCard, PartLineCard, Section } from './QuotationItemCards';
import { DetailRow, ReadOnlyNotice, TaskScreenShell } from '../shared/TaskScreenShell';
import { useLoadUnloadedResources } from '../shared/useLoadUnloadedResources';
import { formatVnd } from '../../../utils/format';
import { lightTheme as colors, spacing } from '../../../constants/theme';

export const EXTRA_REASON_MAX = 2000;
// Compare the same private server asset across renewed short-lived signatures.
const evidenceAsset = (url: string) => url.replace(/\/s--[^/]+\//, '/').split('?')[0];

const newLabor = (): CostItemRow => ({ ...createCostItemRow('labor'), quantity: '1' });
const newPart = (): CostItemRow => ({ ...createCostItemRow('parts_equipment'), partSource: 'fixhome', quantity: '1' });
const isPart = (row: CostItemRow) => row.kind === 'parts_equipment';
const HELD_KEY = 'held-';

export default function ExtraProposalScreen() {
  const { key, snapshot, refresh, loadResource, journal } = useOrderSession();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { controller, state } = useTechnicianExtraCost();

  const focused = useIsFocused();
  const revisingCostId: string | undefined = route.params?.proposalId ?? route.params?.costId;
  useLoadUnloadedResources(snapshot, ['extras', 'evidence', 'parts', 'quotations'], loadResource);
  const orderValue = snapshot?.order.status === 'ready' ? snapshot.order.data : null;
  const order = orderValue && !isHistoricalOrder(orderValue) ? orderValue : null;
  const current = focused && !!key && !!order && snapshot?.access === 'current' && sameOrderSession(snapshot.key, key) && key.role === 'technician' && order.id === key.serviceOrderId && order.technician?.id === key.userId;
  const isUnderRepair = order?.status === 'UNDER_REPAIR' && !order.completionRequestedAt;
  const extrasResource = snapshot?.resources.extras;
  const rawExtras = extrasResource?.status === 'ready' ? extrasResource.data : [];
  const revisingTarget = rawExtras.find(c => c.id === revisingCostId && c.serviceOrderId === key?.serviceOrderId && c.technicianId === key?.userId) ?? null;
  const canRevise = !revisingCostId || (!!revisingTarget && String(revisingTarget.status).toUpperCase() === 'PENDING_APPROVAL' && !isCostDecisionBlocked(revisingTarget.expiresAt) && !rawExtras.some(c => c.serviceOrderId === key?.serviceOrderId && c.supersedesId === revisingCostId));
  const [initialRow] = useState(newLabor);
  const [picked, setPicked] = useState<CostItemRow[]>([]);
  const [pickError, setPickError] = useState<string | null>(null);
  const sheetRef = useRef<BottomSheetModal>(null);
  const wanted = useRef(new Set<string>());
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
    } as CostItemRow); }) : [newLabor()];
    setDraftScope({ key, revision: revisingCostId, current, hydrated: !!target });
    setRows(next); setExpandedKey(next[0].key); setReason(target?.reason ?? '');
    setNote((target as (CostRequest & { note?: string }) | null)?.note ?? '');
    setFulfillmentMethod(target?.fulfillmentMethod ?? 'pickup');
    setShippingFee(target?.shippingFee == null ? '' : String(target.shippingFee));
    setEvidenceRefs(target?.evidenceUrls ?? []);
    setConfirmation(null); setFormError(null); setRowErrors({}); setReasonError(null); setCatalog({ status: 'idle', parts: [], error: null }); setPicked([]); setPickError(null);
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
  // What the technician still holds once the approved quotation has taken its share (e.g. received 2, quote uses 1 -> 1 left).
  const partsResource = snapshot?.resources.parts;
  const quotationsResource = snapshot?.resources.quotations;
  const heldParts = current && key && partsResource?.status === 'ready' && Array.isArray(partsResource.data) && quotationsResource?.status === 'ready'
    ? computeHeldParts(partsResource.data, quotationsResource.data, key.serviceOrderId, key.userId)
    : [];
  const heldReady = partsResource?.status === 'ready' && quotationsResource?.status === 'ready';
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
  useLayoutEffect(() => { loadGeneration.current += 1; picks.current = {}; wanted.current.clear(); }, [key?.userId, key?.role, key?.sessionGeneration, key?.serviceOrderId, current]);
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
  /** Tick or untick a stock part; picks outlive new searches. Price and name come from the by-ID read. */
  const togglePick = async (option: CostItemCatalogOption) => {
    if (!canEdit) return;
    setPickError(null);
    if (wanted.current.has(option.id)) {
      wanted.current.delete(option.id);
      setPicked(prev => prev.filter(r => r.partCatalogId !== option.id));
      return;
    }
    wanted.current.add(option.id);
    const owner = key;
    try {
      const part = await fetchStrictPartById(option.id);
      const live = latest.current;
      if (!mountedRef.current || !live.key || !sameOrderSession(owner, live.key) || !live.canEdit || !wanted.current.has(option.id)) return;
      setPicked(prev => prev.some(r => r.partCatalogId === part.id) ? prev : [...prev, {
        ...newPart(), partCatalogId: part.id, unitPrice: String(part.sellingPrice), description: part.name, partNameSnapshot: part.name,
        partSku: part.sku ?? '', warrantyPolicy: part.warrantyPolicy ?? '', warrantyTermDays: part.warrantyDays != null ? String(part.warrantyDays) : '',
      }]);
    } catch {
      if (!wanted.current.has(option.id)) return;
      wanted.current.delete(option.id);
      if (mountedRef.current) setPickError('Không tải được linh kiện đã chọn. Hãy chọn lại.');
    }
  };
  const setPickQuantity = (rowKey: string, quantity: string) => {
    if (!canEdit) return;
    setPickError(null);
    setPicked(prev => prev.map(r => (r.key === rowKey ? { ...r, quantity } : r)));
  };
  /** Moves every pick into the proposal; a FixHome part already listed adds up its quantity. */
  const addPicked = () => {
    if (!canEdit || !picked.length) return;
    if (picked.some(r => !/^\d+$/.test(r.quantity.trim()) || Number(r.quantity) < 1 || Number(r.quantity) > PART_QUANTITY_MAX)) {
      setPickError(`Nhập số lượng từ 1 đến ${PART_QUANTITY_MAX} cho mọi linh kiện đã chọn.`);
      return;
    }
    const merged = [...rows];
    for (const item of picked) {
      const i = merged.findIndex(r => isPart(r) && r.partSource === 'fixhome' && r.partCatalogId === item.partCatalogId);
      if (i >= 0) merged[i] = { ...merged[i], quantity: String(Math.min(PART_QUANTITY_MAX, Number(merged[i].quantity) + Number(item.quantity))) };
      else merged.push(item);
    }
    if (merged.length > QUOTE_MAX_ITEMS) { setPickError(`Số lượng hạng mục tối đa ${QUOTE_MAX_ITEMS}.`); return; }
    setRows(merged);
    wanted.current.clear();
    setPicked([]);
    setFormError(null);
    void Haptics.selectionAsync();
    sheetRef.current?.dismiss();
  };
  const onSheetDismiss = () => {
    wanted.current.clear();
    setPicked([]);
    setPickError(null);
    setCatalog({ status: 'idle', parts: [], error: null });
  };
  /** Tick = use the part the technician already holds; price and warranty are read by exact ID. The depot only supplies the shortfall. */
  const toggleHeld = (part: { key: string; name: string; quantity: number }) => {
    if (!canEdit || part.key.startsWith('name:')) return;
    const rowKey = `${HELD_KEY}${part.key}`;
    if (latest.current.rows.some(r => r.key === rowKey)) { setRows(prev => prev.filter(r => r.key !== rowKey)); return; }
    if (rows.length >= QUOTE_MAX_ITEMS) { setFormError(`Số lượng hạng mục tối đa ${QUOTE_MAX_ITEMS}.`); return; }
    const owner = key;
    setRows(prev => [...prev, { ...newPart(), key: rowKey, partCatalogId: part.key, quantity: String(part.quantity), description: part.name, partNameSnapshot: part.name }]);
    setFormError(null);
    void (async () => {
      try {
        const fetched = await fetchStrictPartById(part.key);
        const live = latest.current;
        if (!mountedRef.current || !live.key || !sameOrderSession(owner, live.key)) return;
        setRows(prev => prev.map(r => (r.key === rowKey
          ? { ...r, unitPrice: String(fetched.sellingPrice), description: fetched.name, partNameSnapshot: fetched.name, partSku: fetched.sku ?? '', warrantyPolicy: fetched.warrantyPolicy ?? '', warrantyTermDays: fetched.warrantyDays != null ? String(fetched.warrantyDays) : '' }
          : r)));
      } catch {
        if (!mountedRef.current) return;
        setRows(prev => prev.filter(r => r.key !== rowKey));
        setFormError('Không lấy được giá linh kiện từ FixHome. Hãy chọn lại.');
      }
    })();
  };
  const setHeldQuantity = (rowKey: string, available: number, quantity: string) => {
    if (!canEdit) return;
    const n = Math.min(available, Math.max(1, Number(quantity) || 1));
    setRows(prev => prev.map(r => (r.key === rowKey ? { ...r, quantity: String(n) } : r)));
  };
  const onAddRow = (kind: 'labor' | 'parts_equipment') => {
    if (!canEdit || rows.length >= QUOTE_MAX_ITEMS) return;
    const row = kind === 'labor' ? newLabor() : newPart(); setRows(prev => [...prev, row]); setExpandedKey(row.key);
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
          <Section title="Lý do phát sinh" required>
            <View style={styles.pad}>
              <TextInput
                testID="proposal-reason-input"
                style={[styles.reasonInput, !!reasonError && styles.inputError]}
                multiline
                numberOfLines={3}
                placeholder="Ví dụ: phát hiện hỏng van áp suất gas trong lúc sửa"
                placeholderTextColor={colors.muted}
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
          </Section>

          {canEdit ? (
            <>
              <Section title="Tiền công">
                {rows.filter(row => !isPart(row)).map((row, index) => (
                  <LaborCard key={row.key} row={row} index={index} errors={rowErrors[row.key]} disabled={!canEdit}
                    onChange={next => onRowChange(next)} onRemove={() => onRemoveRow(row.key)} />
                ))}
                <AddRow testID="proposal-add-labor" label="Thêm tiền công" disabled={rows.length >= QUOTE_MAX_ITEMS} onPress={() => onAddRow('labor')} />
              </Section>

              <Section title="Linh kiện">
                <GroupLabel title="Còn lại sau báo giá" />
                {heldParts.length
                  ? heldParts.map(part => (
                    <HeldPartCard key={part.key} name={part.name} available={part.quantity} row={rows.find(r => r.key === `${HELD_KEY}${part.key}`)} disabled={!canEdit || part.key.startsWith('name:')}
                      onToggle={() => toggleHeld(part)} onQuantity={quantity => setHeldQuantity(`${HELD_KEY}${part.key}`, part.quantity, quantity)} />
                  ))
                  : <Text style={styles.heldEmpty}>{heldReady ? 'Không còn linh kiện sau báo giá.' : 'Đang tải…'}</Text>}
                <GroupLabel title="Cần thêm từ kho" hint="Kho cấp sau khi khách duyệt." />
                {rows.filter(row => isPart(row) && !row.key.startsWith(HELD_KEY)).map(row => (
                  <PartLineCard key={row.key} row={row} maxQuantity={PART_QUANTITY_MAX} disabled={!canEdit}
                    onQuantity={quantity => onRowChange({ ...row, quantity })} onRemove={() => onRemoveRow(row.key)} />
                ))}
                <AddRow testID="proposal-add-parts" label="Chọn linh kiện từ kho FixHome" hint="Mở khung tìm và chọn linh kiện trong kho FixHome"
                  disabled={rows.length >= QUOTE_MAX_ITEMS} onPress={() => sheetRef.current?.present()} />
              </Section>
            </>
          ) : (
            <View style={styles.section}>
              <Text accessibilityRole="header" style={styles.sectionTitle}>Hạng mục chi phí · {rows.length}</Text>
              {rows.map((row, index) => {
                const subtotal = rowSubtotals[index];
                return <View key={row.key} style={styles.card}><DetailRow label={row.description || 'Hạng mục'} value={subtotal === null ? `${row.quantity || '—'} × ${row.unitPrice || '—'}` : `${row.quantity} × ${formatVnd(Number(row.unitPrice))} = ${formatVnd(subtotal)}`} /></View>;
              })}
            </View>
          )}

          {hasFixHome && (
            <Section title="Hình thức nhận linh kiện">
              <View style={styles.pad}>
                <FulfillmentMethodPicker
                  testIDPrefix="proposal-method"
                  value={fulfillmentMethod}
                  disabled={!canEdit}
                  onChange={method => { if (canEdit) setFulfillmentMethod(method); }}
                />
                {fulfillmentMethod === 'delivery' && (
                  <View style={styles.shipping}>
                    <Text style={styles.inputLabel}>Phí giao linh kiện (đ) <Text style={{ color: colors.error }}>*</Text></Text>
                    <TextInput testID="proposal-shipping-fee" accessibilityLabel="Phí giao linh kiện" keyboardType="number-pad" placeholder="25000" placeholderTextColor={colors.muted} value={shippingFee} editable={canEdit} onChangeText={text => { if (canEdit) setShippingFee(text); }} style={[styles.reasonInput, styles.singleLine]} />
                    <Text style={styles.infoText}>{shippingValue !== null && shippingNeeded ? `Khách sẽ thấy phí giao ${formatVnd(shippingValue)}.` : 'Nhập số nguyên, đơn vị đồng (nhập 0 nếu không thu phí).'}</Text>
                  </View>
                )}
              </View>
            </Section>
          )}

          <Section title="Ghi chú">
            <View style={styles.pad}>
              <TextInput accessibilityLabel="Ghi chú đề xuất" placeholder="Thông tin thêm cho khách hàng" placeholderTextColor={colors.muted} value={note} editable={canEdit} onChangeText={text => { if (canEdit) setNote(text); }} multiline style={styles.reasonInput} />
            </View>
          </Section>

          <Section title="Ảnh bằng chứng">
            <View style={styles.pad}>
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
          </Section>
        </>
      )}
      {canEdit && (
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
            canAdd={canEdit}
            onToggle={option => { void togglePick(option); }}
            onQuantity={setPickQuantity}
            onAdd={addPicked}
            onClose={() => sheetRef.current?.dismiss()}
            onLoadCatalog={search => { void loadCatalog(search); }}
          />
        </BottomSheetModal>
      )}
    </TaskScreenShell>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  heldEmpty: { color: colors.textSecondary, fontSize: 14, lineHeight: 21, padding: spacing.md },
  pad: { padding: spacing.md, gap: 8 },
  section: { gap: 8 },
  sectionTitle: { color: colors.text, fontSize: 16, lineHeight: 24, fontWeight: '700' },
  inputLabel: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  reasonInput: {
    minHeight: 94,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    lineHeight: 24,
    color: colors.text,
    backgroundColor: colors.surface,
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
  totalBar: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  totalLabel: { flex: 1, fontSize: 14, color: colors.textSecondary },
  totalValue: { fontSize: 18, fontWeight: '700', color: colors.primaryStrong },
  totalHint: { fontSize: 12, color: colors.textSecondary, lineHeight: 17 },
});
