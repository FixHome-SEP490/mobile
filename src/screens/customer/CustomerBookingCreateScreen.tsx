import BookingActionBar from '../../components/BookingActionBar';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {
  BottomSheetModal,
  BottomSheetBackdrop,
  BottomSheetFlatList,
  BottomSheetTextInput,
} from '@gorhom/bottom-sheet';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Banknote, CircleAlert, Clock, Plus, Trash2, Image as ImageIcon, MapPin, Pencil, MessageSquareText, Sparkles, Wrench, type LucideIcon } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import {
  useFocusEffect,
  usePreventRemove,
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppTheme } from '../../constants/theme';
import { getServicePresentation } from '../../constants/service-presentation';
import { bookingsApi } from '../../api/bookings.api';
import { mediaApi, type MediaUploadImage } from '../../api/media.api';
import { servicesApi, type ServiceItem, type CategoryItem } from '../../api/services.api';
import { servicePriceSummaryText } from '../../utils/service-price-summary';
import ServiceDeviceDetails from '../../components/customer/ServiceDeviceDetails';
import {
  isCatalogV2PreviewReady, isCatalogV2ServiceCode, type BookingDeviceAttributes, type CatalogPricingPreview,
} from '../../api/catalog-pricing.api';
import CategoryPills from '../../components/CategoryPills';
import {
  addressReadyForBooking,
  appendBookingDescriptionSuggestion,
  getBookingDescriptionSuggestions,
  hasBookingDescriptionSuggestion,
  toggleBookingDescriptionSuggestion,
  type BookingCreationAttempt,
} from './customer-booking-create';
import { createProductionBookingAttempt, entryAttemptJournal } from '../../features/order-flow/runtime/entry-attempt-production';

import {
  isOtherService,
  servicePricingLabel,
  resolveServicePrice,
  serviceDetailTarget,
} from './service-catalog';
import { usersApi, type AddressData } from '../../api/users.api';
import { VISIT_DEVICE_LIMIT, visitGroupsApi } from '../../api/visit-groups.api';
import { createIdempotencyKey } from '../../api/part-requests.api';
import { deviceProblem, duplicatePhoto, photoKey, visitProblem, type VisitDeviceDraft } from './customer-visit-draft';
import { sendVisit } from './customer-visit-send';
import { pickVisitPhotos } from './customer-visit-photos';
import { useAuthStore } from '../../store';
import { UserRole, type RootStackParamList } from '../../types';
import { extractApiErrorMessage } from '../../utils/input-validation';
import BookingSessionPicker from '../../components/BookingSessionPicker';
import { bookingMediaIds, chatAttachmentSummary, type ChatAttachmentId } from './ai-chat-logic';
import type { BookingSchedule } from '../../utils/booking-session';
import { BookingReviewSummary } from '../../components/BookingReviewSheet';
import {
  buildBookingReviewSnapshot,
  type BookingPhotoPreview,
  type BookingReviewSnapshot,
} from './customer-booking-review';
import CustomerBookingAddressEditor, {
  clearBookingAddressAttempt,
  getBookingAddressAttempt,
  rememberBookingAddressAttempt,
  type BookingAddressCreateAttempt,
} from './CustomerBookingAddressEditor';
import BackButton from '../../components/BackButton';

type CreateRoute = RouteProp<RootStackParamList, 'CustomerBookingCreate'>;
type UncertainBookingCreate = {
  flowId: string;
  attempt: BookingCreationAttempt;
  snapshot: BookingReviewSnapshot;
};
type CustomerCreateState =
  | ({ kind: 'in-flight' } & UncertainBookingCreate)
  | ({ kind: 'uncertain' } & UncertainBookingCreate)
  | { kind: 'created'; flowId: string; id: string; snapshot: BookingReviewSnapshot };

// Process-local, owner-keyed safety state: leaving/re-entering the Booking route
// must not erase a possibly committed POST or an unresolved photo upload.
let runtimeCreateStates: Record<string, CustomerCreateState> = {};
function getOwnerCreateState(ownerId: string): CustomerCreateState | undefined {
  return runtimeCreateStates[ownerId];
}
const runtimeCompletedCreates = new Map<string, Map<string, Extract<CustomerCreateState, { kind: 'created' }>>>();
const runtimeSubmittingOwners = new Set<string>();
const runtimeReviewSnapshots = new Map<string, { flowId: string; snapshot: BookingReviewSnapshot; error?: string }>();
const runtimeUncertainPhotoUris = new Map<string, Set<string>>();
const runtimeListeners = new Set<() => void>();
const notifyRuntimeListeners = () => runtimeListeners.forEach((listener) => listener());

// Tests only. Production never clears an uncertain write without readback proof.
export function clearBookingCreateRuntimeForTest(ownerId: string) {
  if (process.env.NODE_ENV !== 'test') return;
  const latest = { ...runtimeCreateStates };
  delete latest[ownerId];
  runtimeCreateStates = latest;
  runtimeCompletedCreates.delete(ownerId);
  runtimeSubmittingOwners.delete(ownerId);
  runtimeReviewSnapshots.delete(ownerId);
  runtimeUncertainPhotoUris.delete(ownerId);
  notifyRuntimeListeners();
}

const MAX_BOOKING_PHOTOS = 5;
const MAX_BOOKING_PHOTO_BYTES = 10 * 1024 * 1024;
const BOOKING_PHOTO_TTL_MS = 2 * 60 * 60 * 1000;

interface BookingPhotoDraft extends BookingPhotoPreview {
  assetId?: string;
  uploadId?: string;
  uploadExpiresAt?: number;
  uploadUncertain?: boolean;
}

function bookingPhotoType(
  mimeType?: string | null,
  fileName?: string | null,
): MediaUploadImage['type'] | null {
  const normalized = mimeType?.trim().toLowerCase();
  if (normalized === 'image/jpg' || normalized === 'image/jpeg') return 'image/jpeg';
  if (normalized === 'image/png') return 'image/png';
  if (normalized === 'image/webp') return 'image/webp';

  if (normalized) return null;
  const extension = fileName?.split('.').pop()?.toLowerCase();
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  return null;
}

function bookingPhotoName(
  fileName: string | null | undefined,
  type: MediaUploadImage['type'],
): string {
  const name = fileName?.trim();
  if (name) return name;
  const extension = type === 'image/jpeg' ? 'jpg' : type.slice('image/'.length);
  return `booking-photo.${extension}`;
}

function isCurrentAuthenticatedCustomer(ownerUserId: string): boolean {
  const auth = useAuthStore.getState();
  return (
    auth.isAuthenticated &&
    auth.user?.id === ownerUserId &&
    auth.user?.role === UserRole.CUSTOMER
  );
}

function BookingPrimaryAction({ label, onPress, disabled, colors, accessibilityLabel = label }: {
  label: string;
  onPress: () => void;
  disabled: boolean;
  colors: ReturnType<typeof useAppTheme>['colors'];
  accessibilityLabel?: string;
}) {
  return (
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
      style={[styles.action, { backgroundColor: disabled ? colors.border : colors.primary }]}>
      <Text style={[styles.actionText, { color: disabled ? colors.textSecondary : colors.surface }]}>{label}</Text>
    </TouchableOpacity>
  );
}

/** One receipt line: a small leading icon (decorative) and its text. */
function ReceiptLine({ icon: Icon, color, children }: { icon: LucideIcon; color: string; children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
      <View style={{ width: 20, height: 22, alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Icon size={18} color={color} strokeWidth={1.75} />
      </View>
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}

export default function CustomerBookingCreateScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<CreateRoute>();
  const { colors } = useAppTheme();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const userRole = useAuthStore((state) => state.user?.role);
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const customerOwnerId =
    isAuthenticated && userRole === UserRole.CUSTOMER ? userId : null;
  const durableBlocked = useSyncExternalStore(entryAttemptJournal.subscribe,
    () => !customerOwnerId || entryAttemptJournal.blocked(customerOwnerId, 'booking-create'));
  useEffect(() => { void entryAttemptJournal.restore().catch(() => undefined); }, []);
  const prefill = route.params?.prefill;
  const prefillServiceId = prefill?.serviceId;
  // Stack pushes create a new initiation; service identity also fences route reuse.
  const flowId = `${route.key}:${prefillServiceId ?? ''}`;
  const flowIdRef = useRef(flowId);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [addresses, setAddresses] = useState<AddressData[]>([]);
  const [serviceId, setServiceId] = useState('');
  // P012 device facts, bound to the service they were answered for (a service change starts blank).
  const [deviceState, setDeviceState] = useState<{
    serviceId: string; attrs: BookingDeviceAttributes; code: string | null; preview: CatalogPricingPreview | null;
  }>({ serviceId: '', attrs: {}, code: null, preview: null });
  const device = deviceState.serviceId === serviceId
    ? deviceState
    : { serviceId, attrs: {} as BookingDeviceAttributes, code: null, preview: null };
  const patchDevice = (patch: Partial<Omit<typeof deviceState, 'serviceId'>>) =>
    setDeviceState((d) => ({ ...(d.serviceId === serviceId ? d : { serviceId, attrs: {}, code: null, preview: null }), ...patch }));
  const [addressId, setAddressId] = useState('');
  const [description, setDescription] = useState(prefill?.description ?? '');
  const [bookingPhotos, setBookingPhotos] = useState<BookingPhotoDraft[]>([]);
  const bookingPhotosRef = useRef<BookingPhotoDraft[]>([]);
  const uncertainPhotoUrisByOwnerRef = useRef(runtimeUncertainPhotoUris);
  const [photoUploadError, setPhotoUploadError] = useState('');
  const [uploadingPhotoUri, setUploadingPhotoUri] = useState<string | null>(null);
  // Session booking (web parity): a morning/afternoon of a day, or "tới ngay". Nothing is pre-selected.
  const [schedule, setSchedule] = useState<BookingSchedule | null>(null);
  const [customerNote, setCustomerNote] = useState('');
  /** Photos and videos the customer sent the assistant, already uploaded, for the technician (PO 18/10/2026). */
  const [chatAttachments, setChatAttachments] = useState<ChatAttachmentId[]>(() => prefill?.attachmentUploadIds ?? []);
  // Keep one owner-bound draft while moving between dedicated booking scenes.
  const [bookingStage, setBookingStage] = useState<0 | 1>(() =>
    customerOwnerId && (runtimeCreateStates[customerOwnerId]?.flowId === flowId
      || runtimeCompletedCreates.get(customerOwnerId)?.has(flowId)
      || runtimeCreateStates[customerOwnerId]?.kind === 'uncertain'
      || runtimeReviewSnapshots.get(customerOwnerId)?.flowId === flowId) ? 1 : 0);
  const [addressEditorOpen, setAddressEditorOpen] = useState(false);
  // Preserve unknown address POST identity when the panel is closed/reopened.
  const [addressAttemptsByOwner, setAddressAttemptsByOwner] = useState<Record<string, BookingAddressCreateAttempt>>(() => {
    if (!customerOwnerId) return {};
    const locked = getBookingAddressAttempt(customerOwnerId);
    return locked ? { [customerOwnerId]: locked } : {};
  });

  const [descriptionTouched, setDescriptionTouched] = useState(false);
  // Several devices in one visit are offered when the server allows it; the assistant flow has its own entry.
  const [multiDeviceEnabled, setMultiDeviceEnabled] = useState(false);
  const [deviceLimit, setDeviceLimit] = useState(VISIT_DEVICE_LIMIT);
  useEffect(() => {
    let live = true;
    visitGroupsApi.contact().then((c) => { if (live) { setMultiDeviceEnabled(c.enabled); setDeviceLimit(c.deviceLimit); } }, () => undefined);
    return () => { live = false; };
  }, []);
  // Máy 1 is the booking form below; Máy 2 and 3 are these drafts, edited through the device tabs. With any extra the request goes as one visit.
  const [extras, setExtras] = useState<VisitDeviceDraft[]>([]);
  const [activeTab, setActiveTab] = useState('main');
  const [pickerTarget, setPickerTarget] = useState('main');
  const [touchedKeys, setTouchedKeys] = useState<string[]>([]);
  const [visitBusy, setVisitBusy] = useState(false);
  const [visitUnknown, setVisitUnknown] = useState(false);
  const visitKey = useRef(createIdempotencyKey('visit'));
  // Set once the visit is sent: the beforeRemove guard (one step back inside this screen) must not hold the screen then.
  const leavingRef = useRef(false);
  const extraSeq = useRef(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [submittingByOwner, setSubmittingByOwner] = useState<Record<string, boolean>>(() =>
    Object.fromEntries([...runtimeSubmittingOwners].map((ownerId) => [ownerId, true])),
  );
  const submittingOwnersRef = useRef(new Set(runtimeSubmittingOwners));
  const [createStateByOwner, setCreateStateByOwner] = useState<
    Record<string, CustomerCreateState>
  >(() => runtimeCreateStates);
  const createStateByOwnerRef = useRef<Record<string, CustomerCreateState>>(runtimeCreateStates);
  const [reviewSnapshot, setReviewSnapshot] = useState<BookingReviewSnapshot | null>(null);
  const [reviewError, setReviewError] = useState('');
  const [reconcilingByOwner, setReconcilingByOwner] = useState<Record<string, boolean>>({});
  const previousOwnerRef = useRef(customerOwnerId);
  const previousFlowRef = useRef(flowId);
  const loadGenerationRef = useRef(0);
  const [pickerQuery, setPickerQuery] = useState('');
  const [pickerCategoryId, setPickerCategoryId] = useState<string | null>(null);
  const [pickerCategories, setPickerCategories] = useState<CategoryItem[]>([]);
  const { height: windowHeight } = useWindowDimensions();
  const pickerSheetRef = useRef<BottomSheetModal>(null);
  const pickerSnapPoints = useMemo(() => ['80%'], []);
  const addressSheetRef = useRef<BottomSheetModal>(null);
  const descriptionInputRef = useRef<TextInput>(null);
  const descriptionTopRef = useRef(0);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    const syncRuntime = () => {
      createStateByOwnerRef.current = runtimeCreateStates;
      submittingOwnersRef.current = new Set(runtimeSubmittingOwners);
      setCreateStateByOwner(runtimeCreateStates);
      setSubmittingByOwner(Object.fromEntries(
        [...runtimeSubmittingOwners].map((ownerId) => [ownerId, true]),
      ));
    };
    runtimeListeners.add(syncRuntime);
    return () => { runtimeListeners.delete(syncRuntime); };
  }, []);

  const setOwnerCreateState = useCallback(
    (ownerId: string, nextState: CustomerCreateState | null) => {
      const next = { ...runtimeCreateStates };
      if (nextState) next[ownerId] = nextState;
      else delete next[ownerId];
      runtimeCreateStates = next;
      if (nextState?.kind === 'created') {
        const completed = runtimeCompletedCreates.get(ownerId) ?? new Map();
        completed.set(nextState.flowId, nextState);
        runtimeCompletedCreates.set(ownerId, completed);
      }
      createStateByOwnerRef.current = next;
      notifyRuntimeListeners();
    },
    [],
  );

  const setOwnerSubmitting = useCallback((ownerId: string, isSubmitting: boolean) => {
    if (isSubmitting) runtimeSubmittingOwners.add(ownerId);
    else runtimeSubmittingOwners.delete(ownerId);
    submittingOwnersRef.current = new Set(runtimeSubmittingOwners);
    notifyRuntimeListeners();
  }, []);

  const setOwnerReconciling = useCallback((ownerId: string, isReconciling: boolean) => {
    setReconcilingByOwner((current) => ({
      ...current,
      [ownerId]: isReconciling,
    }));
  }, []);

  const updateBookingPhotos = (next: BookingPhotoDraft[]) => {
    bookingPhotosRef.current = next;
    setBookingPhotos(next);
  };

  const uncertainPhotoUrisForOwner = (ownerUserId: string) => {
    const existing = uncertainPhotoUrisByOwnerRef.current.get(ownerUserId);
    if (existing) return existing;
    const next = new Set<string>();
    uncertainPhotoUrisByOwnerRef.current.set(ownerUserId, next);
    return next;
  };

  useLayoutEffect(() => {
    flowIdRef.current = flowId;
    if (previousOwnerRef.current === customerOwnerId && previousFlowRef.current === flowId) return;
    const sameOwner = previousOwnerRef.current === customerOwnerId;
    previousOwnerRef.current = customerOwnerId;
    previousFlowRef.current = flowId;

    setReviewSnapshot(null);
    setReviewError('');
    setServices([]);
    setAddresses([]);
    setServiceId('');
    setAddressId('');
    setDescription(sameOwner ? prefill?.description ?? '' : '');
    // Uploaded by the customer who chatted; anyone else signing in starts without them.
    setChatAttachments(sameOwner ? prefill?.attachmentUploadIds ?? [] : []);
    bookingPhotosRef.current = [];
    setBookingPhotos([]);
    setPhotoUploadError('');
    setUploadingPhotoUri(null);
    setDescriptionTouched(false);
    setExtras([]);
    setActiveTab('main');
    const state = customerOwnerId ? runtimeCreateStates[customerOwnerId] : null;
    setBookingStage((customerOwnerId && runtimeCompletedCreates.get(customerOwnerId)?.has(flowId))
      || (state && (state.kind === 'uncertain' || state.flowId === flowId)) ? 1 : 0);
    setAddressEditorOpen(false);
    setSchedule(null);
    setCustomerNote('');
    setLoadError('');
    setLoading(Boolean(customerOwnerId));
  }, [customerOwnerId, flowId, prefill?.description, prefill?.attachmentUploadIds]);

  const loadOptions = useCallback(async () => {
    const generation = ++loadGenerationRef.current;
    const ownerUserId = userId;
    const isCurrentLoad = () =>
      loadGenerationRef.current === generation &&
      flowIdRef.current === flowId &&
      Boolean(ownerUserId && isCurrentAuthenticatedCustomer(ownerUserId));

    if (!isAuthenticated || userRole !== UserRole.CUSTOMER || !ownerUserId) {
      if (loadGenerationRef.current === generation) setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError('');
    // Independent calls: a transient failure in one (flaky network) must not
    // block the other — the customer can still book with whichever loaded,
    // and only sees the blocking error when both fail.
    const [catalogResult, savedResult] = await Promise.allSettled([
      servicesApi.getServices({ pageSize: 100 }),
      usersApi.getAddresses(),
    ]);
    if (!isCurrentLoad()) return;
    if (catalogResult.status === 'rejected' && savedResult.status === 'rejected') {
      setLoadError('Không tải được dịch vụ hoặc địa chỉ đã lưu. Hãy thử lại khi có kết nối.');
      setLoading(false);
      return;
    }
    try {
      const catalog = catalogResult.status === 'fulfilled' ? catalogResult.value : { data: [] };
      const saved = savedResult.status === 'fulfilled' ? savedResult.value : [];

      const activeServices = catalog.data.filter((service) => service.isActive);
      const wantedId = serviceDetailTarget(prefillServiceId);
      if (wantedId && !activeServices.some((service) => service.id === wantedId)) {
        try {
          const single = await servicesApi.getServiceById(wantedId);
          if (
            isCurrentLoad() &&
            single &&
            single.id === wantedId &&
            single.isActive !== false
          ) {
            activeServices.push(single);
          }
        } catch {
          // Keep the prefill unselected when the authoritative service GET fails.
        }
      }
      if (!isCurrentLoad()) return;

      setServices(activeServices);
      setAddresses(saved);
      setServiceId((existing) => {
        if (activeServices.some((service) => service.id === existing)) return existing;
        return activeServices.find((service) => service.id === prefillServiceId)?.id ?? '';
      });
      setAddressId((existing) => {
        if (saved.some((address) => address.id === existing)) return existing;
        return saved.find((address) => address.isDefault)?.id ?? saved[0]?.id ?? '';
      });
    } catch {
      if (!isCurrentLoad()) return;
      setLoadError('Không tải được dịch vụ hoặc địa chỉ đã lưu. Hãy thử lại khi có kết nối.');
    } finally {
      if (isCurrentLoad()) setLoading(false);
    }
  }, [flowId, isAuthenticated, prefillServiceId, userId, userRole]);

  useFocusEffect(
    useCallback(() => {
      void loadOptions();
      return () => {
        loadGenerationRef.current += 1;
      };
    }, [loadOptions]),
  );

  const ownerState = customerOwnerId ? createStateByOwner[customerOwnerId] ?? null : null;
  // Uncertain writes remain owner-wide locks even when a different draft opens.
  const completedFlow = customerOwnerId ? runtimeCompletedCreates.get(customerOwnerId)?.get(flowId) : null;
  const currentOwnerCreateState = completedFlow ?? (ownerState?.kind === 'created' && ownerState.flowId !== flowId
    ? null : ownerState);
  const pendingReview = customerOwnerId ? runtimeReviewSnapshots.get(customerOwnerId) : null;
  const visibleReviewSnapshot = currentOwnerCreateState?.kind === 'created'
    ? null : reviewSnapshot?.ownerUserId === customerOwnerId
    ? reviewSnapshot
    : pendingReview?.flowId === flowId ? pendingReview.snapshot
      : currentOwnerCreateState?.kind === 'in-flight' && currentOwnerCreateState.flowId === flowId
        ? currentOwnerCreateState.snapshot : null;
  usePreventRemove(Boolean(visibleReviewSnapshot), () => {
    if (!customerOwnerId || !runtimeSubmittingOwners.has(customerOwnerId)) dismissReview();
  });

  const dismissReview = () => {
    if (customerOwnerId && runtimeSubmittingOwners.has(customerOwnerId)) return;
    // Editing after a remount must restore the reviewed draft, not empty inputs.
    if (visibleReviewSnapshot && customerOwnerId && !runtimeSubmittingOwners.has(customerOwnerId)) {
      const { request, photos } = visibleReviewSnapshot;
      setServiceId(request.serviceId);
      setAddressId(request.addressId);
      setDescription(request.description);
      if (request.mode === 'urgent') setSchedule({ mode: 'urgent' });
      else if (request.date && request.slot) setSchedule({ mode: 'scheduled', date: request.date, slot: request.slot });
      setCustomerNote(request.customerNote ?? '');
      const restoredPhotos = photos.map((photo) => {
        const cached = bookingPhotosRef.current.find((item) => item.uri === photo.uri);
        return {
          ...(cached ?? photo),
          uploadUncertain: Boolean(cached?.uploadUncertain || uncertainPhotoUrisForOwner(customerOwnerId).has(photo.uri)),
        };
      });
      updateBookingPhotos(restoredPhotos);
      if (restoredPhotos.some((photo) => photo.uploadUncertain)) {
        setPhotoUploadError('Ảnh có lần tải chưa xác định. Hãy xóa ảnh đó hoặc chọn ảnh khác.');
      }
    }
    if (customerOwnerId && runtimeReviewSnapshots.get(customerOwnerId)?.flowId === flowId) {
      runtimeReviewSnapshots.delete(customerOwnerId);
      notifyRuntimeListeners();
    }
    setReviewSnapshot(null);
    setReviewError('');
  };
  const visibleReviewError = reviewError || (pendingReview?.flowId === flowId ? pendingReview.error ?? '' : '');
  const isSubmitting = customerOwnerId
    ? submittingByOwner[customerOwnerId] === true
    : false;
  const isReconciling = customerOwnerId
    ? reconcilingByOwner[customerOwnerId] === true
    : false;
  const visibleCreatedBooking =
    currentOwnerCreateState?.kind === 'created'
      ? {
          ownerUserId: customerOwnerId,
          id: currentOwnerCreateState.id,
          snapshot: currentOwnerCreateState.snapshot,
        }
      : null;
  const visibleCreatedBookingId = visibleCreatedBooking?.id ?? null;
  const visibleUncertainAttempt =
    currentOwnerCreateState?.kind === 'uncertain' ? currentOwnerCreateState : null;
  const selectedService =
    services.find((service) => service.id === serviceId) ?? null;
  const selectedAddress =
    addresses.find((address) => address.id === addressId) ?? null;
  const selectedAddressReady = addressReadyForBooking(selectedAddress);
  const isAiFlow = Boolean(prefill?.aiSessionId);
  const showDeviceDetails = !isAiFlow && !!selectedService && isCatalogV2ServiceCode(selectedService.code);
  const pricingReady = isCatalogV2PreviewReady({
    service: selectedService, preview: device.preview, selectedVariantCode: device.code, isAiFlow,
  });
  const reviewDisabled =
    isSubmitting ||
    durableBlocked ||
    Boolean(currentOwnerCreateState) ||
    loading ||
    Boolean(loadError);
  const hasUncertainReviewPhoto = Boolean(visibleReviewSnapshot?.photos.some((photo) =>
    bookingPhotos.find((item) => item.uri === photo.uri)?.uploadUncertain
      || (customerOwnerId && runtimeUncertainPhotoUris.get(customerOwnerId)?.has(photo.uri)),
  ));
  const presentPicker = () => {
    if (pickerCategories.length === 0) {
      void servicesApi
        .getCategories()
        .then(setPickerCategories)
        .catch(() => {
          // No pills, name search inside the picker still works.
        });
    }
    pickerSheetRef.current?.present();
  };
  const openPicker = (target = 'main') => { setPickerTarget(target); presentPicker(); };

  const autoOpenedPickerRef = useRef(false);
  useEffect(() => {
    if (autoOpenedPickerRef.current) return;
    if (loading || loadError || selectedService || services.length === 0) return;
    autoOpenedPickerRef.current = true;
    presentPicker();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, loadError, selectedService, services]);


  const tabsOn = multiDeviceEnabled && !isAiFlow;
  const onMain = activeTab === 'main' || !extras.some((d) => d.key === activeTab);
  const activeExtra = onMain ? null : extras.find((d) => d.key === activeTab) ?? null;
  const pickerSelectedId = pickerTarget === 'main' ? serviceId : extras.find((d) => d.key === pickerTarget)?.serviceId ?? '';
  const chooseService = (service: ServiceItem) => {
    // A new service starts with blank device facts: they were answered for the old one.
    const picked = { serviceId: service.id, serviceName: service.name, priceSummary: service.priceSummary ?? null, serviceCode: service.code, deviceAttributes: {}, selectedVariantCode: null, preview: null };
    if (pickerTarget === 'add') {
      const device: VisitDeviceDraft = { key: `x-${(extraSeq.current += 1)}`, ...picked, description: '', photos: [] };
      setExtras((list) => (list.length + 1 >= deviceLimit ? list : [...list, device]));
      setActiveTab(device.key);
    } else if (pickerTarget !== 'main') {
      setExtras((list) => list.map((d) => (d.key === pickerTarget ? { ...d, ...picked } : d)));
    } else setServiceId(service.id);
    pickerSheetRef.current?.dismiss();
  };
  const extraReady = (d: VisitDeviceDraft) => isCatalogV2PreviewReady({
    service: { id: d.serviceId, code: d.serviceCode }, preview: d.preview ?? null, selectedVariantCode: d.selectedVariantCode ?? null, isAiFlow: false,
  });
  const visitCards = [
    { key: 'main', name: selectedService?.name ?? '', code: selectedService?.code },
    ...extras.map((d) => ({ key: d.key, name: d.serviceName, code: d.serviceCode ?? services.find((x) => x.id === d.serviceId)?.code })),
  ];
  const removeCard = (key: string) => {
    if (key !== 'main') { removeExtra(key); return; }
    const first = extras[0];
    if (!first) return;
    setServiceId(first.serviceId);
    setDescription(first.description);
    setDescriptionTouched(false);
    setDeviceState({ serviceId: first.serviceId, attrs: first.deviceAttributes ?? {}, code: first.selectedVariantCode ?? null, preview: first.preview ?? null });
    updateBookingPhotos(first.photos.map((p) => ({ uri: p.uri, name: p.name, type: p.type, assetId: p.assetId, sizeBytes: p.sizeBytes })));
    setPhotoUploadError('');
    setExtras((list) => list.slice(1));
    setActiveTab('main');
  };
  const patchExtra = (key: string, change: Partial<VisitDeviceDraft>) =>
    setExtras((list) => list.map((d) => (d.key === key ? { ...d, ...change } : d)));
  const removeExtra = (key: string) => { setExtras((list) => list.filter((d) => d.key !== key)); setActiveTab('main'); };
  const visitDevices = (): VisitDeviceDraft[] => [
    ...(selectedService ? [{
      key: 'main', serviceId: selectedService.id, serviceName: selectedService.name, priceSummary: selectedService.priceSummary ?? null, description,
      photos: bookingPhotos.map((p) => ({ uri: p.uri, name: p.name, type: p.type, assetId: p.assetId, sizeBytes: p.sizeBytes })),
      ...(showDeviceDetails ? { deviceAttributes: device.attrs, selectedVariantCode: device.code } : {}),
    }] : []),
    ...extras,
  ];

  const curService = onMain ? selectedService : services.find((x) => x.id === activeExtra?.serviceId) ?? null;
  const curPresentation = getServicePresentation(curService?.code);
  const curIsOther = isOtherService(curService);
  const curSuggestions = getBookingDescriptionSuggestions(
    curService?.code,
    curService?.categoryName?.trim() || pickerCategories.find((category) => category.id === curService?.categoryId)?.name,
  );
  const curDescriptionLabel = curIsOther ? 'Mô tả yêu cầu' : 'Mô tả sự cố';
  const curDescriptionPlaceholder = curIsOther
    ? 'Ví dụ: Cửa tủ bếp bung bản lề, cần người đến kiểm tra và sửa'
    : 'Mô tả thiết bị và vấn đề cần sửa';
  const curDescription = onMain ? description : activeExtra?.description ?? '';
  const curPhotos: BookingPhotoDraft[] = onMain ? bookingPhotos : activeExtra?.photos ?? [];
  const curTouched = onMain ? descriptionTouched : !!activeExtra && touchedKeys.includes(activeExtra.key);
  const curDescriptionError = curTouched && !curDescription.trim()
    ? curIsOther ? 'Vui lòng mô tả công việc bạn cần hỗ trợ để tiếp tục.' : 'Vui lòng mô tả sự cố để tiếp tục.'
    : '';
  const touchCur = () => {
    if (onMain) setDescriptionTouched(true);
    else if (activeExtra) setTouchedKeys((keys) => (keys.includes(activeExtra.key) ? keys : [...keys, activeExtra.key]));
  };
  const setCurDescription = (text: string) => { if (onMain) setDescription(text); else if (activeExtra) patchExtra(activeExtra.key, { description: text }); };
  const patchDeviceOf = (key: string, change: { attrs?: BookingDeviceAttributes; code?: string | null; preview?: CatalogPricingPreview | null }) => {
    if (key === 'main') patchDevice(change);
    else patchExtra(key, {
      ...(change.attrs !== undefined ? { deviceAttributes: change.attrs } : {}),
      ...(change.code !== undefined ? { selectedVariantCode: change.code } : {}),
      ...(change.preview !== undefined ? { preview: change.preview } : {}),
    });
  };
  const deviceForms = isAiFlow ? [] : [
    ...(selectedService && isCatalogV2ServiceCode(selectedService.code)
      ? [{ key: 'main', serviceId: selectedService.id, attrs: device.attrs, code: device.code }] : []),
    ...extras.filter((d) => isCatalogV2ServiceCode(d.serviceCode))
      .map((d) => ({ key: d.key, serviceId: d.serviceId, attrs: d.deviceAttributes ?? ({} as BookingDeviceAttributes), code: d.selectedVariantCode ?? null })),
  ];
  const removeCurPhoto = (uri: string) => {
    if (onMain) removeBookingPhoto(uri);
    else if (activeExtra) patchExtra(activeExtra.key, { photos: activeExtra.photos.filter((p) => p.uri !== uri) });
  };
  const pickCurPhotos = async () => {
    if (onMain) { await pickBookingPhotos(); return; }
    if (!activeExtra) return;
    const others = [...bookingPhotos.map(photoKey), ...extras.filter((d) => d.key !== activeExtra.key).flatMap((d) => d.photos.map(photoKey))];
    const { photos, error } = await pickVisitPhotos(activeExtra.photos, others);
    patchExtra(activeExtra.key, { photos });
    setPhotoUploadError(error);
  };

  const pickerServices = services.filter((service) => {
    if (pickerCategoryId && service.categoryId !== pickerCategoryId) return false;
    const q = pickerQuery.trim().toLowerCase();
    return q === '' || service.name.toLowerCase().includes(q);
  });

  const openInlineAddressEditor = () => {
    if (!customerOwnerId || !isCurrentAuthenticatedCustomer(customerOwnerId)) return;
    const previous = getBookingAddressAttempt(customerOwnerId);
    // Re-read the authoritative ledger each time the editor is opened:
    // a definite POST 400 may have cleared it after the old UI unmounted.
    setAddressAttemptsByOwner((attempts) => {
      const next = { ...attempts };
      if (previous) next[customerOwnerId] = previous;
      else delete next[customerOwnerId];
      return next;
    });
    setAddressEditorOpen(true);
  };

  const openAddressEditor = () => {
    const rootNavigation = navigation as unknown as {
      navigate: (name: 'CustomerMain', params: { screen: 'Profile' }) => void;
    };
    rootNavigation.navigate('CustomerMain', { screen: 'Profile' });
  };

  const openAddressSheet = () => {
    addressSheetRef.current?.present();
  };

  const pickBookingPhotos = async () => {
    const ownerUserId = customerOwnerId;
    if (!ownerUserId || !isCurrentAuthenticatedCustomer(ownerUserId)) return;
    if (bookingPhotosRef.current.length >= MAX_BOOKING_PHOTOS) return;

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!isCurrentAuthenticatedCustomer(ownerUserId) || ownerUserId !== customerOwnerId) return;
      if (!permission.granted) {
        setPhotoUploadError('Cho phép truy cập thư viện ảnh để đính kèm ảnh sự cố.');
        return;
      }

      const remaining = MAX_BOOKING_PHOTOS - bookingPhotosRef.current.length;
      if (remaining <= 0) return;
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: remaining > 1,
        selectionLimit: remaining,
        quality: 1,
      });
      if (!isCurrentAuthenticatedCustomer(ownerUserId) || ownerUserId !== customerOwnerId) return;
      if (result.canceled) return;

      const next = [...bookingPhotosRef.current];
      const knownUris = new Set(next.map((photo) => photo.uri));
      const issues: string[] = [];
      // One photo belongs to one device only: the photos of Máy 2-3 are off limits here.
      const usedByExtras = new Set(extras.flatMap((d) => d.photos.map(photoKey)));
      for (const asset of result.assets) {
        if (next.length >= MAX_BOOKING_PHOTOS) break;
        if (!asset.uri || knownUris.has(asset.uri)) continue;
        if (usedByExtras.has(photoKey({ uri: asset.uri, name: asset.fileName?.trim(), assetId: asset.assetId, sizeBytes: asset.fileSize }))) {
          issues.push('Ảnh của mỗi thiết bị phải riêng biệt. Ảnh này đã dùng cho máy khác.');
          continue;
        }
        if (uncertainPhotoUrisForOwner(ownerUserId).has(asset.uri)) {
          issues.push('Ảnh có lần tải chưa xác định. Hãy bỏ ảnh đó và chọn ảnh khác.');
          continue;
        }
        const type = bookingPhotoType(asset.mimeType, asset.fileName);
        if (!type) {
          issues.push('Ảnh phải có định dạng JPEG, PNG hoặc WebP.');
          continue;
        }
        if (asset.fileSize !== undefined && asset.fileSize !== null
          && (!Number.isInteger(asset.fileSize)
            || asset.fileSize <= 0
            || asset.fileSize > MAX_BOOKING_PHOTO_BYTES)) {
          issues.push('Mỗi ảnh không được vượt quá 10 MiB.');
          continue;
        }

        next.push({
          uri: asset.uri,
          name: bookingPhotoName(asset.fileName, type),
          type,
          ...(asset.fileSize !== undefined ? { sizeBytes: asset.fileSize } : {}),
          ...(asset.assetId ? { assetId: asset.assetId } : {}),
        });
        knownUris.add(asset.uri);
      }

      updateBookingPhotos(next);
      if (issues.length > 0) setPhotoUploadError(issues[0]);
      else if (!next.some((photo) => photo.uploadUncertain)) setPhotoUploadError('');
    } catch {
      if (isCurrentAuthenticatedCustomer(ownerUserId) && ownerUserId === customerOwnerId) {
        setPhotoUploadError('Không thể mở thư viện ảnh. Hãy thử lại.');
      }
    }
  };

  const removeBookingPhoto = (uri: string) => {
    if (isSubmitting || currentOwnerCreateState) return;
    const next = bookingPhotosRef.current.filter((photo) => photo.uri !== uri);
    updateBookingPhotos(next);
    if (!next.some((photo) => photo.uploadUncertain)) setPhotoUploadError('');
  };

  const requestReview = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (reviewDisabled || (customerOwnerId && submittingOwnersRef.current.has(customerOwnerId))) return;
    setReviewError('');
    setDescriptionTouched(true);
    if (!description.trim()) {
      scrollRef.current?.scrollTo({ y: descriptionTopRef.current, animated: true });
      descriptionInputRef.current?.focus();
      return;
    }
    if (!isAuthenticated || userRole !== UserRole.CUSTOMER || !userId) {
      Alert.alert(
        'Cần tài khoản khách hàng',
        'Hãy đăng nhập bằng tài khoản khách hàng trước khi đặt lịch.',
      );
      return;
    }
    if (!selectedService || !selectedAddress) {
      Alert.alert('Thông tin chưa hợp lệ', 'Vui lòng chọn dịch vụ và địa chỉ sửa chữa.');
      return;
    }

    try {
      if (
        !services.some((service) => service.id === selectedService.id && service.isActive) ||
        !addresses.some(
          (address) => address.id === selectedAddress.id && address.userId === userId,
        )
      ) {
        throw new Error('Vui lòng chọn dịch vụ và địa chỉ thực tế từ danh sách đã tải.');
      }
      const snapshot = buildBookingReviewSnapshot({
        ownerUserId: userId,
        service: selectedService,
        address: selectedAddress,
        description,
        schedule: schedule ?? undefined,
        customerNote,
        aiSessionId: prefill?.aiSessionId ?? null,
        ...(showDeviceDetails ? { deviceAttributes: device.attrs, selectedVariantCode: device.code } : {}),
        photos: bookingPhotos.map(({ uri, name, type, sizeBytes }) => ({
          uri,
          name,
          type,
          ...(sizeBytes !== undefined ? { sizeBytes } : {}),
        })),
      });
      setReviewSnapshot(snapshot);
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : 'Kiểm tra lại thông tin đặt lịch.');
    }
  };

  const submit = async (snapshot: BookingReviewSnapshot) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const ownerUserId = snapshot.ownerUserId;
    // Fence all pre-Booking-POST async work to the initiating auth session.
    // Never suppress server ACK/reconciliation after the POST has been sent.
    const originSession = useAuthStore.getState().sessionGeneration;
    const sameSubmissionSession = () => isCurrentAuthenticatedCustomer(ownerUserId)
      && useAuthStore.getState().sessionGeneration === originSession
      && flowIdRef.current === flowId;
    if (
      (submittingOwnersRef.current.has(ownerUserId) || runtimeSubmittingOwners.has(ownerUserId)) ||
      runtimeCompletedCreates.get(ownerUserId)?.has(flowId) ||
      (runtimeCreateStates[ownerUserId] && (runtimeCreateStates[ownerUserId].kind !== 'created'
        || runtimeCreateStates[ownerUserId].flowId === flowId)) ||
      loading ||
      loadError ||
      durableBlocked ||
      snapshot.ownerUserId !== customerOwnerId
    ) {
      return;
    }
    if (!sameSubmissionSession() || !isAuthenticated || userRole !== UserRole.CUSTOMER || !userId) {
      Alert.alert(
        'Cần tài khoản khách hàng',
        'Hãy đăng nhập bằng tài khoản khách hàng trước khi đặt lịch.',
      );
      return;
    }
    if (
      !services.some((service) => service.id === snapshot.request.serviceId && service.isActive) ||
      !addresses.some(
        (address) =>
          address.id === snapshot.request.addressId &&
          address.userId === snapshot.ownerUserId &&
          addressReadyForBooking(address),
      )
    ) {
      Alert.alert(
        'Thông tin chưa hợp lệ',
        'Dịch vụ hoặc địa chỉ đã chọn không còn khả dụng. Hãy chỉnh sửa yêu cầu rồi kiểm tra lại.',
      );
      return;
    }

    setReviewError('');
    runtimeReviewSnapshots.set(ownerUserId, { flowId, snapshot });
    setOwnerSubmitting(ownerUserId, true);
    let baselineIds: string[] | null = null;

    try {
      const photoUploadIds: string[] = [];
      for (const photo of snapshot.photos) {
        if (!sameSubmissionSession()) return;
        const currentPhoto = bookingPhotosRef.current.find((item) => item.uri === photo.uri);
        if (!currentPhoto) {
          setPhotoUploadError('Ảnh đã chọn không còn trong yêu cầu. Hãy kiểm tra lại ảnh.');
          return;
        }
        if (currentPhoto.uploadUncertain || uncertainPhotoUrisForOwner(ownerUserId).has(photo.uri)) {
          setPhotoUploadError('Không thể xác nhận ảnh đã tải lên. Hãy xóa ảnh đó hoặc chọn ảnh khác.');
          return;
        }

        let uploadId = currentPhoto.uploadId;
        if (!uploadId || !currentPhoto.uploadExpiresAt || currentPhoto.uploadExpiresAt <= Date.now()) {
          // Lock this URI for its original owner BEFORE the request crosses the network.
          const photoAttemptUris = uncertainPhotoUrisForOwner(ownerUserId);
          photoAttemptUris.add(photo.uri);
          setUploadingPhotoUri(photo.uri);
          try {
            const uploaded = await mediaApi.uploadBookingPhoto({
              uri: photo.uri,
              name: photo.name,
              type: photo.type,
            });
            if (!sameSubmissionSession() || ownerUserId !== customerOwnerId) return;
            if (photoUploadIds.includes(uploaded.uploadId)) {
              uncertainPhotoUrisForOwner(ownerUserId).add(photo.uri);
              updateBookingPhotos(bookingPhotosRef.current.map((item) => item.uri === photo.uri
                ? { ...item, uploadUncertain: true }
                : item));
              setPhotoUploadError('Một ảnh chưa nhận được mã tải lên riêng. Hãy xóa ảnh đó hoặc chọn ảnh khác.');
              return;
            }

            uploadId = uploaded.uploadId;
            updateBookingPhotos(bookingPhotosRef.current.map((item) => item.uri === photo.uri
              ? {
                ...item,
                uploadId,
                uploadExpiresAt: Date.now() + BOOKING_PHOTO_TTL_MS,
                uploadUncertain: false,
              }
              : item));
            // Remove the retry lock only after receiving and storing the upload ID
            // for the SAME currently authenticated owner.
            photoAttemptUris.delete(photo.uri);
          } catch (uploadError) {
            // The server answered with a refusal: nothing was stored, so the photo is not "uncertain"
            // and the customer can simply retry. Only a missing answer (timeout/network) keeps the lock.
            const status = (uploadError as { response?: { status?: unknown } } | null)?.response?.status;
            if (typeof status === 'number') {
              photoAttemptUris.delete(photo.uri);
              if (sameSubmissionSession() && ownerUserId === customerOwnerId) {
                setPhotoUploadError(`${extractApiErrorMessage(uploadError, 'Máy chủ không nhận ảnh này.')} (mã ${status}). Yêu cầu chưa được tạo; hãy thử lại hoặc đổi ảnh khác.`);
              }
              return;
            }
            // Never drop A's uncertain retry guard just because B logged in.
            photoAttemptUris.add(photo.uri);
            if (sameSubmissionSession() && ownerUserId === customerOwnerId) {
              updateBookingPhotos(bookingPhotosRef.current.map((item) => item.uri === photo.uri
                ? { ...item, uploadUncertain: true }
                : item));
              setPhotoUploadError('Không thể xác nhận ảnh đã tải lên. Hãy xóa ảnh đó hoặc chọn ảnh khác. Yêu cầu chưa được tạo.');
            }
            return;
          } finally {
            if (sameSubmissionSession() && ownerUserId === customerOwnerId) {
              setUploadingPhotoUri(null);
            }
          }
        }

        if (!uploadId || photoUploadIds.includes(uploadId)) {
          setPhotoUploadError('Mã ảnh tải lên không hợp lệ hoặc bị trùng. Hãy kiểm tra lại ảnh.');
          return;
        }
        photoUploadIds.push(uploadId);
      }

      if (!sameSubmissionSession()) return;
      setPhotoUploadError('');
      // The chat's photos while there is room, and its videos, after the booking's own photos.
      const mediaUploadIds = bookingMediaIds(photoUploadIds, chatAttachments, MAX_BOOKING_PHOTOS);
      const request = mediaUploadIds.length > 0
        ? { ...snapshot.request, photoUploadIds: mediaUploadIds }
        : snapshot.request;

      try {
        const before = await bookingsApi.getMyBookingsPage(1, 100);
        if (!sameSubmissionSession()) return;
        baselineIds = before.data.map((booking) => booking.id);
      } catch {
        // Baseline is best-effort. If POST later becomes ambiguous, no
        // baseline means GET reconciliation cannot auto-confirm creation.
      }

      if (!sameSubmissionSession()) return;

      const attempt: BookingCreationAttempt = {
        ownerUserId,
        serviceId: request.serviceId,
        addressId: request.addressId,
        description: request.description,
        preferredStartAt: request.preferredStartAt,
        preferredEndAt: request.preferredEndAt,
        baselineIds,
      };

      setOwnerCreateState(ownerUserId, { kind: 'in-flight', flowId, attempt, snapshot });
      try {
        // AI preview photos are local data URIs, NOT private Booking upload IDs.
        const result = await createProductionBookingAttempt(owner => owner === ownerUserId && sameSubmissionSession()).create(ownerUserId, request, baselineIds);
        if (result.provenUnsent) {
          const original = getOwnerCreateState(ownerUserId);
          if (original?.kind === 'in-flight' && original.flowId === flowId && original.attempt === attempt) {
            const originalReview = runtimeReviewSnapshots.get(ownerUserId);
            if (originalReview?.flowId === flowId && originalReview.snapshot === snapshot) runtimeReviewSnapshots.delete(ownerUserId);
            setOwnerCreateState(ownerUserId, null);
          }
          if (sameSubmissionSession()) setReviewSnapshot(null);
          return;
        }
        if (result.phase !== 'resolved' || !result.bookingId) {
          throw new Error('Hệ thống chưa xác nhận mã yêu cầu.');
        }
        runtimeReviewSnapshots.delete(ownerUserId);
        setOwnerCreateState(ownerUserId, { kind: 'created', flowId, id: result.bookingId, snapshot });
      } catch {
        runtimeReviewSnapshots.delete(ownerUserId);
        setOwnerCreateState(ownerUserId, { kind: 'uncertain', flowId, attempt, snapshot });
        if (sameSubmissionSession() && flowIdRef.current === flowId) setReviewSnapshot(null);
        if (isCurrentAuthenticatedCustomer(ownerUserId)) {

          Alert.alert(
            'Chưa xác minh được kết quả',
            'Yêu cầu có thể đã được hệ thống ghi nhận. Không gửi lại. Hãy dùng kiểm tra lịch sử bên dưới để đối chiếu.',
          );
        }
      }
    } finally {
      setOwnerSubmitting(ownerUserId, false);
    }
  };

  const reconcileUncertainCreate = async () => {
    const uncertainCreate = visibleUncertainAttempt;
    if (!uncertainCreate || isReconciling) return;
    const { attempt } = uncertainCreate;
    const originGeneration = useAuthStore.getState().sessionGeneration;
    const sameReconciliationSession = (owner: string) => isCurrentAuthenticatedCustomer(owner)
      && useAuthStore.getState().sessionGeneration === originGeneration;

    setOwnerReconciling(attempt.ownerUserId, true);
    try {
      const result = await createProductionBookingAttempt(sameReconciliationSession).verify(attempt.ownerUserId);
      if (!sameReconciliationSession(attempt.ownerUserId)) return;
      if (result.phase === 'resolved' && result.bookingId) {
        setOwnerCreateState(attempt.ownerUserId, {
          kind: 'created',
          flowId: uncertainCreate.flowId,
          id: result.bookingId,
          snapshot: uncertainCreate.snapshot,
        });
        if (sameReconciliationSession(attempt.ownerUserId)) {
          Alert.alert(
            'Đã xác minh yêu cầu',
            'Đã đọc lại đúng mã yêu cầu do hệ thống trả về và xác minh chủ tài khoản. Không cần gửi lại.',
          );
        }
        return;
      }
      // History is navigation/recovery context only, never correlation by content.
      await bookingsApi.getMyBookingsPage(1, 100);

      if (sameReconciliationSession(attempt.ownerUserId)) {
        Alert.alert(
          'Chưa có bằng chứng đủ chắc chắn',
          'Chưa có mã yêu cầu được xác minh cho lần gửi này. Giữ nguyên khóa; hãy mở lịch sử hoặc liên hệ hỗ trợ. Không gửi lại.',
        );
      }
    } catch {
      if (sameReconciliationSession(attempt.ownerUserId)) {
        Alert.alert(
          'Không kiểm tra được lịch sử',
          'Kiểm tra lịch sử thất bại. Giữ nguyên khóa và không gửi lại.',
        );
      }
    } finally {
      setOwnerReconciling(attempt.ownerUserId, false);
    }
  };

  const showBookingStage = (next: 0 | 1) => {
    setBookingStage(next);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };

  const continueToAddress = () => {
    if (reviewDisabled) return;
    if (!selectedService) {
      Alert.alert('Chưa chọn dịch vụ', 'Hãy chọn dịch vụ cần sửa trước khi tiếp tục.');
      return;
    }
    if (!pricingReady) {
      Alert.alert('Đang xác nhận giá', 'Vui lòng chờ hệ thống xác nhận giá hoặc chọn Thử lại trước khi tiếp tục.');
      return;
    }
    setDescriptionTouched(true);
    if (!description.trim()) {
      setActiveTab('main');
      descriptionInputRef.current?.focus();
      return;
    }
    const badExtra = extras.findIndex((d) => deviceProblem(d) || !extraReady(d));
    if (badExtra >= 0) {
      setActiveTab(extras[badExtra].key);
      setTouchedKeys((keys) => [...keys, extras[badExtra].key]);
      Alert.alert(`Máy ${badExtra + 2} chưa đủ thông tin`, deviceProblem(extras[badExtra]) ?? 'Vui lòng chọn thông tin thiết bị và chờ hệ thống xác nhận giá.');
      return;
    }
    if (extras.length > 0 && duplicatePhoto(visitDevices())) {
      Alert.alert('Ảnh bị trùng giữa các máy', 'Ảnh của mỗi thiết bị phải riêng biệt. Hãy bỏ ảnh trùng ở một trong các máy.');
      return;
    }
    void Haptics.selectionAsync();
    showBookingStage(1);
  };

  const continueToReview = () => {
    if (reviewDisabled) return;
    if (!selectedAddress) {
      setReviewError('Vui lòng chọn địa chỉ sửa chữa.');
      return;
    }
    if (!selectedAddressReady) {
      setReviewError('Địa chỉ này chưa có tọa độ hợp lệ. Hãy cập nhật vị trí GPS trước khi tiếp tục.');
      return;
    }
    if (!schedule) {
      setReviewError('Vui lòng chọn ngày và buổi (sáng, chiều hoặc tối), hoặc chọn Tới ngay.');
      return;
    }
    requestReview();
  };

  const sendVisitNow = async () => {
    if (visitBusy || !schedule || !selectedAddress) return;
    setVisitBusy(true); setReviewError('');
    try {
      const visit = await sendVisit({
        devices: visitDevices(), addressId: selectedAddress.id, schedule, note: customerNote, idempotencyKey: visitKey.current,
        onUploaded: (uploaded) => setExtras(uploaded.filter((d) => d.key !== 'main')),
      });
      // Like a single booking: Home underneath, then the technician list for the whole visit.
      leavingRef.current = true;
      navigation.reset({
        index: 1,
        routes: [
          { name: 'CustomerMain' },
          visit.leadBookingId
            ? { name: 'CustomerMatching', params: { bookingId: visit.leadBookingId, visitGroupId: visit.id } }
            : { name: 'CustomerVisit', params: { visitGroupId: visit.id } },
        ],
      });
    } catch (e) {
      // A send with no answer may have been saved: the same key makes a retry safe, but the customer checks first.
      if (!(e as { response?: unknown })?.response) {
        setVisitUnknown(true);
        setReviewError('Chưa xác nhận được kết quả gửi yêu cầu. Vui lòng kiểm tra Hoạt động của bạn trước khi gửi lại.');
      } else setReviewError(extractApiErrorMessage(e, 'Chưa gửi được lượt sửa. Vui lòng kiểm tra thông tin rồi thử lại.'));
    } finally { setVisitBusy(false); }
  };

  const confirmVisit = () => {
    if (reviewDisabled || visitBusy || visitUnknown) return;
    if (bookingPhotos.some((p) => p.uploadUncertain)) {
      setReviewError('Có ảnh chưa xác nhận được lượt tải. Hãy quay lại bước trước để chọn lại ảnh.');
      return;
    }
    const problem = visitProblem(visitDevices(), selectedAddressReady, schedule);
    if (problem) { setReviewError(problem); return; }
    setReviewError('');
    void sendVisitNow();
  };

  const action = (label: string, onPress: () => void, disabled = false, accessibilityLabel = label) => (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.action, { backgroundColor: disabled ? colors.border : colors.primary }]}>
      <Text style={[styles.actionText, { color: disabled ? colors.textSecondary : colors.surface }]}>{label}</Text>
    </TouchableOpacity>
  );

  /** One step back inside this screen (address editor → review → previous stage), or false when none is left. */
  const stepBack = (): boolean => {
    if (leavingRef.current) return false;
    if (addressEditorOpen) { setAddressEditorOpen(false); return true; }
    if (visibleReviewSnapshot && !visibleCreatedBookingId) { dismissReview(); return true; }
    if (bookingStage > 0 && !visibleCreatedBookingId) { showBookingStage((bookingStage - 1) as 0 | 1); return true; }
    return false;
  };
  // The system back (Android button, iOS swipe) must walk the same steps as the header arrow, not leave the booking flow.
  const stepBackRef = useRef(stepBack);
  useLayoutEffect(() => { stepBackRef.current = stepBack; });
  useEffect(() => navigation.addListener('beforeRemove', (event: { preventDefault: () => void }) => {
    if (stepBackRef.current()) event.preventDefault();
  }), [navigation]);

  // A created booking has nothing left to show here (the review already did): go straight to choosing a technician.
  // Reset to Home + the technician list: a confirmed request is never reopened for resubmission, and Back must
  // land on Home, not on the service pages this booking was started from.
  // Covers every way
  // a created booking appears (submit, verified-after-uncertain, restored), not only the happy path.
  const handedOffRef = useRef<string | null>(null);
  useEffect(() => {
    if (!visibleCreatedBookingId || handedOffRef.current === visibleCreatedBookingId || !navigation.isFocused()) return;
    handedOffRef.current = visibleCreatedBookingId;
    navigation.reset({ index: 1, routes: [{ name: 'CustomerMain' }, { name: 'CustomerMatching', params: { bookingId: visibleCreatedBookingId } }] });
  }, [visibleCreatedBookingId, navigation]);

  const backBtn = <BackButton onPress={() => { if (!stepBack()) navigation.goBack(); }} />;

  const headerTitleText = addressEditorOpen && bookingStage === 1 && !visibleReviewSnapshot && !visibleCreatedBookingId ? 'Chọn địa chỉ'
    : visibleReviewSnapshot ? 'Kiểm tra lần cuối'
    : bookingStage === 0 ? 'Tình trạng cần sửa' : 'Địa chỉ & thời gian';
  const headerBar = (
    <View style={[styles.screenHeader, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
      {backBtn}
      {!visibleCreatedBookingId && (
        <Text testID="booking-header-title" accessibilityRole="header" numberOfLines={1} style={[styles.headerTitle, { color: colors.text }]}>{headerTitleText}</Text>
      )}
      {!visibleCreatedBookingId && <View style={styles.bookingTopSpacer} />}
    </View>
  );


  const addressEditor = customerOwnerId ? (
              <CustomerBookingAddressEditor
                key={customerOwnerId}
                ownerUserId={customerOwnerId}
                existingAddressIds={addresses.map((address) => address.id)}
                lockedAttempt={addressAttemptsByOwner[customerOwnerId]}
                onAttemptStart={(attempt) => {
                  if (isCurrentAuthenticatedCustomer(customerOwnerId)) {
                    rememberBookingAddressAttempt(customerOwnerId, attempt);
                    setAddressAttemptsByOwner((previous) => ({ ...previous, [customerOwnerId]: attempt }));
                  }
                }}
                onCreatedId={(id) => {
                  if (!isCurrentAuthenticatedCustomer(customerOwnerId)) return;
                  const latest = getBookingAddressAttempt(customerOwnerId);
                  if (latest) rememberBookingAddressAttempt(customerOwnerId, { ...latest, knownId: id });
                  setAddressAttemptsByOwner((previous) => {
                    const attempt = previous[customerOwnerId];
                    return attempt
                      ? { ...previous, [customerOwnerId]: { ...attempt, knownId: id } }
                      : previous;
                  });
                }}
                onAttemptCleared={() => {
                  if (!isCurrentAuthenticatedCustomer(customerOwnerId)) return;
                  clearBookingAddressAttempt(customerOwnerId);
                  setAddressAttemptsByOwner((previous) => {
                    const next = { ...previous };
                    delete next[customerOwnerId];
                    return next;
                  });
                }}
                isOwnerCurrent={isCurrentAuthenticatedCustomer}
                onCancel={() => setAddressEditorOpen(false)}
                onSaved={(saved, all) => {
                  if (!isCurrentAuthenticatedCustomer(customerOwnerId)
                    || saved.userId !== customerOwnerId
                    || !addressReadyForBooking(saved)
                    || !all.some((address) => address.id === saved.id && address.userId === customerOwnerId)) return;
                  clearBookingAddressAttempt(customerOwnerId);
                  setAddressAttemptsByOwner((previous) => {
                    const next = { ...previous };
                    delete next[customerOwnerId];
                    return next;
                  });
                  setAddresses(all);
                  setAddressId(saved.id);
                  setAddressEditorOpen(false);
                }}
              />
  ) : null;

  if (!isAuthenticated || userRole !== UserRole.CUSTOMER) {
    return (
      <SafeAreaView style={[styles.page, { backgroundColor: colors.background }]}>
        {backBtn}
        <Text style={[styles.title, { color: colors.text }]}>Đăng nhập bằng tài khoản khách hàng để đặt lịch.</Text>
        {action('Đăng nhập', () => navigation.navigate('Auth'))}
      </SafeAreaView>
    );
  }

  if (addressEditorOpen && bookingStage === 1 && !visibleReviewSnapshot && !visibleCreatedBookingId) {
    return (
      <SafeAreaView style={[styles.page, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
        {headerBar}
        {addressEditor}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.page, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      {headerBar}
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        {durableBlocked && !isSubmitting && !visibleCreatedBookingId && !visibleUncertainAttempt && (
          <View style={styles.section}>
            <Text accessibilityRole="alert" style={{ color: colors.error }}>Chưa xác minh được lần gửi trước hoặc bộ nhớ bảo vệ. Không gửi lại.</Text>
            <TouchableOpacity accessibilityRole="button" onPress={() => {
              const root = navigation as unknown as { navigate: (name: 'CustomerMain', params: { screen: 'Bookings' }) => void };
              root.navigate('CustomerMain', { screen: 'Bookings' });
            }}>
              <Text style={{ color: colors.primary }}>Mở lịch sử yêu cầu</Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" onPress={() => {
              const owner = customerOwnerId;
              if (!owner) return;
              const generation = useAuthStore.getState().sessionGeneration;
              void createProductionBookingAttempt(id => isCurrentAuthenticatedCustomer(id) && useAuthStore.getState().sessionGeneration === generation)
                .verify(owner).then(result => {
                  if (result.phase === 'resolved' && result.bookingId && isCurrentAuthenticatedCustomer(owner)
                    && useAuthStore.getState().sessionGeneration === generation) navigation.navigate('CustomerBookingDetail', { bookingId: result.bookingId });
                });
            }}><Text style={{ color: colors.primary }}>Kiểm tra yêu cầu</Text></TouchableOpacity>
          </View>
        )}
        {loading && (
          <View style={styles.loadingRow} accessible accessibilityLabel="Đang tải dịch vụ và địa chỉ">
            <ActivityIndicator color={colors.primary} accessibilityLabel="Đang tải dịch vụ và địa chỉ" />
            <Text style={[styles.note, { color: colors.textSecondary }]}>Đang tải dịch vụ và địa chỉ đã lưu…</Text>
          </View>
        )}
        {!!loadError && (
          <View style={styles.section}>
            <Text style={{ color: colors.error }}>{loadError}</Text>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => {
                void loadOptions();
              }}
              style={[styles.action, { backgroundColor: colors.primary }]}
            >
              <Text style={[styles.actionText, { color: colors.surface }]}>Tải lại</Text>
            </TouchableOpacity>
          </View>
        )}
        {!loading && !loadError && !visibleCreatedBookingId && !visibleReviewSnapshot && (
          <>
            {bookingStage === 0 && (
              <>

            {tabsOn && extras.length === 0 && (
              <TouchableOpacity
                testID="booking-multi-device"
                accessibilityRole="button"
                disabled={reviewDisabled}
                onPress={() => openPicker(selectedService ? 'add' : 'main')}
                style={[styles.option, { borderColor: colors.border, backgroundColor: colors.surface }]}
              >
                <Text style={{ color: colors.text, fontWeight: '700' }}>Có nhiều thiết bị cần sửa?</Text>
                <Text style={{ color: colors.primary }}>Đặt nhiều thiết bị</Text>
              </TouchableOpacity>
            )}
            <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 0 }]}>Dịch vụ</Text>
            {services.length === 0 && (
              <Text style={{ color: colors.textSecondary }}>
                Chưa có dịch vụ khả dụng. Vui lòng thử lại sau.
              </Text>
            )}

            {tabsOn && extras.length > 0 ? (
              <View style={{ gap: 8 }} testID="visit-services">
                {visitCards.map((card, index) => {
                  const selected = card.key === (onMain ? 'main' : activeTab);
                  const art = getServicePresentation(card.code);
                  return (
                    <TouchableOpacity
                      key={card.key}
                      testID={`visit-service-box-${index + 1}`}
                      accessibilityRole="tab"
                      accessibilityState={{ selected }}
                      accessibilityLabel={`Dịch vụ đã chọn: ${card.name}. Chạm để nhập thông tin.`}
                      style={[styles.option, { borderColor: selected ? colors.primary : colors.border, backgroundColor: colors.surface }]}
                      onPress={() => setActiveTab(card.key)}
                    >
                      <View style={styles.serviceRow}>
                        {art ? (
                          <Image source={art.imageSource} style={styles.serviceArt} resizeMode="contain" accessible={false} />
                        ) : (
                          <View style={[styles.serviceArt, styles.serviceArtFallback, { backgroundColor: colors.divider }]} accessible={false}>
                            <Ionicons name="construct-outline" size={24} color={colors.textSecondary} />
                          </View>
                        )}
                        <View style={styles.serviceCopy}>
                          <Text style={{ color: colors.text, fontWeight: '700' }}>{card.name}</Text>
                        </View>
                        <TouchableOpacity
                          accessibilityRole="button"
                          accessibilityLabel={`Đổi dịch vụ ${card.name}`}
                          disabled={reviewDisabled}
                          onPress={() => { setActiveTab(card.key); openPicker(card.key); }}
                          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
                        >
                          <Pencil size={20} color={colors.primary} strokeWidth={1.75} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          testID={`visit-service-remove-${index + 1}`}
                          accessibilityRole="button"
                          accessibilityLabel={`Xóa dịch vụ ${card.name}`}
                          disabled={reviewDisabled}
                          onPress={() => removeCard(card.key)}
                          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
                        >
                          <Trash2 size={20} color={colors.error} strokeWidth={1.75} />
                        </TouchableOpacity>
                      </View>
                    </TouchableOpacity>
                  );
                })}
                {selectedService && extras.length + 1 < deviceLimit && !reviewDisabled && (
                  <TouchableOpacity
                    testID="visit-add-device"
                    accessibilityRole="button"
                    accessibilityLabel="Thêm dịch vụ"
                    onPress={() => openPicker('add')}
                    style={[styles.option, { borderColor: colors.primary, borderStyle: 'dashed', backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }]}
                  >
                    <Plus size={20} color={colors.primary} strokeWidth={1.75} />
                    <Text style={{ color: colors.primary, fontWeight: '600' }}>Thêm dịch vụ</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : !!curService ? (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={`Dịch vụ đã chọn: ${curService.name}. Chạm để đổi dịch vụ.`}
                style={[styles.option, { borderColor: colors.primary, backgroundColor: colors.surface }]}
                onPress={() => openPicker(onMain ? 'main' : activeExtra?.key)}
              >
                <View style={styles.serviceRow}>
                  {curPresentation ? (
                    <Image
                      source={curPresentation.imageSource}
                      style={styles.serviceArt}
                      resizeMode="contain"
                      accessible={false}
                      testID="booking-service-artwork"
                    />
                  ) : (
                    <View
                      style={[styles.serviceArt, styles.serviceArtFallback, { backgroundColor: colors.divider }]}
                      accessible={false}
                      testID="booking-service-artwork-fallback"
                    >
                      <Ionicons name="construct-outline" size={24} color={colors.textSecondary} />
                    </View>
                  )}
                  <View style={styles.serviceCopy}>
                    <Text style={{ color: colors.text, fontWeight: '700' }}>{curService.name}</Text>
                  </View>
                  <View style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }} accessible={false}>
                    <Pencil size={20} color={colors.primary} strokeWidth={1.75} />
                  </View>
                </View>
              </TouchableOpacity>
            ) : services.length > 0 ? (
              <TouchableOpacity
                accessibilityRole="button"
                style={[styles.option, { borderColor: colors.border, backgroundColor: colors.surface }]}
                onPress={() => openPicker(onMain ? 'main' : activeExtra?.key)}
              >
                <Text style={{ color: colors.textSecondary }}>Chọn dịch vụ...</Text>
              </TouchableOpacity>
            ) : null}

            {!!curService && (
              <View style={{ gap: 8 }}>
              <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.text, marginTop: 0 }]}>
                Chi phí ước tính
              </Text>
              <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border, gap: 4 }]}>
                {curIsOther ? (
                  <Text style={{ color: colors.text, fontSize: 15, lineHeight: 22, fontWeight: '600' }}>
                    Yêu cầu ngoài danh sách — kỹ thuật viên sẽ khảo sát và báo giá
                  </Text>
                ) : (
                  <>
                    <Text style={{ color: colors.primaryStrong, fontSize: 20, lineHeight: 28, fontWeight: '700' }}>
                      {resolveServicePrice(curService).caption
                        ? resolveServicePrice(curService).text.replace(/^Tham khảo\s+/i, '')
                        : servicePricingLabel(curService)}
                    </Text>
                    {!!resolveServicePrice(curService).caption && (
                      <Text style={{ color: colors.text, fontSize: 14, lineHeight: 20 }}>
                        {resolveServicePrice(curService).caption}
                      </Text>
                    )}
                  </>
                )}
                <Text style={[styles.note, { color: colors.textSecondary, marginTop: 4 }]}>
                  {curIsOther
                    ? 'Mô tả thiết bị và công việc cần hỗ trợ.'
                    : 'Mỗi yêu cầu đặt 1 đơn vị dịch vụ.'}
                </Text>
              </View>
              </View>
            )}

            {deviceForms.map((d) => (
              <View key={`${d.key}:${d.serviceId}`} style={d.key === (onMain ? 'main' : activeTab) ? undefined : styles.hiddenForm}>
                <ServiceDeviceDetails
                  serviceId={d.serviceId}
                  deviceAttributes={d.attrs}
                  selectedVariantCode={d.code}
                  disabled={reviewDisabled}
                  onChangeAttributes={(attrs) => patchDeviceOf(d.key, { attrs })}
                  onChangeVariantCode={(code) => patchDeviceOf(d.key, { code })}
                  onPreview={(preview) => patchDeviceOf(d.key, { preview })}
                />
              </View>
            ))}

            <View
              onLayout={(event) => {
                descriptionTopRef.current = event.nativeEvent.layout.y;
              }}
            >

              <Text
                accessibilityRole="header"
                accessibilityLabel={`${curDescriptionLabel}, bắt buộc`}
                style={[styles.sectionTitle, { color: colors.text, marginTop: 0 }]}
              >
                {curDescriptionLabel}
                <Text style={{ color: colors.error }}> *</Text>
              </Text>
              <TextInput
                ref={descriptionInputRef}
                accessibilityLabel={curIsOther ? 'Mô tả yêu cầu' : 'Mô tả sự cố'}
                accessibilityHint={curDescriptionPlaceholder}
                value={curDescription}
                onChangeText={setCurDescription}
                onBlur={touchCur}
                multiline
                maxLength={5000}
                placeholder={curDescriptionPlaceholder}
                placeholderTextColor={colors.textSecondary}
                style={[
                  styles.input,
                  {
                    color: colors.text,
                    borderColor: curDescriptionError ? colors.error : colors.border,
                    backgroundColor: colors.surface,
                  },
                ]}
              />
              <View style={styles.descriptionSuggestions}>
                <Text style={[styles.suggestionHint, { color: colors.textSecondary }]}>Chạm để thêm hoặc bỏ gợi ý. Bạn vẫn có thể chỉnh sửa mô tả.</Text>
                <View style={styles.suggestionChips}>
                  {curSuggestions.map((suggestion) => {
                    const selected = hasBookingDescriptionSuggestion(curDescription, suggestion);
                    const disabled = !selected && appendBookingDescriptionSuggestion(curDescription, suggestion) === curDescription;
                    return (
                      <TouchableOpacity
                        key={suggestion}
                        accessibilityRole="button"
                        accessibilityLabel={`Gợi ý: ${suggestion}`}
                        accessibilityState={{ selected, disabled }}
                        disabled={disabled}
                        onPress={() => setCurDescription(toggleBookingDescriptionSuggestion(curDescription, suggestion))}
                        style={[styles.suggestionChip, {
                          backgroundColor: selected ? colors.primarySoft : colors.surface,
                          borderColor: selected ? colors.primary : colors.border,
                          opacity: disabled ? 0.5 : 1,
                        }]}
                      >
                        {selected && <Ionicons name="checkmark" size={16} color={colors.primary} accessible={false} />}
                        <Text style={[styles.suggestionChipText, { color: colors.text }]}>{suggestion}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
              {!!curDescriptionError && (
                <View style={styles.fieldError}>
                  <CircleAlert color={colors.error} size={16} />
                  <Text
                    accessibilityLiveRegion="polite"
                    style={[styles.fieldErrorText, { color: colors.error }]}
                  >
                    {curDescriptionError}
                  </Text>
                </View>
              )}
            </View>

            <View style={{ gap: 8 }}>
            <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.text, marginTop: 0 }]}>
              Ảnh sự cố
            </Text>
            <View style={[styles.photoSection, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.note, { color: colors.textSecondary }]}>
                Tối đa 5 ảnh JPEG, PNG hoặc WebP. Chọn lại ảnh từ AI nếu cần đính kèm.
              </Text>
              <View style={styles.photoList}>
                {curPhotos.map((photo, index) => (
                  <View key={photo.uri} style={styles.photoItem}>
                    <Image
                      source={{ uri: photo.uri }}
                      style={[styles.photoPreview, { backgroundColor: colors.divider }]}
                      resizeMode="cover"
                      accessible
                      accessibilityLabel={`Ảnh sự cố ${index + 1}`}
                    />
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel={`Xóa ảnh sự cố ${index + 1}`}
                      accessibilityHint="Gỡ ảnh khỏi yêu cầu hiện tại"
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      disabled={reviewDisabled}
                      onPress={() => removeCurPhoto(photo.uri)}
                      style={[styles.removePhotoButton, { backgroundColor: colors.surface }]}
                    >
                      <Ionicons name="close-circle" size={24} color={colors.error} />
                    </TouchableOpacity>
                    {uploadingPhotoUri === photo.uri && (
                      <Text style={[styles.photoStatus, { color: colors.textSecondary }]}>
                        Đang tải ảnh...
                      </Text>
                    )}
                    {photo.uploadId && !photo.uploadUncertain && (
                      <Text style={[styles.photoStatus, { color: colors.success }]}>
                        Ảnh đã sẵn sàng
                      </Text>
                    )}
                    {photo.uploadUncertain && (
                      <Text style={[styles.photoStatus, { color: colors.error }]}>
                        Chưa xác nhận lượt tải
                      </Text>
                    )}
                  </View>
                ))}
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Thêm ảnh sự cố"
                  accessibilityHint={`Đã chọn ${curPhotos.length} trên ${MAX_BOOKING_PHOTOS} ảnh`}
                  disabled={reviewDisabled || curPhotos.length >= MAX_BOOKING_PHOTOS}
                  onPress={() => { void pickCurPhotos(); }}
                  style={[
                    styles.addPhotoButton,
                    {
                      borderColor: colors.border,
                      backgroundColor: colors.background,
                      opacity: reviewDisabled || curPhotos.length >= MAX_BOOKING_PHOTOS ? 0.55 : 1,
                    },
                  ]}
                >
                  <Ionicons name="add" size={24} color={colors.primary} />
                  <Text style={{ color: colors.primary, fontWeight: '600' }}>
                    Thêm ảnh ({curPhotos.length}/{MAX_BOOKING_PHOTOS})
                  </Text>
                </TouchableOpacity>
              </View>
              {!!photoUploadError && (
                <Text accessibilityRole="alert" style={[styles.photoError, { color: colors.error }]}>
                  {photoUploadError}
                </Text>
              )}
              {onMain && chatAttachments.length > 0 && (
                <View testID="booking-chat-attachments" style={[styles.chatAttachments, { backgroundColor: colors.tone.warning.bg }]}>
                  <Text style={{ flex: 1, color: colors.tone.warning.text, fontSize: 13, lineHeight: 19 }}>
                    {`Gửi kèm từ trò chuyện với trợ lý: ${chatAttachmentSummary(chatAttachments)}. Kỹ thuật viên xem được trước khi nhận đơn.`}
                  </Text>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Bỏ ảnh và video từ trò chuyện với trợ lý"
                    disabled={reviewDisabled}
                    onPress={() => setChatAttachments([])}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={{ color: colors.primary, fontWeight: '600' }}>Bỏ</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
            </View>

              </>
            )}

            {bookingStage === 1 && (
              <>
            <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 0 }]}>Địa chỉ sửa chữa</Text>
            {addressEditorOpen && customerOwnerId ? (
              addressEditor
            ) : (
              <>


            {addresses.length === 0 && (
              <View style={styles.section}>
                <Text style={{ color: colors.textSecondary }}>
                  Chưa có địa chỉ đã lưu. Thêm địa chỉ mới với ghim chính xác ngay tại bước này.
                </Text>
                <TouchableOpacity accessibilityRole="button" onPress={openInlineAddressEditor} style={styles.stageEdit}>
                  <Text style={{ color: colors.primary }}>Thêm địa chỉ mới</Text>
                </TouchableOpacity>
              </View>
            )}
            {!!selectedAddress ? (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Đổi địa chỉ sửa chữa"
                style={[styles.option, { borderColor: colors.primary, backgroundColor: colors.surface }]}
                onPress={openAddressSheet}
              >
                <Text style={{ color: colors.text, fontWeight: '700' }}>
                  {selectedAddress.label || 'Địa chỉ'}
                </Text>
                <Text style={{ color: colors.textSecondary }}>
                  {[selectedAddress.line1, selectedAddress.ward, selectedAddress.district, selectedAddress.province]
                    .filter(Boolean)
                    .join(', ')}
                </Text>
                <Text style={{ color: selectedAddressReady ? colors.success : colors.error }}>
                  {selectedAddressReady ? 'Đã có vị trí GPS để đặt lịch' : 'Cần cập nhật vị trí GPS'}
                </Text>
                <Text style={{ color: colors.primary }}>Đổi địa chỉ</Text>
              </TouchableOpacity>
            ) : addresses.length > 0 ? (
              <TouchableOpacity
                accessibilityRole="button"
                style={[styles.option, { borderColor: colors.border, backgroundColor: colors.surface }]}
                onPress={openAddressSheet}
              >
                <Text style={{ color: colors.textSecondary }}>Chọn địa chỉ...</Text>
              </TouchableOpacity>
            ) : null}
            {!!selectedAddress && !selectedAddressReady && (
              <View style={styles.section}>
                <Text accessibilityRole="alert" style={{ color: colors.error }}>
                  Địa chỉ đang chọn chưa có tọa độ hợp lệ nên hệ thống không thể tạo yêu cầu an
                  toàn.
                </Text>
                {action('Cập nhật địa chỉ trong Hồ sơ', openAddressEditor)}
              </View>
            )}
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Thêm địa chỉ mới"
              onPress={openInlineAddressEditor} style={styles.stageEdit}>
              <Text style={{ color: colors.primary }}>+ Thêm địa chỉ mới tại đây</Text>
            </TouchableOpacity>

              </>
            )}
              </>
            )}

            {bookingStage === 1 && (
              <>
            <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 12 }]}>Khung giờ</Text>
            <BookingSessionPicker
              value={schedule}
              onChange={(next) => { setSchedule(next); setReviewError(''); }}
            />
            <Text style={[styles.note, { color: colors.textSecondary }]}>Ghi chú cho thợ</Text>
            <TextInput
              testID="customer-note"
              accessibilityLabel="Ghi chú cho thợ"
              value={customerNote}
              onChangeText={(t) => { setCustomerNote(t); setReviewError(''); }}
              maxLength={1000}
              multiline
              placeholder="Ví dụ: gọi trước khi tới, nhà trong hẻm, gửi xe ở đâu…"
              placeholderTextColor={colors.textSecondary}
              style={{ minHeight: 64, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, color: colors.text, textAlignVertical: 'top' }}
            />
            {!!reviewError && (
              <Text accessibilityRole="alert" style={[styles.note, { color: colors.error }]}>{reviewError}</Text>
            )}
            {!!photoUploadError && (
              <View>
                <Text accessibilityRole="alert" style={[styles.photoError, { color: colors.error }]}>
                  {photoUploadError}
                </Text>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Sửa ảnh sự cố"
                  style={styles.stageEdit} onPress={() => setBookingStage(0)}>
                  <Text style={{ color: colors.primary }}>Kiểm tra ảnh sự cố</Text>
                </TouchableOpacity>
              </View>
            )}


            {!!visibleUncertainAttempt && (
              <View style={[styles.section, { backgroundColor: colors.surface }]}>
                <Text style={{ color: colors.error, fontWeight: '700' }}>
                  Kết quả lần gửi vừa rồi chưa xác định.
                </Text>
                <Text style={[styles.note, { color: colors.textSecondary }]}>
                  Không gửi lại. Kiểm tra đúng mã yêu cầu được hệ thống trả về;
                  lịch sử trùng nội dung không xác minh được lần gửi này.
                </Text>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityState={{ disabled: isReconciling }}
                  disabled={isReconciling}
                  onPress={() => {
                    void reconcileUncertainCreate();
                  }}
                  style={[
                    styles.action,
                    {
                      backgroundColor: isReconciling ? colors.border : colors.primary,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.actionText,
                      {
                        color: isReconciling ? colors.textSecondary : colors.surface,
                      },
                    ]}
                  >
                    {isReconciling ? 'Đang kiểm tra lịch sử...' : 'Kiểm tra lịch sử'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
              </>
            )}
          </>
        )}

        {visibleReviewSnapshot && !visibleCreatedBookingId && (
          <View testID="booking-review-full-screen" style={[styles.section, { backgroundColor: colors.surface }]}>
            <BookingReviewSummary snapshot={visibleReviewSnapshot} colors={colors} />
            {!!visibleReviewError && (
              <Text accessibilityRole="alert" style={{ color: colors.error }}>{visibleReviewError}</Text>
            )}
            {!!photoUploadError && (
              <Text accessibilityRole="alert" style={[styles.photoError, { color: colors.error }]}>
                {photoUploadError}
              </Text>
            )}
            {(hasUncertainReviewPhoto || !!photoUploadError) && (
              <TouchableOpacity testID="review-fix-photos" accessibilityRole="button" accessibilityLabel="Sửa ảnh sự cố"
                disabled={isSubmitting} style={styles.stageEdit}
                onPress={() => { dismissReview(); showBookingStage(0); }}>
                <Text style={{ color: colors.primary, fontWeight: '600' }}>Sửa ảnh sự cố</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        {!!visibleCreatedBookingId && (
          <View testID="booking-submitted-receipt" style={[styles.section, { backgroundColor: colors.surface }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Ionicons name="checkmark-circle" size={28} color={colors.success} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.text, marginTop: 0 }]}>Đã gửi yêu cầu</Text>
                <Text selectable style={[styles.note, { color: colors.textSecondary }]}>Mã tham chiếu: {visibleCreatedBookingId.slice(0, 8)}</Text>
              </View>
            </View>
            <Text style={[styles.note, { color: colors.textSecondary }]}>Chọn kỹ thuật viên để gửi lời mời.</Text>
            {visibleCreatedBooking && (
              <View style={{ gap: 10 }}>
                <ReceiptLine icon={Wrench} color={colors.primaryStrong}>
                  <Text style={{ color: colors.text, fontWeight: '700' }}>{visibleCreatedBooking.snapshot.serviceName}</Text>
                </ReceiptLine>
                <ReceiptLine icon={MessageSquareText} color={colors.textSecondary}>
                  <Text style={[styles.note, { color: colors.text }]}>{visibleCreatedBooking.snapshot.request.description}</Text>
                </ReceiptLine>
                <ReceiptLine icon={Clock} color={colors.textSecondary}>
                  <Text style={[styles.note, { color: colors.textSecondary }]}>{visibleCreatedBooking.snapshot.scheduleLabel}</Text>
                </ReceiptLine>
                <ReceiptLine icon={MapPin} color={colors.textSecondary}>
                  <Text style={[styles.note, { color: colors.textSecondary }]}>{visibleCreatedBooking.snapshot.addressLabel} · {visibleCreatedBooking.snapshot.addressDescription}</Text>
                </ReceiptLine>
                <ReceiptLine icon={Banknote} color={colors.textSecondary}>
                  <Text style={[styles.note, { color: colors.textSecondary }]}>
                    {visibleCreatedBooking.snapshot.pricingLabel} · Số lượng: {visibleCreatedBooking.snapshot.request.quantity ?? 1}
                  </Text>
                </ReceiptLine>
                <ReceiptLine icon={ImageIcon} color={colors.textSecondary}>
                  <Text style={[styles.note, { color: colors.textSecondary }]}>
                    Ảnh đính kèm: {visibleCreatedBooking.snapshot.photos.length}/{MAX_BOOKING_PHOTOS}
                  </Text>
                </ReceiptLine>
                {visibleCreatedBooking.snapshot.hasAiSummary && (
                  <ReceiptLine icon={Sparkles} color={colors.textSecondary}>
                    <Text style={[styles.note, { color: colors.textSecondary }]}>Đã kèm tóm tắt từ trợ lý AI.</Text>
                  </ReceiptLine>
                )}
              </View>
            )}
          </View>
        )}
      </ScrollView>
      {((!loading && !loadError) || visibleReviewSnapshot || visibleCreatedBookingId) && (
        <BookingActionBar>
          {!visibleReviewSnapshot && !visibleCreatedBookingId && (
            bookingStage === 0
              ? <BookingPrimaryAction label="Tiếp tục: Chọn địa chỉ" onPress={continueToAddress} disabled={reviewDisabled || !pricingReady} colors={colors} />
              : !addressEditorOpen && (extras.length > 0
                ? <BookingPrimaryAction label={visitBusy ? 'Đang gửi yêu cầu...' : `Gửi yêu cầu ${extras.length + 1} thiết bị`}
                  onPress={confirmVisit} disabled={reviewDisabled || visitBusy || visitUnknown} colors={colors} />
                : <BookingPrimaryAction label={isSubmitting ? 'Đang gửi yêu cầu...'
                  : visibleUncertainAttempt ? 'Chờ xác minh yêu cầu' : 'Xem lại yêu cầu'}
                  onPress={continueToReview} disabled={reviewDisabled} colors={colors} />)
          )}
          {visibleReviewSnapshot && !visibleCreatedBookingId && (
            <>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Chỉnh sửa"
                disabled={isSubmitting} accessibilityState={{ disabled: isSubmitting }}
                style={styles.stageEdit} onPress={dismissReview}>
                <Text style={{ color: colors.primary, fontWeight: '600' }}>Chỉnh sửa</Text>
              </TouchableOpacity>
              <BookingPrimaryAction label={isSubmitting ? 'Đang gửi yêu cầu...' : 'Xác nhận đặt lịch'} onPress={() => {
                if (isSubmitting || hasUncertainReviewPhoto) return;
                void submit(visibleReviewSnapshot);
              }} disabled={isSubmitting || hasUncertainReviewPhoto} colors={colors} accessibilityLabel="Xác nhận đặt lịch" />
            </>
          )}
          {visibleCreatedBookingId && (
            <>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Về trang chủ"
                style={styles.stageEdit} onPress={() => navigation.navigate('CustomerMain')}>
                <Text style={{ color: colors.primary, fontWeight: '600' }}>Về trang chủ</Text>
              </TouchableOpacity>
              {action('Chọn kỹ thuật viên', () => navigation.navigate('CustomerMatching', {
                bookingId: visibleCreatedBookingId,
              }))}
            </>
          )}
        </BookingActionBar>
      )}

      <BottomSheetModal
        ref={pickerSheetRef}
        snapPoints={pickerSnapPoints}
        backdropComponent={(props) => (
          <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.5} />
        )}
      >
        <View style={[styles.pickerHeader, { borderBottomColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 0 }]}>Chọn dịch vụ</Text>
          {pickerCategories.length > 0 && (
            <CategoryPills
              categories={pickerCategories}
              selectedId={pickerCategoryId}
              onSelect={setPickerCategoryId}
            />
          )}
          <BottomSheetTextInput accessibilityLabel="Tìm dịch vụ"
            value={pickerQuery}
            onChangeText={setPickerQuery}
            placeholder="Tìm dịch vụ..."
            placeholderTextColor={colors.textSecondary}
            style={[
              styles.input,
              { minHeight: 44, color: colors.text, borderColor: colors.border, backgroundColor: colors.background },
            ]}
          />
        </View>
        <BottomSheetFlatList
          data={pickerServices}
          keyExtractor={(service) => service.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.pickerListContent}
          renderItem={({ item: service }) => (
            <TouchableOpacity
              accessibilityRole="radio"
              accessibilityState={{ checked: pickerSelectedId === service.id }}
              style={[
                styles.option,
                {
                  borderColor: pickerSelectedId === service.id ? colors.primary : colors.border,
                  backgroundColor: colors.surface,
                },
              ]}
              onPress={() => {
                Haptics.selectionAsync();
                chooseService(service);
              }}
            >
              <Text style={{ color: colors.text }}>
                {service.name}
                {pickerSelectedId === service.id ? ' ✓' : ''}
              </Text>
              {servicePriceSummaryText(service.priceSummary) ? (
                <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                  {servicePriceSummaryText(service.priceSummary)?.label}
                </Text>
              ) : null}
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <Text style={{ color: colors.textSecondary, padding: 16 }}>Không tìm thấy dịch vụ phù hợp.</Text>
          }
        />
      </BottomSheetModal>

      <BottomSheetModal
        ref={addressSheetRef}
        enableDynamicSizing
        maxDynamicContentSize={Math.round(windowHeight * 0.8)}
        backdropComponent={(props) => (
          <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.5} />
        )}
      >
        <BottomSheetFlatList
          data={addresses}
          ListHeaderComponent={
            <View style={[styles.pickerHeader, { borderBottomColor: colors.border, marginHorizontal: -16, marginTop: -12, marginBottom: 12 }]}>
              <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 0 }]}>Chọn địa chỉ sửa chữa</Text>
            </View>
          }
          keyExtractor={(address) => address.id}
          contentContainerStyle={styles.pickerListContent}
          renderItem={({ item: address }) => {
            const ready = addressReadyForBooking(address);
            return (
              <TouchableOpacity
                accessibilityRole="radio"
                accessibilityState={{ checked: addressId === address.id }}
                style={[
                  styles.option,
                  {
                    borderColor: addressId === address.id ? colors.primary : colors.border,
                    backgroundColor: colors.surface,
                  },
                ]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setAddressId(address.id);
                  addressSheetRef.current?.dismiss();
                }}
              >
                <Text style={{ color: colors.text }}>
                  {address.label || 'Địa chỉ'}
                  {addressId === address.id ? ' ✓' : ''}
                </Text>
                <Text style={{ color: colors.textSecondary }}>
                  {[address.line1, address.ward, address.district, address.province]
                    .filter(Boolean)
                    .join(', ')}
                </Text>
                <Text style={{ color: ready ? colors.success : colors.error }}>
                  {ready ? 'Đã có vị trí GPS để đặt lịch' : 'Cần cập nhật vị trí GPS'}
                </Text>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <Text style={{ color: colors.textSecondary, padding: 16 }}>Chưa có địa chỉ đã lưu.</Text>
          }
        />
      </BottomSheetModal>


    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { padding: 16, paddingBottom: 32, gap: 16, flexGrow: 1 },
  backBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center', alignSelf: 'flex-start' },
  screenHeader: { minHeight: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderBottomWidth: 1 },
  headerTitle: { flex: 1, minWidth: 0, textAlign: 'center', fontSize: 18, lineHeight: 26, fontWeight: '700' },
  bookingTopSpacer: { width: 44, height: 44 },
  stageEdit: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  title: { fontSize: 22, lineHeight: 30, fontWeight: '700', marginVertical: 8 },
  stepEyebrow: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  section: { padding: 16, borderWidth: 1, borderRadius: 14, gap: 12 },
  sectionTitle: { fontSize: 16, lineHeight: 24, fontWeight: '700', marginTop: 8 },
  note: { lineHeight: 20, fontSize: 13 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  option: { padding: 16, borderWidth: 1, borderRadius: 14, gap: 6, minHeight: 48, justifyContent: 'center' },
  serviceRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  serviceArt: { width: 56, height: 56, borderRadius: 12 },
  serviceArtFallback: { alignItems: 'center', justifyContent: 'center' },
  serviceCopy: { flex: 1, gap: 2 },
  input: { minHeight: 94, padding: 12, borderWidth: 1, borderRadius: 14, textAlignVertical: 'top', fontSize: 16, lineHeight: 24 },
  hiddenForm: { display: 'none' },
  descriptionSuggestions: { gap: 8, marginTop: 10 },
  suggestionHint: { fontSize: 12, lineHeight: 16 },
  suggestionChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  suggestionChip: { minHeight: 44, maxWidth: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderRadius: 22 },
  suggestionChipText: { flexShrink: 1, fontSize: 12, lineHeight: 16, fontWeight: '600' },
  fieldError: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  fieldErrorText: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: '500' },
  photoSection: { padding: 16, borderWidth: 1, borderRadius: 14, gap: 8 },
  photoList: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 8 },
  photoItem: { width: 78, gap: 4 },
  photoPreview: { width: 72, height: 72, borderRadius: 12 },
  removePhotoButton: {
    position: 'absolute',
    top: -8,
    right: -7,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoStatus: { fontSize: 12, lineHeight: 16 },
  addPhotoButton: {
    minWidth: 112,
    minHeight: 72,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
    gap: 2,
  },
  photoError: { fontSize: 13, lineHeight: 19 },
  chatAttachments: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12 },
  action: { padding: 15, marginTop: 0, borderRadius: 14, alignItems: 'center', justifyContent: 'center', minHeight: 52 },
  actionText: { fontWeight: '700', fontSize: 15, lineHeight: 22 },
  pickerHeader: { paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, gap: 8 },
  pickerListContent: { padding: 16, paddingTop: 12, gap: 8 },
});

