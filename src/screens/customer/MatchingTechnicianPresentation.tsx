import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  cancelAnimation,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import type { TechnicianCandidate } from '../../api/bookings.api';
import { technicianReviewsApi, type TechnicianReview } from '../../api/technician-reviews.api';
import { useAppTheme } from '../../constants/theme';
import { useReduceMotion } from '../../hooks/useReduceMotion';
import { vnDateString } from '../../utils/vn-time';

const numberFormat = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 });
const priceFormat = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 });

function displayName(candidate: TechnicianCandidate): string {
  const name = candidate.fullName?.trim();
  return name || 'Kỹ thuật viên';
}

function displayRating(candidate: TechnicianCandidate): string | null {
  if (!Number.isFinite(candidate.averageRating)
    || candidate.averageRating < 0
    || candidate.averageRating > 5
    || !Number.isInteger(candidate.ratingCount)
    || candidate.ratingCount <= 0) return null;
  return `${numberFormat.format(candidate.averageRating)}/5 · ${candidate.ratingCount} lượt đánh giá`;
}

function displayDistance(candidate: TechnicianCandidate): string | null {
  if (candidate.distanceKm == null || !Number.isFinite(candidate.distanceKm) || candidate.distanceKm < 0) return null;
  return `Khoảng cách tham khảo: ${numberFormat.format(candidate.distanceKm)} km`;
}

function displayExperience(candidate: TechnicianCandidate): string | null {
  if (!Number.isFinite(candidate.yearsExperience) || candidate.yearsExperience <= 0) return null;
  return `${numberFormat.format(candidate.yearsExperience)} năm kinh nghiệm`;
}

function displayListedPrice(candidate: TechnicianCandidate): string | null {
  if (candidate.listedLaborPrice == null
    || !Number.isFinite(candidate.listedLaborPrice)
    || candidate.listedLaborPrice < 0) return null;
  return `${priceFormat.format(candidate.listedLaborPrice)} ₫`;
}

function displayWarranty(candidate: TechnicianCandidate): string | null {
  const warrantyDays = candidate.typicalWarrantyDays;
  if (!Number.isInteger(warrantyDays) || warrantyDays == null || warrantyDays < 0) return null;
  return `${candidate.typicalWarrantyDays} ngày`;
}

function TechnicianAvatar({ candidate, size = 52 }: { candidate: TechnicianCandidate; size?: number }) {
  const [failed, setFailed] = useState(false);
  const avatarUrl = typeof candidate.avatarUrl === 'string' && candidate.avatarUrl.startsWith('https://')
    ? candidate.avatarUrl
    : null;
  const name = displayName(candidate);
  const { colors } = useAppTheme();

  if (avatarUrl && !failed) {
    return (
      <Image
        source={{ uri: avatarUrl }}
        onError={() => setFailed(true)}
        accessibilityLabel={`Ảnh đại diện ${name}`}
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.primarySoft }}
      />
    );
  }

  return (
    <View
      accessibilityLabel={`Ảnh đại diện ${name}`}
      style={[styles.avatarFallback, { width: size, height: size, borderRadius: size / 2, backgroundColor: colors.primarySoft }]}
    >
      <Ionicons name="person-outline" size={Math.round(size * 0.52)} color={colors.primaryStrong} />
    </View>
  );
}

function SkeletonBlock({ style }: { style: object }) {
  const reduceMotion = useReduceMotion(true);
  const opacity = useSharedValue(0.45);
  const { colors } = useAppTheme();
  useEffect(() => {
    if (reduceMotion) {
      cancelAnimation(opacity);
      opacity.value = 0.45;
      return;
    }
    opacity.value = withRepeat(withTiming(0.82, { duration: 650 }), -1, true);
    return () => cancelAnimation(opacity);
  }, [opacity, reduceMotion]);
  const animatedStyle = useAnimatedStyle(() => ({ opacity: reduceMotion ? 0.55 : opacity.value }), [reduceMotion]);

  return <Animated.View style={[styles.skeletonBlock, { backgroundColor: colors.border }, style, animatedStyle]} />;
}

export function MatchingTechnicianSkeleton() {
  const { colors } = useAppTheme();

  return (
    <View
      testID="matching-initial-skeleton"
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Đang tìm kỹ thuật viên phù hợp gần bạn."
      style={styles.skeletonGroup}
    >
      {[0, 1, 2].map((item) => (
        <View key={item} style={[styles.skeletonCard, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <SkeletonBlock style={styles.skeletonAvatar} />
          <View style={styles.skeletonLines}>
            <SkeletonBlock style={styles.skeletonName} />
            <SkeletonBlock style={styles.skeletonLine} />
            <View style={styles.skeletonMeta}>
              <SkeletonBlock style={styles.skeletonChip} />
              <SkeletonBlock style={styles.skeletonChip} />
            </View>
          </View>
        </View>
      ))}
      <Text style={[styles.skeletonCaption, { color: colors.textSecondary }]}>Đang tìm kỹ thuật viên phù hợp gần bạn.</Text>
    </View>
  );
}

export function MatchingTechnicianCard({
  candidate,
  priority,
  selectionDisabled,
  onOpenDetails,
  onToggleSelection,
  entranceIndex = 0,
}: {
  candidate: TechnicianCandidate;
  priority: number;
  selectionDisabled: boolean;
  onOpenDetails: () => void;
  onToggleSelection: () => void;
  entranceIndex?: number;
}) {
  const { colors } = useAppTheme();
  const reduceMotion = useReduceMotion(true);
  const name = displayName(candidate);
  const rating = displayRating(candidate);
  const distance = candidate.distanceKm != null && Number.isFinite(candidate.distanceKm) && candidate.distanceKm >= 0
    ? `${numberFormat.format(candidate.distanceKm)} km`
    : null;

  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeInDown.delay(Math.min(entranceIndex, 4) * 45).duration(220)}
    >
      <View
        testID={`matching-candidate-card-${candidate.userId}`}
        style={[
          styles.candidateCard,
          {
            backgroundColor: colors.surface,
            borderColor: priority ? colors.primary : colors.border,
          },
          priority > 0 && styles.candidateCardSelected,
        ]}
      >
        <TouchableOpacity
          testID={`matching-candidate-details-${candidate.userId}`}
          accessibilityRole="button"
          accessibilityLabel={`Xem chi tiết kỹ thuật viên ${name}`}
          accessibilityHint="Chạm vào thẻ để mở thông tin kỹ thuật viên"
          accessibilityState={{ selected: priority > 0 }}
          onPress={onOpenDetails}
          activeOpacity={0.78}
          style={styles.candidateBody}
        >
          <View style={styles.candidateAvatarWrap}>
            <TechnicianAvatar candidate={candidate} />
            {priority > 0 && (
              <View
                testID={`matching-candidate-priority-${candidate.userId}`}
                style={[styles.priorityBadge, { backgroundColor: colors.primary }]}
              >
                <Text style={styles.priorityBadgeText}>#{priority}</Text>
              </View>
            )}
          </View>
          <View style={styles.candidateInfo}>
            <Text style={[styles.candidateName, { color: colors.text }]}>{name}</Text>
            <Text style={[styles.priorityLabel, { color: priority ? colors.primaryStrong : colors.textSecondary }]}>
              {priority === 1 ? 'Ưu tiên 1 · Mời trước' : priority === 2 ? 'Ưu tiên 2 · Dự phòng' : 'Chạm thẻ để xem thông tin'}
            </Text>
            <View style={styles.candidateMetadata}>
              {rating && (
                <Text style={[styles.metadataText, { color: colors.textSecondary }]}>★ {rating}</Text>
              )}
              {distance && (
                <Text style={[styles.metadataText, { color: colors.textSecondary }]}>• {distance}</Text>
              )}
            </View>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          testID={`matching-candidate-select-${candidate.userId}`}
          accessibilityRole="checkbox"
          accessibilityLabel={`${priority ? 'Bỏ chọn' : 'Chọn'} ${name}`}
          accessibilityState={{ checked: priority > 0, disabled: selectionDisabled }}
          disabled={selectionDisabled}
          onPress={onToggleSelection}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={[
            styles.selectControl,
            {
              borderColor: priority ? colors.primary : colors.border,
              backgroundColor: priority ? colors.primary : colors.surface,
            },
            selectionDisabled && { opacity: 0.45 },
          ]}
        >
          {priority > 0 && <Ionicons name="checkmark" size={15} color="#FFFFFF" />}
          <Text style={[styles.selectText, { color: priority ? '#FFFFFF' : colors.primaryStrong }]}>
            {priority ? `#${priority}` : 'Chọn'}
          </Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

export function MatchingTechnicianDetailSheet({
  candidate,
  priority,
  selectionDisabled,
  onToggleSelection,
  onClose,
}: {
  candidate: TechnicianCandidate | null;
  priority: number;
  selectionDisabled: boolean;
  onToggleSelection: () => void;
  onClose: () => void;
}) {
  const { colors } = useAppTheme();
  const name = candidate ? displayName(candidate) : '';
  const rating = candidate ? displayRating(candidate) : null;
  const distance = candidate ? displayDistance(candidate) : null;
  const experience = candidate ? displayExperience(candidate) : null;
  const listedPrice = candidate ? displayListedPrice(candidate) : null;
  const warranty = candidate ? displayWarranty(candidate) : null;
  const bio = candidate?.bio?.trim() || null;
  const completedOrders = candidate
    && Number.isInteger(candidate.completedOrdersCount)
    && (candidate.completedOrdersCount ?? -1) >= 0
    ? candidate.completedOrdersCount
    : null;
  const completionRate = candidate
    && completedOrders != null
    && completedOrders > 0
    && Number.isFinite(candidate.completionRate)
    && (candidate.completionRate ?? -1) >= 0
    && (candidate.completionRate ?? 101) <= 100
    ? candidate.completionRate
    : null;

  const [reviewState, setReviewState] = useState<{
    ownerId: string | null;
    status: 'idle' | 'loading' | 'loaded' | 'error';
    data: TechnicianReview[];
    total: number;
  }>({ ownerId: null, status: 'idle', data: [], total: 0 });
  const reviewRequestId = useRef(0);
  const activeReviewState = reviewState.ownerId === (candidate?.userId ?? null)
    ? reviewState
    : {
        ownerId: candidate?.userId ?? null,
        status: candidate ? 'loading' as const : 'idle' as const,
        data: [] as TechnicianReview[],
        total: 0,
      };
  const reviews = activeReviewState.data;
  const reviewsTotal = activeReviewState.total;
  const reviewsLoading = activeReviewState.status === 'loading';
  const reviewsError = activeReviewState.status === 'error'
    ? 'Không thể tải đánh giá lúc này.'
    : null;

  const retryReviews = useCallback(() => {
    const technicianUserId = candidate?.userId;
    if (!technicianUserId) return;
    const requestId = ++reviewRequestId.current;
    setReviewState({
      ownerId: technicianUserId,
      status: 'loading',
      data: [],
      total: 0,
    });
    void technicianReviewsApi.listByTechnician(technicianUserId, 1, 20).then(
      (result) => {
        if (requestId !== reviewRequestId.current) return;
        setReviewState({
          ownerId: technicianUserId,
          status: 'loaded',
          data: result.data,
          total: result.total,
        });
      },
      () => {
        if (requestId !== reviewRequestId.current) return;
        setReviewState({
          ownerId: technicianUserId,
          status: 'error',
          data: [],
          total: 0,
        });
      },
    );
  }, [candidate?.userId]);

  useEffect(() => {
    const technicianUserId = candidate?.userId;
    const requestId = ++reviewRequestId.current;
    if (!technicianUserId) {
      return () => {
        reviewRequestId.current += 1;
      };
    }

    void technicianReviewsApi.listByTechnician(technicianUserId, 1, 20).then(
      (result) => {
        if (requestId !== reviewRequestId.current) return;
        setReviewState({
          ownerId: technicianUserId,
          status: 'loaded',
          data: result.data,
          total: result.total,
        });
      },
      () => {
        if (requestId !== reviewRequestId.current) return;
        setReviewState({
          ownerId: technicianUserId,
          status: 'error',
          data: [],
          total: 0,
        });
      },
    );

    return () => {
      reviewRequestId.current += 1;
    };
  }, [candidate?.userId]);

  return (
    <Modal
      visible={candidate != null}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.detailModalRoot}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Đóng thông tin kỹ thuật viên"
          style={styles.detailBackdrop}
          onPress={onClose}
        />
        {candidate && (
          <View testID="matching-technician-detail" style={[styles.detailSheet, { backgroundColor: colors.surface }]}>
            <View style={[styles.detailHandle, { backgroundColor: colors.border }]} />
            <ScrollView
              contentContainerStyle={styles.detailContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.detailHeader}>
                <View style={styles.candidateAvatarWrap}>
                  <TechnicianAvatar candidate={candidate} size={64} />
                  {priority > 0 && (
                    <View testID="matching-detail-priority" style={[styles.priorityBadge, { backgroundColor: colors.primary }]}>
                      <Text style={styles.priorityBadgeText}>#{priority}</Text>
                    </View>
                  )}
                </View>
                <View style={styles.detailTitleGroup}>
                  <Text style={[styles.detailTitle, { color: colors.text }]}>Thông tin kỹ thuật viên</Text>
                  <Text style={[styles.candidateName, { color: colors.text }]}>{name}</Text>
                  <Text style={[styles.availability, { color: colors.success }]}>
                    {candidate.isAvailable ? 'Có thể nhận lời mời' : 'Hiện chưa thể nhận lời mời'}
                  </Text>
                </View>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Đóng thông tin kỹ thuật viên" onPress={onClose} hitSlop={12}>
                  <Ionicons name="close" size={22} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <View style={styles.metricGrid}>
                {rating && (
                  <View style={[styles.metricCard, { borderColor: colors.border, backgroundColor: colors.background }]}>
                    <Text style={[styles.metricValue, { color: colors.text }]}>
                      {numberFormat.format(candidate.averageRating)} ★
                    </Text>
                    <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>
                      {candidate.ratingCount} lượt đánh giá
                    </Text>
                  </View>
                )}
                {completedOrders != null && (
                  <View style={[styles.metricCard, { borderColor: colors.border, backgroundColor: colors.background }]}>
                    <Text style={[styles.metricValue, { color: colors.text }]}>{completedOrders}</Text>
                    <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Đơn đã hoàn tất</Text>
                  </View>
                )}
                {completionRate != null && (
                  <View style={[styles.metricCard, { borderColor: colors.border, backgroundColor: colors.background }]}>
                    <Text style={[styles.metricValue, { color: colors.text }]}>
                      {numberFormat.format(completionRate)}%
                    </Text>
                    <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Tỷ lệ hoàn tất</Text>
                  </View>
                )}
              </View>

              {bio && (
                <View style={[styles.bioCard, { borderColor: colors.border, backgroundColor: colors.background }]}>
                  <View style={styles.sectionTitleRow}>
                    <Ionicons name="person-circle-outline" size={18} color={colors.primaryStrong} />
                    <Text style={[styles.sectionTitle, { color: colors.text }]}>Giới thiệu</Text>
                  </View>
                  <Text style={[styles.bioText, { color: colors.textSecondary }]}>{bio}</Text>
                </View>
              )}

              <View>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Thông tin dịch vụ</Text>
                <View style={[styles.detailCard, { borderColor: colors.border, backgroundColor: colors.background }]}>
                  {distance && candidate.distanceKm != null && <DetailRow label="Khoảng cách tham khảo" value={numberFormat.format(candidate.distanceKm) + ' km'} colors={colors} />}
                  {experience && <DetailRow label="Kinh nghiệm" value={experience} colors={colors} />}
                  {listedPrice && <DetailRow label="Giá công tham khảo" value={listedPrice} colors={colors} />}
                  {warranty && <DetailRow label="Bảo hành tham khảo" value={warranty} colors={colors} />}
                </View>
              </View>

              <View testID="matching-technician-reviews" style={styles.reviewsSection}>
                <View style={styles.sectionHeaderRow}>
                  <View style={styles.sectionTitleRow}>
                    <Ionicons name="star-outline" size={18} color={colors.primaryStrong} />
                    <Text style={[styles.sectionTitle, { color: colors.text }]}>Đánh giá từ khách hàng</Text>
                  </View>
                  {!reviewsLoading && !reviewsError && (
                    <Text style={[styles.reviewCountText, { color: colors.textSecondary }]}>
                      {reviewsTotal} đánh giá
                    </Text>
                  )}
                </View>

                {reviewsLoading ? (
                  <View accessibilityRole="progressbar" accessibilityLabel="Đang tải đánh giá kỹ thuật viên" style={styles.reviewState}>
                    <ActivityIndicator color={colors.primary} />
                    <Text style={[styles.reviewStateText, { color: colors.textSecondary }]}>Đang tải đánh giá…</Text>
                  </View>
                ) : reviewsError ? (
                  <View style={[styles.reviewStateCard, { borderColor: colors.border, backgroundColor: colors.background }]}>
                    <Text style={[styles.reviewStateText, { color: colors.textSecondary }]}>{reviewsError}</Text>
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel="Thử tải lại đánh giá"
                      onPress={retryReviews}
                      style={[styles.retryButton, { borderColor: colors.primary }]}
                    >
                      <Text style={[styles.retryText, { color: colors.primaryStrong }]}>Thử lại</Text>
                    </TouchableOpacity>
                  </View>
                ) : reviews.length === 0 ? (
                  <View style={[styles.reviewStateCard, { borderColor: colors.border, backgroundColor: colors.background }]}>
                    <Text style={[styles.reviewEmptyTitle, { color: colors.text }]}>Chưa có đánh giá nào</Text>
                    <Text style={[styles.reviewStateText, { color: colors.textSecondary }]}>
                      Chưa có nhận xét được ghi nhận cho kỹ thuật viên này.
                    </Text>
                  </View>
                ) : (
                  <View style={styles.reviewList}>
                    {reviews.map((review) => (
                      <View key={review.id} style={[styles.reviewCard, { borderColor: colors.border, backgroundColor: colors.background }]}>
                        <View style={styles.reviewTopRow}>
                          <View style={[styles.reviewAvatar, { backgroundColor: colors.primarySoft }]}>
                            <Text style={[styles.reviewAvatarText, { color: colors.primaryStrong }]}>
                              {(review.customerName || 'K').charAt(0).toUpperCase()}
                            </Text>
                          </View>
                          <View style={styles.reviewIdentity}>
                            <Text style={[styles.reviewCustomer, { color: colors.text }]}>
                              {review.customerName || 'Khách hàng FixHome'}
                            </Text>
                            <Text style={[styles.reviewDate, { color: colors.textSecondary }]}>
                              {vnDateString(review.createdAt)}
                            </Text>
                          </View>
                          <View style={[styles.reviewRatingPill, { borderColor: colors.border }]}>
                            <Text style={[styles.reviewRatingText, { color: colors.text }]}>★ {review.rating}/5</Text>
                          </View>
                        </View>
                        <Text style={[styles.reviewComment, { color: review.comment ? colors.textSecondary : colors.muted }]}>
                          {review.comment || ('Khách hàng đánh giá ' + review.rating + ' sao và không để lại nhận xét.')}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              <TouchableOpacity
                testID="matching-detail-select"
                accessibilityRole="button"
                accessibilityLabel={priority ? 'Bỏ chọn ' + name : 'Chọn ' + name}
                accessibilityState={{ selected: priority > 0, disabled: selectionDisabled }}
                disabled={selectionDisabled}
                onPress={onToggleSelection}
                style={[styles.detailAction, { backgroundColor: selectionDisabled ? colors.border : colors.primary }]}
              >
                <Text style={styles.actionText}>
                  {priority ? 'Bỏ chọn · Ưu tiên ' + priority : selectionDisabled ? 'Đã chọn đủ 2 kỹ thuật viên' : 'Chọn kỹ thuật viên này'}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        )}
      </View>
    </Modal>
  );
}
function DetailRow({ label, value, colors }: { label: string; value: string; colors: ReturnType<typeof useAppTheme>['colors'] }) {
  return (
    <View style={[styles.detailRow, { borderBottomColor: colors.border }]}>
      <Text style={[styles.metadataText, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.detailValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatarFallback: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  skeletonGroup: { gap: 12, marginTop: 4 },
  skeletonCard: { minHeight: 112, padding: 14, borderRadius: 14, borderWidth: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  skeletonBlock: { borderRadius: 8 },
  skeletonAvatar: { width: 48, height: 48, borderRadius: 24 },
  skeletonLines: { flex: 1, gap: 9, paddingTop: 3 },
  skeletonName: { width: '58%', height: 15 },
  skeletonLine: { width: '88%', height: 11 },
  skeletonMeta: { flexDirection: 'row', gap: 8 },
  skeletonChip: { width: 82, height: 20, borderRadius: 10 },
  skeletonCaption: { paddingTop: 4, fontSize: 14, lineHeight: 20, fontWeight: '500' },
  candidateCard: {
    minHeight: 94,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  candidateCardSelected: { borderWidth: 2 },
  candidateBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 11, minHeight: 68 },
  candidateAvatarWrap: { position: 'relative' },
  priorityBadge: {
    position: 'absolute',
    top: -6,
    right: -7,
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  priorityBadgeText: { color: '#FFFFFF', fontSize: 10, lineHeight: 12, fontWeight: '900' },
  candidateInfo: { flex: 1, gap: 3 },
  candidateName: { fontSize: 16, lineHeight: 21, fontWeight: '700' },
  priorityLabel: { fontSize: 12, lineHeight: 17, fontWeight: '600' },
  candidateMetadata: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingTop: 1 },
  metadataText: { fontSize: 12, lineHeight: 17 },
  selectControl: {
    minWidth: 62,
    minHeight: 36,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  selectText: { fontSize: 13, lineHeight: 18, fontWeight: '800' },
  detailModalRoot: { flex: 1, justifyContent: 'flex-end' },
  detailBackdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(15, 23, 42, 0.45)' },
  detailSheet: {
    maxHeight: '78%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
    elevation: 16,
  },
  detailHandle: { width: 42, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 10 },
  detailContent: { padding: 20, paddingTop: 14, paddingBottom: 30, gap: 18 },
  detailHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  detailTitleGroup: { flex: 1, gap: 3 },
  detailTitle: { fontSize: 20, lineHeight: 28, fontWeight: '700' },
  availability: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  detailCard: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14 },
  detailRow: { minHeight: 54, borderBottomWidth: StyleSheet.hairlineWidth, justifyContent: 'center', gap: 2 },
  detailValue: { fontSize: 16, lineHeight: 23, fontWeight: '600' },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metricCard: { minWidth: '30%', flexGrow: 1, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 12, gap: 2 },
  metricValue: { fontSize: 18, lineHeight: 24, fontWeight: '800' },
  metricLabel: { fontSize: 11, lineHeight: 16, fontWeight: '600' },
  bioCard: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 8 },
  bioText: { fontSize: 13, lineHeight: 20 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  sectionTitle: { fontSize: 15, lineHeight: 21, fontWeight: '800', marginBottom: 8 },
  reviewCountText: { fontSize: 12, lineHeight: 17, fontWeight: '600' },
  reviewsSection: { gap: 10 },
  reviewState: { minHeight: 84, alignItems: 'center', justifyContent: 'center', gap: 8 },
  reviewStateCard: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 9, alignItems: 'flex-start' },
  reviewStateText: { fontSize: 12, lineHeight: 18 },
  reviewEmptyTitle: { fontSize: 13, lineHeight: 18, fontWeight: '800' },
  retryButton: { minHeight: 36, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  retryText: { fontSize: 12, lineHeight: 17, fontWeight: '800' },
  reviewList: { gap: 10 },
  reviewCard: { borderWidth: 1, borderRadius: 14, padding: 13, gap: 9 },
  reviewTopRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  reviewAvatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  reviewAvatarText: { fontSize: 13, lineHeight: 17, fontWeight: '800' },
  reviewIdentity: { flex: 1, gap: 1 },
  reviewCustomer: { fontSize: 13, lineHeight: 18, fontWeight: '700' },
  reviewDate: { fontSize: 10, lineHeight: 14 },
  reviewRatingPill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  reviewRatingText: { fontSize: 11, lineHeight: 15, fontWeight: '800' },
  reviewComment: { fontSize: 12, lineHeight: 19 },
  detailAction: { minHeight: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16 },
  actionText: { color: '#FFFFFF', fontSize: 15, lineHeight: 22, fontWeight: '700', textAlign: 'center' },
});
