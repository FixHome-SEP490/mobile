import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ChevronRight } from 'lucide-react-native';
import type { ServiceOrderItem } from '../../../api/orders.api';
import { lightTheme as colors, spacing } from '../../../constants/theme';

/**
 * What the customer wrote when asking for the repair. The invitation showed it; once the job is accepted the
 * technician still needs it on the way to the customer, so it stays one tap away and opens in full.
 */
export default function CustomerRequestPreview({ order }: { order: ServiceOrderItem | null }) {
  const navigation = useNavigation<any>();
  const description = order?.bookingDescription?.trim();
  const note = order?.customerNote?.trim();
  const photos = order?.bookingMedia?.length ?? 0;
  if (!order || (!description && !note && !photos)) return null;
  return (
    <Pressable
      testID="customer-request-preview"
      accessibilityRole="button"
      accessibilityLabel="Xem thông tin đơn"
      onPress={() => navigation.navigate('OrderInformation')}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.body}>
        <Text style={styles.title}>Khách mô tả</Text>
        {!!description && <Text numberOfLines={3} style={styles.text}>{description}</Text>}
        {!!note && <Text numberOfLines={2} style={styles.note}>{`Ghi chú: ${note}`}</Text>}
        {photos > 0 && <Text style={styles.note}>{`${photos} ảnh/video của khách`}</Text>}
        <Text style={styles.link}>Xem thông tin đơn</Text>
      </View>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <ChevronRight size={20} strokeWidth={1.75} color={colors.muted} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.surface },
  pressed: { opacity: 0.8 },
  body: { flex: 1, gap: 4 },
  title: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  text: { color: colors.text, fontSize: 15, lineHeight: 22 },
  note: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
  link: { color: colors.primaryStrong, fontSize: 14, fontWeight: '600', marginTop: 2 },
});
