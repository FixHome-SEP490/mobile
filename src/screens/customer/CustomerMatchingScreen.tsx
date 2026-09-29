import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { bookingsApi, type BookingItem, type TechnicianCandidate } from '../../api/bookings.api';
import { ordersApi, type ServiceOrderItem } from '../../api/orders.api';
import { useAppTheme } from '../../constants/theme';
import { useAuthStore } from '../../store';
import { UserRole, type RootStackParamList } from '../../types';
import { canChooseTechnicians, mayRequestLinkedReplacement, orderedCandidateIds, toggleCandidate } from '../../utils/booking-candidate-selection';
import {
  MatchingTechnicianCard,
  MatchingTechnicianDetailSheet,
  MatchingTechnicianSkeleton,
} from './MatchingTechnicianPresentation';
import {
  classifyLinkedShortlistPostError,
  hasPositiveNewInvitations,
  invitationIds,
  isVisibleBookingOwner,
  validateLinkedReselectPrePost,
  type LinkedReselectPrePostSnapshot,
} from './customer-linked-reselect';
import {
  clearLinkedReselectAttempt,
  readLinkedReselectAttempt,
  saveLinkedReselectAttemptBeforePost,
  type LinkedReselectAttempt,
} from './customer-linked-reselect-attempt';
import {
  candidateAvailabilityState,
  classifyInitialShortlistPostError,
  clearInitialShortlistAttempt,
  readInitialShortlistAttempt,
  saveInitialShortlistAttemptBeforePost,
  verifiedLinkedOrderId,
  type InitialShortlistAttempt,
} from './customer-initial-shortlist-attempt';

type MatchingRoute = RouteProp<RootStackParamList, 'CustomerMatching'>;
type CandidateDetailTarget = { bookingId: string; ownerId: string; candidateUserId: string };

function matchingSessionKey(
  bookingId: string,
  userId: string | null | undefined,
  role: string | null | undefined,
  sessionGeneration: number,
): string {
  return `${bookingId}::${userId ?? ''}::${role ?? ''}::${sessionGeneration}`;
}

function isTransientMatchingReadFailure(problem: unknown): boolean {
  if (!problem || typeof problem !== 'object') return false;
  const failure = problem as {
    code?: unknown;
    request?: unknown;
    response?: { status?: unknown } | null;
  };
  if (failure.response) {
    const status = failure.response.status;
    return typeof status === 'number'
      && (status === 408 || status === 425 || status === 429 || status >= 500);
  }
  return failure.request != null
    || ['ERR_NETWORK', 'ECONNABORTED', 'ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN'].includes(String(failure.code));
}

function describeBooking(booking: BookingItem): string {
  if (booking.serviceOrderId && booking.status === 'CLOSED') return 'Lượt mời trước đã kết thúc. Thử yêu cầu chọn kỹ thuật viên mới; hệ thống kiểm tra trước khi gửi.';
  if (booking.serviceOrderId && booking.status === 'MATCHING') return 'Đang tìm kỹ thuật viên thay thế; đơn vẫn chờ kỹ thuật viên phản hồi lời mời còn lại. Làm mới để cập nhật, không cần gửi lại.';
  if (booking.serviceOrderId && booking.status === 'MATCHED') return 'Kỹ thuật viên đã nhận đơn. Đơn sửa chữa đã được tạo trên hệ thống.';
  if (booking.status === 'MATCHED') return 'Đã có kỹ thuật viên nhận lời mời. Đang kiểm tra liên kết đơn sửa chữa.';
  if (booking.status === 'MATCHING') {
    const pending = (booking.invitations ?? []).find((invitation) => invitation.status === 'PENDING');
    return pending
      ? `Đang chờ phản hồi từ kỹ thuật viên ưu tiên số ${pending.priorityOrder}. Kỹ thuật viên dự phòng chỉ được mời khi người trước từ chối hoặc hết hạn.`
      : 'Đang xử lý lời mời kỹ thuật viên. Hãy làm mới để xem trạng thái mới nhất.';
  }
  if (booking.status === 'CANCELLED') return 'Yêu cầu đặt lịch này đã bị hủy.';
  if (booking.status === 'CLOSED') return 'Vòng tìm kỹ thuật viên trước đã kết thúc. Kiểm tra lịch hẹn trước khi chọn lại.';
  return 'Yêu cầu đã được ghi nhận. Bạn có thể chọn 1 hoặc 2 kỹ thuật viên theo thứ tự ưu tiên.';
}

function bookingStatusLabel(status: string): string {
  switch (String(status).toUpperCase()) {
    case 'SUBMITTED': return 'Đã gửi yêu cầu';
    case 'MATCHING': return 'Đang tìm kỹ thuật viên';
    case 'MATCHED': return 'Đã ghép kỹ thuật viên';
    case 'CONFIRMED': return 'Đã xác nhận';
    case 'CLOSED': return 'Vòng tìm kỹ thuật viên đã kết thúc';
    case 'CANCELLED': return 'Đã hủy';
    default: return 'Đang xử lý yêu cầu';
  }
}

export default function CustomerMatchingScreen() {
  const { colors } = useAppTheme();
  const route = useRoute<MatchingRoute>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const bookingId = route.params.bookingId;
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const role = useAuthStore((state) => state.user?.role);
  const userId = useAuthStore((state) => state.user?.id);
  const sessionGeneration = useAuthStore((state) => state.sessionGeneration);
  const [booking, setBooking] = useState<BookingItem | null>(null);
  const [linkedOrder, setLinkedOrder] = useState<ServiceOrderItem | null>(null);
  const [candidates, setCandidates] = useState<TechnicianCandidate[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sentConfirmed, setSentConfirmed] = useState(false);
  const [uncertainSend, setUncertainSend] = useState(false);
  const [attemptLocked, setAttemptLocked] = useState(false);
  const [rejectedDefinitive, setRejectedDefinitive] = useState(false);
  const [detailTarget, setDetailTarget] = useState<CandidateDetailTarget | null>(null);
  const [loadedContextKey, setLoadedContextKey] = useState('');
  const detailSheetRef = useRef<BottomSheetModal>(null);
  const sendingRef = useRef(false);
  // A shortlist POST is never repeated because a timeout may follow a successful write.
  const shortlistRequestLockedRef = useRef(false);
  const uncertainSendRef = useRef(false);
  const rejectedDefinitiveRef = useRef(false);
  const baselineInvitationIdsRef = useRef<string[]>([]);
  const sessionKeyRef = useRef('');
  const loadedContextKeyRef = useRef('');
  const loadGeneration = useRef(0);

  const clearCandidateView = useCallback(() => {
    setCandidates([]);
    setSelected([]);
    setDetailTarget(null);
  }, []);

  const publishCandidates = useCallback((list: TechnicianCandidate[]) => {
    const available = list.filter((candidate) => candidate.isAvailable);
    const candidateIds = new Set(available.map((candidate) => candidate.userId));
    setCandidates(available);
    setSelected((previous) => previous.filter((candidateUserId) => candidateIds.has(candidateUserId)));
    setDetailTarget((current) => current && !candidateIds.has(current.candidateUserId) ? null : current);
  }, []);

  const loadCurrent = useCallback(async () => {
    // P1a: hook values drive effect identity (an A->B switch refires the load); live
    // store values are re-verified after every await because they may change mid-flight.
    const hookUserId = userId ?? null;
    const hookRole = role ?? null;
    const hookSessionGeneration = sessionGeneration;
    const liveUserId = useAuthStore.getState().user?.id ?? null;
    const liveRole = useAuthStore.getState().user?.role ?? null;
    const liveSessionGeneration = useAuthStore.getState().sessionGeneration;
    if (liveUserId !== hookUserId
      || liveRole !== hookRole
      || liveSessionGeneration !== hookSessionGeneration) return;
    const currentUserId = liveUserId;
    const currentRole = liveRole;
    const currentSessionGeneration = liveSessionGeneration;
    // Revisit/focus/auth/account/booking change invalidates stale GETs, selection and locks.
    const sessionKey = matchingSessionKey(
      bookingId,
      currentUserId,
      currentRole,
      currentSessionGeneration,
    );
    if (sessionKeyRef.current !== sessionKey) {
      sessionKeyRef.current = sessionKey;
      loadedContextKeyRef.current = '';
      setLoadedContextKey('');
      shortlistRequestLockedRef.current = false;
      sendingRef.current = false;
      uncertainSendRef.current = false;
      rejectedDefinitiveRef.current = false;
      baselineInvitationIdsRef.current = [];
      setUncertainSend(false);
      setSending(false);
      setSentConfirmed(false);
      setAttemptLocked(false);
      setRejectedDefinitive(false);
      setBooking(null);
      setLinkedOrder(null);
      clearCandidateView();
      setLoading(true);
      setRefreshing(false);
    }
    if (!isAuthenticated || role !== UserRole.CUSTOMER || !currentUserId) {
      // Logged out / wrong role: never keep the previous account's private state visible.
      shortlistRequestLockedRef.current = false;
      sendingRef.current = false;
      uncertainSendRef.current = false;
      rejectedDefinitiveRef.current = false;
      baselineInvitationIdsRef.current = [];
      loadedContextKeyRef.current = '';
      setLoadedContextKey('');
      setBooking(null);
      setLinkedOrder(null);
      clearCandidateView();
      setUncertainSend(false);
      setSending(false);
      setSentConfirmed(false);
      setAttemptLocked(false);
      setRejectedDefinitive(false);
      setError('');
      setLoading(false);
      setRefreshing(false);
      return;
    }
    const generation = ++loadGeneration.current;
    // Every publish below requires the same session that started the load.
    const sessionAlive = () =>
      loadGeneration.current === generation
      && useAuthStore.getState().user?.id === currentUserId
      && useAuthStore.getState().user?.role === currentRole
      && useAuthStore.getState().sessionGeneration === currentSessionGeneration;
    const isOwnerBoundRefresh = loadedContextKeyRef.current === sessionKey;
    let ownerBoundSnapshotValidated = false;
    setLoading(!isOwnerBoundRefresh);
    setRefreshing(isOwnerBoundRefresh);
    setError('');
    if (!isOwnerBoundRefresh) {
      setLinkedOrder(null);
      setAttemptLocked(false);
    }
    try {
      const nextBooking = await bookingsApi.getBooking(bookingId);
      if (!sessionAlive()) return;
      if (nextBooking.id !== bookingId) throw new Error('Thông tin trả về không khớp yêu cầu.');
      // Owner binding including the unlinked flow; a missing customerId fails closed.
      if (nextBooking.customerId !== currentUserId) {
        loadedContextKeyRef.current = '';
        setLoadedContextKey('');
        setBooking(null);
        setLinkedOrder(null);
        clearCandidateView();
        setUncertainSend(false);
        setSentConfirmed(false);
        setAttemptLocked(false);
        setRejectedDefinitive(false);
        setError('Yêu cầu này không thuộc tài khoản đang đăng nhập. Hãy kiểm tra lại tài khoản.');
        return;
      }
      ownerBoundSnapshotValidated = true;
      setBooking(nextBooking);

      // K03: the FIRST shortlist uses its own durable owner+Booking marker.
      // It is deliberately separate from the existing linked-reselect marker.
      let initialAttempt: InitialShortlistAttempt | null = null;
      let initialAttemptBlocked = false;
      try {
        const initialRead = await readInitialShortlistAttempt(
          AsyncStorage,
          currentUserId,
          bookingId,
        );
        if (!sessionAlive()) return;
        if (initialRead.state === 'invalid') {
          initialAttemptBlocked = true;
          setAttemptLocked(true);
        } else if (initialRead.state === 'valid') {
          initialAttempt = initialRead.attempt;
          if (
            hasPositiveNewInvitations(
              initialAttempt.baselineInvitationIds,
              nextBooking.invitations,
            )
          ) {
            await clearInitialShortlistAttempt(
              AsyncStorage,
              currentUserId,
              bookingId,
            ).catch(() => undefined);
            if (!sessionAlive()) return;
            initialAttempt = null;
            setAttemptLocked(false);
            setSentConfirmed(true);
          }
        }
      } catch {
        if (!sessionAlive()) return;
        initialAttemptBlocked = true;
        setAttemptLocked(true);
        setError(
          'Chưa thể kiểm tra lượt mời trước đó. Không gửi lại để tránh trùng; hãy thử làm mới hoặc liên hệ hỗ trợ.',
        );
      }

      if (!nextBooking.serviceOrderId) {
        if (initialAttempt || initialAttemptBlocked) {
          setAttemptLocked(true);
          clearCandidateView();
          return;
        }

        if (
          uncertainSendRef.current &&
          hasPositiveNewInvitations(
            baselineInvitationIdsRef.current,
            nextBooking.invitations,
          )
        ) {
          uncertainSendRef.current = false;
          setUncertainSend(false);
          setSentConfirmed(true);
          clearCandidateView();
        }
        if (canChooseTechnicians(nextBooking) && !shortlistRequestLockedRef.current) {
          try {
            const list = await bookingsApi.getCandidates(bookingId);
            if (!sessionAlive()) return;
            publishCandidates(list);
          } catch (candidateError) {
            if (!sessionAlive()) return;
            if (!isTransientMatchingReadFailure(candidateError)) clearCandidateView();
            setError('Không thể tải danh sách kỹ thuật viên. Kiểm tra kết nối và thử lại.');
          }
        } else {
          clearCandidateView();
        }
        return;
      }
      // Linked flow: a tentative reselect CTA needs BOTH fresh owner-scoped GETs to agree.
      let nextOrder: ServiceOrderItem;
      try {
        nextOrder = await ordersApi.getOrder(nextBooking.serviceOrderId);
      } catch (orderError) {
        if (!sessionAlive()) return;
        const kind = classifyLinkedShortlistPostError(orderError);
        if (!isTransientMatchingReadFailure(orderError)) {
          setLinkedOrder(null);
          clearCandidateView();
        }
        setError(kind === 'denied'
          ? 'Không có quyền xem đơn sửa chữa liên kết. Hãy kiểm tra lại tài khoản và thử lại.'
          : 'Không thể tải đơn sửa chữa liên kết. Kiểm tra kết nối và thử lại.');
        return;
      }
      if (!sessionAlive()) return;
      if (nextOrder.id !== nextBooking.serviceOrderId || nextOrder.bookingId !== nextBooking.id) {
        setLinkedOrder(null);
        clearCandidateView();
        setError('Thông tin liên kết yêu cầu–đơn sửa chữa không khớp. Hãy làm mới hoặc liên hệ hỗ trợ.');
        return;
      }
      setLinkedOrder(nextOrder);

      // An exact authorized Booking <-> ServiceOrder crosswalk is decisive proof
      // that an initial shortlist produced the same Booking's real order.
      if (initialAttempt) {
        await clearInitialShortlistAttempt(
          AsyncStorage,
          currentUserId,
          bookingId,
        ).catch(() => undefined);
        if (!sessionAlive()) return;
        initialAttempt = null;
        setAttemptLocked(false);
        setSentConfirmed(true);
      }
      if (initialAttemptBlocked) {
        // Keep read-only order visibility, but fail closed for any new mutation.
        clearCandidateView();
        return;
      }

      // A persisted ambiguous-POST lock lifts only on positive new-invitation evidence.
      // P2: a corrupt/cross-scoped marker is LOCKED support state — never auto-cleared,
      // never overwritten, never treated as absent. Unreadable storage also locks.
      let markerAttempt: LinkedReselectAttempt | null = null;
      try {
        const markerRead = await readLinkedReselectAttempt(AsyncStorage, currentUserId, bookingId);
        if (!sessionAlive()) return;
        if (markerRead.state === 'invalid') {
          setAttemptLocked(true);
          clearCandidateView();
          return;
        }
        if (markerRead.state === 'valid') markerAttempt = markerRead.attempt;
      } catch {
        if (!sessionAlive()) return;
        setAttemptLocked(true);
        clearCandidateView();
        setError('Chưa thể kiểm tra trạng thái yêu cầu trước đó. Không gửi lại để tránh trùng; hãy thử lại hoặc liên hệ hỗ trợ.');
        return;
      }
      if (markerAttempt) {
        if (hasPositiveNewInvitations(markerAttempt.baselineInvitationIds, nextBooking.invitations)) {
          await clearLinkedReselectAttempt(AsyncStorage, currentUserId, bookingId).catch(() => undefined);
          if (!sessionAlive()) return;
          setAttemptLocked(false);
          setSentConfirmed(true);
        } else {
          setAttemptLocked(true);
          clearCandidateView();
          return;
        }
      }
      if (uncertainSendRef.current
        && hasPositiveNewInvitations(baselineInvitationIdsRef.current, nextBooking.invitations)) {
        uncertainSendRef.current = false;
        setUncertainSend(false);
        setSentConfirmed(true);
        clearCandidateView();
      }
      if (mayRequestLinkedReplacement(nextBooking, nextOrder, currentUserId)
        && !shortlistRequestLockedRef.current && !uncertainSendRef.current && !rejectedDefinitiveRef.current) {
        try {
          const list = await bookingsApi.getCandidates(bookingId);
          if (!sessionAlive()) return;
          publishCandidates(list);
        } catch (candidateError) {
          if (!sessionAlive()) return;
          // Denied/invalid reads fail closed; a transient refresh keeps last-good owner-bound data.
          if (!isTransientMatchingReadFailure(candidateError)) clearCandidateView();
          setError('Không thể tải danh sách kỹ thuật viên. Kiểm tra kết nối và thử lại.');
        }
      } else {
        clearCandidateView();
      }
    } catch (problem) {
      if (sessionAlive()) {
        const kind = classifyLinkedShortlistPostError(problem);
        const preserveLastGood = loadedContextKeyRef.current === sessionKey
          && isTransientMatchingReadFailure(problem);
        if (!preserveLastGood) {
          loadedContextKeyRef.current = '';
          setLoadedContextKey('');
          setBooking(null);
          setLinkedOrder(null);
          clearCandidateView();
        }
        setError(kind === 'denied'
          ? 'Phiên đăng nhập đã hết hạn hoặc không có quyền xem yêu cầu này. Hãy đăng nhập lại.'
          : 'Không thể tải trạng thái yêu cầu hoặc danh sách kỹ thuật viên. Kiểm tra kết nối và thử lại.');
      }
    } finally {
      if (sessionAlive()) {
        if (ownerBoundSnapshotValidated) {
          loadedContextKeyRef.current = sessionKey;
          setLoadedContextKey(sessionKey);
        }
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [bookingId, clearCandidateView, isAuthenticated, publishCandidates, role, sessionGeneration, userId]);

  useFocusEffect(useCallback(() => {
    let active = true;
    void Promise.resolve().then(() => { if (active) void loadCurrent(); });
    return () => { active = false; loadGeneration.current += 1; };
  }, [loadCurrent]));

  const linkedTentative = !!booking && !!linkedOrder && !!userId
    && mayRequestLinkedReplacement(booking, linkedOrder, userId);

  const choose = (candidateUserId: string) => {
    if (!booking || booking.id !== bookingId || sending || loading || refreshing || !!error
      || uncertainSend || sentConfirmed || attemptLocked || rejectedDefinitive
      || !candidates.some((candidate) => candidate.userId === candidateUserId)) return;
    const currentUserId = useAuthStore.getState().user?.id ?? null;
    // P1a: selection requires the CURRENT session to own the visible booking.
    if (!isVisibleBookingOwner(booking, currentUserId)) return;
    if (!canChooseTechnicians(booking)
      && !(linkedOrder && mayRequestLinkedReplacement(booking, linkedOrder, currentUserId))) return;
    Haptics.selectionAsync();
    setSelected((previous) => toggleCandidate(previous, candidateUserId));
  };

  const sendShortlist = async () => {
    const dispatchSession = useAuthStore.getState();
    const dispatchUserId = dispatchSession.user?.id ?? null;
    const dispatchSessionGeneration = dispatchSession.sessionGeneration;
    const isCurrentCustomerSession = () => {
      const currentSession = useAuthStore.getState();
      return currentSession.isAuthenticated
        && currentSession.user?.role === UserRole.CUSTOMER
        && currentSession.user?.id === dispatchUserId
        && currentSession.sessionGeneration === dispatchSessionGeneration;
    };
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (booking?.serviceOrderId && linkedOrder) {
      await sendLinkedReselect();
      return;
    }
    if (
      sendingRef.current ||
      shortlistRequestLockedRef.current ||
      loading ||
      refreshing ||
      !!error ||
      sentConfirmed ||
      uncertainSend ||
      attemptLocked ||
      !booking ||
      !canChooseTechnicians(booking)
    ) {
      return;
    }

    let orderedIds: ReturnType<typeof orderedCandidateIds>;
    try {
      orderedIds = orderedCandidateIds(selected);
      if (
        !orderedIds.every((id) =>
          candidates.some((candidate) => candidate.userId === id),
        )
      ) {
        throw new Error(
          'Kỹ thuật viên đã chọn không còn nằm trong danh sách hiện tại.',
        );
      }
    } catch (problem) {
      setError(
        problem instanceof Error
          ? problem.message
          : 'Vui lòng chọn 1 hoặc 2 kỹ thuật viên.',
      );
      return;
    }

    if (!dispatchSession.isAuthenticated
      || dispatchSession.user?.role !== UserRole.CUSTOMER
      || !dispatchUserId
      || !isVisibleBookingOwner(booking, dispatchUserId)) {
      setError(
        'Tài khoản đăng nhập đã thay đổi. Hãy làm mới và kiểm tra lại trước khi gửi.',
      );
      return;
    }
    const baselineInvitationIds = invitationIds(booking.invitations);

    shortlistRequestLockedRef.current = true;
    sendingRef.current = true;
    setSending(true);
    setError('');

    let markerSaved = false;
    let postDispatched = false;
    try {
      try {
        await saveInitialShortlistAttemptBeforePost(AsyncStorage, {
          customerId: dispatchUserId,
          bookingId,
          baselineInvitationIds,
          selectedTechnicianUserIds: orderedIds,
        });
        markerSaved = true;
        if (!isCurrentCustomerSession()) return;
      } catch (saveError) {
        if (!isCurrentCustomerSession()) return;
        // Persistence failed before dispatch, so there is provably no POST to
        // reconcile. Release only the in-memory request lock and let a later
        // explicit user retry persist a fresh marker first.
        shortlistRequestLockedRef.current = false;
        setAttemptLocked(false);
        setError(
          saveError instanceof Error
            ? saveError.message
            : 'Chưa thể lưu trạng thái lượt mời. Chưa gửi yêu cầu; hãy thử lại sau.',
        );
        return;
      }

      // Re-read the same owned Booking immediately before dispatch. If anything
      // relevant drifted, no POST occurs and this attempt marker is safe to clear.
      let freshBooking: BookingItem;
      try {
        freshBooking = await bookingsApi.getBooking(bookingId);
      } catch {
        if (!isCurrentCustomerSession()) return;
        setError(
          'Chưa thể xác nhận trạng thái yêu cầu mới nhất. Chưa gửi lời mời; hãy làm mới rồi thử lại.',
        );
        return;
      }
      if (!isCurrentCustomerSession()) return;

      const freshInvitationIds = invitationIds(freshBooking.invitations);
      const sortedFreshInvitationIds = [...freshInvitationIds].sort();
      const sortedBaselineInvitationIds = [...baselineInvitationIds].sort();
      const sameInvitations =
        sortedFreshInvitationIds.length === sortedBaselineInvitationIds.length &&
        sortedFreshInvitationIds.every(
          (id, index) => id === sortedBaselineInvitationIds[index],
        );
      if (
        freshBooking.id !== bookingId ||
        freshBooking.customerId !== dispatchUserId ||
        freshBooking.serviceOrderId ||
        !canChooseTechnicians(freshBooking) ||
        !sameInvitations
      ) {
        if (!isCurrentCustomerSession()) return;
        setBooking(freshBooking);
        setSelected([]);
        setError(
          'Trạng thái yêu cầu vừa thay đổi. Chưa gửi lời mời; hãy kiểm tra trạng thái mới nhất.',
        );
        return;
      }

      if (!isCurrentCustomerSession()) return;
      postDispatched = true;
      try {
        await bookingsApi.sendShortlist(bookingId, orderedIds);
      } catch (postError) {
        if (!isCurrentCustomerSession()) return;
        const kind = classifyInitialShortlistPostError(postError);

        if (kind === 'denied' || kind === 'definitive') {
          // Current Backend guards/transaction return these only with no
          // committed shortlist. Release this exact marker; never auto-resend.
          try {
            await clearInitialShortlistAttempt(
              AsyncStorage,
              dispatchUserId,
              bookingId,
            );
            if (!isCurrentCustomerSession()) return;
            markerSaved = false;
          } catch {
            if (!isCurrentCustomerSession()) return;
            setAttemptLocked(true);
          }
          if (!isCurrentCustomerSession()) return;
          shortlistRequestLockedRef.current = false;
          uncertainSendRef.current = false;
          setUncertainSend(false);
          setSelected([]);

          if (kind === 'denied') {
            setCandidates([]);
            setError(
              'Phiên đăng nhập không còn hợp lệ hoặc không có quyền gửi lời mời. Hãy đăng nhập lại.',
            );
            return;
          }

          try {
            const reconciled = await bookingsApi.getBooking(bookingId);
            if (!isCurrentCustomerSession()) return;
            if (
              reconciled.id === bookingId &&
              reconciled.customerId === dispatchUserId
            ) {
              setBooking(reconciled);
            }
          } catch {
            if (!isCurrentCustomerSession()) return;
            // The server rejection itself is decisive; GET is for fresh UX only.
          }
          if (!isCurrentCustomerSession()) return;
          const status = (
            postError as { response?: { status?: unknown } }
          )?.response?.status;
          setError(
            'Hệ thống đã từ chối lượt mời' +
              (typeof status === 'number' ? ' (mã ' + status + ')' : '') +
              '. Không tự gửi lại; hãy làm mới và chọn lại nếu trạng thái vẫn cho phép.',
          );
          return;
        }

        // Timeout/network/5xx is ambiguous: preserve the durable marker.
        uncertainSendRef.current = true;
        setUncertainSend(true);
        setAttemptLocked(true);
        setError(
          'Chưa xác định được kết quả gửi lời mời. Không gửi lại; đang giữ khóa an toàn và chỉ đối chiếu bằng trạng thái mới nhất.',
        );
        try {
          const reconciled = await bookingsApi.getBooking(bookingId);
          if (!isCurrentCustomerSession()) return;
          if (
            reconciled.id === bookingId &&
            reconciled.customerId === dispatchUserId
          ) {
            setBooking(reconciled);
            if (
              hasPositiveNewInvitations(
                baselineInvitationIds,
                reconciled.invitations,
              )
            ) {
              await clearInitialShortlistAttempt(
                AsyncStorage,
                dispatchUserId,
                bookingId,
              ).catch(() => undefined);
              if (!isCurrentCustomerSession()) return;
              markerSaved = false;
              uncertainSendRef.current = false;
              setUncertainSend(false);
              setAttemptLocked(false);
              setSentConfirmed(true);
              setSelected([]);
              setError('');
            }
          }
        } catch {
          if (!isCurrentCustomerSession()) return;
          // Keep the durable lock; absence of GET proof never means POST failed.
        }
        return;
      }

      // A 201 confirms invitation creation, not technician acceptance.
      if (!isCurrentCustomerSession()) return;
      await clearInitialShortlistAttempt(
        AsyncStorage,
        dispatchUserId,
        bookingId,
      ).catch(() => undefined);
      if (!isCurrentCustomerSession()) return;
      markerSaved = false;
      setAttemptLocked(false);
      setSentConfirmed(true);
      setSelected([]);
      try {
        const updated = await bookingsApi.getBooking(bookingId);
        if (!isCurrentCustomerSession()) return;
        if (
          updated.id === bookingId &&
          updated.customerId === dispatchUserId
        ) {
          setBooking(updated);
        }
      } catch {
        if (!isCurrentCustomerSession()) return;
        setError(
          'Lời mời đã được hệ thống xác nhận nhưng chưa tải được trạng thái mới. Hãy bấm làm mới.',
        );
      }
    } finally {
      if (markerSaved && !postDispatched && isCurrentCustomerSession()) {
        // Nothing was dispatched, so this exact marker is safe to remove.
        await clearInitialShortlistAttempt(
          AsyncStorage,
          dispatchUserId,
          bookingId,
        ).catch(() => undefined);
        if (isCurrentCustomerSession()) shortlistRequestLockedRef.current = false;
      }
      if (isCurrentCustomerSession()) {
        sendingRef.current = false;
        setSending(false);
      }
    }
  };

  const sendLinkedReselect = async () => {
    const dispatchSession = useAuthStore.getState();
    const currentUserId = dispatchSession.user?.id ?? null;
    const dispatchSessionGeneration = dispatchSession.sessionGeneration;
    const isCurrentCustomerSession = () => {
      const currentSession = useAuthStore.getState();
      return currentSession.isAuthenticated
        && currentSession.user?.role === UserRole.CUSTOMER
        && currentSession.user?.id === currentUserId
        && currentSession.sessionGeneration === dispatchSessionGeneration;
    };
    if (!dispatchSession.isAuthenticated || dispatchSession.user?.role !== UserRole.CUSTOMER) return;
    if (sendingRef.current || shortlistRequestLockedRef.current || loading || refreshing || !!error || sentConfirmed
      || uncertainSend || attemptLocked || rejectedDefinitive
      || !booking || !linkedOrder || !currentUserId) return;
    if (!mayRequestLinkedReplacement(booking, linkedOrder, currentUserId)) return;
    let orderedIds: ReturnType<typeof orderedCandidateIds>;
    try {
      orderedIds = orderedCandidateIds(selected);
      if (!orderedIds.every((id) => candidates.some((candidate) => candidate.userId === id))) {
        throw new Error('Kỹ thuật viên đã chọn không còn nằm trong danh sách hiện tại.');
      }
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Vui lòng chọn 1 hoặc 2 kỹ thuật viên.');
      return;
    }
    const snapshot: LinkedReselectPrePostSnapshot = {
      bookingId: booking.id,
      serviceOrderId: linkedOrder.id,
      customerId: currentUserId,
      bookingStatus: booking.status,
      orderStatus: linkedOrder.status,
      preferredStartAt: booking.preferredStartAt,
      preferredEndAt: booking.preferredEndAt,
      invitationIds: invitationIds(booking.invitations),
      selectedIds: [...selected],
      candidateUserIds: candidates.map((candidate) => candidate.userId),
    };
    // Sync refs first so a rapid second tap cannot slip past while the marker persists.
    shortlistRequestLockedRef.current = true;
    sendingRef.current = true;
    setSending(true);
    setError('');
    let posted = false;
    let markerSaved = false;
    try {
      try {
        await saveLinkedReselectAttemptBeforePost(AsyncStorage, {
          customerId: currentUserId, bookingId, baselineInvitationIds: snapshot.invitationIds,
        });
        markerSaved = true;
        if (!isCurrentCustomerSession()) return;
      } catch (saveError) {
        if (!isCurrentCustomerSession()) return;
        // P2: an existing (valid or corrupt) lock or unreadable storage — fail closed,
        // lock the UI, and never dispatch. A refresh re-evaluates from durable state.
        setAttemptLocked(true);
        setError(saveError instanceof Error ? saveError.message : 'Chưa thể lưu trạng thái yêu cầu. Không gửi lời mời để tránh trùng; hãy thử lại.');
        return;
      }
      baselineInvitationIdsRef.current = [...snapshot.invitationIds];
      // Re-fetch the SAME Booking + original Order before exactly one POST; no auto retries.
      let freshBooking: BookingItem;
      let freshOrder: ServiceOrderItem;
      try {
        freshBooking = await bookingsApi.getBooking(bookingId);
        if (!isCurrentCustomerSession()) return;
        if (freshBooking.id !== bookingId) throw new Error('stale');
        freshOrder = await ordersApi.getOrder(snapshot.serviceOrderId);
        if (!isCurrentCustomerSession()) return;
      } catch {
        if (!isCurrentCustomerSession()) return;
        setError('Chưa thể xác nhận trạng thái mới nhất. Không gửi lại để tránh trùng; hãy làm mới yêu cầu hoặc liên hệ hỗ trợ.');
        return;
      }
      // P1a, directly before dispatch: the session that built the snapshot must still
      // own it. Publish nothing on identity change; the render gate hides stale content.
      if (!isCurrentCustomerSession() || currentUserId !== snapshot.customerId) return;
      // P1b: dispatch-time end-of-window is rechecked inside (now defaults to dispatch time).
      if (!validateLinkedReselectPrePost(
        snapshot, freshBooking, freshOrder, currentUserId, [...selected],
        candidates.map((candidate) => candidate.userId),
      )) {
        if (isCurrentCustomerSession()) {
          setBooking(freshBooking);
          setLinkedOrder(freshOrder);
        }
        if (isCurrentCustomerSession()) {
          setSelected([]);
          setError('Trạng thái yêu cầu hoặc đơn sửa chữa vừa thay đổi. Đã làm mới; hãy kiểm tra lại trước khi gửi.');
        }
        return;
      }
      // Only the Backend locked POST decides eligibility, assignment, and concurrency.
      if (!isCurrentCustomerSession()) return;
      posted = true;
      try {
        await bookingsApi.sendShortlist(bookingId, orderedIds);
        if (!isCurrentCustomerSession()) return;
      } catch (postError) {
        if (!isCurrentCustomerSession()) return;
        const kind = classifyLinkedShortlistPostError(postError);
        if (kind === 'denied') {
          // Auth guards run before the Backend transaction, so nothing was written.
          await clearLinkedReselectAttempt(AsyncStorage, currentUserId, bookingId).catch(() => undefined);
          if (!isCurrentCustomerSession()) return;
          setCandidates([]);
          setSelected([]);
          setError('Phiên đăng nhập đã hết hạn hoặc không có quyền gửi yêu cầu. Hãy đăng nhập lại.');
          return;
        }
        if (kind === 'definitive') {
          // The server answered: reconcile with a fresh owner GET, drop the stale draft.
          setSelected([]);
          rejectedDefinitiveRef.current = true;
          setRejectedDefinitive(true);
          try {
            const reconciled = await bookingsApi.getBooking(bookingId);
            if (!isCurrentCustomerSession()) return;
            if (reconciled.id === bookingId && reconciled.customerId === currentUserId) {
              setBooking(reconciled);
              await clearLinkedReselectAttempt(AsyncStorage, currentUserId, bookingId).catch(() => undefined);
              if (!isCurrentCustomerSession()) return;
            }
          } catch {
            if (!isCurrentCustomerSession()) return;
            /* Keep the lock; the marker stays until a successful adjudicating GET. */
          }
          if (!isCurrentCustomerSession()) return;
          const status = (postError as { response?: { status?: unknown } })?.response?.status;
          setError(`Hệ thống đã kiểm tra và từ chối yêu cầu chọn lại theo trạng thái mới nhất${typeof status === 'number' ? ` (mã ${status})` : ''}. Không gửi lại; hãy làm mới để xem trạng thái hiện tại hoặc liên hệ hỗ trợ.`);
          return;
        }
        // Ambiguous: the POST may have committed. Keep the lock; only proof reconciles.
        uncertainSendRef.current = true;
        setUncertainSend(true);
        setError('Chưa xác định được kết quả gửi yêu cầu chọn lại. Không gửi lại để tránh trùng; hãy làm mới yêu cầu hoặc liên hệ hỗ trợ.');
        try {
          const reconciled = await bookingsApi.getBooking(bookingId);
          if (!isCurrentCustomerSession()) return;
          if (reconciled.id === bookingId && reconciled.customerId === currentUserId) {
            setBooking(reconciled);
            if (hasPositiveNewInvitations(snapshot.invitationIds, reconciled.invitations)) {
              await clearLinkedReselectAttempt(AsyncStorage, currentUserId, bookingId).catch(() => undefined);
              if (!isCurrentCustomerSession()) return;
              uncertainSendRef.current = false;
              setUncertainSend(false);
              setSentConfirmed(true);
              setError('');
            }
          }
        } catch {
          if (!isCurrentCustomerSession()) return;
          /* Keep the ambiguous POST locked; no blind retry. */
        }
        return;
      }
      // Positive 201 confirms a new round only — never a technician acceptance.
      if (!isCurrentCustomerSession()) return;
      await clearLinkedReselectAttempt(AsyncStorage, currentUserId, bookingId).catch(() => undefined);
      if (!isCurrentCustomerSession()) return;
      setSentConfirmed(true);
      setSelected([]);
      try {
        const updated = await bookingsApi.getBooking(bookingId);
        if (!isCurrentCustomerSession()) return;
        if (updated.id === bookingId) setBooking(updated);
      } catch {
        if (!isCurrentCustomerSession()) return;
        setError('Yêu cầu chọn lại đã được gửi nhưng chưa tải được trạng thái mới. Hãy bấm làm mới.');
      }
    } finally {
      if (markerSaved && !posted && isCurrentCustomerSession()) {
        // P2: only a marker saved by THIS attempt may be released here, and only
        // because nothing was dispatched. A failed clear keeps the safe direction.
        await clearLinkedReselectAttempt(AsyncStorage, currentUserId, bookingId).catch(() => undefined);
        if (isCurrentCustomerSession()) shortlistRequestLockedRef.current = false;
      }
      if (isCurrentCustomerSession()) {
        sendingRef.current = false;
        setSending(false);
      }
    }
  };

  const refresh = () => { if (!sending) void loadCurrent(); };
  // P1a hard render guard: private Booking content renders ONLY for the currently
  // signed-in owner, so an A->B switch can never flash A's card/candidates to B —
  // not even for one frame before the refired load clears state.
  const currentContextKey = matchingSessionKey(bookingId, userId, role, sessionGeneration);
  const ownsVisibleBooking = booking?.id === bookingId
    && loadedContextKey === currentContextKey
    && isVisibleBookingOwner(booking, userId);
  const waiting = ownsVisibleBooking && (booking?.status === 'MATCHING' || booking?.status === 'MATCHED'
    || (!!booking?.serviceOrderId && !linkedTentative) || sentConfirmed || uncertainSend
    || attemptLocked || rejectedDefinitive);
  const candidateFlowAvailable = ownsVisibleBooking && !!booking
    && (canChooseTechnicians(booking) || linkedTentative) && !waiting;
  const pickerActionsEnabled = candidateFlowAvailable && !loading && !refreshing && !error;
  const pickerVisible = candidateFlowAvailable;
  const linkedMode = !!booking?.serviceOrderId;
  const candidateState = candidateAvailabilityState(candidates.length);
  const verifiedOrderId = verifiedLinkedOrderId(booking, linkedOrder, userId);
  const detailCandidate = detailTarget
    && isAuthenticated
    && role === UserRole.CUSTOMER
    && ownsVisibleBooking
    && !waiting
    && detailTarget.bookingId === bookingId
    && detailTarget.bookingId === booking?.id
    && detailTarget.ownerId === userId
    ? candidates.find((candidate) => candidate.userId === detailTarget.candidateUserId) ?? null
    : null;
  const detailCandidateUserId = detailCandidate?.userId ?? null;

  useEffect(() => {
    if (detailCandidateUserId) detailSheetRef.current?.present();
    else detailSheetRef.current?.dismiss();
  }, [detailCandidateUserId]);

  const openDetails = (candidate: TechnicianCandidate) => {
    if (!userId || !ownsVisibleBooking || waiting || booking?.id !== bookingId
      || !candidates.some((item) => item.userId === candidate.userId)) return;
    setDetailTarget({ bookingId, ownerId: userId, candidateUserId: candidate.userId });
  };

  return (
    <SafeAreaView style={[styles.page, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Quay lại"
          hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Chọn kỹ thuật viên</Text>
        {loadedContextKey === currentContextKey && (
          <Text style={[styles.note, { color: colors.textSecondary }]}>Mã tham chiếu: {bookingId.slice(0, 8)}</Text>
        )}
        {!isAuthenticated || role !== UserRole.CUSTOMER ? (
          <Text style={{ color: colors.error }}>Hãy đăng nhập bằng tài khoản khách hàng để xem yêu cầu này.</Text>
        ) : (
          <>
            {loading && !refreshing && candidates.length === 0 && !waiting && (
              <MatchingTechnicianSkeleton />
            )}
            {refreshing && ownsVisibleBooking && (
              <Text testID="matching-refresh-status" style={[styles.note, { color: colors.textSecondary }]}>
                Đang cập nhật trạng thái…
              </Text>
            )}
            {!!error && <Text style={[styles.note, { color: colors.error }]}>{error}</Text>}
            {!!booking && ownsVisibleBooking && (
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.heading, { color: colors.text }]}>{booking.serviceName || 'Yêu cầu dịch vụ'}</Text>
                <Text style={[styles.note, { color: colors.textSecondary }]}>{describeBooking(booking)}</Text>
                <Text style={[styles.note, { color: colors.textSecondary }]}>Trạng thái: {bookingStatusLabel(booking.status)}</Text>
                {!!booking.serviceOrderId && (
                  <Text selectable style={{ color: colors.success }}>
                    Mã tham chiếu đơn: {booking.serviceOrderId.slice(0, 8)}
                  </Text>
                )}
              </View>
            )}
            {!!booking &&
              ownsVisibleBooking &&
              Array.isArray(booking.invitations) &&
              booking.invitations.length > 0 && (
                <View
                  style={[
                    styles.card,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                  ]}
                >
                  <Text style={[styles.heading, { color: colors.text }]}>
                    Trạng thái lời mời
                  </Text>
                  {[...booking.invitations]
                    .sort((a, b) => a.priorityOrder - b.priorityOrder)
                    .map((invitation) => {
                      const status = invitation.status;
                      const statusText =
                        status === 'PENDING'
                          ? 'Đang chờ phản hồi'
                          : status === 'STANDBY'
                            ? 'Dự phòng · chưa được mời'
                            : status === 'ACCEPTED'
                              ? 'Đã nhận'
                              : status === 'DECLINED'
                                ? 'Đã từ chối'
                                : status === 'EXPIRED'
                                  ? 'Đã hết hạn'
                                  : 'Đã kết thúc';
                      const expiresAt =
                        status === 'PENDING' && invitation.expiresAt
                          ? Date.parse(invitation.expiresAt)
                          : Number.NaN;
                      return (
                        <View key={invitation.id} style={{ gap: 2 }}>
                          <Text style={{ color: colors.text }}>
                            Ưu tiên {invitation.priorityOrder}: {statusText}
                          </Text>
                          {Number.isFinite(expiresAt) && (
                            <Text style={[styles.note, { color: colors.textSecondary }]}>
                              Hết hạn dự kiến:{' '}
                              {new Date(expiresAt).toLocaleString('vi-VN')}
                            </Text>
                          )}
                        </View>
                      );
                    })}
                </View>
              )}
            {!!booking && loadedContextKey === currentContextKey && !ownsVisibleBooking && (
              <Text style={[styles.note, { color: colors.textSecondary }]}>Tài khoản hiện tại không sở hữu yêu cầu này. Hãy đăng nhập đúng tài khoản khách hàng.</Text>
            )}
            {pickerVisible && (
              <>
                <Text style={[styles.heading, { color: colors.text }]}>
                  {linkedMode
                    ? 'Yêu cầu chọn 1 hoặc 2 kỹ thuật viên mới (hệ thống sẽ kiểm tra) (' + selected.length + '/2)'
                    : 'Chọn 1 hoặc 2 người theo thứ tự ưu tiên (' + selected.length + '/2)'}
                </Text>
                <Text style={[styles.note, { color: colors.textSecondary }]}>
                  {linkedMode
                    ? 'Thử yêu cầu chọn kỹ thuật viên mới; hệ thống kiểm tra trước khi gửi. Chỉ hệ thống mới quyết định lời mời có được tạo hay không.'
                    : 'Bạn có thể chọn 1 người để mời ngay, hoặc chọn thêm người thứ hai làm dự phòng. Thứ tự chọn là thứ tự ưu tiên.'}
                </Text>
                {!loading && !refreshing && !error && candidateState === 'none' && (
                  <View style={styles.card}>
                    <Text style={{ color: colors.textSecondary }}>
                      Hiện chưa có kỹ thuật viên phù hợp với dịch vụ, khu vực và khung giờ này.
                      Hãy làm mới sau một lúc hoặc quay lại xem lịch hẹn.
                    </Text>
                    <Text style={[styles.note, { color: colors.textSecondary }]}>
                      Ứng dụng không tự đổi lịch, hủy hay tạo yêu cầu mới. Việc đổi lịch chỉ thực
                      hiện ở trạng thái được cho phép và bằng thao tác riêng của khách hàng.
                    </Text>
                  </View>
                )}
                {!loading && !refreshing && !error && candidateState === 'one' && (
                  <View style={styles.card}>
                    <Text style={{ color: colors.textSecondary }}>
                      Hiện có 1 kỹ thuật viên phù hợp. Bạn có thể chọn người này và gửi lời mời ngay.
                    </Text>
                    <Text style={[styles.note, { color: colors.textSecondary }]}>
                      Nếu muốn có thêm lựa chọn, hãy làm mới sau một lúc; không cần tạo yêu cầu khác.
                    </Text>
                  </View>
                )}
                {candidates.map((candidate) => {
                  const priority = selected.indexOf(candidate.userId) + 1;
                  return (
                    <MatchingTechnicianCard
                      key={candidate.userId}
                      candidate={candidate}
                      priority={priority}
                      selectionDisabled={!pickerActionsEnabled || sending || (selected.length === 2 && priority === 0)}
                      onOpenDetails={() => openDetails(candidate)}
                      onToggleSelection={() => choose(candidate.userId)}
                      entranceIndex={candidates.indexOf(candidate)}
                    />
                  );
                })}
                <TouchableOpacity accessibilityRole="button" onPress={sendShortlist} disabled={!pickerActionsEnabled || selected.length < 1 || sending}
                  style={[styles.action, { backgroundColor: pickerActionsEnabled && selected.length >= 1 ? colors.primary : colors.border }]}
                  accessibilityState={{ disabled: !pickerActionsEnabled || selected.length < 1 || sending }}>
                  <Text style={styles.actionText}>
                    {sending ? 'Đang gửi...' : linkedMode ? 'Gửi yêu cầu chọn ' + selected.length + ' kỹ thuật viên mới' : 'Xác nhận mời ' + selected.length + ' kỹ thuật viên'}
                  </Text>
                </TouchableOpacity>
              </>
            )}
            {waiting && ownsVisibleBooking && (
              <>
                <Text style={[styles.note, { color: colors.textSecondary }]}>
                  Chỉ trạng thái trên hệ thống mới xác nhận kỹ thuật viên nhận đơn. Không cần gửi lại danh sách mời.
                  {' '}Rời màn hình không hủy lời mời.
                </Text>
                <TouchableOpacity
                  testID="matching-waiting-primary"
                  accessibilityRole="button"
                  onPress={() => verifiedOrderId
                    ? navigation.navigate('CustomerOrderDetail', { serviceOrderId: verifiedOrderId })
                    : navigation.navigate('CustomerMain')}
                  style={[styles.action, { backgroundColor: colors.primary }]}
                >
                  <Text style={styles.actionText}>{verifiedOrderId ? 'Xem đơn sửa chữa' : 'Về trang chủ'}</Text>
                </TouchableOpacity>
                {verifiedOrderId && (
                  <TouchableOpacity
                    accessibilityRole="button"
                    onPress={() => navigation.navigate('CustomerMain')}
                    style={[styles.secondaryAction, { borderColor: colors.border }]}
                  >
                    <Text style={[styles.secondaryActionText, { color: colors.text }]}>Về trang chủ</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  testID="matching-waiting-refresh"
                  accessibilityRole="button"
                  onPress={refresh}
                  disabled={loading || refreshing || sending}
                  style={[styles.secondaryAction, { borderColor: colors.border }]}
                >
                  <Text style={[styles.secondaryActionText, { color: colors.text }]}>
                    {loading || refreshing ? 'Đang cập nhật…' : 'Làm mới trạng thái'}
                  </Text>
                </TouchableOpacity>
              </>
            )}
            {ownsVisibleBooking && uncertainSend && <Text style={[styles.note, { color: colors.error }]}>Chưa thể xác nhận kết quả gửi. Không gửi lại khi chưa kiểm tra yêu cầu trên hệ thống.</Text>}
            {ownsVisibleBooking && attemptLocked && (
              <Text style={[styles.note, { color: colors.error }]}>
                Đã có một lượt mời đang chờ xác minh. Không gửi lại để tránh trùng; hãy làm mới
                yêu cầu. Chỉ bằng chứng từ hệ thống mới được gỡ khóa.
              </Text>
            )}
            {ownsVisibleBooking && rejectedDefinitive && <Text style={[styles.note, { color: colors.textSecondary }]}>Hệ thống đã từ chối yêu cầu chọn lại theo trạng thái mới nhất. Hãy làm mới để xem trạng thái hiện tại.</Text>}
            {!waiting && (
              <TouchableOpacity accessibilityRole="button" onPress={refresh} disabled={loading || refreshing || sending}
                style={[styles.secondaryAction, { borderColor: colors.border }]}
                accessibilityState={{ disabled: loading || refreshing || sending }}>
                <Text style={[styles.secondaryActionText, { color: colors.text }]}>
                  {loading || refreshing ? 'Đang cập nhật…' : 'Làm mới trạng thái'}
                </Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </ScrollView>
      <MatchingTechnicianDetailSheet
        modalRef={detailSheetRef}
        candidate={detailCandidate}
        priority={detailCandidate ? selected.indexOf(detailCandidate.userId) + 1 : 0}
        selectionDisabled={!pickerActionsEnabled || sending || (!!detailCandidate && selected.length === 2 && !selected.includes(detailCandidate.userId))}
        onToggleSelection={() => { if (detailCandidate) choose(detailCandidate.userId); }}
        onClose={() => {
          setDetailTarget(null);
          detailSheetRef.current?.dismiss();
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { padding: 18, paddingBottom: 42, gap: 12 },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  title: { fontSize: 23, fontWeight: '700', marginBottom: 6 },
  heading: { fontSize: 16, fontWeight: '700' },
  note: { fontSize: 13, lineHeight: 21 },
  card: { padding: 15, borderWidth: 1, borderRadius: 12, gap: 7 },
  action: { padding: 15, borderRadius: 12, alignItems: 'center' },
  secondaryAction: { minHeight: 44, paddingHorizontal: 15, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  secondaryActionText: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  actionText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
