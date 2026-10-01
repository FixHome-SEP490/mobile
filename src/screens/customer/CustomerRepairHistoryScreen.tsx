import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppTheme } from '../../constants/theme';
import { ordersApi, type RepairHistoryItem } from '../../api/orders.api';
import type { RootStackParamList } from '../../types';
import {
  filterCompletedRepairHistory,
  repairHistoryDate,
  repairHistoryTotal,
} from './customer-repair-history';

const PAGE_SIZE = 20;

export default function CustomerRepairHistoryScreen() {
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const generationRef = useRef(0);
  const [rows, setRows] = useState<RepairHistoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFirstPage = useCallback(async (refresh = false) => {
    const generation = ++generationRef.current;
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const result = await ordersApi.getRepairHistory(1, PAGE_SIZE, 'completed');
      if (generation !== generationRef.current) return;
      setRows(filterCompletedRepairHistory(result.data, ''));
      setTotal(result.total);
      setPage(1);
    } catch {
      if (generation !== generationRef.current) return;
      setError('Không thể tải lịch sử sửa chữa. Vui lòng thử lại.');
    } finally {
      if (generation === generationRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void loadFirstPage();
    return () => { generationRef.current += 1; };
  }, [loadFirstPage]));

  const onLoadMore = async () => {
    if (loading || refreshing || loadingMore || rows.length >= total || page < 1) return;
    const generation = generationRef.current;
    const nextPage = page + 1;
    setLoadingMore(true);
    setError(null);
    try {
      const result = await ordersApi.getRepairHistory(nextPage, PAGE_SIZE, 'completed');
      if (generation !== generationRef.current) return;
      const incoming = filterCompletedRepairHistory(result.data, '');
      setRows((current) => {
        const merged = new Map(current.map((item) => [item.orderId, item] as const));
        incoming.forEach((item) => merged.set(item.orderId, item));
        return [...merged.values()];
      });
      setTotal(result.total);
      setPage(nextPage);
    } catch {
      if (generation !== generationRef.current) return;
      setError('Không thể tải thêm lịch sử sửa chữa. Danh sách đã tải được vẫn được giữ lại.');
    } finally {
      if (generation === generationRef.current) setLoadingMore(false);
    }
  };

  const visibleRows = useMemo(
    () => filterCompletedRepairHistory(rows, query),
    [rows, query],
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Quay lại"
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>Lịch sử sửa chữa</Text>
          <Text style={styles.headerSubtitle}>Những đơn đã sửa chữa và hoàn tất</Text>
        </View>
      </View>

      <View style={styles.searchWrap}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color={colors.textSecondary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Tìm dịch vụ, kỹ thuật viên, mã đơn..."
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
            returnKeyType="search"
          />
          {!!query && (
            <TouchableOpacity
              onPress={() => setQuery('')}
              accessibilityRole="button"
              accessibilityLabel="Xóa tìm kiếm"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close-circle" size={20} color={colors.muted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.stateText}>Đang tải lịch sử sửa chữa...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadFirstPage(true)} />}
        >
          {!!error && (
            <View style={styles.errorBanner} accessibilityRole="alert">
              <Ionicons name="alert-circle-outline" size={20} color={colors.warning} />
              <View style={styles.errorCopy}>
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity onPress={() => void loadFirstPage(true)} accessibilityRole="button">
                  <Text style={styles.retryText}>Thử lại</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {rows.length === 0 && !error ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Ionicons name="checkmark-done-outline" size={30} color={colors.primary} />
              </View>
              <Text style={styles.emptyTitle}>Chưa có lịch sử sửa chữa</Text>
              <Text style={styles.stateText}>Đơn sẽ xuất hiện tại đây sau khi sửa chữa hoàn tất.</Text>
            </View>
          ) : visibleRows.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Ionicons name="search-outline" size={30} color={colors.primary} />
              </View>
              <Text style={styles.emptyTitle}>Không tìm thấy kết quả</Text>
              <Text style={styles.stateText}>Thử tìm theo dịch vụ, kỹ thuật viên hoặc mã đơn khác.</Text>
            </View>
          ) : (
            <>
              <View style={styles.listHeading}>
                <Text style={styles.sectionTitle}>Đã hoàn tất</Text>
                <Text style={styles.sectionCount}>{visibleRows.length}{total > visibleRows.length ? `/${total}` : ''}</Text>
              </View>
              {visibleRows.map((item) => {
                const totalText = repairHistoryTotal(item);
                return (
                  <TouchableOpacity
                    key={item.orderId}
                    style={styles.card}
                    onPress={() => navigation.navigate('CustomerOrderDetail', { serviceOrderId: item.orderId })}
                    accessibilityRole="button"
                    accessibilityLabel={`Xem chi tiết đơn sửa chữa ${item.code || ''}`.trim()}
                    activeOpacity={0.8}
                  >
                    <View style={styles.cardTop}>
                      <View style={styles.statusPill}>
                        <Ionicons name="checkmark-circle" size={15} color={colors.success} />
                        <Text style={styles.statusText}>Hoàn thành</Text>
                      </View>
                      <Text style={styles.dateText}>{repairHistoryDate(item)}</Text>
                    </View>
                    <Text style={styles.serviceTitle} numberOfLines={2}>
                      {item.serviceName || 'Dịch vụ sửa chữa'}
                    </Text>
                    <View style={styles.metaRow}>
                      <Ionicons name="person-outline" size={16} color={colors.textSecondary} />
                      <Text style={styles.metaText} numberOfLines={1}>
                        {item.technicianName ? `Kỹ thuật viên ${item.technicianName}` : 'Kỹ thuật viên chưa xác định'}
                      </Text>
                    </View>
                    <View style={styles.cardBottom}>
                      <View>
                        <Text style={styles.referenceLabel}>Mã đơn</Text>
                        <Text style={styles.referenceText}>{item.code || item.orderId.slice(0, 8)}</Text>
                      </View>
                      <View style={styles.totalBlock}>
                        <Text style={styles.referenceLabel}>Tổng thanh toán</Text>
                        <Text style={styles.totalText}>{totalText || 'Chưa xác định'}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                    </View>
                  </TouchableOpacity>
                );
              })}
            </>
          )}

          {rows.length < total && (
            <TouchableOpacity
              style={styles.loadMoreButton}
              onPress={() => void onLoadMore()}
              disabled={loadingMore}
              accessibilityRole="button"
            >
              {loadingMore ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={styles.retryText}>Tải thêm</Text>
              )}
            </TouchableOpacity>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const getStyles = (colors: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  headerCopy: { flex: 1 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: colors.text },
  headerSubtitle: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  searchWrap: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 },
  searchBar: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.text, paddingVertical: 0 },
  scrollContent: { padding: 16, paddingBottom: 32 },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 32 },
  stateText: { fontSize: 13, lineHeight: 19, color: colors.textSecondary, textAlign: 'center' },
  emptyState: { alignItems: 'center', paddingHorizontal: 28, paddingVertical: 56 },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: colors.text, marginBottom: 6 },
  errorBanner: {
    flexDirection: 'row',
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginBottom: 14,
  },
  errorCopy: { flex: 1 },
  errorText: { fontSize: 13, lineHeight: 18, color: colors.text, marginBottom: 6 },
  retryText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  listHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: colors.text },
  sectionCount: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 12,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#DCFCE7',
  },
  statusText: { fontSize: 11, fontWeight: '700', color: colors.success },
  dateText: { fontSize: 12, color: colors.textSecondary },
  serviceTitle: { fontSize: 16, lineHeight: 22, fontWeight: '800', color: colors.text, marginBottom: 10 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 },
  metaText: { flex: 1, fontSize: 13, color: colors.textSecondary },
  cardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  referenceLabel: { fontSize: 10, textTransform: 'uppercase', fontWeight: '700', color: colors.muted },
  referenceText: { fontSize: 12, fontWeight: '700', color: colors.text, marginTop: 2 },
  totalBlock: { flex: 1, alignItems: 'flex-end' },
  totalText: { fontSize: 14, fontWeight: '800', color: colors.primaryStrong, marginTop: 2 },
  loadMoreButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
});
