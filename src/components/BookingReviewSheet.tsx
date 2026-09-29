import type { RefObject } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import { CalendarDays, MapPin, PackageCheck, Wrench } from 'lucide-react-native';
import type { BookingReviewSnapshot } from '../screens/customer/customer-booking-review';

type BookingColors = {
  border: string;
  error: string;
  primary: string;
  surface: string;
  text: string;
  textSecondary: string;
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
        icon={<MapPin color={colors.primary} size={18} />}
        label="Địa chỉ sửa chữa"
        value={`${snapshot.addressLabel}${snapshot.addressDescription ? ` · ${snapshot.addressDescription}` : ''}`}
        colors={colors}
      />
      <SummaryRow
        label="Mô tả sự cố"
        value={snapshot.request.description}
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
    </View>
  );
}

export default function BookingReviewSheet({
  sheetRef,
  snapshot,
  colors,
  confirmDisabled,
  confirmLabel,
  onConfirm,
  onEdit,
  onDismiss,
}: {
  sheetRef: RefObject<BottomSheetModal | null>;
  snapshot: BookingReviewSnapshot | null;
  colors: BookingColors;
  confirmDisabled: boolean;
  confirmLabel: string;
  onConfirm: () => void;
  onEdit: () => void;
  onDismiss: () => void;
}) {
  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={['78%']}
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
          <BookingReviewSummary snapshot={snapshot} colors={colors} />
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
  content: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 24, gap: 14 },
  title: { fontSize: 20, lineHeight: 27, fontWeight: '700' },
  subtitle: { fontSize: 13, lineHeight: 19 },
  summary: { gap: 13 },
  summaryRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  icon: { width: 22, alignItems: 'center', paddingTop: 2 },
  summaryText: { flex: 1, gap: 3 },
  label: { fontSize: 12 },
  value: { fontSize: 14, lineHeight: 20, fontWeight: '500' },
  quantity: { paddingLeft: 32, fontSize: 14, fontWeight: '600' },
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
