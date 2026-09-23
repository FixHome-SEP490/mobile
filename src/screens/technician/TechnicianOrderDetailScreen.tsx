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
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../types';
import { useAppTheme } from '../../constants/theme';
import { useAuthStore } from '../../store/auth.store';
import * as ImagePicker from 'expo-image-picker';
import { ordersApi, type CanonicalOrderStatus, type ServiceOrderItem } from '../../api/orders.api';
import { technicianJobsUserId } from './technician-jobs-loader';
import {
  quotationItemsList,
  resolveOrderDetailSections,
  writeDetailWithMirror,
} from '../customer/customer-order-detail';
import { createOrderEvidenceController, evidenceTypeLabel, initialEvidenceState } from '../customer/order-evidence';
import { createOrderInvoiceController, initialInvoiceState, invoicePaymentLabel } from '../customer/order-invoice';
import {
  additionalCostStatusLabel,
  createAdditionalCostsController,
  initialAdditionalCostsState,
} from '../customer/order-additional-costs';
import {
  createCostProposalController,
  initialCostProposalState,
} from './technician-additional-cost-create';
import {
  createEvidenceUploadController,
  initialUploadState,
  type PickerPermission,
} from './technician-evidence-upload';
import {
  createAfterEvidenceUploadController,
  initialAfterUploadState,
} from './technician-after-evidence-upload';
import {
  createQuotationCreateController,
  initialQuoteState,
} from './technician-quotation-create';
import {
  createStartRepairController,
  describeStartRepairBlockers,
  initialStartRepairState,
  startRepairTarget,
  START_REPAIR_CONFIRM_COPY,
} from './technician-start-repair';
import {
  createRequestCompletionController,
  describeCompletionBlockers,
  initialRequestCompletionState,
  requestCompletionTarget,
  REQUEST_COMPLETION_CONFIRM_COPY,
} from './technician-request-completion';
import { createTechOrderDetailLoader } from './technician-order-detail';

type DetailRoute = RouteProp<RootStackParamList, 'TechnicianOrderDetail'>;

function amountOrNull(value: unknown): string | null {
  return typeof value === 'number' ? `${value.toLocaleString('vi-VN')}đ` : null;
}

export default function TechnicianOrderDetailScreen() {
  const { colors } = useAppTheme();
  const styles = getStyles(colors);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<DetailRoute>();
  const serviceOrderId = route.params.serviceOrderId;
  const [detailState, setDetailState] = useState({
    order: null as ServiceOrderItem | null,
    loading: true,
    refreshing: false,
    error: null as string | null,
  });
  const { order, loading, refreshing, error } = detailState;
  const [evidenceState, setEvidenceState] = useState(initialEvidenceState);
  const [costsState, setCostsState] = useState(initialAdditionalCostsState);
  const [proposalState, setProposalState] = useState(initialCostProposalState);
  const [invoiceState, setInvoiceState] = useState(initialInvoiceState);
  const [uploadState, setUploadState] = useState(initialUploadState);
  const [afterUploadState, setAfterUploadState] = useState(initialAfterUploadState);
  const [quoteState, setQuoteState] = useState(initialQuoteState);
  const [startRepairState, setStartRepairState] = useState(initialStartRepairState);
  const [completionState, setCompletionState] = useState(initialRequestCompletionState);
  const focusAliveRef = useRef(false);
  const latestRef = useRef({ order, serviceOrderId });
  useEffect(() => {
    // Backstop only: every loader publish already mirrors synchronously via
    // writeDetailWithMirror below, so this writes identical values and can
    // never roll a verified ref back to a stale order.
    latestRef.current = { order, serviceOrderId };
  });
  const loaderRef = useRef<ReturnType<typeof createTechOrderDetailLoader> | null>(null);
  useEffect(() => {
    // Remediation: the loader write mirrors the fetched order into latestRef
    // in the SAME TICK, before React commits — a verified GET can never
    // unlock against a stale pre-commit order. Effect-created so no ref is
    // read during render.
    loaderRef.current = createTechOrderDetailLoader(
      ordersApi.getOrder,
      writeDetailWithMirror(latestRef, serviceOrderId, setDetailState),
      {
        getUserId: () => technicianJobsUserId(useAuthStore.getState()),
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
  // P3B12 duplicate guard reads the latest costs statuses without touching
  // refs during render. Mirrored synchronously on every costs write — a fresh
  // GET with a new PENDING blocks a duplicate proposal in the same tick,
  // without waiting for the effect below or a re-render — with the effect as
  // a backstop. Created in an effect so no ref is read during render.
  const costStatusesRef = useRef<string[]>([]);
  const costsRef = useRef<ReturnType<typeof createAdditionalCostsController> | null>(null);
  useEffect(() => {
    costsRef.current = createAdditionalCostsController(ordersApi.getAdditionalCosts, (state) => {
      costStatusesRef.current = state.requests.map((request) => request.status);
      setCostsState(state);
    });
    return () => {
      costsRef.current = null;
    };
  }, []);
  useEffect(() => {
    costStatusesRef.current = costsState.requests.map((request) => request.status);
  }, [costsState.requests]);
  // P3B12 cost proposal form: same effect pattern, no ref read during render.
  const proposalRef = useRef<ReturnType<typeof createCostProposalController> | null>(null);
  useEffect(() => {
    const detailLoader = loaderRef.current;
    if (!detailLoader) return;
    proposalRef.current = createCostProposalController(
      {
        getOrder: () => {
          const latest = latestRef.current;
          if (!latest.order || latest.order.id !== latest.serviceOrderId) return null;
          return {
            id: latest.order.id,
            status: latest.order.status,
            completionRequestedAt: latest.order.completionRequestedAt,
            historical: latest.order.historical,
          };
        },
        getTechnicianId: () => technicianJobsUserId(useAuthStore.getState()),
        isFocused: () => focusAliveRef.current,
        getCostStatuses: () => costStatusesRef.current,
        createProposal: (id, payload) => ordersApi.createAdditionalCostProposal(id, payload),
        refreshCosts: async () => {
          const latest = latestRef.current;
          if (latest.order && latest.order.id === latest.serviceOrderId) {
            const target = latest.order.id;
            await costsRef.current?.refreshCosts(() => isEvidenceReadable(target));
          }
          await loaderRef.current?.refresh();
        },
        onAccessDenied: () => { void loaderRef.current?.refresh(true); },
        notify: (title, message) => Alert.alert(title, message),
      },
      setProposalState,
    );
    return () => {
      proposalRef.current = null;
    };
  }, []);
  // P3B5 BEFORE upload controller: created in an effect so no ref is read
  // during render. Adapts Expo camera/gallery + order/session state; every
  // guard lives in the production controller.
  const uploadRef = useRef<ReturnType<typeof createEvidenceUploadController> | null>(null);
  useEffect(() => {
    const detailLoader = loaderRef.current;
    const evidence = evidenceRef.current;
    if (!detailLoader || !evidence) return;
    uploadRef.current = createEvidenceUploadController(
      {
        getOrder: () => {
          const latest = latestRef.current;
          if (!latest.order || latest.order.id !== latest.serviceOrderId) return null;
          return {
            id: latest.order.id,
            status: latest.order.status,
            arrivalVerified: latest.order.arrivalVerified,
            historical: latest.order.historical,
          };
        },
        getTechnicianId: () => technicianJobsUserId(useAuthStore.getState()),
        isFocused: () => focusAliveRef.current,
        requestPermission: async (source): Promise<PickerPermission> => {
          try {
            const response = source === 'camera'
              ? await ImagePicker.requestCameraPermissionsAsync()
              : await ImagePicker.requestMediaLibraryPermissionsAsync();
            return response.granted === true ? 'granted' : 'denied';
          } catch {
            return 'unavailable';
          }
        },
        launchPicker: async (source) => {
          const result = source === 'camera'
            ? await ImagePicker.launchCameraAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              quality: 0.8,
            })
            : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              quality: 0.8,
            });
          if (result.canceled) return { canceled: true };
          const asset = result.assets[0];
          return {
            canceled: false,
            asset: { uri: asset.uri, mimeType: asset.mimeType, fileSize: asset.fileSize },
          };
        },
        uploadBefore: (id, image) => ordersApi.uploadEvidenceBefore(id, image),
        refreshEvidence: async () => {
          const latest = latestRef.current;
          if (latest.order && latest.order.id === latest.serviceOrderId) {
            const target = latest.order.id;
            await evidenceRef.current?.refreshEvidence(() => isEvidenceReadable(target));
          }
          await loaderRef.current?.refresh();
        },
        onAccessDenied: () => { void loaderRef.current?.refresh(true); },
        notify: (title, message) => Alert.alert(title, message),
      },
      setUploadState,
    );
    return () => {
      uploadRef.current = null;
    };
  }, []);
  // P3B10 AFTER upload controller: separate state/controller from the BEFORE
  // lane (which is untouched). Same effect pattern, no ref read during render.
  const afterUploadRef = useRef<ReturnType<typeof createAfterEvidenceUploadController> | null>(null);
  useEffect(() => {
    const detailLoader = loaderRef.current;
    const evidence = evidenceRef.current;
    if (!detailLoader || !evidence) return;
    afterUploadRef.current = createAfterEvidenceUploadController(
      {
        getOrder: () => {
          const latest = latestRef.current;
          if (!latest.order || latest.order.id !== latest.serviceOrderId) return null;
          return {
            id: latest.order.id,
            status: latest.order.status,
            completionRequestedAt: latest.order.completionRequestedAt,
            historical: latest.order.historical,
          };
        },
        getTechnicianId: () => technicianJobsUserId(useAuthStore.getState()),
        isFocused: () => focusAliveRef.current,
        requestPermission: async (source): Promise<PickerPermission> => {
          try {
            const response = source === 'camera'
              ? await ImagePicker.requestCameraPermissionsAsync()
              : await ImagePicker.requestMediaLibraryPermissionsAsync();
            return response.granted === true ? 'granted' : 'denied';
          } catch {
            return 'unavailable';
          }
        },
        launchPicker: async (source) => {
          const result = source === 'camera'
            ? await ImagePicker.launchCameraAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              quality: 0.8,
            })
            : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              quality: 0.8,
            });
          if (result.canceled) return { canceled: true };
          const asset = result.assets[0];
          return {
            canceled: false,
            asset: { uri: asset.uri, mimeType: asset.mimeType, fileSize: asset.fileSize },
          };
        },
        uploadAfter: (id, image) => ordersApi.uploadEvidenceAfter(id, image),
        refreshEvidence: async () => {
          const latest = latestRef.current;
          if (latest.order && latest.order.id === latest.serviceOrderId) {
            const target = latest.order.id;
            await evidenceRef.current?.refreshEvidence(() => isEvidenceReadable(target));
          }
          await loaderRef.current?.refresh();
        },
        onAccessDenied: () => { void loaderRef.current?.refresh(true); },
        notify: (title, message) => Alert.alert(title, message),
      },
      setAfterUploadState,
    );
    return () => {
      afterUploadRef.current = null;
    };
  }, []);
  // P3B6 labor-only quotation create: same effect pattern, no ref read during
  // render. Every gate/validation lives in the production controller.
  const quoteRef = useRef<ReturnType<typeof createQuotationCreateController> | null>(null);
  useEffect(() => {
    const detailLoader = loaderRef.current;
    if (!detailLoader) return;
    quoteRef.current = createQuotationCreateController(
      {
        getOrder: () => {
          const latest = latestRef.current;
          if (!latest.order || latest.order.id !== latest.serviceOrderId) return null;
          return {
            id: latest.order.id,
            status: latest.order.status,
            arrivalVerified: latest.order.arrivalVerified,
            historical: latest.order.historical,
            pricingMode: latest.order.pricingMode,
            quotationStatus: latest.order.quotation ? latest.order.quotation.status : null,
          };
        },
        getTechnicianId: () => technicianJobsUserId(useAuthStore.getState()),
        isFocused: () => focusAliveRef.current,
        createQuotation: (id, payload) => ordersApi.createQuotation(id, payload),
        refreshDetail: async () => {
          await loaderRef.current?.refresh(true);
        },
        onAccessDenied: () => { void loaderRef.current?.refresh(true); },
        notify: (title, message) => Alert.alert(title, message),
      },
      setQuoteState,
    );
    return () => {
      quoteRef.current = null;
    };
  }, []);
  // P3B9 start-repair mutation: same effect pattern, no ref read during
  // render. Reuses the existing startRepair POST; every gate lives in the
  // production controller.
  const startRepairRef = useRef<ReturnType<typeof createStartRepairController> | null>(null);
  useEffect(() => {
    const detailLoader = loaderRef.current;
    if (!detailLoader) return;
    startRepairRef.current = createStartRepairController(
      {
        getOrder: () => {
          const latest = latestRef.current;
          if (!latest.order || latest.order.id !== latest.serviceOrderId) return null;
          return {
            id: latest.order.id,
            status: latest.order.status,
            arrivalVerified: latest.order.arrivalVerified,
            historical: latest.order.historical,
            pricingMode: latest.order.pricingMode,
            fixedUnitPrice: latest.order.fixedUnitPrice,
            beforeEvidenceCount: latest.order.beforeEvidenceCount,
            quotationStatus: latest.order.quotation ? latest.order.quotation.status : null,
          };
        },
        getTechnicianId: () => technicianJobsUserId(useAuthStore.getState()),
        isFocused: () => focusAliveRef.current,
        startRepair: (id) => ordersApi.startRepair(id),
        refreshDetail: async () => {
          await loaderRef.current?.refresh(true);
          const latest = latestRef.current;
          if (latest.order && latest.order.id === latest.serviceOrderId) {
            const target = latest.order.id;
            await evidenceRef.current?.refreshEvidence(() => isEvidenceReadable(target));
            await invoiceRef.current?.refreshInvoice(() => isEvidenceReadable(target));
          }
        },
        onAccessDenied: () => { void loaderRef.current?.refresh(true); },
        notify: (title, message) => Alert.alert(title, message),
      },
      setStartRepairState,
    );
    return () => {
      startRepairRef.current = null;
    };
  }, []);
  // Request-completion: same effect pattern, no ref read during render.
  // Reuses the existing requestCompletion POST; every gate lives in the
  // production controller. Dev/test orders only in this slice.
  const completionRef = useRef<ReturnType<typeof createRequestCompletionController> | null>(null);
  useEffect(() => {
    const detailLoader = loaderRef.current;
    if (!detailLoader) return;
    completionRef.current = createRequestCompletionController(
      {
        getOrder: () => {
          const latest = latestRef.current;
          if (!latest.order || latest.order.id !== latest.serviceOrderId) return null;
          return {
            id: latest.order.id,
            status: latest.order.status,
            completionRequestedAt: latest.order.completionRequestedAt,
            historical: latest.order.historical,
            afterEvidenceCount: latest.order.afterEvidenceCount,
            pricingMode: latest.order.pricingMode,
            quotationStatus: latest.order.quotation ? latest.order.quotation.status : null,
            hasPendingCosts: costStatusesRef.current.some(
              (status) => String(status ?? '').toUpperCase() === 'PENDING_APPROVAL',
            ),
          };
        },
        getTechnicianId: () => technicianJobsUserId(useAuthStore.getState()),
        isFocused: () => focusAliveRef.current,
        isDevBuild: () => __DEV__,
        requestCompletion: (id) => ordersApi.requestCompletion(id),
        refreshDetail: async () => {
          await loaderRef.current?.refresh(true);
          const latest = latestRef.current;
          if (latest.order && latest.order.id === latest.serviceOrderId) {
            const target = latest.order.id;
            await evidenceRef.current?.refreshEvidence(() => isEvidenceReadable(target));
            await invoiceRef.current?.refreshInvoice(() => isEvidenceReadable(target));
          }
        },
        onAccessDenied: () => { void loaderRef.current?.refresh(true); },
        notify: (title, message) => Alert.alert(title, message),
      },
      setCompletionState,
    );
    return () => {
      completionRef.current = null;
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
      proposalRef.current?.reset();
      uploadRef.current?.discard();
      afterUploadRef.current?.discard();
      quoteRef.current?.reset();
      startRepairRef.current?.reset();
      completionRef.current?.reset();
    };
  }, [serviceOrderId]));
  const isEvidenceReadable = (target: string) => {
    const latest = latestRef.current;
    return !!latest.order && latest.order.id === target && latest.order.id === latest.serviceOrderId;
  };
  // READ-ONLY evidence follows the authorized active detail only: suppressed
  // historical summaries (order null) never trigger an evidence GET.
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

  // S2 READ-ONLY invoice for the active assignment only: suppressed
  // historical summaries (order null) never trigger an invoice GET.
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

  // P3B11 GET-only additional costs for the active assignment only:
  // suppressed historical summaries (order null) never trigger a GET.
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

  // P3B12: the cost proposal draft belongs to one focused order.
  useEffect(() => {
    if (!order || order.id !== serviceOrderId) proposalRef.current?.reset();
  }, [order, serviceOrderId]);

  // P3B5: a pending BEFORE selection belongs to one focused order — drop it
  // as soon as the detail is denied, cleared, or retargeted.
  useEffect(() => {
    if (!order || order.id !== serviceOrderId) uploadRef.current?.discard();
  }, [order, serviceOrderId]);

  // P3B10: same lifecycle for the AFTER selection, independent of BEFORE.
  useEffect(() => {
    if (!order || order.id !== serviceOrderId) afterUploadRef.current?.discard();
  }, [order, serviceOrderId]);

  // P3B6: the quote draft belongs to one focused order for one session.
  useEffect(() => {
    if (!order || order.id !== serviceOrderId) quoteRef.current?.reset();
  }, [order, serviceOrderId]);

  // P3B9: the start-repair confirmation belongs to one focused order.
  useEffect(() => {
    if (!order || order.id !== serviceOrderId) startRepairRef.current?.reset();
  }, [order, serviceOrderId]);

  // Request-completion: the confirmation belongs to one focused order.
  useEffect(() => {
    if (!order || order.id !== serviceOrderId) completionRef.current?.reset();
  }, [order, serviceOrderId]);

  const onPickCamera = () => { void uploadRef.current?.pickFromCamera(); };
  const onPickGallery = () => { void uploadRef.current?.pickFromGallery(); };
  const onUploadBefore = () => { void uploadRef.current?.upload(); };
  const onDiscardUpload = () => { uploadRef.current?.discard(); };
  const onPickAfterCamera = () => { void afterUploadRef.current?.pickFromCamera(); };
  const onPickAfterGallery = () => { void afterUploadRef.current?.pickFromGallery(); };
  const onUploadAfter = () => { void afterUploadRef.current?.upload(); };
  const onDiscardAfterUpload = () => { afterUploadRef.current?.discard(); };
  const onQuoteField = {
    note: (value: string) => { quoteRef.current?.setNote(value); },
  };
  const onQuoteAddLabor = () => { quoteRef.current?.addRow('labor'); };
  const onQuoteAddPart = () => { quoteRef.current?.addRow('part'); };
  const onQuoteRemoveRow = (key: string) => { quoteRef.current?.removeRow(key); };
  const onQuoteConfirm = () => { quoteRef.current?.requestConfirm(); };
  const onQuoteCancelConfirm = () => { quoteRef.current?.cancelConfirm(); };
  const onQuoteSubmit = () => { void quoteRef.current?.submit(); };
  const onStartRepairConfirm = () => { startRepairRef.current?.requestConfirm(); };
  const onStartRepairCancel = () => { startRepairRef.current?.cancelConfirm(); };
  const onStartRepairSubmit = () => { void startRepairRef.current?.submit(); };
  const onCompletionConfirm = () => { completionRef.current?.requestConfirm(); };
  const onCompletionCancel = () => { completionRef.current?.cancelConfirm(); };
  const onCompletionSubmit = () => { void completionRef.current?.submit(); };

  const onRefresh = () => {
    void (async () => {
      // Remediation: single forced detail GET with a verified freshness
      // receipt (replaces the old blind refresh). The ambiguous quote and
      // start-repair locks release ONLY on a fresh successful authorized GET.
      const detailFresh = await loaderRef.current?.refreshVerified();
      const latest = latestRef.current;
      if (latest.order && latest.order.id === latest.serviceOrderId) {
        const target = latest.order.id;
        await evidenceRef.current?.refreshEvidence(() => isEvidenceReadable(target));
        await invoiceRef.current?.refreshInvoice(() => isEvidenceReadable(target));
        const costsFresh = await costsRef.current?.refreshCosts(() => isEvidenceReadable(target));
        // P3B12 remediation: release the ambiguous-proposal lock ONLY after a
        // fresh authorized costs GET succeeded for the still-current order,
        // technician, and focus. Failed/stale/denied GETs keep the lock, so a
        // second non-idempotent proposal POST is impossible until reconciled.
        const releast = latestRef.current;
        const sameSession =
          focusAliveRef.current &&
          !!technicianJobsUserId(useAuthStore.getState()) &&
          !!releast.order &&
          releast.order.id === target &&
          releast.order.id === releast.serviceOrderId;
        const verifiedUnlock = costsFresh === true && sameSession;
        if (verifiedUnlock) proposalRef.current?.markReverified();
        // Remediation: same verified-GET rule for the quote, start-repair,
        // and completion locks. A failed detail GET keeps last-good (possibly
        // stale eligible) state, so unlocking on it could replay a
        // non-idempotent POST against an unknown server outcome.
        if (detailFresh === true && sameSession) {
          quoteRef.current?.markReverified();
          startRepairRef.current?.markReverified();
          completionRef.current?.markReverified();
        }
      } else {
        evidenceRef.current?.blurEvidence();
        invoiceRef.current?.blurInvoice();
        costsRef.current?.blurCosts();
        proposalRef.current?.reset();
        uploadRef.current?.discard();
        afterUploadRef.current?.discard();
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
  const onProposalField = {
    reason: (value: string) => { proposalRef.current?.setField('reason', value); },
    description: (value: string) => { proposalRef.current?.setField('description', value); },
    quantity: (value: string) => { proposalRef.current?.setField('quantity', value); },
    unitPrice: (value: string) => { proposalRef.current?.setField('unitPrice', value); },
    note: (value: string) => { proposalRef.current?.setField('note', value); },
  };
  const onProposalConfirm = () => { proposalRef.current?.requestConfirm(); };
  const onProposalCancelConfirm = () => { proposalRef.current?.cancelConfirm(); };
  const onProposalSubmit = () => { void proposalRef.current?.submit(); };
  const sections = resolveOrderDetailSections(order);
  // BEFORE upload is visible/enabled only on the assigned ACTIVE EN_ROUTE
  // detail whose Backend order is arrival-verified; anything else shows the
  // honest gate copy and never opens the picker.
  const canUploadBefore = !!order &&
    order.id === serviceOrderId &&
    order.historical !== true &&
    String(order.status).toUpperCase() === 'EN_ROUTE' &&
    order.arrivalVerified === true;
  // P3B10 AFTER upload is visible/enabled only on the assigned ACTIVE
  // UNDER_REPAIR detail with no completion requested; anything else shows the
  // honest gate copy and never opens the picker.
  const canUploadAfter = !!order &&
    order.id === serviceOrderId &&
    order.historical !== true &&
    String(order.status).toUpperCase() === 'UNDER_REPAIR' &&
    !order.completionRequestedAt;
  // P3B6 labor-only create visibility mirrors the controller gate: inspection
  // survey pricing, verified arrival, and no live SENT/APPROVED quotation.
  const existingQuoteStatus = order?.quotation ? String(order.quotation.status).toUpperCase() : null;
  const canCreateQuote = !!order &&
    order.id === serviceOrderId &&
    order.historical !== true &&
    String(order.status).toUpperCase() === 'EN_ROUTE' &&
    order.arrivalVerified === true &&
    String(order.pricingMode ?? '').toLowerCase() === 'inspection_required' &&
    existingQuoteStatus !== 'SENT' &&
    existingQuoteStatus !== 'APPROVED';
  // P3B9 start-repair visibility mirrors the controller gate; the Backend
  // POST remains the final validator.
  const startRepairGate = order && order.id === serviceOrderId ? {
    id: order.id,
    status: order.status,
    arrivalVerified: order.arrivalVerified,
    historical: order.historical,
    pricingMode: order.pricingMode,
    fixedUnitPrice: order.fixedUnitPrice,
    beforeEvidenceCount: order.beforeEvidenceCount,
    quotationStatus: order.quotation ? order.quotation.status : null,
  } : null;
  const startRepairEligible = startRepairTarget(startRepairGate);
  const startRepairBlockers = startRepairGate ? describeStartRepairBlockers(startRepairGate) : [];
  // P3B12 proposal form visibility mirrors the controller gate: UNDER_REPAIR,
  // open, and no live PENDING_APPROVAL request.
  const hasPendingCosts = costsState.requests.some((request) => request.status === 'PENDING_APPROVAL');
  const canProposeCosts = !!order &&
    order.id === serviceOrderId &&
    order.historical !== true &&
    String(order.status).toUpperCase() === 'UNDER_REPAIR' &&
    !order.completionRequestedAt &&
    !hasPendingCosts;
  // Request-completion visibility mirrors the controller gate; the Backend
  // POST remains the final validator. Dev/test orders only in this slice.
  const completionGate = order && order.id === serviceOrderId ? {
    id: order.id,
    status: order.status,
    completionRequestedAt: order.completionRequestedAt,
    historical: order.historical,
    afterEvidenceCount: order.afterEvidenceCount,
    pricingMode: order.pricingMode,
    quotationStatus: order.quotation ? order.quotation.status : null,
    hasPendingCosts,
  } : null;
  const completionEligible = requestCompletionTarget(completionGate);
  const completionBlockers = completionGate ? describeCompletionBlockers(completionGate) : [];

  const getStatusBadge = (status: CanonicalOrderStatus) => {
    const s = String(status).toUpperCase();
    switch (s) {
      case 'ACCEPTED':
        return { label: 'Chờ di chuyển', bg: '#FEF3C7', color: '#D97706' };
      case 'EN_ROUTE':
        return { label: 'Đang trên đường', bg: '#DCFCE7', color: '#16A34A' };
      case 'UNDER_REPAIR':
      case 'IN_PROGRESS':
        return { label: 'Đang sửa chữa', bg: '#DBEAFE', color: '#2563EB' };
      case 'COMPLETED':
        return { label: 'Hoàn tất', bg: '#F1F5F9', color: '#64748B' };
      default:
        return { label: s, bg: '#F1F5F9', color: '#64748B' };
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Quay lại">
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Chi tiết công việc</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Đang tải chi tiết công việc...</Text>
        </View>
      ) : !order ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="briefcase-outline" size={56} color="#CBD5E1" />
          <Text style={styles.emptyTitle}>Không xem được công việc</Text>
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

          <View style={styles.jobCard}>
            <View style={[styles.badge, { backgroundColor: getStatusBadge(order.status).bg }]}>
              <Text style={[styles.badgeText, { color: getStatusBadge(order.status).color }]}>
                {getStatusBadge(order.status).label}
              </Text>
            </View>
            <Text style={styles.jobTitle}>Đơn #{order.code || order.id.slice(0, 8)}</Text>
            <Text style={styles.jobMeta}>{order.serviceName || 'Dịch vụ sửa chữa'}</Text>
            {!!order.scheduledAt && (
              <Text style={styles.jobMeta}>
                Lịch hẹn: {new Date(order.scheduledAt).toLocaleString('vi-VN')}
              </Text>
            )}
            {!!order.addressSummary && (
              <Text style={styles.jobMeta}>📍 {order.addressSummary}</Text>
            )}
            {!!order.customerName && (
              <Text style={styles.jobMeta}>
                Khách: {order.customerName}{order.customerPhone ? ` (${order.customerPhone})` : ''}
              </Text>
            )}
            {sections.quantity !== null && (
              <Text style={styles.jobMeta}>Số lượng: {sections.quantity}</Text>
            )}
            {!!order.scopeDescription && (
              <Text style={styles.jobMeta}>Phạm vi: {order.scopeDescription}</Text>
            )}
          </View>

          <View style={styles.jobCard}>
            <Text style={styles.sectionTitle}>Chi phí</Text>
            {sections.laborText !== null && (
              <View style={styles.row}>
                <Text style={styles.jobMeta}>Nhân công</Text>
                <Text style={styles.jobMeta}>{sections.laborText}</Text>
              </View>
            )}
            {sections.partsText !== null && (
              <View style={styles.row}>
                <Text style={styles.jobMeta}>Vật tư</Text>
                <Text style={styles.jobMeta}>{sections.partsText}</Text>
              </View>
            )}
            {sections.totalText !== null ? (
              <View style={styles.row}>
                <Text style={styles.totalLabel}>Tổng cộng</Text>
                <Text style={styles.totalValue}>{sections.totalText}</Text>
              </View>
            ) : (
              <Text style={styles.jobMeta}>Chưa có thông tin giá</Text>
            )}
          </View>

          {sections.hasQuotation && order.quotation && (
            <View style={styles.jobCard}>
              <Text style={styles.sectionTitle}>Báo giá</Text>
              <Text style={styles.jobMeta}>Trạng thái: {sections.quotationStatus}</Text>
              {quotationItemsList(order).length === 0 ? (
                <Text style={styles.jobMeta}>Chưa có chi tiết báo giá</Text>
              ) : (
                quotationItemsList(order).map((item) => (
                  <View key={item.id ?? `${item.description}-${item.quantity}-${item.unitPrice}`} style={styles.row}>
                    <Text style={styles.jobMeta}>{item.description} × {item.quantity}</Text>
                    <Text style={styles.jobMeta}>{amountOrNull(item.lineTotal) ?? '—'}</Text>
                  </View>
                ))
              )}
              {sections.quoteAwaitingDecision && (
                <Text style={styles.jobMeta}>
                  Báo giá đang chờ khách quyết định. Không thao tác tại đây.
                </Text>
              )}
            </View>
          )}

          {sections.hasTimeline && (
            <View style={styles.jobCard}>
              <Text style={styles.sectionTitle}>Tiến độ</Text>
              {order.timeline!.map((entry, index) => (
                <View key={`${entry.status}-${entry.timestamp}-${index}`} style={styles.row}>
                  <Text style={styles.jobMeta}>{entry.title || entry.status}</Text>
                  <Text style={styles.jobMeta}>{new Date(entry.timestamp).toLocaleString('vi-VN')}</Text>
                </View>
              ))}
            </View>
          )}

          {(sections.beforeCount !== null || sections.afterCount !== null) && (
            <View style={styles.jobCard}>
              <Text style={styles.sectionTitle}>Bằng chứng ảnh</Text>
              {sections.beforeCount !== null && (
                <Text style={styles.jobMeta}>Ảnh trước sửa chữa: {sections.beforeCount}</Text>
              )}
              {sections.afterCount !== null && (
                <Text style={styles.jobMeta}>Ảnh sau sửa chữa: {sections.afterCount}</Text>
              )}
            </View>
          )}

          <View style={styles.jobCard}>
            <Text style={styles.sectionTitle}>Ảnh thực tế</Text>
            {evidenceState.loading && evidenceState.photos.length === 0 && !evidenceState.error ? (
              <Text style={styles.jobMeta}>Đang tải ảnh bằng chứng...</Text>
            ) : evidenceState.photos.length === 0 && !evidenceState.error ? (
              <Text style={styles.jobMeta}>Chưa có ảnh bằng chứng cho đơn này.</Text>
            ) : (
              evidenceState.photos.map((photo) => (
                <View key={photo.id} style={styles.evidenceItem}>
                  {evidenceState.failed[photo.id] ? (
                    <View style={styles.evidencePlaceholder}>
                      <Text style={styles.jobMeta}>Không tải được ảnh. Nhấn “Tải lại ảnh” để lấy đường dẫn mới.</Text>
                    </View>
                  ) : (
                    <Image
                      source={{ uri: photo.uri }}
                      style={styles.evidenceThumb}
                      accessibilityLabel={`Ảnh ${evidenceTypeLabel(photo.type)}`}
                      onError={() => evidenceRef.current?.markImageFailed(photo.id)}
                    />
                  )}
                  <Text style={styles.jobMeta}>{evidenceTypeLabel(photo.type)}</Text>
                  {!!photo.note && <Text style={styles.jobMeta}>{photo.note}</Text>}
                </View>
              ))
            )}
            {!!evidenceState.error && (
              <View style={styles.evidenceError}>
                <Text style={styles.jobMeta}>{evidenceState.error}</Text>
                <TouchableOpacity onPress={onRetryEvidence} disabled={!evidenceState.canRetry} accessibilityRole="button">
                  <Text style={evidenceState.canRetry ? styles.retryText : styles.jobMeta}>Tải lại ảnh</Text>
                </TouchableOpacity>
              </View>
            )}
            {!evidenceState.error && Object.keys(evidenceState.failed).length > 0 && (
              <TouchableOpacity onPress={onRetryEvidence} accessibilityRole="button">
                <Text style={styles.retryText}>Tải lại ảnh</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.jobCard}>
            <Text style={styles.sectionTitle}>Hóa đơn</Text>
            {invoiceState.loading && !invoiceState.invoice && !invoiceState.error ? (
              <Text style={styles.jobMeta}>Đang tải hóa đơn...</Text>
            ) : invoiceState.invoice ? (
              <>
                <View style={styles.row}>
                  <Text style={styles.jobMeta}>Trạng thái thanh toán</Text>
                  <Text style={styles.jobMeta}>{invoicePaymentLabel(invoiceState.invoice.paymentStatus)}</Text>
                </View>
                {invoiceState.invoice.laborText !== null && (
                  <View style={styles.row}>
                    <Text style={styles.jobMeta}>Nhân công</Text>
                    <Text style={styles.jobMeta}>{invoiceState.invoice.laborText}</Text>
                  </View>
                )}
                {invoiceState.invoice.partsText !== null && (
                  <View style={styles.row}>
                    <Text style={styles.jobMeta}>Vật tư</Text>
                    <Text style={styles.jobMeta}>{invoiceState.invoice.partsText}</Text>
                  </View>
                )}
                {invoiceState.invoice.totalText !== null ? (
                  <View style={styles.row}>
                    <Text style={styles.totalLabel}>Tổng cộng</Text>
                    <Text style={styles.totalValue}>{invoiceState.invoice.totalText}</Text>
                  </View>
                ) : (
                  <Text style={styles.jobMeta}>Chưa rõ tổng tiền.</Text>
                )}
                {!!invoiceState.invoice.issuedText && (
                  <Text style={styles.jobMeta}>Phát hành: {invoiceState.invoice.issuedText}</Text>
                )}
                {!!invoiceState.invoice.paidText && (
                  <Text style={styles.jobMeta}>Đã thanh toán: {invoiceState.invoice.paidText}</Text>
                )}
                {invoiceState.invoice.items.map((item) => (
                  <View key={item.id} style={styles.row}>
                    <Text style={styles.jobMeta}>{item.description} × {item.quantity}</Text>
                    <Text style={styles.jobMeta}>{item.lineTotalText ?? '—'}</Text>
                  </View>
                ))}
              </>
            ) : !invoiceState.error ? (
              <Text style={styles.jobMeta}>Chưa có hóa đơn.</Text>
            ) : null}
            {!!invoiceState.error && (
              <View style={styles.evidenceError}>
                <Text style={styles.jobMeta}>{invoiceState.error}</Text>
                <TouchableOpacity onPress={onRetryInvoice} disabled={!invoiceState.canRetry} accessibilityRole="button">
                  <Text style={invoiceState.canRetry ? styles.retryText : styles.jobMeta}>Tải lại hóa đơn</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          <View style={styles.jobCard}>
            <Text style={styles.sectionTitle}>Chi phí phát sinh</Text>
            {costsState.loading && costsState.requests.length === 0 && !costsState.error ? (
              <Text style={styles.jobMeta}>Đang tải chi phí phát sinh...</Text>
            ) : costsState.requests.length === 0 && !costsState.error ? (
              <Text style={styles.jobMeta}>Chưa có yêu cầu chi phí phát sinh.</Text>
            ) : (
              costsState.requests.map((request) => (
                <View key={request.id} style={styles.evidenceItem}>
                  <Text style={styles.jobMeta}>{request.reason}</Text>
                  <Text style={styles.jobMeta}>Trạng thái: {additionalCostStatusLabel(request.status)}</Text>
                  {request.laborText !== null && (
                    <View style={styles.row}>
                      <Text style={styles.jobMeta}>Nhân công đề xuất</Text>
                      <Text style={styles.jobMeta}>{request.laborText}</Text>
                    </View>
                  )}
                  {request.partsText !== null && (
                    <View style={styles.row}>
                      <Text style={styles.jobMeta}>Vật tư đề xuất</Text>
                      <Text style={styles.jobMeta}>{request.partsText}</Text>
                    </View>
                  )}
                  {!!request.expiresText && (
                    <Text style={styles.jobMeta}>Hạn phản hồi: {request.expiresText}</Text>
                  )}
                  {request.items.map((item) => (
                    <View key={item.id} style={styles.row}>
                      <Text style={styles.jobMeta}>{item.description} × {item.quantity}</Text>
                      <Text style={styles.jobMeta}>{item.lineTotalText ?? '—'}</Text>
                    </View>
                  ))}
                </View>
              ))
            )}
            {!!costsState.error && (
              <View style={styles.evidenceError}>
                <Text style={styles.jobMeta}>{costsState.error}</Text>
                <TouchableOpacity onPress={onRetryCosts} disabled={!costsState.canRetry} accessibilityRole="button">
                  <Text style={costsState.canRetry ? styles.retryText : styles.jobMeta}>Tải lại chi phí</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          <View style={styles.jobCard}>
            <Text style={styles.sectionTitle}>Đề xuất chi phí phát sinh (mới: chỉ nhân công)</Text>
            <Text style={styles.jobMeta}>
              Đề xuất thêm một dòng nhân công khi phát sinh ngoài dự kiến.
              Đây là đề xuất, khách cần duyệt, chưa thanh toán.
            </Text>
            {!canProposeCosts ? (
              <Text style={styles.jobMeta}>
                {hasPendingCosts
                  ? 'Đã có yêu cầu chờ duyệt. Vui lòng chờ khách phản hồi trước khi đề xuất thêm.'
                  : 'Đơn chưa đủ điều kiện đề xuất chi phí (cần đang sửa, chưa yêu cầu hoàn thành).'}
              </Text>
            ) : proposalState.sent ? (
              <Text style={styles.jobMeta}>Đã gửi đề xuất chi phí, khách cần duyệt, chưa thanh toán.</Text>
            ) : (
              <>
                <Text style={styles.fieldLabel}>Lý do phát sinh</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={proposalState.draft.reason}
                  onChangeText={onProposalField.reason}
                  editable={!proposalState.busy && !proposalState.needsVerify}
                  maxLength={2000}
                  accessibilityLabel="Lý do chi phí phát sinh"
                />
                {!!proposalState.fieldErrors.reason && (
                  <Text style={styles.fieldError}>{proposalState.fieldErrors.reason}</Text>
                )}
                <Text style={styles.fieldLabel}>Mô tả công việc</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={proposalState.draft.description}
                  onChangeText={onProposalField.description}
                  editable={!proposalState.busy && !proposalState.needsVerify}
                  maxLength={2000}
                  accessibilityLabel="Mô tả công việc phát sinh"
                />
                {!!proposalState.fieldErrors.description && (
                  <Text style={styles.fieldError}>{proposalState.fieldErrors.description}</Text>
                )}
                <Text style={styles.fieldLabel}>Số lượng (1–1000)</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={proposalState.draft.quantity}
                  onChangeText={onProposalField.quantity}
                  editable={!proposalState.busy && !proposalState.needsVerify}
                  keyboardType="numeric"
                  accessibilityLabel="Số lượng phát sinh"
                />
                {!!proposalState.fieldErrors.quantity && (
                  <Text style={styles.fieldError}>{proposalState.fieldErrors.quantity}</Text>
                )}
                <Text style={styles.fieldLabel}>Đơn giá (đ)</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={proposalState.draft.unitPrice}
                  onChangeText={onProposalField.unitPrice}
                  editable={!proposalState.busy && !proposalState.needsVerify}
                  keyboardType="numeric"
                  accessibilityLabel="Đơn giá phát sinh"
                />
                {!!proposalState.fieldErrors.unitPrice && (
                  <Text style={styles.fieldError}>{proposalState.fieldErrors.unitPrice}</Text>
                )}
                <Text style={styles.fieldLabel}>Ghi chú (không bắt buộc)</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={proposalState.draft.note}
                  onChangeText={onProposalField.note}
                  editable={!proposalState.busy && !proposalState.needsVerify}
                  maxLength={5000}
                  accessibilityLabel="Ghi chú đề xuất chi phí"
                />
                {!!proposalState.fieldErrors.note && (
                  <Text style={styles.fieldError}>{proposalState.fieldErrors.note}</Text>
                )}
                {proposalState.confirming && proposalState.proposedTotalText ? (
                  <View style={styles.evidenceError}>
                    <Text style={styles.jobMeta}>
                      Đề xuất thêm: {proposalState.proposedTotalText} — khách cần duyệt, chưa thanh toán.
                    </Text>
                    <View style={styles.uploadBtnRow}>
                      <TouchableOpacity
                        style={[styles.uploadBtn, { backgroundColor: '#059669' }]}
                        onPress={onProposalSubmit}
                        disabled={proposalState.busy}
                        accessibilityRole="button"
                        accessibilityLabel="Xác nhận gửi đề xuất chi phí"
                      >
                        {proposalState.busy ? (
                          <ActivityIndicator size="small" color="#FFF" />
                        ) : (
                          <Text style={styles.uploadBtnText}>Xác nhận gửi</Text>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.uploadBtn, { backgroundColor: '#F1F5F9' }]}
                        onPress={onProposalCancelConfirm}
                        disabled={proposalState.busy}
                        accessibilityRole="button"
                        accessibilityLabel="Sửa lại đề xuất chi phí"
                      >
                        <Text style={[styles.uploadBtnText, { color: '#334155' }]}>Sửa lại</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[styles.uploadBtn, { backgroundColor: '#2563EB' }]}
                    onPress={onProposalConfirm}
                    disabled={proposalState.busy || proposalState.needsVerify}
                    accessibilityRole="button"
                    accessibilityLabel="Gửi đề xuất chi phí phát sinh"
                  >
                    <Text style={styles.uploadBtnText}>Gửi đề xuất</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
            {!!proposalState.error && (
              <View style={styles.evidenceError}>
                <Text style={styles.jobMeta}>{proposalState.error}</Text>
              </View>
            )}
          </View>

          <View style={styles.jobCard}>
            <Text style={styles.sectionTitle}>Tải ảnh trước sửa chữa</Text>
            {!canUploadBefore ? (
              <Text style={styles.jobMeta}>Check-in hợp lệ trước khi tải ảnh.</Text>
            ) : uploadState.pending ? (
              <>
                <Image
                  source={{ uri: uploadState.pending.uri }}
                  style={styles.evidenceThumb}
                  accessibilityLabel="Ảnh trước sửa chữa đã chọn"
                />
                <Text style={styles.jobMeta}>
                  Đã chọn ảnh ({(uploadState.pending.sizeBytes / 1048576).toFixed(1)} MB). Chỉ tải ảnh trước sửa chữa.
                </Text>
                <View style={styles.uploadBtnRow}>
                  <TouchableOpacity
                    style={[styles.uploadBtn, { backgroundColor: '#059669' }]}
                    onPress={onUploadBefore}
                    disabled={uploadState.busy}
                    accessibilityRole="button"
                    accessibilityLabel="Tải lên ảnh trước sửa chữa"
                  >
                    {uploadState.busy ? (
                      <ActivityIndicator size="small" color="#FFF" />
                    ) : (
                      <Text style={styles.uploadBtnText}>Tải lên</Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.uploadBtn, { backgroundColor: '#F1F5F9' }]}
                    onPress={onDiscardUpload}
                    disabled={uploadState.busy}
                    accessibilityRole="button"
                    accessibilityLabel="Hủy ảnh đã chọn"
                  >
                    <Text style={[styles.uploadBtnText, { color: '#334155' }]}>Hủy</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <View style={styles.uploadBtnRow}>
                <TouchableOpacity
                  style={[styles.uploadBtn, { backgroundColor: '#2563EB' }]}
                  onPress={onPickCamera}
                  accessibilityRole="button"
                  accessibilityLabel="Chụp ảnh trước sửa chữa"
                >
                  <Text style={styles.uploadBtnText}>Chụp ảnh</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.uploadBtn, { backgroundColor: '#EFF6FF' }]}
                  onPress={onPickGallery}
                  accessibilityRole="button"
                  accessibilityLabel="Chọn ảnh trước sửa chữa từ thư viện"
                >
                  <Text style={[styles.uploadBtnText, { color: '#2563EB' }]}>Chọn từ thư viện</Text>
                </TouchableOpacity>
              </View>
            )}
            {!!uploadState.error && (
              <View style={styles.evidenceError}>
                <Text style={styles.jobMeta}>{uploadState.error}</Text>
                {!!uploadState.pending && (
                  <TouchableOpacity onPress={onUploadBefore} disabled={uploadState.busy} accessibilityRole="button">
                    <Text style={styles.retryText}>Thử tải lại</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>

          <View style={styles.jobCard}>
            <Text style={styles.sectionTitle}>Tải ảnh sau sửa chữa</Text>
            {!canUploadAfter ? (
              <Text style={styles.jobMeta}>
                Ảnh sau sửa chữa chỉ tải được khi đơn đang sửa và chưa yêu cầu hoàn thành.
              </Text>
            ) : afterUploadState.pending ? (
              <>
                <Image
                  source={{ uri: afterUploadState.pending.uri }}
                  style={styles.evidenceThumb}
                  accessibilityLabel="Ảnh sau sửa chữa đã chọn"
                />
                <Text style={styles.jobMeta}>
                  Đã chọn ảnh ({(afterUploadState.pending.sizeBytes / 1048576).toFixed(1)} MB). Chỉ tải ảnh sau sửa chữa.
                </Text>
                <View style={styles.uploadBtnRow}>
                  <TouchableOpacity
                    style={[styles.uploadBtn, { backgroundColor: '#059669' }]}
                    onPress={onUploadAfter}
                    disabled={afterUploadState.busy}
                    accessibilityRole="button"
                    accessibilityLabel="Tải lên ảnh sau sửa chữa"
                  >
                    {afterUploadState.busy ? (
                      <ActivityIndicator size="small" color="#FFF" />
                    ) : (
                      <Text style={styles.uploadBtnText}>Tải lên</Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.uploadBtn, { backgroundColor: '#F1F5F9' }]}
                    onPress={onDiscardAfterUpload}
                    disabled={afterUploadState.busy}
                    accessibilityRole="button"
                    accessibilityLabel="Hủy ảnh đã chọn"
                  >
                    <Text style={[styles.uploadBtnText, { color: '#334155' }]}>Hủy</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <View style={styles.uploadBtnRow}>
                <TouchableOpacity
                  style={[styles.uploadBtn, { backgroundColor: '#2563EB' }]}
                  onPress={onPickAfterCamera}
                  accessibilityRole="button"
                  accessibilityLabel="Chụp ảnh sau sửa chữa"
                >
                  <Text style={styles.uploadBtnText}>Chụp ảnh</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.uploadBtn, { backgroundColor: '#EFF6FF' }]}
                  onPress={onPickAfterGallery}
                  accessibilityRole="button"
                  accessibilityLabel="Chọn ảnh sau sửa chữa từ thư viện"
                >
                  <Text style={[styles.uploadBtnText, { color: '#2563EB' }]}>Chọn từ thư viện</Text>
                </TouchableOpacity>
              </View>
            )}
            {!!afterUploadState.error && (
              <View style={styles.evidenceError}>
                <Text style={styles.jobMeta}>{afterUploadState.error}</Text>
                {!!afterUploadState.pending && (
                  <TouchableOpacity onPress={onUploadAfter} disabled={afterUploadState.busy} accessibilityRole="button">
                    <Text style={styles.retryText}>Thử tải lại</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>

          <View style={styles.jobCard}>
            <Text style={styles.sectionTitle}>Tạo báo giá (nhân công + linh kiện kỹ thuật)</Text>
            <Text style={styles.jobMeta}>
              Chỉ linh kiện do kỹ thuật viên cung cấp; linh kiện FixHome sẽ bổ sung khi có danh mục thật.
              Bảo hành có phí là đề xuất để khách tùy chọn, chưa thu tiền.
              Đây là báo giá đề xuất — chưa thanh toán, chờ khách duyệt.
            </Text>
            {!canCreateQuote ? (
              <Text style={styles.jobMeta}>
                Đơn chưa đủ điều kiện tạo báo giá (cần EN_ROUTE, đã check-in hợp lệ,
                báo giá theo khảo sát, chưa có báo giá chờ/duyệt).
              </Text>
            ) : quoteState.sent ? (
              <Text style={styles.jobMeta}>Đã gửi báo giá, chờ khách duyệt.</Text>
            ) : (
              <>
                {quoteState.rows.map((row, index) => {
                  const rowErrors = quoteState.rowErrors[row.key] ?? {};
                  const readOnly = quoteState.busy || quoteState.needsVerify;
                  return (
                    <View key={row.key} style={styles.quoteRow}>
                      <View style={styles.row}>
                        <Text style={styles.jobMeta}>
                          {row.kind === 'labor' ? `Nhân công ${index + 1}` : `Linh kiện kỹ thuật ${index + 1}`}
                        </Text>
                        {quoteState.rows.length > 1 && (
                          <TouchableOpacity
                            onPress={() => onQuoteRemoveRow(row.key)}
                            disabled={readOnly}
                            accessibilityRole="button"
                            accessibilityLabel="Xóa dòng báo giá"
                          >
                            <Text style={styles.retryText}>Xóa</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                      <Text style={styles.fieldLabel}>Mô tả</Text>
                      <TextInput
                        style={styles.fieldInput}
                        value={row.description}
                        onChangeText={(value) => quoteRef.current?.setRowField(row.key, 'description', value)}
                        editable={!readOnly}
                        maxLength={2000}
                        accessibilityLabel={`Mô tả dòng ${index + 1}`}
                      />
                      {!!rowErrors.description && (
                        <Text style={styles.fieldError}>{rowErrors.description}</Text>
                      )}
                      <Text style={styles.fieldLabel}>Số lượng (1–1000)</Text>
                      <TextInput
                        style={styles.fieldInput}
                        value={row.quantity}
                        onChangeText={(value) => quoteRef.current?.setRowField(row.key, 'quantity', value)}
                        editable={!readOnly}
                        keyboardType="numeric"
                        accessibilityLabel={`Số lượng dòng ${index + 1}`}
                      />
                      {!!rowErrors.quantity && (
                        <Text style={styles.fieldError}>{rowErrors.quantity}</Text>
                      )}
                      <Text style={styles.fieldLabel}>Đơn giá (đ)</Text>
                      <TextInput
                        style={styles.fieldInput}
                        value={row.unitPrice}
                        onChangeText={(value) => quoteRef.current?.setRowField(row.key, 'unitPrice', value)}
                        editable={!readOnly}
                        keyboardType="numeric"
                        accessibilityLabel={`Đơn giá dòng ${index + 1}`}
                      />
                      {!!rowErrors.unitPrice && (
                        <Text style={styles.fieldError}>{rowErrors.unitPrice}</Text>
                      )}
                      {row.kind === 'part' && (
                        <>
                          <Text style={styles.fieldLabel}>Bảo hành (mặc định: không)</Text>
                          <View style={styles.uploadBtnRow}>
                            <TouchableOpacity
                              style={[styles.uploadBtn, { backgroundColor: row.warrantyOption === 'no_warranty' ? '#DBEAFE' : '#F1F5F9' }]}
                              onPress={() => quoteRef.current?.setWarrantyOption(row.key, 'no_warranty')}
                              disabled={readOnly}
                              accessibilityRole="radio"
                              accessibilityState={{ selected: row.warrantyOption === 'no_warranty' }}
                              accessibilityLabel="Không bảo hành"
                            >
                              <Text style={[styles.uploadBtnText, { color: '#1E40AF' }]}>Không bảo hành</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.uploadBtn, { backgroundColor: row.warrantyOption === 'paid_warranty' ? '#DBEAFE' : '#F1F5F9' }]}
                              onPress={() => quoteRef.current?.setWarrantyOption(row.key, 'paid_warranty')}
                              disabled={readOnly}
                              accessibilityRole="radio"
                              accessibilityState={{ selected: row.warrantyOption === 'paid_warranty' }}
                              accessibilityLabel="Bảo hành có phí"
                            >
                              <Text style={[styles.uploadBtnText, { color: '#1E40AF' }]}>Bảo hành có phí</Text>
                            </TouchableOpacity>
                          </View>
                          {row.warrantyOption === 'paid_warranty' && (
                            <>
                              <Text style={styles.fieldLabel}>Phí bảo hành (đ, &gt; 0)</Text>
                              <TextInput
                                style={styles.fieldInput}
                                value={row.warrantyFee}
                                onChangeText={(value) => quoteRef.current?.setRowField(row.key, 'warrantyFee', value)}
                                editable={!readOnly}
                                keyboardType="numeric"
                                accessibilityLabel={`Phí bảo hành dòng ${index + 1}`}
                              />
                              {!!rowErrors.warrantyFee && (
                                <Text style={styles.fieldError}>{rowErrors.warrantyFee}</Text>
                              )}
                              <Text style={styles.fieldLabel}>Thời hạn bảo hành (ngày, 1–3650)</Text>
                              <TextInput
                                style={styles.fieldInput}
                                value={row.warrantyTermDays}
                                onChangeText={(value) => quoteRef.current?.setRowField(row.key, 'warrantyTermDays', value)}
                                editable={!readOnly}
                                keyboardType="numeric"
                                accessibilityLabel={`Thời hạn bảo hành dòng ${index + 1}`}
                              />
                              {!!rowErrors.warrantyTermDays && (
                                <Text style={styles.fieldError}>{rowErrors.warrantyTermDays}</Text>
                              )}
                            </>
                          )}
                        </>
                      )}
                    </View>
                  );
                })}
                <View style={styles.uploadBtnRow}>
                  <TouchableOpacity
                    style={[styles.uploadBtn, { backgroundColor: '#EFF6FF' }]}
                    onPress={onQuoteAddLabor}
                    disabled={quoteState.busy || quoteState.needsVerify}
                    accessibilityRole="button"
                    accessibilityLabel="Thêm dòng nhân công"
                  >
                    <Text style={[styles.uploadBtnText, { color: '#2563EB' }]}>Thêm nhân công</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.uploadBtn, { backgroundColor: '#EFF6FF' }]}
                    onPress={onQuoteAddPart}
                    disabled={quoteState.busy || quoteState.needsVerify}
                    accessibilityRole="button"
                    accessibilityLabel="Thêm linh kiện kỹ thuật"
                  >
                    <Text style={[styles.uploadBtnText, { color: '#2563EB' }]}>Thêm linh kiện</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.fieldLabel}>Ghi chú (không bắt buộc)</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={quoteState.note}
                  onChangeText={onQuoteField.note}
                  editable={!quoteState.busy && !quoteState.needsVerify}
                  maxLength={5000}
                  accessibilityLabel="Ghi chú báo giá"
                />
                {!!quoteState.noteError && (
                  <Text style={styles.fieldError}>{quoteState.noteError}</Text>
                )}
                {quoteState.confirming && quoteState.quotedCostText ? (
                  <View style={styles.evidenceError}>
                    <Text style={styles.jobMeta}>
                      Chi phí dự kiến: {quoteState.quotedCostText}
                      {!!quoteState.quotedWarrantyText && ` + bảo hành ${quoteState.quotedWarrantyText}`} (đề xuất, chưa thanh toán).
                    </Text>
                    <View style={styles.uploadBtnRow}>
                      <TouchableOpacity
                        style={[styles.uploadBtn, { backgroundColor: '#059669' }]}
                        onPress={onQuoteSubmit}
                        disabled={quoteState.busy}
                        accessibilityRole="button"
                        accessibilityLabel="Xác nhận gửi báo giá"
                      >
                        {quoteState.busy ? (
                          <ActivityIndicator size="small" color="#FFF" />
                        ) : (
                          <Text style={styles.uploadBtnText}>Xác nhận gửi</Text>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.uploadBtn, { backgroundColor: '#F1F5F9' }]}
                        onPress={onQuoteCancelConfirm}
                        disabled={quoteState.busy}
                        accessibilityRole="button"
                        accessibilityLabel="Sửa lại báo giá"
                      >
                        <Text style={[styles.uploadBtnText, { color: '#334155' }]}>Sửa lại</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[styles.uploadBtn, { backgroundColor: '#2563EB' }]}
                    onPress={onQuoteConfirm}
                    disabled={quoteState.busy || quoteState.needsVerify}
                    accessibilityRole="button"
                    accessibilityLabel="Gửi báo giá"
                  >
                    <Text style={styles.uploadBtnText}>Gửi báo giá</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
            {!!quoteState.error && (
              <View style={styles.evidenceError}>
                <Text style={styles.jobMeta}>{quoteState.error}</Text>
              </View>
            )}
          </View>

          <View style={styles.jobCard}>
            <Text style={styles.sectionTitle}>Bắt đầu sửa chữa</Text>
            {startRepairState.started ? (
              <Text style={styles.jobMeta}>Đã bắt đầu sửa chữa. Đơn đã chuyển sang trạng thái đang sửa chữa.</Text>
            ) : startRepairEligible ? (
              !startRepairState.confirming ? (
                <TouchableOpacity
                  style={[styles.uploadBtn, { backgroundColor: '#059669' }]}
                  onPress={onStartRepairConfirm}
                  disabled={startRepairState.busy || startRepairState.needsVerify}
                  accessibilityRole="button"
                  accessibilityLabel="Bắt đầu sửa chữa"
                >
                  <Text style={styles.uploadBtnText}>Bắt đầu sửa chữa</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.evidenceError}>
                  <Text style={styles.jobMeta}>{START_REPAIR_CONFIRM_COPY}</Text>
                  <Text style={styles.jobMeta}>
                    {startRepairState.pricing === 'fixed_price'
                      ? 'Đơn giá cố định — không cần báo giá.'
                      : 'Báo giá đã được khách duyệt.'}
                  </Text>
                  <View style={styles.uploadBtnRow}>
                    <TouchableOpacity
                      style={[styles.uploadBtn, { backgroundColor: '#059669' }]}
                      onPress={onStartRepairSubmit}
                      disabled={startRepairState.busy}
                      accessibilityRole="button"
                      accessibilityLabel="Xác nhận bắt đầu sửa chữa"
                    >
                      {startRepairState.busy ? (
                        <ActivityIndicator size="small" color="#FFF" />
                      ) : (
                        <Text style={styles.uploadBtnText}>Xác nhận</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.uploadBtn, { backgroundColor: '#F1F5F9' }]}
                      onPress={onStartRepairCancel}
                      disabled={startRepairState.busy}
                      accessibilityRole="button"
                      accessibilityLabel="Hủy bắt đầu sửa chữa"
                    >
                      <Text style={[styles.uploadBtnText, { color: '#334155' }]}>Hủy</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )
            ) : (
              startRepairBlockers.map((blocker) => (
                <Text key={blocker} style={styles.jobMeta}>• {blocker}</Text>
              ))
            )}
          {!!startRepairState.error && (
            <View style={styles.evidenceError}>
              <Text style={styles.jobMeta}>{startRepairState.error}</Text>
            </View>
          )}
        </View>

          {/* Dev-only completion action: entirely absent from production
              releases (compile-time __DEV__ gate), not merely disabled. */}
          {__DEV__ && (
            <View style={styles.jobCard}>
              <Text style={styles.sectionTitle}>Yêu cầu hoàn thành (đơn test)</Text>
              <Text style={styles.jobMeta}>
                Chỉ dùng cho đơn kiểm thử đã thỏa thuận với điều phối. Nút này gọi API thật khi xác nhận.
              </Text>
            {completionState.requested ? (
              <Text style={styles.jobMeta}>Đã yêu cầu hoàn thành, chờ khách nghiệm thu và thanh toán.</Text>
            ) : completionEligible ? (
              !completionState.confirming ? (
                <TouchableOpacity
                  style={[styles.uploadBtn, { backgroundColor: '#7C3AED' }]}
                  onPress={onCompletionConfirm}
                  disabled={completionState.busy || completionState.needsVerify}
                  accessibilityRole="button"
                  accessibilityLabel="Yêu cầu hoàn thành"
                >
                  <Text style={styles.uploadBtnText}>Yêu cầu hoàn thành</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.evidenceError}>
                  <Text style={styles.jobMeta}>{REQUEST_COMPLETION_CONFIRM_COPY}</Text>
                  <View style={styles.uploadBtnRow}>
                    <TouchableOpacity
                      style={[styles.uploadBtn, { backgroundColor: '#059669' }]}
                      onPress={onCompletionSubmit}
                      disabled={completionState.busy}
                      accessibilityRole="button"
                      accessibilityLabel="Xác nhận yêu cầu hoàn thành"
                    >
                      {completionState.busy ? (
                        <ActivityIndicator size="small" color="#FFF" />
                      ) : (
                        <Text style={styles.uploadBtnText}>Xác nhận</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.uploadBtn, { backgroundColor: '#F1F5F9' }]}
                      onPress={onCompletionCancel}
                      disabled={completionState.busy}
                      accessibilityRole="button"
                      accessibilityLabel="Hủy yêu cầu hoàn thành"
                    >
                      <Text style={[styles.uploadBtnText, { color: '#334155' }]}>Hủy</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )
            ) : (
              completionBlockers.map((blocker) => (
                <Text key={blocker} style={styles.jobMeta}>• {blocker}</Text>
              ))
            )}
            {!!completionState.error && (
              <View style={styles.evidenceError}>
                <Text style={styles.jobMeta}>{completionState.error}</Text>
              </View>
            )}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const getStyles = (colors: any) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  headerSpacer: {
    width: 24,
  },
  scrollContent: {
    padding: 16,
    gap: 12,
    backgroundColor: '#F8FAFC',
    flexGrow: 1,
  },
  centerLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#64748B',
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
    color: '#0F172A',
    marginTop: 16,
  },
  emptyDesc: {
    fontSize: 13,
    color: '#64748B',
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
  jobCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
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
  jobTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  jobMeta: {
    fontSize: 13,
    color: '#334155',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
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
  uploadBtnRow: {
    flexDirection: 'row',
    gap: 8,
  },
  uploadBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
  },
  uploadBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
    marginTop: 4,
  },
  fieldInput: {
    fontSize: 13,
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  fieldError: {
    fontSize: 12,
    color: '#DC2626',
  },
  quoteRow: {
    gap: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  totalValue: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
});
