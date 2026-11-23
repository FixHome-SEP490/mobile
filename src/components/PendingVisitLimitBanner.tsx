import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AlertTriangle } from 'lucide-react-native';
import ToneNote from './ToneNote';
import { useAppTheme } from '../constants/theme';

/** Shown when the server refuses a new request because 2 are already waiting for a technician (same wording as web). */
export default function PendingVisitLimitBanner({
  message,
  onView,
  onDismiss,
}: {
  message: string;
  onView: () => void;
  onDismiss: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <View testID="pending-limit-banner" style={styles.wrap}>
      <ToneNote tone="warning" icon={AlertTriangle} alert>
        {`Bạn đã đạt giới hạn yêu cầu đang chờ. ${message}`}
      </ToneNote>
      <View style={styles.row}>
        <TouchableOpacity
          testID="pending-limit-view"
          accessibilityRole="button"
          accessibilityLabel="Xem yêu cầu đang chờ"
          style={[styles.primary, { backgroundColor: colors.primaryStrong }]}
          onPress={onView}
        >
          <Text style={styles.primaryText}>Xem yêu cầu đang chờ</Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="pending-limit-dismiss"
          accessibilityRole="button"
          accessibilityLabel="Để sau"
          style={[styles.secondary, { borderColor: colors.border }]}
          onPress={onDismiss}
        >
          <Text style={[styles.secondaryText, { color: colors.text }]}>Để sau</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  row: { flexDirection: 'row', gap: 8 },
  primary: { flex: 1, minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  primaryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  secondary: { minHeight: 48, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  secondaryText: { fontSize: 14, fontWeight: '600' },
});
