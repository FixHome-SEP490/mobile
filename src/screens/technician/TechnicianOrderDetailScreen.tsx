import React, { useState, useCallback, useEffect, useRef } from 'react';
import { supportCasesApi } from '../../api/support-cases.api';
import { canDepartNow, sessionLabel } from '../../utils/booking-session';
import { quoteStatusLabel } from '../../utils/quote-status';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  BackHandler,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StatusBar,
  Image,
  Alert,
  TextInput,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Briefcase,
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  Circle,
  CircleDot,
  Clock,
  MapPin,
  MessageCircle,
  Minus,
  Package,
  Plus,
  ShieldCheck,
  Trash2,
  User,
  Wrench,
} from 'lucide-react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useLiveRefresh } from '../../hooks/useLiveRefresh';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../types';
import { useAppTheme } from '../../constants/theme';
import { useAuthStore } from '../../store/auth.store';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { ordersApi, type ServiceOrderItem, type CreateAdditionalCostItem } from '../../api/orders.api';
import { partsCatalogApi, type FixHomePart } from '../../api/parts-catalog.api';
import { technicianJobsUserId } from './technician-jobs-loader';
import { extractApiErrorMessage } from '../../utils/input-validation';
import { createCheckInController, type PermissionDecision } from './technician-check-in';
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
  QUOTE_QUANTITY_MIN,
  QUOTE_QUANTITY_MAX,
} from './technician-quotation-create';
import {
  createStartRepairController,
  pressStartRepairFooter,
  describeStartRepairBlockers,
  initialStartRepairState,
  startRepairTarget,
} from './technician-start-repair';
import {
  createRequestCompletionController,
  describeCompletionBlockers,
  initialRequestCompletionState,
  requestCompletionTarget,
  REQUEST_COMPLETION_CONFIRM_COPY,
} from './technician-request-completion';
import { createTechOrderDetailLoader } from './technician-order-detail';
import TechnicianPartsSection from './technician-parts-section';
import {
  selectTechnicianWorkOrderHierarchy,
  selectEvidenceDisplayPriority,
  selectAfterEvidenceDisplayPriority,
  type WorkOrderNextAction,
  type WorkOrderReadinessChecklist,
} from './technician-work-order-hierarchy';
import { selectTechnicianWorkflowScene } from './technician-workflow-scene';
import { technicianWorkflowStages, type TechnicianStageId } from './technician-workflow-stages';
import StatusBadge from '../../components/StatusBadge';
import ContactActions from '../../components/ContactActions';
import OrderNoteCard from '../../components/OrderNoteCard';
import { serviceOrderStatusView } from './technician-status';
import { formatVnd, vndText } from '../../utils/format';
import { findChatForBooking } from './technician-chat-shortcut';
import {
  createTechnicianCashController,
  initialTechnicianCashState,
  technicianCashTarget,
} from './technician-cash-settlement';
import { vnDateTimeString } from '../../utils/vn-time';
import BackButton from '../../components/BackButton';

const VN_DATETIME = { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' } as const;
type DetailRoute = RouteProp<RootStackParamList, 'TechnicianOrderDetail'>;

function amountOrNull(value: unknown): string | null {
  return typeof value === 'number' ? formatVnd(value) : null;
}

type DetailStyles = ReturnType<typeof getStyles>;
type DetailColors = ReturnType<typeof useAppTheme>['colors'];

/** Action card that opens on the step the technician is on and folds away otherwise. */
function CollapsibleCard({ styles, colors, title, defaultOpen, children }: {
  styles: DetailStyles;
  colors: DetailColors;
  title: string;
  defaultOpen: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View style={styles.jobCard}>
      <TouchableOpacity
        style={styles.collapseHeader}
        onPress={() => setOpen((value) => !value)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={title}
      >
        <Text style={styles.collapseTitle}>{title}</Text>
        {open ? (
          <ChevronUp size={20} color={colors.textSecondary} strokeWidth={1.75} />
        ) : (
          <ChevronDown size={20} color={colors.textSecondary} strokeWidth={1.75} />
        )}
      </TouchableOpacity>
      {open && <View style={styles.collapseBody}>{children}</View>}
    </View>
  );
}

export default function TechnicianOrderDetailScreen() {
  const { colors, isDark } = useAppTheme();
  const styles = getStyles(colors);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<DetailRoute>();
  const serviceOrderId = route.params.serviceOrderId;
  const [stageView, setStageView] = useState<{ orderId: string; stage: TechnicianStageId | 'all' | null; handover: boolean; extras: boolean }>({ orderId: serviceOrderId, stage: null, handover: false, extras: false });
  const detailsReturnStageRef = useRef<TechnicianStageId | null>(null);
  const [progressVisible, setProgressVisible] = useState(false);
  const [detailState, setDetailState] = useState({
    order: null as ServiceOrderItem | null,
    loading: true,
    refreshing: false,
    error: null as string | null,
  });
  const { order, loading, refreshing, error } = detailState;
  const [openingChat, setOpeningChat] = useState(false);
  const handleOpenChat = async (bookingId: string) => {
    if (openingChat) return;
    setOpeningChat(true);
    try {
      const target = await findChatForBooking(bookingId);
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
      Alert.alert('Lỗi', 'Không thể mở cuộc trò chuyện. Vui lòng thử lại.');
    } finally {
      setOpeningChat(false);
    }
  };
  const [evidenceState, setEvidenceState] = useState(initialEvidenceState);
  const [costsState, setCostsState] = useState(initialAdditionalCostsState);
  const [proposalState, setProposalState] = useState(initialCostProposalState);
  useEffect(() => {
    if (proposalState.sent) {
      setAcExtraParts([]);
      setAcFulfillment('pickup');
      setAcShippingFee('');
    }
  }, [proposalState.sent]);
  const [invoiceState, setInvoiceState] = useState(initialInvoiceState);
  const [uploadState, setUploadState] = useState(initialUploadState);
  const [afterUploadState, setAfterUploadState] = useState(initialAfterUploadState);
  const [quoteState, setQuoteState] = useState(initialQuoteState);
  const [startRepairState, setStartRepairState] = useState(initialStartRepairState);
  const [completionState, setCompletionState] = useState(initialRequestCompletionState);
  const [cashState, setCashState] = useState(initialTechnicianCashState);
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
      ordersApi.getTechnicianOrder,
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
  // K08 Technician cash declaration: exact server order total only.
  // Mutation success/ambiguity is never trusted without GET reconciliation.
  const cashRef = useRef<ReturnType<typeof createTechnicianCashController> | null>(null);
  useEffect(() => {
    cashRef.current = createTechnicianCashController(
      {
        getOrder: () => {
          const latest = latestRef.current;
          if (!latest.order || latest.order.id !== latest.serviceOrderId) return null;
          return {
            id: latest.order.id,
            status: latest.order.status,
            paymentStatus: latest.order.paymentStatus,
            completionRequestedAt: latest.order.completionRequestedAt,
            grandTotal: latest.order.grandTotal,
            historical: latest.order.historical,
          };
        },
        getTechnicianId: () => technicianJobsUserId(useAuthStore.getState()),
        isFocused: () => focusAliveRef.current,
        getCashSettlement: (id) => ordersApi.getCashSettlement(id),
        declareCashSettlement: (id, body) => ordersApi.declareCashSettlement(id, body),
        refreshDetail: async () => {
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
      setCashState,
    );
    return () => {
      cashRef.current = null;
    };
  }, []);

  // Check-in and en-route: the workspace itself must offer these, not just
  // describe them — a technician landing here straight from an accepted
  // invitation had no other action screen to fall back to.
  const [checkInBusy, setCheckInBusy] = useState(false);
  const [enRouteBusy, setEnRouteBusy] = useState(false);
  // Re-evaluated every 30 s so the depart button lights up on time.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNowTick(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const checkInRef = useRef<ReturnType<typeof createCheckInController> | null>(null);
  useEffect(() => {
    checkInRef.current = createCheckInController({
      getJob: (id) => {
        const latest = latestRef.current;
        if (!latest.order || latest.order.id !== id) return null;
        return { id: latest.order.id, status: latest.order.status, historical: latest.order.historical };
      },
      getTechnicianId: () => technicianJobsUserId(useAuthStore.getState()),
      captureFocus: () => () => focusAliveRef.current,
      requestPermission: async (): Promise<PermissionDecision> => {
        try {
          const servicesEnabled = await Location.hasServicesEnabledAsync();
          if (!servicesEnabled) return 'unavailable';
          const response = await Location.requestForegroundPermissionsAsync();
          return response.status === 'granted' ? 'granted' : 'denied';
        } catch {
          return 'unavailable';
        }
      },
      getPosition: async () => {
        const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
        return {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
        };
      },
      postCheckIn: (id, coords) => ordersApi.checkIn(id, coords),
      getOrderDetail: (id) => ordersApi.getOrder(id),
      notify: (title, message) => Alert.alert(title, message),
      refreshJobs: async () => { await loaderRef.current?.refresh(true); },
      onAccessDenied: () => { void loaderRef.current?.refresh(true); },
      setBusy: (id) => setCheckInBusy(!!id),
    });
    return () => {
      checkInRef.current = null;
    };
  }, []);
  // PO 08/10/2026: arriving = check-in that requires a product photo, so the
  // camera opens as soon as the GPS check-in is accepted.
  const onCheckIn = async () => {
    if (!order) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await checkInRef.current?.checkIn(order.id);
    await loaderRef.current?.refresh(true);
    const latest = latestRef.current.order;
    if (latest?.arrivalVerified === true && (latest.beforeEvidenceCount ?? 0) < 1) {
      void uploadRef.current?.pickFromCamera();
    }
  };

  // "Cần thay đổi thợ": after check-in, a job outside the technician's skills goes to the Service Manager.
  const [replacementOpen, setReplacementOpen] = useState(false);
  const [replacementReason, setReplacementReason] = useState('');
  const [replacementBusy, setReplacementBusy] = useState(false);
  const [replacementSent, setReplacementSent] = useState(false);
  const sendReplacement = async () => {
    if (!order || replacementBusy) return;
    const reason = replacementReason.trim();
    if (reason.length < 10) {
      Alert.alert('Thiếu lý do', 'Ghi rõ vì sao cần thay thợ, tối thiểu 10 ký tự.');
      return;
    }
    setReplacementBusy(true);
    try {
      await supportCasesApi.createCase({ caseType: 'technician_replacement', reason, serviceOrderId: order.id, isUrgent: true });
      setReplacementSent(true);
      setReplacementOpen(false);
    } catch (err: unknown) {
      Alert.alert('Chưa gửi được', extractApiErrorMessage(err, 'Vui lòng thử lại sau.'));
    } finally {
      setReplacementBusy(false);
    }
  };
  const onEnRoute = async () => {
    if (!order || enRouteBusy || !canDepartNow(order.departAvailableAt, nowTick)) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setEnRouteBusy(true);
    try {
      await ordersApi.enRoute(order.id);
      await loaderRef.current?.refresh(true);
    } catch (err: unknown) {
      Alert.alert('Lỗi', extractApiErrorMessage(err, 'Không thể bắt đầu di chuyển. Vui lòng thử lại.'));
    } finally {
      setEnRouteBusy(false);
    }
  };

  // P3B12 cost proposal form: same effect pattern, no ref read during render.
  // Screen-owned FixHome part lines for the additional-cost proposal (see
  // technician-additional-cost-create.ts's getExtraPartItems/getFulfillment —
  // additive deps that keep the controller's own tested labor-line payload
  // byte-identical when no parts are picked).
  const [acExtraParts, setAcExtraParts] = useState<CreateAdditionalCostItem[]>([]);
  const [acFulfillment, setAcFulfillment] = useState<'pickup' | 'delivery'>('pickup');
  const [acShippingFee, setAcShippingFee] = useState('');
  const acStateRef = useRef({ acExtraParts, acFulfillment, acShippingFee });
  useEffect(() => {
    acStateRef.current = { acExtraParts, acFulfillment, acShippingFee };
  });
  const [acPartQuery, setAcPartQuery] = useState('');
  const [acPartResults, setAcPartResults] = useState<FixHomePart[]>([]);
  const [acPartSearching, setAcPartSearching] = useState(false);
  const [acShowPartSearch, setAcShowPartSearch] = useState(false);
  const acSearchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Quotation "part" rows: technician-supplied parts, priced/warrantied by the
  // technician (backend never generates a receivable PartRequest for a plain
  // quotation line — only an approved additional-cost does). This is only a
  // lookup helper so the tech isn't guessing prices from memory: picking a
  // result copies the FixHome catalog's name/price into the row's own editable
  // fields, it does NOT attach a partCatalogId or change partSource.
  const [quotePartSearchRowKey, setQuotePartSearchRowKey] = useState<string | null>(null);
  const [quotePartQuery, setQuotePartQuery] = useState('');
  const [quotePartResults, setQuotePartResults] = useState<FixHomePart[]>([]);
  const [quotePartSearching, setQuotePartSearching] = useState(false);
  const [quotePartHints, setQuotePartHints] = useState<Record<string, string>>({});
  const quotePartSearchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        getExtraPartItems: () => acStateRef.current.acExtraParts,
        getFulfillment: () => ({
          method: acStateRef.current.acFulfillment,
          shippingFee: Number(acStateRef.current.acShippingFee) || 0,
        }),
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
              mediaTypes: ['images'],
              quality: 0.8,
            })
            : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images'],
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
        getEvidence: (id) => ordersApi.getEvidence(id),
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
              mediaTypes: ['images'],
              quality: 0.8,
            })
            : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images'],
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
        getEvidence: (id) => ordersApi.getEvidence(id),
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
  // production controller.
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
  // PO 18/10/2026: this order changed on the server (customer decision, payment, warranty): read it again, quietly.
  useLiveRefresh(['order:updated'], () => { void loaderRef.current?.refresh(true); },
    (event) => !event.payload.serviceOrderId || event.payload.serviceOrderId === serviceOrderId);
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
      cashRef.current?.reset();
    };
  }, [serviceOrderId]));
  const isEvidenceReadable = (target: string) => {
    const latest = latestRef.current;
    return !!latest.order && latest.order.id === target && latest.order.id === latest.serviceOrderId;
  };
  // K08 cash declaration follows only an unpaid UNDER_REPAIR order after
  // completion was requested. The Backend invoice/order total remains authority.
  useEffect(() => {
    if (technicianCashTarget(order && order.id === serviceOrderId ? {
      id: order.id,
      status: order.status,
      paymentStatus: order.paymentStatus,
      completionRequestedAt: order.completionRequestedAt,
      grandTotal: order.grandTotal,
      historical: order.historical,
    } : null)) {
      void cashRef.current?.load();
    } else {
      cashRef.current?.reset();
    }
  }, [order, serviceOrderId]);

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
  const onUploadBefore = () => { void uploadRef.current?.upload(); };
  const onReconcileBefore = () => { void uploadRef.current?.reconcile(); };
  const onDiscardUpload = () => { uploadRef.current?.discard(); };
  const onPickAfterCamera = () => { void afterUploadRef.current?.pickFromCamera(); };
  const onUploadAfter = () => { void afterUploadRef.current?.upload(); };
  const onReconcileAfter = () => { void afterUploadRef.current?.reconcile(); };
  const onDiscardAfterUpload = () => { afterUploadRef.current?.discard(); };
  const onQuoteField = {
    note: (value: string) => { quoteRef.current?.setNote(value); },
  };
  // Labor lines have no meaningful "quantity" for the technician to pick (a
  // repair task isn't sold by unit count) — the field stays hidden and is
  // silently kept at 1 here so the shared row validation (which every line,
  // labor or part, still runs through) never blocks on it.
  useEffect(() => {
    for (const row of quoteState.rows) {
      if (row.kind === 'labor' && !row.quantity) {
        quoteRef.current?.setRowField(row.key, 'quantity', '1');
      }
    }
  }, [quoteState.rows]);
  const onQuoteAddLabor = () => { quoteRef.current?.addRow('labor'); };
  const onQuoteAddPart = () => { quoteRef.current?.addRow('part'); };
  const onQuoteRemoveRow = (key: string) => { quoteRef.current?.removeRow(key); };
  const onQuoteConfirm = () => { quoteRef.current?.requestConfirm(); };
  const onQuoteCancelConfirm = () => { quoteRef.current?.cancelConfirm(); };
  const onQuoteSubmit = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    void quoteRef.current?.submit();
  };

  const onCompletionConfirm = () => { completionRef.current?.requestConfirm(); };
  const onCompletionCancel = () => { completionRef.current?.cancelConfirm(); };
  const onCompletionSubmit = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    void completionRef.current?.submit();
  };

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
  const [deletingEvidenceId, setDeletingEvidenceId] = useState<string | null>(null);
  const handleDeleteEvidencePhoto = (photoId: string) => {
    Alert.alert('Xóa ảnh', 'Bạn có chắc muốn xóa ảnh này? Không thể hoàn tác.', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: async () => {
          const latest = latestRef.current;
          if (!latest.order || latest.order.id !== latest.serviceOrderId) return;
          const target = latest.order.id;
          setDeletingEvidenceId(photoId);
          try {
            await ordersApi.deleteEvidence(target, photoId);
            await evidenceRef.current?.refreshEvidence(() => isEvidenceReadable(target));
          } catch (err: unknown) {
            Alert.alert('Lỗi', extractApiErrorMessage(err, 'Không thể xóa ảnh. Vui lòng thử lại.'));
          } finally {
            setDeletingEvidenceId(null);
          }
        },
      },
    ]);
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
  const onDeclareCash = () => {
    if (!order) return;
    Alert.alert(
      'Khai báo đã nhận tiền mặt',
      'Xác nhận bạn đã nhận đúng ' + formatVnd(order.grandTotal) +
        ' theo tổng tiền Hệ thống. Khách hàng vẫn phải xác nhận riêng trước khi hóa đơn đã thanh toán.',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Khai báo',
          onPress: () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            void cashRef.current?.declare('Kỹ thuật viên xác nhận đã nhận đủ tiền mặt theo hóa đơn.');
          },
        },
      ],
    );
  };
  const onCashReconcile = () => { void cashRef.current?.reconcile(); };
  const onProposalField = {
    reason: (value: string) => { proposalRef.current?.setField('reason', value); },
    description: (value: string) => { proposalRef.current?.setField('description', value); },
    quantity: (value: string) => { proposalRef.current?.setField('quantity', value); },
    unitPrice: (value: string) => { proposalRef.current?.setField('unitPrice', value); },
    note: (value: string) => { proposalRef.current?.setField('note', value); },
  };
  // Same reasoning as the quotation labor row above: no quantity field shown,
  // kept at 1 so the shared line validation never blocks on it.
  useEffect(() => {
    if (!proposalState.draft.quantity) {
      proposalRef.current?.setField('quantity', '1');
    }
  }, [proposalState.draft.quantity]);
  const onProposalConfirm = () => { proposalRef.current?.requestConfirm(); };
  const onProposalCancelConfirm = () => { proposalRef.current?.cancelConfirm(); };
  const onProposalSubmit = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    void proposalRef.current?.submit();
  };
  const sections = resolveOrderDetailSections(order);
  const cashEligible = technicianCashTarget(order && order.id === serviceOrderId ? {
    id: order.id,
    status: order.status,
    paymentStatus: order.paymentStatus,
    completionRequestedAt: order.completionRequestedAt,
    grandTotal: order.grandTotal,
    historical: order.historical,
  } : null);
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
  const isFixedPriceOrder = String(order?.pricingMode ?? '').toLowerCase() === 'fixed_price';
  // T-NATIVE-07A read-only UNDER_REPAIR readiness: server truth only, unknown
  // stays neutral. BEFORE counts only a finite positive server count; pricing
  // is fixed_price or an explicitly APPROVED inspection quotation; the started
  // row follows the verified UNDER_REPAIR status at the render site below.
  const repairBeforeRecorded = typeof order?.beforeEvidenceCount === 'number' &&
    Number.isFinite(order.beforeEvidenceCount) &&
    order.beforeEvidenceCount > 0;
  const repairPricingMode = String(order?.pricingMode ?? '').toLowerCase();
  const repairQuoteApproved = order?.quotation
    ? String(order.quotation.status).toUpperCase() === 'APPROVED'
    : false;
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
  // POST remains the final validator.
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
  // T-NATIVE-08B read-only pending hero: server truth only. Server
  // completionRequestedAt (nonempty) means the request is logged;
  // controller requested is true only after a confirmed successful POST
  // this focus (ambiguous needsVerify is never success).
  const completionPendingRequested = !!order?.completionRequestedAt ||
    (completionState.requested && !completionState.needsVerify);
  const pendingAfterCount = order?.afterEvidenceCount;
  const completionPendingAfterText = typeof pendingAfterCount === 'number' &&
    Number.isFinite(pendingAfterCount) &&
    pendingAfterCount > 0
    ? `Đã ghi nhận ${pendingAfterCount} ảnh sau sửa`
    : pendingAfterCount === 0
      ? 'Không có ảnh AFTER được ghi nhận'
      : 'Chưa xác định ảnh AFTER đã lưu';
  const completionPendingCustomerText = order?.customerConfirmed === true
    ? 'Khách đã xác nhận nghiệm thu'
    : order?.customerConfirmed === false
      ? 'Chờ khách xác nhận nghiệm thu'
      : 'Chưa xác định trạng thái nghiệm thu';
  const pendingPaymentStatus = String(order?.paymentStatus ?? '').toUpperCase();
  const completionPendingPaymentText = pendingPaymentStatus === 'PAID'
    ? 'Đã thanh toán'
    : pendingPaymentStatus === 'UNPAID'
      ? 'Chưa thanh toán'
      : 'Chưa xác định trạng thái thanh toán';

  // Action cards open on the step the technician is on; everything stays reachable.
  const st = order ? String(order.status).toUpperCase() : '';
  const beforeOpen = st === 'EN_ROUTE' && (typeof order?.beforeEvidenceCount !== 'number' || order.beforeEvidenceCount < 1);
  const quoteOpen = st === 'EN_ROUTE' && order?.arrivalVerified === true;
  const repairOpen = st === 'UNDER_REPAIR' && !order?.completionRequestedAt;
  const completionOpen = st === 'COMPLETED' ||
    (st === 'UNDER_REPAIR' && (!!order?.completionRequestedAt || completionState.requested));
  const statusView = order ? serviceOrderStatusView(order.status) : null;
  const beforeEvidenceStep = selectEvidenceDisplayPriority({
    needsVerify: uploadState.needsVerify,
    hasPendingPhoto: !!uploadState.pending,
    recordedCount: order?.beforeEvidenceCount,
  });
  const afterEvidenceStep = selectAfterEvidenceDisplayPriority({
    needsVerify: afterUploadState.needsVerify,
    hasPendingPhoto: !!afterUploadState.pending,
    recordedCount: order?.afterEvidenceCount,
    hasPendingCosts,
  });

  // Compose the next-step display from the existing order state, controller
  // state, and target/blocker helpers. This only selects presentation; action
  // handlers and their guards remain in their existing controllers.
  const primaryAction: WorkOrderNextAction | null = (() => {
    if (st === 'ACCEPTED') {
      return {
        kind: 'begin-travel',
        heading: 'Bắt đầu di chuyển',
        description: 'Báo cho hệ thống biết bạn đang trên đường đến địa chỉ khách hàng.',
        buttonLabel: 'Bắt đầu di chuyển',
        disabled: enRouteBusy || !canDepartNow(order?.departAvailableAt, nowTick),
        busy: enRouteBusy,
      };
    }

    if (st === 'EN_ROUTE') {
      if (startRepairState.started) {
        return {
          kind: 'start-repair',
          heading: 'Đã bắt đầu sửa chữa',
          description: 'Hệ thống đã ghi nhận yêu cầu bắt đầu sửa chữa.',
        };
      }
      if (order?.arrivalVerified !== true) {
        return {
          kind: 'check-in',
          heading: 'Check-in tại nhà khách',
          description: 'Chỉ check-in khi bạn đã có mặt tại địa chỉ khách hàng.',
          buttonLabel: 'Check-in tại nhà khách',
          disabled: checkInBusy,
          busy: checkInBusy,
        };
      }
      if (beforeEvidenceStep === 'reconcile') {
        return {
          kind: 'reconcile-before-evidence',
          heading: 'Xác minh ảnh trước sửa chữa',
          description: 'Không tải lại ảnh khi lần trước đang chờ xác minh.',
          buttonLabel: 'Kiểm tra bằng chứng',
          disabled: uploadState.busy,
          busy: uploadState.busy,
        };
      }
      if (beforeEvidenceStep === 'upload') {
        return {
          kind: 'upload-before-evidence',
          heading: 'Tải ảnh trước sửa chữa',
          description: 'Ảnh đã chọn. Tải ảnh lên để hệ thống kiểm tra bằng chứng.',
          buttonLabel: 'Tải ảnh lên',
          disabled: uploadState.busy,
          busy: uploadState.busy,
        };
      }
      if (beforeEvidenceStep === 'capture') {
        return {
          kind: 'capture-before-evidence',
          heading: 'Tải ảnh trước sửa chữa',
          description: 'Hệ thống đã xác minh check-in. Hãy tải bằng chứng trước sửa; số lượng tối thiểu cấu hình và đúng người tải vẫn do hệ thống kiểm tra khi bắt đầu sửa.',
          buttonLabel: 'Chụp ảnh trước sửa',
          disabled: uploadState.busy,
          busy: uploadState.busy,
        };
      }
      if (
        String(order?.pricingMode ?? '').toLowerCase() === 'inspection_required' &&
        String(order?.quotation?.status ?? '').toUpperCase() !== 'APPROVED'
      ) {
        return {
          kind: 'await-quotation',
          heading: 'Báo giá khảo sát',
          description: 'Dịch vụ khảo sát chỉ được bắt đầu sửa sau khi khách duyệt báo giá.',
          waitingMessage: String(order?.quotation?.status ?? '').toUpperCase() === 'SENT'
            ? 'Đang chờ khách duyệt báo giá.'
            : 'Tạo báo giá ở phần Báo giá bên dưới.',
        };
      }
      if (startRepairEligible) {
        return {
          kind: 'start-repair',
          heading: 'Bắt đầu sửa chữa',
          description: 'Đã đủ điều kiện theo dữ liệu hiện tại. Xác nhận để gửi yêu cầu bắt đầu sửa chữa.',
          buttonLabel: startRepairState.needsVerify ? 'Kiểm tra trạng thái' : 'Bắt đầu sửa chữa',
          disabled: refreshing,
        };
      }

      return {
        kind: 'start-repair-blocked',
        heading: 'Kiểm tra điều kiện bắt đầu sửa',
        description: 'Hoàn tất các điều kiện bên dưới trước khi bắt đầu sửa.',
      };
    }

    if (st === 'UNDER_REPAIR') {
      if (completionState.requested || !!order?.completionRequestedAt) {
        return {
          kind: 'await-customer-acceptance',
          heading: 'Đã yêu cầu hoàn thành',
          description: 'Chờ khách nghiệm thu. Yêu cầu hoàn thành không đồng nghĩa đã thanh toán hoặc đơn đã hoàn thành.',
        };
      }
      // Recover ambiguous uploads first, then upload any selected additional
      // evidence regardless of the already recorded photo count. Pending
      // additional costs still block completion through its existing gate.
      if (afterEvidenceStep === 'reconcile') {
        return {
          kind: 'reconcile-after-evidence',
          heading: 'Xác minh ảnh sau sửa',
          description: 'Không gửi ảnh lại. Chỉ kiểm tra bằng chứng mới được gỡ khóa lần tải trước.',
          buttonLabel: 'Kiểm tra bằng chứng',
          disabled: afterUploadState.busy,
          busy: afterUploadState.busy,
        };
      }
      if (afterEvidenceStep === 'upload') {
        return {
          kind: 'upload-after-evidence',
          heading: 'Tải ảnh sau sửa chữa',
          description: 'Ảnh đã chọn. Tải ảnh lên để hệ thống kiểm tra bằng chứng.',
          buttonLabel: 'Tải ảnh lên',
          disabled: afterUploadState.busy,
          busy: afterUploadState.busy,
        };
      }
      if (afterEvidenceStep === 'await-cost') {
        return {
          kind: 'await-additional-cost-decision',
          heading: 'Chờ phản hồi chi phí phát sinh',
          description: 'Khách cần duyệt hoặc từ chối khoản phát sinh. Từ chối khoản này không đồng nghĩa từ chối báo giá ban đầu hay hủy đơn.',
        };
      }
      if (afterEvidenceStep === 'capture') {
        return {
          kind: 'capture-after-evidence',
          heading: 'Tải ảnh sau sửa chữa',
          description: 'Hãy tải bằng chứng sau sửa. Số lượng tối thiểu thật vẫn do hệ thống cấu hình và kiểm tra khi yêu cầu hoàn thành.',
          buttonLabel: 'Chụp ảnh sau sửa',
          disabled: afterUploadState.busy,
          busy: afterUploadState.busy,
        };
      }
      if (completionEligible) {
        return {
          kind: 'request-completion',
          heading: 'Đủ điều kiện sơ bộ để yêu cầu hoàn thành',
          description: 'Hệ thống vẫn kiểm tra số ảnh sau sửa cấu hình, báo giá và mọi chi phí đang chờ.',
          buttonLabel: 'Gửi yêu cầu nghiệm thu',
          disabled: completionState.busy || completionState.needsVerify,
          busy: completionState.busy,
          confirming: completionState.confirming,
          confirmationCopy: REQUEST_COMPLETION_CONFIRM_COPY,
        };
      }
      return {
        kind: 'completion-blocked',
        heading: 'Chưa sẵn sàng yêu cầu hoàn thành',
        description: 'Hoàn tất các điều kiện bên dưới trước khi gửi yêu cầu nghiệm thu.',
      };
    }

    return null;
  })();

  const readiness: WorkOrderReadinessChecklist | null = st === 'EN_ROUTE'
    ? {
        title: 'Điều kiện bắt đầu sửa',
        items: startRepairBlockers,
        emptyMessage: 'Các điều kiện hiển thị đã sẵn sàng. Hệ thống vẫn kiểm tra lại khi bắt đầu sửa.',
      }
    : st === 'UNDER_REPAIR'
      ? {
          title: 'Điều kiện yêu cầu nghiệm thu',
          items: completionBlockers,
          emptyMessage: 'Các điều kiện hiển thị đã sẵn sàng. Hệ thống vẫn kiểm tra lại khi gửi yêu cầu.',
        }
      : null;

  const secondaryActions: ('contact' | 'chat')[] = [];
  if (
    order?.historical !== true &&
    st !== 'COMPLETED' &&
    st !== 'CANCELLED'
  ) {
    if (order?.customerPhone || order?.addressSummary) secondaryActions.push('contact');
    if (order?.bookingId) secondaryActions.push('chat');
  }

  const hierarchy = order && statusView
    ? selectTechnicianWorkOrderHierarchy({
        currentState: statusView,
        primaryAction,
        readiness,
        secondaryActions,
      })
    : [];
  const mainHierarchySections = hierarchy.filter((section) => section.kind !== 'secondary-actions');
  const secondaryHierarchySection = hierarchy.find((section) => section.kind === 'secondary-actions');

  // P1A T04/T05 stage-first (presentation only): the P0 pure selector maps the
  // already-computed `primaryAction.kind` plus verified owner-scoped flags to a
  // static Vietnamese stage label. Every flag below is proven from the
  // loader-verified detail, never guessed:
  // - `verifiedOrder` is non-null only after a successful authorized GET for
  //   the exact focused UUID (order present, id matches route, initial load
  //   finished). The loader already suppresses historical summaries, 401/403,
  //   404, retargeted rows and stale accounts into cleared state, so a present
  //   verified order proves non-historical (`!isHistoricalOrder` at fetch),
  //   viewer assignment, and no error at fetch time.
  // - `arrivalVerified` passes through only an explicit boolean from the
  //   canonical ServiceOrder field; unknown stays undefined (fail-closed).
  // - `completionRequested` passes server proof only: a non-empty
  //   `completionRequestedAt` means requested, anything else stays undefined so
  //   early-stage scenes are never blocked by a guessed `false` and repair
  //   scenes can never be forced by a guessed value.
  // - `offline`/`denied` are `false` only on a verified error-free detail
  //   (the successful GET itself proves connectivity/authorization at fetch
  //   time); otherwise undefined (fail-closed).
  // - Action enable flags pass the existing controller values through; a
  //   missing flag only hides the presentational CTA hint, never the existing
  //   controller-wired button. The scene never creates permission or POSTs.
  const verifiedOrder = order && !loading && order.id === serviceOrderId ? order : null;
  const sceneActionDisabled = primaryAction && 'disabled' in primaryAction
    ? (primaryAction.disabled as boolean | undefined)
    : undefined;
  const sceneActionBusy = primaryAction && 'busy' in primaryAction
    ? (primaryAction.busy as boolean | undefined)
    : undefined;
  const sceneActionConfirming = primaryAction && 'confirming' in primaryAction
    ? (primaryAction.confirming as boolean | undefined)
    : undefined;
  const workflowScene = selectTechnicianWorkflowScene({
    actionKind: primaryAction?.kind ?? null,
    orderStatus: verifiedOrder?.status,
    historical: verifiedOrder && !error ? false : undefined,
    assignedToViewer: verifiedOrder && !error ? true : undefined,
    hasError: error ? true : (verifiedOrder ? false : undefined),
    offline: verifiedOrder && !error ? false : undefined,
    denied: verifiedOrder && !error ? false : undefined,
    arrivalVerified: typeof verifiedOrder?.arrivalVerified === 'boolean'
      ? verifiedOrder.arrivalVerified
      : undefined,
    completionRequested: verifiedOrder ? !!verifiedOrder.completionRequestedAt : undefined,
    actionDisabled: sceneActionDisabled,
    actionBusy: sceneActionBusy,
    actionConfirming: sceneActionConfirming,
  });
  // Disclosure is keyed by order. Controllers stay mounted across scene changes.
  const isStageFocus = !!verifiedOrder && !error && workflowScene.sceneId !== 'neutral';
  const localStage = stageView.orderId === serviceOrderId ? stageView : null;
  const staged = verifiedOrder ? technicianWorkflowStages(verifiedOrder, workflowScene.sceneId, localStage?.handover, afterUploadState.needsVerify || !!afterUploadState.pending) : { current: 'neutral' as const, steps: [] };
  const selectedPast = staged.steps.find(step => step.id === localStage?.stage && step.done && step.id !== staged.current);
  const isAllDetails = isStageFocus && localStage?.stage === 'all';
  const showAll = !isStageFocus || localStage?.stage === 'all';
  const activeStage = selectedPast?.id ?? staged.current;
  const selectStage = (stage: TechnicianStageId | 'all' | null, updates: { handover?: boolean; extras?: boolean } = {}) => setStageView({ orderId: serviceOrderId, stage, handover: localStage?.handover ?? false, extras: localStage?.extras ?? false, ...updates });
  const openAllDetails = () => {
    detailsReturnStageRef.current = localStage?.stage === 'all' ? null : (localStage?.stage ?? null);
    selectStage('all');
  };
  const closeAllDetails = useCallback(() => {
    const returnStage = detailsReturnStageRef.current;
    detailsReturnStageRef.current = null;
    setStageView(previous => ({
      orderId: serviceOrderId,
      stage: returnStage,
      handover: previous.orderId === serviceOrderId ? previous.handover : false,
      extras: previous.orderId === serviceOrderId ? previous.extras : false,
    }));
  }, [serviceOrderId]);
  useEffect(() => {
    if (!isAllDetails) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      closeAllDetails();
      return true;
    });
    return () => subscription.remove();
  }, [isAllDetails, closeAllDetails]);
  const stageVisible = (...ids: TechnicianStageId[]) => showAll || (!selectedPast && ids.includes(activeStage));
  const sceneTitle = activeStage === 'repair' ? 'Sửa chữa theo phạm vi đã duyệt'
    : activeStage === 'waiting-acceptance' ? 'Nghiệm thu & thanh toán'
    : activeStage === 'ready-repair' ? 'Phạm vi đã xác nhận'
    : activeStage === 'quotation' && existingQuoteStatus !== 'SENT' ? 'Báo giá khảo sát'
    : workflowScene.title;
  const showPrimaryAction = showAll || (!selectedPast && activeStage !== 'repair' && activeStage !== 'completed-summary' && !(st === 'COMPLETED' && staged.current !== 'completed-summary'));

  // The ONE controller-wired primary-action card (moved, not copied): the exact
  // pre-existing JSX below, now referenced from two mutually exclusive render
  // sites (first viewport when `isStageFocus`, original position otherwise).
  // Exactly one instance ever mounts, so duplicate CTA, handlers,
  // confirmations, or POSTs are impossible. Every button keeps its original
  // onPress/disabled/busy/confirmation wiring; no new handlers or mutations.
  const primaryActionCard = primaryAction ? (
            <View style={styles.compactFooterAction}>
              {mainHierarchySections.map((section) => {
                if (section.kind !== 'primary-action') return null;
                const action = section.value;

                return (
                  <View key={section.kind} style={styles.compactFooterContent}>
                    {!!(action.disabled || action.waitingMessage) && <Text numberOfLines={2} style={styles.footerReason}>{action.disabled ? (action.description || action.waitingMessage || 'Chưa thể thực hiện bước này.') : action.waitingMessage}</Text>}

                    {action.kind === 'begin-travel' && (
                      <TouchableOpacity
                        style={[styles.uploadBtn, styles.nextStepAction]}
                        onPress={onEnRoute}
                        disabled={!!action.disabled}
                        accessibilityRole="button"
                        accessibilityLabel="Bắt đầu di chuyển"
                      >
                        {action.busy ? <ActivityIndicator size="small" color={colors.surface} /> : (
                          <Text style={styles.uploadBtnText}>{action.buttonLabel}</Text>
                        )}
                      </TouchableOpacity>
                    )}

                    {action.kind === 'check-in' && (
                      <TouchableOpacity
                        style={[styles.uploadBtn, styles.nextStepAction]}
                        onPress={onCheckIn}
                        disabled={!!action.disabled}
                        accessibilityRole="button"
                        accessibilityLabel="Check-in tại nhà khách"
                      >
                        {action.busy ? <ActivityIndicator size="small" color={colors.surface} /> : (
                          <Text style={styles.uploadBtnText}>{action.buttonLabel}</Text>
                        )}
                      </TouchableOpacity>
                    )}

                    {action.kind === 'capture-before-evidence' && (
                      <TouchableOpacity
                        style={[styles.uploadBtn, styles.nextStepAction]}
                        onPress={onPickCamera}
                        disabled={!!action.disabled}
                        accessibilityRole="button"
                        accessibilityLabel="Chụp ảnh trước sửa chữa ngay"
                      >
                        <Text style={styles.uploadBtnText}>{action.buttonLabel}</Text>
                      </TouchableOpacity>
                    )}

                    {action.kind === 'upload-before-evidence' && (
                      <TouchableOpacity
                        style={[styles.uploadBtn, styles.nextStepAction]}
                        onPress={onUploadBefore}
                        disabled={!!action.disabled}
                        accessibilityRole="button"
                        accessibilityLabel="Tải ảnh trước sửa chữa lên"
                      >
                        {action.busy ? <ActivityIndicator size="small" color={colors.surface} /> : (
                          <Text style={styles.uploadBtnText}>{action.buttonLabel}</Text>
                        )}
                      </TouchableOpacity>
                    )}

                    {action.kind === 'reconcile-before-evidence' && (
                      <TouchableOpacity
                        style={[styles.uploadBtn, styles.nextStepAction]}
                        onPress={onReconcileBefore}
                        disabled={!!action.disabled}
                        accessibilityRole="button"
                        accessibilityLabel="Kiểm tra bằng chứng trước sửa chữa"
                      >
                        {action.busy ? <ActivityIndicator size="small" color={colors.surface} /> : (
                          <Text style={styles.uploadBtnText}>{action.buttonLabel}</Text>
                        )}
                      </TouchableOpacity>
                    )}

                    {action.kind === 'start-repair' && action.buttonLabel && (
                      <TouchableOpacity
                        style={[styles.uploadBtn, styles.nextStepAction]}
                        onPress={() => { if (startRepairState.needsVerify) onRefresh(); else if (startRepairRef.current) void pressStartRepairFooter(startRepairRef.current, startRepairState.confirming); }}
                        disabled={!!action.disabled || startRepairState.busy}
                        accessibilityRole="button"
                        accessibilityLabel={startRepairState.confirming ? 'Xác nhận bắt đầu sửa chữa' : 'Bắt đầu sửa chữa'}
                      >
                        {startRepairState.busy ? <ActivityIndicator size="small" color={colors.surface} /> : <Text style={styles.uploadBtnText}>{startRepairState.confirming ? 'Xác nhận bắt đầu sửa chữa' : action.buttonLabel}</Text>}
                      </TouchableOpacity>
                    )}
                    {action.kind === 'start-repair' && startRepairState.confirming && <View style={styles.evidenceError}><Text style={styles.jobMeta}>Đơn sẽ chuyển sang trạng thái đang sửa chữa.</Text><TouchableOpacity onPress={() => startRepairRef.current?.cancelConfirm()} disabled={startRepairState.busy} accessibilityRole="button" accessibilityLabel="Hủy xác nhận bắt đầu sửa"><Text style={styles.retryText}>Hủy</Text></TouchableOpacity></View>}
                    {action.kind === 'await-quotation' && <TouchableOpacity style={[styles.uploadBtn, styles.nextStepAction]} onPress={onRefresh} disabled={refreshing} accessibilityRole="button" accessibilityLabel="Cập nhật báo giá"><Text style={styles.uploadBtnText}>{refreshing ? 'Đang cập nhật…' : 'Cập nhật'}</Text></TouchableOpacity>}

                    {action.kind === 'reconcile-after-evidence' && (
                      <TouchableOpacity
                        style={[styles.uploadBtn, styles.nextStepAction]}
                        onPress={onReconcileAfter}
                        disabled={!!action.disabled}
                        accessibilityRole="button"
                        accessibilityLabel="Kiểm tra ảnh sau sửa"
                      >
                        {action.busy ? <ActivityIndicator size="small" color={colors.surface} /> : (
                          <Text style={styles.uploadBtnText}>{action.buttonLabel}</Text>
                        )}
                      </TouchableOpacity>
                    )}

                    {action.kind === 'capture-after-evidence' && (
                      <TouchableOpacity
                        style={[styles.uploadBtn, styles.nextStepAction]}
                        onPress={onPickAfterCamera}
                        disabled={!!action.disabled}
                        accessibilityRole="button"
                        accessibilityLabel="Chụp ảnh sau sửa từ bước tiếp theo"
                      >
                        <Text style={styles.uploadBtnText}>{action.buttonLabel}</Text>
                      </TouchableOpacity>
                    )}

                    {action.kind === 'upload-after-evidence' && (
                      <TouchableOpacity
                        style={[styles.uploadBtn, styles.nextStepAction]}
                        onPress={onUploadAfter}
                        disabled={!!action.disabled}
                        accessibilityRole="button"
                        accessibilityLabel="Tải ảnh sau sửa chữa lên"
                      >
                        {action.busy ? <ActivityIndicator size="small" color={colors.surface} /> : (
                          <Text style={styles.uploadBtnText}>{action.buttonLabel}</Text>
                        )}
                      </TouchableOpacity>
                    )}

                    {action.kind === 'request-completion' && action.buttonLabel && (
                      action.confirming ? (
                        <View style={styles.evidenceError}>
                          <Text style={styles.jobMeta}>{action.confirmationCopy}</Text>
                          <View style={styles.uploadBtnRow}>
                            <TouchableOpacity
                              style={[styles.uploadBtn, { backgroundColor: colors.tone.success.text }]}
                              onPress={onCompletionSubmit}
                              disabled={completionState.busy}
                              accessibilityRole="button"
                              accessibilityLabel="Xác nhận yêu cầu hoàn thành"
                            >
                              {completionState.busy ? <ActivityIndicator size="small" color={colors.surface} /> : (
                                <Text style={styles.uploadBtnText}>Xác nhận</Text>
                              )}
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.uploadBtn, { backgroundColor: colors.divider }]}
                              onPress={onCompletionCancel}
                              disabled={completionState.busy}
                              accessibilityRole="button"
                              accessibilityLabel="Hủy yêu cầu hoàn thành"
                            >
                              <Text style={[styles.uploadBtnText, { color: colors.text }]}>Hủy</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      ) : (
                        <TouchableOpacity
                          style={[styles.uploadBtn, styles.nextStepAction]}
                          onPress={onCompletionConfirm}
                          disabled={!!action.disabled}
                          accessibilityRole="button"
                          accessibilityLabel="Yêu cầu nghiệm thu"
                        >
                          {action.busy ? <ActivityIndicator size="small" color={colors.surface} /> : (
                            <Text style={styles.uploadBtnText}>{action.buttonLabel}</Text>
                          )}
                        </TouchableOpacity>
                      )
                    )}

                    {!!startRepairState.error && <Text numberOfLines={2} style={styles.footerError}>{startRepairState.error}</Text>}
                    {!!completionState.error && <Text numberOfLines={2} style={styles.footerError}>{completionState.error}</Text>}
                  </View>
                );
              })}
            </View>
  ) : null;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom', 'left', 'right']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.surface} />
      <View style={styles.header} testID={isAllDetails ? 'technician-all-details-header' : undefined}>
        <BackButton label={isAllDetails ? 'Đóng toàn bộ chi tiết' : 'Quay lại'} onPress={() => isAllDetails ? closeAllDetails() : navigation.goBack()} />
        <Text style={styles.headerTitle} accessibilityRole="header">{isAllDetails ? 'Toàn bộ chi tiết' : isStageFocus ? `Bước ${Math.max(1, staged.steps.findIndex(step => step.id === activeStage) + 1)}/${staged.steps.length} · ${sceneTitle}` : 'Chi tiết công việc'}</Text>
        <View style={styles.headerBtn} accessible={false} />
      </View>

      {loading ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Đang tải chi tiết công việc…</Text>
        </View>
      ) : !order ? (
        <View style={styles.emptyContainer}>
          <Briefcase size={56} color={colors.muted} strokeWidth={1.5} />
          <Text style={styles.emptyTitle}>Không xem được công việc</Text>
          {!!error && <Text style={styles.emptyDesc}>{error}</Text>}
          <TouchableOpacity onPress={onRefresh} disabled={refreshing} accessibilityRole="button" accessibilityLabel="Thử tải lại chi tiết công việc" style={styles.retryBtn}>
            <Text style={styles.retryText}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
        <ScrollView
          testID={isAllDetails ? 'technician-all-details-scroll' : undefined}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {!!error && (
            <View style={styles.errorBanner} accessibilityRole="alert">
              <Text style={styles.emptyDesc}>{error}</Text>
              <TouchableOpacity onPress={onRefresh} disabled={refreshing} accessibilityRole="button" accessibilityLabel="Thử tải lại chi tiết công việc" style={styles.bannerRetryBtn}>
                <Text style={styles.retryText}>Thử lại</Text>
              </TouchableOpacity>
            </View>
          )}

          {isStageFocus && !isAllDetails && (
            <View testID="technician-stage-focus">
              <TouchableOpacity style={styles.bannerRetryBtn} accessibilityRole="button" accessibilityLabel="Xem tiến độ công việc" onPress={() => setProgressVisible(true)}><Text style={styles.retryText}>Xem tiến độ</Text></TouchableOpacity>
              {!selectedPast && <View style={styles.jobCard} testID="technician-current-stage-context">
                <View style={styles.hierarchyStateRow}><Text style={styles.nextStepEyebrow}>{sceneTitle}</Text>{statusView && <StatusBadge view={statusView} />}</View>
                {!!primaryAction?.description && <Text style={styles.jobMeta}>{primaryAction.description}</Text>}
                {activeStage === 'ready-repair' && startRepairBlockers.map((reason) => <Text key={reason} style={styles.jobMeta}>• {reason}</Text>)}
              </View>}
            </View>
          )}
          {isStageFocus && !isAllDetails && (
            <Modal visible={progressVisible} transparent animationType="slide" onRequestClose={() => setProgressVisible(false)} accessibilityViewIsModal>
              <View style={styles.progressBackdrop}><View style={styles.progressSheet} testID="technician-stage-progress">
              <Text style={styles.sectionTitle}>Tiến độ công việc</Text>
              {staged.steps.map(step => {
                const current = step.id === staged.current || (step.id === 'repair' && staged.current === 'extras-pending') || (step.id === 'scope' && staged.current === 'ready-repair') || (step.id === 'after-evidence' && ['request-completion', 'completion-readiness'].includes(staged.current));
                return <TouchableOpacity key={step.id} accessibilityRole="button" accessibilityLabel={`${step.label}, ${current ? 'hiện tại' : step.done ? 'đã ghi nhận, xem lại' : 'chưa đến bước'}`} accessibilityState={{ disabled: !current && !step.done, selected: activeStage === step.id }} disabled={!current && !step.done} style={[styles.stageChip, current && styles.stageChipCurrent]} onPress={() => { setProgressVisible(false); selectStage(current ? null : step.id); }}><Text style={styles.stageChipText}>{step.done ? '✓ ' : current ? '• ' : ''}{step.label}</Text></TouchableOpacity>;
              })}
              <TouchableOpacity style={styles.bannerRetryBtn} accessibilityRole="button" accessibilityLabel="Đóng tiến độ" onPress={() => setProgressVisible(false)}><Text style={styles.retryText}>Đóng</Text></TouchableOpacity>
              </View></View>
            </Modal>
          )}
          {selectedPast && !showAll && (
            <View style={styles.jobCard} testID="technician-past-stage">
              <Text style={styles.jobMeta}>Thông tin đã được hệ thống ghi nhận · Chỉ đọc</Text>
              {selectedPast.id === 'accepted' && <Text style={styles.jobMeta}>{order.serviceName}{order.addressSummary ? ` · ${order.addressSummary}` : ''}</Text>}
              {selectedPast.id === 'check-in' && <Text style={styles.jobMeta}>Đã xác minh đến nơi bằng GPS</Text>}
              {selectedPast.id === 'before-evidence' && <Text style={styles.jobMeta}>Đã ghi nhận {order.beforeEvidenceCount} ảnh trước sửa</Text>}
              {selectedPast.id === 'after-evidence' && <Text style={styles.jobMeta}>Đã ghi nhận {order.afterEvidenceCount} ảnh sau sửa</Text>}
              {['quotation', 'scope', 'repair'].includes(selectedPast.id) && <><Text style={styles.jobMeta}>{order.scopeDescription || 'Xem các hạng mục đã ghi nhận bên dưới.'}</Text>{quotationItemsList(order).map((item, index) => <Text key={item.id ?? index} style={styles.jobMeta}>{item.description} × {item.quantity} · {amountOrNull(item.lineTotal) ?? '—'}</Text>)}</>}
              {selectedPast.id === 'scope' && order.pricingMode === 'fixed_price' && <><Text style={styles.jobMeta}>Đơn giá: {amountOrNull(order.fixedUnitPrice) ?? 'Chưa có thông tin'}</Text>{typeof order.quantity === 'number' && <Text style={styles.jobMeta}>Số lượng: {order.quantity}</Text>}</>}
              {['quotation', 'scope'].includes(selectedPast.id) && quotationItemsList(order).map((item, index) => typeof (item.warrantyTermDays ?? item.warrantyDays) === 'number' ? <Text key={`warranty-${item.id ?? index}`} style={styles.jobMeta}>{item.description} · Bảo hành {item.warrantyTermDays ?? item.warrantyDays} ngày{typeof item.warrantyFee === 'number' ? ` · ${formatVnd(item.warrantyFee)}` : ''}</Text> : null)}
              <TouchableOpacity style={styles.bannerRetryBtn} accessibilityRole="button" accessibilityLabel="Trở về bước hiện tại" onPress={() => selectStage(null)}><Text style={styles.retryText}>{selectedPast.id === 'scope' ? 'Tiếp tục' : 'Trở về bước hiện tại'}</Text></TouchableOpacity>
            </View>
          )}
          {!isStageFocus && showPrimaryAction && primaryActionCard}
          {isStageFocus && !selectedPast && activeStage === 'repair' && !showAll && (
            <View style={styles.jobCard} testID="technician-repair-workspace">
              <Text style={styles.jobMeta}>{order.scopeDescription || order.serviceName}</Text>
              <TouchableOpacity style={styles.bannerRetryBtn} accessibilityRole="button" accessibilityLabel="Xem phạm vi đã duyệt" disabled={!staged.steps.find(step => step.id === 'scope')?.done} onPress={() => selectStage('scope')}><Text style={styles.retryText}>Xem phạm vi đã duyệt</Text></TouchableOpacity>
              <TouchableOpacity style={styles.bannerRetryBtn} accessibilityRole="button" accessibilityLabel="Có phát sinh?" onPress={() => selectStage(null, { extras: !localStage?.extras })}><Text style={styles.retryText}>{localStage?.extras ? 'Đóng đề xuất' : 'Có phát sinh?'}</Text></TouchableOpacity>
              <TouchableOpacity style={styles.uploadBtn} accessibilityRole="button" accessibilityLabel="Ảnh sau & bàn giao" onPress={() => selectStage(null, { handover: true })}><Text style={styles.uploadBtnText}>Ảnh sau & bàn giao</Text></TouchableOpacity>
            </View>
          )}
          {isStageFocus && !selectedPast && ['quotation', 'extras-pending', 'ready-repair', 'waiting-acceptance'].includes(activeStage) && (
            <TouchableOpacity style={styles.bannerRetryBtn} accessibilityRole="button" accessibilityLabel="Cập nhật từ hệ thống" disabled={refreshing} onPress={onRefresh}><Text style={styles.retryText}>{refreshing ? 'Đang cập nhật…' : 'Cập nhật từ hệ thống'}</Text></TouchableOpacity>
          )}
          {isStageFocus && !selectedPast && localStage?.handover && st === 'UNDER_REPAIR' && !order.completionRequestedAt && <TouchableOpacity style={styles.bannerRetryBtn} accessibilityRole="button" accessibilityLabel="Trở về sửa chữa" onPress={() => selectStage(null, { handover: false })}><Text style={styles.retryText}>Trở về sửa chữa</Text></TouchableOpacity>}
          {isStageFocus && activeStage === 'completed-summary' && !selectedPast && <View style={styles.jobCard}><Text style={styles.sectionTitle}>Đã hoàn thành</Text><Text style={styles.jobMeta}>Khách đã nghiệm thu · Đã thanh toán</Text></View>}

          <View style={!(stageVisible('check-in')) ? styles.sceneHidden : undefined} accessibilityElementsHidden={!(stageVisible('check-in'))} importantForAccessibility={!(stageVisible('check-in')) ? 'no-hide-descendants' : 'auto'}>
{st === 'EN_ROUTE' && order.historical !== true && order.arrivalVerified !== true && (
            <View testID="checkin-prearrival" style={styles.checkInPresentation}>
              <Text style={styles.checkInTitle} accessibilityRole="header">Đến nơi, xác nhận rõ</Text>
              <View
                testID="checkin-locator-art"
                style={styles.checkInLocator}
                accessible={false}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                <View style={styles.checkInOuterRing}>
                  <View style={styles.checkInInnerRing}>
                    <MapPin size={56} color={colors.primaryDark} strokeWidth={1.75} />
                  </View>
                </View>
              </View>
              <View style={styles.checkInCopy}>
                <Text style={styles.checkInTitle} accessibilityRole="header">Check-in tại điểm làm việc</Text>
                <Text style={styles.checkInDescription}>
                  Chỉ xác nhận hiện diện tại thời điểm check-in. Không theo dõi vị trí liên tục.
                </Text>
              </View>
              <View>
                <View testID="checkin-readiness-travel" style={styles.checkInReadinessRow}>
                  <View testID="checkin-travel-checked" style={styles.checkInTravelCheck} accessible={false}>
                    <Check size={12} color={colors.primaryStrong} strokeWidth={1.75} />
                  </View>
                  <Text style={styles.checkInReadinessText}>Đang di chuyển</Text>
                </View>
                <View testID="checkin-readiness-permission" style={styles.checkInReadinessRow}>
                  <Circle size={20} color={colors.textSecondary} strokeWidth={1.75} accessible={false} />
                  <Text style={styles.checkInReadinessText}>Ứng dụng sẽ hỏi quyền vị trí khi check-in</Text>
                </View>
                <View testID="checkin-readiness-arrival" style={styles.checkInReadinessRow}>
                  <Circle size={20} color={colors.textSecondary} strokeWidth={1.75} accessible={false} />
                  <Text style={styles.checkInReadinessText}>Chưa xác minh đến nơi</Text>
                </View>
              </View>
            </View>
          )}
</View>

          <View style={!(stageVisible('before-evidence')) ? styles.sceneHidden : undefined} accessibilityElementsHidden={!(stageVisible('before-evidence'))} importantForAccessibility={!(stageVisible('before-evidence')) ? 'no-hide-descendants' : 'auto'}>
{String(order.status) === 'EN_ROUTE' && order.id === serviceOrderId && order.historical !== true && order.arrivalVerified === true && (
            <View testID="before-evidence-overview" style={styles.beforeOverview}>
              <View style={styles.beforeArrivalBadge}>
                <ShieldCheck size={16} color={colors.tone.success.text} strokeWidth={1.75} accessible={false} />
                <Text style={styles.beforeArrivalText}>Đã xác minh đến nơi</Text>
              </View>
              <View style={styles.beforeOverviewCopy}>
                <Text style={styles.beforeOverviewTitle} accessibilityRole="header">Tình trạng trước sửa</Text>
                <Text style={styles.beforeOverviewDescription}>Ghi nhận ảnh hiện trạng trước khi sửa chữa.</Text>
              </View>
              <View style={styles.beforeEvidencePaper}>
                <Text style={styles.beforeEvidenceLabel}>BEFORE</Text>
                <View
                  testID="before-evidence-placeholder"
                  style={styles.beforeEvidencePlaceholder}
                  accessible={false}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                >
                  <View style={styles.beforeCameraFrame}>
                    <Camera size={64} color={colors.textSecondary} strokeWidth={1.25} />
                  </View>
                </View>
                <Text style={styles.beforeEvidenceCount}>
                  {typeof order.beforeEvidenceCount === 'number' && Number.isFinite(order.beforeEvidenceCount) && order.beforeEvidenceCount > 0
                    ? `Đã ghi nhận ${order.beforeEvidenceCount} ảnh trước sửa`
                    : 'Chưa ghi nhận ảnh trước sửa'}
                </Text>
                {uploadState.needsVerify ? (
                  <Text style={styles.beforeEvidenceNote}>Lần tải ảnh trước đang chờ xác minh.</Text>
                ) : uploadState.pending ? (
                  <Text style={styles.beforeEvidenceNote}>Ảnh đã chọn trên máy chưa được xác minh tải lên.</Text>
                ) : null}
              </View>
              {(order.pricingMode === 'fixed_price' || order.pricingMode === 'inspection_required') && (
                <View testID="before-evidence-pricing" style={styles.beforePricingLabel}>
                  <Text style={styles.beforePricingText}>
                    {order.pricingMode === 'fixed_price' ? 'Giá cố định' : 'Cần khảo sát và báo giá'}
                  </Text>
                </View>
              )}
            </View>
          )}
</View>

          <View style={!(stageVisible('repair')) ? styles.sceneHidden : undefined} accessibilityElementsHidden={!(stageVisible('repair'))} importantForAccessibility={!(stageVisible('repair')) ? 'no-hide-descendants' : 'auto'}>
{st === 'UNDER_REPAIR' && !error && order.historical !== true && order.id === serviceOrderId && (
            <View testID="repair-overview" style={styles.repairOverview}>
              <View style={styles.repairHero}>
                <View
                  testID="repair-hero-art"
                  style={styles.repairHeroArt}
                  accessible={false}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                >
                  <Wrench size={40} color={colors.tone.repair.text} strokeWidth={1.75} />
                </View>
                <Text style={styles.repairHeroTitle} accessibilityRole="header">Đang sửa chữa</Text>
                <Text style={styles.repairHeroSubtitle}>Một công việc đang mở · Không có bộ đếm thời gian giả</Text>
                {!!order.code && <Text style={styles.repairHeroMeta}>Mã đơn: {order.code}</Text>}
              </View>
              <View testID="repair-readiness-before" style={styles.repairReadinessRow}>
                {repairBeforeRecorded ? (
                  <View testID="repair-before-checked" style={styles.repairChecked} accessible={false}>
                    <Check size={12} color={colors.primaryStrong} strokeWidth={1.75} />
                  </View>
                ) : (
                  <Circle size={20} color={colors.textSecondary} strokeWidth={1.75} accessible={false} />
                )}
                <Text style={styles.repairReadinessText}>
                  {repairBeforeRecorded
                    ? `Đã ghi nhận ${order.beforeEvidenceCount} ảnh trước sửa`
                    : 'Chưa ghi nhận ảnh trước sửa'}
                </Text>
              </View>
              <View testID="repair-readiness-pricing" style={styles.repairReadinessRow}>
                {repairPricingMode === 'fixed_price' || (repairPricingMode === 'inspection_required' && repairQuoteApproved) ? (
                  <View testID="repair-pricing-checked" style={styles.repairChecked} accessible={false}>
                    <Check size={12} color={colors.primaryStrong} strokeWidth={1.75} />
                  </View>
                ) : (
                  <Circle size={20} color={colors.textSecondary} strokeWidth={1.75} accessible={false} />
                )}
                <Text style={styles.repairReadinessText}>
                  {repairPricingMode === 'fixed_price'
                    ? 'Giá cố định theo đơn'
                    : repairPricingMode === 'inspection_required' && repairQuoteApproved
                      ? 'Báo giá đã được khách duyệt'
                      : repairPricingMode === 'inspection_required'
                        ? 'Chưa có báo giá được duyệt'
                        : 'Chưa xác định nhánh giá'}
                </Text>
              </View>
              <View testID="repair-readiness-started" style={styles.repairReadinessRow}>
                <View testID="repair-started-checked" style={styles.repairChecked} accessible={false}>
                  <Check size={12} color={colors.primaryStrong} strokeWidth={1.75} />
                </View>
                <Text style={styles.repairReadinessText}>Đã bắt đầu sửa chữa</Text>
              </View>
            </View>
          )}
</View>

          <View style={!(stageVisible('accepted', 'check-in')) ? styles.sceneHidden : undefined} accessibilityElementsHidden={!(stageVisible('accepted', 'check-in'))} importantForAccessibility={!(stageVisible('accepted', 'check-in')) ? 'no-hide-descendants' : 'auto'}>
{st === 'ACCEPTED' && order.historical !== true ? (
            <View style={styles.acceptedOverview}>
              <View testID="accepted-order-hero" style={styles.acceptedHero}>
                <View
                  testID="accepted-order-art"
                  style={styles.acceptedArt}
                  accessible={false}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                >
                  <Wrench size={96} color={colors.primaryStrong} strokeWidth={1.25} />
                </View>
                {statusView && <View><StatusBadge view={statusView} /></View>}
                <Text style={styles.acceptedTitle} accessibilityRole="header">
                  {order.serviceName || 'Dịch vụ sửa chữa'}
                </Text>
                {!!order.code && <Text style={styles.caption}>Mã đơn: {order.code}</Text>}
              </View>

              {!!(order.customerName || order.addressSummary || order.scheduledAt || order.scopeDescription || sections.quantity !== null) && (
                <View testID="accepted-order-information" style={styles.acceptedPaper}>
                  {!!order.customerName && (
                    <View testID="accepted-order-row-customer" style={styles.acceptedInfoRow}>
                      <View style={styles.acceptedInfoLabelRow}>
                        <User size={16} color={colors.textSecondary} strokeWidth={1.75} accessible={false} />
                        <Text style={styles.acceptedInfoLabel}>Khách hàng</Text>
                      </View>
                      <Text style={styles.acceptedInfoValue}>{order.customerName}</Text>
                    </View>
                  )}
                  {!!order.customerNote && <Text style={styles.jobMeta}>Ghi chú khách: {order.customerNote}</Text>}
            {!!order.addressSummary && (
                    <View testID="accepted-order-row-address" style={styles.acceptedInfoRow}>
                      <View style={styles.acceptedInfoLabelRow}>
                        <MapPin size={16} color={colors.textSecondary} strokeWidth={1.75} accessible={false} />
                        <Text style={styles.acceptedInfoLabel}>Địa chỉ thực hiện</Text>
                      </View>
                      <Text style={styles.acceptedInfoValue}>{order.addressSummary}</Text>
                    </View>
                  )}
                  {!!order.customerNote && <Text style={styles.acceptedInfoValue}>Ghi chú khách: {order.customerNote}</Text>}
                  {!!order.scheduledAt && (
                    <View testID="accepted-order-row-schedule" style={styles.acceptedInfoRow}>
                      <View style={styles.acceptedInfoLabelRow}>
                        <Clock size={16} color={colors.textSecondary} strokeWidth={1.75} accessible={false} />
                        <Text style={styles.acceptedInfoLabel}>Lịch hẹn</Text>
                      </View>
                      <Text style={styles.acceptedInfoValue}>{(order.bookingMode || order.slot ? sessionLabel({ ...order, start: order.scheduledAt }) : vnDateTimeString(order.scheduledAt, VN_DATETIME))}</Text>
                    </View>
                  )}
                  {!!order.scopeDescription && (
                    <View testID="accepted-order-row-scope" style={styles.acceptedInfoRow}>
                      <Text style={styles.acceptedInfoLabel}>Phạm vi công việc</Text>
                      <Text style={styles.acceptedInfoValue}>{order.scopeDescription}</Text>
                    </View>
                  )}
                  {sections.quantity !== null && (
                    <View testID="accepted-order-row-quantity" style={styles.acceptedInfoRow}>
                      <Text style={styles.acceptedInfoLabel}>Số lượng</Text>
                      <Text style={styles.acceptedInfoValue}>{sections.quantity}</Text>
                    </View>
                  )}
                </View>
              )}
            </View>
          ) : (
          <View style={styles.jobCard}>
            <View style={styles.summaryTop}>
              {!primaryAction && statusView && <StatusBadge view={statusView} />}
              <Text style={styles.caption}>#{order.code || order.id.slice(0, 8)}</Text>
            </View>
            <Text style={styles.jobTitle}>{order.serviceName || 'Dịch vụ sửa chữa'}</Text>
            {!!order.scheduledAt && (
              <View style={styles.iconRow}>
                <Clock size={16} color={colors.textSecondary} strokeWidth={1.75} style={styles.rowIcon} />
                <Text style={styles.iconRowText}>Lịch hẹn: {(order.bookingMode || order.slot ? sessionLabel({ ...order, start: order.scheduledAt }) : vnDateTimeString(order.scheduledAt, VN_DATETIME))}</Text>
              </View>
            )}
            {!!order.customerNote && <Text style={styles.jobMeta}>Ghi chú khách: {order.customerNote}</Text>}
            {!!order.addressSummary && (
              <View style={styles.iconRow}>
                <MapPin size={16} color={colors.textSecondary} strokeWidth={1.75} style={styles.rowIcon} />
                <Text style={styles.iconRowText}>{order.addressSummary}</Text>
              </View>
            )}
            {!!order.customerName && (
              <View style={styles.iconRow}>
                <User size={16} color={colors.textSecondary} strokeWidth={1.75} style={styles.rowIcon} />
                <Text style={styles.iconRowText}>
                  Khách: {order.customerName}{order.customerPhone ? ` · ${order.customerPhone}` : ''}
                </Text>
              </View>
            )}
            {sections.quantity !== null && (
              <Text style={styles.jobMeta}>Số lượng: {sections.quantity}</Text>
            )}
            {!!order.scopeDescription && (
              <Text style={styles.jobMeta}>Phạm vi: {order.scopeDescription}</Text>
            )}
          </View>
          )}
</View>

          <View style={!(stageVisible('after-evidence', 'request-completion', 'completion-readiness')) ? styles.sceneHidden : undefined} accessibilityElementsHidden={!(stageVisible('after-evidence', 'request-completion', 'completion-readiness'))} importantForAccessibility={!(stageVisible('after-evidence', 'request-completion', 'completion-readiness')) ? 'no-hide-descendants' : 'auto'}>
{st === 'UNDER_REPAIR' && !error && order.historical !== true && order.id === serviceOrderId && !order.completionRequestedAt && !completionState.requested && (
            <View testID="after-overview" style={styles.afterOverview}>
              <View style={styles.afterHero}>
                <View
                  testID="after-hero-art"
                  style={styles.afterHeroArt}
                  accessible={false}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                >
                  <Camera size={40} color={colors.tone.repair.text} strokeWidth={1.75} />
                </View>
                <Text style={styles.afterHeroTitle} accessibilityRole="header">Tình trạng sau sửa</Text>
                <Text style={styles.afterHeroDescription}>Ghi nhận ảnh hiện trạng sau khi sửa chữa.</Text>
              </View>
              <View style={styles.afterEvidencePaper}>
                <Text style={styles.afterEvidenceLabel}>AFTER</Text>
                <View
                  testID="after-evidence-placeholder"
                  style={styles.afterEvidencePlaceholder}
                  accessible={false}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                >
                  <View style={styles.afterCameraFrame}>
                    <Camera size={64} color={colors.textSecondary} strokeWidth={1.25} />
                  </View>
                </View>
                <Text style={styles.afterEvidenceCount}>
                  {typeof order.afterEvidenceCount === 'number' && Number.isFinite(order.afterEvidenceCount) && order.afterEvidenceCount > 0
                    ? `Đã ghi nhận ${order.afterEvidenceCount} ảnh sau sửa`
                    : 'Chưa ghi nhận ảnh sau sửa'}
                </Text>
                {afterUploadState.needsVerify ? (
                  <Text style={styles.afterEvidenceNote}>Lần tải ảnh sau đang chờ xác minh.</Text>
                ) : afterUploadState.pending ? (
                  <Text style={styles.afterEvidenceNote}>Ảnh đã chọn trên máy chưa được xác minh tải lên.</Text>
                ) : null}
              </View>
              <View testID="after-cost-row" style={styles.afterCostRow}>
                <Text style={styles.afterCostText}>
                  {costsState.loading
                    ? 'Đang tải chi phí phát sinh…'
                    : costsState.error
                      ? 'Chưa xác định chi phí phát sinh chờ duyệt.'
                      : hasPendingCosts
                        ? 'Còn chi phí phát sinh chờ khách quyết định'
                        : 'Không có yêu cầu chi phí phát sinh đang chờ duyệt'}
                </Text>
              </View>
            </View>
          )}
</View>

          <View style={!(stageVisible('waiting-acceptance')) ? styles.sceneHidden : undefined} accessibilityElementsHidden={!(stageVisible('waiting-acceptance'))} importantForAccessibility={!(stageVisible('waiting-acceptance')) ? 'no-hide-descendants' : 'auto'}>
{st === 'UNDER_REPAIR' && !error && order.historical !== true && order.id === serviceOrderId && completionPendingRequested && (
            <View testID="completion-pending-overview" style={styles.completionPendingOverview}>
              <View style={styles.completionPendingHero}>
                <View
                  testID="completion-pending-art"
                  style={styles.completionPendingArt}
                  accessible={false}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                >
                  <Clock size={40} color={colors.tone.warning.text} strokeWidth={1.75} />
                </View>
                <Text style={styles.completionPendingTitle} accessibilityRole="header">Đã yêu cầu hoàn thành</Text>
                <View testID="completion-pending-customer">
                  <Text style={styles.completionPendingSubtitle}>{completionPendingCustomerText}</Text>
                </View>
                <Text style={styles.completionPendingNote}>Yêu cầu hoàn thành chưa phải đã hoàn thành. Nghiệm thu, thanh toán là các bước riêng.</Text>
              </View>
              <View style={styles.completionPendingPaper}>
                <View testID="completion-pending-after">
                  <Text style={styles.completionPendingValue}>{completionPendingAfterText}</Text>
                </View>
                <View testID="completion-pending-payment">
                  <Text style={styles.completionPendingValue}>{completionPendingPaymentText}</Text>
                </View>
              </View>
            </View>
          )}
</View>

          <View style={!(showAll) ? styles.sceneHidden : undefined} accessibilityElementsHidden={!(showAll)} importantForAccessibility={!(showAll) ? 'no-hide-descendants' : 'auto'}>
{order.arrivalVerified === true && ['EN_ROUTE', 'UNDER_REPAIR'].includes(String(order.status).toUpperCase()) && !order.completionRequestedAt && (
            <View style={styles.jobCard} testID="replacement-card">
              <Text style={styles.sectionTitle}>Cần thay đổi thợ?</Text>
              {replacementSent ? (
                <Text style={styles.jobMeta}>Đã báo quản lý dịch vụ. Quản lý sẽ liên hệ và sắp xếp thợ khác.</Text>
              ) : (
                <>
                  <Text style={styles.jobMeta}>Dùng khi đã tới nơi và thấy việc nằm ngoài kỹ năng của bạn. Trường hợp này được quản lý xem xét, không tự trừ điểm uy tín.</Text>
                  {replacementOpen && (
                    <TextInput accessibilityLabel="Ghi chú thêm"
                      style={[styles.fieldInput, { minHeight: 80, textAlignVertical: 'top' }]}
                      value={replacementReason}
                      onChangeText={setReplacementReason}
                      placeholder="Ví dụ: máy là loại công nghiệp, cần thợ chuyên"
                      placeholderTextColor={colors.muted}
                      multiline
                      maxLength={1000}
                    />
                  )}
                  <TouchableOpacity
                    style={[styles.uploadBtn, { backgroundColor: colors.primarySoft }]}
                    onPress={replacementOpen ? sendReplacement : () => setReplacementOpen(true)}
                    disabled={replacementBusy}
                    accessibilityRole="button"
                    accessibilityLabel={replacementOpen ? 'Gửi cho quản lý' : 'Cần thay đổi thợ'}
                  >
                    <Text style={[styles.uploadBtnText, { color: colors.primaryStrong }]}>{replacementBusy ? 'Đang gửi…' : replacementOpen ? 'Gửi cho quản lý' : 'Cần thay đổi thợ'}</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}
</View>

          <View style={!(stageVisible('accepted', 'check-in')) ? styles.sceneHidden : undefined} accessibilityElementsHidden={!(stageVisible('accepted', 'check-in'))} importantForAccessibility={!(stageVisible('accepted', 'check-in')) ? 'no-hide-descendants' : 'auto'}>
{secondaryHierarchySection?.kind === 'secondary-actions' && (
            <View style={styles.quickActionsCard}>
              <Text style={styles.quickActionsTitle} accessibilityRole="header">Liên hệ nhanh</Text>
              {secondaryHierarchySection.value.includes('contact') && (
                <ContactActions phone={order.customerPhone} address={order.addressSummary} />
              )}
              {secondaryHierarchySection.value.includes('chat') && (
                <TouchableOpacity
                  style={styles.quickChatAction}
                  onPress={() => handleOpenChat(order.bookingId!)}
                  disabled={openingChat}
                  accessibilityRole="button"
                  accessibilityLabel="Nhắn tin với khách hàng"
                >
                  {openingChat ? (
                    <ActivityIndicator size="small" color={colors.primaryStrong} />
                  ) : (
                    <>
                      <MessageCircle size={18} color={colors.primaryStrong} strokeWidth={1.75} />
                      <Text style={styles.quickChatText}>Nhắn tin với khách</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>
          )}
</View>

          <View style={!(stageVisible('accepted', 'repair', 'completion-readiness')) ? styles.sceneHidden : undefined} accessibilityElementsHidden={!(stageVisible('accepted', 'repair', 'completion-readiness'))} importantForAccessibility={!(stageVisible('accepted', 'repair', 'completion-readiness')) ? 'no-hide-descendants' : 'auto'}>
{order.historical !== true && (
            <TechnicianPartsSection orderId={order.id} orderStatus={order.status} />
          )}
</View>

          <View style={!(showAll) ? styles.sceneHidden : undefined} accessibilityElementsHidden={!(showAll)} importantForAccessibility={!(showAll) ? 'no-hide-descendants' : 'auto'}>
<Text style={styles.groupHeading}>Thao tác</Text>
</View>

          <View style={!(stageVisible('before-evidence')) ? styles.sceneHidden : undefined} accessibilityElementsHidden={!(stageVisible('before-evidence'))} importantForAccessibility={!(stageVisible('before-evidence')) ? 'no-hide-descendants' : 'auto'}>
<CollapsibleCard key={`before-${beforeOpen}`} styles={styles} colors={colors} title="Ảnh trước sửa chữa" defaultOpen={beforeOpen}>
            {!canUploadBefore ? (
              <Text style={styles.jobMeta}>Check-in hợp lệ trước khi tải ảnh.</Text>
            ) : uploadState.needsVerify ? (
              <View style={styles.evidenceError}>
                <Text style={styles.jobMeta}>
                  Lần tải ảnh trước đang chờ Hệ thống xác minh. Chưa gửi lại để tránh trùng lặp.
                </Text>
              </View>
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
                    style={[styles.uploadBtn, { backgroundColor: colors.divider }]}
                    onPress={onDiscardUpload}
                    disabled={uploadState.busy}
                    accessibilityRole="button"
                    accessibilityLabel="Hủy ảnh đã chọn"
                  >
                    <Text style={[styles.uploadBtnText, { color: colors.text }]}>Hủy</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <View style={styles.uploadBtnRow}>
                <TouchableOpacity
                  style={[[styles.uploadBtn, { backgroundColor: colors.primaryStrong }], isStageFocus && !showAll && styles.sceneHidden]}
                  onPress={onPickCamera}
                  accessibilityRole="button"
                  accessibilityLabel="Chụp ảnh trước sửa chữa"
                >
                  <Text style={styles.uploadBtnText}>Chụp ảnh</Text>
                </TouchableOpacity>
              </View>
            )}
            {!!uploadState.error && (
              <View style={styles.evidenceError}>
                <Text style={styles.jobMeta}>{uploadState.error}</Text>
              </View>
            )}
          </CollapsibleCard>
</View>

          <View style={!(stageVisible('quotation', 'ready-repair')) ? styles.sceneHidden : undefined} accessibilityElementsHidden={!(stageVisible('quotation', 'ready-repair'))} importantForAccessibility={!(stageVisible('quotation', 'ready-repair')) ? 'no-hide-descendants' : 'auto'}>
<CollapsibleCard key={`quote-${quoteOpen}`} styles={styles} colors={colors} title={isFixedPriceOrder ? 'Giá cố định' : 'Báo giá'} defaultOpen={quoteOpen}>

            {order.id === serviceOrderId && order.historical !== true && !error && !refreshing && (
              <View testID="quotation-price-branch" style={styles.quoteBranch}>
                <Text style={styles.quoteBranchTitle} accessibilityRole="header">Nhánh giá của đơn</Text>
                <View style={styles.quoteBranchSegments}>
                  {[
                    { mode: 'inspection_required', label: 'Cần khảo sát' },
                    { mode: 'fixed_price', label: 'Giá cố định' },
                  ].map(({ mode, label }) => {
                    const current = String(order.pricingMode ?? '').toLowerCase() === mode;
                    const known = ['fixed_price', 'inspection_required'].includes(String(order.pricingMode ?? '').toLowerCase());
                    return (
                      <View
                        key={mode}
                        style={[styles.quoteBranchOption, current && styles.quoteBranchCurrent]}
                        accessible
                        accessibilityRole="text"
                        accessibilityLabel={`${label}, ${current ? 'áp dụng cho đơn này' : known ? 'không áp dụng cho đơn này' : 'chưa xác định'}, chỉ đọc`}
                      >
                        <Text style={[styles.quoteBranchLabel, current && styles.quoteBranchCurrentLabel]}>{label}</Text>
                        {current && <Text style={styles.quoteBranchCurrentNote}>Đang áp dụng</Text>}
                      </View>
                    );
                  })}
                </View>
                {!['fixed_price', 'inspection_required'].includes(String(order.pricingMode ?? '').toLowerCase()) && (
                  <Text style={styles.quoteBranchNote}>Chưa xác định nhánh giá</Text>
                )}
                {order.quotation && (
                  <View style={styles.quoteBranchStatus}>
                    <Text style={styles.quoteBranchNote}>Trạng thái báo giá</Text>
                    <Text
                      style={styles.quoteBranchStatusLabel}
                      accessibilityLabel={`Trạng thái báo giá: ${quoteStatusLabel(sections.quotationStatus)}`}
                    >
                      {existingQuoteStatus === 'SENT' ? 'Chờ khách duyệt' : quoteStatusLabel(sections.quotationStatus)}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {isFixedPriceOrder && (
              <>
                <Text style={[styles.jobMeta, styles.quoteInfoNote]}>
                  Dịch vụ có giá cố định theo yêu cầu đặt lịch đã gửi; không lập báo giá kiểm tra hiện trường lần nữa.
                </Text>
                {!!order.scopeDescription && (
                  <Text style={styles.jobMeta}>Phạm vi đã đặt: {order.scopeDescription}</Text>
                )}
                <View style={styles.fixedPriceBox}>
                  <Text style={styles.jobMeta}>Đơn giá đã lưu: {vndText(sections.fixedUnitPriceText ?? '—')}</Text>
                  <Text style={styles.jobMeta}>Số lượng đã đặt: {sections.quantity ?? 1}</Text>
                  <Text style={[styles.jobMeta, styles.fixedPriceTotalText]}>
                    Giá công theo yêu cầu đặt lịch:{' '}
                    {order.fixedUnitPrice != null
                      ? formatVnd(order.fixedUnitPrice * (sections.quantity ?? 1))
                      : '—'}
                  </Text>
                  <Text style={[styles.jobMeta, { fontSize: 12 }]}>
                    Không bao gồm chi phí phát sinh được duyệt riêng (nếu có).
                  </Text>
                </View>
              </>
            )}

            {isFixedPriceOrder ? null : !canCreateQuote ? (
              <Text style={styles.jobMeta}>
                Đơn chưa đủ điều kiện tạo báo giá (cần đang di chuyển, đã xác nhận đến nơi,
                chưa có báo giá chờ/duyệt).
              </Text>
            ) : quoteState.sent ? (
              <Text style={styles.jobMeta}>Đã gửi báo giá, chờ khách duyệt.</Text>
            ) : (
              <>
                {quoteState.rows.map((row, index) => {
                  const rowErrors = quoteState.rowErrors[row.key] ?? {};
                  const readOnly = quoteState.busy || quoteState.needsVerify;
                  return (
                    <View key={row.key} style={styles.acItemCard}>
                      <View style={styles.acItemBadgeRow}>
                        <View style={row.kind === 'labor' ? styles.acBadgeLabor : styles.acBadgeParts}>
                          <Text style={styles.acBadgeText}>
                            {row.kind === 'labor' ? `CÔNG THỢ ${index + 1}` : `LINH KIỆN ${index + 1}`}
                          </Text>
                        </View>
                        {row.kind === 'part' && row.warrantyOption === 'paid_warranty' && !!row.warrantyTermDays && (
                          <View style={styles.acWarrantyBadge}>
                            <ShieldCheck size={12} color={colors.tone.success.fg} strokeWidth={2} />
                            <Text style={styles.acWarrantyBadgeText}>{row.warrantyTermDays} ngày</Text>
                          </View>
                        )}
                        {quoteState.rows.length > 1 && (
                          <TouchableOpacity
                            style={styles.iconBtn}
                            onPress={() => onQuoteRemoveRow(row.key)}
                            disabled={readOnly}
                            accessibilityRole="button"
                            accessibilityLabel="Xóa dòng báo giá"
                          >
                            <Trash2 size={18} color={colors.error} strokeWidth={1.75} />
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

                      {row.kind === 'part' && (
                        <View style={{ marginTop: 4 }}>
                          {quotePartSearchRowKey !== row.key ? (
                            <TouchableOpacity accessibilityRole="button"
                              onPress={() => { setQuotePartSearchRowKey(row.key); setQuotePartQuery(''); setQuotePartResults([]); }}
                              disabled={readOnly}
                            >
                              <Text style={styles.acAddPartLink}>Tìm giá trong kho FixHome</Text>
                            </TouchableOpacity>
                          ) : (
                            <View style={styles.acItemCard}>
                              <TextInput accessibilityLabel="Tìm linh kiện"
                                style={styles.fieldInput}
                                value={quotePartQuery}
                                onChangeText={(text) => {
                                  setQuotePartQuery(text);
                                  if (quotePartSearchDebounceRef.current) clearTimeout(quotePartSearchDebounceRef.current);
                                  quotePartSearchDebounceRef.current = setTimeout(async () => {
                                    if (!text.trim()) { setQuotePartResults([]); return; }
                                    setQuotePartSearching(true);
                                    try {
                                      const res = await partsCatalogApi.getCatalog({ search: text.trim(), limit: 30 });
                                      setQuotePartResults(res.data);
                                    } catch {
                                      setQuotePartResults([]);
                                    } finally {
                                      setQuotePartSearching(false);
                                    }
                                  }, 250);
                                }}
                                placeholder="Tìm tên linh kiện, SKU…"
                                placeholderTextColor={colors.muted}
                                autoFocus
                              />
                              {quotePartSearching && <ActivityIndicator size="small" color={colors.primary} />}
                              {quotePartResults.map((part) => (
                                <TouchableOpacity accessibilityRole="button"
                                  key={part.id}
                                  style={styles.acPartResultItem}
                                  onPress={() => {
                                    quoteRef.current?.setRowField(row.key, 'description', part.name);
                                    quoteRef.current?.setRowField(row.key, 'unitPrice', String(part.sellingPrice));
                                    if (part.warrantyDays && part.warrantyDays > 0) {
                                      quoteRef.current?.setWarrantyOption(row.key, 'paid_warranty');
                                      quoteRef.current?.setRowField(row.key, 'warrantyTermDays', String(part.warrantyDays));
                                    }
                                    setQuotePartHints((prev) => ({
                                      ...prev,
                                      [row.key]: part.warrantyDays
                                        ? `Đã điền bảo hành ${part.warrantyDays} ngày theo kho FixHome.`
                                        : `Tham khảo kho FixHome: ${formatVnd(part.sellingPrice)}${part.sku ? ` · SKU ${part.sku}` : ''}`,
                                    }));
                                    setQuotePartSearchRowKey(null);
                                    setQuotePartQuery('');
                                    setQuotePartResults([]);
                                  }}
                                >
                                  <View style={{ flex: 1 }}>
                                    <Text style={styles.resultNameText}>{part.name}{part.sku ? ` (${part.sku})` : ''}</Text>
                                    {!!part.warrantyDays && <Text style={styles.jobMeta}>BH {part.warrantyDays} ngày</Text>}
                                  </View>
                                  <Text style={styles.acPriceText}>{formatVnd(part.sellingPrice)}</Text>
                                </TouchableOpacity>
                              ))}
                              <TouchableOpacity accessibilityRole="button" onPress={() => setQuotePartSearchRowKey(null)}>
                                <Text style={styles.retryText}>Đóng tìm kiếm</Text>
                              </TouchableOpacity>
                            </View>
                          )}
                          {!!quotePartHints[row.key] && (
                            <Text style={[styles.jobMeta, { fontSize: 12, marginTop: 2 }]}>{quotePartHints[row.key]}</Text>
                          )}
                        </View>
                      )}

                      <View style={styles.acItemFieldsRow}>
                        {row.kind === 'part' && (
                          <View style={{ flex: 1 }}>
                            <Text style={styles.acItemFieldLabel}>Số lượng (1–1000)</Text>
                            <View style={styles.qtyRow}>
                              <TouchableOpacity
                                style={styles.qtyBtnSmall}
                                onPress={() => {
                                  const current = parseInt(row.quantity, 10);
                                  const next = Math.max(QUOTE_QUANTITY_MIN, (Number.isFinite(current) ? current : 1) - 1);
                                  quoteRef.current?.setRowField(row.key, 'quantity', String(next));
                                }}
                                disabled={readOnly}
                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                accessibilityRole="button"
                                accessibilityLabel={`Giảm số lượng dòng ${index + 1}`}
                              >
                                <Minus size={16} color={colors.text} strokeWidth={2} />
                              </TouchableOpacity>
                              <Text style={styles.qtyTextSmall}>{row.quantity || '0'}</Text>
                              <TouchableOpacity
                                style={styles.qtyBtnSmall}
                                onPress={() => {
                                  const current = parseInt(row.quantity, 10);
                                  const next = Math.min(QUOTE_QUANTITY_MAX, (Number.isFinite(current) ? current : 0) + 1);
                                  quoteRef.current?.setRowField(row.key, 'quantity', String(next));
                                }}
                                disabled={readOnly}
                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                accessibilityRole="button"
                                accessibilityLabel={`Tăng số lượng dòng ${index + 1}`}
                              >
                                <Plus size={16} color={colors.text} strokeWidth={2} />
                              </TouchableOpacity>
                            </View>
                            {!!rowErrors.quantity && (
                              <Text style={styles.fieldError}>{rowErrors.quantity}</Text>
                            )}
                          </View>
                        )}
                        <View style={{ flex: row.kind === 'part' ? 2 : 1 }}>
                          <Text style={styles.acItemFieldLabel}>Đơn giá (đ)</Text>
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
                        </View>
                      </View>
                      {row.kind === 'part' && (
                        <>
                          <Text style={styles.fieldLabel}>Thời hạn bảo hành (ngày, để trống nếu không bảo hành)</Text>
                          <TextInput
                            style={styles.fieldInput}
                            value={row.warrantyTermDays}
                            onChangeText={(value) => {
                              quoteRef.current?.setWarrantyOption(row.key, value.trim() ? 'paid_warranty' : 'no_warranty');
                              if (value.trim()) quoteRef.current?.setRowField(row.key, 'warrantyTermDays', value);
                            }}
                            editable={!readOnly}
                            keyboardType="numeric"
                            accessibilityLabel={`Thời hạn bảo hành dòng ${index + 1}`}
                          />
                          {!!rowErrors.warrantyTermDays && (
                            <Text style={styles.fieldError}>{rowErrors.warrantyTermDays}</Text>
                          )}
                        </>
                      )}
                    </View>
                  );
                })}
                <View style={styles.uploadBtnRow}>
                  <TouchableOpacity
                    style={[styles.uploadBtn, { backgroundColor: colors.primarySoft }]}
                    onPress={onQuoteAddLabor}
                    disabled={quoteState.busy || quoteState.needsVerify}
                    accessibilityRole="button"
                    accessibilityLabel="Thêm dòng nhân công"
                  >
                    <Text style={[styles.uploadBtnText, { color: colors.primaryStrong }]}>Thêm nhân công</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.uploadBtn, { backgroundColor: colors.primarySoft }]}
                    onPress={onQuoteAddPart}
                    disabled={quoteState.busy || quoteState.needsVerify}
                    accessibilityRole="button"
                    accessibilityLabel="Thêm linh kiện kỹ thuật"
                  >
                    <Text style={[styles.uploadBtnText, { color: colors.primaryStrong }]}>Thêm linh kiện</Text>
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
                      Chi phí dự kiến: {vndText(quoteState.quotedCostText)} (đề xuất, chưa thanh toán).
                    </Text>
                    <View style={styles.uploadBtnRow}>
                      <TouchableOpacity
                        style={[styles.uploadBtn, { backgroundColor: colors.tone.success.text }]}
                        onPress={onQuoteSubmit}
                        disabled={quoteState.busy}
                        accessibilityRole="button"
                        accessibilityLabel="Xác nhận gửi báo giá"
                      >
                        {quoteState.busy ? (
                          <ActivityIndicator size="small" color={colors.surface} />
                        ) : (
                          <Text style={styles.uploadBtnText}>Xác nhận gửi</Text>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.uploadBtn, { backgroundColor: colors.divider }]}
                        onPress={onQuoteCancelConfirm}
                        disabled={quoteState.busy}
                        accessibilityRole="button"
                        accessibilityLabel="Sửa lại báo giá"
                      >
                        <Text style={[styles.uploadBtnText, { color: colors.text }]}>Sửa lại</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[styles.uploadBtn, { backgroundColor: colors.primaryStrong }]}
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

          </CollapsibleCard>
</View>

          <View style={!(showAll || (!selectedPast && activeStage === 'repair' && !!localStage?.extras)) ? styles.sceneHidden : undefined} accessibilityElementsHidden={!(showAll || (!selectedPast && activeStage === 'repair' && !!localStage?.extras))} importantForAccessibility={!(showAll || (!selectedPast && activeStage === 'repair' && !!localStage?.extras)) ? 'no-hide-descendants' : 'auto'}>
<CollapsibleCard key={`proposal-${repairOpen}`} styles={styles} colors={colors} title="Đề xuất chi phí phát sinh" defaultOpen={repairOpen}>
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
                <Text style={styles.fieldLabel}>Mô tả sự cố phát sinh ngoài phạm vi ban đầu</Text>
                <TextInput
                  style={[styles.fieldInput, { minHeight: 70, textAlignVertical: 'top' }]}
                  value={proposalState.draft.reason}
                  onChangeText={onProposalField.reason}
                  editable={!proposalState.busy && !proposalState.needsVerify}
                  maxLength={2000}
                  multiline
                  accessibilityLabel="Lý do chi phí phát sinh"
                />
                {!!proposalState.fieldErrors.reason && (
                  <Text style={styles.fieldError}>{proposalState.fieldErrors.reason}</Text>
                )}

                <View style={styles.acItemsHeaderRow}>
                  <Text style={styles.fieldLabel}>Hạng mục chi phí phát sinh:</Text>
                  {!acShowPartSearch && (
                    <TouchableOpacity accessibilityRole="button"
                      onPress={() => setAcShowPartSearch(true)}
                      disabled={proposalState.busy || proposalState.needsVerify}
                    >
                      <Text style={styles.acAddPartLink}>+ LK FixHome</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Công thợ — always one line on mobile (no multi-line labor list) */}
                <View style={styles.acItemCard}>
                  <View style={styles.acItemBadgeRow}>
                    <View style={styles.acBadgeLabor}>
                      <Text style={styles.acBadgeText}>CÔNG THỢ</Text>
                    </View>
                  </View>
                  <TextInput
                    style={styles.fieldInput}
                    value={proposalState.draft.description}
                    onChangeText={onProposalField.description}
                    editable={!proposalState.busy && !proposalState.needsVerify}
                    maxLength={2000}
                    placeholder="Mô tả công việc phát sinh"
                    placeholderTextColor={colors.muted}
                    accessibilityLabel="Mô tả công việc phát sinh"
                  />
                  {!!proposalState.fieldErrors.description && (
                    <Text style={styles.fieldError}>{proposalState.fieldErrors.description}</Text>
                  )}
                  <View style={styles.acItemFieldsRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.acItemFieldLabel}>Đơn giá công (đ)</Text>
                      <TextInput
                        style={styles.fieldInput}
                        value={proposalState.draft.unitPrice}
                        onChangeText={onProposalField.unitPrice}
                        editable={!proposalState.busy && !proposalState.needsVerify}
                        keyboardType="numeric"
                        accessibilityLabel="Đơn giá phát sinh"
                      />
                    </View>
                  </View>
                  {!!proposalState.fieldErrors.unitPrice && (
                    <Text style={styles.fieldError}>{proposalState.fieldErrors.unitPrice}</Text>
                  )}
                </View>

                {acExtraParts.map((item) => (
                  <View key={item.partCatalogId} style={styles.acItemCard}>
                    <View style={styles.acItemBadgeRow}>
                      <View style={styles.acBadgeParts}>
                        <Text style={styles.acBadgeText}>LK FIXHOME</Text>
                      </View>
                      {!!item.warrantyDays && (
                        <View style={styles.acWarrantyBadge}>
                          <ShieldCheck size={12} color={colors.tone.success.fg} strokeWidth={2} />
                          <Text style={styles.acWarrantyBadgeText}>{item.warrantyDays} ngày</Text>
                        </View>
                      )}
                      <TouchableOpacity
                        style={styles.iconBtn}
                        onPress={() => setAcExtraParts((prev) => prev.filter((i) => i.partCatalogId !== item.partCatalogId))}
                        accessibilityRole="button"
                        accessibilityLabel="Xóa linh kiện"
                      >
                        <Trash2 size={18} color={colors.error} strokeWidth={1.75} />
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.resultNameText}>{item.description}</Text>
                    <View style={styles.acItemFieldsRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.acItemFieldLabel}>Số lượng</Text>
                        <View style={styles.qtyRow}>
                          <TouchableOpacity
                            style={styles.qtyBtnSmall}
                            onPress={() => setAcExtraParts((prev) => prev.map((i) => i.partCatalogId === item.partCatalogId && i.quantity > 1 ? { ...i, quantity: i.quantity - 1 } : i))}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            accessibilityRole="button"
                            accessibilityLabel="Giảm số lượng"
                          >
                            <Minus size={16} color={colors.text} strokeWidth={2} />
                          </TouchableOpacity>
                          <Text style={styles.qtyTextSmall}>{item.quantity}</Text>
                          <TouchableOpacity
                            style={styles.qtyBtnSmall}
                            onPress={() => setAcExtraParts((prev) => prev.map((i) => i.partCatalogId === item.partCatalogId ? { ...i, quantity: i.quantity + 1 } : i))}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            accessibilityRole="button"
                            accessibilityLabel="Tăng số lượng"
                          >
                            <Plus size={16} color={colors.text} strokeWidth={2} />
                          </TouchableOpacity>
                        </View>
                      </View>
                      <View style={{ flex: 2, alignItems: 'flex-end' }}>
                        <Text style={styles.acItemFieldLabel}>Đơn giá kho</Text>
                        <Text style={styles.acPriceText}>{formatVnd(item.unitPrice)}</Text>
                      </View>
                    </View>
                  </View>
                ))}

                {acShowPartSearch && (
                  <View style={styles.acItemCard}>
                    <TextInput accessibilityLabel="Tìm linh kiện FixHome"
                      style={styles.fieldInput}
                      value={acPartQuery}
                      onChangeText={(text) => {
                        setAcPartQuery(text);
                        if (acSearchDebounceRef.current) clearTimeout(acSearchDebounceRef.current);
                        acSearchDebounceRef.current = setTimeout(async () => {
                          if (!text.trim()) { setAcPartResults([]); return; }
                          setAcPartSearching(true);
                          try {
                            const res = await partsCatalogApi.getCatalog({ search: text.trim(), limit: 30 });
                            setAcPartResults(res.data);
                          } catch {
                            setAcPartResults([]);
                          } finally {
                            setAcPartSearching(false);
                          }
                        }, 250);
                      }}
                      placeholder="Tìm linh kiện FixHome, SKU…"
                      placeholderTextColor={colors.muted}
                      autoFocus
                    />
                    {acPartSearching && <ActivityIndicator size="small" color={colors.primary} />}
                    {acPartResults.map((part) => (
                      <TouchableOpacity accessibilityRole="button"
                        key={part.id}
                        style={styles.acPartResultItem}
                        onPress={() => {
                          setAcExtraParts((prev) => {
                            const exists = prev.find((i) => i.partCatalogId === part.id);
                            if (exists) {
                              return prev.map((i) => i.partCatalogId === part.id ? { ...i, quantity: i.quantity + 1 } : i);
                            }
                            return [...prev, {
                              type: 'parts_equipment',
                              description: part.name,
                              quantity: 1,
                              unitPrice: part.sellingPrice,
                              partSource: 'fixhome',
                              partCatalogId: part.id,
                              partNameSnapshot: part.name,
                              warrantyDays: part.warrantyDays ?? undefined,
                            }];
                          });
                          setAcPartQuery('');
                          setAcPartResults([]);
                          setAcShowPartSearch(false);
                        }}
                      >
                        <Text style={[styles.jobMeta, { flex: 1 }]}>{part.name}{part.sku ? ` (${part.sku})` : ''}</Text>
                        <Text style={styles.jobMeta}>{formatVnd(part.sellingPrice)}</Text>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity accessibilityRole="button" onPress={() => { setAcShowPartSearch(false); setAcPartQuery(''); setAcPartResults([]); }}>
                      <Text style={styles.retryText}>Đóng tìm kiếm</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {acExtraParts.length > 0 && (
                  <View style={styles.acFulfillmentBox}>
                    <View style={styles.acItemBadgeRow}>
                      <Package size={16} color={colors.primaryStrong} strokeWidth={1.75} />
                      <Text style={[styles.fieldLabel, { marginTop: 0 }]}>Phương thức nhận linh kiện FixHome:</Text>
                    </View>
                    <TouchableOpacity accessibilityRole="radio" accessibilityState={{ checked: acFulfillment === 'pickup' }} style={styles.radioRow} onPress={() => setAcFulfillment('pickup')}>
                      {acFulfillment === 'pickup' ? <CircleDot size={20} color={colors.primaryStrong} strokeWidth={1.75} /> : <Circle size={20} color={colors.primaryStrong} strokeWidth={1.75} />}
                      <Text style={styles.jobMeta}>Nhận tại kho FixHome (Tự đến lấy — 0đ)</Text>
                    </TouchableOpacity>
                    <TouchableOpacity accessibilityRole="radio" accessibilityState={{ checked: acFulfillment === 'delivery' }} style={styles.radioRow} onPress={() => setAcFulfillment('delivery')}>
                      {acFulfillment === 'delivery' ? <CircleDot size={20} color={colors.primaryStrong} strokeWidth={1.75} /> : <Circle size={20} color={colors.primaryStrong} strokeWidth={1.75} />}
                      <Text style={styles.jobMeta}>Giao đến tận nơi</Text>
                    </TouchableOpacity>
                    {acFulfillment === 'delivery' && (
                      <TextInput accessibilityLabel="Phí giao hàng"
                        style={styles.fieldInput}
                        value={acShippingFee}
                        onChangeText={setAcShippingFee}
                        keyboardType="numeric"
                        placeholder="Phí giao hàng (đ)"
                        placeholderTextColor={colors.muted}
                      />
                    )}
                  </View>
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
                      Đề xuất thêm: {vndText(proposalState.proposedTotalText)} — khách cần duyệt, chưa thanh toán.
                    </Text>
                    <View style={styles.uploadBtnRow}>
                      <TouchableOpacity
                        style={[styles.uploadBtn, { backgroundColor: colors.tone.success.text }]}
                        onPress={onProposalSubmit}
                        disabled={proposalState.busy}
                        accessibilityRole="button"
                        accessibilityLabel="Xác nhận gửi đề xuất chi phí"
                      >
                        {proposalState.busy ? (
                          <ActivityIndicator size="small" color={colors.surface} />
                        ) : (
                          <Text style={styles.uploadBtnText}>Xác nhận gửi</Text>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.uploadBtn, { backgroundColor: colors.divider }]}
                        onPress={onProposalCancelConfirm}
                        disabled={proposalState.busy}
                        accessibilityRole="button"
                        accessibilityLabel="Sửa lại đề xuất chi phí"
                      >
                        <Text style={[styles.uploadBtnText, { color: colors.text }]}>Sửa lại</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[styles.uploadBtn, { backgroundColor: colors.primaryStrong }]}
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
          </CollapsibleCard>
</View>

          <View style={!(stageVisible('after-evidence', 'request-completion', 'completion-readiness', 'extras-pending')) ? styles.sceneHidden : undefined} accessibilityElementsHidden={!(stageVisible('after-evidence', 'request-completion', 'completion-readiness', 'extras-pending'))} importantForAccessibility={!(stageVisible('after-evidence', 'request-completion', 'completion-readiness', 'extras-pending')) ? 'no-hide-descendants' : 'auto'}>
<CollapsibleCard key={`after-${repairOpen}`} styles={styles} colors={colors} title="Ảnh sau sửa chữa" defaultOpen={repairOpen}>
            {!canUploadAfter ? (
              <Text style={styles.jobMeta}>
                Ảnh sau sửa chữa chỉ tải được khi đơn đang sửa và chưa yêu cầu hoàn thành.
              </Text>
            ) : afterUploadState.needsVerify ? (
              <View style={styles.evidenceError}>
                <Text style={styles.jobMeta}>
                  Lần tải ảnh sau sửa trước đang chờ Hệ thống xác minh. Chưa gửi lại để tránh trùng lặp.
                </Text>
              </View>
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
                    style={[styles.uploadBtn, { backgroundColor: colors.divider }]}
                    onPress={onDiscardAfterUpload}
                    disabled={afterUploadState.busy}
                    accessibilityRole="button"
                    accessibilityLabel="Hủy ảnh đã chọn"
                  >
                    <Text style={[styles.uploadBtnText, { color: colors.text }]}>Hủy</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <View style={styles.uploadBtnRow}>
                <TouchableOpacity
                  style={[[styles.uploadBtn, { backgroundColor: colors.primaryStrong }], isStageFocus && !showAll && styles.sceneHidden]}
                  onPress={onPickAfterCamera}
                  accessibilityRole="button"
                  accessibilityLabel="Chụp ảnh sau sửa chữa"
                >
                  <Text style={styles.uploadBtnText}>Chụp ảnh</Text>
                </TouchableOpacity>
              </View>
            )}
            {!!afterUploadState.error && (
              <View style={styles.evidenceError}>
                <Text style={styles.jobMeta}>{afterUploadState.error}</Text>
              </View>
            )}
          </CollapsibleCard>
</View>

          <View style={!(stageVisible('waiting-acceptance', 'completed-summary')) ? styles.sceneHidden : undefined} accessibilityElementsHidden={!(stageVisible('waiting-acceptance', 'completed-summary'))} importantForAccessibility={!(stageVisible('waiting-acceptance', 'completed-summary')) ? 'no-hide-descendants' : 'auto'}>
<CollapsibleCard key={`completion-${completionOpen}`} styles={styles} colors={colors} title="Nghiệm thu" defaultOpen={completionOpen}>
            <Text style={styles.jobMeta}>
              Gửi yêu cầu để khách nghiệm thu. Thanh toán của khách xem ở mục Hóa đơn; khai báo tiền mặt (nếu có) ở thẻ riêng bên dưới.
            </Text>
            {String(order.status).toUpperCase() === 'COMPLETED' ? (
              <View style={styles.evidenceError}>
                <Text style={[styles.jobMeta, { color: colors.tone.success.text, fontWeight: '700' }]}>
                  Đơn đã hoàn thành.
                </Text>
                <Text style={styles.jobMeta}>
                  Thanh toán: {String(order.paymentStatus).toUpperCase() === 'PAID' ? 'Đã thanh toán' : 'Chưa thanh toán'} (xem chi tiết ở mục Hóa đơn).
                </Text>
              </View>
            ) : completionState.requested || !!order.completionRequestedAt ? (
              <View style={styles.evidenceError}>
                <View style={styles.completionStepRow}>
                  <Text style={styles.jobMeta}>1. Khách nghiệm thu dịch vụ</Text>
                  <Text
                    style={[
                      styles.jobMeta,
                      styles.completionStepStatus,
                      { color: order.customerConfirmed ? colors.tone.success.text : colors.tone.warning.text },
                    ]}
                  >
                    {order.customerConfirmed ? 'Đã nghiệm thu' : 'Chờ khách bấm nghiệm thu'}
                  </Text>
                </View>
                <View style={styles.completionStepRow}>
                  <Text style={styles.jobMeta}>2. Thanh toán</Text>
                  <Text
                    style={[
                      styles.jobMeta,
                      styles.completionStepStatus,
                      { color: String(order.paymentStatus).toUpperCase() === 'PAID' ? colors.tone.success.text : colors.tone.warning.text },
                    ]}
                  >
                    {String(order.paymentStatus).toUpperCase() === 'PAID' ? 'Đã thanh toán' : 'Chưa thanh toán'}
                  </Text>
                </View>
                <Text style={[styles.jobMeta, { fontSize: 12, marginTop: 4 }]}>
                  Tiền mặt: khai báo ở thẻ Thanh toán tiền mặt bên dưới. Khách trả online: chờ khách thanh toán trong app; trạng thái thật xem ở mục Hóa đơn.
                </Text>
                <TouchableOpacity onPress={onRefresh} disabled={refreshing} accessibilityRole="button" accessibilityLabel="Kiểm tra trạng thái nghiệm thu" style={styles.bannerRetryBtn}>
                  <Text style={styles.retryText}>{refreshing ? 'Đang kiểm tra…' : 'Kiểm tra trạng thái nghiệm thu'}</Text>
                </TouchableOpacity>
              </View>
            ) : completionEligible ? (
              <Text style={styles.jobMeta}>Gửi yêu cầu nghiệm thu ở thẻ trạng thái hiện tại phía trên.</Text>
            ) : (
              <Text style={styles.jobMeta}>Điều kiện đang chờ được hiển thị ở thẻ trạng thái hiện tại phía trên.</Text>
            )}
          </CollapsibleCard>
</View>

          <View style={!(stageVisible('after-evidence', 'request-completion', 'completion-readiness')) ? styles.sceneHidden : undefined} accessibilityElementsHidden={!(stageVisible('after-evidence', 'request-completion', 'completion-readiness'))} importantForAccessibility={!(stageVisible('after-evidence', 'request-completion', 'completion-readiness')) ? 'no-hide-descendants' : 'auto'}>
{order.historical !== true && <OrderNoteCard orderId={order.id} />}
</View>

          <View style={!(showAll) ? styles.sceneHidden : undefined} accessibilityElementsHidden={!(showAll)} importantForAccessibility={!(showAll) ? 'no-hide-descendants' : 'auto'}>
<Text style={styles.groupHeading}>Chi tiết và lịch sử đơn</Text>
</View>

          <View style={!(stageVisible('repair', 'ready-repair')) ? styles.sceneHidden : undefined} accessibilityElementsHidden={!(stageVisible('repair', 'ready-repair'))} importantForAccessibility={!(stageVisible('repair', 'ready-repair')) ? 'no-hide-descendants' : 'auto'}>
<View style={styles.jobCard}>
            <Text style={styles.sectionTitle}>Chi phí</Text>
            {sections.laborText !== null && (
              <View style={styles.row}>
                <Text style={styles.jobMeta}>Nhân công</Text>
                <Text style={styles.jobMeta}>{vndText(sections.laborText)}</Text>
              </View>
            )}
            {sections.partsText !== null && (
              <View style={styles.row}>
                <Text style={styles.jobMeta}>Vật tư</Text>
                <Text style={styles.jobMeta}>{vndText(sections.partsText)}</Text>
              </View>
            )}
            {sections.totalText !== null ? (
              <View style={styles.row}>
                <Text style={styles.totalLabel}>Tổng cộng</Text>
                <Text style={styles.totalValue}>{vndText(sections.totalText)}</Text>
              </View>
            ) : (
              <Text style={styles.jobMeta}>Chưa có thông tin giá</Text>
            )}
          </View>
</View>

          <View style={!(showAll || activeStage === 'scope' || stageVisible('ready-repair', 'repair')) ? styles.sceneHidden : undefined} accessibilityElementsHidden={!(showAll || activeStage === 'scope' || stageVisible('ready-repair', 'repair'))} importantForAccessibility={!(showAll || activeStage === 'scope' || stageVisible('ready-repair', 'repair')) ? 'no-hide-descendants' : 'auto'}>
{sections.hasQuotation && order.quotation && (
            <View style={styles.jobCard}>
              <Text style={styles.sectionTitle}>Báo giá</Text>
              <Text style={styles.jobMeta}>Trạng thái: {quoteStatusLabel(sections.quotationStatus)}</Text>
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
</View>

          <View style={!(showAll) ? styles.sceneHidden : undefined} accessibilityElementsHidden={!(showAll)} importantForAccessibility={!(showAll) ? 'no-hide-descendants' : 'auto'}>
{sections.hasTimeline && (
            <View style={styles.jobCard}>
              <Text style={styles.sectionTitle}>Tiến độ</Text>
              {order.timeline!.map((entry, index) => (
                <View key={`${entry.status}-${entry.timestamp}-${index}`} style={styles.row}>
                  <Text style={styles.jobMeta}>{entry.title || entry.status}</Text>
                  <Text style={styles.jobMeta}>{vnDateTimeString(entry.timestamp, VN_DATETIME)}</Text>
                </View>
              ))}
            </View>
          )}
</View>

          <View style={!(showAll) ? styles.sceneHidden : undefined} accessibilityElementsHidden={!(showAll)} importantForAccessibility={!(showAll) ? 'no-hide-descendants' : 'auto'}>
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
</View>

          <View style={!(showAll || (!!selectedPast && ['before-evidence','after-evidence'].includes(selectedPast.id))) ? styles.sceneHidden : undefined} accessibilityElementsHidden={!(showAll || (!!selectedPast && ['before-evidence','after-evidence'].includes(selectedPast.id)))} importantForAccessibility={!(showAll || (!!selectedPast && ['before-evidence','after-evidence'].includes(selectedPast.id))) ? 'no-hide-descendants' : 'auto'}>
<View style={styles.jobCard}>
            <Text style={styles.sectionTitle}>Ảnh thực tế</Text>
            {evidenceState.loading && evidenceState.photos.length === 0 && !evidenceState.error ? (
              <Text style={styles.jobMeta}>Đang tải ảnh bằng chứng…</Text>
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
                  {!selectedPast && <TouchableOpacity
                    onPress={() => handleDeleteEvidencePhoto(photo.id)}
                    disabled={deletingEvidenceId === photo.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Xóa ${evidenceTypeLabel(photo.type)}`}
                  >
                    {deletingEvidenceId === photo.id ? (
                      <ActivityIndicator size="small" color={colors.error} />
                    ) : (
                      <Text style={[styles.retryText, { color: colors.error }]}>Xóa ảnh</Text>
                    )}
                  </TouchableOpacity>}
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
</View>

          <View style={!(stageVisible('waiting-acceptance', 'completed-summary')) ? styles.sceneHidden : undefined} accessibilityElementsHidden={!(stageVisible('waiting-acceptance', 'completed-summary'))} importantForAccessibility={!(stageVisible('waiting-acceptance', 'completed-summary')) ? 'no-hide-descendants' : 'auto'}>
<View style={styles.jobCard}>
            <Text style={styles.sectionTitle}>Hóa đơn</Text>
            {invoiceState.loading && !invoiceState.invoice && !invoiceState.error ? (
              <Text style={styles.jobMeta}>Đang tải hóa đơn…</Text>
            ) : invoiceState.invoice ? (
              <>
                <View style={styles.row}>
                  <Text style={styles.jobMeta}>Trạng thái thanh toán</Text>
                  <Text style={styles.jobMeta}>{invoicePaymentLabel(invoiceState.invoice.paymentStatus)}</Text>
                </View>
                {invoiceState.invoice.laborText !== null && (
                  <View style={styles.row}>
                    <Text style={styles.jobMeta}>Nhân công</Text>
                    <Text style={styles.jobMeta}>{vndText(invoiceState.invoice.laborText)}</Text>
                  </View>
                )}
                {invoiceState.invoice.partsText !== null && (
                  <View style={styles.row}>
                    <Text style={styles.jobMeta}>Vật tư</Text>
                    <Text style={styles.jobMeta}>{vndText(invoiceState.invoice.partsText)}</Text>
                  </View>
                )}
                {invoiceState.invoice.totalText !== null ? (
                  <View style={styles.row}>
                    <Text style={styles.totalLabel}>Tổng cộng</Text>
                    <Text style={styles.totalValue}>{vndText(invoiceState.invoice.totalText)}</Text>
                  </View>
                ) : (
                  <Text style={styles.jobMeta}>Chưa rõ tổng tiền.</Text>
                )}
                {!!invoiceState.invoice.issuedText && (
                  <Text style={styles.jobMeta}>Phát hành: {invoiceState.invoice.issuedText}</Text>
                )}
                {!!invoiceState.invoice.paidText && (
                  <Text style={styles.jobMeta}>Đã thanh toán: {vndText(invoiceState.invoice.paidText)}</Text>
                )}
                {invoiceState.invoice.items.map((item) => (
                  <View key={item.id} style={styles.row}>
                    <Text style={styles.jobMeta}>{item.description} × {item.quantity}</Text>
                    <Text style={styles.jobMeta}>{vndText(item.lineTotalText) ?? '—'}</Text>
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
</View>

          <View style={!(stageVisible('waiting-acceptance', 'completed-summary')) ? styles.sceneHidden : undefined} accessibilityElementsHidden={!(stageVisible('waiting-acceptance', 'completed-summary'))} importantForAccessibility={!(stageVisible('waiting-acceptance', 'completed-summary')) ? 'no-hide-descendants' : 'auto'}>
{cashEligible && (
            <View style={styles.jobCard}>
              {/* K08_TECHNICIAN_CASH_SETTLEMENT */}
              <Text style={styles.sectionTitle}>Thanh toán tiền mặt</Text>
              <Text style={styles.jobMeta}>
                Chỉ khai báo đúng tổng tiền Hệ thống. Khai báo của kỹ thuật viên chưa phải đã thanh toán; khách hàng phải xác nhận riêng.
              </Text>
              {cashState.loading ? (
                <Text style={styles.jobMeta}>Đang kiểm tra đối soát tiền mặt…</Text>
              ) : cashState.status === 'NONE' ? (
                <TouchableOpacity
                  style={[styles.uploadBtn, { backgroundColor: colors.primaryStrong, alignSelf: 'flex-start' }]}
                  onPress={onDeclareCash}
                  disabled={cashState.busy || cashState.needsVerify}
                  accessibilityRole="button"
                  accessibilityLabel="Khai báo đã nhận tiền mặt"
                >
                  {cashState.busy ? (
                    <ActivityIndicator size="small" color={colors.surface} />
                  ) : (
                    <Text style={styles.uploadBtnText}>
                      Đã nhận {formatVnd(cashEligible.amount)} tiền mặt
                    </Text>
                  )}
                </TouchableOpacity>
              ) : cashState.status === 'PENDING_CONFIRMATION' ? (
                <Text style={[styles.jobMeta, { color: colors.tone.warning.text, fontWeight: '700' }]}>
                  Đã khai báo {formatVnd(cashState.declaredAmount)}; đang chờ khách xác nhận.
                </Text>
              ) : cashState.status === 'CONFIRMED' ? (
                <Text style={[styles.jobMeta, { color: colors.tone.success.text, fontWeight: '700' }]}>
                  Hệ thống đã xác nhận đối soát tiền mặt.
                </Text>
              ) : (
                <Text style={[styles.jobMeta, { color: colors.tone.danger.text, fontWeight: '700' }]}>
                  Đối soát tiền mặt đang có tranh chấp. Cần xử lý qua yêu cầu hỗ trợ.
                </Text>
              )}
              {cashState.needsVerify && (
                <TouchableOpacity onPress={onCashReconcile} disabled={cashState.busy} accessibilityRole="button">
                  <Text style={styles.retryText}>Kiểm tra đối soát</Text>
                </TouchableOpacity>
              )}
              {!!cashState.error && (
                <Text style={[styles.jobMeta, { color: colors.tone.danger.text }]}>{cashState.error}</Text>
              )}
            </View>
          )}
</View>

          <View style={!(stageVisible('extras-pending', 'repair')) ? styles.sceneHidden : undefined} accessibilityElementsHidden={!(stageVisible('extras-pending', 'repair'))} importantForAccessibility={!(stageVisible('extras-pending', 'repair')) ? 'no-hide-descendants' : 'auto'}>
<View style={styles.jobCard}>
              <Text style={styles.sectionTitle}>Chi phí phát sinh</Text>
            {costsState.loading && costsState.requests.length === 0 && !costsState.error ? (
              <Text style={styles.jobMeta}>Đang tải chi phí phát sinh…</Text>
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
                      <Text style={styles.jobMeta}>{vndText(request.laborText)}</Text>
                    </View>
                  )}
                  {request.partsText !== null && (
                    <View style={styles.row}>
                      <Text style={styles.jobMeta}>Vật tư đề xuất</Text>
                      <Text style={styles.jobMeta}>{vndText(request.partsText)}</Text>
                    </View>
                  )}
                  {!!request.expiresText && (
                    <Text style={styles.jobMeta}>Hạn phản hồi: {request.expiresText}</Text>
                  )}
                  {request.items.map((item) => (
                    <View key={item.id} style={styles.row}>
                      <Text style={styles.jobMeta}>{item.description} × {item.quantity}</Text>
                      <Text style={styles.jobMeta}>{vndText(item.lineTotalText) ?? '—'}</Text>
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
</View>
          {isStageFocus && !isAllDetails && <TouchableOpacity style={styles.bannerRetryBtn} accessibilityRole="button" accessibilityLabel="Xem toàn bộ chi tiết" onPress={openAllDetails}><Text style={styles.retryText}>Xem toàn bộ chi tiết</Text></TouchableOpacity>}
        </ScrollView>
        {isStageFocus && !isAllDetails && showPrimaryAction && <View style={styles.stickyFooter} testID="technician-sticky-footer">{primaryActionCard}</View>}
        </>
      )}
    </SafeAreaView>
  );
}

const getStyles = (colors: ReturnType<typeof useAppTheme>['colors']) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  headerTitle: { fontSize: 18, lineHeight: 24, fontWeight: '700', color: colors.text },
  headerBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { padding: 16, paddingBottom: 48, gap: 12, backgroundColor: colors.background, flexGrow: 1 },
  centerLoading: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 8 },
  emptyTitle: { fontSize: 18, lineHeight: 26, fontWeight: '700', color: colors.text, marginTop: 8 },
  emptyDesc: { fontSize: 14, lineHeight: 20, color: colors.textSecondary, textAlign: 'center' },
  retryBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16, marginTop: 8 },
  bannerRetryBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16 },
  retryText: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.primaryStrong, paddingVertical: 12 },

  acPartResultItem: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.divider },
  acFulfillmentBox: { marginTop: 4, marginBottom: 4, gap: 4, backgroundColor: colors.primarySoft, borderRadius: 14, padding: 12 },
  acItemsHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  acAddPartLink: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.primaryStrong, paddingVertical: 12 },
  acItemCard: { borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 12, marginTop: 8, gap: 8, backgroundColor: colors.background },
  acItemBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  acBadgeLabor: { backgroundColor: colors.tone.repair.bg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  acBadgeParts: { backgroundColor: colors.tone.info.bg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  acBadgeText: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: colors.tone.repair.text },
  acWarrantyBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.tone.success.bg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  acWarrantyBadgeText: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: colors.tone.success.text },
  resultNameText: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.text },
  acItemFieldsRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-end' },
  acItemFieldLabel: { fontSize: 12, lineHeight: 16, color: colors.textSecondary, marginBottom: 4 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyBtnSmall: { width: 44, height: 44, borderRadius: 10, backgroundColor: colors.border, justifyContent: 'center', alignItems: 'center' },
  qtyTextSmall: { fontSize: 16, lineHeight: 24, fontWeight: '700', color: colors.text, minWidth: 24, textAlign: 'center' },
  acPriceText: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.text },
  radioRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  iconBtn: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center', marginLeft: 'auto' },
  errorBanner: { padding: 16, gap: 8, alignItems: 'center', backgroundColor: colors.tone.warning.bg, borderRadius: 14 },

  jobCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  beforeOverview: { gap: 24, paddingBottom: 12 },
  beforeArrivalBadge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.tone.success.bg },
  beforeArrivalText: { flexShrink: 1, fontSize: 12, lineHeight: 16, fontWeight: '500', color: colors.tone.success.text },
  beforeOverviewCopy: { gap: 12 },
  beforeOverviewTitle: { fontSize: 24, lineHeight: 32, fontWeight: '700', color: colors.text },
  beforeOverviewDescription: { fontSize: 14, lineHeight: 24, color: colors.textSecondary },
  beforeEvidencePaper: { borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 16, gap: 8 },
  beforeEvidenceLabel: { alignSelf: 'flex-end', fontSize: 12, lineHeight: 16, fontWeight: '600', color: colors.textSecondary },
  beforeEvidencePlaceholder: { minHeight: 200, borderRadius: 14, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  beforeCameraFrame: { width: '72%', minHeight: 120, borderWidth: 1, borderColor: colors.border, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  beforeEvidenceCount: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: colors.text, textAlign: 'center' },
  beforeEvidenceNote: { fontSize: 12, lineHeight: 20, color: colors.textSecondary, textAlign: 'center' },
  beforePricingLabel: { borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 16 },
  beforePricingText: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.text },
  checkInPresentation: { gap: 24, paddingBottom: 12 },
  checkInTitle: { fontSize: 24, lineHeight: 32, fontWeight: '700', color: colors.text },
  checkInLocator: { minHeight: 230, borderRadius: 24, backgroundColor: colors.tone.info.bg, alignItems: 'center', justifyContent: 'center' },
  checkInOuterRing: { width: 160, height: 160, borderRadius: 80, borderWidth: 1, borderColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' },
  checkInInnerRing: { width: 120, height: 120, borderRadius: 60, borderWidth: 1, borderColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' },
  checkInCopy: { gap: 12 },
  checkInDescription: { fontSize: 14, lineHeight: 24, color: colors.textSecondary },
  checkInReadinessRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  checkInTravelCheck: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.75, borderColor: colors.primaryStrong, alignItems: 'center', justifyContent: 'center' },
  checkInReadinessText: { flex: 1, fontSize: 14, lineHeight: 24, color: colors.text },
  repairOverview: { gap: 12, paddingBottom: 12 },
  repairHero: { backgroundColor: colors.tone.repair.bg, borderRadius: 20, padding: 16, alignItems: 'center', gap: 8 },
  repairHeroArt: { minHeight: 72, alignItems: 'center', justifyContent: 'center' },
  repairHeroTitle: { fontSize: 20, lineHeight: 28, fontWeight: '700', color: colors.text, textAlign: 'center' },
  repairHeroSubtitle: { fontSize: 14, lineHeight: 20, color: colors.textSecondary, textAlign: 'center' },
  repairHeroMeta: { fontSize: 12, lineHeight: 16, fontWeight: '500', color: colors.textSecondary, textAlign: 'center' },
  repairReadinessRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  repairChecked: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.75, borderColor: colors.primaryStrong, alignItems: 'center', justifyContent: 'center' },
  repairReadinessText: { flex: 1, fontSize: 14, lineHeight: 24, color: colors.text },
  afterOverview: { gap: 12, paddingBottom: 12 },
  afterHero: { backgroundColor: colors.tone.repair.bg, borderRadius: 20, padding: 16, alignItems: 'center', gap: 8 },
  afterHeroArt: { minHeight: 72, alignItems: 'center', justifyContent: 'center' },
  afterHeroTitle: { fontSize: 20, lineHeight: 28, fontWeight: '700', color: colors.text, textAlign: 'center' },
  afterHeroDescription: { fontSize: 14, lineHeight: 20, color: colors.textSecondary, textAlign: 'center' },
  afterEvidencePaper: { borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 16, gap: 8 },
  afterEvidenceLabel: { alignSelf: 'flex-end', fontSize: 12, lineHeight: 16, fontWeight: '600', color: colors.textSecondary },
  afterEvidencePlaceholder: { minHeight: 200, borderRadius: 14, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  afterCameraFrame: { width: '72%', minHeight: 120, borderWidth: 1, borderColor: colors.border, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  afterEvidenceCount: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: colors.text, textAlign: 'center' },
  afterEvidenceNote: { fontSize: 12, lineHeight: 20, color: colors.textSecondary, textAlign: 'center' },
  afterCostRow: { borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 16 },
  afterCostText: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: colors.text },
  completionPendingOverview: { gap: 12, paddingBottom: 12 },
  completionPendingHero: { backgroundColor: colors.tone.warning.bg, borderRadius: 20, padding: 16, alignItems: 'center', gap: 8 },
  completionPendingArt: { minHeight: 72, alignItems: 'center', justifyContent: 'center' },
  completionPendingTitle: { fontSize: 20, lineHeight: 28, fontWeight: '700', color: colors.text, textAlign: 'center' },
  completionPendingSubtitle: { fontSize: 14, lineHeight: 20, color: colors.textSecondary, textAlign: 'center' },
  completionPendingNote: { fontSize: 12, lineHeight: 16, color: colors.textSecondary, textAlign: 'center' },
  completionPendingPaper: { borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 16, gap: 8 },
  completionPendingValue: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: colors.text, textAlign: 'center' },
  acceptedOverview: { gap: 24 },
  acceptedHero: { alignItems: 'center', gap: 12, paddingTop: 8 },
  acceptedArt: { minHeight: 160, width: '100%', alignItems: 'center', justifyContent: 'center' },
  acceptedTitle: { fontSize: 24, lineHeight: 32, fontWeight: '700', color: colors.text, textAlign: 'center', alignSelf: 'stretch' },
  acceptedPaper: { backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 16, paddingBottom: 8 },
  acceptedInfoRow: { paddingVertical: 16, gap: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  acceptedInfoLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  acceptedInfoLabel: { fontSize: 12, lineHeight: 16, fontWeight: '500', color: colors.textSecondary, flexShrink: 1 },
  acceptedInfoValue: { fontSize: 14, lineHeight: 24, color: colors.text },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500', color: colors.textSecondary },
  iconRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  rowIcon: { marginTop: 2 },
  iconRowText: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.textSecondary },

  stepper: { flexDirection: 'row', alignItems: 'flex-start', paddingTop: 4 },
  stepItem: { flex: 1, alignItems: 'center', gap: 4 },
  stepDotRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' },
  stepLine: { flex: 1, height: 2, backgroundColor: colors.border },
  stepLineDone: { backgroundColor: colors.primaryStrong },
  stepDot: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surface },
  stepDotDone: { backgroundColor: colors.primaryStrong, borderColor: colors.primaryStrong },
  stepDotCurrent: { borderColor: colors.primaryStrong },
  stepDotInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primaryStrong },
  stepLabel: { fontSize: 12, lineHeight: 16, color: colors.textSecondary, textAlign: 'center' },
  stepLabelCurrent: { color: colors.text, fontWeight: '700' },

  nextStepCard: { borderColor: colors.primaryTint, backgroundColor: colors.primarySoft },
  sceneHidden: { display: 'none' },
  stageNavigation: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stickyFooter: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.divider },
  compactFooterAction: { gap: 4 },
  compactFooterContent: { gap: 4 },
  footerReason: { fontSize: 12, lineHeight: 16, color: colors.textSecondary },
  footerError: { fontSize: 12, lineHeight: 16, color: colors.tone.danger.text },
  progressBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15, 23, 42, 0.35)' },
  progressSheet: { maxHeight: '80%', padding: 16, gap: 8, backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  stageChip: { minHeight: 44, maxWidth: '100%', paddingHorizontal: 12, justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  stageChipCurrent: { backgroundColor: colors.primarySoft, borderColor: colors.primaryStrong },
  stageChipText: { fontSize: 12, lineHeight: 18, color: colors.text, flexShrink: 1 },
  stageFocus: {
    backgroundColor: colors.primarySoft,
    borderRadius: 14,
    padding: 16,
    gap: 4,
    borderWidth: 1,
    borderColor: colors.primaryTint,
  },
  stageFocusEyebrow: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: colors.primaryStrong },
  stageFocusTitle: { fontSize: 20, lineHeight: 28, fontWeight: '700', color: colors.text },
  stageFocusDescription: { fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  nextStepEyebrow: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: colors.primaryStrong },
  hierarchyStateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  hierarchyAction: { gap: 6 },
  readinessCard: { marginTop: 6, padding: 12, gap: 4, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  readinessTitle: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.text },
  quickActionsCard: { backgroundColor: colors.surface, borderRadius: 14, padding: 16, gap: 8, borderWidth: 1, borderColor: colors.border },
  quickActionsTitle: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.textSecondary },
  quickChatAction: { minHeight: 48, borderRadius: 14, backgroundColor: colors.primarySoft, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  quickChatText: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.primaryStrong },
  groupHeading: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.textSecondary, marginTop: 8 },
  nextStepAction: { flex: 0, alignSelf: 'stretch', backgroundColor: colors.primaryStrong, marginTop: 6 },
  nextStepWait: { fontSize: 14, lineHeight: 20, color: colors.tone.warning.text, fontWeight: '600', marginTop: 4 },

  jobTitle: { fontSize: 18, lineHeight: 26, fontWeight: '700', color: colors.text },
  sectionTitle: { fontSize: 16, lineHeight: 24, fontWeight: '600', color: colors.text },
  jobMeta: { fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  completionStepRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 4, marginBottom: 4 },
  completionStepStatus: { fontWeight: '700', textAlign: 'right' },

  collapseHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 44 },
  collapseTitle: { flex: 1, fontSize: 16, lineHeight: 24, fontWeight: '600', color: colors.text },
  collapseBody: { gap: 8, marginTop: 4 },

  evidenceItem: { gap: 4 },
  evidenceThumb: { width: '100%', height: 180, borderRadius: 14, backgroundColor: colors.divider },
  evidencePlaceholder: { height: 120, borderRadius: 14, backgroundColor: colors.divider, justifyContent: 'center', alignItems: 'center', padding: 12 },
  evidenceError: { gap: 8, alignItems: 'center', backgroundColor: colors.tone.warning.bg, borderRadius: 14, padding: 12 },
  uploadBtnRow: { flexDirection: 'row', gap: 12 },
  uploadBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 48, paddingHorizontal: 12, borderRadius: 14 },
  uploadBtnText: { color: colors.surface, fontSize: 14, lineHeight: 20, fontWeight: '700' },
  fieldLabel: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: colors.text, marginTop: 4 },
  fieldInput: {
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.surface,
    borderRadius: 14,
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.textSecondary,
  },
  fieldError: { fontSize: 12, lineHeight: 16, color: colors.error },
  quoteInfoNote: { color: colors.primaryStrong, fontWeight: '600' },
  quoteBranch: { gap: 12, marginBottom: 8 },
  quoteBranchTitle: { fontSize: 16, lineHeight: 24, fontWeight: '600', color: colors.text },
  quoteBranchSegments: { flexDirection: 'row', backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 4, gap: 4 },
  quoteBranchOption: { flex: 1, minWidth: 0, minHeight: 48, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 8, borderRadius: 8, gap: 4 },
  quoteBranchCurrent: { backgroundColor: colors.primarySoft },
  quoteBranchLabel: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: colors.textSecondary, textAlign: 'center' },
  quoteBranchCurrentLabel: { color: colors.primaryStrong, fontWeight: '700' },
  quoteBranchCurrentNote: { fontSize: 12, lineHeight: 16, color: colors.primaryStrong, textAlign: 'center' },
  quoteBranchNote: { fontSize: 12, lineHeight: 16, color: colors.textSecondary },
  quoteBranchStatus: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12, gap: 4 },
  quoteBranchStatusLabel: { fontSize: 16, lineHeight: 24, fontWeight: '600', color: colors.text },
  fixedPriceBox: { backgroundColor: colors.background, borderRadius: 14, padding: 12, gap: 4, marginTop: 8 },
  fixedPriceTotalText: { fontWeight: '700', color: colors.text },
  totalLabel: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.text },
  totalValue: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.primaryStrong },
});
