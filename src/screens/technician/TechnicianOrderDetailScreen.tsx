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
import {
  Briefcase,
  Check,
  ChevronDown,
  ChevronLeft,
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
} from 'lucide-react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
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
import TechnicianPartsSection from './technician-parts-section';
import StatusBadge from '../../components/StatusBadge';
import ContactActions from '../../components/ContactActions';
import OrderNoteCard from '../../components/OrderNoteCard';
import { serviceOrderStatusView } from './technician-status';
import { jobProgress, type StepState } from './technician-job-progress';
import { formatVnd, vndText } from '../../utils/format';
import { findChatForBooking } from './technician-chat-shortcut';
import {
  createTechnicianCashController,
  initialTechnicianCashState,
  technicianCashTarget,
} from './technician-cash-settlement';

import { vnDateTimeString } from '../../utils/vn-time';

const VN_DATETIME = { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' } as const;
type DetailRoute = RouteProp<RootStackParamList, 'TechnicianOrderDetail'>;

function amountOrNull(value: unknown): string | null {
  return typeof value === 'number' ? formatVnd(value) : null;
}

type DetailStyles = ReturnType<typeof getStyles>;
type DetailColors = ReturnType<typeof useAppTheme>['colors'];

/** Where the job is in its lifecycle (display only). */
function JobStepper({ styles, colors, steps }: {
  styles: DetailStyles;
  colors: DetailColors;
  steps: { label: string; state: StepState }[];
}) {
  const current = steps.find((step) => step.state === 'current');
  return (
    <View
      style={styles.stepper}
      accessible
      accessibilityLabel={current ? `Tiến độ công việc, bước hiện tại: ${current.label}` : 'Tiến độ công việc, đã hoàn thành các bước'}
    >
      {steps.map((step, index) => (
        <View key={step.label} style={styles.stepItem}>
          <View style={styles.stepDotRow}>
            <View style={[styles.stepLine, index === 0 && { opacity: 0 }, step.state !== 'todo' && styles.stepLineDone]} />
            <View style={[styles.stepDot, step.state === 'done' && styles.stepDotDone, step.state === 'current' && styles.stepDotCurrent]}>
              {step.state === 'done' ? (
                <Check size={14} color={colors.surface} strokeWidth={3} />
              ) : step.state === 'current' ? (
                <View style={styles.stepDotInner} />
              ) : null}
            </View>
            <View style={[styles.stepLine, index === steps.length - 1 && { opacity: 0 }, step.state === 'done' && styles.stepLineDone]} />
          </View>
          <Text style={[styles.stepLabel, step.state === 'current' && styles.stepLabelCurrent]}>{step.label}</Text>
        </View>
      ))}
    </View>
  );
}

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
  const onCheckIn = () => {
    if (!order) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    void checkInRef.current?.checkIn(order.id);
  };
  const onEnRoute = async () => {
    if (!order || enRouteBusy) return;
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
  const onPickGallery = () => { void uploadRef.current?.pickFromGallery(); };
  const onUploadBefore = () => { void uploadRef.current?.upload(); };
  const onReconcileBefore = () => { void uploadRef.current?.reconcile(); };
  const onDiscardUpload = () => { uploadRef.current?.discard(); };
  const onPickAfterCamera = () => { void afterUploadRef.current?.pickFromCamera(); };
  const onPickAfterGallery = () => { void afterUploadRef.current?.pickFromGallery(); };
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
  const onStartRepairConfirm = () => { startRepairRef.current?.requestConfirm(); };
  const onStartRepairCancel = () => { startRepairRef.current?.cancelConfirm(); };
  const onStartRepairSubmit = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    void startRepairRef.current?.submit();
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

  // Action cards open on the step the technician is on; everything stays reachable.
  const st = order ? String(order.status).toUpperCase() : '';
  const beforeOpen = st === 'EN_ROUTE' && (typeof order?.beforeEvidenceCount !== 'number' || order.beforeEvidenceCount < 1);
  const quoteOpen = st === 'EN_ROUTE' && order?.arrivalVerified === true;
  const repairOpen = st === 'UNDER_REPAIR' && !order?.completionRequestedAt;
  const completionOpen = st === 'COMPLETED' ||
    (st === 'UNDER_REPAIR' && (!!completionEligible || !!order?.completionRequestedAt || completionState.requested));
  const progress = order ? jobProgress(order) : null;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.surface} />
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Quay lại"
        >
          <ChevronLeft size={26} color={colors.text} strokeWidth={1.75} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} accessibilityRole="header">Chi tiết công việc</Text>
        {order?.bookingId ? (
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => handleOpenChat(order.bookingId)}
            disabled={openingChat}
            accessibilityRole="button"
            accessibilityLabel="Nhắn tin với khách hàng"
          >
            {openingChat ? (
              <ActivityIndicator size="small" color={colors.text} />
            ) : (
              <MessageCircle size={22} color={colors.text} strokeWidth={1.75} />
            )}
          </TouchableOpacity>
        ) : (
          <View style={styles.headerBtn} />
        )}
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
            <View style={styles.summaryTop}>
              <StatusBadge view={serviceOrderStatusView(order.status)} />
              <Text style={styles.caption}>#{order.code || order.id.slice(0, 8)}</Text>
            </View>
            <Text style={styles.jobTitle}>{order.serviceName || 'Dịch vụ sửa chữa'}</Text>
            {!!order.scheduledAt && (
              <View style={styles.iconRow}>
                <Clock size={16} color={colors.textSecondary} strokeWidth={1.75} style={styles.rowIcon} />
                <Text style={styles.iconRowText}>Lịch hẹn: {vnDateTimeString(order.scheduledAt, VN_DATETIME)}</Text>
              </View>
            )}
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
            {order.historical !== true && st !== 'COMPLETED' && st !== 'CANCELLED' && (
              <ContactActions phone={order.customerPhone} address={order.addressSummary} />
            )}
            {progress && <JobStepper styles={styles} colors={colors} steps={progress} />}
          </View>

          {order.historical !== true && (
            <TechnicianPartsSection orderId={order.id} orderStatus={order.status} />
          )}

          {String(order.status).toUpperCase() === 'ACCEPTED' && (
            <View style={[styles.jobCard, styles.nextStepCard]}>
              <Text style={styles.nextStepEyebrow}>Bước tiếp theo</Text>
              <Text style={styles.sectionTitle}>Bắt đầu di chuyển</Text>
              <Text style={styles.jobMeta}>
                Báo cho hệ thống biết bạn đang trên đường đến địa chỉ khách hàng.
              </Text>
              <TouchableOpacity
                style={[styles.uploadBtn, styles.nextStepAction]}
                onPress={onEnRoute}
                disabled={enRouteBusy}
                accessibilityRole="button"
                accessibilityLabel="Bắt đầu di chuyển"
              >
                {enRouteBusy ? (
                  <ActivityIndicator size="small" color={colors.surface} />
                ) : (
                  <Text style={styles.uploadBtnText}>Bắt đầu di chuyển</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          {String(order.status).toUpperCase() === 'EN_ROUTE' && (
            <View style={[styles.jobCard, styles.nextStepCard]}>
              <Text style={styles.nextStepEyebrow}>Bước tiếp theo</Text>
              {order.arrivalVerified !== true ? (
                <>
                  <Text style={styles.sectionTitle}>Check-in tại nhà khách</Text>
                  <Text style={styles.jobMeta}>
                    Bấm nút bên dưới khi bạn đã có mặt tại địa chỉ khách hàng để check-in bằng GPS.
                  </Text>
                  <TouchableOpacity
                    style={[styles.uploadBtn, styles.nextStepAction]}
                    onPress={onCheckIn}
                    disabled={checkInBusy}
                    accessibilityRole="button"
                    accessibilityLabel="Check-in tại nhà khách"
                  >
                    {checkInBusy ? (
                      <ActivityIndicator size="small" color={colors.surface} />
                    ) : (
                      <Text style={styles.uploadBtnText}>Check-in tại nhà khách</Text>
                    )}
                  </TouchableOpacity>
                </>
              ) : typeof order.beforeEvidenceCount !== 'number' || order.beforeEvidenceCount < 1 ? (
                <>
                  <Text style={styles.sectionTitle}>Tải ảnh trước sửa chữa</Text>
                  <Text style={styles.jobMeta}>
                    Hệ thống đã xác minh check-in. Hãy tải bằng chứng trước sửa; số lượng tối thiểu cấu hình và đúng người tải vẫn do Hệ thống kiểm tra khi bắt đầu sửa.
                  </Text>
                  <TouchableOpacity
                    style={[styles.uploadBtn, styles.nextStepAction]}
                    onPress={onPickCamera}
                    disabled={uploadState.busy || uploadState.needsVerify}
                    accessibilityRole="button"
                    accessibilityLabel="Chụp ảnh trước sửa chữa ngay"
                  >
                    <Text style={styles.uploadBtnText}>Chụp ảnh trước sửa</Text>
                  </TouchableOpacity>
                </>
              ) : String(order.pricingMode ?? '').toLowerCase() === 'inspection_required' &&
                String(order.quotation?.status ?? '').toUpperCase() !== 'APPROVED' ? (
                <>
                  <Text style={styles.sectionTitle}>Báo giá khảo sát</Text>
                  <Text style={styles.jobMeta}>
                    Ảnh trước sửa đã có trên dữ liệu chi tiết. Dịch vụ khảo sát chỉ được bắt đầu sửa sau khi khách duyệt báo giá.
                  </Text>
                  {String(order.quotation?.status ?? '').toUpperCase() === 'SENT' ? (
                    <Text style={styles.nextStepWait}>Đang chờ khách duyệt báo giá.</Text>
                  ) : (
                    <Text style={styles.nextStepWait}>Tạo báo giá ở phần Báo giá bên dưới.</Text>
                  )}
                </>
              ) : startRepairEligible ? (
                <>
                  <Text style={styles.sectionTitle}>Bắt đầu sửa chữa</Text>
                  <Text style={styles.jobMeta}>
                    {String(order.pricingMode ?? '').toLowerCase() === 'fixed_price'
                      ? 'Dịch vụ giá cố định — không cần báo giá. Hệ thống vẫn kiểm tra toàn bộ điều kiện khi gửi.'
                      : 'Báo giá khảo sát đã được khách duyệt. Hệ thống vẫn là nguồn quyết định cuối cùng.'}
                  </Text>
                  <TouchableOpacity
                    style={[styles.uploadBtn, styles.nextStepAction]}
                    onPress={onStartRepairConfirm}
                    disabled={startRepairState.busy || startRepairState.needsVerify}
                    accessibilityRole="button"
                    accessibilityLabel="Bắt đầu sửa chữa từ bước tiếp theo"
                  >
                    <Text style={styles.uploadBtnText}>Bắt đầu sửa chữa</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={styles.sectionTitle}>Kiểm tra điều kiện bắt đầu sửa</Text>
                  {startRepairBlockers.map((blocker) => (
                    <Text key={blocker} style={styles.jobMeta}>• {blocker}</Text>
                  ))}
                </>
              )}
            </View>
          )}

          {String(order.status).toUpperCase() === 'UNDER_REPAIR' && (
            <View style={[styles.jobCard, styles.nextStepCard]}>
              {/* K06_UNDER_REPAIR_NEXT_STEP */}
              <Text style={styles.nextStepEyebrow}>Bước tiếp theo</Text>
              {order.completionRequestedAt ? (
                <>
                  <Text style={styles.sectionTitle}>Đã yêu cầu hoàn thành</Text>
                  <Text style={styles.jobMeta}>
                    Chờ khách nghiệm thu. Yêu cầu hoàn thành không đồng nghĩa đã thanh toán hoặc Hoàn thành.
                  </Text>
                </>
              ) : hasPendingCosts ? (
                <>
                  <Text style={styles.sectionTitle}>Chờ phản hồi chi phí phát sinh</Text>
                  <Text style={styles.jobMeta}>
                    Khách cần duyệt hoặc từ chối khoản phát sinh. Từ chối khoản này không đồng nghĩa từ chối báo giá ban đầu hay hủy đơn.
                  </Text>
                </>
              ) : afterUploadState.needsVerify ? (
                <>
                  <Text style={styles.sectionTitle}>Xác minh ảnh sau sửa</Text>
                  <Text style={styles.jobMeta}>
                    Không gửi ảnh lại. Chỉ kiểm tra bằng chứng mới được gỡ khóa lần tải trước.
                  </Text>
                  <TouchableOpacity
                    style={[styles.uploadBtn, styles.nextStepAction]}
                    onPress={onReconcileAfter}
                    disabled={afterUploadState.busy}
                    accessibilityRole="button"
                    accessibilityLabel="Kiểm tra ảnh sau sửa"
                  >
                    <Text style={styles.uploadBtnText}>Kiểm tra bằng chứng</Text>
                  </TouchableOpacity>
                </>
              ) : typeof order.afterEvidenceCount !== 'number' || order.afterEvidenceCount < 1 ? (
                <>
                  <Text style={styles.sectionTitle}>Tải ảnh sau sửa chữa</Text>
                  <Text style={styles.jobMeta}>
                    Hãy tải bằng chứng sau sửa. Số lượng tối thiểu thật vẫn do Hệ thống cấu hình và kiểm tra khi yêu cầu hoàn thành.
                  </Text>
                  <TouchableOpacity
                    style={[styles.uploadBtn, styles.nextStepAction]}
                    onPress={onPickAfterCamera}
                    disabled={afterUploadState.busy}
                    accessibilityRole="button"
                    accessibilityLabel="Chụp ảnh sau sửa từ bước tiếp theo"
                  >
                    <Text style={styles.uploadBtnText}>Chụp ảnh sau sửa</Text>
                  </TouchableOpacity>
                </>
              ) : completionEligible ? (
                <>
                  <Text style={styles.sectionTitle}>Đủ điều kiện sơ bộ để yêu cầu hoàn thành</Text>
                  <Text style={styles.jobMeta}>
                    Hệ thống vẫn kiểm tra số ảnh sau sửa cấu hình, báo giá và mọi chi phí đang chờ.
                  </Text>
                  <Text style={styles.nextStepWait}>
                    Gửi yêu cầu nghiệm thu ở mục &quot;Nghiệm thu và thanh toán&quot; bên dưới.
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.sectionTitle}>Chưa sẵn sàng yêu cầu hoàn thành</Text>
                  {completionBlockers.map((blocker) => (
                    <Text key={blocker} style={styles.jobMeta}>• {blocker}</Text>
                  ))}
                </>
              )}
            </View>
          )}

          <Text style={styles.groupHeading}>Thao tác</Text>

          <CollapsibleCard key={`before-${beforeOpen}`} styles={styles} colors={colors} title="Ảnh trước sửa chữa" defaultOpen={beforeOpen}>
            {!canUploadBefore ? (
              <Text style={styles.jobMeta}>Check-in hợp lệ trước khi tải ảnh.</Text>
            ) : uploadState.needsVerify ? (
              <View style={styles.evidenceError}>
                <Text style={styles.jobMeta}>
                  Lần tải ảnh trước đang chờ Hệ thống xác minh. Chưa gửi lại để tránh trùng lặp.
                </Text>
                <TouchableOpacity
                  onPress={onReconcileBefore}
                  disabled={uploadState.busy}
                  accessibilityRole="button"
                  accessibilityLabel="Kiểm tra bằng chứng trước sửa chữa"
                >
                  <Text style={styles.retryText}>
                    {uploadState.busy ? 'Đang kiểm tra…' : 'Kiểm tra bằng chứng'}
                  </Text>
                </TouchableOpacity>
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
                    style={[styles.uploadBtn, { backgroundColor: colors.tone.success.text }]}
                    onPress={onUploadBefore}
                    disabled={uploadState.busy}
                    accessibilityRole="button"
                    accessibilityLabel="Tải lên ảnh trước sửa chữa"
                  >
                    {uploadState.busy ? (
                      <ActivityIndicator size="small" color={colors.surface} />
                    ) : (
                      <Text style={styles.uploadBtnText}>Tải lên</Text>
                    )}
                  </TouchableOpacity>
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
                  style={[styles.uploadBtn, { backgroundColor: colors.primaryStrong }]}
                  onPress={onPickCamera}
                  accessibilityRole="button"
                  accessibilityLabel="Chụp ảnh trước sửa chữa"
                >
                  <Text style={styles.uploadBtnText}>Chụp ảnh</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.uploadBtn, { backgroundColor: colors.primarySoft }]}
                  onPress={onPickGallery}
                  accessibilityRole="button"
                  accessibilityLabel="Chọn ảnh trước sửa chữa từ thư viện"
                >
                  <Text style={[styles.uploadBtnText, { color: colors.primaryStrong }]}>Chọn từ thư viện</Text>
                </TouchableOpacity>
              </View>
            )}
            {!!uploadState.error && (
              <View style={styles.evidenceError}>
                <Text style={styles.jobMeta}>{uploadState.error}</Text>
                {!!uploadState.pending && !uploadState.needsVerify && (
                  <TouchableOpacity onPress={onUploadBefore} disabled={uploadState.busy} accessibilityRole="button">
                    <Text style={styles.retryText}>Thử tải lại</Text>
                  </TouchableOpacity>
                )}
                {uploadState.needsVerify && (
                  <TouchableOpacity onPress={onReconcileBefore} disabled={uploadState.busy} accessibilityRole="button">
                    <Text style={styles.retryText}>Kiểm tra bằng chứng</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </CollapsibleCard>

          <CollapsibleCard key={`quote-${quoteOpen}`} styles={styles} colors={colors} title={isFixedPriceOrder ? 'Giá cố định và bắt đầu sửa chữa' : 'Báo giá và bắt đầu sửa chữa'} defaultOpen={quoteOpen}>

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
                  <Text style={[styles.jobMeta, { fontSize: 11 }]}>
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
                            <TouchableOpacity
                              onPress={() => { setQuotePartSearchRowKey(row.key); setQuotePartQuery(''); setQuotePartResults([]); }}
                              disabled={readOnly}
                            >
                              <Text style={styles.acAddPartLink}>Tìm giá trong kho FixHome</Text>
                            </TouchableOpacity>
                          ) : (
                            <View style={styles.acItemCard}>
                              <TextInput
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
                                <TouchableOpacity
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
                              <TouchableOpacity onPress={() => setQuotePartSearchRowKey(null)}>
                                <Text style={styles.retryText}>Đóng tìm kiếm</Text>
                              </TouchableOpacity>
                            </View>
                          )}
                          {!!quotePartHints[row.key] && (
                            <Text style={[styles.jobMeta, { fontSize: 11, marginTop: 2 }]}>{quotePartHints[row.key]}</Text>
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

            <View style={styles.startRepairDivider} />
            {startRepairState.started ? (
              <Text style={styles.jobMeta}>Đã bắt đầu sửa chữa. Đơn đã chuyển sang trạng thái đang sửa chữa.</Text>
            ) : startRepairEligible ? (
              !startRepairState.confirming ? (
                <TouchableOpacity
                  style={[styles.uploadBtn, { backgroundColor: colors.tone.success.text }]}
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
                      style={[styles.uploadBtn, { backgroundColor: colors.tone.success.text }]}
                      onPress={onStartRepairSubmit}
                      disabled={startRepairState.busy}
                      accessibilityRole="button"
                      accessibilityLabel="Xác nhận bắt đầu sửa chữa"
                    >
                      {startRepairState.busy ? (
                        <ActivityIndicator size="small" color={colors.surface} />
                      ) : (
                        <Text style={styles.uploadBtnText}>Xác nhận</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.uploadBtn, { backgroundColor: colors.divider }]}
                      onPress={onStartRepairCancel}
                      disabled={startRepairState.busy}
                      accessibilityRole="button"
                      accessibilityLabel="Hủy bắt đầu sửa chữa"
                    >
                      <Text style={[styles.uploadBtnText, { color: colors.text }]}>Hủy</Text>
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
        </CollapsibleCard>

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
                    <TouchableOpacity
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
                    <TextInput
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
                      <TouchableOpacity
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
                    <TouchableOpacity onPress={() => { setAcShowPartSearch(false); setAcPartQuery(''); setAcPartResults([]); }}>
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
                    <TouchableOpacity style={styles.radioRow} onPress={() => setAcFulfillment('pickup')}>
                      {acFulfillment === 'pickup' ? <CircleDot size={20} color={colors.primaryStrong} strokeWidth={1.75} /> : <Circle size={20} color={colors.primaryStrong} strokeWidth={1.75} />}
                      <Text style={styles.jobMeta}>Nhận tại kho FixHome (Tự đến lấy — 0đ)</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.radioRow} onPress={() => setAcFulfillment('delivery')}>
                      {acFulfillment === 'delivery' ? <CircleDot size={20} color={colors.primaryStrong} strokeWidth={1.75} /> : <Circle size={20} color={colors.primaryStrong} strokeWidth={1.75} />}
                      <Text style={styles.jobMeta}>Giao đến tận nơi</Text>
                    </TouchableOpacity>
                    {acFulfillment === 'delivery' && (
                      <TextInput
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
                <TouchableOpacity
                  onPress={onReconcileAfter}
                  disabled={afterUploadState.busy}
                  accessibilityRole="button"
                  accessibilityLabel="Kiểm tra bằng chứng sau sửa chữa"
                >
                  <Text style={styles.retryText}>
                    {afterUploadState.busy ? 'Đang kiểm tra…' : 'Kiểm tra bằng chứng'}
                  </Text>
                </TouchableOpacity>
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
                    style={[styles.uploadBtn, { backgroundColor: colors.tone.success.text }]}
                    onPress={onUploadAfter}
                    disabled={afterUploadState.busy}
                    accessibilityRole="button"
                    accessibilityLabel="Tải lên ảnh sau sửa chữa"
                  >
                    {afterUploadState.busy ? (
                      <ActivityIndicator size="small" color={colors.surface} />
                    ) : (
                      <Text style={styles.uploadBtnText}>Tải lên</Text>
                    )}
                  </TouchableOpacity>
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
                  style={[styles.uploadBtn, { backgroundColor: colors.primaryStrong }]}
                  onPress={onPickAfterCamera}
                  accessibilityRole="button"
                  accessibilityLabel="Chụp ảnh sau sửa chữa"
                >
                  <Text style={styles.uploadBtnText}>Chụp ảnh</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.uploadBtn, { backgroundColor: colors.primarySoft }]}
                  onPress={onPickAfterGallery}
                  accessibilityRole="button"
                  accessibilityLabel="Chọn ảnh sau sửa chữa từ thư viện"
                >
                  <Text style={[styles.uploadBtnText, { color: colors.primaryStrong }]}>Chọn từ thư viện</Text>
                </TouchableOpacity>
              </View>
            )}
            {!!afterUploadState.error && (
              <View style={styles.evidenceError}>
                <Text style={styles.jobMeta}>{afterUploadState.error}</Text>
                {!!afterUploadState.pending && !afterUploadState.needsVerify && (
                  <TouchableOpacity onPress={onUploadAfter} disabled={afterUploadState.busy} accessibilityRole="button">
                    <Text style={styles.retryText}>Thử tải lại</Text>
                  </TouchableOpacity>
                )}
                {afterUploadState.needsVerify && (
                  <TouchableOpacity onPress={onReconcileAfter} disabled={afterUploadState.busy} accessibilityRole="button">
                    <Text style={styles.retryText}>Kiểm tra bằng chứng</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </CollapsibleCard>

          <CollapsibleCard key={`completion-${completionOpen}`} styles={styles} colors={colors} title="Nghiệm thu và thanh toán" defaultOpen={completionOpen}>
            <Text style={styles.jobMeta}>
              Quy trình: Khách nghiệm thu dịch vụ đạt chuẩn → Thanh toán (tiền mặt hoặc online) → Hệ thống tự hoàn tất đơn.
            </Text>
            {String(order.status).toUpperCase() === 'COMPLETED' ? (
              <View style={styles.evidenceError}>
                <Text style={[styles.jobMeta, { color: colors.tone.success.text, fontWeight: '700' }]}>
                  Đơn hàng đã hoàn tất thành công. Nghiệm thu, thanh toán và tiền công đã được ghi nhận.
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
                <Text style={[styles.jobMeta, { fontSize: 11, marginTop: 4 }]}>
                  Có thu tiền mặt: khai báo ở thẻ &quot;Thanh toán tiền mặt&quot; bên dưới. Khách trả online: chỉ cần chờ khách thanh toán qua app.
                </Text>
                <TouchableOpacity onPress={onRefresh} disabled={refreshing} accessibilityRole="button">
                  <Text style={styles.retryText}>{refreshing ? 'Đang kiểm tra…' : 'Kiểm tra trạng thái nghiệm thu/thanh toán'}</Text>
                </TouchableOpacity>
              </View>
            ) : completionEligible ? (
              !completionState.confirming ? (
                <TouchableOpacity
                  style={[styles.uploadBtn, { backgroundColor: colors.primaryStrong }]}
                  onPress={onCompletionConfirm}
                  disabled={completionState.busy || completionState.needsVerify}
                  accessibilityRole="button"
                  accessibilityLabel="Yêu cầu hoàn thành"
                >
                  <Text style={styles.uploadBtnText}>Gửi yêu cầu nghiệm thu</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.evidenceError}>
                  <Text style={styles.jobMeta}>{REQUEST_COMPLETION_CONFIRM_COPY}</Text>
                  <View style={styles.uploadBtnRow}>
                    <TouchableOpacity
                      style={[styles.uploadBtn, { backgroundColor: colors.tone.success.text }]}
                      onPress={onCompletionSubmit}
                      disabled={completionState.busy}
                      accessibilityRole="button"
                      accessibilityLabel="Xác nhận yêu cầu hoàn thành"
                    >
                      {completionState.busy ? (
                        <ActivityIndicator size="small" color={colors.surface} />
                      ) : (
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
          </CollapsibleCard>

          {order.historical !== true && <OrderNoteCard orderId={order.id} />}

          <Text style={styles.groupHeading}>Chi tiết và lịch sử đơn</Text>

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
                  <Text style={styles.jobMeta}>{vnDateTimeString(entry.timestamp, VN_DATETIME)}</Text>
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
                  <TouchableOpacity
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
                  </TouchableOpacity>
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
        </ScrollView>
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
  headerTitle: { fontSize: 20, lineHeight: 28, fontWeight: '600', color: colors.text },
  headerBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { padding: 16, paddingBottom: 48, gap: 12, backgroundColor: colors.background, flexGrow: 1 },
  centerLoading: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 8 },
  emptyTitle: { fontSize: 18, lineHeight: 26, fontWeight: '700', color: colors.text, marginTop: 8 },
  emptyDesc: { fontSize: 14, lineHeight: 20, color: colors.textSecondary, textAlign: 'center' },
  retryBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16, marginTop: 8 },
  retryText: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.primaryStrong, paddingVertical: 10 },

  acPartResultItem: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.divider },
  acFulfillmentBox: { marginTop: 4, marginBottom: 4, gap: 4, backgroundColor: colors.primarySoft, borderRadius: 14, padding: 12 },
  acItemsHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
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
  qtyBtnSmall: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.border, justifyContent: 'center', alignItems: 'center' },
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
  nextStepEyebrow: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: colors.primaryStrong },
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
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.textSecondary,
  },
  fieldError: { fontSize: 12, lineHeight: 16, color: colors.error },
  quoteInfoNote: { color: colors.primaryStrong, fontWeight: '600' },
  fixedPriceBox: { backgroundColor: colors.background, borderRadius: 14, padding: 12, gap: 4, marginTop: 8 },
  fixedPriceTotalText: { fontWeight: '700', color: colors.text },
  startRepairDivider: { height: 1, backgroundColor: colors.divider, marginVertical: 12 },
  totalLabel: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.text },
  totalValue: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.primaryStrong },
});
