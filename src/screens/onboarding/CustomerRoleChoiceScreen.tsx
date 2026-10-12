// src/screens/onboarding/CustomerRoleChoiceScreen.tsx
//
// REAL first-run entry: the customer picks a role before the three Customer
// intro slides. Technician goes to the existing Auth/Login flow. Skip exits to
// the zero-network GuestHome and persists the first-run flag. No API imports,
// no protected CustomerMain mounting or demo state imports.
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Image, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { House, Wrench, ArrowRight } from 'lucide-react-native';
import { useAppTheme } from '../../constants/theme';
import { CUSTOMER_UI_ARTWORK } from '../../constants/customer-artwork';
import type { RootStackParamList } from '../../types';
import { markCustomerFirstRunSeen } from '../../services/customer-first-run';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function CustomerRoleChoiceScreen() {
  const { colors, spacing, fontSize } = useAppTheme();
  const styles = getStyles(colors, spacing, fontSize);
  const navigation = useNavigation<Nav>();
  const [leaving, setLeaving] = useState(false);

  const goGuestHome = async () => {
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
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.brandRow}>
          <Image source={require('../../../assets/icon.png')} style={styles.brandIcon} />
          <Text style={styles.brand}>Fix<Text style={{ color: colors.primaryStrong }}>Home</Text></Text>
        </View>
        <Text style={styles.kicker}>FixHome, cùng một mái nhà</Text>
        <Text style={styles.title} accessibilityRole="header">
          Hôm nay, bạn{'\n'}cần điều gì?
        </Text>
        <Text style={styles.subtitle}>Chọn hành trình phù hợp. Khám phá dịch vụ hoặc đăng nhập để tiếp tục công việc.</Text>

        <TouchableOpacity
          style={styles.roleCard}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Tiếp tục với vai trò khách hàng"
          disabled={leaving}
          accessibilityState={{ disabled: leaving }}
          onPress={() => navigation.navigate('CustomerOnboarding')}
        >
          <View style={styles.iconTile}>
            <House size={24} color={colors.primaryStrong} />
          </View>
          <View style={styles.roleText}>
            <Text style={styles.roleCaption}>Khách hàng</Text>
            <Text style={styles.roleTitle}>Tôi cần sửa chữa</Text>
            <Text style={styles.roleHint}>Đặt dịch vụ và chăm sóc nhà.</Text>
            <View style={styles.roleLink}><Text style={styles.roleLinkText}>Tiếp tục với khách hàng</Text><ArrowRight size={16} color={colors.primaryStrong} /></View>
          </View>
          <Image source={CUSTOMER_UI_ARTWORK.homeHero} style={styles.roleArt} resizeMode="contain" accessible={false} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.roleCard, styles.technicianCard]}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Tiếp tục với vai trò kỹ thuật viên"
          disabled={leaving}
          accessibilityState={{ disabled: leaving }}
          onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Auth' }] })}
        >
          <View style={[styles.iconTile, styles.technicianIcon]}>
            <Wrench size={24} color={colors.surface} />
          </View>
          <View style={styles.roleText}>
            <Text style={[styles.roleCaption, styles.technicianText]}>Kỹ thuật viên</Text>
            <Text style={[styles.roleTitle, styles.technicianText]}>Tôi là kỹ thuật viên</Text>
            <Text style={[styles.roleHint, styles.technicianText]}>Đăng nhập và hoàn thiện hồ sơ để nhận việc.</Text>
            <View style={styles.roleLink}><Text style={[styles.roleLinkText, styles.technicianText]}>Tiếp tục với kỹ thuật viên</Text><ArrowRight size={16} color={colors.surface} /></View>
          </View>
          <Image source={CUSTOMER_UI_ARTWORK.aircon} style={styles.roleArt} resizeMode="contain" accessible={false} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.skipBtn, leaving && { opacity: 0.7 }]}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Bỏ qua giới thiệu"
          disabled={leaving}
          onPress={() => void goGuestHome()}
        >
          {leaving ? (
            <ActivityIndicator color={colors.primaryStrong} size="small" />
          ) : (
            <Text style={styles.skipText}>Khám phá dịch vụ trước</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (colors: any, spacing: any, fontSize: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { flexGrow: 1, padding: spacing.lg, width: '100%', maxWidth: 480, alignSelf: 'center' },
    brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 32 },
    brandIcon: { width: 32, height: 32, borderRadius: 8 },
    brand: { fontSize: fontSize.xxl, fontWeight: '700', color: colors.text, letterSpacing: -1 },
    kicker: { fontSize: fontSize.xs, color: colors.primaryDark, marginBottom: 16 },
    title: { fontSize: fontSize.xxxl, lineHeight: 42, letterSpacing: -1, fontWeight: '700', color: colors.text, marginBottom: 16 },
    subtitle: { fontSize: fontSize.sm, lineHeight: 24, color: colors.textSecondary, marginBottom: spacing.lg },
    roleCard: {
      alignItems: 'flex-start',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.primaryTint,
      borderRadius: 24,
      padding: spacing.lg,
      marginBottom: spacing.md,
      minHeight: 212, overflow: 'hidden',
    },
    iconTile: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: colors.primaryTint,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.md,
    },
    roleText: { zIndex: 1 },
    roleCaption: { fontSize: fontSize.xs, fontWeight: '600', color: colors.primaryDark, marginBottom: 8 },
    roleTitle: { fontSize: fontSize.xl, fontWeight: '700', color: colors.text },
    roleHint: { maxWidth: 188, fontSize: fontSize.sm, lineHeight: 22, color: colors.textSecondary, marginTop: 8 },
    roleLink: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 },
    roleLinkText: { fontSize: fontSize.xs, fontWeight: '600', color: colors.primaryStrong },
    roleArt: { position: 'absolute', width: 150, height: 150, right: -36, bottom: 8 },
    technicianCard: { backgroundColor: colors.text, borderColor: colors.text },
    technicianIcon: { backgroundColor: colors.primaryStrong },
    technicianText: { color: colors.surface },
    skipBtn: {
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: spacing.md,
    },
    skipText: { fontSize: fontSize.sm, color: colors.textSecondary },
  });
