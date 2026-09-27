import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useAppTheme } from '../constants/theme';
import type { CategoryItem } from '../api/services.api';

interface Props {
  categories: CategoryItem[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

export default function CategoryPills({ categories, selectedId, onSelect }: Props) {
  const { colors } = useAppTheme();

  const pill = (id: string | null, label: string) => {
    const selected = selectedId === id;
    return (
      <TouchableOpacity
        key={id ?? 'all'}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        onPress={() => onSelect(id)}
        style={[
          styles.pill,
          {
            borderColor: selected ? colors.primary : colors.border,
            backgroundColor: selected ? colors.primary : colors.surface,
          },
        ]}
      >
        <Text style={{ color: selected ? colors.surface : colors.text, fontWeight: '600' }}>
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {pill(null, 'Tất cả')}
      {categories.map((category) => pill(category.id, category.name))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8, paddingVertical: 4 },
  pill: { minHeight: 44, paddingHorizontal: 16, justifyContent: 'center', borderWidth: 1, borderRadius: 22 },
});
