import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '../../constants/theme';

/**
 * One section of a registration step: a title, an optional line of help and the content. It has no frame of its own:
 * the wizard already wraps every step in a bordered card, so a second frame here (and a third around each group)
 * squeezed the content narrow. Sections are told apart by the heading and the space the step puts between them.
 */
export default function OnboardingSection({ title, description, children, testID }: {
  title: string;
  description?: string;
  children: React.ReactNode;
  testID?: string;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  return (
    <View style={styles.section} testID={testID}>
      <View style={styles.head} accessible accessibilityRole="header" accessibilityLabel={description ? `${title}. ${description}` : title}>
        <Text style={styles.title}>{title}</Text>
        {!!description && <Text style={styles.description}>{description}</Text>}
      </View>
      {children}
    </View>
  );
}

const getStyles = (colors: ReturnType<typeof useAppTheme>['colors']) => StyleSheet.create({
  section: { gap: 12 },
  head: { gap: 4 },
  title: { color: colors.text, fontSize: 16, lineHeight: 24, fontWeight: '600' },
  description: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
});
