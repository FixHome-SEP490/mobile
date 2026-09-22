import { useAppTheme } from '../../constants/theme';
import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, ScrollView, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../types';

export default function CustomerCompletedScreen() {
  const { colors, spacing, fontSize, isDark } = useAppTheme();
  const styles = getStyles(colors, spacing, fontSize);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.navigate('CustomerMain')} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Hoàn thành</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Hoàn thành</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.successArea}>
          <View style={styles.successCircle}>
            <Ionicons name="checkmark-circle" size={40} color={colors.success} />
          </View>
          <Text style={styles.successTitle}>Công việc đã hoàn tất</Text>
          <Text style={styles.successDesc}>Kỹ thuật viên đã cập nhật hình ảnh và các bước hoàn tất.</Text>
        </View>

        <View style={styles.evidenceRow}>
          <View style={styles.evidenceBox}>
            <Ionicons name="camera" size={24} color={colors.primary} />
          </View>
          <View style={styles.evidenceBox}>
            <Ionicons name="camera" size={24} color={colors.primary} />
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.quoteRow}>
            <Text style={styles.quoteLabel}>Giá dịch vụ</Text>
            <Text style={styles.quoteValue}>150.000đ</Text>
          </View>
          <View style={styles.quoteRow}>
            <Text style={styles.quoteLabel}>Phát sinh đã duyệt</Text>
            <Text style={styles.quoteValue}>250.000đ</Text>
          </View>
          <View style={styles.quoteRow}>
            <Text style={styles.quoteLabel}>Voucher</Text>
            <Text style={[styles.quoteValue, { color: colors.success }]}>-50.000đ</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.quoteRowTotal}>
            <Text style={styles.totalLabel}>Tổng thanh toán</Text>
            <Text style={styles.totalValue}>350.000đ</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Thanh toán</Text>
        <TouchableOpacity style={styles.paymentCard}>
          <Ionicons name="card" size={24} color={colors.textSecondary} />
          <View style={styles.paymentContent}>
            <Text style={styles.paymentTitle}>Ví / thẻ đã liên kết</Text>
            <Text style={styles.paymentDesc}>•••• 9210 · mặc định</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.primaryBtn} onPress={() => navigation.navigate('CustomerReview')}>
          <Text style={styles.primaryBtnText}>Thanh toán 350.000đ</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (colors: any, spacing: any, fontSize: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: colors.text, flex: 1 },
  badge: { backgroundColor: '#DCFCE7', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  badgeText: { color: colors.success, fontSize: 10, fontWeight: '700' },
  content: { padding: 16 },
  successArea: { alignItems: 'center', paddingVertical: 24 },
  successCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#DCFCE7', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  successTitle: { fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: 8 },
  successDesc: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', paddingHorizontal: 16 },
  evidenceRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  evidenceBox: { flex: 1, height: 100, backgroundColor: colors.border, borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#CBD5E1', borderStyle: 'dashed' },
  card: { backgroundColor: colors.surface, borderRadius: 16, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: colors.border },
  quoteRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  quoteLabel: { fontSize: 14, color: colors.textSecondary },
  quoteValue: { fontSize: 14, fontWeight: '700', color: colors.text },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 12 },
  quoteRowTotal: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { fontSize: 16, fontWeight: '700', color: colors.text },
  totalValue: { fontSize: 18, fontWeight: '700', color: colors.primary },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 12 },
  paymentCard: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 16, padding: 16, alignItems: 'center', marginBottom: 24, borderWidth: 1, borderColor: colors.border },
  paymentContent: { flex: 1, marginLeft: 12 },
  paymentTitle: { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 4 },
  paymentDesc: { fontSize: 12, color: colors.textSecondary },
  primaryBtn: { backgroundColor: colors.primary, paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  primaryBtnText: { color: colors.surface, fontSize: 16, fontWeight: '700' }
});


