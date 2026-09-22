import { useAppTheme } from '../../constants/theme';
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../types';

export default function CustomerTechFoundScreen() {
  const { colors, spacing, fontSize, isDark } = useAppTheme();
  const styles = getStyles(colors, spacing, fontSize);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtnCircle}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Main Tech Info Card */}
        <View style={styles.techCard}>
          <View style={styles.techHeader}>
            <Image source={{uri: 'https://i.pravatar.cc/150?img=11'}} style={styles.avatarLarge} />
            <View style={styles.techInfo}>
              <Text style={styles.techName}>TRƯƠNG VĂN THẮNG</Text>
              <View style={styles.badgesRow}>
                <View style={styles.ratingBadge}>
                  <Ionicons name="star" size={12} color={colors.warning} />
                  <Text style={styles.ratingText}>4.9</Text>
                </View>
                <View style={styles.dividerV} />
                <View style={styles.verifyBadge}>
                  <Ionicons name="checkmark-circle" size={14} color={colors.primary} />
                  <Text style={styles.verifyText}>Đã xác minh</Text>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statCol}>
              <View style={styles.statIconRow}>
                <Ionicons name="briefcase" size={16} color={colors.primary} />
                <Text style={styles.statVal}>209</Text>
              </View>
              <Text style={styles.statLabel}>Đơn dịch vụ</Text>
            </View>
            <View style={styles.dividerV2} />
            <View style={styles.statCol}>
              <View style={styles.statIconRow}>
                <Ionicons name="checkmark-circle-outline" size={16} color={colors.primary} />
                <Text style={styles.statVal}>100%</Text>
              </View>
              <Text style={styles.statLabel}>Đã hoàn thành</Text>
            </View>
            <View style={styles.dividerV2} />
            <View style={styles.statCol}>
              <View style={styles.statIconRow}>
                <Ionicons name="time-outline" size={16} color={colors.primary} />
                <Text style={styles.statVal}>~15 phút</Text>
              </View>
              <Text style={styles.statLabel}>Phản hồi</Text>
            </View>
          </View>
        </View>

        <View style={styles.dividerH} />

        {/* Reviews Section */}
        <View style={styles.reviewsSection}>
          <View style={styles.sectionHeader}>
            <View style={styles.starCircle}><Ionicons name="star" size={16} color={colors.warning} /></View>
            <Text style={styles.sectionTitle}>Đánh giá khách hàng</Text>
          </View>

          <View style={styles.reviewStatsRow}>
            <View style={styles.overallRating}>
              <Text style={styles.overallScore}>4.9</Text>
              <View style={styles.starsWrap}>
                <Ionicons name="star" size={14} color={colors.warning} />
                <Ionicons name="star" size={14} color={colors.warning} />
                <Ionicons name="star" size={14} color={colors.warning} />
                <Ionicons name="star" size={14} color={colors.warning} />
                <Ionicons name="star" size={14} color={colors.warning} />
              </View>
              <Text style={styles.totalReviewsText}>79 phản hồi</Text>
            </View>
            <View style={styles.barsContainer}>
              <View style={styles.barRow}><Text style={styles.barLabel}>5 <Ionicons name="star" size={10} color={colors.textSecondary} /></Text><View style={styles.barBg}><View style={[styles.barFill, {width: '95%'}]}/></View><Text style={styles.barCount}>76</Text></View>
              <View style={styles.barRow}><Text style={styles.barLabel}>4 <Ionicons name="star" size={10} color={colors.textSecondary} /></Text><View style={styles.barBg}><View style={[styles.barFill, {width: '5%'}]}/></View><Text style={styles.barCount}>1</Text></View>
              <View style={styles.barRow}><Text style={styles.barLabel}>3 <Ionicons name="star" size={10} color={colors.textSecondary} /></Text><View style={styles.barBg}><View style={[styles.barFill, {width: '0%'}]}/></View><Text style={styles.barCount}>0</Text></View>
              <View style={styles.barRow}><Text style={styles.barLabel}>2 <Ionicons name="star" size={10} color={colors.textSecondary} /></Text><View style={styles.barBg}><View style={[styles.barFill, {width: '0%'}]}/></View><Text style={styles.barCount}>0</Text></View>
              <View style={styles.barRow}><Text style={styles.barLabel}>1 <Ionicons name="star" size={10} color={colors.textSecondary} /></Text><View style={styles.barBg}><View style={[styles.barFill, {width: '8%'}]}/></View><Text style={styles.barCount}>2</Text></View>
            </View>
          </View>
        </View>

        <View style={styles.dividerH} />

        <View style={styles.recentReviews}>
          <Text style={styles.recentTitle}>Phản hồi gần đây</Text>
          <View style={{height: 100, backgroundColor: colors.background, borderRadius: 12, marginTop: 16}} />
        </View>
      </ScrollView>

      {/* Floating Bottom Bar */}
      <View style={styles.bottomBar}>
        <View style={styles.bottomBarRow}>
          <View style={styles.priceLeft}>
            <Ionicons name="pricetag-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.priceLabel}>Giá dự kiến</Text>
            <Ionicons name="information-circle-outline" size={14} color={colors.primary} style={{marginLeft: 4}} />
          </View>
          <Text style={styles.priceValue}>230,000đ</Text>
        </View>
        <TouchableOpacity style={styles.bookBtn} onPress={() => navigation.navigate('CustomerTracking')}>
          <Text style={styles.bookBtnText}>Đặt ngay</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const getStyles = (colors: any, spacing: any, fontSize: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: 16, paddingVertical: 12 },
  backBtnCircle: { width: 40, height: 40, justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 120 },
  techCard: { backgroundColor: colors.surface, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: colors.border, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 3 },
  techHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  avatarLarge: { width: 64, height: 64, borderRadius: 32, marginRight: 16 },
  techInfo: { flex: 1 },
  techName: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 8, textTransform: 'uppercase' },
  badgesRow: { flexDirection: 'row', alignItems: 'center' },
  ratingBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  ratingText: { fontSize: 14, fontWeight: '600', color: colors.warning },
  dividerV: { width: 1, height: 12, backgroundColor: '#CBD5E1', marginHorizontal: 12 },
  verifyBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  verifyText: { fontSize: 14, color: colors.textSecondary },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 16, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border, marginBottom: 16 },
  statCol: { flex: 1, alignItems: 'center' },
  statIconRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  statVal: { fontSize: 16, fontWeight: '700', color: colors.text },
  statLabel: { fontSize: 12, color: colors.textSecondary },
  dividerV2: { width: 1, height: 32, backgroundColor: colors.border, marginTop: 4 },
  criteriaBox: { backgroundColor: colors.surface },
  criteriaTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  criteriaIconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#EFF6FF', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: colors.primary },
  criteriaStar: { position: 'absolute', bottom: -4, right: -4, backgroundColor: colors.warning, width: 16, height: 16, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  criteriaTitle: { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 2 },
  criteriaSub: { fontSize: 12, color: colors.primary, fontWeight: '600' },
  progressBarWrap: { marginTop: 4 },
  progressBarBg: { height: 6, backgroundColor: colors.border, borderRadius: 3 },
  progressBarFill: { height: 6, backgroundColor: colors.primary, borderRadius: 3 },
  dividerH: { height: 1, backgroundColor: colors.border, marginVertical: 24 },
  reviewsSection: { paddingHorizontal: 4 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 24 },
  starCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#EFF6FF', justifyContent: 'center', alignItems: 'center' },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  reviewStatsRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 32 },
  overallRating: { width: 120, alignItems: 'center' },
  overallScore: { fontSize: 48, fontWeight: '700', color: colors.text, marginBottom: 4, lineHeight: 56 },
  starsWrap: { flexDirection: 'row', gap: 2, marginBottom: 8 },
  totalReviewsText: { fontSize: 12, color: colors.textSecondary },
  barsContainer: { flex: 1 },
  barRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  barLabel: { width: 32, fontSize: 12, color: colors.textSecondary, flexDirection: 'row', alignItems: 'center' },
  barBg: { flex: 1, height: 6, backgroundColor: colors.border, borderRadius: 3, marginHorizontal: 8 },
  barFill: { height: 6, backgroundColor: colors.primary, borderRadius: 3 },
  barCount: { width: 24, fontSize: 12, color: colors.textSecondary, textAlign: 'right' },
  tagsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  tagItem: { alignItems: 'center', width: '23%', backgroundColor: colors.surface, paddingVertical: 16, borderRadius: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2, borderWidth: 1, borderColor: colors.border },
  tagIconCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  checkMini: { position: 'absolute', bottom: 0, right: 0, backgroundColor: '#10B981', width: 14, height: 14, borderRadius: 7, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.surface },
  tagScore: { fontSize: 12, color: '#10B981', fontWeight: '700', marginBottom: 4 },
  tagLabel: { fontSize: 12, color: colors.textSecondary },
  recentReviews: {},
  recentTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colors.surface, padding: 16, paddingBottom: 32, borderTopWidth: 1, borderTopColor: colors.border },
  bottomBarRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  priceLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  priceLabel: { fontSize: 14, color: colors.textSecondary },
  priceValue: { fontSize: 20, fontWeight: '700', color: colors.primary },
  bookBtn: { backgroundColor: '#3B82F6', paddingVertical: 16, borderRadius: 100, alignItems: 'center' },
  bookBtnText: { color: colors.surface, fontSize: 16, fontWeight: '700' }
});


