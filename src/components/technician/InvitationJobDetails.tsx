// src/components/technician/InvitationJobDetails.tsx
//
// What the technician reads before accepting (PO 18/10/2026): the customer's words, the price
// basis, the assistant's summary and the photos/videos. Never the address, phone or private note.
import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Sparkles } from 'lucide-react-native';
import type { TechnicianBookingPreview } from '../../api/bookings.api';
import { useAppTheme } from '../../constants/theme';
import { invitationPriceText } from '../../screens/technician/invitation-view';
import { formatVnd } from '../../utils/format';
import BookingMediaViewer from './BookingMediaViewer';

function Lines({ label, items }: { label: string; items?: string[] }) {
  const { colors } = useAppTheme();
  const list = (items ?? []).filter(Boolean);
  if (!list.length) return null;
  return (
    <View style={styles.row}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
      {list.map((t) => <Text key={t} style={[styles.value, { color: colors.text }]}>{t}</Text>)}
    </View>
  );
}

export default function InvitationJobDetails({ booking }: { booking: TechnicianBookingPreview }) {
  const { colors } = useAppTheme();
  const [aiOpen, setAiOpen] = useState(false);
  const ai = booking.aiSummary;
  const hasPrice = ai && (ai.priceMin != null || ai.priceMax != null);
  const noteStyle = [styles.value, styles.note, { color: colors.tone.warning.text, backgroundColor: colors.tone.warning.bg }];
  return (
    <View testID="invitation-job-details" style={styles.wrap}>
      <View style={[styles.row, { borderBottomColor: colors.border }]}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>Khách mô tả</Text>
        <Text style={[styles.value, { color: booking.description ? colors.text : colors.textSecondary }]}>
          {booking.description ?? 'Khách chưa ghi mô tả.'}
        </Text>
        <Text style={[styles.value, { color: colors.text }]}>{invitationPriceText(booking, formatVnd)}</Text>
        {ai ? (
          <TouchableOpacity
            style={styles.aiBtn}
            onPress={() => setAiOpen((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: aiOpen }}
          >
            <Sparkles size={16} color={colors.primaryStrong} strokeWidth={1.75} />
            <Text style={[styles.aiBtnText, { color: colors.primaryStrong }]}>
              {aiOpen ? 'Ẩn tóm tắt vấn đề từ AI' : 'Xem tóm tắt vấn đề từ AI'}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {ai && aiOpen ? (
        <View testID="invitation-ai-summary" style={[styles.row, { borderBottomColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>AI nhận định</Text>
          {ai.deviceName ? <Text style={[styles.value, { color: colors.text }]}>{`Thiết bị: ${ai.deviceName}`}</Text> : null}
          <Lines label="Có thể là" items={ai.suspectedFaults} />
          <Lines label="Đã trao đổi" items={ai.notes} />
          <Lines label="Đã khuyên khách" items={ai.suggestedActions} />
          {hasPrice ? (
            <Text style={[styles.value, { color: colors.text }]}>
              {`Giá tham khảo: ${[ai.priceMin, ai.priceMax].filter((n) => n != null).map((n) => formatVnd(n)).join(' - ')}`}
            </Text>
          ) : null}
          {ai.recommendedServiceName ? (
            <Text style={[styles.value, { color: colors.text }]}>{`Dịch vụ gợi ý: ${ai.recommendedServiceName}`}</Text>
          ) : null}
          {ai.conclusion ? <Text style={[styles.value, { color: colors.text }]}>{ai.conclusion}</Text> : null}
          <Text style={noteStyle}>Đây là gợi ý sơ bộ, bạn kiểm tra tận nơi rồi mới kết luận.</Text>
        </View>
      ) : null}
      {booking.media?.length ? <BookingMediaViewer bookingId={booking.id} media={booking.media} /> : null}
      <Text style={noteStyle} testID="invitation-privacy-note">
        Địa chỉ cụ thể, số điện thoại và ghi chú riêng của khách hiện sau khi bạn nhận đơn.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12, marginTop: 8 },
  row: { paddingVertical: 12, borderBottomWidth: 1, gap: 6 },
  label: { fontSize: 12, lineHeight: 18 },
  value: { fontSize: 14, lineHeight: 22 },
  note: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  aiBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 },
  aiBtnText: { fontSize: 14, fontWeight: '600' },
});
