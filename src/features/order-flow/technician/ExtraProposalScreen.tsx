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
  createCostItemRow,
  type CostItemCatalogOption,
  type CostItemCatalogPanel,
  type CostItemRow,
} from '../shared/CostItemEditor';
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
    setConfirmation(null); setFormError(null); setCatalog({ status: 'idle', parts: [], error: null });
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
  let estimatedTotal: number | null = null;
  try { const payload = buildPayload(); estimatedTotal = payload.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, payload.shippingFee ?? 0); } catch { /* Unknown is never zero. */ }
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
  };
  const onStartSubmit = () => {
    if (!canEdit || !key || !latest.current.canEdit || !sameOrderSession(latest.current.key, key)) return;
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
        <ReadOnlyNotice>
          Có thao tác đề xuất chi phí chưa rõ kết quả từ phiên trước. Vui lòng kiểm tra lại từ máy chủ trước khi tiếp tục.
        </ReadOnlyNotice>
      )}

      {state.error && <ReadOnlyNotice>{state.error}</ReadOnlyNotice>}
      {formError && <ReadOnlyNotice>{formError}</ReadOnlyNotice>}
      {state.actionSuccess && <ReadOnlyNotice>{state.actionSuccess}</ReadOnlyNotice>}

      {revisingCostId ? (
        <View style={styles.card}>
          <DetailRow label="Đang sửa đề xuất" value={revisingCostId} />
          <Text style={styles.infoText}>Bản sửa đổi sẽ tạo một mã đề xuất mới thay thế cho bản cũ.</Text>
        </View>
      ) : null}

      {confirming ? (
        <View style={styles.confirmBox} testID="proposal-confirm-sheet">
          <Text style={styles.confirmTitle}>
            {revisingCostId ? 'Xác nhận gửi bản sửa đổi' : 'Xác nhận gửi đề xuất chi phí'}
          </Text>
          <Text style={styles.confirmText}>
            Tổng chi phí phát sinh ước tính: {estimatedTotal === null ? 'Chưa xác định' : formatVnd(estimatedTotal)}.
            Khách hàng sẽ nhận được thông báo để duyệt đề xuất này.
          </Text>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.inputLabel}>Lý do phát sinh chi phí *</Text>
        <TextInput
          testID="proposal-reason-input"
          style={styles.reasonInput}
          multiline
          numberOfLines={3}
          placeholder="Nhập lý do chi tiết (ví dụ: phát hiện hỏng van áp suất gas trong lúc sửa)..."
          placeholderTextColor={colors.textSecondary}
          value={reason}
          onChangeText={text => { if (canEdit) setReason(text); }}
          editable={canEdit}
          accessibilityLabel="Lý do phát sinh chi phí"
          maxLength={EXTRA_REASON_MAX}
        />
        <Text style={styles.charCount}>{reason.length}/{EXTRA_REASON_MAX}</Text>
      </View>

      <View style={{ gap: 8, marginBottom: spacing.sm }}>
        {canEdit ? rows.map((row) => (
          <CostItemEditor
            key={row.key}
            row={row}
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
        )) : rows.map(row => <View key={row.key} style={styles.card}><DetailRow label={row.description || 'Hạng mục'} value={`${row.quantity || '—'} × ${row.unitPrice || '—'}`} /></View>)}
        {canEdit && (
          <TouchableOpacity
            testID="proposal-add-item"
            accessibilityRole="button"
            disabled={!canEdit || confirming}
            onPress={() => onAddRow('parts_equipment')}
            style={styles.addBtn}
          >
            <Text style={styles.addBtnText}>+ Thêm hạng mục</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.inputLabel}>Ghi chú (tùy chọn)</Text>
        <TextInput accessibilityLabel="Ghi chú đề xuất" value={note} editable={canEdit} onChangeText={text => { if (canEdit) setNote(text); }} multiline style={styles.reasonInput} />
      </View>
      {hasFixHome && <View style={styles.card}>
        <Text style={styles.inputLabel}>Hình thức nhận linh kiện</Text>
        {(['pickup', 'delivery'] as const).map(method => <TouchableOpacity key={method} testID={`proposal-method-${method}`} accessibilityRole="radio" accessibilityState={{ selected: fulfillmentMethod === method, disabled: !canEdit }} disabled={!canEdit} style={styles.addBtn} onPress={() => { if (canEdit) setFulfillmentMethod(method); }}><Text>{method === 'pickup' ? 'Tự lấy tại kho' : 'Giao hàng tận nơi'}</Text></TouchableOpacity>)}
        {fulfillmentMethod === 'delivery' && <><Text style={styles.inputLabel}>Phí giao linh kiện *</Text><TextInput testID="proposal-shipping-fee" accessibilityLabel="Phí giao linh kiện" keyboardType="number-pad" value={shippingFee} editable={canEdit} onChangeText={text => { if (canEdit) setShippingFee(text); }} style={styles.reasonInput} /></>}
      </View>}
      <View style={styles.card}>
        <Text style={styles.inputLabel}>Ảnh bằng chứng đã tải lên (tùy chọn)</Text>
        {snapshot?.resources.evidence.status !== 'ready' && <Text>Chưa tải được danh sách ảnh. Hãy làm mới dữ liệu.</Text>}
        {evidence.map((photo, index) => <TouchableOpacity key={photo.id} testID={`proposal-evidence-${photo.id}`} accessibilityRole="checkbox" accessibilityState={{ checked: evidenceRefs.some(ref => evidenceAsset(ref) === evidenceAsset(photo.mediaUrl)), disabled: !canEdit }} disabled={!canEdit} style={styles.addBtn} onPress={() => { if (canEdit) setEvidenceRefs(refs => refs.some(ref => evidenceAsset(ref) === evidenceAsset(photo.mediaUrl)) ? refs.filter(ref => evidenceAsset(ref) !== evidenceAsset(photo.mediaUrl)) : refs.length < 10 ? [...refs, photo.mediaUrl] : refs); }}><Text>{evidenceRefs.some(ref => evidenceAsset(ref) === evidenceAsset(photo.mediaUrl)) ? '✓ ' : ''}{photo.type === 'BEFORE' ? 'Trước sửa chữa' : 'Sau sửa chữa'} · Ảnh {index + 1}</Text></TouchableOpacity>)}
        <TouchableOpacity
          testID="proposal-capture-after"
          accessibilityRole="button"
          accessibilityLabel="Chụp ảnh sau sửa chữa mới"
          accessibilityHint="Mở màn chụp ảnh sau sửa chữa; bản nháp đề xuất này được giữ nguyên"
          disabled={!canEdit}
          onPress={() => { if (canEdit) navigation.navigate('AfterEvidence', { fromProposal: true, ...(revisingCostId ? { proposalId: revisingCostId } : {}) }); }}
          style={styles.addBtn}
        >
          <Text>Chụp ảnh sau sửa chữa mới ›</Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="proposal-reload-evidence"
          accessibilityRole="button"
          accessibilityLabel="Tải lại danh sách ảnh"
          accessibilityHint="Tải lại ảnh từ máy chủ để lấy ảnh vừa chụp, không gửi đề xuất"
          onPress={() => { void loadResource('evidence'); }}
          style={styles.addBtn}
        >
          <Text>Tải lại danh sách ảnh</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.card} testID="proposal-estimate-total">
        <DetailRow
          label="Tổng ước tính (chưa phải hóa đơn)"
          value={estimatedTotal === null ? 'Chưa xác định' : formatVnd(estimatedTotal)}
        />
      </View>
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
  confirmBox: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  confirmTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.primaryStrong,
    marginBottom: 4,
  },
  confirmText: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
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
});
