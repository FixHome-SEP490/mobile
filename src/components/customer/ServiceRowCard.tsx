// src/components/customer/ServiceRowCard.tsx
//
// One service in the discovery list: picture, name, and what the catalog says it costs.
// Used by both the browse list and the search results so the two look the same.
import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../constants/theme';
import { getServicePresentation } from '../../constants/service-presentation';
import { displayCustomerServiceName } from '../../constants/customer-display';
import { resolveServicePrice } from '../../screens/customer/service-catalog';
import type { ServiceItem } from '../../api/services.api';

const ART = 68;

function ServiceRowCard({ service, onPress }: { service: ServiceItem; onPress: (service: ServiceItem) => void }) {
  const { colors } = useAppTheme();
  const presentation = getServicePresentation(service.code);
  const price = resolveServicePrice(service);
  const name = displayCustomerServiceName(service.code, service.name);
  return (
    <TouchableOpacity
      testID={`service-card-${service.code ?? service.id}`}
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
      onPress={() => onPress(service)}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={service.name}
      accessibilityValue={{ text: `${price.text}${price.caption ? `, ${price.caption}` : ''}` }}
      accessibilityHint="Mở chi tiết dịch vụ"
    >
      <View style={[styles.art, { backgroundColor: colors.background }]}>
        {presentation ? (
          <Image source={presentation.imageSource} style={styles.artImage} resizeMode="contain" accessible={false} />
        ) : (
          <Ionicons name="construct-outline" size={28} color={colors.textSecondary} />
        )}
      </View>
      <View style={styles.info}>
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={2} ellipsizeMode="tail">{name}</Text>
        <Text style={[styles.price, { color: price.kind === 'survey' ? colors.textSecondary : colors.primaryStrong }]} numberOfLines={2}>
          {price.text}
        </Text>
        {!!price.caption && <Text style={[styles.caption, { color: colors.textSecondary }]} numberOfLines={2}>{price.caption}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.muted} />
    </TouchableOpacity>
  );
}

export default React.memo(ServiceRowCard);

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 92,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
  },
  art: { width: ART, height: ART, borderRadius: 14, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  artImage: { width: ART - 6, height: ART - 6 },
  info: { flex: 1, gap: 2 },
  name: { fontSize: 15, lineHeight: 21, fontWeight: '600' },
  price: { fontSize: 13, lineHeight: 18, fontWeight: '700' },
  caption: { fontSize: 11, lineHeight: 15 },
});
