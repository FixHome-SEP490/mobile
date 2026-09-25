import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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
function describeBooking(booking: BookingItem): string {
  if (booking.serviceOrderId && booking.status === 'CLOSED') return 'Lượt mời trước đã kết thúc. Thử yêu cầu chọn thợ mới; hệ thống kiểm tra trước khi gửi.';
  if (booking.serviceOrderId && booking.status === 'MATCHING') return 'Đang tìm thợ thay thế; đơn vẫn chờ kỹ thuật viên phản hồi lời mời còn lại. Làm mới để cập nhật, không cần gửi lại.';
  if (booking.serviceOrderId && booking.status === 'MATCHED') return 'Kỹ thuật viên đã nhận đơn. Đơn dịch vụ đã được tạo trên hệ thống.';
  if (booking.status === 'MATCHED') return 'Đã có kỹ thuật viên nhận lời mời. Đang kiểm tra liên kết đơn dịch vụ.';
  if (booking.status === 'MATCHING') {
    const pending = (booking.invitations ?? []).find((invitation) => invitation.status === 'PENDING');
    return pending
      ? `Đang chờ phản hồi từ kỹ thuật viên ưu tiên số ${pending.priorityOrder}. Kỹ thuật viên dự phòng chỉ được mời khi người trước từ chối hoặc hết hạn.`
      : 'Đang xử lý lời mời kỹ thuật viên. Hãy làm mới để xem trạng thái mới nhất.';
  }
  if (booking.status === 'CANCELLED') return 'Yêu cầu đặt thợ này đã bị hủy.';
  if (booking.status === 'CLOSED') return 'Vòng tìm thợ trước đã kết thúc. Kiểm tra lịch hẹn trước khi chọn lại.';
  return 'Yêu cầu đã được ghi nhận. Vui lòng chọn đúng hai kỹ thuật viên theo thứ tự ưu tiên.';
}

export default function CustomerMatchingScreen() {
  const { colors } = useAppTheme();
  const route = useRoute<MatchingRoute>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const bookingId = route.params.bookingId;
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const role = useAuthStore((state) => state.user?.role);
  const userId = useAuthStore((state) => state.user?.id);
  const [booking, setBooking] = useState<BookingItem | null>(null);
  const [linkedOrder, setLinkedOrder] = useState<ServiceOrderItem | null>(null);
  const [candidates, setCandidates] = useState<TechnicianCandidate[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sentConfirmed, setSentConfirmed] = useState(false);
  const [uncertainSend, setUncertainSend] = useState(false);
  const [attemptLocked, setAttemptLocked] = useState(false);
  const [rejectedDefinitive, setRejectedDefinitive] = useState(false);
  const sendingRef = useRef(false);
  // A shortlist POST is never repeated because a timeout may follow a successful write.
  const shortlistRequestLockedRef = useRef(false);
  const uncertainSendRef = useRef(false);
  const rejectedDefinitiveRef = useRef(false);
  const baselineInvitationIdsRef = useRef<string[]>([]);
  const sessionKeyRef = useRef('');
  const loadGeneration = useRef(0);

  const loadCurrent = useCallback(async () => {
    // P1a: hook values drive effect identity (an A->B switch refires the load); live
    // store values are re-verified after every await because they may change mid-flight.
    const hookUserId = userId ?? null;
    const hookRole = role ?? null;
    const liveUserId = useAuthStore.getState().user?.id ?? null;
    const liveRole = useAuthStore.getState().user?.role ?? null;
    if (liveUserId !== hookUserId || liveRole !== hookRole) return;
    const currentUserId = liveUserId;
    const currentRole = liveRole;
    // Revisit/focus/auth/account/booking change invalidates stale GETs, selection and locks.
    const sessionKey = `${bookingId}::${currentUserId ?? ''}::${currentRole ?? ''}`;
    if (sessionKeyRef.current !== sessionKey) {
      sessionKeyRef.current = sessionKey;
      shortlistRequestLockedRef.current = false;
      uncertainSendRef.current = false;
      rejectedDefinitiveRef.current = false;
      baselineInvitationIdsRef.current = [];
      setUncertainSend(false);
      setSentConfirmed(false);
      setAttemptLocked(false);
      setRejectedDefinitive(false);
    }
    if (!isAuthenticated || role !== UserRole.CUSTOMER || !currentUserId) {
      // Logged out / wrong role: never keep the previous account's private state visible.
      shortlistRequestLockedRef.current = false;
      uncertainSendRef.current = false;
      rejectedDefinitiveRef.current = false;
      baselineInvitationIdsRef.current = [];
      setBooking(null);
      setLinkedOrder(null);
      setCandidates([]);
      setSelected([]);
      setUncertainSend(false);
      setSentConfirmed(false);
      setAttemptLocked(false);
      setRejectedDefinitive(false);
      setError('');
      setLoading(false);
      return;
    }
    const generation = ++loadGeneration.current;
    // Every publish below requires the same session that started the load.
    const sessionAlive = () =>
      loadGeneration.current === generation
      && useAuthStore.getState().user?.id === currentUserId
      && useAuthStore.getState().user?.role === currentRole;
    setLoading(true);
    setError('');
    setLinkedOrder(null);
    setAttemptLocked(false);
    try {
      const nextBooking = await bookingsApi.getBooking(bookingId);
      if (!sessionAlive()) return;
      if (nextBooking.id !== bookingId) throw new Error('Mã Booking trả về không khớp yêu cầu.');
      // Owner binding including the unlinked flow; a missing customerId fails closed.
      if (nextBooking.customerId !== currentUserId) {
        setBooking(null);
        setLinkedOrder(null);
        setCandidates([]);
        setSelected([]);
        setUncertainSend(false);
        setSentConfirmed(false);
        setAttemptLocked(false);
        setRejectedDefinitive(false);
        setError('Yêu cầu này không thuộc tài khoản đang đăng nhập. Hãy kiểm tra lại tài khoản.');
        return;
      }
      setBooking(nextBooking);
      setCandidates([]);
      setSelected([]);

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
          setCandidates([]);
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
        }
        if (canChooseTechnicians(nextBooking) && !shortlistRequestLockedRef.current) {
          const list = await bookingsApi.getCandidates(bookingId);
          if (!sessionAlive()) return;
          setCandidates(list.filter((candidate) => candidate.isAvailable));
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
        setLinkedOrder(null);
        setCandidates([]);
        setError(kind === 'denied'
          ? 'Không có quyền xem đơn dịch vụ liên kết. Hãy kiểm tra lại tài khoản và thử lại.'
          : 'Không thể tải đơn dịch vụ liên kết. Kiểm tra kết nối và thử lại.');
        return;
      }
      if (!sessionAlive()) return;
      if (nextOrder.id !== nextBooking.serviceOrderId || nextOrder.bookingId !== nextBooking.id) {
        setLinkedOrder(null);
        setCandidates([]);
        setError('Thông tin liên kết Booking–đơn dịch vụ không khớp. Hãy làm mới hoặc liên hệ hỗ trợ.');
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
        setCandidates([]);
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
          setCandidates([]);
          return;
        }
        if (markerRead.state === 'valid') markerAttempt = markerRead.attempt;
      } catch {
        if (!sessionAlive()) return;
        setAttemptLocked(true);
        setCandidates([]);
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
          setCandidates([]);
          return;
        }
      }
      if (uncertainSendRef.current
        && hasPositiveNewInvitations(baselineInvitationIdsRef.current, nextBooking.invitations)) {
        uncertainSendRef.current = false;
        setUncertainSend(false);
        setSentConfirmed(true);
      }
      if (mayRequestLinkedReplacement(nextBooking, nextOrder, currentUserId)
        && !shortlistRequestLockedRef.current && !uncertainSendRef.current && !rejectedDefinitiveRef.current) {
        try {
          const list = await bookingsApi.getCandidates(bookingId);
          if (!sessionAlive()) return;
          setCandidates(list.filter((candidate) => candidate.isAvailable));
        } catch {
          if (!sessionAlive()) return;
          // Invalid/unauthorized candidate reads must not leak technician details.
          setCandidates([]);
          setError('Không thể tải danh sách thợ. Kiểm tra kết nối và thử lại.');
        }
      }
    } catch (problem) {
      if (sessionAlive()) {
        // Error/denied reads clear private data; A's content must never linger for B.
        setBooking(null);
        setLinkedOrder(null);
        setCandidates([]);
        setSelected([]);
        const kind = classifyLinkedShortlistPostError(problem);
        setError(kind === 'denied'
          ? 'Phiên đăng nhập đã hết hạn hoặc không có quyền xem yêu cầu này. Hãy đăng nhập lại.'
          : 'Không thể tải trạng thái Booking hoặc danh sách thợ. Kiểm tra kết nối và thử lại.');
      }
    } finally {
      if (sessionAlive()) setLoading(false);
    }
  }, [bookingId, isAuthenticated, role, userId]);

  useFocusEffect(useCallback(() => {
    let active = true;
    void Promise.resolve().then(() => { if (active) void loadCurrent(); });
    return () => { active = false; loadGeneration.current += 1; };
  }, [loadCurrent]));

  const linkedTentative = !!booking && !!linkedOrder && !!userId
    && mayRequestLinkedReplacement(booking, linkedOrder, userId);

  const choose = (candidateUserId: string) => {
    if (!booking || sending || loading || uncertainSend || sentConfirmed || attemptLocked || rejectedDefinitive) return;
    const currentUserId = useAuthStore.getState().user?.id ?? null;
    // P1a: selection requires the CURRENT session to own the visible booking.
    if (!isVisibleBookingOwner(booking, currentUserId)) return;
    if (!canChooseTechnicians(booking)
      && !(linkedOrder && mayRequestLinkedReplacement(booking, linkedOrder, currentUserId))) return;
    setSelected((previous) => toggleCandidate(previous, candidateUserId));
  };

  const sendShortlist = async () => {
    if (booking?.serviceOrderId && linkedOrder) {
      await sendLinkedReselect();
      return;
    }
    if (
      sendingRef.current ||
      shortlistRequestLockedRef.current ||
      loading ||
      sentConfirmed ||
      uncertainSend ||
      attemptLocked ||
      !booking ||
      !canChooseTechnicians(booking)
    ) {
      return;
    }

    let orderedIds: readonly [string, string];
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
          : 'Vui lòng chọn đủ hai kỹ thuật viên.',
      );
      return;
    }

    const dispatchUserId = useAuthStore.getState().user?.id ?? null;
    if (!dispatchUserId || !isVisibleBookingOwner(booking, dispatchUserId)) {
      setError(
        'Tài khoản đăng nhập đã thay đổi. Hãy làm mới và kiểm tra lại trước khi gửi.',
      );
      return;
    }
    const stillOwner = () =>
      useAuthStore.getState().user?.id === dispatchUserId;
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
      } catch (saveError) {
        // Persistence failed before dispatch, so there is provably no POST to
        // reconcile. Release only the in-memory request lock and let a later
        // explicit user retry persist a fresh marker first.
        shortlistRequestLockedRef.current = false;
        setAttemptLocked(false);
        setError(
          saveError instanceof Error
            ? saveError.message
            : 'Chưa thể lưu trạng thái lượt mời. Chưa gửi POST; hãy thử lại sau.',
        );
        return;
      }

      // Re-read the same owned Booking immediately before dispatch. If anything
      // relevant drifted, no POST occurs and this attempt marker is safe to clear.
      let freshBooking: BookingItem;
      try {
        freshBooking = await bookingsApi.getBooking(bookingId);
      } catch {
        setError(
          'Chưa thể xác nhận trạng thái Booking mới nhất. Chưa gửi lời mời; hãy làm mới rồi thử lại.',
        );
        return;
      }
      if (!stillOwner()) {
        setSelected([]);
        setError(
          'Tài khoản đăng nhập đã thay đổi. Chưa gửi lời mời; hãy kiểm tra lại tài khoản.',
        );
        return;
      }

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
        setBooking(freshBooking);
        setSelected([]);
        setError(
          'Trạng thái Booking vừa thay đổi. Chưa gửi lời mời; hãy kiểm tra trạng thái mới nhất.',
        );
        return;
      }

      postDispatched = true;
      try {
        await bookingsApi.sendShortlist(bookingId, orderedIds);
      } catch (postError) {
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
            markerSaved = false;
          } catch {
            setAttemptLocked(true);
          }
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
            if (
              reconciled.id === bookingId &&
              stillOwner() &&
              reconciled.customerId === dispatchUserId
            ) {
              setBooking(reconciled);
            }
          } catch {
            // The server rejection itself is decisive; GET is for fresh UX only.
          }
          const status = (
            postError as { response?: { status?: unknown } }
          )?.response?.status;
          setError(
            'Backend đã từ chối lượt mời' +
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
          'Chưa xác định được kết quả gửi lời mời. Không gửi lại; đang giữ khóa an toàn và chỉ đối chiếu bằng GET.',
        );
        try {
          const reconciled = await bookingsApi.getBooking(bookingId);
          if (
            reconciled.id === bookingId &&
            stillOwner() &&
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
          // Keep the durable lock; absence of GET proof never means POST failed.
        }
        return;
      }

      // A 201 confirms invitation creation, not technician acceptance.
      await clearInitialShortlistAttempt(
        AsyncStorage,
        dispatchUserId,
        bookingId,
      ).catch(() => undefined);
      markerSaved = false;
      setAttemptLocked(false);
      setSentConfirmed(true);
      setSelected([]);
      try {
        const updated = await bookingsApi.getBooking(bookingId);
        if (
          updated.id === bookingId &&
          stillOwner() &&
          updated.customerId === dispatchUserId
        ) {
          setBooking(updated);
        }
      } catch {
        setError(
          'Lời mời đã được Backend xác nhận nhưng chưa tải được trạng thái mới. Hãy bấm làm mới.',
        );
      }
    } finally {
      if (markerSaved && !postDispatched) {
        // Nothing was dispatched, so this exact marker is safe to remove.
        await clearInitialShortlistAttempt(
          AsyncStorage,
          dispatchUserId,
          bookingId,
        ).catch(() => undefined);
        shortlistRequestLockedRef.current = false;
      }
      sendingRef.current = false;
      setSending(false);
    }
  };

  const sendLinkedReselect = async () => {
    const currentUserId = useAuthStore.getState().user?.id ?? null;
    if (sendingRef.current || shortlistRequestLockedRef.current || loading || sentConfirmed
      || uncertainSend || attemptLocked || rejectedDefinitive
      || !booking || !linkedOrder || !currentUserId) return;
    if (!mayRequestLinkedReplacement(booking, linkedOrder, currentUserId)) return;
    let orderedIds: readonly [string, string];
    try {
      orderedIds = orderedCandidateIds(selected);
      if (!orderedIds.every((id) => candidates.some((candidate) => candidate.userId === id))) {
        throw new Error('Kỹ thuật viên đã chọn không còn nằm trong danh sách hiện tại.');
      }
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Vui lòng chọn đủ hai kỹ thuật viên.');
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
      } catch (saveError) {
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
        if (freshBooking.id !== bookingId) throw new Error('stale');
        freshOrder = await ordersApi.getOrder(snapshot.serviceOrderId);
      } catch {
        setError('Chưa thể xác nhận trạng thái mới nhất. Không gửi lại để tránh trùng; hãy làm mới Booking hoặc liên hệ hỗ trợ.');
        return;
      }
      // P1a, directly before dispatch: the session that built the snapshot must still
      // own it. Publish nothing on identity change; the render gate hides stale content.
      const dispatchUserId = useAuthStore.getState().user?.id ?? null;
      const stillOwner = () => useAuthStore.getState().user?.id === dispatchUserId;
      if (dispatchUserId !== currentUserId || dispatchUserId !== snapshot.customerId) {
        setSelected([]);
        setError('Tài khoản đăng nhập đã thay đổi. Đã làm mới; hãy kiểm tra lại trước khi gửi.');
        return;
      }
      // P1b: dispatch-time end-of-window is rechecked inside (now defaults to dispatch time).
      if (!validateLinkedReselectPrePost(
        snapshot, freshBooking, freshOrder, currentUserId, [...selected],
        candidates.map((candidate) => candidate.userId),
      )) {
        if (stillOwner()) {
          setBooking(freshBooking);
          setLinkedOrder(freshOrder);
        }
        setSelected([]);
        setError('Trạng thái Booking hoặc đơn dịch vụ vừa thay đổi. Đã làm mới; hãy kiểm tra lại trước khi gửi.');
        return;
      }
      // Only the Backend locked POST decides eligibility, assignment, and concurrency.
      try {
        await bookingsApi.sendShortlist(bookingId, orderedIds);
        posted = true;
      } catch (postError) {
        posted = true;
        const kind = classifyLinkedShortlistPostError(postError);
        if (kind === 'denied') {
          // Auth guards run before the Backend transaction, so nothing was written.
          await clearLinkedReselectAttempt(AsyncStorage, currentUserId, bookingId).catch(() => undefined);
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
            if (reconciled.id === bookingId) {
              if (stillOwner()) setBooking(reconciled);
              await clearLinkedReselectAttempt(AsyncStorage, currentUserId, bookingId).catch(() => undefined);
            }
          } catch { /* Keep the lock; the marker stays until a successful adjudicating GET. */ }
          const status = (postError as { response?: { status?: unknown } })?.response?.status;
          setError(`Hệ thống đã kiểm tra và từ chối yêu cầu chọn lại theo trạng thái mới nhất${typeof status === 'number' ? ` (mã ${status})` : ''}. Không gửi lại; hãy làm mới để xem trạng thái hiện tại hoặc liên hệ hỗ trợ.`);
          return;
        }
        // Ambiguous: the POST may have committed. Keep the lock; only proof reconciles.
        uncertainSendRef.current = true;
        setUncertainSend(true);
        setError('Chưa xác định được kết quả gửi yêu cầu chọn lại. Không gửi lại để tránh trùng; hãy làm mới Booking hoặc liên hệ hỗ trợ.');
        try {
          const reconciled = await bookingsApi.getBooking(bookingId);
          if (reconciled.id === bookingId && stillOwner()) {
            setBooking(reconciled);
            if (hasPositiveNewInvitations(snapshot.invitationIds, reconciled.invitations)) {
              await clearLinkedReselectAttempt(AsyncStorage, currentUserId, bookingId).catch(() => undefined);
              uncertainSendRef.current = false;
              setUncertainSend(false);
              setSentConfirmed(true);
              setError('');
            }
          }
        } catch { /* Keep the ambiguous POST locked; no blind retry. */ }
        return;
      }
      // Positive 201 confirms a new round only — never a technician acceptance.
      await clearLinkedReselectAttempt(AsyncStorage, currentUserId, bookingId).catch(() => undefined);
      setSentConfirmed(true);
      setSelected([]);
      try {
        const updated = await bookingsApi.getBooking(bookingId);
        if (updated.id === bookingId && stillOwner()) setBooking(updated);
      } catch {
        setError('Yêu cầu chọn lại đã được gửi nhưng chưa tải được trạng thái mới. Hãy bấm làm mới.');
      }
    } finally {
      if (markerSaved && !posted) {
        // P2: only a marker saved by THIS attempt may be released here, and only
        // because nothing was dispatched. A failed clear keeps the safe direction.
        await clearLinkedReselectAttempt(AsyncStorage, currentUserId, bookingId).catch(() => undefined);
        shortlistRequestLockedRef.current = false;
      }
      sendingRef.current = false;
      setSending(false);
    }
  };

  const refresh = () => { if (!sending) void loadCurrent(); };
  // P1a hard render guard: private Booking content renders ONLY for the currently
  // signed-in owner, so an A->B switch can never flash A's card/candidates to B —
  // not even for one frame before the refired load clears state.
  const ownsVisibleBooking = isVisibleBookingOwner(booking, userId);
  const waiting = ownsVisibleBooking && (booking?.status === 'MATCHING' || booking?.status === 'MATCHED'
    || (!!booking?.serviceOrderId && !linkedTentative) || sentConfirmed || uncertainSend
    || attemptLocked || rejectedDefinitive);
  const selectable = ownsVisibleBooking && !!booking && canChooseTechnicians(booking) && !waiting && !loading && !error;
  const linkedSelectable = ownsVisibleBooking && linkedTentative && !waiting && !loading && !error;
  const pickerVisible = selectable || linkedSelectable;
  const linkedMode = !!booking?.serviceOrderId;
  const candidateState = candidateAvailabilityState(candidates.length);
  const verifiedOrderId = verifiedLinkedOrderId(booking, linkedOrder, userId);

  return (
    <SafeAreaView style={[styles.page, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.title, { color: colors.text }]}>Chọn kỹ thuật viên</Text>
        <Text style={[styles.note, { color: colors.textSecondary }]}>Mã Booking: {bookingId}</Text>
        {!isAuthenticated || role !== UserRole.CUSTOMER ? (
          <Text style={{ color: colors.error }}>Hãy đăng nhập bằng tài khoản khách hàng để xem yêu cầu này.</Text>
        ) : (
          <>
            {loading && <ActivityIndicator accessibilityLabel="Đang tải Booking và ứng viên" color={colors.primary} />}
            {!!error && <Text style={[styles.note, { color: colors.error }]}>{error}</Text>}
            {!!booking && ownsVisibleBooking && (
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.heading, { color: colors.text }]}>{booking.serviceName || 'Yêu cầu dịch vụ'}</Text>
                <Text style={[styles.note, { color: colors.textSecondary }]}>{describeBooking(booking)}</Text>
                <Text style={[styles.note, { color: colors.textSecondary }]}>Trạng thái: {booking.status}</Text>
                {!!booking.serviceOrderId && (
                  <Text selectable style={{ color: colors.success }}>
                    Mã ServiceOrder: {booking.serviceOrderId}
                  </Text>
                )}
                {!!verifiedOrderId && (
                  <TouchableOpacity
                    accessibilityRole="button"
                    onPress={() =>
                      navigation.navigate('CustomerOrderDetail', {
                        serviceOrderId: verifiedOrderId,
                      })
                    }
                    style={[styles.action, { backgroundColor: colors.primary }]}
                  >
                    <Text style={styles.actionText}>Xem đơn</Text>
                  </TouchableOpacity>
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
            {!!booking && !ownsVisibleBooking && (
              <Text style={[styles.note, { color: colors.textSecondary }]}>Tài khoản hiện tại không sở hữu yêu cầu này. Hãy đăng nhập đúng tài khoản khách hàng.</Text>
            )}
            {pickerVisible && (
              <>
                <Text style={[styles.heading, { color: colors.text }]}>
                  {linkedMode
                    ? `Yêu cầu chọn hai thợ mới (hệ thống sẽ kiểm tra) (${selected.length}/2)`
                    : `Chọn hai người theo thứ tự ưu tiên (${selected.length}/2)`}
                </Text>
                <Text style={[styles.note, { color: colors.textSecondary }]}>
                  {linkedMode
                    ? 'Thử yêu cầu chọn thợ mới; hệ thống kiểm tra trước khi gửi. Chỉ hệ thống mới quyết định lời mời có được tạo hay không.'
                    : 'Chạm người thứ nhất để mời trước; người thứ hai dự phòng. Chạm lại để bỏ chọn.'}
                </Text>
                {candidateState === 'none' && (
                  <View style={styles.card}>
                    <Text style={{ color: colors.textSecondary }}>
                      Hiện chưa có kỹ thuật viên phù hợp với dịch vụ, khu vực và khung giờ này.
                      Hãy làm mới bằng GET sau một lúc hoặc quay lại xem lịch hẹn.
                    </Text>
                    <Text style={[styles.note, { color: colors.textSecondary }]}>
                      Ứng dụng không tự đổi lịch, hủy hay tạo Booking mới. Việc đổi lịch chỉ thực
                      hiện ở trạng thái được Backend cho phép và bằng thao tác riêng của khách hàng.
                    </Text>
                  </View>
                )}
                {candidateState === 'one' && (
                  <View style={styles.card}>
                    <Text style={{ color: colors.textSecondary }}>
                      Hiện chỉ có 1/2 kỹ thuật viên phù hợp. Cần đủ hai người khác nhau để gửi lượt
                      mời theo thứ tự ưu tiên.
                    </Text>
                    <Text style={[styles.note, { color: colors.textSecondary }]}>
                      Hãy làm mới bằng GET hoặc quay lại kiểm tra lịch hẹn; không tự gửi một người
                      hoặc tạo Booking khác.
                    </Text>
                  </View>
                )}
                {candidates.map((candidate) => {
                  const priority = selected.indexOf(candidate.userId) + 1;
                  return (
                    <TouchableOpacity key={candidate.userId} accessibilityRole="button"
                      accessibilityState={{ selected: priority > 0, disabled: selected.length === 2 && priority === 0 }}
                      onPress={() => choose(candidate.userId)}
                      disabled={selected.length === 2 && priority === 0}
                      style={[styles.card, { borderColor: priority ? colors.primary : colors.border, backgroundColor: colors.surface }]}>
                      <Text style={[styles.heading, { color: colors.text }]}>{candidate.fullName || 'Kỹ thuật viên'}</Text>
                      <Text style={[styles.note, { color: colors.textSecondary }]}>{priority === 1 ? 'Ưu tiên 1 · Mời trước' : priority === 2 ? 'Ưu tiên 2 · Dự phòng' : 'Chạm để chọn'}</Text>
                      {Number.isFinite(candidate.averageRating) && <Text style={{ color: colors.textSecondary }}>Đánh giá: {candidate.averageRating}/5 ({candidate.ratingCount} lượt)</Text>}
                      {candidate.distanceKm != null && Number.isFinite(candidate.distanceKm) && <Text style={{ color: colors.textSecondary }}>Khoảng cách tham khảo: {candidate.distanceKm} km</Text>}
                    </TouchableOpacity>
                  );
                })}
                <TouchableOpacity accessibilityRole="button" onPress={sendShortlist} disabled={selected.length !== 2 || sending}
                  style={[styles.action, { backgroundColor: selected.length === 2 ? colors.primary : colors.border }]}>
                  <Text style={styles.actionText}>
                    {sending ? 'Đang gửi...' : linkedMode ? 'Gửi yêu cầu chọn hai thợ mới' : 'Xác nhận mời hai kỹ thuật viên'}
                  </Text>
                </TouchableOpacity>
              </>
            )}
            {waiting && <Text style={[styles.note, { color: colors.textSecondary }]}>Chỉ trạng thái Backend mới xác nhận kỹ thuật viên nhận đơn. Không cần gửi lại shortlist.</Text>}
            {ownsVisibleBooking && uncertainSend && <Text style={[styles.note, { color: colors.error }]}>Chưa thể xác nhận kết quả POST. Không gửi lại khi chưa được hỗ trợ kiểm tra yêu cầu trên hệ thống.</Text>}
            {ownsVisibleBooking && attemptLocked && (
              <Text style={[styles.note, { color: colors.error }]}>
                Đã có một lượt mời đang chờ xác minh. Không gửi lại để tránh trùng; hãy làm mới
                Booking. Chỉ bằng chứng từ Backend mới được gỡ khóa.
              </Text>
            )}
            {ownsVisibleBooking && rejectedDefinitive && <Text style={[styles.note, { color: colors.textSecondary }]}>Hệ thống đã từ chối yêu cầu chọn lại theo trạng thái mới nhất. Hãy làm mới để xem trạng thái hiện tại.</Text>}
            <TouchableOpacity accessibilityRole="button" onPress={refresh} disabled={loading || sending}
              style={[styles.action, { backgroundColor: colors.primary }]}>
              <Text style={styles.actionText}>{loading ? 'Đang tải...' : 'Làm mới trạng thái Booking'}</Text>
            </TouchableOpacity>
          </>
        )}
        <TouchableOpacity accessibilityRole="button" onPress={() => navigation.goBack()} style={[styles.action, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]}>
          <Text style={{ color: colors.text, fontWeight: '700' }}>Quay lại</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { padding: 18, paddingBottom: 42, gap: 12 },
  title: { fontSize: 23, fontWeight: '700', marginBottom: 6 },
  heading: { fontSize: 16, fontWeight: '700' },
  note: { fontSize: 13, lineHeight: 21 },
  card: { padding: 15, borderWidth: 1, borderRadius: 12, gap: 7 },
  action: { padding: 15, borderRadius: 12, alignItems: 'center' },
  actionText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
