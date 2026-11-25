import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Check, ChevronDown, ChevronUp, CookingPot, Droplets, Fan, Flame, Lightbulb, Plug, Refrigerator, Wind, WashingMachine, Wrench, type LucideIcon } from 'lucide-react-native';
import { iconStroke, useAppTheme } from '../../constants/theme';

export interface SkillCategoryService { id: string; name: string }

// Icon per category by keyword in its name; unknown categories fall back to a wrench.
const CATEGORY_ICONS: [RegExp, LucideIcon][] = [
  [/điều hòa/i, Wind], [/giặt|sấy/i, WashingMachine], [/tủ lạnh/i, Refrigerator], [/lọc nước/i, Droplets],
  [/nóng lạnh/i, Flame], [/bếp/i, CookingPot], [/điện dân dụng/i, Plug], [/đèn|quạt/i, Fan], [/ống|nước/i, Droplets], [/điện/i, Lightbulb],
];
const categoryIcon = (name: string, color: string) => {
  const Icon: LucideIcon = CATEGORY_ICONS.find(([re]) => re.test(name))?.[1] ?? Wrench;
  return <Icon size={22} strokeWidth={iconStroke} color={color} />;
};

/**
 * One service category of the registration step 3, as a row of a plain list: the name, how many are chosen, and a
 * chevron; open, it shows a tick row per service. No frame per group (the wizard card already frames the step, and a box
 * around every group made the list heavy); rows are told apart by a hairline. A chosen service is a filled tick, and the
 * count under the name turns blue, so the choice shows without opening the group. Selection lives in the screen.
 */
export default function SkillCategoryCard({ name, services, selectedIds, expanded, onToggleExpanded, onToggleService, onSetAll }: {
  name: string;
  services: readonly SkillCategoryService[];
  selectedIds: readonly string[];
  expanded: boolean;
  onToggleExpanded: () => void;
  onToggleService: (id: string) => void;
  /** `true` ticks every service of the group, `false` clears it. */
  onSetAll: (selected: boolean) => void;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const picked = services.filter((s) => selectedIds.includes(s.id)).length;
  const all = services.length > 0 && picked === services.length;
  const Chevron = expanded ? ChevronUp : ChevronDown;

  return (
    <View style={[styles.group, picked > 0 && styles.groupPicked]} testID={`skill-category-${name}`}>
      <Pressable
        testID={`skill-category-header-${name}`}
        accessibilityRole="button"
        accessibilityLabel={`${name}, đã chọn ${picked} trên ${services.length} dịch vụ`}
        accessibilityHint={expanded ? 'Chạm để thu gọn nhóm' : 'Chạm để mở nhóm và chọn dịch vụ'}
        accessibilityState={{ expanded }}
        onPress={onToggleExpanded}
        style={({ pressed }) => [styles.header, pressed && styles.pressed]}
      >
        <View style={[styles.iconTile, picked > 0 && styles.iconTilePicked]}>
          {categoryIcon(name, picked > 0 ? colors.primaryStrong : colors.textSecondary)}
        </View>
        <View style={styles.headerText}>
          <Text style={styles.name}>{name}</Text>
          <Text style={[styles.count, picked > 0 && styles.countPicked]}>{picked}/{services.length} dịch vụ</Text>
          <View style={styles.track}><View style={[styles.fill, { width: `${services.length ? (picked / services.length) * 100 : 0}%` }]} /></View>
        </View>
        <Chevron size={20} strokeWidth={iconStroke} color={colors.textSecondary} />
      </Pressable>

      {expanded && (
        <View style={styles.body}>
          <Pressable
            testID={`skill-category-all-${name}`}
            accessibilityRole="button"
            accessibilityLabel={`${all ? 'Bỏ chọn' : 'Chọn'} cả nhóm ${name}`}
            onPress={() => onSetAll(!all)}
            style={({ pressed }) => [styles.allRow, pressed && styles.pressed]}
          >
            <Text style={styles.allText}>{all ? 'Bỏ chọn cả nhóm' : 'Chọn cả nhóm'}</Text>
          </Pressable>
          {services.map((service) => {
            const checked = selectedIds.includes(service.id);
            return (
              <Pressable
                key={service.id}
                testID={`skill-service-${service.id}`}
                accessibilityRole="checkbox"
                accessibilityLabel={service.name}
                accessibilityState={{ checked }}
                onPress={() => onToggleService(service.id)}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              >
                <View style={[styles.box, checked && styles.boxChecked]}>
                  {checked && <Check size={15} strokeWidth={3} color={colors.surface} />}
                </View>
                <Text style={styles.rowText}>{service.name}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const getStyles = (colors: ReturnType<typeof useAppTheme>['colors']) => StyleSheet.create({
  group: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16, paddingHorizontal: 12, marginBottom: 10 },
  groupPicked: { borderColor: colors.primaryTint, backgroundColor: colors.primarySoft },
  header: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  iconTile: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  iconTilePicked: { backgroundColor: colors.primaryTint },
  headerText: { flex: 1, minWidth: 0, gap: 2 },
  track: { height: 4, borderRadius: 2, backgroundColor: colors.border, marginTop: 6, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2, backgroundColor: colors.primaryStrong },
  name: { color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: '600' },
  count: { color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  countPicked: { color: colors.primaryStrong, fontWeight: '600' },
  body: { backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 12, paddingBottom: 6, marginBottom: 10 },
  allRow: { minHeight: 44, justifyContent: 'center', alignItems: 'flex-end' },
  allText: { color: colors.primaryStrong, fontSize: 14, fontWeight: '600' },
  row: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 8 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: colors.muted, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  boxChecked: { borderColor: colors.primaryStrong, backgroundColor: colors.primaryStrong },
  rowText: { flex: 1, minWidth: 0, color: colors.text, fontSize: 15, lineHeight: 21 },
  pressed: { opacity: 0.8 },
});
