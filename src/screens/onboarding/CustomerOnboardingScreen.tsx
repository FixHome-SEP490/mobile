// src/screens/onboarding/CustomerOnboardingScreen.tsx
//
// Exactly THREE locked Customer intro slides. Continue only advances the local
// step (no storage writes). Skip from any slide, or Bắt đầu on the final
// slide, persists the first-run flag and exits to the zero-network GuestHome.
// Reuses the original bundled HomeScene; no DEV gallery or API dependencies.
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Image, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ArrowRight, House, Wrench, ShieldCheck, type LucideIcon } from 'lucide-react-native';
import { useAppTheme } from '../../constants/theme';
import { CUSTOMER_UI_ARTWORK } from '../../constants/customer-artwork';
import type { RootStackParamList } from '../../types';
import { markCustomerFirstRunSeen } from '../../services/customer-first-run';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export interface CustomerIntroSlide {
  title: string;
  accent: string;
  kicker: string;
  tag: string;
  description: string;
  Icon: LucideIcon;
}

/** Locked to three slides; do not extend to a five-screen concept. */
export const CUSTOMER_ONBOARDING_SLIDES: CustomerIntroSlide[] = [
  {
    title: 'Nhà cần sửa.',
    accent: 'Có người cùng lo.',
    kicker: 'Dịch vụ cho từng góc nhà',
    tag: 'Một việc, đúng người',
    description: 'Tìm dịch vụ phù hợp với máy lạnh, máy giặt và những việc trong nhà.',
    Icon: House,
  },
  {
    title: 'Bạn chọn việc.',
    accent: 'Chúng tôi kết nối.',
    kicker: 'Đặt sửa, từng bước rõ ràng',
    tag: 'Chọn · Đặt · Xác nhận',
    description: 'Chọn dịch vụ, khung giờ và kỹ thuật viên. Xem rõ phương án trước khi bắt đầu sửa.',
    Icon: Wrench,
  },
  {
    title: 'Việc sửa xong.',
    accent: 'Vẫn có người hỗ trợ.',
    kicker: 'Chăm nhà sau bàn giao',
    tag: 'Theo dõi đến bàn giao',
    description: 'Theo dõi tiến trình, kiểm tra công việc và tìm hỗ trợ, bảo hành đúng hạng mục.',
    Icon: ShieldCheck,
  },
];

export default function CustomerOnboardingScreen() {
  const { colors, spacing, fontSize } = useAppTheme();
  const styles = getStyles(colors, spacing, fontSize);
  const navigation = useNavigation<Nav>();
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const slide = CUSTOMER_ONBOARDING_SLIDES[index];
  const isLast = index === CUSTOMER_ONBOARDING_SLIDES.length - 1;
  const SlideIcon = slide.Icon;

  const exitToGuestHome = async () => {
    if (leaving) return;
    setLeaving(true);
    try {
      await markCustomerFirstRunSeen();
    } finally {
      navigation.reset({ index: 0, routes: [{ name: 'CustomerGuestHome' }] });
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.topRow}>
          <View style={styles.brandRow}>
            <Image source={require('../../../assets/icon.png')} style={styles.brandIcon} />
            <Text style={styles.brand}>Fix<Text style={styles.accent}>Home</Text></Text>
          </View>
          <Text style={styles.greeting}>Chào bạn</Text>
        </View>
        <ScrollView style={styles.story} contentContainerStyle={styles.hero} showsVerticalScrollIndicator={false}>
          <View style={styles.illustration}>
            <Image source={CUSTOMER_UI_ARTWORK.homeHero} style={styles.homeScene} resizeMode="contain" accessibilityLabel="Minh họa căn nhà với máy lạnh, máy giặt và góc cây xanh" />
            {index > 0 && <Text style={styles.artNote}>{index === 1 ? 'Xem phương án trước khi sửa' : 'Bạn kiểm tra, bạn xác nhận'}</Text>}
            <View style={styles.artLabel}>
              <SlideIcon size={20} color={colors.primaryStrong} />
              <Text style={styles.artLabelText}>{slide.tag}</Text>
            </View>
          </View>
          <Text style={styles.kicker}>{slide.kicker}</Text>
          <Text style={styles.title} accessibilityRole="header">
            {slide.title}{'\n'}<Text style={styles.accent}>{slide.accent}</Text>
          </Text>
          <Text style={styles.description}>{slide.description}</Text>
        </ScrollView>

        <View style={styles.dots} accessibilityLabel={`Bước ${index + 1} trên 3`}>
          {CUSTOMER_ONBOARDING_SLIDES.map((item, dot) => (
            <TouchableOpacity
              key={item.title}
              style={styles.progressButton}
              accessibilityRole="button"
              accessibilityLabel={`Trang giới thiệu ${dot + 1}`}
              accessibilityState={{ selected: dot === index, disabled: leaving }}
              disabled={leaving}
              onPress={() => setIndex(dot)}
            ><View style={[styles.dot, dot === index ? styles.dotActive : undefined]} /></TouchableOpacity>
          ))}
        </View>

        <View style={styles.footer}>
          <TouchableOpacity style={styles.skipBtn} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Bỏ qua giới thiệu" accessibilityState={{ disabled: leaving, busy: leaving }} disabled={leaving} onPress={() => void exitToGuestHome()}>
            <Text style={styles.skipText}>Bỏ qua</Text>
          </TouchableOpacity>
          {isLast ? (
            <TouchableOpacity
              style={[styles.primaryBtn, leaving && { opacity: 0.7 }]}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Bắt đầu dùng FixHome"
              disabled={leaving}
              onPress={() => void exitToGuestHome()}
            >
              {leaving ? (
                <ActivityIndicator color={colors.surface} size="small" />
              ) : (
                <><Text style={styles.primaryText}>Bắt đầu</Text><ArrowRight size={20} color={colors.surface} /></>
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.primaryBtn}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Tiếp tục bước tiếp theo"
              disabled={leaving}
              onPress={() => setIndex(index + 1)}
            >
              <Text style={styles.primaryText}>Tiếp tục</Text><ArrowRight size={20} color={colors.surface} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const getStyles = (colors: any, spacing: any, fontSize: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm, width: '100%', maxWidth: 480, alignSelf: 'center' },
    topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
    brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    brandIcon: { width: 32, height: 32, borderRadius: 8 },
    brand: { fontSize: fontSize.xxl, fontWeight: '700', color: colors.text, letterSpacing: -1 },
    accent: { color: colors.primaryStrong },
    greeting: { fontSize: fontSize.xs, color: colors.primaryStrong, backgroundColor: colors.primarySoft, padding: 8, borderRadius: 8 },
    story: { flex: 1 },
    hero: { paddingBottom: spacing.md },
    illustration: { height: 265, borderRadius: 28, backgroundColor: colors.primaryTint, marginTop: spacing.lg, marginBottom: spacing.lg, justifyContent: 'center', overflow: 'hidden' },
    homeScene: { width: 285, maxWidth: '94%', height: 210, alignSelf: 'center' },
    artLabel: { position: 'absolute', bottom: 16, left: 16, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, backgroundColor: colors.surface, borderRadius: 12 },
    artLabelText: { fontSize: fontSize.xs, color: colors.primaryDark },
    artNote: { position: 'absolute', top: 16, right: 16, padding: 8, borderRadius: 8, backgroundColor: colors.surface, fontSize: fontSize.xs, color: colors.textSecondary },
    kicker: { fontSize: fontSize.xs, lineHeight: 20, color: colors.primaryDark, marginBottom: 12 },
    skipBtn: { minHeight: 56, minWidth: 72, justifyContent: 'center' },
    skipText: { fontSize: fontSize.sm, color: colors.textSecondary },
    title: { fontSize: fontSize.xxxl, lineHeight: 42, fontWeight: '700', color: colors.text, letterSpacing: -1, marginBottom: spacing.md },
    description: { fontSize: fontSize.sm, lineHeight: 26, color: colors.textSecondary },
    dots: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
    progressButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
    dotActive: { backgroundColor: colors.primaryStrong, width: 30 },
    footer: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, alignItems: 'center' },
    primaryBtn: {
      flexDirection: 'row', gap: 16, paddingHorizontal: 16,
      minWidth: 160, minHeight: 56,
      borderRadius: 16,
      backgroundColor: colors.primaryStrong,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.surface },
  });
