import React, { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import type { TechnicianWarrantyClaim } from '../../../api/technician-warranty.api';
import { useWarrantyClaims } from '../../../hooks/useWarrantyClaims';
import { lightTheme as colors } from '../../../constants/theme';
import { vnDateString } from '../../../utils/vn-time';
import { claimsOfFilter, filterCounts, nextWarrantyStep, technicianClaimLabel, warrantyFilters, type WarrantyFilter, type WarrantyTone } from './technician-warranty-groups';

const toneColors: Record<WarrantyTone, { bg: string; text: string }> = {
  info: colors.tone.info, warning: colors.tone.warning, repair: colors.tone.repair, success: colors.tone.success, neutral: colors.tone.neutral,
};

/** One claim, like a row of the web page: what and where first, what the customer said, then the next step. */
export function WarrantyClaimRow({ claim, onOpen }: { claim: TechnicianWarrantyClaim; onOpen: () => void }) {
  const status = technicianClaimLabel(claim);
  const next = nextWarrantyStep(claim);
  const tone = toneColors[status.tone];
  return <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Bảo hành #${claim.order.code}, ${status.label}`} activeOpacity={0.85} onPress={onOpen} style={styles.card} testID={`warranty-claim-${claim.id}`}>
    <View style={styles.metaLine}>
      <Text style={styles.code}>#{claim.order.code}</Text>
      <View style={[styles.pill, { backgroundColor: tone.bg }]}><Text style={[styles.pillText, { color: tone.text }]}>{status.label}</Text></View>
      {claim.submittedAfterExpiry ? <View style={[styles.pill, { backgroundColor: colors.tone.warning.bg }]}><Text style={[styles.pillText, { color: colors.tone.warning.text }]}>Gửi sau hạn</Text></View> : null}
      <Text style={styles.date}>{vnDateString(claim.submittedAt)}</Text>
    </View>
    <Text style={styles.title}>{claim.order.serviceName || 'Bảo hành dịch vụ'}</Text>
    <View style={styles.infoLine}><Ionicons name="person-outline" size={15} color={colors.textSecondary} /><Text style={styles.infoText}>{claim.order.customerName}{claim.order.customerPhone ? `  ${claim.order.customerPhone}` : ''}</Text></View>
    <View style={styles.infoLine}><Ionicons name="location-outline" size={15} color={colors.textSecondary} /><Text style={styles.infoMuted}>{claim.order.addressSummary}</Text></View>
    <View style={styles.said}>
      <Text style={styles.saidLabel}>Khách mô tả</Text>
      <Text style={styles.saidText} numberOfLines={2}>{claim.description}</Text>
    </View>
    {next ? <View style={styles.actions}>
      <View style={styles.primary}><Text style={styles.primaryText}>{next.label}</Text><Ionicons name="chevron-forward" size={16} color="#FFFFFF" /></View>
    </View> : <View style={styles.actions}><Text style={styles.more}>Xem chi tiết</Text><Ionicons name="chevron-forward" size={16} color={colors.textSecondary} /></View>}
  </TouchableOpacity>;
}

/** The warranty part of the Jobs tab: pills for the three groups, a card per claim, paged and pull to refresh. */
export function TechnicianWarrantyList({ search = '' }: { search?: string }) {
  const navigation = useNavigation<any>();
  const { items, loading, refreshing, loadingMore, error, load, refresh, loadMore } = useWarrantyClaims();
  const [filter, setFilter] = useState<WarrantyFilter>('all');
  const counts = useMemo(() => filterCounts(items), [items]);
  const needle = search.trim().toLowerCase();
  const rows = useMemo(() => claimsOfFilter(items, filter).filter(claim => !needle || claim.order.code.toLowerCase().includes(needle)), [items, filter, needle]);
  const open = (claim: TechnicianWarrantyClaim) => navigation.navigate('TechnicianWarrantyTask', { claimId: claim.id });

  return <View style={styles.wrap}>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.chipRow} accessibilityRole="radiogroup" accessibilityLabel="Lọc yêu cầu bảo hành">
      {warrantyFilters.map(({ key, label }) => {
        const active = filter === key;
        return <TouchableOpacity key={key} testID={`warranty-filter-${key}`} accessibilityRole="radio" accessibilityState={{ selected: active }} accessibilityLabel={`${label}, ${counts[key]}`}
          onPress={() => setFilter(key)} style={[styles.chip, active && styles.chipActive]} hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}>
          <Text style={active ? styles.chipTextActive : styles.chipText}>{label}{key === 'all' || counts[key] > 0 ? ` (${counts[key]})` : ''}</Text>
        </TouchableOpacity>;
      })}
    </ScrollView>
    {loading ? <View style={styles.center}><ActivityIndicator color={colors.primary} /><Text style={styles.muted}>Đang tải yêu cầu bảo hành…</Text></View>
      : error && !items.length ? <View style={styles.center}><Text style={styles.error}>Không thể tải danh sách bảo hành. Vui lòng thử lại.</Text>
        <TouchableOpacity accessibilityRole="button" onPress={() => void load()} style={styles.retry}><Text style={styles.retryText}>Thử lại</Text></TouchableOpacity></View>
        : <FlatList data={rows} keyExtractor={claim => claim.id} renderItem={({ item }) => <WarrantyClaimRow claim={item} onOpen={() => open(item)} />}
          contentContainerStyle={styles.list} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />} onEndReached={() => void loadMore()} onEndReachedThreshold={0.4}
          ListEmptyComponent={<View style={styles.center}><Text style={styles.emptyTitle}>{items.length ? 'Không có yêu cầu bảo hành ở mục này' : 'Chưa có yêu cầu bảo hành'}</Text>
            {items.length ? null : <Text style={styles.muted}>Yêu cầu bảo hành cho việc bạn đã làm sẽ hiện ở đây.</Text>}</View>}
          ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} /> : undefined} />}
  </View>;
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  chipScroll: { flexGrow: 0, flexShrink: 0, minHeight: 68 },
  chipRow: { paddingHorizontal: 16, paddingVertical: 12, gap: 8, alignItems: 'center' },
  chip: { minHeight: 44, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  chipText: { fontSize: 13, lineHeight: 18, fontWeight: '600', color: colors.textSecondary },
  chipTextActive: { fontSize: 13, lineHeight: 18, fontWeight: '700', color: colors.primaryStrong },
  list: { paddingHorizontal: 16, paddingBottom: 96, gap: 12, flexGrow: 1 },
  card: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 8 },
  metaLine: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  code: { fontSize: 13, lineHeight: 18, fontWeight: '700', color: colors.textSecondary },
  pill: { paddingHorizontal: 8, minHeight: 24, borderRadius: 8, justifyContent: 'center' },
  pillText: { fontSize: 12, lineHeight: 16, fontWeight: '700' },
  date: { fontSize: 12, lineHeight: 16, color: colors.textSecondary },
  title: { fontSize: 17, lineHeight: 24, fontWeight: '700', color: colors.text },
  infoLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  infoText: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.text },
  infoMuted: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  said: { borderLeftWidth: 2, borderLeftColor: colors.border, paddingLeft: 12, gap: 2 },
  saidLabel: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: colors.textSecondary },
  saidText: { fontSize: 14, lineHeight: 20, color: colors.text },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 4, marginTop: 4 },
  primary: { minHeight: 44, borderRadius: 12, backgroundColor: colors.primaryStrong, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 6 },
  primaryText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  more: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  center: { alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 48, paddingHorizontal: 24 },
  muted: { fontSize: 14, lineHeight: 20, color: colors.textSecondary, textAlign: 'center' },
  emptyTitle: { fontSize: 16, lineHeight: 22, fontWeight: '700', color: colors.text, textAlign: 'center' },
  error: { fontSize: 14, lineHeight: 20, color: colors.tone.danger.text, textAlign: 'center' },
  retry: { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 20, justifyContent: 'center' },
  retryText: { fontWeight: '700', color: colors.text },
});
