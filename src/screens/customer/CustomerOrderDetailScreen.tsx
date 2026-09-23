import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StatusBar,
  Image,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../types';
import { useAppTheme } from '../../constants/theme';
import { useAuthStore } from '../../store/auth.store';
import { ordersApi, type CanonicalOrderStatus } from '../../api/orders.api';
import { customerBookingsUserId } from './customer-bookings-history';
import {
  createOrderDetailLoader,
  initialOrderDetailState,
  quotationItemsList,
  resolveOrderDetailSections,
  writeDetailWithMirror,
} from './customer-order-detail';
import {
  createOrderEvidenceController,
  evidenceTypeLabel,
  initialEvidenceState,
} from './order-evidence';
import {
  createQuotationDecisionController,
  decisionMoneyText,
  eligibleWarrantyOptions,
  initialDecisionState,
  APPROVE_NOT_PAYMENT_NOTE,
  REJECT_WHOLE_ORDER_WARNING,
} from './customer-quotation-decision';
import {
  createOrderInvoiceController,
  initialInvoiceState,
  invoicePaymentLabel,
} from './order-invoice';
import {
  additionalCostStatusLabel,
  createAdditionalCostsController,
  initialAdditionalCostsState,
  type AdditionalCostView,
} from './order-additional-costs';
import {
  APPROVE_COST_NOT_PAYMENT_NOTE,
  createCostDecisionController,
  initialCostDecisionState,
  isCostDecisionBlocked,
  isLaborOnlyItems,
  REJECT_COST_ONLY_WARNING,
} from './customer-additional-cost-decision';

type DetailRoute = RouteProp<RootStackParamList, 'CustomerOrderDetail'>;

function amountOrNull(value: unknown): string | null {
  return typeof value === 'number' ? `${value.toLocaleString('vi-VN')}đ` : null;
}

export default function CustomerOrderDetailScreen() {
  const { colors, isDark } = useAppTheme();
  const styles = getStyles(colors);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<DetailRoute>();
  const serviceOrderId = route.params.serviceOrderId;
  const [detailState, setDetailState] = useState(initialOrderDetailState);
  const { order, loading, refreshing, error } = detailState;
  const [evidenceState, setEvidenceState] = useState(initialEvidenceState);
  const [decisionState, setDecisionState] = useState(initialDecisionState);
  const focusAliveRef = useRef(false);
  const [invoiceState, setInvoiceState] = useState(initialInvoiceState);
  const [costsState, setCostsState] = useState(initialAdditionalCostsState);
  const [costDecisionState, setCostDecisionState] = useState(initialCostDecisionState);
  const latestRef = useRef({ order, serviceOrderId });
  useEffect(() => {
    // Backstop only: every loader publish already mirrors synchronously via
    // writeDetailWithMirror below, so this writes identical values and can
    // never roll a verified ref back to a stale order.
    latestRef.current = { order, serviceOrderId };
  });
  const loaderRef = useRef<ReturnType<typeof createOrderDetailLoader> | null>(null);
  useEffect(() => {
    // P3B7 FAIL1 remediation: the loader write mirrors the fetched order into
    // latestRef in the SAME TICK via writeDetailWithMirror, before React
    // commits — a verified GET can never unlock against a stale pre-commit
    // SENT quotation. Effect-created so no ref is read during render.
    loaderRef.current = createOrderDetailLoader(
      ordersApi.getOrder,
      writeDetailWithMirror(latestRef, serviceOrderId, setDetailState),
      {
        getUserId: () => customerBookingsUserId(useAuthStore.getState()),
        subscribe: (listener) => useAuthStore.subscribe(listener),
      },
    );
    return () => {
      loaderRef.current?.blur();
      loaderRef.current = null;
    };
  }, [serviceOrderId]);
  const evidenceRef = useRef<ReturnType<typeof createOrderEvidenceController> | null>(null);
  if (evidenceRef.current === null) {
    evidenceRef.current = createOrderEvidenceController(ordersApi.getEvidence, setEvidenceState);
  }
  const invoiceRef = useRef<ReturnType<typeof createOrderInvoiceController> | null>(null);
  if (invoiceRef.current === null) {
    invoiceRef.current = createOrderInvoiceController(ordersApi.getInvoice, setInvoiceState);
  }
  const costsRef = useRef<ReturnType<typeof createAdditionalCostsController> | null>(null);
  if (costsRef.current === null) {
    costsRef.current = createAdditionalCostsController(ordersApi.getAdditionalCosts, setCostsState);
  }
  // P3B13 cost decision reads the latest sanitized costs without touching
  // refs during render (synced in an effect below).
  const costsViewRef = useRef<AdditionalCostView[]>([]);
  useEffect(() => {
    costsViewRef.current = costsState.requests;
  }, [costsState.requests]);
  // P3B13 customer cost APPROVE/REJECT: created in an effect so no ref is
  // read during render. Reuses the existing decision POST clients; every
  // gate lives in the production controller.
  const costDecisionRef = useRef<ReturnType<typeof createCostDecisionController> | null>(null);
  useEffect(() => {
    const detailLoader = loaderRef.current;
    if (!detailLoader) return;
    costDecisionRef.current = createCostDecisionController(
      {
        getContext: (costId) => {
          const latest = latestRef.current;
          if (!latest.order || latest.order.id !== latest.serviceOrderId) return null;
          const cost = costsViewRef.current.find((request) => request.id === costId);
          if (!cost) return null;
          return {
            orderId: latest.order.id,
            orderStatus: latest.order.status,
            completionRequestedAt: latest.order.completionRequestedAt,
            costId: cost.id,
            costStatus: cost.status,
            costExpiresAt: cost.expiresAt,
            costItems: cost.items,
          };
        },
        getCustomerId: () => customerBookingsUserId(useAuthStore.getState()),
        isFocused: () => focusAliveRef.current,
        approveCost: (costId) => ordersApi.decideAdditionalCost(costId, 'APPROVE', []),
        rejectCost: (costId) => ordersApi.decideAdditionalCost(costId, 'REJECT'),
        refreshCosts: async () => {
          const latest = latestRef.current;
          if (latest.order && latest.order.id === latest.serviceOrderId) {
            const target = latest.order.id;
            await costsRef.current?.refreshCosts(() => isEvidenceReadable(target));
          }
          await loaderRef.current?.refresh(true);
          const refreshed = latestRef.current;
          if (refreshed.order && refreshed.order.id === refreshed.serviceOrderId) {
            const target = refreshed.order.id;
            await invoiceRef.current?.refreshInvoice(() => isEvidenceReadable(target));
          }
        },
        onAccessDenied: () => { void loaderRef.current?.refresh(true); },
        notify: (title, message) => Alert.alert(title, message),
      },
      setCostDecisionState,
    );
    return () => {
      costDecisionRef.current = null;
    };
  }, []);
  // P3B7 customer quotation decision: created in an effect so no ref is read
  // during render. Reuses the existing decision POST clients; every gate
  // lives in the production controller.
  const decisionRef = useRef<ReturnType<typeof createQuotationDecisionController> | null>(null);
  useEffect(() => {
    const detailLoader = loaderRef.current;
    if (!detailLoader) return;
    decisionRef.current = createQuotationDecisionController(
      {
        getContext: () => {
          const latest = latestRef.current;
          if (!latest.order || latest.order.id !== latest.serviceOrderId) return null;
          return {
            orderId: latest.order.id,
            orderStatus: latest.order.status,
            quoteId: latest.order.quotation ? latest.order.quotation.id : null,
            quoteStatus: latest.order.quotation ? latest.order.quotation.status : null,
            items: latest.order.quotation ? latest.order.quotation.items : null,
          };
        },
        getCustomerId: () => customerBookingsUserId(useAuthStore.getState()),
        isFocused: () => focusAliveRef.current,
        approveQuotation: (quoteId, paidWarrantyItemIds) =>
          ordersApi.approveQuotation(quoteId, paidWarrantyItemIds),
        rejectQuotation: (quoteId) => ordersApi.rejectQuotation(quoteId),
        refreshDetail: async () => {
          await loaderRef.current?.refresh(true);
        },
        onAccessDenied: () => { void loaderRef.current?.refresh(true); },
        notify: (title, message) => Alert.alert(title, message),
      },
      setDecisionState,
    );
    return () => {
      decisionRef.current = null;
    };
  }, []);
  useFocusEffect(useCallback(() => {
    focusAliveRef.current = true;
    void loaderRef.current?.focus(serviceOrderId);
    return () => {
      focusAliveRef.current = false;
      loaderRef.current?.blur();
      evidenceRef.current?.blurEvidence();
      invoiceRef.current?.blurInvoice();
      costsRef.current?.blurCosts();
      costDecisionRef.current?.reset();
      decisionRef.current?.reset();
    };
  }, [serviceOrderId]));
  const isEvidenceReadable = (target: string) => {
    const latest = latestRef.current;
    return !!latest.order && latest.order.id === target && latest.order.id === latest.serviceOrderId;
  };
  // READ-ONLY evidence follows the authorized detail: one GET per successful
  // focus, immediate purge on denial/blur/account switch. Refocus reissues GET
  // to rotate the short-lived signed URLs; signed URLs never leave this screen.
  useEffect(() => {
    const evidence = evidenceRef.current;
    if (!evidence) return;
    if (order && order.id === serviceOrderId) {
      const target = order.id;
      void evidence.focusEvidence(target, () => isEvidenceReadable(target));
    } else {
      evidence.blurEvidence();
    }
  }, [order, serviceOrderId]);

  // S2 READ-ONLY invoice follows the same authorized detail gate in its own
  // effect: one GET per successful focus, purge on denial/blur/account
  // switch/historical suppression. Null invoice renders truthful absent copy;
  // no payment action, no commission, no money writes live here.
  useEffect(() => {
    const invoice = invoiceRef.current;
    if (!invoice) return;
    if (order && order.id === serviceOrderId) {
      const target = order.id;
      void invoice.focusInvoice(target, () => isEvidenceReadable(target));
    } else {
      invoice.blurInvoice();
    }
  }, [order, serviceOrderId]);

  // P3B11 GET-only additional costs follow the same authorized detail gate:
  // one GET per successful focus, purge on denial/blur/account switch. No
  // decision, create, or payment action lives here.
  useEffect(() => {
    const costs = costsRef.current;
    if (!costs) return;
    if (order && order.id === serviceOrderId) {
      const target = order.id;
      void costs.focusCosts(target, () => isEvidenceReadable(target));
    } else {
      costs.blurCosts();
    }
  }, [order, serviceOrderId]);

  // P3B13: the cost decision confirmation belongs to one focused order.
  useEffect(() => {
    if (!order || order.id !== serviceOrderId) costDecisionRef.current?.reset();
  }, [order, serviceOrderId]);

  // P3B7: the decision selection belongs to one focused customer order.
  useEffect(() => {
    if (!order || order.id !== serviceOrderId) decisionRef.current?.reset();
  }, [order, serviceOrderId]);

  const onRefresh = () => {
    void (async () => {
      // P3B7 remediation: single forced detail GET with a verified freshness
      // receipt (replaces the old blind refresh). The ambiguous-quote lock
      // releases ONLY on a fresh successful authorized GET below.
      const detailFresh = await loaderRef.current?.refreshVerified();
      const latest = latestRef.current;
      if (latest.order && latest.order.id === latest.serviceOrderId) {
        const target = latest.order.id;
        await evidenceRef.current?.refreshEvidence(() => isEvidenceReadable(target));
        await invoiceRef.current?.refreshInvoice(() => isEvidenceReadable(target));
        const costsFresh = await costsRef.current?.refreshCosts(() => isEvidenceReadable(target));
        // P3B13 remediation: release the ambiguous-decision lock ONLY after a
        // fresh authorized costs GET succeeded for the still-current order,
        // customer, and focus. Failed/stale/denied GETs keep the lock.
        const releast = latestRef.current;
        const verifiedUnlock =
          costsFresh === true &&
          focusAliveRef.current &&
          !!customerBookingsUserId(useAuthStore.getState()) &&
          !!releast.order &&
          releast.order.id === target &&
          releast.order.id === releast.serviceOrderId;
        if (verifiedUnlock) costDecisionRef.current?.markReverified();
        // P3B7 remediation: same verified-GET rule for the quote lock. A
        // failed detail GET keeps last-good (possibly stale SENT) state, so
        // unlocking on it could permit a duplicate or opposite decision POST
        // against an unknown server outcome.
        const quoteUnlock =
          detailFresh === true &&
          focusAliveRef.current &&
          !!customerBookingsUserId(useAuthStore.getState()) &&
          !!releast.order &&
          releast.order.id === target &&
          releast.order.id === releast.serviceOrderId;
        if (quoteUnlock) decisionRef.current?.markReverified();
      } else {
        evidenceRef.current?.blurEvidence();
        invoiceRef.current?.blurInvoice();
        costsRef.current?.blurCosts();
      }
    })();
  };
  const onRetryEvidence = () => {
    const latest = latestRef.current;
    if (!latest.order || latest.order.id !== latest.serviceOrderId) return;
    const target = latest.order.id;
    void evidenceRef.current?.refreshEvidence(() => isEvidenceReadable(target));
  };
  const onRetryInvoice = () => {
    const latest = latestRef.current;
    if (!latest.order || latest.order.id !== latest.serviceOrderId) return;
    const target = latest.order.id;
    void invoiceRef.current?.refreshInvoice(() => isEvidenceReadable(target));
  };
  const onRetryCosts = () => {
    const latest = latestRef.current;
    if (!latest.order || latest.order.id !== latest.serviceOrderId) return;
    const target = latest.order.id;
    void costsRef.current?.refreshCosts(() => isEvidenceReadable(target));
  };
  // P3B13 per-request decision visibility mirrors the controller gate:
  // UNDER_REPAIR open order, PENDING cost, every line genuine LABOR, and a
  // verifiable future server expiry (fail closed otherwise).
  const canDecideCost = (request: AdditionalCostView) =>
    !!order &&
    order.id === serviceOrderId &&
    String(order.status).toUpperCase() === 'UNDER_REPAIR' &&
    !order.completionRequestedAt &&
    request.status === 'PENDING_APPROVAL' &&
    !isCostDecisionBlocked(request.expiresAt) &&
    isLaborOnlyItems(request.items);
  const onCostDecideApprove = (costId: string) => { costDecisionRef.current?.requestConfirm(costId, 'approve'); };
  const onCostDecideReject = (costId: string) => { costDecisionRef.current?.requestConfirm(costId, 'reject'); };
  const onCostDecideCancel = () => { costDecisionRef.current?.cancelConfirm(); };
  const onCostDecideSubmit = () => { void costDecisionRef.current?.submit(); };
  const onToggleWarranty = (itemId: string) => { decisionRef.current?.toggleWarranty(itemId); };
  const onDecideApprove = () => { decisionRef.current?.requestConfirm('approve'); };
  const onDecideReject = () => { decisionRef.current?.requestConfirm('reject'); };
  const onDecideCancel = () => { decisionRef.current?.cancelConfirm(); };
  const onDecideSubmit = () => { void decisionRef.current?.submit(); };
  const sections = resolveOrderDetailSections(order);
  // P3B7 decision visibility mirrors the controller gate: active customer
  // order in EN_ROUTE with the latest quotation SENT.
  const canDecideQuote = !!order &&
    order.id === serviceOrderId &&
    String(order.status).toUpperCase() === 'EN_ROUTE' &&
    sections.quoteAwaitingDecision;
  const warrantyOptions = order?.quotation ? eligibleWarrantyOptions(order.quotation.items) : [];
  const selectedWarrantyFee = warrantyOptions
    .filter((option) => decisionState.selectedIds.includes(option.itemId))
    .reduce((sum, option) => sum + option.fee, 0);
  const quotedSubtotal = order?.quotation && Array.isArray(order.quotation.items)
    ? order.quotation.items.reduce(
      (sum, item) => (typeof item.lineTotal === 'number' && Number.isFinite(item.lineTotal) && item.lineTotal >= 0
        ? sum + item.lineTotal
        : sum),
      0,
    )
    : null;

  const getStatusBadge = (status: CanonicalOrderStatus) => {
    const s = String(status).toUpperCase();
    switch (s) {
      case 'ACCEPTED':
        return { label: 'Đã nhận đơn', bg: '#E0E7FF', color: '#4F46E5' };
      case 'EN_ROUTE':
        return { label: 'Đang di chuyển', bg: '#FEF3C7', color: '#D97706' };
      case 'UNDER_REPAIR':
      case 'IN_PROGRESS':
        return { label: 'Đang sửa chữa', bg: '#DBEAFE', color: colors.primary };
      case 'COMPLETED':
        return { label: 'Hoàn thành', bg: '#DCFCE7', color: '#16A34A' };
      case 'CANCELLED':
        return { label: 'Đã hủy', bg: '#FEE2E2', color: '#DC2626' };
      default:
        return { label: s, bg: '#F1F5F9', color: '#64748B' };
    }
  };

  const quoteStatusLabel = (status: string | null) => {
    switch (status) {
      case 'SENT':
        return 'Đã gửi (chờ quyết định)';
      case 'APPROVED':
        return 'Đã duyệt';
      case 'REJECTED':
        return 'Đã từ chối';
      default:
        return status ?? 'Không rõ';
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Quay lại">
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Chi tiết đơn</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Đang tải chi tiết đơn...</Text>
        </View>
      ) : !order ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="receipt-outline" size={56} color="#CBD5E1" />
          <Text style={styles.emptyTitle}>Không xem được đơn</Text>
          {!!error && <Text style={styles.emptyDesc}>{error}</Text>}
          <TouchableOpacity onPress={onRefresh} disabled={refreshing} accessibilityRole="button" style={styles.retryBtn}>
            <Text style={styles.retryText}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {!!error && (
            <View style={styles.errorBanner} accessibilityRole="alert">
              <Text style={styles.emptyDesc}>{error}</Text>
              <TouchableOpacity onPress={onRefresh} disabled={refreshing} accessibilityRole="button">
                <Text style={styles.retryText}>Thử lại</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.card}>
            <View style={[styles.badge, { backgroundColor: getStatusBadge(order.status).bg }]}>
              <Text style={[styles.badgeText, { color: getStatusBadge(order.status).color }]}>
                {getStatusBadge(order.status).label}
              </Text>
            </View>
            <Text style={styles.title}>Đơn #{order.code || order.id.slice(0, 8)}</Text>
            <Text style={styles.meta}>{order.serviceName || 'Dịch vụ sửa chữa'}</Text>
            {!!order.scheduledAt && (
              <Text style={styles.meta}>
                Lịch hẹn: {new Date(order.scheduledAt).toLocaleString('vi-VN')}
              </Text>
            )}
            {!!order.addressSummary && (
              <Text style={styles.meta}>📍 {order.addressSummary}</Text>
            )}
            {sections.quantity !== null && (
              <Text style={styles.meta}>Số lượng: {sections.quantity}</Text>
            )}
            {!!order.scopeDescription && (
              <Text style={styles.meta}>Phạm vi: {order.scopeDescription}</Text>
            )}
            {!!order.bookingDescription && (
              <Text style={styles.meta}>Mô tả yêu cầu: {order.bookingDescription}</Text>
            )}
          </View>

          {sections.hasTechnician && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Kỹ thuật viên</Text>
              <Text style={styles.title}>{sections.technicianName}</Text>
              {!!sections.technicianPhone && (
                <Text style={styles.meta}>SĐT: {sections.technicianPhone}</Text>
              )}
            </View>
          )}

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Chi phí</Text>
            {sections.laborText !== null && (
              <View style={styles.row}>
                <Text style={styles.meta}>Nhân công</Text>
                <Text style={styles.meta}>{sections.laborText}</Text>
              </View>
            )}
            {sections.partsText !== null && (
              <View style={styles.row}>
                <Text style={styles.meta}>Vật tư</Text>
                <Text style={styles.meta}>{sections.partsText}</Text>
              </View>
            )}
            {sections.fixedUnitPriceText !== null && (
              <View style={styles.row}>
                <Text style={styles.meta}>Đơn giá cố định</Text>
                <Text style={styles.meta}>{sections.fixedUnitPriceText}</Text>
              </View>
            )}
            {sections.totalText !== null ? (
              <View style={styles.row}>
                <Text style={styles.totalLabel}>Tổng cộng</Text>
                <Text style={styles.totalValue}>{sections.totalText}</Text>
              </View>
            ) : (
              <Text style={styles.meta}>Chưa có thông tin giá</Text>
            )}
          </View>

          {sections.hasQuotation && order.quotation && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Báo giá</Text>
              <Text style={styles.meta}>Trạng thái: {quoteStatusLabel(sections.quotationStatus)}</Text>
              {quotationItemsList(order).length === 0 ? (
                <Text style={styles.meta}>Chưa có chi tiết báo giá</Text>
              ) : (
                quotationItemsList(order).map((item) => (
                  <View key={item.id ?? `${item.description}-${item.quantity}-${item.unitPrice}`} style={styles.row}>
                    <Text style={styles.meta}>{item.description} × {item.quantity}</Text>
                    <Text style={styles.meta}>{amountOrNull(item.lineTotal) ?? '—'}</Text>
                  </View>
                ))
              )}
              {sections.quoteAwaitingDecision && !canDecideQuote && !decisionState.decided && (
                <Text style={styles.meta}>
                  Báo giá đang chờ quyết định nhưng đơn không còn ở trạng thái di chuyển.
                </Text>
              )}
              {!!decisionState.decided && !sections.quoteAwaitingDecision && (
                <Text style={styles.meta}>
                  {decisionState.decided === 'APPROVED'
                    ? 'Đã duyệt báo giá. Đây chưa phải thanh toán.'
                    : 'Đã từ chối báo giá. Đơn dịch vụ đã bị hủy.'}
                </Text>
              )}
              {canDecideQuote && (
                <>
                  {warrantyOptions.length === 0 ? (
                    <Text style={styles.meta}>Không có gói bảo hành tính phí.</Text>
                  ) : (
                    warrantyOptions.map((option) => {
                      const checked = decisionState.selectedIds.includes(option.itemId);
                      return (
                        <TouchableOpacity
                          key={option.itemId}
                          style={styles.row}
                          onPress={() => onToggleWarranty(option.itemId)}
                          disabled={decisionState.busy || decisionState.needsVerify}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked }}
                          accessibilityLabel={`Bảo hành tính phí ${option.description}`}
                        >
                          <Ionicons
                            name={checked ? 'checkbox' : 'checkbox-outline'}
                            size={20}
                            color={checked ? colors.primary : '#94A3B8'}
                          />
                          <Text style={[styles.meta, { flex: 1 }]}>
                            {option.description} — phí {option.feeText}, {option.termDays} ngày
                          </Text>
                        </TouchableOpacity>
                      );
                    })
                  )}
                  {quotedSubtotal !== null && (
                    <View style={styles.row}>
                      <Text style={styles.meta}>Tạm tính báo giá</Text>
                      <Text style={styles.meta}>{decisionMoneyText(quotedSubtotal)}</Text>
                    </View>
                  )}
                  <View style={styles.row}>
                    <Text style={styles.meta}>Phí bảo hành đã chọn</Text>
                    <Text style={styles.meta}>{decisionMoneyText(selectedWarrantyFee)}</Text>
                  </View>
                  {decisionState.confirming ? (
                    <View style={styles.evidenceError}>
                      {decisionState.confirming === 'approve' ? (
                        <Text style={styles.meta}>
                          Duyệt báo giá{selectedWarrantyFee > 0 ? ` với phí bảo hành ${decisionMoneyText(selectedWarrantyFee)}` : ''}. {APPROVE_NOT_PAYMENT_NOTE}
                        </Text>
                      ) : (
                        <Text style={styles.meta}>{REJECT_WHOLE_ORDER_WARNING}.</Text>
                      )}
                      <View style={styles.decisionBtnRow}>
                        <TouchableOpacity
                          style={[styles.decisionBtn, { backgroundColor: decisionState.confirming === 'approve' ? '#059669' : '#DC2626' }]}
                          onPress={onDecideSubmit}
                          disabled={decisionState.busy}
                          accessibilityRole="button"
                          accessibilityLabel={decisionState.confirming === 'approve' ? 'Xác nhận duyệt báo giá' : 'Xác nhận từ chối báo giá'}
                        >
                          {decisionState.busy ? (
                            <ActivityIndicator size="small" color="#FFF" />
                          ) : (
                            <Text style={styles.decisionBtnText}>
                              {decisionState.confirming === 'approve' ? 'Xác nhận duyệt' : 'Xác nhận từ chối'}
                            </Text>
                          )}
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.decisionBtn, { backgroundColor: '#F1F5F9' }]}
                          onPress={onDecideCancel}
                          disabled={decisionState.busy}
                          accessibilityRole="button"
                          accessibilityLabel="Quay lại sửa quyết định"
                        >
                          <Text style={[styles.decisionBtnText, { color: '#334155' }]}>Quay lại</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.decisionBtnRow}>
                      <TouchableOpacity
                        style={[styles.decisionBtn, { backgroundColor: '#059669' }]}
                        onPress={onDecideApprove}
                        disabled={decisionState.busy || decisionState.needsVerify}
                        accessibilityRole="button"
                        accessibilityLabel="Duyệt báo giá"
                      >
                        <Text style={styles.decisionBtnText}>Duyệt báo giá</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.decisionBtn, { backgroundColor: '#DC2626' }]}
                        onPress={onDecideReject}
                        disabled={decisionState.busy || decisionState.needsVerify}
                        accessibilityRole="button"
                        accessibilityLabel="Từ chối báo giá"
                      >
                        <Text style={styles.decisionBtnText}>Từ chối</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  {!!decisionState.error && (
                    <View style={styles.evidenceError}>
                      <Text style={styles.meta}>{decisionState.error}</Text>
                    </View>
                  )}
                </>
              )}
            </View>
          )}

          {sections.hasTimeline && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Tiến độ</Text>
              {order.timeline!.map((entry, index) => (
                <View key={`${entry.status}-${entry.timestamp}-${index}`} style={styles.row}>
                  <Text style={styles.meta}>{entry.title || entry.status}</Text>
                  <Text style={styles.meta}>{new Date(entry.timestamp).toLocaleString('vi-VN')}</Text>
                </View>
              ))}
            </View>
          )}

          {(sections.beforeCount !== null || sections.afterCount !== null) && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Bằng chứng ảnh</Text>
              {sections.beforeCount !== null && (
                <Text style={styles.meta}>Ảnh trước sửa chữa: {sections.beforeCount}</Text>
              )}
              {sections.afterCount !== null && (
                <Text style={styles.meta}>Ảnh sau sửa chữa: {sections.afterCount}</Text>
              )}
            </View>
          )}

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Ảnh thực tế</Text>
            {evidenceState.loading && evidenceState.photos.length === 0 && !evidenceState.error ? (
              <Text style={styles.meta}>Đang tải ảnh bằng chứng...</Text>
            ) : evidenceState.photos.length === 0 && !evidenceState.error ? (
              <Text style={styles.meta}>Chưa có ảnh bằng chứng cho đơn này.</Text>
            ) : (
              evidenceState.photos.map((photo) => (
                <View key={photo.id} style={styles.evidenceItem}>
                  {evidenceState.failed[photo.id] ? (
                    <View style={styles.evidencePlaceholder}>
                      <Text style={styles.meta}>Không tải được ảnh. Nhấn “Tải lại ảnh” để lấy đường dẫn mới.</Text>
                    </View>
                  ) : (
                    <Image
                      source={{ uri: photo.uri }}
                      style={styles.evidenceThumb}
                      accessibilityLabel={`Ảnh ${evidenceTypeLabel(photo.type)}`}
                      onError={() => evidenceRef.current?.markImageFailed(photo.id)}
                    />
                  )}
                  <Text style={styles.meta}>{evidenceTypeLabel(photo.type)}</Text>
                  {!!photo.note && <Text style={styles.meta}>{photo.note}</Text>}
                </View>
              ))
            )}
            {!!evidenceState.error && (
              <View style={styles.evidenceError}>
                <Text style={styles.meta}>{evidenceState.error}</Text>
                <TouchableOpacity onPress={onRetryEvidence} disabled={!evidenceState.canRetry} accessibilityRole="button">
                  <Text style={evidenceState.canRetry ? styles.retryText : styles.meta}>Tải lại ảnh</Text>
                </TouchableOpacity>
              </View>
            )}
            {!evidenceState.error && Object.keys(evidenceState.failed).length > 0 && (
              <TouchableOpacity onPress={onRetryEvidence} accessibilityRole="button">
                <Text style={styles.retryText}>Tải lại ảnh</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Hóa đơn</Text>
            {invoiceState.loading && !invoiceState.invoice && !invoiceState.error ? (
              <Text style={styles.meta}>Đang tải hóa đơn...</Text>
            ) : invoiceState.invoice ? (
              <>
                <View style={styles.row}>
                  <Text style={styles.meta}>Trạng thái thanh toán</Text>
                  <Text style={styles.meta}>{invoicePaymentLabel(invoiceState.invoice.paymentStatus)}</Text>
                </View>
                {invoiceState.invoice.laborText !== null && (
                  <View style={styles.row}>
                    <Text style={styles.meta}>Nhân công</Text>
                    <Text style={styles.meta}>{invoiceState.invoice.laborText}</Text>
                  </View>
                )}
                {invoiceState.invoice.partsText !== null && (
                  <View style={styles.row}>
                    <Text style={styles.meta}>Vật tư</Text>
                    <Text style={styles.meta}>{invoiceState.invoice.partsText}</Text>
                  </View>
                )}
                {invoiceState.invoice.totalText !== null ? (
                  <View style={styles.row}>
                    <Text style={styles.totalLabel}>Tổng cộng</Text>
                    <Text style={styles.totalValue}>{invoiceState.invoice.totalText}</Text>
                  </View>
                ) : (
                  <Text style={styles.meta}>Chưa rõ tổng tiền.</Text>
                )}
                {!!invoiceState.invoice.issuedText && (
                  <Text style={styles.meta}>Phát hành: {invoiceState.invoice.issuedText}</Text>
                )}
                {!!invoiceState.invoice.paidText && (
                  <Text style={styles.meta}>Đã thanh toán: {invoiceState.invoice.paidText}</Text>
                )}
                {invoiceState.invoice.items.map((item) => (
                  <View key={item.id} style={styles.row}>
                    <Text style={styles.meta}>{item.description} × {item.quantity}</Text>
                    <Text style={styles.meta}>{item.lineTotalText ?? '—'}</Text>
                  </View>
                ))}
              </>
            ) : !invoiceState.error ? (
              <Text style={styles.meta}>Chưa có hóa đơn.</Text>
            ) : null}
            {!!invoiceState.error && (
              <View style={styles.evidenceError}>
                <Text style={styles.meta}>{invoiceState.error}</Text>
                <TouchableOpacity onPress={onRetryInvoice} disabled={!invoiceState.canRetry} accessibilityRole="button">
                  <Text style={invoiceState.canRetry ? styles.retryText : styles.meta}>Tải lại hóa đơn</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Chi phí phát sinh</Text>
            {costsState.loading && costsState.requests.length === 0 && !costsState.error ? (
              <Text style={styles.meta}>Đang tải chi phí phát sinh...</Text>
            ) : costsState.requests.length === 0 && !costsState.error ? (
              <Text style={styles.meta}>Chưa có yêu cầu chi phí phát sinh.</Text>
            ) : (
              costsState.requests.map((request) => (
                <View key={request.id} style={styles.evidenceItem}>
                  <Text style={styles.meta}>{request.reason}</Text>
                  <Text style={styles.meta}>Trạng thái: {additionalCostStatusLabel(request.status)}</Text>
                  {request.laborText !== null && (
                    <View style={styles.row}>
                      <Text style={styles.meta}>Nhân công đề xuất</Text>
                      <Text style={styles.meta}>{request.laborText}</Text>
                    </View>
                  )}
                  {request.partsText !== null && (
                    <View style={styles.row}>
                      <Text style={styles.meta}>Vật tư đề xuất</Text>
                      <Text style={styles.meta}>{request.partsText}</Text>
                    </View>
                  )}
                  {!!request.expiresText && (
                    <Text style={styles.meta}>Hạn phản hồi: {request.expiresText}</Text>
                  )}
                  {request.items.map((item) => (
                    <View key={item.id} style={styles.row}>
                      <Text style={styles.meta}>{item.description} × {item.quantity}</Text>
                      <Text style={styles.meta}>{item.lineTotalText ?? '—'}</Text>
                    </View>
                  ))}
                  {canDecideCost(request) ? (
                    costDecisionState.confirming?.costId === request.id ? (
                      <View style={styles.evidenceError}>
                        {costDecisionState.confirming.kind === 'approve' ? (
                          <Text style={styles.meta}>
                            Duyệt yêu cầu này sẽ cộng chi phí đề xuất vào tổng đơn. {APPROVE_COST_NOT_PAYMENT_NOTE}
                          </Text>
                        ) : (
                          <Text style={styles.meta}>{REJECT_COST_ONLY_WARNING}</Text>
                        )}
                        <View style={styles.decisionBtnRow}>
                          <TouchableOpacity
                            style={[styles.decisionBtn, { backgroundColor: costDecisionState.confirming.kind === 'approve' ? '#059669' : '#DC2626' }]}
                            onPress={onCostDecideSubmit}
                            disabled={costDecisionState.busy}
                            accessibilityRole="button"
                            accessibilityLabel={costDecisionState.confirming.kind === 'approve' ? 'Xác nhận duyệt chi phí' : 'Xác nhận từ chối chi phí'}
                          >
                            {costDecisionState.busy ? (
                              <ActivityIndicator size="small" color="#FFF" />
                            ) : (
                              <Text style={styles.decisionBtnText}>
                                {costDecisionState.confirming.kind === 'approve' ? 'Xác nhận duyệt' : 'Xác nhận từ chối'}
                              </Text>
                            )}
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.decisionBtn, { backgroundColor: '#F1F5F9' }]}
                            onPress={onCostDecideCancel}
                            disabled={costDecisionState.busy}
                            accessibilityRole="button"
                            accessibilityLabel="Quay lại sửa quyết định chi phí"
                          >
                            <Text style={[styles.decisionBtnText, { color: '#334155' }]}>Quay lại</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ) : (
                      <View style={styles.decisionBtnRow}>
                        <TouchableOpacity
                          style={[styles.decisionBtn, { backgroundColor: '#059669' }]}
                          onPress={() => onCostDecideApprove(request.id)}
                          disabled={costDecisionState.busy || costDecisionState.needsVerify}
                          accessibilityRole="button"
                          accessibilityLabel="Duyệt chi phí phát sinh"
                        >
                          <Text style={styles.decisionBtnText}>Duyệt</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.decisionBtn, { backgroundColor: '#DC2626' }]}
                          onPress={() => onCostDecideReject(request.id)}
                          disabled={costDecisionState.busy || costDecisionState.needsVerify}
                          accessibilityRole="button"
                          accessibilityLabel="Từ chối chi phí phát sinh"
                        >
                          <Text style={styles.decisionBtnText}>Từ chối</Text>
                        </TouchableOpacity>
                      </View>
                    )
                  ) : request.status === 'PENDING_APPROVAL' ? (
                    <Text style={styles.meta}>Yêu cầu này chưa đủ điều kiện quyết định.</Text>
                  ) : costDecisionState.decided?.costId === request.id ? (
                    <Text style={styles.meta}>
                      {costDecisionState.decided.action === 'APPROVED'
                        ? 'Đã duyệt chi phí. Đây chưa phải thanh toán.'
                        : 'Đã từ chối chi phí. Đơn dịch vụ vẫn tiếp tục sửa chữa.'}
                    </Text>
                  ) : null}
                </View>
              ))
            )}
            {!!costDecisionState.error && (
              <View style={styles.evidenceError}>
                <Text style={styles.meta}>{costDecisionState.error}</Text>
              </View>
            )}
            {!!costsState.error && (
              <View style={styles.evidenceError}>
                <Text style={styles.meta}>{costsState.error}</Text>
                <TouchableOpacity onPress={onRetryCosts} disabled={!costsState.canRetry} accessibilityRole="button">
                  <Text style={costsState.canRetry ? styles.retryText : styles.meta}>Tải lại chi phí</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const getStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
  },
  headerSpacer: {
    width: 24,
  },
  scrollContent: {
    padding: 16,
    gap: 12,
  },
  centerLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    marginTop: 16,
  },
  emptyDesc: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  retryBtn: {
    padding: 12,
    marginTop: 8,
  },
  retryText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
  },
  errorBanner: {
    padding: 16,
    gap: 8,
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    gap: 6,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 6,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  meta: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  decisionBtnRow: {
    flexDirection: 'row',
    gap: 8,
  },
  decisionBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
  },
  decisionBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  evidenceItem: {
    gap: 4,
  },
  evidenceThumb: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
  },
  evidencePlaceholder: {
    height: 120,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
  },
  evidenceError: {
    gap: 8,
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    padding: 12,
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  totalValue: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
});
