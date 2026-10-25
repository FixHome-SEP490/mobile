import type { RefObject } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import { CalendarDays, FileText, MapPin, PackageCheck, Wrench } from 'lucide-react-native';
import type { BookingReviewSnapshot } from '../screens/customer/customer-booking-review';

type BookingColors = {
  border: string;
  divider: string;
  error: string;
  primary: string;
  surface: string;
  text: string;
  textSecondary: string;
  tone?: { warning: { bg: string; text: string } };
};

export function BookingReviewSummary({
  snapshot,
  colors,
}: {
  snapshot: BookingReviewSnapshot;
  colors: BookingColors;
}) {
  return (
    <View style={styles.summary}>
      <SummaryRow
        icon={<Wrench color={colors.primary} size={18} />}
        label="Dịch vụ"
        value={snapshot.serviceName}
        colors={colors}
      />
      <SummaryRow
        icon={<FileText color={colors.primary} size={18} />}
        label="Mô tả sự cố"
        value={snapshot.request.description}
        colors={colors}
      />
      {snapshot.photos.length > 0 && (
        <View style={styles.photoSummary}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Ảnh sự cố</Text>
          <View style={styles.photoList}>
            {snapshot.photos.map((photo, index) => (
              <Image
                key={`${photo.uri}-${index}`}
                source={{ uri: photo.uri }}
                style={[styles.photoPreview, { backgroundColor: colors.divider }]}
                resizeMode="cover"
                accessible
                accessibilityLabel={`Ảnh đính kèm ${index + 1}`}
              />
            ))}
          </View>
        </View>
      )}
      <SummaryRow
        icon={<MapPin color={colors.primary} size={18} />}
        label="Địa chỉ sửa chữa"
        value={`${snapshot.addressLabel}${snapshot.addressDescription ? ` · ${snapshot.addressDescription}` : ''}`}
        colors={colors}
      />
      <SummaryRow
        icon={<CalendarDays color={colors.primary} size={18} />}
        label="Ngày và giờ"
        value={snapshot.scheduleLabel}
        colors={colors}
      />
      <SummaryRow
        icon={<PackageCheck color={colors.primary} size={18} />}
        label="Giá dịch vụ"
        value={snapshot.pricingLabel}
        colors={colors}
      />
      <Text style={[styles.quantity, { color: colors.text }]}>
        Số lượng: {snapshot.request.quantity ?? 1}
      </Text>
      {snapshot.hasAiSummary ? (
        <View
          testID="booking-ai-summary-note"
          style={[styles.note, { backgroundColor: colors.tone?.warning.bg ?? '#FEF6E0' }]}
        >
          <Text style={[styles.noteText, { color: colors.tone?.warning.text ?? '#805B00' }]}>
            Kỹ thuật viên nhận việc sẽ thấy tóm tắt phần bạn trao đổi với trợ lý AI, nên bạn không cần kể lại từ đầu.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export default function BookingReviewSheet({
  sheetRef,
  snapshot,
  colors,
  confirmDisabled,
  confirmLabel,
  photoUploadError,
  onConfirm,
  onEdit,
  onDismiss,
}: {
  sheetRef: RefObject<BottomSheetModal | null>;
  snapshot: BookingReviewSnapshot | null;
  colors: BookingColors;
  confirmDisabled: boolean;
  confirmLabel: string;
  photoUploadError?: string;
  onConfirm: () => void;
  onEdit: () => void;
  onDismiss: () => void;
}) {
  const { height: windowHeight } = useWindowDimensions();
  return (
    <BottomSheetModal
      ref={sheetRef}
      enableDynamicSizing
      maxDynamicContentSize={Math.round(windowHeight * 0.78)}
      enablePanDownToClose
      onDismiss={onDismiss}
      backdropComponent={(props) => (
        <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.5} />
      )}
      backgroundStyle={{ backgroundColor: colors.surface }}
      handleIndicatorStyle={{ backgroundColor: colors.border }}
    >
      {snapshot && (
        <BottomSheetScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[styles.title, { color: colors.text }]}>Xem lại yêu cầu</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Kiểm tra thông tin trước khi xác nhận đặt lịch.
          </Text>
          <Text style={[styles.prestate, { color: colors.textSecondary }]}>
            Yêu cầu chưa được tạo và ảnh chưa tải lên — chỉ gửi sau khi bạn xác nhận.
          </Text>
          <BookingReviewSummary snapshot={snapshot} colors={colors} />
          {!!photoUploadError && (
            <Text accessibilityRole="alert" style={[styles.uploadError, { color: colors.error }]}>
              {photoUploadError}
            </Text>
          )}
          <TouchableOpacity
            accessibilityRole="button"
            disabled={confirmDisabled}
            onPress={onConfirm}
            style={[
              styles.primaryAction,
              { backgroundColor: confirmDisabled ? colors.border : colors.primary },
            ]}
          >
            <Text
              style={[
                styles.primaryActionText,
                { color: confirmDisabled ? colors.textSecondary : colors.surface },
              ]}
            >
              {confirmLabel}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={onEdit}
            style={[styles.secondaryAction, { borderColor: colors.border }]}
          >
            <Text style={[styles.secondaryActionText, { color: colors.text }]}>Chỉnh sửa</Text>
          </TouchableOpacity>
        </BottomSheetScrollView>
      )}
    </BottomSheetModal>
  );
}

function SummaryRow({
  icon,
  label,
  value,
  colors,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  colors: BookingColors;
}) {
  return (
    <View style={styles.summaryRow}>
      {icon && <View style={styles.icon}>{icon}</View>}
      <View style={styles.summaryText}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
        <Text style={[styles.value, { color: colors.text }]}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24, gap: 12 },
  title: { fontSize: 20, lineHeight: 27, fontWeight: '700' },
  subtitle: { fontSize: 13, lineHeight: 19 },
  prestate: { fontSize: 12, lineHeight: 18 },
  summary: { gap: 12 },
  summaryRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  // Same height as the label line so the icon sits level with it (e.g. the wrench with "Dịch vụ").
  icon: { width: 22, height: 18, alignItems: 'center', justifyContent: 'center' },
  summaryText: { flex: 1, gap: 4 },
  label: { fontSize: 12, lineHeight: 18 },
  value: { fontSize: 14, lineHeight: 20, fontWeight: '500' },
  quantity: { paddingLeft: 30, fontSize: 14, fontWeight: '600' },
  note: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12 },
  noteText: { fontSize: 13, lineHeight: 19 },
  photoSummary: { gap: 8, paddingLeft: 30 },
  photoList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photoPreview: { width: 64, height: 64, borderRadius: 10 },
  uploadError: { fontSize: 13, lineHeight: 19 },
  primaryAction: {
    minHeight: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primaryActionText: { fontSize: 15, fontWeight: '700' },
  secondaryAction: {
    minHeight: 46,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  secondaryActionText: { fontSize: 14, fontWeight: '600' },
});
