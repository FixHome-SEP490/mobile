import React, { useMemo, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { isHistoricalOrder } from '../../../api/orders.api';
import { useOrderSession } from '../runtime/OrderSessionProvider';
import { useCustomerQuotationDecision } from '../customer/useCustomerQuotationDecision';
import { getRestoredQuotationRecovery } from '../domain/quotation-recovery';
import {
  APPROVE_NOT_PAYMENT_NOTE,
  calculateReviewPreview,
  getEligibleWarrantyOptions,
  REJECT_WHOLE_ORDER_WARNING,
  type DecisionAction,
} from '../customer/customer-quotation-controller';
import type { OrderQuotation } from '../domain/order-session.types';
import { ReadOnlyNotice, TaskScreenShell } from '../shared/TaskScreenShell';
import { DecisionSummary } from '../shared/DecisionSummary';
import { useLoadUnloadedResources } from '../shared/useLoadUnloadedResources';
import { lightTheme as colors } from '../../../constants/theme';

function latestSentQuote(quotations: OrderQuotation[] | undefined, serviceOrderId: string, technicianId: string): OrderQuotation | null {
  if (!quotations) return null;
  const sent = quotations.filter(
    q => q.serviceOrderId === serviceOrderId && q.technicianId === technicianId && String(q.status).toUpperCase() === 'SENT',
  );
  if (!sent.length) return null;
  return [...sent].sort((a, b) => (b.version ?? 0) - (a.version ?? 0))[0];
}

interface FrozenSheet {
  action: DecisionAction;
  owner: string | null;
  target: string | null;
  quoteId: string;
  quoteVersion?: number;
  technicianId?: string;
  selectedIds: string[];
}

/**
 * C05 — customer inspection-quotation decision. Server scope only: paid
 * warranty defaults OFF, preview is explicitly estimated (null stays
 * unavailable, never 0), and the confirm sheet freezes the exact
 * ID/version/action/selected IDs. Back, detail links and refresh never POST.
 */
export default function QuoteDecisionScreen() {
  const { key, snapshot, refresh, loadResource, journal } = useOrderSession();
  const navigation = useNavigation<any>();
  const { controller, state } = useCustomerQuotationDecision();
  const [sheet, setSheet] = useState<FrozenSheet | null>(null);

  useLoadUnloadedResources(snapshot, ['quotations'], loadResource);

  const orderValue = snapshot?.order.status === 'ready' ? snapshot.order.data : null;
  const order = orderValue && !isHistoricalOrder(orderValue) ? orderValue : null;
  const current = !!key && !!order && snapshot?.access === 'current' && order.id === key.serviceOrderId;
  const fixedPrice = String(order?.pricingMode ?? '').toUpperCase() === 'FIXED_PRICE';
  const inspection = String(order?.pricingMode ?? '').toUpperCase() === 'INSPECTION_REQUIRED';
  const quotationsReady = snapshot?.resources.quotations.status === 'ready';
  const quote = current && inspection && !fixedPrice && quotationsReady
    ? latestSentQuote(
        (snapshot?.resources.quotations.status === 'ready' ? snapshot.resources.quotations.data : undefined),
        key!.serviceOrderId,
        order!.technician?.id ?? '',
      )
    : null;

  const ownerKey = key ? `${key.userId}/${key.sessionGeneration}/${key.serviceOrderId}` : null;
  const targetKey = quote ? `${quote.id}/${quote.version}/${quote.technicianId}` : null;

  // Owner/target/assignment change invalidates the frozen sheet: the sheet
  // carries its frozen owner/target and renders only while both still match
  // (same key-guard pattern as the TR recovery confirm, no reset effect).
  const sheetValid = sheet !== null && sheet.owner === ownerKey && sheet.target === targetKey;

  const recovery = useMemo(
    () => (key && snapshot ? getRestoredQuotationRecovery(journal, key, snapshot) : { hasRecovery: false as const, isUnresolved: false as const }),
    [journal, key, snapshot],
  );
  const showRecovery = recovery.hasRecovery && recovery.operation === 'quote-decision';

  const eligible = useMemo(() => getEligibleWarrantyOptions(quote), [quote]);
  const preview = useMemo(() => calculateReviewPreview(quote, state.selectedWarrantyItemIds), [quote, state.selectedWarrantyItemIds]);

  // Persisted approval scope: derive accepted warranty IDs from the ACTUAL
  // resolved quotation (Backend clears unselected technician warranties to
  // no_warranty/null, so current eligible paid rows are persisted selections).
  // Local selection/draft is never proof — cold reload leaves decidedAction
  // undefined while resolvedQuotation still carries the true scope.
  const persistedIds = useMemo(
    () => (state.resolvedQuotation ? getEligibleWarrantyOptions(state.resolvedQuotation).map(option => option.itemId) : []),
    [state.resolvedQuotation],
  );
  const persistedPreview = useMemo(
    () => (state.resolvedQuotation ? calculateReviewPreview(state.resolvedQuotation, persistedIds) : null),
    [state.resolvedQuotation, persistedIds],
  );

  const busy = state.phase === 'submitting' || state.phase === 'verifying';
  const verifyAvailable = state.phase === 'unknown' || (state.phase === 'idle' && showRecovery);
  // Unknown/restored pending freezes all selection, edits and destructive
  // confirms; GET-only verify stays usable.
  const frozen = busy || state.phase === 'unknown' || showRecovery;
  const canDecide = current && !!quote && !frozen && state.phase !== 'resolved';
  const refreshing = snapshot?.order.status === 'loading' || snapshot?.resources.quotations.status === 'loading';

  const openSheet = (action: DecisionAction) => {
    if (!canDecide) return;
    if (!controller.confirm(action)) return;
    const draft = controller.getState().confirmDraft;
    if (!draft) return;
    setSheet({
      action: draft.action,
      owner: ownerKey,
      target: targetKey,
      quoteId: draft.target.quoteId,
      quoteVersion: draft.target.quoteVersion,
      technicianId: draft.target.technicianId,
      selectedIds: [...draft.selectedWarrantyItemIds],
    });
  };

  const submitSheet = () => {
    if (busy) return;
    const frozenDraft = sheet;
    setSheet(null);
    if (!frozenDraft) return;
    void controller.submit();
  };

  const cancelSheet = () => {
    controller.cancelConfirm();
    setSheet(null);
  };

  const onPrimary = () => {
    if (busy) return;
    if (verifyAvailable) {
      void controller.verify();
      return;
    }
    if (state.phase === 'resolved') {
      navigation.navigate('OrderTask');
      return;
    }
    openSheet('APPROVE');
  };

  const onBack = () => {
    // Back/hardware close cancels the confirmation with zero POST.
    if (sheetValid && sheet) {
      cancelSheet();
      return;
    }
    navigation.goBack();
  };

  // The confirmation sits above the footer buttons that confirm it, so the customer reads and answers in one place.
  const confirmSummary = sheetValid && sheet ? (
    <View testID="quote-confirm-sheet" style={{ gap: 4 }}>
      <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700' }}>
        {sheet.action === 'APPROVE' ? 'Xác nhận duyệt báo giá' : 'Xác nhận từ chối báo giá'}
      </Text>
      {sheet.action === 'APPROVE' ? (
        <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>
          Bảo hành có phí đã chọn: {sheet.selectedIds.length ? `${sheet.selectedIds.length} hạng mục` : 'không chọn'}. Duyệt báo giá chưa phải thanh toán.
        </Text>
      ) : (
        <Text accessibilityRole="alert" style={{ color: colors.error, fontSize: 13, lineHeight: 19 }}>
          {REJECT_WHOLE_ORDER_WARNING}
        </Text>
      )}
    </View>
  ) : undefined;

  if (!current || !order) {
    return (
      <TaskScreenShell title="Báo giá" onBack={() => navigation.goBack()}>
        <ReadOnlyNotice>
          {snapshot?.access === 'historical'
            ? 'Báo giá không được tải cho đơn lịch sử.'
            : 'Báo giá chỉ được đọc sau khi máy chủ xác minh quyền xem đơn hiện tại.'}
        </ReadOnlyNotice>
      </TaskScreenShell>
    );
  }

  if (fixedPrice) {
    return (
      <TaskScreenShell
        title="Báo giá"
        stage={2}
        onBack={() => navigation.goBack()}
        primary={{ label: 'Tiếp tục', testID: 'quote-bypass-continue', onPress: () => navigation.navigate('OrderTask') }}
      >
        <ReadOnlyNotice>Đơn giá cố định không cần báo giá khảo sát. Bạn có thể tiếp tục theo dõi đơn.</ReadOnlyNotice>
      </TaskScreenShell>
    );
  }

  return (
    <TaskScreenShell
      title="Báo giá"
      stage={2}
      onBack={onBack}
      summary={confirmSummary}
      secondary={
        sheetValid && sheet
          ? {
              label: 'Hủy',
              testID: 'quote-confirm-cancel',
              disabled: busy,
              onPress: cancelSheet,
            }
          : state.phase === 'resolved' || state.phase === 'unknown' || showRecovery
            ? {
                label: 'Làm mới dữ liệu',
                testID: 'task-refresh',
                disabled: busy || refreshing,
                onPress: () => {
                  if (!busy && !refreshing) void refresh('manual');
                },
              }
            : {
                label: 'Từ chối báo giá',
                testID: 'quote-reject',
                disabled: !canDecide,
                accessibilityHint: 'Mở xác nhận từ chối. Từ chối sẽ hủy toàn bộ đơn.',
                onPress: () => openSheet('REJECT'),
              }
      }
      primary={
        sheetValid && sheet
          ? {
              label: sheet.action === 'APPROVE' ? 'Xác nhận duyệt' : 'Xác nhận từ chối',
              testID: 'quote-confirm-submit',
              disabled: busy,
              accessibilityHint: sheet.action === 'APPROVE' ? 'Duyệt báo giá chưa phải thanh toán' : 'Từ chối sẽ hủy toàn bộ đơn',
              onPress: submitSheet,
            }
          : {
              label: busy
                ? 'Đang xử lý.'
                : verifyAvailable
                  ? 'Kiểm tra lại'
                  : state.phase === 'resolved'
                    ? 'Tiếp tục'
                    : 'Duyệt báo giá',
              testID: verifyAvailable ? 'quote-verify' : state.phase === 'resolved' ? 'quote-continue' : 'quote-approve',
              disabled: busy || (!canDecide && !verifyAvailable && state.phase !== 'resolved'),
              accessibilityHint: 'Duyệt báo giá chưa phải thanh toán',
              onPress: onPrimary,
            }
      }
    >
      {showRecovery && state.phase !== 'resolved' && (
        <ReadOnlyNotice>
          Có thao tác báo giá chưa rõ kết quả từ phiên trước. Hãy kiểm tra lại từ máy chủ, không gửi lại.
          <TouchableOpacity
            testID="quote-recovery-verify"
            accessibilityRole="button"
            disabled={busy}
            onPress={() => {
              if (!busy) void controller.verify();
            }}
            style={{ marginTop: 8, minHeight: 48, justifyContent: 'center' }}
          >
            <Text style={{ color: colors.primaryStrong, fontSize: 15, fontWeight: '700' }}>Kiểm tra lại từ máy chủ</Text>
          </TouchableOpacity>
        </ReadOnlyNotice>
      )}

      {!quotationsReady && <ReadOnlyNotice>Đang tải báo giá từ máy chủ.</ReadOnlyNotice>}
      {quotationsReady && !quote && state.phase !== 'resolved' && (
        <ReadOnlyNotice>Chưa có báo giá nào đang chờ duyệt cho đơn này.</ReadOnlyNotice>
      )}

      {quote && state.phase !== 'resolved' && (
        <DecisionSummary
          quotation={quote}
          eligible={eligible}
          selectedIds={state.selectedWarrantyItemIds}
          preview={preview}
          interactive={!frozen}
          onToggleItem={itemId => controller.toggleWarrantyItem(itemId)}
          approveNote={APPROVE_NOT_PAYMENT_NOTE}
        />
      )}

      {state.phase === 'resolved' && state.resolvedQuotation && (
        <View style={{ gap: 8 }}>
          <ReadOnlyNotice>Đã ghi nhận quyết định theo dữ liệu máy chủ dưới đây.</ReadOnlyNotice>
          <DecisionSummary
            quotation={state.resolvedQuotation}
            eligible={getEligibleWarrantyOptions(state.resolvedQuotation)}
            selectedIds={String(state.resolvedQuotation.status).toUpperCase() === 'APPROVED' ? persistedIds : []}
            preview={String(state.resolvedQuotation.status).toUpperCase() === 'APPROVED' ? persistedPreview : null}
            interactive={false}
          />
        </View>
      )}

      {state.phase === 'denied' && state.message && <ReadOnlyNotice>{state.message}</ReadOnlyNotice>}
      {state.phase === 'unknown' && <ReadOnlyNotice>{state.message ?? 'Kết quả chưa xác định. Không gửi lại.'}</ReadOnlyNotice>}

    </TaskScreenShell>
  );
}
