import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../constants/theme';

export type CustomerActivitySectionIcon = 'alert' | 'ongoing' | 'request';

interface CustomerActivitySectionHeaderProps {
  title: string;
  count: number;
  icon: CustomerActivitySectionIcon;
  testID?: string;
}

const ICON_NAME: Record<CustomerActivitySectionIcon, 'alert-circle-outline' | 'layers-outline' | 'calendar-outline'> = {
  alert: 'alert-circle-outline',
  ongoing: 'layers-outline',
  request: 'calendar-outline',
};

/**
 * Reusable Activity section header (REAL tab only, never preview fixtures).
 * Visual order mirrors `CustomerShellPreview` activity: action-required first,
 * other ongoing second. History stays a secondary `Lịch sử` navigation action.
 */
export default function CustomerActivitySectionHeader({
  title,
  count,
  icon,
  testID,
}: CustomerActivitySectionHeaderProps) {
  const { colors } = useAppTheme();
  return (
    <View
      style={styles.row}
      testID={testID}
      accessibilityRole="header"
      accessibilityLabel={`${title}, ${count}`}
    >
      <View style={[styles.icon, { backgroundColor: colors.primaryTint }]}>
        <Ionicons
          name={ICON_NAME[icon]}
          size={16}
          color={colors.primary}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      </View>
      <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
        {title}
      </Text>
      <Text style={[styles.count, { color: colors.textSecondary }]}>{count}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    marginBottom: 8,
  },
  icon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '800',
  },
  count: {
    fontSize: 12,
    fontWeight: '700',
  },
});
