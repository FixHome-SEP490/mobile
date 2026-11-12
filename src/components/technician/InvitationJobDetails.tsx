// src/components/technician/InvitationJobDetails.tsx
//
// What the technician reads before accepting (PO 18/10/2026): the customer's words, the price
// basis, the assistant's summary and the photos/videos. Never the address, phone or private note.
import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ChevronDown, ChevronUp, Sparkles } from 'lucide-react-native';
import type { TechnicianBookingPreview } from '../../api/bookings.api';
import { useAppTheme } from '../../constants/theme';
import { invitationPriceText } from '../../screens/technician/invitation-view';
import { formatVnd } from '../../utils/format';
import BookingMediaViewer from './BookingMediaViewer';
import PillText from '../PillText';

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

/** `hidePrivacyNote`: a visit of several devices says it once for the whole visit, not under every device. */
export default function InvitationJobDetails({ booking, hidePrivacyNote = false }: { booking: TechnicianBookingPreview; hidePrivacyNote?: boolean }) {
  const { colors } = useAppTheme();
  // Open at once: the diagnosis is what the technician came to read; it can still be folded away.
  const [aiOpen, setAiOpen] = useState(true);
  const ai = booking.aiSummary;
  const hasPrice = ai && (ai.priceMin != null || ai.priceMax != null);
  const words = (booking.description ?? ai?.customerText ?? '').trim();
  const faults = (ai?.suspectedFaults ?? []).filter(Boolean);
  const noteStyle = [styles.value, styles.note, { color: colors.tone.warning.text, backgroundColor: colors.tone.warning.bg }];
  const card = [styles.row, styles.card, { borderColor: colors.border, backgroundColor: colors.surface }];
  return (
    <View testID="invitation-job-details" style={styles.wrap}>
      <View style={card}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>Khách mô tả</Text>
        <Text style={[styles.value, { color: words ? colors.text : colors.textSecondary }]}>{words || 'Khách chưa ghi mô tả.'}</Text>
        <Text style={[styles.value, styles.price, { color: colors.text }]}>{invitationPriceText(booking, formatVnd)}</Text>
      </View>
      {booking.media?.length ? (
        <View style={styles.mediaSection}>
          <Text style={[styles.heading, { color: colors.text }]}>{`Ảnh/video khách gửi (${booking.media.length})`}</Text>
          <BookingMediaViewer bookingId={booking.id} media={booking.media} />
        </View>
      ) : null}
      {ai ? (
        <View testID="invitation-ai-summary" style={card}>
          <TouchableOpacity
            style={styles.aiBtn}
            onPress={() => setAiOpen((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: aiOpen }}
            accessibilityLabel={aiOpen ? 'Thu gọn nhận định của trợ lý AI' : 'Mở nhận định của trợ lý AI'}
          >
            <Sparkles size={16} color={colors.primaryStrong} strokeWidth={1.75} />
            <Text style={[styles.aiBtnText, { color: colors.primaryStrong }]}>Khách đã hỏi trợ lý AI trước khi đặt</Text>
            {aiOpen ? <ChevronUp size={16} color={colors.textSecondary} /> : <ChevronDown size={16} color={colors.textSecondary} />}
          </TouchableOpacity>
          {aiOpen ? (
            <>
              {ai.deviceName ? <Text style={[styles.value, styles.strong, { color: colors.text }]}>{`Thiết bị: ${ai.deviceName}`}</Text> : null}
              {faults.length ? (
                <View style={styles.row}>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>Có thể là</Text>
                  <View style={styles.chips}>
                    {faults.map((f) => (
                      <PillText key={f} style={[styles.chip, { color: colors.tone.warning.text, backgroundColor: colors.tone.warning.bg }]}>{f}</PillText>
                    ))}
                  </View>
                </View>
              ) : null}
              <Lines label="Khách đã thử / loại trừ" items={ai.notes} />
              <Lines label="AI đã khuyên khách" items={ai.suggestedActions} />
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
            </>
          ) : null}
        </View>
      ) : null}
      {!hidePrivacyNote && (
        <Text style={noteStyle} testID="invitation-privacy-note">
          Địa chỉ cụ thể, số điện thoại và ghi chú riêng của khách hiện sau khi bạn nhận đơn.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12, marginTop: 8 },
  row: { paddingVertical: 12, gap: 6 },
  card: { padding: 16, borderRadius: 16, borderWidth: 1 },
  mediaSection: { gap: 8 },
  heading: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  label: { fontSize: 12, lineHeight: 18 },
  value: { fontSize: 14, lineHeight: 22 },
  note: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  aiBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 },
  aiBtnText: { flex: 1, fontSize: 14, fontWeight: '600' },
  price: { fontWeight: '600' },
  strong: { fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { fontSize: 13, lineHeight: 18, fontWeight: '600', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: 'hidden' },
});
