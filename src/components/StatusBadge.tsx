import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  AlertTriangle,
  ArrowDown,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  HelpCircle,
  Minus,
  Navigation,
  Wrench,
  XCircle,
} from 'lucide-react-native';
import { useAppTheme } from '../constants/theme';
import type { StatusIcon, StatusView } from '../screens/technician/technician-status';

const ICONS = {
  ClipboardCheck,
  Navigation,
  Wrench,
  CheckCircle2,
  XCircle,
  HelpCircle,
  AlertTriangle,
  ArrowDown,
  Minus,
  Clock,
} satisfies Record<StatusIcon, unknown>;

/** Label + icon + tone (never colour alone, DS §8.4). Grows with font scale, no truncation. */
export default function StatusBadge({ view }: { view: StatusView }) {
  const { colors } = useAppTheme();
  const tone = colors.tone[view.tone];
  const Icon = ICONS[view.icon];
  return (
    <View style={[styles.badge, { backgroundColor: tone.bg }]}>
      <Icon size={14} color={tone.fg} strokeWidth={2} />
      <Text style={[styles.text, { color: tone.text }]}>{view.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 24,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  text: { fontSize: 12, lineHeight: 16, fontWeight: '600', flexShrink: 1 },
});
