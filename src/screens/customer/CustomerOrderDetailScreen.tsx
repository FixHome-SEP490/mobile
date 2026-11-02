import React, { useState, useCallback, useEffect, useRef } from 'react';
import { quoteStatusLabel } from '../../utils/quote-status';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, StatusBar, Image, Modal, Alert, TextInput, Linking, AppState, type LayoutChangeEvent, ScrollViewInstance } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useLiveRefresh } from '../../hooks/useLiveRefresh';
import { orderPartsFor } from '../../services/live-kinds';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../types';
import { useAppTheme } from '../../constants/theme';
import CustomerSkeleton from '../../components/customer/CustomerSkeleton';
import CustomerSupportCasesSection from './CustomerSupportCasesSection';
import { useAuthStore } from '../../store/auth.store';
import { ordersApi, type CanonicalOrderStatus } from '../../api/orders.api';
import { customerBookingsUserId } from './customer-bookings-history';
import {
  orderNextAction,
  orderNextActionButtonLabel,
  type OrderNextActionKind,
} from './customer-order-next-action';
import {
  createOrderDetailLoader,
  initialOrderDetailState,
  quotationItemsList,
  resolveOrderDetailSections,
  technicianAttributionNote,
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
import { customerUnderRepairTask } from './customer-under-repair-task';
import {
  createCustomerConfirmCompletionController,
  customerConfirmCompletionTarget,
  initialCustomerConfirmCompletionState,
  CUSTOMER_CONFIRM_COMPLETION_COPY,
} from './customer-confirm-completion';
import {
  createCustomerOrderReviewController,
  customerReviewTarget,
  initialCustomerOrderReviewState,
} from './customer-order-review';
import {
  createCustomerPaymentController,
  customerPaymentTarget,
  initialCustomerPaymentState,
} from './customer-payment';
import {
  createCustomerOrderCancelController,
  customerOrderCancelTarget,
  initialCustomerOrderCancelState,
} from './customer-order-cancel';
import { vnDateTimeString } from '../../utils/vn-time';
import { findChatForBooking } from '../technician/technician-chat-shortcut';
import CustomerOrderTimeline from './CustomerOrderTimeline';
import { actionDetailSection, customerActiveOrderSection, customerOrderTimeline, type OrderDetailSection } from './customer-order-timeline';
import BackButton from '../../components/BackButton';

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
  const detailScrollRef = useRef<ScrollViewInstance | null>(null);
  const [detailView, setDetailView] = useState<{ orderId: string; section: OrderDetailSection | 'all' } | null>(null);
  const pendingScroll = useRef<{ orderId: string; kind: OrderNextActionKind } | null>(null);
  const openDetailSection = (section: OrderDetailSection) => {
    pendingScroll.current = null;
    setDetailView({ orderId: serviceOrderId, section });
  };
  const actionSectionYRef = useRef<Partial<Record<OrderNextActionKind, number>>>({});
  const markActionSection = useCallback((kind: OrderNextActionKind) => (event: LayoutChangeEvent) => {
    actionSectionYRef.current[kind] = event.nativeEvent.layout.y;
    if (pendingScroll.current?.orderId === serviceOrderId && pendingScroll.current.kind === kind && event.nativeEvent.layout.height > 0) {
      pendingScroll.current = null;
      detailScrollRef.current?.scrollTo({ y: Math.max(0, event.nativeEvent.layout.y - 12), animated: true });
    }
  }, [serviceOrderId]);
  const scrollToActionSection = useCallback((kind: OrderNextActionKind) => {
    const section = actionDetailSection(kind);
    const alreadyOpen = detailView?.orderId === serviceOrderId && (detailView.section === 'all' || detailView.section === section);
    pendingScroll.current = { orderId: serviceOrderId, kind };
    if (!alreadyOpen) setDetailView({ orderId: serviceOrderId, section });
    const y = actionSectionYRef.current[kind];
    if (!alreadyOpen || typeof y !== 'number') return;
    pendingScroll.current = null;
    detailScrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
  }, [detailView, serviceOrderId]);
  const [detailState, setDetailState] = useState(initialOrderDetailState);
  const { order, loading, refreshing, error } = detailState;
  const [evidenceState, setEvidenceState] = useState(initialEvidenceState);
  const [selectedEvidencePhotoId, setSelectedEvidencePhotoId] = useState<string | null>(null);
  const selectedEvidencePhoto = order?.id === serviceOrderId
    ? evidenceState.photos.find((photo) => photo.id === selectedEvidencePhotoId) ?? null
    : null;
  const [decisionState, setDecisionState] = useState(initialDecisionState);
  const focusAliveRef = useRef(false);
  const [invoiceState, setInvoiceState] = useState(initialInvoiceState);
  const [costsState, setCostsState] = useState(initialAdditionalCostsState);
  const [costDecisionState, setCostDecisionState] = useState(initialCostDecisionState);
  const [confirmCompletionState, setConfirmCompletionState] = useState(initialCustomerConfirmCompletionState);
  const [reviewState, setReviewState] = useState(initialCustomerOrderReviewState);
  const [paymentState, setPaymentState] = useState(initialCustomerPaymentState);
  const [orderCancelState, setOrderCancelState] = useState(initialCustomerOrderCancelState);
  const [progressVisible, setProgressVisible] = useState(false);
  const invoiceViewRef = useRef(invoiceState.invoice);
  useEffect(() => { invoiceViewRef.current = invoiceState.invoice; }, [invoiceState.invoice]);
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
  // K07 customer work confirmation: one explicit mutation attempt, then
  // authoritative detail + invoice GET reconciliation. Payment stays separate.
  const confirmCompletionRef = useRef<ReturnType<typeof createCustomerConfirmCompletionController> | null>(null);
  useEffect(() => {
    const detailLoader = loaderRef.current;
    if (!detailLoader) return;

    confirmCompletionRef.current = createCustomerConfirmCompletionController(
      {
        getOrder: () => {
          const latest = latestRef.current;
          if (!latest.order || latest.order.id !== latest.serviceOrderId) return null;
          return {
            id: latest.order.id,
            status: latest.order.status,
            completionRequestedAt: latest.order.completionRequestedAt,
            customerConfirmed: latest.order.customerConfirmed,
            historical: latest.order.historical,
          };
        },
        getCustomerId: () => customerBookingsUserId(useAuthStore.getState()),
        isFocused: () => focusAliveRef.current,
        confirmCompletion: (id) => ordersApi.confirmCompletion(id),
        refreshDetail: async () => {
          await loaderRef.current?.refresh(true);
        },
        refreshInvoice: async () => {
          const latest = latestRef.current;
          if (latest.order && latest.order.id === latest.serviceOrderId) {
            const target = latest.order.id;
            await invoiceRef.current?.refreshInvoice(() => isEvidenceReadable(target));
          }
        },
        onAccessDenied: () => { void loaderRef.current?.refresh(true); },
        notify: (title, message) => Alert.alert(title, message),
      },
      setConfirmCompletionState,
    );

    return () => {
      confirmCompletionRef.current = null;
    };
  }, []);

  // K08 Customer settlement: source parity with Web/Backend.
  // Cash confirmation and VNPay URL creation are explicit user intents; all
  // success/unknown outcomes reconcile through authoritative GETs.
  const paymentRef = useRef<ReturnType<typeof createCustomerPaymentController> | null>(null);
  useEffect(() => {
    paymentRef.current = createCustomerPaymentController(
      {
        getOrder: () => {
          const latest = latestRef.current;
          if (!latest.order || latest.order.id !== latest.serviceOrderId) return null;
          return {
            id: latest.order.id,
            status: latest.order.status,
            paymentStatus: latest.order.paymentStatus,
            customerConfirmed: latest.order.customerConfirmed,
            historical: latest.order.historical,
          };
        },
        getInvoice: () => invoiceViewRef.current,
        getCustomerId: () => customerBookingsUserId(useAuthStore.getState()),
        isFocused: () => focusAliveRef.current,
        getCashSettlement: (id) => ordersApi.getCashSettlement(id),
        confirmCashSettlement: (id, body) => ordersApi.confirmCashSettlement(id, body),
        createVnpayUrl: (invoiceId) => ordersApi.createVnpayUrl(invoiceId),
        openExternalUrl: (url) => Linking.openURL(url),
        refreshAll: async () => {
          await loaderRef.current?.refresh(true);
          const latest = latestRef.current;
          if (latest.order && latest.order.id === latest.serviceOrderId) {
            const target = latest.order.id;
            await invoiceRef.current?.refreshInvoice(() => isEvidenceReadable(target));
          }
        },
        onAccessDenied: () => { void loaderRef.current?.refresh(true); },
        notify: (title, message) => Alert.alert(title, message),
      },
      setPaymentState,
    );
    return () => {
      paymentRef.current = null;
    };
  }, []);

  // K09-B Customer ServiceOrder cancellation: expose only ACCEPTED/EN_ROUTE.
  // UNDER_REPAIR and later remain support/manager paths; no compensation policy is invented.
  const orderCancelRef = useRef<ReturnType<typeof createCustomerOrderCancelController> | null>(null);
  useEffect(() => {
    orderCancelRef.current = createCustomerOrderCancelController(
      {
        getOrder: () => {
          const latest = latestRef.current;
          return latest.order && latest.order.id === latest.serviceOrderId
            ? latest.order
            : null;
        },
        getCustomerId: () => customerBookingsUserId(useAuthStore.getState()),
        isFocused: () => focusAliveRef.current,
        cancelOrder: (id, reason) => ordersApi.cancelOrder(id, reason),
        getOrderById: async (id) => {
          const fresh = await ordersApi.getOrder(id);
          await loaderRef.current?.refresh(true);
          return fresh;
        },
        onAccessDenied: () => { void loaderRef.current?.refresh(true); },
        notify: (title, message) => Alert.alert(title, message),
      },
      setOrderCancelState,
    );
    return () => {
      orderCancelRef.current = null;
    };
  }, []);

  // K09-A server-backed review: only a real COMPLETED order is eligible.
  // GET existing review is mandatory before any create POST; unknown POST
  // outcomes stay locked until canonical GET proves the review.
  const reviewRef = useRef<ReturnType<typeof createCustomerOrderReviewController> | null>(null);
  useEffect(() => {
    reviewRef.current = createCustomerOrderReviewController(
      {
        getOrder: () => {
          const latest = latestRef.current;
          if (!latest.order || latest.order.id !== latest.serviceOrderId) return null;
          return {
            id: latest.order.id,
            status: latest.order.status,
            historical: latest.order.historical,
          };
        },
        getCustomerId: () => customerBookingsUserId(useAuthStore.getState()),
        isFocused: () => focusAliveRef.current,
        getReview: (id) => ordersApi.getOrderReview(id),
        submitReview: (id, body) => ordersApi.submitReview(id, body),
        onAccessDenied: () => { void loaderRef.current?.refresh(true); },
        notify: (title, message) => Alert.alert(title, message),
      },
      setReviewState,
    );

    return () => {
      reviewRef.current = null;
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
  // PO 18/10/2026: this order changed on the server (status, photos, costs, warranty): read it again, quietly.
  // Only the part the push says it touched is read again (photos, invoice, costs, the order itself).
  useLiveRefresh(['order:updated'], (batch) => {
    const parts = orderPartsFor(batch.kinds);
    if (parts.detail) void loaderRef.current?.refresh(true);
    const latest = latestRef.current;
    if (!latest.order || latest.order.id !== latest.serviceOrderId) return;
    const target = latest.order.id;
    const readable = () => isEvidenceReadable(target);
    if (parts.evidence) void evidenceRef.current?.refreshEvidence(readable);
    if (parts.invoice) void invoiceRef.current?.refreshInvoice(readable);
    if (parts.costs) void costsRef.current?.refreshCosts(readable);
  }, (event) => !event.payload.serviceOrderId || event.payload.serviceOrderId === serviceOrderId, { pollMs: 30_000 });
  useFocusEffect(useCallback(() => {
    focusAliveRef.current = true;
    void loaderRef.current?.focus(serviceOrderId);
    return () => {
      focusAliveRef.current = false;
      setSelectedEvidencePhotoId(null);
      loaderRef.current?.blur();
      evidenceRef.current?.blurEvidence();
      invoiceRef.current?.blurInvoice();
      costsRef.current?.blurCosts();
      costDecisionRef.current?.reset();
      decisionRef.current?.reset();
      confirmCompletionRef.current?.reset();
      reviewRef.current?.reset();
      paymentRef.current?.reset();
      orderCancelRef.current?.reset();
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

  // K07 confirmation state belongs to one focused customer/order.
  useEffect(() => {
    if (!order || order.id !== serviceOrderId) confirmCompletionRef.current?.reset();
  }, [order, serviceOrderId]);

  // K08 payment state follows only an authorized, customer-confirmed,
  // unpaid UNDER_REPAIR order with a real invoice.
  useEffect(() => {
    const latest = latestRef.current;
    const target = latest.order && latest.order.id === latest.serviceOrderId
      ? customerPaymentTarget(
          {
            id: latest.order.id,
            status: latest.order.status,
            paymentStatus: latest.order.paymentStatus,
            customerConfirmed: latest.order.customerConfirmed,
            historical: latest.order.historical,
          },
          invoiceState.invoice,
        )
      : null;
    if (target) {
      void paymentRef.current?.loadCash();
    } else if (!paymentState.onlinePending) {
      paymentRef.current?.reset();
    }
  }, [order, serviceOrderId, invoiceState.invoice, paymentState.onlinePending]);

  // K08 VNPay return reconciliation: the browser/app return is not proof of payment.
  // When the app becomes active again, refresh authoritative Order + Invoice only.
  useEffect(() => {
    if (!paymentState.onlinePending) return;
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && focusAliveRef.current) {
        void paymentRef.current?.reconcileOnline();
      }
    });
    return () => subscription.remove();
  }, [paymentState.onlinePending]);

  // K09-A review follows only the same authorized COMPLETED detail.
  useEffect(() => {
    const controller = reviewRef.current;
    if (!controller) return;

    const target = order && order.id === serviceOrderId
      ? customerReviewTarget({
          id: order.id,
          status: order.status,
          historical: order.historical,
        })
      : null;

    if (target) {
      void controller.load();
    } else {
      controller.reset();
    }
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
  const onCostDecideSubmit = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    void costDecisionRef.current?.submit();
  };
  const onConfirmCompletionRequest = () => { confirmCompletionRef.current?.requestConfirm(); };
  const onConfirmCompletionCancel = () => { confirmCompletionRef.current?.cancelConfirm(); };
  const onConfirmCompletionSubmit = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    void confirmCompletionRef.current?.submit();
  };
  const onConfirmCompletionReconcile = () => { void confirmCompletionRef.current?.reconcile(); };
  const onPaymentVnpay = () => {
    Alert.alert(
      'Thanh toán VNPay',
      'Ứng dụng sẽ mở liên kết thanh toán do hệ thống tạo. Chỉ khi hệ thống xác nhận đã thanh toán/hoàn thành mới được coi là thành công.',
      [
        { text: 'Hủy', style: 'cancel' },
        { text: 'Tiếp tục', onPress: () => { void paymentRef.current?.startVnpay(); } },
      ],
    );
  };
  const onPaymentCheckOnline = () => { void paymentRef.current?.reconcileOnline(); };
  const onPaymentCheckCash = () => { void paymentRef.current?.reconcileCash(); };
  const onPaymentConfirmCash = () => {
    const settlement = paymentState.settlement;
    if (!settlement) return;
    Alert.alert(
      'Xác nhận đã trả tiền mặt',
      'Xác nhận đã trả đúng ' + settlement.declaredAmount.toLocaleString('vi-VN') +
        'đ cho kỹ thuật viên? Đây là xác nhận thanh toán riêng với nghiệm thu công việc.',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xác nhận',
          onPress: () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            void paymentRef.current?.confirmCash(true, settlement.declaredAmount);
          },
        },
      ],
    );
  };
  const onPaymentDisputeCash = () => {
    const settlement = paymentState.settlement;
    if (!settlement) return;
    Alert.alert(
      'Báo sai số tiền',
      'Hệ thống sẽ chuyển đối soát sang trạng thái tranh chấp để xử lý; hóa đơn chưa được coi là đã thanh toán.',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Báo sai',
          style: 'destructive',
          onPress: () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            void paymentRef.current?.confirmCash(
              false,
              settlement.declaredAmount,
              'Khách hàng báo số tiền thực trả không khớp với khai báo kỹ thuật viên',
            );
          },
        },
      ],
    );
  };
  const onOrderCancelReason = (reason: string) => {
    orderCancelRef.current?.setReason(reason);
  };
  const onOrderCancelRequest = () => {
    orderCancelRef.current?.requestConfirm();
  };
  const onOrderCancelBack = () => {
    orderCancelRef.current?.cancelConfirm();
  };
  const onOrderCancelSubmit = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    void orderCancelRef.current?.submit();
  };
  const onOrderCancelReconcile = () => {
    void orderCancelRef.current?.reconcile();
  };
  const onReviewRating = (rating: number) => {
    Haptics.selectionAsync();
    reviewRef.current?.setRating(rating);
  };
  const onReviewComment = (comment: string) => { reviewRef.current?.setComment(comment); };
  const onReviewSubmit = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    void reviewRef.current?.submit();
  };
  const onReviewReconcile = () => { void reviewRef.current?.reconcile(); };
  const onToggleWarranty = (itemId: string) => {
    Haptics.selectionAsync();
    decisionRef.current?.toggleWarranty(itemId);
  };
  const onDecideApprove = () => { decisionRef.current?.requestConfirm('approve'); };
  const onDecideReject = () => { decisionRef.current?.requestConfirm('reject'); };
  const onDecideCancel = () => { decisionRef.current?.cancelConfirm(); };
  const onDecideSubmit = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    void decisionRef.current?.submit();
  };
  const sections = resolveOrderDetailSections(order);
  const [openingChat, setOpeningChat] = useState(false);
  /** The order's thread with the technician, where their first message waits. */
  const openTechnicianChat = async () => {
    if (!order?.bookingId || openingChat) return;
    setOpeningChat(true);
    try {
      const target = await findChatForBooking(order.bookingId);
      if (!target) {
        Alert.alert('Chưa có cuộc trò chuyện', 'Chưa có cuộc trò chuyện nào cho đơn này.');
        return;
      }
      navigation.navigate('ChatThread', {
        conversationId: target.conversationId,
        counterpartName: target.counterpartName,
        serviceName: target.serviceName,
      });
    } catch {
      Alert.alert('Không mở được', 'Không thể mở cuộc trò chuyện. Vui lòng thử lại.');
    } finally {
      setOpeningChat(false);
    }
  };
  const orderCancelEligible = customerOrderCancelTarget(
    order && order.id === serviceOrderId ? order : null,
  );
  const paymentEligible = order && order.id === serviceOrderId
    ? customerPaymentTarget(
        {
          id: order.id,
          status: order.status,
          paymentStatus: order.paymentStatus,
          customerConfirmed: order.customerConfirmed,
          historical: order.historical,
        },
        invoiceState.invoice,
      )
    : null;
  const reviewEligible = order && order.id === serviceOrderId
    ? customerReviewTarget({
        id: order.id,
        status: order.status,
        historical: order.historical,
      })
    : null;
  const confirmCompletionGate = order && order.id === serviceOrderId
    ? {
        id: order.id,
        status: order.status,
        completionRequestedAt: order.completionRequestedAt,
        customerConfirmed: order.customerConfirmed,
        historical: order.historical,
      }
    : null;
  const confirmCompletionEligible = customerConfirmCompletionTarget(confirmCompletionGate);
  const underRepairTask = customerUnderRepairTask(
    order
      ? {
          status: order.status,
          completionRequestedAt: order.completionRequestedAt,
          customerConfirmed: order.customerConfirmed,
          historical: order.historical,
          quotationStatus: order.quotation?.status,
        }
      : null,
    costsState.requests,
  );
  // P3 provenance clarification (display-only): the shown technician is the one
  // RECORDED on the order, which may be a previous tech while replacement is
  // underway. Name/phone stay visible; only a hedged note is added below.
  const attributionNote = technicianAttributionNote(order);
  // Universal top summary (display-only): reuses the eligibility outcomes
  // already computed below/above instead of inventing new rules.
  const canDecideQuote = !!order &&
    order.id === serviceOrderId &&
    String(order.status).toUpperCase() === 'EN_ROUTE' &&
    sections.quoteAwaitingDecision;
  const orderSummaryAction = order && order.id === serviceOrderId
    ? orderNextAction({
        status: order.status,
        quoteAwaitingDecision: canDecideQuote,
        additionalCostPending: costsState.requests.some(canDecideCost),
        completionRequested: confirmCompletionEligible != null,
        paymentPending: paymentEligible != null,
        reviewable: reviewEligible != null && !reviewState.review,
      })
    : null;
  const onCustomerFooterAction = () => {
    if (orderSummaryAction && !['track', 'none'].includes(orderSummaryAction.kind)) scrollToActionSection(orderSummaryAction.kind);
    else onRefresh();
  };
  const activeSection = order && order.id === serviceOrderId
    ? customerActiveOrderSection(order, orderSummaryAction?.kind ?? 'none')
    : 'overview';
  const detailSectionStyle = (section: OrderDetailSection): { display: 'flex' | 'none' } => ({
    display: detailView?.orderId === serviceOrderId
      ? (detailView.section === 'all' || detailView.section === section ? 'flex' : 'none')
      : (activeSection === section ? 'flex' : 'none'),
  });
  // P3B7 decision visibility mirrors the controller gate: active customer
  // order in EN_ROUTE with the latest quotation SENT.
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
        return { label: 'Đang sửa chữa', bg: colors.primaryTint, color: colors.primary };
      case 'COMPLETED':
        return { label: 'Hoàn thành', bg: '#DCFCE7', color: '#16A34A' };
      case 'CANCELLED':
        return { label: 'Đã hủy', bg: '#FEE2E2', color: colors.error };
      default:
        return { label: s, bg: colors.divider, color: colors.textSecondary };
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <View style={styles.header}>
        <BackButton />
        <Text style={styles.headerTitle} accessibilityRole="header">{`Bước · ${orderSummaryAction?.title ?? 'Chi tiết đơn sửa chữa'}`}</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={styles.loadingState}>
          <CustomerSkeleton variant="orderDetail" rows={3} />
          <Text style={styles.loadingText} accessibilityLiveRegion="polite">Đang tải chi tiết đơn...</Text>
        </View>
      ) : !order ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="receipt-outline" size={56} color="#CBD5E1" />
          <Text style={styles.emptyTitle} accessibilityRole="header">Không xem được đơn</Text>
          {!!error && <Text style={styles.emptyDesc}>{error}</Text>}
          <TouchableOpacity
            onPress={onRefresh}
            disabled={refreshing}
            accessibilityRole="button"
            accessibilityLabel="Thử tải lại chi tiết đơn"
            accessibilityState={{ disabled: refreshing, busy: refreshing }}
            style={styles.retryBtn}
          >
            <Text style={styles.retryText}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
        <ScrollView
          ref={detailScrollRef}
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {!!error && (
            <View style={styles.errorBanner} accessibilityRole="alert">
              <Text style={styles.emptyDesc}>{error}</Text>
              <TouchableOpacity
                onPress={onRefresh}
                disabled={refreshing}
                accessibilityRole="button"
                accessibilityLabel="Thử tải lại chi tiết đơn"
                accessibilityState={{ disabled: refreshing, busy: refreshing }}
                style={styles.inlineRetryButton}
              >
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
            <Text style={styles.title} accessibilityRole="header">{order.serviceName || 'Dịch vụ sửa chữa'}</Text>
            <Text style={styles.meta}>Đơn #{order.code || order.id.slice(0, 8)}</Text>
            {!!order.scheduledAt && (
              <Text style={styles.meta}>
                Lịch hẹn: {vnDateTimeString(order.scheduledAt)}
              </Text>
            )}
            {!!order.addressSummary && (
              <Text style={styles.meta} numberOfLines={2}>📍 {order.addressSummary}</Text>
            )}
            <View style={detailSectionStyle('overview')}>
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
          </View>

          <TouchableOpacity style={styles.progressLink} accessibilityRole="button" accessibilityLabel="Xem tiến độ đơn hàng" onPress={() => setProgressVisible(true)}><Text style={styles.retryText}>Xem tiến độ</Text></TouchableOpacity>



          {String(order.status).toUpperCase() === 'COMPLETED' && (
            <View style={[styles.card, detailSectionStyle('warranty')]} testID="order-detail-section-warranty-4">
              <View style={[styles.row, { alignItems: 'flex-start' }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionTitle} accessibilityRole="header">Bảo hành sau sửa chữa</Text>
                  <Text style={styles.meta}>
                    Xem các hạng mục bảo hành của đơn này, theo dõi yêu cầu đã gửi hoặc gửi yêu cầu mới khi có sự cố.
                  </Text>
                </View>
                <Ionicons name="shield-checkmark-outline" size={24} color={colors.success} />
              </View>
              <TouchableOpacity
                style={[styles.decisionBtn, { backgroundColor: colors.primaryStrong, alignSelf: 'flex-start' }]}
                onPress={() => navigation.navigate('CustomerWarranties', { orderId: serviceOrderId })}
                accessibilityRole="button"
                accessibilityLabel="Mở bảo hành của đơn sửa chữa"
              >
                <Text style={styles.decisionBtnText}>Xem bảo hành</Text>
              </TouchableOpacity>
            </View>
          )}

          {underRepairTask && (
            <View
              onLayout={underRepairTask.kind === 'completion_requested'
                ? markActionSection('confirm_completion')
                : undefined}
              style={[[
                styles.card,
                {
                  borderWidth: 1,
                  borderColor:
                    underRepairTask.kind === 'additional_cost_pending'
                      ? '#F59E0B'
                      : '#BFDBFE',
                  backgroundColor:
                    underRepairTask.kind === 'additional_cost_pending'
                      ? '#FFFBEB'
                      : colors.primarySoft,
                },
              ], detailSectionStyle('completion')]} testID="order-detail-section-completion-5"
            >
              <Text style={[styles.meta, { fontWeight: '800', color: '#1D4ED8' }]}>
                BƯỚC TIẾP THEO
              </Text>
              <Text style={styles.sectionTitle}>{underRepairTask.title}</Text>
              <Text style={styles.meta}>{underRepairTask.detail}</Text>
              {underRepairTask.kind === 'additional_cost_pending' && (
                <Text style={[styles.meta, { fontWeight: '700', color: '#92400E' }]}>
                  Phản hồi từng khoản trong mục “Chi phí phát sinh” bên dưới.
                </Text>
              )}
              {underRepairTask.kind === 'completion_requested' && (
                <View style={{ marginTop: 8, gap: 8 }}>
                  {/* K07_CUSTOMER_CONFIRM_COMPLETION */}
                  {confirmCompletionState.needsVerify ? (
                    <>
                      <Text style={[styles.meta, { color: '#92400E', fontWeight: '700' }]}>
                        Kết quả xác nhận trước chưa rõ. Không gửi lại.
                      </Text>
                      <TouchableOpacity
                        onPress={onConfirmCompletionReconcile}
                        disabled={confirmCompletionState.busy}
                        accessibilityRole="button"
                        style={[styles.retryBtn, { alignSelf: 'flex-start' }]}
                      >
                        <Text style={styles.retryText}>
                          {confirmCompletionState.busy ? 'Đang kiểm tra...' : 'Kiểm tra nghiệm thu'}
                        </Text>
                      </TouchableOpacity>
                    </>
                  ) : confirmCompletionState.confirming ? (
                    <View style={styles.evidenceError}>
                      <Text style={styles.meta}>{CUSTOMER_CONFIRM_COMPLETION_COPY}</Text>
                      <View style={styles.decisionBtnRow}>
                        <TouchableOpacity
                          style={[styles.decisionBtn, { backgroundColor: colors.success }]}
                          onPress={onConfirmCompletionSubmit}
                          disabled={confirmCompletionState.busy}
                          accessibilityRole="button"
                          accessibilityLabel="Xác nhận công việc đã hoàn tất"
                        >
                          {confirmCompletionState.busy ? (
                            <ActivityIndicator size="small" color={colors.surface} />
                          ) : (
                            <Text style={styles.decisionBtnText}>Xác nhận</Text>
                          )}
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.decisionBtn, { backgroundColor: colors.divider }]}
                          onPress={onConfirmCompletionCancel}
                          disabled={confirmCompletionState.busy}
                          accessibilityRole="button"
                        >
                          <Text style={[styles.decisionBtnText, { color: '#334155' }]}>Hủy</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : confirmCompletionEligible ? (
                    <TouchableOpacity
                      onPress={onConfirmCompletionRequest}
                      disabled={confirmCompletionState.busy}
                      accessibilityRole="button"
                      style={[styles.decisionBtn, { backgroundColor: colors.success, alignSelf: 'flex-start' }]}
                    >
                      <Text style={styles.decisionBtnText}>Xác nhận đã hoàn tất công việc</Text>
                    </TouchableOpacity>
                  ) : null}
                  {!!confirmCompletionState.error && (
                    <Text style={[styles.meta, { color: '#B91C1C' }]}>
                      {confirmCompletionState.error}
                    </Text>
                  )}
                </View>
              )}
              {underRepairTask.kind === 'work_confirmed' && (
                <Text style={[styles.meta, { fontWeight: '700', color: '#047857' }]}>
                  Hệ thống đã ghi nhận nghiệm thu. Hóa đơn/thanh toán vẫn hiển thị riêng bên dưới.
                </Text>
              )}
            </View>
          )}

          {sections.hasTechnician && (
            <View style={[styles.card, detailSectionStyle('technician')]} testID="order-detail-section-technician-6">
              <Text style={styles.sectionTitle}>Kỹ thuật viên ghi nhận trên đơn</Text>
              <Text style={styles.title}>{sections.technicianName}</Text>
              {!!sections.technicianPhone && (
                <Text style={styles.meta}>SĐT: {sections.technicianPhone}</Text>
              )}
              {!!attributionNote && (
                <Text style={styles.meta}>{attributionNote}</Text>
              )}
              <TouchableOpacity
                testID="order-chat-technician"
                style={[styles.decisionBtn, { backgroundColor: colors.primaryStrong, alignSelf: 'flex-start', flex: 0, paddingHorizontal: 16, marginTop: 8, opacity: openingChat ? 0.6 : 1 }]}
                onPress={() => { void openTechnicianChat(); }}
                disabled={openingChat}
                accessibilityRole="button"
                accessibilityLabel="Nhắn tin với kỹ thuật viên"
              >
                <Text style={styles.decisionBtnText}>Nhắn tin với kỹ thuật viên</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={[styles.card, detailSectionStyle('payment')]} testID="order-detail-section-payment-7">
            <Text style={styles.sectionTitle}>Chi phí</Text>
            {sections.laborText !== null && (
              <View style={styles.row}>
                <Text style={styles.meta}>Tiền công</Text>
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
            <View onLayout={markActionSection('decide_quote')} style={[styles.card, detailSectionStyle('quote')]} testID="order-detail-section-quote-8">
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
                    : 'Đã từ chối báo giá. Đơn sửa chữa đã bị hủy.'}
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
                            color={checked ? colors.primary : colors.muted}
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
                          style={[styles.decisionBtn, { backgroundColor: decisionState.confirming === 'approve' ? colors.success : colors.error }]}
                          onPress={onDecideSubmit}
                          disabled={decisionState.busy}
                          accessibilityRole="button"
                          accessibilityLabel={decisionState.confirming === 'approve' ? 'Xác nhận duyệt báo giá' : 'Xác nhận từ chối báo giá'}
                        >
                          {decisionState.busy ? (
                            <ActivityIndicator size="small" color={colors.surface} />
                          ) : (
                            <Text style={styles.decisionBtnText}>
                              {decisionState.confirming === 'approve' ? 'Xác nhận duyệt' : 'Xác nhận từ chối'}
                            </Text>
                          )}
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.decisionBtn, { backgroundColor: colors.divider }]}
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
                        style={[styles.decisionBtn, { backgroundColor: colors.success }]}
                        onPress={onDecideApprove}
                        disabled={decisionState.busy || decisionState.needsVerify}
                        accessibilityRole="button"
                        accessibilityLabel="Duyệt báo giá"
                      >
                        <Text style={styles.decisionBtnText}>Duyệt báo giá</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.decisionBtn, { backgroundColor: colors.error }]}
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

          {(sections.beforeCount !== null || sections.afterCount !== null) && (
            <View style={[styles.card, detailSectionStyle('evidence')]} testID="order-detail-section-evidence-9">
              <Text style={styles.sectionTitle}>Bằng chứng ảnh</Text>
              {sections.beforeCount !== null && (
                <Text style={styles.meta}>Ảnh trước sửa chữa: {sections.beforeCount}</Text>
              )}
              {sections.afterCount !== null && (
                <Text style={styles.meta}>Ảnh sau sửa chữa: {sections.afterCount}</Text>
              )}
            </View>
          )}

          <View style={[styles.card, detailSectionStyle('evidence')]} testID="order-detail-section-evidence-10">
            <Text style={styles.sectionTitle}>Ảnh thực tế</Text>
            {evidenceState.loading && evidenceState.photos.length === 0 && !evidenceState.error ? (
              <Text style={styles.meta}>Đang tải ảnh bằng chứng...</Text>
            ) : evidenceState.photos.length === 0 && !evidenceState.error ? (
              <Text style={styles.meta}>Chưa có ảnh bằng chứng cho đơn này.</Text>
            ) : (
              evidenceState.photos.map((photo) => (
                <View key={photo.id} style={styles.evidenceItem}>
                  <Text style={styles.evidenceTypeTitle}>{evidenceTypeLabel(photo.type)}</Text>
                  {evidenceState.failed[photo.id] ? (
                    <View style={styles.evidencePlaceholder}>
                      <Text style={styles.meta}>Không tải được ảnh. Nhấn “Tải lại ảnh” để lấy đường dẫn mới.</Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      testID={`order-evidence-zoom-${photo.id}`}
                      style={styles.evidencePhotoButton}
                      onPress={() => setSelectedEvidencePhotoId(photo.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`Phóng to ảnh ${evidenceTypeLabel(photo.type)}`}
                      accessibilityHint="Mở ảnh bằng chứng ở kích thước lớn"
                    >
                      <Image
                        source={{ uri: photo.uri }}
                        style={styles.evidenceThumb}
                        resizeMode="contain"
                        accessibilityLabel={`Ảnh ${evidenceTypeLabel(photo.type)}`}
                        onError={() => evidenceRef.current?.markImageFailed(photo.id)}
                      />
                    </TouchableOpacity>
                  )}
                  {!!photo.note && <Text style={styles.meta}>{photo.note}</Text>}
                </View>
              ))
            )}
            {!!evidenceState.error && (
              <View style={styles.evidenceError}>
                <Text style={styles.meta}>{evidenceState.error}</Text>
                <TouchableOpacity
                  onPress={onRetryEvidence}
                  disabled={!evidenceState.canRetry}
                  accessibilityRole="button"
                  accessibilityLabel="Tải lại ảnh bằng chứng"
                  accessibilityState={{ disabled: !evidenceState.canRetry }}
                  style={styles.inlineRetryButton}
                >
                  <Text style={evidenceState.canRetry ? styles.retryText : styles.meta}>Tải lại ảnh</Text>
                </TouchableOpacity>
              </View>
            )}
            {!evidenceState.error && Object.keys(evidenceState.failed).length > 0 && (
              <TouchableOpacity onPress={onRetryEvidence} accessibilityRole="button" accessibilityLabel="Tải lại ảnh bằng chứng" style={styles.inlineRetryButton}>
                <Text style={styles.retryText}>Tải lại ảnh</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={[[styles.card, styles.invoiceCard], detailSectionStyle('payment')]} testID="order-detail-section-payment-11">
            <View style={styles.invoiceHeader}>
              <View style={styles.invoiceHeading}>
                <Text style={styles.invoiceEyebrow}>CHI TIẾT CHI PHÍ</Text>
                <Text style={styles.sectionTitle}>Hóa đơn</Text>
              </View>
              {invoiceState.invoice && (
                <View
                  testID="invoice-payment-status"
                  accessible
                  accessibilityRole="text"
                  accessibilityLabel={"Trạng thái thanh toán: " + invoicePaymentLabel(invoiceState.invoice.paymentStatus)}
                  style={[
                    styles.statusChip,
                    invoiceState.invoice.paymentStatus === 'PAID'
                      ? styles.statusChipPaid
                      : invoiceState.invoice.paymentStatus === 'UNPAID'
                        ? styles.statusChipUnpaid
                        : invoiceState.invoice.paymentStatus === 'REFUNDED'
                          ? styles.statusChipInfo
                          : styles.statusChipUnknown,
                  ]}
                >
                  <Text style={[
                    styles.statusChipText,
                    invoiceState.invoice.paymentStatus === 'PAID'
                      ? styles.statusChipTextPaid
                      : invoiceState.invoice.paymentStatus === 'UNPAID'
                        ? styles.statusChipTextUnpaid
                        : invoiceState.invoice.paymentStatus === 'REFUNDED'
                          ? styles.statusChipTextInfo
                          : styles.statusChipTextUnknown,
                  ]}>
                    {invoicePaymentLabel(invoiceState.invoice.paymentStatus)}
                  </Text>
                </View>
              )}
            </View>
            {invoiceState.loading && !invoiceState.invoice && !invoiceState.error ? (
              <Text style={styles.meta}>Đang tải hóa đơn...</Text>
            ) : invoiceState.invoice ? (
              <>
                <View style={styles.invoiceLines}>
                  {invoiceState.invoice.items.map((item) => (
                    <View key={item.id} style={styles.invoiceRow}>
                      <Text style={styles.invoiceItemLabel}>{item.description} × {item.quantity}</Text>
                      <Text style={styles.invoiceItemValue}>{item.lineTotalText ?? '—'}</Text>
                    </View>
                  ))}
                  {invoiceState.invoice.laborText !== null && (
                    <View style={styles.invoiceRow}>
                      <Text style={styles.invoiceItemLabel}>Tiền công</Text>
                      <Text style={styles.invoiceItemValue}>{invoiceState.invoice.laborText}</Text>
                    </View>
                  )}
                  {invoiceState.invoice.partsText !== null && (
                    <View style={styles.invoiceRow}>
                      <Text style={styles.invoiceItemLabel}>Vật tư</Text>
                      <Text style={styles.invoiceItemValue}>{invoiceState.invoice.partsText}</Text>
                    </View>
                  )}
                </View>
                {invoiceState.invoice.totalText !== null ? (
                  <View testID="invoice-total" style={styles.invoiceTotalRow}>
                    <Text style={styles.totalLabel}>Tổng cộng</Text>
                    <Text style={styles.totalValue}>{invoiceState.invoice.totalText}</Text>
                  </View>
                ) : (
                  <Text style={styles.invoiceUnknownTotal}>Chưa rõ tổng tiền.</Text>
                )}
                {!!invoiceState.invoice.issuedText && (
                  <Text style={styles.meta}>Phát hành: {invoiceState.invoice.issuedText}</Text>
                )}
                {!!invoiceState.invoice.paidText && (
                  <Text style={styles.meta}>Thanh toán lúc: {invoiceState.invoice.paidText}</Text>
                )}
              </>
            ) : !invoiceState.error ? (
              <Text style={styles.meta}>Chưa có hóa đơn.</Text>
            ) : null}
            {!!invoiceState.error && (
              <View style={styles.evidenceError}>
                <Text style={styles.meta}>{invoiceState.error}</Text>
                <TouchableOpacity
                  onPress={onRetryInvoice}
                  disabled={!invoiceState.canRetry}
                  accessibilityRole="button"
                  accessibilityLabel="Tải lại hóa đơn"
                  accessibilityState={{ disabled: !invoiceState.canRetry }}
                  style={styles.inlineRetryButton}
                >
                  <Text style={invoiceState.canRetry ? styles.retryText : styles.meta}>Tải lại hóa đơn</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
          {orderCancelEligible && (
            <View style={[styles.card, detailSectionStyle('cancel')]} testID="order-detail-section-cancel-12">
              {/* K09_B_CUSTOMER_ORDER_CANCEL */}
              <Text style={styles.sectionTitle}>Hủy đơn sửa chữa</Text>
              <Text style={styles.meta}>
                Chỉ áp dụng trước khi bắt đầu sửa chữa. Hệ thống quyết định trạng thái cuối;
                ứng dụng không tự áp phí hoặc bồi thường.
              </Text>
              {orderCancelState.needsVerify ? (
                <View style={styles.evidenceError}>
                  <Text style={styles.meta}>
                    Kết quả lần hủy trước chưa xác định. Không gửi lại.
                  </Text>
                  <TouchableOpacity
                    onPress={onOrderCancelReconcile}
                    disabled={orderCancelState.busy}
                    accessibilityRole="button"
                  >
                    <Text style={styles.retryText}>Kiểm tra trạng thái</Text>
                  </TouchableOpacity>
                </View>
              ) : orderCancelState.status === 'confirming' ? (
                <View style={styles.evidenceError}>
                  <Text style={styles.meta}>
                    Xác nhận hủy đơn sửa chữa này? Nếu trạng thái đã chuyển sang sửa chữa,
                    hệ thống sẽ từ chối và hướng dẫn liên hệ hỗ trợ.
                  </Text>
                  <View style={styles.decisionBtnRow}>
                    <TouchableOpacity
                      style={[styles.decisionBtn, { backgroundColor: colors.error }]}
                      onPress={onOrderCancelSubmit}
                      disabled={orderCancelState.busy}
                      accessibilityRole="button"
                    >
                      {orderCancelState.busy ? (
                        <ActivityIndicator size="small" color={colors.surface} />
                      ) : (
                        <Text style={styles.decisionBtnText}>Xác nhận hủy</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.decisionBtn, { backgroundColor: colors.divider }]}
                      onPress={onOrderCancelBack}
                      disabled={orderCancelState.busy}
                      accessibilityRole="button"
                    >
                      <Text style={[styles.decisionBtnText, { color: '#334155' }]}>
                        Giữ đơn
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <>
                  <TextInput
                    value={orderCancelState.reason}
                    onChangeText={onOrderCancelReason}
                    editable={!orderCancelState.busy}
                    maxLength={2000}
                    multiline
                    placeholder="Lý do hủy"
                    placeholderTextColor={colors.muted}
                    style={{
                      minHeight: 72,
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: 10,
                      padding: 12,
                      color: colors.text,
                      backgroundColor: colors.surface,
                      textAlignVertical: 'top',
                    }}
                    accessibilityLabel="Lý do hủy đơn sửa chữa"
                  />
                  <TouchableOpacity
                    style={[
                      styles.decisionBtn,
                      { backgroundColor: colors.error, alignSelf: 'flex-start' },
                    ]}
                    onPress={onOrderCancelRequest}
                    disabled={orderCancelState.busy}
                    accessibilityRole="button"
                  >
                    <Text style={styles.decisionBtnText}>Yêu cầu hủy đơn</Text>
                  </TouchableOpacity>
                </>
              )}
              {!!orderCancelState.error && (
                <Text style={[styles.meta, { color: '#B91C1C' }]}>
                  {orderCancelState.error}
                </Text>
              )}
            </View>
          )}

          {paymentEligible && (
            <View onLayout={markActionSection('pay')} style={[[styles.card, styles.paymentCard], detailSectionStyle('payment')]} testID="order-detail-section-payment-13">
              {/* K08_CUSTOMER_PAYMENT */}
              <View style={styles.paymentHeader}>
                <View style={styles.invoiceHeading}>
                  <Text style={styles.invoiceEyebrow}>THANH TOÁN</Text>
                  <Text style={styles.sectionTitle}>Thanh toán</Text>
                </View>
                <View style={[styles.statusChip, styles.statusChipInfo]}>
                  <Text style={[styles.statusChipText, styles.statusChipTextInfo]}>Bước riêng</Text>
                </View>
              </View>
              <Text style={styles.meta}>
                Công việc đã được nghiệm thu. Thanh toán là bước riêng; chỉ khi hệ thống xác nhận đã thanh toán hoặc hoàn thành thì mới được coi là thành công.
              </Text>

              {paymentState.loading ? (
                <Text style={styles.meta}>Đang kiểm tra thanh toán tiền mặt...</Text>
              ) : paymentState.settlement?.status === 'PENDING_CONFIRMATION' ? (
                <View style={styles.cashPendingPanel}>
                  <View
                    testID="cash-settlement-status"
                    accessible
                    accessibilityRole="text"
                    accessibilityLabel="Đối soát tiền mặt: Chờ khách xác nhận"
                    style={[styles.statusChip, styles.statusChipUnpaid]}
                  >
                    <Text style={[styles.statusChipText, styles.statusChipTextUnpaid]}>Chờ khách xác nhận</Text>
                  </View>
                  <Text style={styles.meta}>
                    Kỹ thuật viên khai báo đã nhận {paymentState.settlement.declaredAmount.toLocaleString('vi-VN')}đ tiền mặt. Hãy đối chiếu trước khi xác nhận.
                  </Text>
                  {!!paymentState.settlement.technicianNotes && (
                    <Text style={styles.meta}>Ghi chú kỹ thuật viên: {paymentState.settlement.technicianNotes}</Text>
                  )}
                  <View style={styles.decisionBtnRow}>
                    <TouchableOpacity
                      style={[styles.decisionBtn, { backgroundColor: colors.success }]}
                      onPress={onPaymentConfirmCash}
                      disabled={paymentState.cashBusy || paymentState.cashNeedsVerify}
                      accessibilityRole="button"
                      accessibilityLabel="Xác nhận đã trả tiền mặt"
                      accessibilityState={{ disabled: paymentState.cashBusy || paymentState.cashNeedsVerify, busy: paymentState.cashBusy }}
                    >
                      <Text style={styles.decisionBtnText}>Xác nhận đã trả</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.decisionBtn, { backgroundColor: colors.error }]}
                      onPress={onPaymentDisputeCash}
                      disabled={paymentState.cashBusy || paymentState.cashNeedsVerify}
                      accessibilityRole="button"
                      accessibilityLabel="Báo sai số tiền mặt"
                      accessibilityState={{ disabled: paymentState.cashBusy || paymentState.cashNeedsVerify, busy: paymentState.cashBusy }}
                    >
                      <Text style={styles.decisionBtnText}>Báo sai số tiền</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : paymentState.settlement?.status === 'DISPUTED' ? (
                <View style={styles.cashDisputedPanel}>
                  <View
                    testID="cash-settlement-status"
                    accessible
                    accessibilityRole="text"
                    accessibilityLabel="Đối soát tiền mặt: Đang tranh chấp"
                    style={[styles.statusChip, styles.statusChipDanger]}
                  >
                    <Text style={[styles.statusChipText, styles.statusChipTextDanger]}>Đang tranh chấp</Text>
                  </View>
                  <Text style={styles.meta}>
                    Đối soát tiền mặt đang tranh chấp và cần xử lý. Hóa đơn chưa được coi là đã thanh toán.
                  </Text>
                </View>
              ) : paymentState.settlement?.status === 'CONFIRMED' ? (
                <View style={styles.cashConfirmedPanel}>
                  <View
                    testID="cash-settlement-status"
                    accessible
                    accessibilityRole="text"
                    accessibilityLabel="Đối soát tiền mặt: Đã xác nhận"
                    style={[styles.statusChip, styles.statusChipPaid]}
                  >
                    <Text style={[styles.statusChipText, styles.statusChipTextPaid]}>Đã xác nhận đối soát</Text>
                  </View>
                  <Text style={styles.meta}>
                    Hệ thống đã xác nhận đối soát tiền mặt. Trạng thái hóa đơn được hiển thị riêng theo dữ liệu hệ thống.
                  </Text>
                </View>
              ) : (
                <Text style={styles.meta}>Chưa có khai báo tiền mặt từ kỹ thuật viên.</Text>
              )}

              {paymentState.cashNeedsVerify && (
                <View style={styles.paymentRecovery}>
                  <Text style={styles.meta}>
                    Chưa xác định được kết quả đối soát tiền mặt. Kiểm tra lại trạng thái trước khi tiếp tục.
                  </Text>
                  <TouchableOpacity
                    onPress={onPaymentCheckCash}
                    disabled={paymentState.cashBusy}
                    accessibilityRole="button"
                    accessibilityLabel="Kiểm tra đối soát tiền mặt"
                    accessibilityState={{ disabled: paymentState.cashBusy, busy: paymentState.cashBusy }}
                    style={styles.paymentSecondaryButton}
                  >
                    <Text style={styles.retryText}>Kiểm tra đối soát tiền mặt</Text>
                  </TouchableOpacity>
                </View>
              )}

              <View style={styles.paymentActions}>
                <TouchableOpacity
                  style={[styles.decisionBtn, styles.paymentPrimaryButton, { backgroundColor: colors.primaryStrong }]}
                  onPress={onPaymentVnpay}
                  disabled={paymentState.onlineBusy || paymentState.onlinePending}
                  accessibilityRole="button"
                  accessibilityLabel="Thanh toán qua VNPay"
                  accessibilityState={{ disabled: paymentState.onlineBusy || paymentState.onlinePending, busy: paymentState.onlineBusy }}
                >
                  {paymentState.onlineBusy ? (
                    <ActivityIndicator size="small" color={colors.surface} />
                  ) : (
                    <Text style={styles.decisionBtnText}>Thanh toán VNPay</Text>
                  )}
                </TouchableOpacity>
                {paymentState.onlinePending && (
                  <View style={styles.paymentRecovery}>
                    <View
                      testID="online-payment-status"
                      accessible
                      accessibilityRole="text"
                      accessibilityLabel="Trạng thái VNPay: Chờ hệ thống xác nhận"
                      style={[styles.statusChip, styles.statusChipInfo]}
                    >
                      <Text style={[styles.statusChipText, styles.statusChipTextInfo]}>Chờ hệ thống xác nhận</Text>
                    </View>
                    <Text style={styles.meta}>
                      Đã tạo hoặc mở một lần thanh toán VNPay. Quay lại ứng dụng không đồng nghĩa đã thanh toán thành công. Hãy kiểm tra trạng thái với hệ thống.
                    </Text>
                    <TouchableOpacity
                      onPress={onPaymentCheckOnline}
                      disabled={paymentState.onlineBusy}
                      accessibilityRole="button"
                      accessibilityLabel="Kiểm tra trạng thái thanh toán"
                      accessibilityState={{ disabled: paymentState.onlineBusy, busy: paymentState.onlineBusy }}
                      style={styles.paymentSecondaryButton}
                    >
                      <Text style={styles.retryText}>Kiểm tra trạng thái thanh toán</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {!!paymentState.error && (
                <Text style={[styles.meta, { color: '#B91C1C' }]}>{paymentState.error}</Text>
              )}
            </View>
          )}
          {reviewEligible && (
            <View onLayout={markActionSection('review')} style={[styles.card, detailSectionStyle('review')]} testID="order-detail-section-review-14">
              {/* K09_A_SERVER_REVIEW */}
              <Text style={styles.sectionTitle}>Đánh giá dịch vụ</Text>
              {reviewState.loading && !reviewState.review ? (
                <Text style={styles.meta}>Đang kiểm tra đánh giá hiện có...</Text>
              ) : reviewState.review ? (
                <>
                  <Text style={[styles.meta, { fontWeight: '700', color: '#047857' }]}>
                    Đã đánh giá {reviewState.review.rating}/5 sao
                  </Text>
                  {!!reviewState.review.comment && (
                    <Text style={styles.meta}>{reviewState.review.comment}</Text>
                  )}
                  {!!reviewState.review.createdAt && (
                    <Text style={styles.meta}>
                      Gửi lúc: {vnDateTimeString(reviewState.review.createdAt)}
                    </Text>
                  )}
                </>
              ) : reviewState.needsVerify ? (
                <View style={styles.evidenceError}>
                  <Text style={styles.meta}>
                    Kết quả gửi đánh giá trước chưa xác định. Không gửi lại.
                  </Text>
                  <TouchableOpacity
                    onPress={onReviewReconcile}
                    disabled={reviewState.busy}
                    accessibilityRole="button"
                  >
                    <Text style={styles.retryText}>
                      {reviewState.busy ? 'Đang kiểm tra...' : 'Kiểm tra đánh giá'}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <Text style={styles.meta}>
                    Chỉ đơn đã hoàn thành thật mới được đánh giá. Mỗi đơn sửa chữa chỉ có một đánh giá.
                  </Text>
                  <View style={[styles.decisionBtnRow, { flexWrap: 'wrap' }]}>
                    {[1, 2, 3, 4, 5].map((rating) => (
                      <TouchableOpacity
                        key={rating}
                        onPress={() => onReviewRating(rating)}
                        disabled={reviewState.busy}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: reviewState.rating === rating }}
                        accessibilityLabel={String(rating) + ' sao'}
                        style={[
                          styles.decisionBtn,
                          {
                            minWidth: 48,
                            backgroundColor:
                              reviewState.rating === rating ? '#F59E0B' : colors.divider,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.decisionBtnText,
                            { color: reviewState.rating === rating ? colors.surface : '#334155' },
                          ]}
                        >
                          {rating}★
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TextInput
                    value={reviewState.comment}
                    onChangeText={onReviewComment}
                    editable={!reviewState.busy}
                    maxLength={2000}
                    multiline
                    placeholder="Nhận xét thêm (không bắt buộc)"
                    placeholderTextColor={colors.muted}
                    style={{
                      minHeight: 88,
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: 10,
                      padding: 12,
                      color: colors.text,
                      backgroundColor: colors.surface,
                      textAlignVertical: 'top',
                    }}
                    accessibilityLabel="Nhận xét đánh giá dịch vụ"
                  />
                  <TouchableOpacity
                    style={[styles.decisionBtn, { backgroundColor: colors.primaryStrong, alignSelf: 'flex-start' }]}
                    onPress={onReviewSubmit}
                    disabled={reviewState.busy}
                    accessibilityRole="button"
                    accessibilityLabel="Gửi đánh giá dịch vụ"
                  >
                    {reviewState.busy ? (
                      <ActivityIndicator size="small" color={colors.surface} />
                    ) : (
                      <Text style={styles.decisionBtnText}>Gửi đánh giá</Text>
                    )}
                  </TouchableOpacity>
                </>
              )}
              {!!reviewState.error && (
                <Text style={[styles.meta, { color: '#B91C1C' }]}>
                  {reviewState.error}
                </Text>
              )}
            </View>
          )}

          <View onLayout={markActionSection('decide_cost')} style={[styles.card, detailSectionStyle('cost')]} testID="order-detail-section-cost-15">
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
                            style={[styles.decisionBtn, { backgroundColor: costDecisionState.confirming.kind === 'approve' ? colors.success : colors.error }]}
                            onPress={onCostDecideSubmit}
                            disabled={costDecisionState.busy}
                            accessibilityRole="button"
                            accessibilityLabel={costDecisionState.confirming.kind === 'approve' ? 'Xác nhận duyệt chi phí' : 'Xác nhận từ chối chi phí'}
                          >
                            {costDecisionState.busy ? (
                              <ActivityIndicator size="small" color={colors.surface} />
                            ) : (
                              <Text style={styles.decisionBtnText}>
                                {costDecisionState.confirming.kind === 'approve' ? 'Xác nhận duyệt' : 'Xác nhận từ chối'}
                              </Text>
                            )}
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.decisionBtn, { backgroundColor: colors.divider }]}
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
                          style={[styles.decisionBtn, { backgroundColor: colors.success }]}
                          onPress={() => onCostDecideApprove(request.id)}
                          disabled={costDecisionState.busy || costDecisionState.needsVerify}
                          accessibilityRole="button"
                          accessibilityLabel="Duyệt chi phí phát sinh"
                        >
                          <Text style={styles.decisionBtnText}>Duyệt</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.decisionBtn, { backgroundColor: colors.error }]}
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
                <TouchableOpacity
                  onPress={onRetryCosts}
                  disabled={!costsState.canRetry}
                  accessibilityRole="button"
                  accessibilityLabel="Tải lại danh sách chi phí phát sinh"
                  accessibilityState={{ disabled: !costsState.canRetry }}
                  style={styles.inlineRetryButton}
                >
                  <Text style={costsState.canRetry ? styles.retryText : styles.meta}>Tải lại chi phí</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          <View style={detailSectionStyle('support')}>
            <CustomerSupportCasesSection
            orderId={serviceOrderId}
            orderStatus={order.status}
            completedAt={order.completedAt ?? null}
          />
          </View>
          <TouchableOpacity testID="order-detail-expand-all" accessibilityRole="button" accessibilityLabel="Xem toàn bộ chi tiết"
            style={[styles.actionPrimaryButton, { borderWidth: 1, borderColor: colors.primaryStrong, backgroundColor: colors.surface }]}
            onPress={() => setProgressVisible(true)}>
            <Text style={[styles.actionPrimaryButtonText, { color: colors.primaryStrong }]}>Xem toàn bộ chi tiết</Text>
          </TouchableOpacity>
        </ScrollView>
        <View style={styles.stickyFooter} testID="customer-sticky-footer">
          <Text style={styles.footerReason}>{orderSummaryAction?.title ?? 'Trạng thái đơn được cập nhật từ hệ thống'}</Text>
          <TouchableOpacity style={[styles.footerButton, { backgroundColor: colors.primaryStrong }]} onPress={onCustomerFooterAction} accessibilityRole="button" accessibilityLabel={orderSummaryAction ? orderNextActionButtonLabel(orderSummaryAction.kind) ?? 'Cập nhật trạng thái' : 'Cập nhật trạng thái'} accessibilityState={{ disabled: refreshing, busy: refreshing }} disabled={refreshing}>
            <Text style={styles.footerButtonText}>{orderSummaryAction ? orderNextActionButtonLabel(orderSummaryAction.kind) ?? 'Cập nhật trạng thái' : 'Cập nhật trạng thái'}</Text>
          </TouchableOpacity>
        </View>
        <Modal visible={progressVisible} transparent animationType="slide" onRequestClose={() => setProgressVisible(false)} accessibilityViewIsModal>
          <View style={styles.progressBackdrop}><View style={styles.progressSheet}>
            <Text style={styles.sectionTitle}>Tiến độ đơn sửa chữa</Text>
            <CustomerOrderTimeline key={serviceOrderId} steps={customerOrderTimeline(order, orderSummaryAction?.kind)} onOpenSection={() => undefined} actionLabel={null} actionTitle={orderSummaryAction?.title} onAction={() => undefined} />
            <ScrollView style={styles.progressSections} keyboardShouldPersistTaps="handled">{([
              ['overview', 'Thông tin đơn'], ['technician', 'Kỹ thuật viên'], ['quote', 'Báo giá'], ['cost', 'Chi phí phát sinh'], ['evidence', 'Ảnh bằng chứng'], ['completion', 'Nghiệm thu'], ['payment', 'Thanh toán'], ['review', 'Đánh giá'], ['warranty', 'Bảo hành'], ['cancel', 'Hủy đơn'], ['support', 'Hỗ trợ'],
            ] as [OrderDetailSection, string][]).map(([section, label]) => <TouchableOpacity key={section} style={styles.progressSectionButton} accessibilityRole="button" accessibilityLabel={`Mở ${label}`} onPress={() => { setProgressVisible(false); openDetailSection(section); }}><Text style={styles.retryText}>{label}</Text></TouchableOpacity>)}</ScrollView>
            <TouchableOpacity style={styles.progressClose} accessibilityRole="button" accessibilityLabel="Đóng tiến độ" onPress={() => setProgressVisible(false)}><Text style={styles.retryText}>Đóng</Text></TouchableOpacity>
          </View></View>
        </Modal>
        <Modal
          visible={!!selectedEvidencePhoto}
          transparent
          animationType="fade"
          onRequestClose={() => setSelectedEvidencePhotoId(null)}
          accessibilityViewIsModal
        >
          <View style={styles.evidenceViewerBackdrop}>
            <TouchableOpacity
              onPress={() => setSelectedEvidencePhotoId(null)}
              style={styles.evidenceViewerClose}
              accessibilityRole="button"
              accessibilityLabel="Đóng ảnh"
              accessibilityHint="Đóng ảnh bằng chứng đang phóng to"
            >
              <Ionicons name="close" size={24} color={colors.surface} />
            </TouchableOpacity>
            {!!selectedEvidencePhoto && (
              <>
                <Text style={styles.evidenceViewerTitle}>
                  {evidenceTypeLabel(selectedEvidencePhoto.type)}
                </Text>
                <Image
                  source={{ uri: selectedEvidencePhoto.uri }}
                  style={styles.evidenceViewerImage}
                  resizeMode="contain"
                  accessibilityLabel={`Ảnh phóng to ${evidenceTypeLabel(selectedEvidencePhoto.type)}`}
                />
              </>
            )}
          </View>
        </Modal>
        </>
      )}
    </SafeAreaView>
  );
}

const getStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  stickyFooter: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8, gap: 6, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  footerReason: { fontSize: 12, lineHeight: 18, color: colors.textSecondary },
  footerButton: { minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  footerButtonText: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.surface },
  progressLink: { minHeight: 44, justifyContent: 'center', alignItems: 'flex-start', paddingHorizontal: 12 },
  progressBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15, 23, 42, 0.35)' },
  progressSheet: { maxHeight: '85%', padding: 16, gap: 8, backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  progressClose: { minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  progressSections: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  progressSectionButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 10, backgroundColor: colors.primarySoft },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
    color: colors.text,
  },
  headerBackBtn: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  headerSpacer: {
    width: 44,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 72,
    gap: 12,
    flexGrow: 1,
  },
  loadingState: {
    flex: 1,
  },
  loadingText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 18,
    lineHeight: 26,
    fontWeight: '700',
    color: colors.text,
    marginTop: 16,
  },
  emptyDesc: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  retryBtn: {
    minHeight: 48,
    minWidth: 116,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  inlineRetryButton: { minHeight: 44, minWidth: 88, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, alignSelf: 'center' },
  retryText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
  },
  errorBanner: {
    padding: 16,
    gap: 8,
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 14,
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
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 6,
  },
  badgeText: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
  },
  title: {
    fontSize: 17,
    lineHeight: 25,
    fontWeight: '800',
    color: colors.text,
  },
  actionSummaryTitle: {
    fontSize: 18,
    lineHeight: 25,
    fontWeight: '800',
    color: colors.text,
  },
  actionSummaryDetail: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  actionPrimaryButton: {
    alignSelf: 'flex-start',
    minHeight: 48,
    marginTop: 4,
    paddingHorizontal: 16,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  actionPrimaryButtonText: {
    color: colors.surface,
    fontSize: 13,
    fontWeight: '800',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  meta: {
    fontSize: 13,
    lineHeight: 20,
    flexShrink: 1,
    color: colors.textSecondary,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 12,
  },
  timelineRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.divider },
  timelineTitle: { flexGrow: 1, flexShrink: 1, minWidth: 130, fontSize: 13, lineHeight: 20, color: colors.text, fontWeight: '600' },
  timelineTime: { fontSize: 12, lineHeight: 18, color: colors.textSecondary, flexShrink: 0 },
  decisionBtnRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  decisionBtn: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
  },
  decisionBtnText: {
    color: colors.surface,
    fontSize: 13,
    fontWeight: '700',
  },
  evidenceItem: {
    gap: 8,
    marginTop: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.background,
  },
  evidenceTypeTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
  },
  evidenceThumb: {
    width: '100%',
    height: 260,
    borderRadius: 10,
    backgroundColor: colors.divider,
  },
  evidencePhotoButton: { width: '100%', borderRadius: 10, overflow: 'hidden' },
  evidenceViewerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(8, 12, 20, 0.96)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  evidenceViewerClose: {
    position: 'absolute',
    top: 36,
    right: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
  },
  evidenceViewerTitle: {
    position: 'absolute',
    top: 48,
    left: 18,
    right: 74,
    color: colors.surface,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
  },
  evidenceViewerImage: { width: '100%', height: '78%' },
  evidencePlaceholder: {
    height: 120,
    borderRadius: 12,
    backgroundColor: colors.divider,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
  },
  evidenceError: {
    gap: 8,
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
    padding: 16,
  },
  invoiceCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    padding: 16,
    gap: 12,
  },
  invoiceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  paymentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  invoiceHeading: {
    flexShrink: 1,
    gap: 2,
  },
  invoiceEyebrow: {
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.8,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  invoiceLines: {
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingTop: 12,
    gap: 8,
  },
  invoiceRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  invoiceItemLabel: {
    flex: 1,
    minWidth: 120,
    flexShrink: 1,
    fontSize: 13,
    lineHeight: 20,
    color: colors.text,
  },
  invoiceItemValue: {
    flexShrink: 1,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  invoiceTotalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: 2,
    paddingTop: 12,
  },
  invoiceUnknownTotal: {
    paddingVertical: 8,
    fontSize: 13,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  statusChip: {
    alignSelf: 'flex-start',
    minHeight: 28,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 99,
  },
  statusChipText: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
  },
  statusChipPaid: { backgroundColor: colors.tone.success.bg },
  statusChipTextPaid: { color: colors.tone.success.text },
  statusChipUnpaid: { backgroundColor: colors.tone.warning.bg },
  statusChipTextUnpaid: { color: colors.tone.warning.text },
  statusChipDanger: { backgroundColor: colors.tone.danger.bg },
  statusChipTextDanger: { color: colors.tone.danger.text },
  statusChipInfo: { backgroundColor: colors.tone.info.bg },
  statusChipTextInfo: { color: colors.tone.info.text },
  statusChipUnknown: { backgroundColor: colors.tone.neutral.bg },
  statusChipTextUnknown: { color: colors.tone.neutral.text },
  paymentCard: {
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  cashPendingPanel: {
    gap: 8,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.tone.warning.bg,
    backgroundColor: colors.tone.warning.bg,
  },
  cashDisputedPanel: {
    gap: 8,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.tone.danger.bg,
    backgroundColor: colors.tone.danger.bg,
  },
  cashConfirmedPanel: {
    gap: 8,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.tone.success.bg,
    backgroundColor: colors.tone.success.bg,
  },
  paymentActions: {
    gap: 8,
    marginTop: 2,
  },
  paymentPrimaryButton: {
    flex: 0,
    alignSelf: 'stretch',
    minHeight: 48,
    borderRadius: 12,
    paddingHorizontal: 16,
  },
  paymentRecovery: {
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  paymentSecondaryButton: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: colors.primarySoft,
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
