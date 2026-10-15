import BookingActionBar from '../../components/BookingActionBar';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { BookingItem } from '../../api/bookings.api';
import type { ServiceOrderItem } from '../../api/orders.api';
import { useAppTheme } from '../../constants/theme';
import { vnDateTimeString } from '../../utils/vn-time';
import BackButton from '../../components/BackButton';

type Props = {
  booking: BookingItem;
  order: ServiceOrderItem;
  onViewOrder: () => void;
  onHome: () => void;
  onBack: () => void;
  onRefresh: () => void;
};

/**
 * C08 is a distinct visual scene, NOT an alternative matching or status
 * controller. Parent renders it only for an owner-verified MATCHED Booking
 * linked to an actual ACCEPTED ServiceOrder returned by the Backend.
 */
export default function CustomerMatchingAcceptedScene({
  booking, order, onViewOrder, onHome, onBack, onRefresh,
}: Props) {
  const { colors } = useAppTheme();
  return (
    <View testID="matching-accepted-scene" style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.top}>
          <BackButton onPress={onBack} />
          <Text accessibilityRole="header" style={{ fontSize: 22, fontWeight: '700', color: colors.text }}>Kỹ thuật viên đã nhận đơn</Text>
        </View>
        <View testID="matching-accepted-handoff" style={[styles.hero, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.emblem, { backgroundColor: colors.tone.success.bg }]}>
            <Ionicons name="checkmark-circle-outline" color={colors.tone.success.text} size={44} />
          </View>
          <Text style={[styles.tag, { color: colors.tone.success.text }]}>Kỹ thuật viên đã nhận đơn</Text>
          <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
            Có người cùng bạn lo nhà.
          </Text>
          <Text style={[styles.description, { color: colors.textSecondary }]}>
            Lời mời đã được chấp nhận và đơn sửa chữa liên kết đã được hệ thống xác nhận.
            Theo dõi tiến độ thực tế trong chi tiết đơn.
          </Text>
        </View>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>ĐƠN SỬA CHỮA CỦA BẠN</Text>
          <Text style={[styles.service, { color: colors.text }]}>
            {booking.serviceName || order.serviceName || 'Yêu cầu dịch vụ'}
          </Text>
          <Text selectable style={[styles.reference, { color: colors.textSecondary }]}>
            Mã đơn: {order.code || order.id.slice(0, 8)}
          </Text>
          {!!booking.preferredStartAt && Number.isFinite(Date.parse(booking.preferredStartAt)) && (
            <Text style={[styles.detail, { color: colors.textSecondary }]}>
              Giờ mong muốn ban đầu: {vnDateTimeString(booking.preferredStartAt)}
            </Text>
          )}
          <Text style={[styles.detail, { color: colors.textSecondary }]}>
            Giờ hẹn và tiến độ có thể thay đổi theo cập nhật chính thức của hệ thống.
          </Text>
        </View>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Làm mới trạng thái"
          onPress={onRefresh}
          style={styles.refresh}>
          <Ionicons name="refresh-outline" color={colors.primaryStrong} size={17} />
          <Text style={{ color: colors.primaryStrong }}>Kiểm tra cập nhật mới nhất</Text>
        </TouchableOpacity>
      </ScrollView>
      <BookingActionBar>

        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Về trang chủ"
          style={[styles.secondary, { borderColor: colors.border }]} onPress={onHome}>
          <Text style={[styles.secondaryText, { color: colors.text }]}>Về trang chủ</Text>
        </TouchableOpacity>
<TouchableOpacity
          testID="matching-waiting-primary"
          accessibilityRole="button"
          accessibilityLabel="Xem đơn sửa chữa"
          style={[styles.primary, { backgroundColor: colors.primaryStrong }]}
          onPress={onViewOrder}>
          <Text style={[styles.primaryText, { color: colors.surface }]}>Xem đơn sửa chữa</Text>
          <Ionicons name="arrow-forward" size={19} color={colors.surface} />
        </TouchableOpacity>
      </BookingActionBar>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, paddingBottom: 26, gap: 20, flexGrow: 1 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 15 },
  back: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontSize: 12, lineHeight: 18, letterSpacing: 0.8, fontWeight: '700' },
  hero: { borderWidth: 1, borderRadius: 24, padding: 22, alignItems: 'center', gap: 14 },
  emblem: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  tag: { fontSize: 13, fontWeight: '700', lineHeight: 21 },
  title: { fontSize: 22, lineHeight: 30, fontWeight: '700', textAlign: 'center' },
  description: { fontSize: 14, lineHeight: 23, textAlign: 'center' },
  card: { borderWidth: 1, borderRadius: 20, padding: 18, gap: 11 },
  service: { fontSize: 18, lineHeight: 26, fontWeight: '700' },
  reference: { fontSize: 13, lineHeight: 20 },
  detail: { fontSize: 13, lineHeight: 20 },
  refresh: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', minHeight: 48, gap: 8 },
  footer: { borderTopWidth: 1, padding: 16, gap: 10 },
  primary: { borderRadius: 16, minHeight: 52, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10 },
  secondary: { borderRadius: 16, borderWidth: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontSize: 16, lineHeight: 23, fontWeight: '700' },
  secondaryText: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
});
