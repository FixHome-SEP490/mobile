import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertTriangle, ChevronLeft, ChevronRight, MessageSquareOff, Star } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../types';
import { useAppTheme } from '../../constants/theme';
import { reviewsApi, type TechnicianReview } from '../../api/reviews.api';
import { technicianProfileApi, type TechnicianProfile } from '../../api/technician-profile.api';
import CustomerSkeleton from '../../components/customer/CustomerSkeleton';
import {
  mergeReviewPage,
  parseReviewComment,
  reviewOrderLine,
  starDistribution,
} from './technician-reviews';

import { vnDateString } from '../../utils/vn-time';

const VN_DATE = { day: '2-digit', month: '2-digit', year: 'numeric' } as const;
const PAGE_SIZE = 20;
const LOAD_ERROR = 'Không thể tải đánh giá. Kiểm tra kết nối rồi thử lại.';

function Stars({ value, size, color, empty }: { value: number; size: number; color: string; empty: string }) {
  return (
    <View style={styles.starsRow} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={size}
          color={n <= Math.round(value) ? color : empty}
          fill={n <= Math.round(value) ? color : 'transparent'}
          strokeWidth={1.75}
        />
      ))}
    </View>
  );
}

export default function TechnicianReviewsScreen() {
  const { colors, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [reviews, setReviews] = useState<TechnicianReview[]>([]);
  const [total, setTotal] = useState(0);
  const [profile, setProfile] = useState<TechnicianProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const pageRef = useRef(1);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const loadFirstPage = useCallback(async () => {
    try {
      const [page, mine] = await Promise.all([
        reviewsApi.getMine(1, PAGE_SIZE),
        technicianProfileApi.getMyProfile().catch(() => null),
      ]);
      if (!aliveRef.current) return;
      pageRef.current = 1;
      setReviews(page.data);
      setTotal(page.total);
      setProfile(mine);
      setLoadError(false);
    } catch {
      // A failed load is not "no reviews": keep the last list and offer a retry.
      if (aliveRef.current) setLoadError(true);
    } finally {
      if (aliveRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount, guarded by aliveRef
    void loadFirstPage();
  }, [loadFirstPage]);

  const onRefresh = () => {
    setRefreshing(true);
    void loadFirstPage();
  };

  const onEndReached = async () => {
    if (loading || refreshing || loadingMore || reviews.length >= total) return;
    setLoadingMore(true);
    try {
      const next = pageRef.current + 1;
      const page = await reviewsApi.getMine(next, PAGE_SIZE);
      if (!aliveRef.current) return;
      pageRef.current = next;
      setReviews((prev) => mergeReviewPage(prev, page.data));
      setTotal(page.total);
    } catch {
      // Keep what is loaded; reaching the end again retries.
    } finally {
      if (aliveRef.current) setLoadingMore(false);
    }
  };

  const distribution = useMemo(() => starDistribution(reviews), [reviews]);
  const styles2 = getStyles(colors);
  const average = profile?.averageRating;

  const header = (
    <View style={styles2.summary}>
      <View style={styles2.summaryTop}>
        <Text style={styles2.average}>{typeof average === 'number' ? average.toFixed(2).replace('.', ',') : '—'}</Text>
        <View style={styles2.flex1}>
          <Stars value={average ?? 0} size={20} color={colors.tone.warning.fg} empty={colors.border} />
          <Text style={styles2.caption}>{total} đánh giá</Text>
        </View>
      </View>
      {distribution.map((row) => (
        <View key={row.star} style={styles2.distRow} accessible accessibilityLabel={`${row.star} sao: ${row.count} đánh giá`}>
          <Text style={styles2.distLabel}>{row.star}</Text>
          <Star size={12} color={colors.tone.warning.fg} fill={colors.tone.warning.fg} strokeWidth={1.75} />
          <View style={styles2.distTrack}>
            <View style={[styles2.distFill, { width: `${row.percent}%` }]} />
          </View>
          <Text style={styles2.distCount}>{row.count}</Text>
        </View>
      ))}
      {reviews.length < total && (
        <Text style={styles2.caption}>Phân bố tính trên {reviews.length}/{total} đánh giá đã tải.</Text>
      )}
    </View>
  );

  const renderItem = ({ item }: { item: TechnicianReview }) => {
    const { tags, text } = parseReviewComment(item.comment);
    const orderLine = reviewOrderLine(item);
    return (
      <View style={styles2.card}>
        <View style={styles2.rowBetween}>
          <Stars value={item.rating} size={16} color={colors.tone.warning.fg} empty={colors.border} />
          <Text style={styles2.caption}>{vnDateString(item.createdAt, VN_DATE)}</Text>
        </View>
        <Text style={styles2.customer} accessibilityLabel={`${item.rating} sao từ ${item.customerName}`}>
          {item.customerName || 'Khách hàng FixHome'}
        </Text>
        {tags.length > 0 && (
          <View style={styles2.tagRow}>
            {tags.map((tag) => (
              <View key={tag} style={styles2.tag}>
                <Text style={styles2.tagText}>{tag}</Text>
              </View>
            ))}
          </View>
        )}
        {!!text && <Text style={styles2.body}>{text}</Text>}
        {!!orderLine && (
          <TouchableOpacity
            style={styles2.orderLink}
            onPress={() => navigation.navigate('TechnicianOrderDetail', { serviceOrderId: item.serviceOrderId })}
            accessibilityRole="button"
            accessibilityLabel={`Xem chi tiết công việc. ${orderLine}`}
          >
            <Text style={styles2.orderLinkText} numberOfLines={1}>{orderLine}</Text>
            <ChevronRight size={18} color={colors.primaryStrong} strokeWidth={1.75} />
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const empty = loadError ? (
    <View style={styles2.empty}>
      <AlertTriangle size={48} color={colors.error} strokeWidth={1.5} />
      <Text style={styles2.emptyTitle}>Không thể tải đánh giá</Text>
      <Text style={styles2.emptyDesc}>{LOAD_ERROR}</Text>
      <TouchableOpacity style={styles2.textBtn} onPress={onRefresh} accessibilityRole="button">
        <Text style={styles2.textBtnLabel}>Thử lại</Text>
      </TouchableOpacity>
    </View>
  ) : (
    <View style={styles2.empty}>
      <MessageSquareOff size={56} color={colors.muted} strokeWidth={1.5} />
      <Text style={styles2.emptyTitle}>Chưa có đánh giá nào</Text>
      <Text style={styles2.emptyDesc}>Đánh giá của khách hàng sau khi hoàn thành đơn sẽ hiển thị tại đây.</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles2.container} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.surface} />
      <View style={styles2.header}>
        <TouchableOpacity
          style={styles2.backBtn}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Quay lại"
        >
          <ChevronLeft size={26} color={colors.text} strokeWidth={1.75} />
        </TouchableOpacity>
        <Text style={styles2.headerTitle} accessibilityRole="header">Đánh giá từ khách hàng</Text>
        <View style={styles2.backBtn} />
      </View>

      {loading ? (
        <View style={styles2.skeletonWrap}>
          <CustomerSkeleton variant="notification" />
        </View>
      ) : (
        <FlatList
          data={reviews}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ListHeaderComponent={reviews.length > 0 ? header : null}
          ListEmptyComponent={empty}
          ListFooterComponent={loadingMore ? <ActivityIndicator style={styles2.footer} color={colors.primaryStrong} /> : null}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primaryStrong]} />}
          contentContainerStyle={[
            styles2.listContent,
            reviews.length === 0 && styles2.emptyFlex,
            { paddingBottom: 32 + Math.max(insets.bottom, 16) },
          ]}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  starsRow: { flexDirection: 'row', gap: 2 },
});

const getStyles = (colors: ReturnType<typeof useAppTheme>['colors']) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex1: { flex: 1, gap: 4 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: 4, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.divider },
  backBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 20, lineHeight: 28, fontWeight: '600', color: colors.text },
  skeletonWrap: { flex: 1, padding: 16 },
  listContent: { padding: 16, gap: 12 },
  emptyFlex: { flexGrow: 1 },
  footer: { paddingVertical: 16 },
  summary: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 8 },
  summaryTop: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 4 },
  average: { fontSize: 32, lineHeight: 40, fontWeight: '700', color: colors.text },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500', color: colors.textSecondary },
  distRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  distLabel: { width: 12, fontSize: 12, lineHeight: 16, color: colors.textSecondary, textAlign: 'right' },
  distTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.divider, overflow: 'hidden' },
  distFill: { height: '100%', borderRadius: 4, backgroundColor: colors.tone.warning.fg },
  distCount: { width: 28, fontSize: 12, lineHeight: 16, color: colors.textSecondary, textAlign: 'right' },
  card: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 8 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  customer: { fontSize: 16, lineHeight: 24, fontWeight: '600', color: colors.text },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { minHeight: 24, justifyContent: 'center', paddingHorizontal: 8, borderRadius: 8, backgroundColor: colors.tone.repair.bg },
  tagText: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: colors.tone.repair.text },
  body: { fontSize: 14, lineHeight: 20, color: colors.text },
  orderLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 44, borderTopWidth: 1, borderTopColor: colors.divider, marginTop: 4 },
  orderLinkText: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.primaryStrong },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  emptyTitle: { fontSize: 18, lineHeight: 26, fontWeight: '700', color: colors.text, marginTop: 8 },
  emptyDesc: { fontSize: 14, lineHeight: 20, color: colors.textSecondary, textAlign: 'center' },
  textBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16 },
  textBtnLabel: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.primaryStrong },
});
