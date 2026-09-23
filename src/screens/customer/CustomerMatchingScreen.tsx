import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { bookingsApi, type BookingItem, type TechnicianCandidate } from '../../api/bookings.api';
import { useAppTheme } from '../../constants/theme';
import { useAuthStore } from '../../store';
import { UserRole, type RootStackParamList } from '../../types';
import { canChooseTechnicians, orderedCandidateIds, toggleCandidate } from '../../utils/booking-candidate-selection';

type MatchingRoute = RouteProp<RootStackParamList, 'CustomerMatching'>;
const PENDING_STATUSES = new Set(['PENDING', 'STANDBY']);

function describeBooking(booking: BookingItem): string {
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
  const [booking, setBooking] = useState<BookingItem | null>(null);
  const [candidates, setCandidates] = useState<TechnicianCandidate[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sentConfirmed, setSentConfirmed] = useState(false);
  const [uncertainSend, setUncertainSend] = useState(false);
  const sendingRef = useRef(false);
  // A shortlist POST is never repeated because a timeout may follow a successful write.
  const shortlistRequestLockedRef = useRef(false);
  const uncertainSendRef = useRef(false);
  const loadGeneration = useRef(0);

  const loadCurrent = useCallback(async () => {
    if (!isAuthenticated || role !== UserRole.CUSTOMER) {
      setLoading(false);
      return;
    }
    const generation = ++loadGeneration.current;
    setLoading(true);
    setError('');
    try {
      const nextBooking = await bookingsApi.getBooking(bookingId);
      if (generation !== loadGeneration.current) return;
      if (nextBooking.id !== bookingId) throw new Error('Mã Booking trả về không khớp yêu cầu.');
      setBooking(nextBooking);
      // An ambiguous POST can be reconciled only by positive server evidence.
      if (uncertainSendRef.current && (nextBooking.status === 'MATCHING' || nextBooking.status === 'MATCHED'
        || (nextBooking.invitations ?? []).some((invitation) => PENDING_STATUSES.has(invitation.status)))) {
        uncertainSendRef.current = false;
        setUncertainSend(false);
        setSentConfirmed(true);
      }
      setCandidates([]);
      setSelected([]);
      if (canChooseTechnicians(nextBooking) && !shortlistRequestLockedRef.current) {
        const list = await bookingsApi.getCandidates(bookingId);
        if (generation !== loadGeneration.current) return;
        setCandidates(list.filter((candidate) => candidate.isAvailable));
      }
    } catch {
      if (generation === loadGeneration.current) {
        setError('Không thể tải trạng thái Booking hoặc danh sách thợ. Kiểm tra kết nối và thử lại.');
      }
    } finally {
      if (generation === loadGeneration.current) setLoading(false);
    }
  }, [bookingId, isAuthenticated, role]);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => { if (active) void loadCurrent(); });
    return () => { active = false; loadGeneration.current += 1; };
  }, [loadCurrent]);

  const choose = (userId: string) => {
    if (!booking || !canChooseTechnicians(booking) || sending || loading || uncertainSend || sentConfirmed) return;
    setSelected((previous) => toggleCandidate(previous, userId));
  };

  const sendShortlist = async () => {
    if (sendingRef.current || shortlistRequestLockedRef.current || loading || sentConfirmed || uncertainSend || !booking || !canChooseTechnicians(booking)) return;
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
    shortlistRequestLockedRef.current = true;
    sendingRef.current = true;
    setSending(true);
    setError('');
    try {
      // Backend owns PENDING/STANDBY activation, expiration and creating ServiceOrder.
      await bookingsApi.sendShortlist(bookingId, orderedIds);
      setSentConfirmed(true);
      setSelected([]);
      // A confirmed POST is not the same as technician acceptance. Refresh the source state.
      try {
        const updated = await bookingsApi.getBooking(bookingId);
        if (updated.id === bookingId) setBooking(updated);
      } catch {
        setError('Lời mời đã được gửi nhưng chưa tải được trạng thái mới. Hãy bấm làm mới.');
      }
    } catch {
      // Network timeout after a POST is ambiguous; GET reconciliation cannot prove non-creation.
      uncertainSendRef.current = true;
      setUncertainSend(true);
      setError('Chưa xác định được kết quả gửi lời mời. Không gửi lại để tránh trùng; hãy làm mới Booking hoặc liên hệ hỗ trợ.');
      try {
        const updated = await bookingsApi.getBooking(bookingId);
        if (updated.id === bookingId) {
          setBooking(updated);
          if (updated.status === 'MATCHING' || updated.status === 'MATCHED' ||
              (updated.invitations ?? []).some((invitation) => PENDING_STATUSES.has(invitation.status))) {
            uncertainSendRef.current = false;
            setSentConfirmed(true);
            setUncertainSend(false);
            setError('');
          }
        }
      } catch { /* Keep the ambiguous POST locked; no blind retry. */ }
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  const refresh = () => { if (!sending) void loadCurrent(); };
  const waiting = booking?.status === 'MATCHING' || booking?.status === 'MATCHED'
    || !!booking?.serviceOrderId || sentConfirmed || uncertainSend;
  const selectable = !!booking && canChooseTechnicians(booking) && !waiting && !loading && !error;

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
            {!!booking && (
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.heading, { color: colors.text }]}>{booking.serviceName || 'Yêu cầu dịch vụ'}</Text>
                <Text style={[styles.note, { color: colors.textSecondary }]}>{describeBooking(booking)}</Text>
                <Text style={[styles.note, { color: colors.textSecondary }]}>Trạng thái: {booking.status}</Text>
                {!!booking.serviceOrderId && (
                  <Text selectable style={{ color: colors.success }}>Mã ServiceOrder: {booking.serviceOrderId}</Text>
                )}
              </View>
            )}
            {selectable && (
              <>
                <Text style={[styles.heading, { color: colors.text }]}>Chọn hai người theo thứ tự ưu tiên ({selected.length}/2)</Text>
                <Text style={[styles.note, { color: colors.textSecondary }]}>Chạm người thứ nhất để mời trước; người thứ hai dự phòng. Chạm lại để bỏ chọn.</Text>
                {candidates.length < 2 && <Text style={{ color: colors.textSecondary }}>Chưa đủ hai kỹ thuật viên phù hợp. Hãy tải lại sau hoặc quay lại yêu cầu của bạn.</Text>}
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
                  <Text style={styles.actionText}>{sending ? 'Đang gửi...' : 'Xác nhận mời hai kỹ thuật viên'}</Text>
                </TouchableOpacity>
              </>
            )}
            {waiting && <Text style={[styles.note, { color: colors.textSecondary }]}>Chỉ trạng thái Backend mới xác nhận kỹ thuật viên nhận đơn. Không cần gửi lại shortlist.</Text>}
            {uncertainSend && <Text style={[styles.note, { color: colors.error }]}>Chưa thể xác nhận kết quả POST. Không gửi lại khi chưa được hỗ trợ kiểm tra yêu cầu trên hệ thống.</Text>}
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