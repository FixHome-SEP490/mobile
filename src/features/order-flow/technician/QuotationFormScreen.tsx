import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { isHistoricalOrder } from '../../../api/orders.api';
import { useOrderSession } from '../runtime/OrderSessionProvider';
import { useTechnicianQuotation } from './useTechnicianQuotation';
import {
  QUOTE_MAX_ITEMS,
  validateQuotationPayload,
} from './technician-quotation-controller';
import { fetchStrictCatalog, fetchStrictPartById } from './parts-catalog-adapter';
import { getRestoredQuotationRecovery } from '../domain/quotation-recovery';
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

/**
 * T07 — technician inspection-quotation form. The frozen controller validator
 * owns every DTO rule; this screen only shapes row drafts into raw validator
 * input and renders validator messages. One expanded row at a time, catalog
 * from the real strict adapter with explicit retry, server total authoritative.
 */
export default function QuotationFormScreen() {
  const { key, snapshot, refresh, loadResource, journal } = useOrderSession();
  const navigation = useNavigation<any>();
  const { controller, state } = useTechnicianQuotation();
  const ownerKey = key ? `${key.userId}/${key.sessionGeneration}/${key.serviceOrderId}` : null;
  const [initialRow] = useState(() => createCostItemRow('labor'));
  const [rows, setRows] = useState<CostItemRow[]>(() => [initialRow]);
  const [note, setNote] = useState('');
  const [expandedKey, setExpandedKey] = useState<string | null>(() => initialRow.key);
  const [catalog, setCatalog] = useState<CostItemCatalogPanel>({ status: 'idle', parts: [], error: null });
  const [reviewing, setReviewing] = useState(false);
  const [estimate, setEstimate] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useLoadUnloadedResources(snapshot, ['quotations'], loadResource);

  const orderValue = snapshot?.order.status === 'ready' ? snapshot.order.data : null;
  const order = orderValue && !isHistoricalOrder(orderValue) ? orderValue : null;
  const current = !!key && !!order && snapshot?.access === 'current' && order.id === key.serviceOrderId && order.technician?.id === key.userId;
  const fixedPrice = String(order?.pricingMode ?? '').toUpperCase() === 'FIXED_PRICE';
  const inspection = String(order?.pricingMode ?? '').toUpperCase() === 'INSPECTION_REQUIRED';
  const quotationsStatus = snapshot?.resources.quotations.status;
  const quotations = quotationsStatus === 'ready' && current
    ? snapshot.resources.quotations.data.filter(q => q.serviceOrderId === key!.serviceOrderId)
    : [];
  const hasApproved = quotations.some(q => String(q.status).toUpperCase() === 'APPROVED');
  const gateOk = current && !!order && order.status === 'EN_ROUTE' && order.arrivalVerified === true && inspection && !fixedPrice;

  const [draftOwner, setDraftOwner] = useState<string | null>(() => ownerKey);

  // Ownership/assignment change clears the memory-bound draft and sheets via
  // a render-phase guard (no reset effect): the draft belongs to one owner.
  if (draftOwner !== ownerKey) {
    const initial = createCostItemRow('labor');
    setDraftOwner(ownerKey);
    setRows([initial]);
    setExpandedKey(initial.key);
    setNote('');
    setCatalog({ status: 'idle', parts: [], error: null });
    setReviewing(false);
    setEstimate(null);
    setFormError(null);
  }

  const recovery = useMemo(
    () => (key && snapshot ? getRestoredQuotationRecovery(journal, key, snapshot) : { hasRecovery: false as const, isUnresolved: false as const }),
    [journal, key, snapshot],
  );
  const showRecovery = recovery.hasRecovery && recovery.operation === 'quote-create';

  const busy = state.phase === 'submitting' || state.phase === 'verifying';
  const isUnknown = state.phase === 'unknown';
  // Busy/unknown/restored-pending denies every draft update and send;
  // GET-only verify and refresh stay usable.
  const frozen = busy || isUnknown || showRecovery;
  const canEdit = gateOk && !hasApproved && quotationsStatus === 'ready' && !frozen && state.phase !== 'resolved' && !reviewing;
  const refreshing = snapshot?.order.status === 'loading' || quotationsStatus === 'loading';

  // Async catalog fences: generation per load and per row selection, latest
  // owner/current/source checks, and unmount invalidation — no framework.
  const mountedRef = useRef(true);
  useEffect(() => () => {
    mountedRef.current = false;
  }, []);
  const ownerRef = useRef(ownerKey);
  const rowsRef = useRef(rows);
  const canEditRef = useRef(canEdit);
  useEffect(() => {
    ownerRef.current = ownerKey;
    rowsRef.current = rows;
    canEditRef.current = canEdit;
  });
  const catalogLoadGen = useRef(0);
  const catalogSelectGen = useRef(0);
  const pendingSelect = useRef<Record<string, string>>({});

  const updateRow = (rowKey: string, next: CostItemRow) => {
    if (frozen || reviewing) return;
    setRows(prev => prev.map(r => (r.key === rowKey ? next : r)));
    setReviewing(false);
  };

  const removeRow = (rowKey: string) => {
    if (frozen || reviewing || rows.length <= 1) return;
    setRows(prev => prev.filter(r => r.key !== rowKey));
    setExpandedKey(prev => (prev === rowKey ? null : prev));
    setReviewing(false);
  };

  const addRow = () => {
    if (frozen || reviewing || !canEdit) return;
    if (rows.length >= QUOTE_MAX_ITEMS) {
      setFormError(`Số lượng hạng mục tối đa ${QUOTE_MAX_ITEMS}.`);
      return;
    }
    const next = createCostItemRow('parts_equipment');
    setRows(prev => [...prev, next]);
    setExpandedKey(next.key);
    setReviewing(false);
    setFormError(null);
  };

  const loadCatalog = (search?: string) => {
    if (frozen || reviewing) return;
    const gen = catalogLoadGen.current + 1;
    catalogLoadGen.current = gen;
    const owner = ownerKey;
    setCatalog({ status: 'loading', parts: [], error: null });
    void (async () => {
      try {
        const result = await fetchStrictCatalog({ limit: 50, ...(search?.trim() ? { search: search.trim() } : {}) });
        // Stale load (superseded request, owner/session switch, unmount) is ignored.
        if (!mountedRef.current || gen !== catalogLoadGen.current || ownerRef.current !== owner || !canEditRef.current) return;
        if (!result.data.length) {
          setCatalog({ status: 'empty', parts: [], error: null });
          return;
        }
        setCatalog({
          status: 'ready',
          parts: result.data.map(part => ({
            id: part.id,
            name: part.name,
            sellingPrice: part.sellingPrice,
            warrantyDays: part.warrantyDays,
            warrantyPolicy: part.warrantyPolicy,
            sku: part.sku,
          })),
          error: null,
        });
      } catch {
        // Failure is an explicit error with retry, never an empty placeholder catalogue.
        if (!mountedRef.current || gen !== catalogLoadGen.current || ownerRef.current !== owner || !canEditRef.current) return;
        setCatalog({ status: 'error', parts: [], error: 'Không tải được danh mục. Hãy thử tải lại.' });
      }
    })();
  };

  const selectCatalogPart = (rowKey: string, option: CostItemCatalogOption) => {
    if (frozen || reviewing) return;
    const row = rowsRef.current.find(r => r.key === rowKey);
    if (!row || row.kind !== 'parts_equipment' || row.partSource !== 'fixhome') return;
    const gen = catalogSelectGen.current + 1;
    catalogSelectGen.current = gen;
    const owner = ownerKey;
    pendingSelect.current[rowKey] = option.id;
    void (async () => {
      try {
        // The server rehydrates authoritative price/name/warranty by exact ID.
        const part = await fetchStrictPartById(option.id);
        // A response initiated before confirm/unknown must never mutate rows
        // frozen afterward: drop unless still mounted, latest, same owner, and editable.
        if (!mountedRef.current || gen !== catalogSelectGen.current || ownerRef.current !== owner || !canEditRef.current) return;
        // Latest selection wins: an older response never overwrites a newer pick.
        if (pendingSelect.current[rowKey] !== option.id) return;
        // The row must still be current, editable, and on the same source —
        // a source/type change or removal since the tap drops the stale part.
        const latest = rowsRef.current.find(r => r.key === rowKey);
        if (!latest || latest.kind !== 'parts_equipment' || latest.partSource !== 'fixhome') return;
        setRows(prev => prev.map(r => (r.key === rowKey
          ? {
            ...r,
            partCatalogId: part.id,
            partNameSnapshot: part.name,
            partSku: part.sku ?? '',
            warrantyPolicy: part.warrantyPolicy ?? '',
            unitPrice: String(part.sellingPrice),
            description: r.description.trim() ? r.description : part.name,
          }
          : r)));
        setFormError(null);
      } catch {
        if (!mountedRef.current || gen !== catalogSelectGen.current || ownerRef.current !== owner || !canEditRef.current) return;
        if (pendingSelect.current[rowKey] !== option.id) return;
        const latest = rowsRef.current.find(r => r.key === rowKey);
        if (!latest || latest.kind !== 'parts_equipment' || latest.partSource !== 'fixhome') return;
        setFormError('Mã danh mục không khớp với máy chủ. Hãy chọn lại.');
      }
    })();
  };

  const buildPayload = () => ({
    items: rows.map(costItemRowToPayloadItem),
    ...(note.trim() ? { note: note.trim() } : {}),
  });

  const openReview = () => {
    if (!canEdit) return;
    const payload = buildPayload();
    if (!controller.confirm(payload)) {
      setFormError(controller.getState().message ?? 'Dữ liệu báo giá chưa hợp lệ.');
      setReviewing(false);
      return;
    }
    try {
      const validated = validateQuotationPayload(payload);
      setEstimate(validated.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0));
    } catch {
      setEstimate(null);
    }
    setFormError(null);
    setReviewing(true);
  };

  const sendQuotation = () => {
    if (busy) return;
    setReviewing(false);
    void controller.submit();
  };

  const cancelReview = () => {
    controller.cancelConfirm();
    setReviewing(false);
  };

  const onPrimary = () => {
    if (busy) return;
    if (state.phase === 'unknown' || (state.phase === 'idle' && showRecovery)) {
      void controller.verify();
      return;
    }
    if (state.phase === 'resolved') {
      navigation.navigate('OrderTask');
      return;
    }
    openReview();
  };

  const onBack = () => {
    // Back/hardware close cancels the review with zero POST.
    if (reviewing) {
      cancelReview();
      return;
    }
    navigation.goBack();
  };

  if (!current || !order) {
    return (
      <TaskScreenShell title="Tạo báo giá" onBack={() => navigation.goBack()}>
        <ReadOnlyNotice>
          {snapshot?.access === 'historical'
            ? 'Báo giá không được tạo cho đơn lịch sử.'
            : 'Báo giá chỉ được tạo sau khi máy chủ xác minh quyền xem đơn hiện tại.'}
        </ReadOnlyNotice>
      </TaskScreenShell>
    );
  }

  if (fixedPrice) {
    return (
      <TaskScreenShell
        title="Tạo báo giá"
        stage={2}
        onBack={() => navigation.goBack()}
        primary={{ label: 'Tiếp tục', testID: 'quote-bypass-continue', onPress: () => navigation.navigate('OrderTask') }}
      >
        <ReadOnlyNotice>Đơn giá cố định không cần tạo báo giá khảo sát.</ReadOnlyNotice>
      </TaskScreenShell>
    );
  }

  return (
    <TaskScreenShell
      title="Tạo báo giá"
      stage={2}
      onBack={onBack}
      secondary={
        reviewing
          ? {
              label: 'Hủy',
              testID: 'quote-review-cancel',
              disabled: busy,
              onPress: cancelReview,
            }
          : {
              label: 'Làm mới dữ liệu',
              testID: 'task-refresh',
              disabled: busy || refreshing,
              onPress: () => {
                if (!busy && !refreshing) void refresh('manual');
              },
            }
      }
      primary={
        reviewing
          ? {
              label: busy ? 'Đang xử lý.' : 'Gửi báo giá',
              testID: 'quote-send',
              disabled: busy,
              onPress: sendQuotation,
            }
          : {
              label: busy
                ? 'Đang xử lý.'
                : state.phase === 'unknown' || (state.phase === 'idle' && showRecovery)
                  ? 'Kiểm tra lại'
                  : state.phase === 'resolved'
                    ? 'Tiếp tục'
                    : 'Xem báo giá',
              testID: state.phase === 'unknown' || (state.phase === 'idle' && showRecovery)
                ? 'quote-verify'
                : state.phase === 'resolved'
                  ? 'quote-continue'
                  : 'quote-review',
              disabled: busy || (!canEdit && state.phase !== 'unknown' && state.phase !== 'resolved' && !showRecovery),
              onPress: onPrimary,
            }
      }
    >
      {showRecovery && state.phase !== 'resolved' && (
        <ReadOnlyNotice>
          Có thao tác tạo báo giá chưa rõ kết quả từ phiên trước. Hãy kiểm tra lại từ máy chủ, không tạo mới.
        </ReadOnlyNotice>
      )}

      {quotationsStatus === 'unloaded' && <ReadOnlyNotice>Đang tải báo giá từ máy chủ.</ReadOnlyNotice>}
      {quotationsStatus === 'error' && (
        <View style={{ gap: 8 }}>
          <ReadOnlyNotice>Không tải được báo giá. Không thể kết luận đơn chưa có báo giá.</ReadOnlyNotice>
          <TouchableOpacity
            testID="quote-quotations-retry"
            accessibilityRole="button"
            onPress={() => {
              void loadResource('quotations');
            }}
            style={{ minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12 }}
          >
            <Text style={{ color: colors.primaryStrong, fontSize: 15, fontWeight: '600' }}>Tải lại báo giá</Text>
          </TouchableOpacity>
        </View>
      )}

      {!gateOk && quotationsStatus === 'ready' && (
        <ReadOnlyNotice>Đơn chưa đủ điều kiện tạo báo giá (cần đang di chuyển, đã xác nhận đến nơi, báo giá theo khảo sát).</ReadOnlyNotice>
      )}
      {hasApproved && (
        <ReadOnlyNotice>Báo giá đã được duyệt. Màn hình này chỉ đọc; theo dõi tiến độ sửa chữa.</ReadOnlyNotice>
      )}

      {state.phase === 'resolved' && (
        <ReadOnlyNotice>Đã gửi báo giá. Máy chủ sẽ hiển thị trạng thái mới sau khi làm mới; không gửi thêm vì phiên bản mới hơn không có nghĩa là tạo mới.</ReadOnlyNotice>
      )}

      {canEdit && (
        <View style={{ gap: 8 }}>
          {rows.map(row => (
            <CostItemEditor
              key={row.key}
              row={row}
              catalog={catalog}
              expanded={expandedKey === row.key}
              canRemove={rows.length > 1}
              onToggle={() => setExpandedKey(prev => (prev === row.key ? null : row.key))}
              onChange={next => updateRow(row.key, next)}
              onRemove={() => removeRow(row.key)}
              onLoadCatalog={search => {
                void loadCatalog(search);
              }}
              onSelectCatalogPart={part => selectCatalogPart(row.key, part)}
            />
          ))}
          <TouchableOpacity
            testID="quote-add-item"
            accessibilityRole="button"
            disabled={frozen || reviewing}
            onPress={addRow}
            style={{ minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12 }}
          >
            <Text style={{ color: colors.primaryStrong, fontSize: 15, fontWeight: '600' }}>Thêm hạng mục</Text>
          </TouchableOpacity>

          <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Ghi chú chung (tùy chọn)</Text>
          <TextInput
            testID="quote-note"
            accessibilityLabel="Ghi chú báo giá"
            value={note}
            onChangeText={value => {
              if (frozen || reviewing) return;
              setNote(value);
              setReviewing(false);
            }}
            placeholder="Ghi chú cho khách hàng"
            placeholderTextColor={colors.muted}
            maxLength={5000}
            style={{ minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, color: colors.text, fontSize: 16, backgroundColor: colors.surface }}
          />
        </View>
      )}

      {reviewing && (
        <View testID="quote-review-sheet" style={{ backgroundColor: colors.surface, borderRadius: 12, padding: spacing.md, gap: 8 }}>
          <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700' }}>Xem lại báo giá</Text>
          <DetailRow label="Số hạng mục" value={rows.length} />
          <DetailRow label="Ước tính" value={estimate !== null ? formatVnd(estimate) : 'Chưa tính được'} />
          <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>
            Số ước tính để tham khảo; tổng theo máy chủ trên chi tiết đã gửi mới có hiệu lực. Dùng nút gửi ở thanh dưới cùng, ngoài vùng cuộn.
          </Text>
        </View>
      )}

      {(formError || (state.phase === 'denied' && state.message)) && (
        <Text testID="quote-form-error" accessibilityRole="alert" style={{ color: colors.error, fontSize: 14, lineHeight: 21 }}>
          {formError ?? state.message}
        </Text>
      )}
      {state.phase === 'unknown' && <ReadOnlyNotice>{state.message ?? 'Kết quả chưa xác định. Không gửi lại.'}</ReadOnlyNotice>}

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TouchableOpacity
          testID="task-detail-link"
          accessibilityRole="button"
          onPress={() => navigation.navigate('OrderInformation')}
          style={{ flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12 }}
        >
          <Text style={{ color: colors.primaryStrong, fontSize: 15, fontWeight: '600' }}>Chi tiết đơn</Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="quote-scope-link"
          accessibilityRole="button"
          onPress={() => navigation.navigate('ScopeDetail')}
          style={{ flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12 }}
        >
          <Text style={{ color: colors.primaryStrong, fontSize: 15, fontWeight: '600' }}>Phạm vi và giá</Text>
        </TouchableOpacity>
      </View>
    </TaskScreenShell>
  );
}
