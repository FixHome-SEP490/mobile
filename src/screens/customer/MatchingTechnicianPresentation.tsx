import React, { useEffect, useState } from 'react';
import {
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import Animated, {
  cancelAnimation,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import type { TechnicianCandidate } from '../../api/bookings.api';
import { useAppTheme } from '../../constants/theme';
import { useReduceMotion } from '../../hooks/useReduceMotion';

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
      <View style={[
        styles.candidateCard,
        { backgroundColor: colors.surface, borderColor: priority ? colors.primary : colors.border },
      ]}>
        <TouchableOpacity
          testID={`matching-candidate-details-${candidate.userId}`}
          accessibilityRole="button"
          accessibilityLabel={`Xem chi tiết kỹ thuật viên ${name}`}
          accessibilityHint="Mở thông tin kỹ thuật viên an toàn cho khách hàng"
          accessibilityState={{ selected: priority > 0 }}
          onPress={onOpenDetails}
          style={styles.candidateBody}
        >
          <TechnicianAvatar candidate={candidate} />
          <View style={styles.candidateInfo}>
            <Text style={[styles.candidateName, { color: colors.text }]}>{name}</Text>
            <Text style={[styles.priorityLabel, { color: priority ? colors.primaryStrong : colors.textSecondary }]}>
              {priority === 1 ? 'Ưu tiên 1 · Mời trước' : priority === 2 ? 'Ưu tiên 2 · Dự phòng' : 'Chạm để xem thông tin'}
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
          <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity
          testID={`matching-candidate-select-${candidate.userId}`}
          accessibilityRole="checkbox"
          accessibilityLabel={`${priority ? 'Bỏ chọn' : 'Chọn'} ${name}`}
          accessibilityState={{ checked: priority > 0, disabled: selectionDisabled }}
          disabled={selectionDisabled}
          onPress={onToggleSelection}
          style={[
            styles.selectControl,
            { borderColor: priority ? colors.primary : colors.border, backgroundColor: priority ? colors.primarySoft : colors.surface },
            selectionDisabled && { opacity: 0.55 },
          ]}
        >
          <Ionicons name={priority ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={priority ? colors.primaryStrong : colors.textSecondary} />
          <Text style={[styles.selectText, { color: colors.text }]}>{priority ? 'Đã chọn' : 'Chọn'}</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

export function MatchingTechnicianDetailSheet({
  modalRef,
  candidate,
  priority,
  selectionDisabled,
  onToggleSelection,
  onClose,
}: {
  modalRef: React.RefObject<BottomSheetModal | null>;
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

  return (
    <BottomSheetModal
      ref={modalRef}
      snapPoints={['64%', '88%']}
      enableDynamicSizing={false}
      onDismiss={onClose}
      backdropComponent={(props) => (
        <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.42} pressBehavior="close" />
      )}
    >
      {candidate && (
        <BottomSheetScrollView
          testID="matching-technician-detail"
          contentContainerStyle={[styles.detailContent, { backgroundColor: colors.surface }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.detailHeader}>
            <TechnicianAvatar candidate={candidate} size={64} />
            <View style={styles.detailTitleGroup}>
              <Text style={[styles.detailTitle, { color: colors.text }]}>Thông tin kỹ thuật viên</Text>
              <Text style={[styles.candidateName, { color: colors.text }]}>{name}</Text>
              <Text style={[styles.availability, { color: colors.success }]}>Có thể nhận lời mời</Text>
            </View>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Đóng thông tin kỹ thuật viên" onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <View style={[styles.detailCard, { borderColor: colors.border, backgroundColor: colors.background }]}>
            {rating && <DetailRow label="Đánh giá" value={rating} colors={colors} />}
            {distance && candidate.distanceKm != null && <DetailRow label="Khoảng cách tham khảo" value={`${numberFormat.format(candidate.distanceKm)} km`} colors={colors} />}
            {experience && <DetailRow label="Kinh nghiệm" value={experience} colors={colors} />}
            {listedPrice && <DetailRow label="Giá niêm yết" value={listedPrice} colors={colors} />}
            {warranty && <DetailRow label="Bảo hành tham khảo" value={warranty} colors={colors} />}
          </View>
          <TouchableOpacity
            testID="matching-detail-select"
            accessibilityRole="button"
            accessibilityLabel={priority ? `Bỏ chọn ${name}` : `Chọn ${name}`}
            accessibilityState={{ selected: priority > 0, disabled: selectionDisabled }}
            disabled={selectionDisabled}
            onPress={onToggleSelection}
            style={[styles.detailAction, { backgroundColor: selectionDisabled ? colors.border : colors.primary }]}
          >
            <Text style={styles.actionText}>
              {priority ? `Bỏ chọn · Ưu tiên ${priority}` : selectionDisabled ? 'Đã chọn đủ 2 kỹ thuật viên' : 'Chọn kỹ thuật viên này'}
            </Text>
          </TouchableOpacity>
        </BottomSheetScrollView>
      )}
    </BottomSheetModal>
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
  candidateCard: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 8 },
  candidateBody: { flexDirection: 'row', alignItems: 'center', gap: 11, minHeight: 52 },
  candidateInfo: { flex: 1, gap: 3 },
  candidateName: { fontSize: 16, lineHeight: 21, fontWeight: '700' },
  priorityLabel: { fontSize: 12, lineHeight: 17, fontWeight: '600' },
  candidateMetadata: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingTop: 1 },
  metadataText: { fontSize: 12, lineHeight: 17 },
  selectControl: { minHeight: 36, borderWidth: 1, borderRadius: 18, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, alignSelf: 'flex-end' },
  selectText: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  detailContent: { flexGrow: 1, padding: 20, paddingBottom: 30, gap: 18 },
  detailHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  detailTitleGroup: { flex: 1, gap: 3 },
  detailTitle: { fontSize: 20, lineHeight: 28, fontWeight: '700' },
  availability: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  detailCard: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14 },
  detailRow: { minHeight: 54, borderBottomWidth: StyleSheet.hairlineWidth, justifyContent: 'center', gap: 2 },
  detailValue: { fontSize: 16, lineHeight: 23, fontWeight: '600' },
  detailAction: { minHeight: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16 },
  actionText: { color: '#FFFFFF', fontSize: 15, lineHeight: 22, fontWeight: '700', textAlign: 'center' },
});
