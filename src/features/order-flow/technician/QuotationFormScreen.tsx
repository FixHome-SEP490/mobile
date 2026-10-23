import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { BottomSheetBackdrop, BottomSheetModal } from '@gorhom/bottom-sheet';
import * as Haptics from 'expo-haptics';
import { Info } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { isHistoricalOrder } from '../../../api/orders.api';
import { useOrderSession } from '../runtime/OrderSessionProvider';
import { useTechnicianQuotation } from './useTechnicianQuotation';
import { QUOTE_MAX_ITEMS, validateQuotationPayload } from './technician-quotation-controller';
import { PART_QUANTITY_MAX } from './parts-controller';
import { fetchStrictCatalog, fetchStrictPartById } from './parts-catalog-adapter';
import { getRestoredQuotationRecovery } from '../domain/quotation-recovery';
import {
  costItemRowSubtotal,
  costItemRowToPayloadItem,
  createCostItemRow,
  validateCostItemRows,
  type CostItemCatalogOption,
  type CostItemCatalogPanel,
  type CostItemFieldErrors,
  type CostItemRow,
} from '../shared/CostItemEditor';
import { PartPickerRow } from '../shared/PartPickerRow';
import { DetailRow, ReadOnlyNotice, TaskScreenShell } from '../shared/TaskScreenShell';
import { useLoadUnloadedResources } from '../shared/useLoadUnloadedResources';
import { AddRow, EarlierPartCard, GroupLabel, LaborCard, LinkRow, PartLineCard, Section, type EarlierPartLine } from './QuotationItemCards';
import { formatVnd } from '../../../utils/format';
import { lightTheme as colors, spacing, type ToneName } from '../../../constants/theme';

const EARLIER_STATUS: Record<string, { label: string; tone: ToneName }> = {
  requested: { label: 'Đã gửi yêu cầu', tone: 'neutral' },
  ready: { label: 'Sẵn sàng lấy', tone: 'info' },
  delivering: { label: 'Đang giao', tone: 'warning' },
  received: { label: 'Đã nhận linh kiện', tone: 'success' },
};
const EARLIER_KEY = 'req-';
const newLabor = (): CostItemRow => ({ ...createCostItemRow('labor'), quantity: '1' });
const newPart = (): CostItemRow => ({ ...createCostItemRow('parts_equipment'), partSource: 'fixhome', quantity: '1' });
const isPart = (row: CostItemRow) => row.kind === 'parts_equipment';
const hasPrice = (row: CostItemRow) => /^\d+$/.test(row.unitPrice.trim());
const sum = (rows: CostItemRow[]) => rows.reduce((total, row) => total + (costItemRowSubtotal(row) ?? 0), 0);

/**
 * T07 — technician inspection-quotation form. The frozen controller validator owns every DTO rule;
 * this screen only shapes row drafts into raw validator input. Parts are FixHome parts only: either
 * a part already asked for before the repair (ticked as a whole line) or a new one from the stock
 * list. Price and warranty always come from the server by exact catalog ID; the server total is authoritative.
 */
export default function QuotationFormScreen() {
  const { key, snapshot, refresh, loadResource, journal } = useOrderSession();
  const navigation = useNavigation<any>();
  const { controller, state } = useTechnicianQuotation();
  const ownerKey = key ? `${key.userId}/${key.sessionGeneration}/${key.serviceOrderId}` : null;
  const [rows, setRows] = useState<CostItemRow[]>(() => [newLabor()]);
  const [note, setNote] = useState('');
  const [catalog, setCatalog] = useState<CostItemCatalogPanel>({ status: 'idle', parts: [], error: null });
  const [picked, setPicked] = useState<CostItemRow[]>([]);
  const [pickError, setPickError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [estimate, setEstimate] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, CostItemFieldErrors>>({});

  useLoadUnloadedResources(snapshot, ['quotations', 'parts'], loadResource);

  const orderValue = snapshot?.order.status === 'ready' ? snapshot.order.data : null;
  const order = orderValue && !isHistoricalOrder(orderValue) ? orderValue : null;
  const current = !!key && !!order && snapshot?.access === 'current' && order.id === key.serviceOrderId && order.technician?.id === key.userId;
  const fixedPrice = String(order?.pricingMode ?? '').toUpperCase() === 'FIXED_PRICE';
  const inspection = String(order?.pricingMode ?? '').toUpperCase() === 'INSPECTION_REQUIRED';
  const quotationsStatus = snapshot?.resources.quotations.status;
  const partsStatus = snapshot?.resources.parts.status;
  const quotations = quotationsStatus === 'ready' && current
    ? snapshot.resources.quotations.data.filter(q => q.serviceOrderId === key!.serviceOrderId)
    : [];
  const hasApproved = quotations.some(q => String(q.status).toUpperCase() === 'APPROVED');
  const gateOk = current && !!order && order.status === 'EN_ROUTE' && order.arrivalVerified === true && inspection && !fixedPrice;

  // Parts asked for before the repair that the quote may reuse: still alive, FixHome, not given back.
  const earlierLines = useMemo<EarlierPartLine[]>(() => {
    const parts = snapshot?.resources.parts;
    if (!current || parts?.status !== 'ready' || !Array.isArray(parts.data)) return [];
    return parts.data
      .filter(pr => pr.serviceOrderId === key!.serviceOrderId && pr.technicianId === key!.userId && pr.requestType === 'pre_repair' && !!EARLIER_STATUS[pr.status])
      .flatMap(pr => pr.items
        .filter(item => !!item.partCatalogId && (item.partSource ?? 'fixhome') === 'fixhome' && item.usageStatus !== 'returned')
        .map(item => ({ id: item.id, catalogId: item.partCatalogId!, name: item.partNameSnapshot, quantity: item.quantity, statusLabel: EARLIER_STATUS[pr.status].label, tone: EARLIER_STATUS[pr.status].tone })));
  }, [current, key, snapshot]);

  const [draftOwner, setDraftOwner] = useState<string | null>(() => ownerKey);

  // Ownership/assignment change clears the memory-bound draft and sheet via a render-phase
  // guard (no reset effect): the draft belongs to one owner.
  if (draftOwner !== ownerKey) {
    setDraftOwner(ownerKey);
    setRows([newLabor()]);
    setNote('');
    setCatalog({ status: 'idle', parts: [], error: null });
    setPicked([]);
    setPickError(null);
    setReviewing(false);
    setEstimate(null);
    setFormError(null);
    setFieldErrors({});
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

  const laborRows = rows.filter(row => !isPart(row));
  const freshRows = rows.filter(row => isPart(row) && !row.key.startsWith(EARLIER_KEY));
  const liveTotal = sum(rows);

  // Async fences: latest owner/editable checks and unmount invalidation — no framework.
  const sheetRef = useRef<BottomSheetModal>(null);
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
  const latest = useRef({ ownerKey, canEdit, rows });
  useLayoutEffect(() => { latest.current = { ownerKey, canEdit, rows }; });
  const loadGen = useRef(0);
  const wanted = useRef(new Set<string>());
  useLayoutEffect(() => { loadGen.current += 1; wanted.current.clear(); }, [ownerKey]);
  const live = (owner: string | null) => mountedRef.current && latest.current.ownerKey === owner;

  const updateRow = (rowKey: string, next: CostItemRow) => {
    if (frozen || reviewing) return;
    setRows(prev => prev.map(r => (r.key === rowKey ? next : r)));
    setFieldErrors(prev => { if (!prev[rowKey]) return prev; const { [rowKey]: _drop, ...rest } = prev; return rest; });
    setReviewing(false);
  };

  const removeRow = (rowKey: string) => {
    if (frozen || reviewing) return;
    setRows(prev => prev.filter(r => r.key !== rowKey));
    setReviewing(false);
  };

  const addLabor = () => {
    if (!canEdit) return;
    if (rows.length >= QUOTE_MAX_ITEMS) { setFormError(`Số lượng hạng mục tối đa ${QUOTE_MAX_ITEMS}.`); return; }
    setRows(prev => [...prev, newLabor()]);
    setFormError(null);
  };

  /** Tick = the whole earlier line goes into the quote with its own quantity; price and warranty are read by exact ID. */
  const toggleEarlier = (line: EarlierPartLine) => {
    if (!canEdit) return;
    const rowKey = `${EARLIER_KEY}${line.id}`;
    if (latest.current.rows.some(r => r.key === rowKey)) { removeRow(rowKey); return; }
    if (rows.length >= QUOTE_MAX_ITEMS) { setFormError(`Số lượng hạng mục tối đa ${QUOTE_MAX_ITEMS}.`); return; }
    const owner = ownerKey;
    setRows(prev => [...prev, { ...newPart(), key: rowKey, partCatalogId: line.catalogId, quantity: String(line.quantity), description: line.name, partNameSnapshot: line.name }]);
    setFormError(null);
    void (async () => {
      try {
        const part = await fetchStrictPartById(line.catalogId);
        // The functional update below is a no-op when the technician already unticked the line.
        if (!live(owner)) return;
        setRows(prev => prev.map(r => (r.key === rowKey
          ? { ...r, unitPrice: String(part.sellingPrice), description: part.name, partNameSnapshot: part.name, partSku: part.sku ?? '', warrantyPolicy: part.warrantyPolicy ?? '', warrantyTermDays: part.warrantyDays != null ? String(part.warrantyDays) : '' }
          : r)));
      } catch {
        if (!live(owner)) return;
        setRows(prev => prev.filter(r => r.key !== rowKey));
        setFormError('Không lấy được giá linh kiện từ FixHome. Hãy chọn lại.');
      }
    })();
  };

  const loadCatalog = (search?: string) => {
    if (!canEdit) return;
    const gen = ++loadGen.current;
    const owner = ownerKey;
    setCatalog({ status: 'loading', parts: [], error: null });
    void (async () => {
      try {
        const result = await fetchStrictCatalog({ limit: 50, ...(search?.trim() ? { search: search.trim() } : {}) });
        // Stale load (superseded request, owner/session switch, unmount) is ignored.
        if (!live(owner) || gen !== loadGen.current) return;
        setCatalog({ status: result.data.length ? 'ready' : 'empty', parts: result.data, error: null });
      } catch {
        // Failure is an explicit error with retry, never an empty placeholder catalogue.
        if (!live(owner) || gen !== loadGen.current) return;
        setCatalog({ status: 'error', parts: [], error: 'Không tải được danh mục. Hãy thử tải lại.' });
      }
    })();
  };

  /** Tick or untick a stock part; the picks outlive new searches. Price and name come from the by-ID read. */
  const togglePick = async (option: CostItemCatalogOption) => {
    if (!canEdit) return;
    setPickError(null);
    if (wanted.current.has(option.id)) {
      wanted.current.delete(option.id);
      setPicked(prev => prev.filter(r => r.partCatalogId !== option.id));
      return;
    }
    wanted.current.add(option.id);
    const owner = ownerKey;
    try {
      const part = await fetchStrictPartById(option.id);
      if (!live(owner) || !latest.current.canEdit || !wanted.current.has(option.id)) return;
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

  /** Moves every pick into the quote; a stock part already listed adds up its quantity. */
  const addPicked = () => {
    if (!canEdit || !picked.length) return;
    if (picked.some(r => !/^\d+$/.test(r.quantity.trim()) || Number(r.quantity) < 1 || Number(r.quantity) > PART_QUANTITY_MAX)) {
      setPickError(`Nhập số lượng từ 1 đến ${PART_QUANTITY_MAX} cho mọi linh kiện đã chọn.`);
      return;
    }
    const merged = [...rows];
    for (const item of picked) {
      const i = merged.findIndex(r => !r.key.startsWith(EARLIER_KEY) && isPart(r) && r.partCatalogId === item.partCatalogId);
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

  /** A closed sheet leaves nothing half-picked behind and reloads the full catalog next time. */
  const onSheetDismiss = () => {
    wanted.current.clear();
    setPicked([]);
    setPickError(null);
    setCatalog({ status: 'idle', parts: [], error: null });
  };

  const buildPayload = () => ({
    items: [...laborRows, ...rows.filter(isPart)].map(costItemRowToPayloadItem),
    ...(note.trim() ? { note: note.trim() } : {}),
  });

  const openReview = () => {
    if (!canEdit) return;
    if (rows.some(r => isPart(r) && !hasPrice(r))) {
      setFormError('Đang lấy giá linh kiện từ FixHome. Vui lòng chờ giây lát rồi xem lại báo giá.');
      return;
    }
    const errors = validateCostItemRows(rows);
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      setFormError('Kiểm tra lại các ô được đánh dấu.');
      return;
    }
    const payload = buildPayload();
    if (!controller.confirm(payload)) {
      setFormError(controller.getState().message ?? 'Dữ liệu báo giá chưa hợp lệ.');
      setReviewing(false);
      return;
    }
    try {
      const validated = validateQuotationPayload(payload);
      setEstimate(validated.items.reduce((total, item) => total + item.quantity * item.unitPrice, 0));
    } catch {
      setEstimate(null);
    }
    setFieldErrors({});
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

  const verifyMode = state.phase === 'unknown' || (state.phase === 'idle' && showRecovery);
  const showForm = canEdit || reviewing;

  return (
    <TaskScreenShell
      title="Tạo báo giá"
      stage={2}
      onBack={onBack}
      summary={showForm ? (
        <View testID="quote-total" style={styles.total}>
          <Text style={styles.totalLabel}>Tạm tính ({rows.length} hạng mục)</Text>
          <Text style={styles.totalValue}>{formatVnd(reviewing && estimate !== null ? estimate : liveTotal)}</Text>
        </View>
      ) : undefined}
      secondary={
        reviewing
          ? { label: 'Hủy', testID: 'quote-review-cancel', disabled: busy, onPress: cancelReview }
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
          ? { label: busy ? 'Đang xử lý…' : 'Gửi báo giá', testID: 'quote-send', disabled: busy, onPress: sendQuotation }
          : {
              label: busy ? 'Đang xử lý…' : verifyMode ? 'Kiểm tra lại' : state.phase === 'resolved' ? 'Tiếp tục' : 'Xem báo giá',
              testID: verifyMode ? 'quote-verify' : state.phase === 'resolved' ? 'quote-continue' : 'quote-review',
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
            style={styles.outlineBtn}
          >
            <Text style={styles.outlineText}>Tải lại báo giá</Text>
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
        <>
          <Section title="Tiền công" hint="Công kiểm tra, sửa chữa, lắp đặt. Bảo hành công do bạn khai báo.">
            {laborRows.map((row, index) => (
              <LaborCard key={row.key} row={row} index={index} errors={fieldErrors[row.key]} disabled={frozen}
                onChange={next => updateRow(row.key, next)} onRemove={() => removeRow(row.key)} />
            ))}
            <AddRow testID="quote-add-item" label="Thêm tiền công" disabled={frozen} onPress={addLabor} />
          </Section>

          <Section title="Linh kiện" hint="Chỉ dùng linh kiện của FixHome. Giá và bảo hành theo từng linh kiện, không chỉnh tay.">
            <GroupLabel title="Đã yêu cầu trước khi sửa" hint="Chọn để đưa nguyên dòng vào báo giá, đúng số lượng đã yêu cầu." />
            {partsStatus === 'ready' ? (
              earlierLines.length ? earlierLines.map(line => (
                <EarlierPartCard key={line.id} line={line} row={rows.find(r => r.key === `${EARLIER_KEY}${line.id}`)} disabled={frozen} onToggle={() => toggleEarlier(line)}
                  onQuantity={quantity => { const r = rows.find(x => x.key === `${EARLIER_KEY}${line.id}`); if (r) updateRow(r.key, { ...r, quantity }); }} />
              )) : <Text style={styles.empty}>Bạn chưa yêu cầu linh kiện nào trước khi sửa. Cần linh kiện thì thêm từ kho bên dưới.</Text>
            ) : partsStatus === 'error' ? (
              <View style={styles.emptyBox}>
                <ReadOnlyNotice tone="error">Không tải được danh sách linh kiện đã yêu cầu.</ReadOnlyNotice>
                <TouchableOpacity testID="quote-parts-retry" accessibilityRole="button" onPress={() => { void loadResource('parts'); }} style={styles.outlineBtn}>
                  <Text style={styles.outlineText}>Tải lại linh kiện</Text>
                </TouchableOpacity>
              </View>
            ) : <Text style={styles.empty}>Đang tải danh sách linh kiện đã yêu cầu…</Text>}

            <GroupLabel title="Cần thêm linh kiện" hint="Linh kiện chọn thêm từ kho sẽ tự tạo yêu cầu cấp sau khi khách hàng duyệt báo giá." />
            {freshRows.map(row => (
              <PartLineCard key={row.key} row={row} maxQuantity={PART_QUANTITY_MAX} disabled={frozen}
                onQuantity={quantity => updateRow(row.key, { ...row, quantity })} onRemove={() => removeRow(row.key)} />
            ))}
            <AddRow testID="quote-add-part" label="Chọn linh kiện từ kho FixHome" hint="Mở khung tìm và chọn linh kiện trong kho FixHome" disabled={frozen}
              onPress={() => sheetRef.current?.present()} />
          </Section>

          <View style={styles.noteWrap}>
            <Text accessibilityRole="header" style={styles.noteTitle}>Ghi chú</Text>
            <TextInput
              testID="quote-note"
              accessibilityLabel="Ghi chú báo giá"
              value={note}
              onChangeText={value => {
                if (frozen || reviewing) return;
                setNote(value);
                setReviewing(false);
              }}
              placeholder="Ghi chú cho khách hàng (tùy chọn)"
              placeholderTextColor={colors.muted}
              maxLength={5000}
              multiline
              style={styles.noteInput}
            />
          </View>
        </>
      )}

      {reviewing && (
        <View testID="quote-review-sheet" style={styles.review}>
          <Text accessibilityRole="header" style={styles.reviewTitle}>Xem lại báo giá</Text>
          {rows.map(row => (
            <View key={row.key} style={styles.reviewLine}>
              <Text style={styles.reviewName}>{isPart(row) ? row.partNameSnapshot || row.description : row.description}</Text>
              <Text style={styles.reviewMeta}>{row.quantity} × {formatVnd(Number(row.unitPrice))} = {formatVnd(costItemRowSubtotal(row) ?? 0)}</Text>
              {isPart(row) && <Text style={styles.reviewWarranty}>{Number(row.warrantyTermDays) > 0 ? `Bảo hành ${row.warrantyTermDays} ngày theo FixHome` : 'Bảo hành theo chính sách FixHome'}</Text>}
            </View>
          ))}
          <DetailRow label="Số hạng mục" value={rows.length} />
          <DetailRow label="Ước tính" value={estimate !== null ? formatVnd(estimate) : 'Chưa tính được'} />
          <Text style={styles.reviewHint}>
            Số ước tính để tham khảo; tổng theo máy chủ trên chi tiết đã gửi mới có hiệu lực. Dùng nút gửi ở thanh dưới cùng, ngoài vùng cuộn.
          </Text>
        </View>
      )}

      {(formError || (state.phase === 'denied' && state.message)) && (
        <Text testID="quote-form-error" accessibilityRole="alert" style={styles.formError}>
          {formError ?? state.message}
        </Text>
      )}
      {state.phase === 'unknown' && <ReadOnlyNotice>{state.message ?? 'Kết quả chưa xác định. Không gửi lại.'}</ReadOnlyNotice>}

      <Section title="Xem thêm">
        <LinkRow testID="task-detail-link" label="Chi tiết đơn" Icon={Info} onPress={() => navigation.navigate('OrderInformation')} />
      </Section>

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
            onLoadCatalog={search => loadCatalog(search)}
          />
        </BottomSheetModal>
      )}
    </TaskScreenShell>
  );
}

const styles = StyleSheet.create({
  total: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  totalLabel: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
  totalValue: { color: colors.text, fontSize: 18, lineHeight: 26, fontWeight: '700' },
  group: { gap: 2, marginTop: spacing.sm },
  subTitle: { color: colors.text, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  subHint: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  empty: { color: colors.textSecondary, fontSize: 14, lineHeight: 21, padding: spacing.md },
  emptyBox: { padding: spacing.md, gap: 8 },
  outlineBtn: { minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12 },
  outlineText: { color: colors.primaryStrong, fontSize: 15, fontWeight: '600' },
  noteWrap: { gap: 8 },
  noteTitle: { color: colors.text, fontSize: 16, lineHeight: 24, fontWeight: '700' },
  noteInput: { minHeight: 94, padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 14, textAlignVertical: 'top', color: colors.text, fontSize: 16, lineHeight: 24, backgroundColor: colors.surface },
  review: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 8 },
  reviewTitle: { color: colors.text, fontSize: 16, lineHeight: 24, fontWeight: '700' },
  reviewLine: { gap: 2, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  reviewName: { color: colors.text, fontSize: 15, lineHeight: 22, fontWeight: '600' },
  reviewMeta: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  reviewWarranty: { color: colors.tone.success.text, fontSize: 13, lineHeight: 19 },
  reviewHint: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  formError: { color: colors.error, fontSize: 14, lineHeight: 21 },
});
