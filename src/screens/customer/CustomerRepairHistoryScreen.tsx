import React, { useCallback, useMemo, useRef, useState } from 'react';
import CustomerSkeleton from '../../components/customer/CustomerSkeleton';
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
import * as Clipboard from 'expo-clipboard';
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
import BackButton from '../../components/BackButton';
import VisitGroupsPanel from '../../components/customer/VisitGroupsPanel';

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
  // Visits of several devices are listed apart; the order history leaves their devices out.
  const [mode, setMode] = useState<'orders' | 'visits'>('orders');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyMessageForOrder, setCopyMessageForOrder] = useState<string | null>(null);

  const loadFirstPage = useCallback(async (refresh = false) => {
    const generation = ++generationRef.current;
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const result = await ordersApi.getRepairHistory(1, PAGE_SIZE, 'completed', { excludeVisitGroups: true });
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
      const result = await ordersApi.getRepairHistory(nextPage, PAGE_SIZE, 'completed', { excludeVisitGroups: true });
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

  const copyOrderCode = async (event: { stopPropagation?: unknown }, orderId: string, code: string) => {
    if (typeof event.stopPropagation === 'function') event.stopPropagation();
    try {
      await Clipboard.setStringAsync(code);
      setCopyMessageForOrder(orderId);
    } catch {
      setCopyMessageForOrder(`failed:${orderId}`);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
      <View style={styles.header}>
        <BackButton />
        <View style={styles.headerCopy}>
          <Text style={styles.headerOverline}>LỊCH SỬ & BẢO HÀNH</Text>
          <Text style={styles.headerTitle} accessibilityRole="header">Lịch sử sửa chữa</Text>
          <Text style={styles.headerSubtitle}>Những đơn đã sửa chữa và hoàn tất</Text>
        </View>
        <View style={{ width: 44, height: 44 }} />
      </View>

      <View style={styles.searchWrap}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color={colors.textSecondary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Tìm dịch vụ, kỹ thuật viên, mã đơn..."
            accessibilityLabel="Tìm trong lịch sử sửa chữa đã tải"
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
            returnKeyType="search"
          />
          {!!query && (
            <TouchableOpacity
              onPress={() => setQuery('')}
              accessibilityRole="button"
              accessibilityLabel="Xóa tìm kiếm"
              style={styles.searchResetButton}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close-circle" size={20} color={colors.muted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {mode === 'orders' && !!query.trim() && !loading && rows.length < total && (
        <Text style={styles.searchScopeNote}>
          Tìm kiếm chỉ áp dụng cho các đơn đã tải. Bạn có thể tải thêm để tìm tiếp.
        </Text>
      )}

      <View style={styles.modeRow} accessibilityRole="tablist">
        {([['orders', 'Đơn sửa chữa'], ['visits', 'Nhiều thiết bị']] as const).map(([id, label]) => (
          <TouchableOpacity
            key={id}
            testID={`repair-history-mode-${id}`}
            style={[styles.modeChip, mode === id && styles.modeChipActive]}
            onPress={() => setMode(id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: mode === id }}
          >
            <Text style={mode === id ? styles.modeTextActive : styles.modeText}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {mode === 'visits' ? (
        <VisitGroupsPanel
          terminalOnly
          search={query}
          onOpen={(visit) => navigation.navigate('CustomerVisit', { visitGroupId: visit.id })}
        />
      ) : loading ? (
        <View style={styles.centerState}>
          <Text style={styles.stateText}>Đang tải lịch sử sửa chữa...</Text>
          <CustomerSkeleton variant="booking" rows={3} />
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
                <TouchableOpacity
                  onPress={() => void loadFirstPage(true)}
                  style={styles.retryButton}
                  accessibilityRole="button"
                  accessibilityLabel="Thử tải lại lịch sử sửa chữa"
                >
                  <Text style={styles.retryText}>Thử lại</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {rows.length === 0 && error ? null : rows.length === 0 ? (
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
              <Text style={styles.emptyTitle}>
                {rows.length < total ? 'Không có kết quả trong lịch sử đã tải' : 'Không tìm thấy kết quả'}
              </Text>
              <Text style={styles.stateText}>
                {rows.length < total
                  ? 'Có thể còn kết quả ở các trang chưa tải.'
                  : 'Thử tìm theo dịch vụ, kỹ thuật viên hoặc mã đơn khác.'}
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.listHeading}>
                <Text style={styles.sectionTitle} accessibilityRole="header">Đã hoàn tất</Text>
                <Text style={styles.sectionCount}>
                  {query.trim() ? `${visibleRows.length} trong ${rows.length} đã tải` : `Đã tải ${rows.length}/${total}`}
                </Text>
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
                      <View style={{ flex: 1 }}>
                        <Text style={styles.referenceLabel}>Mã đơn</Text>
                        <Text style={styles.referenceText}>{item.code || 'Chưa có mã đơn'}</Text>
                        {item.code ? (
                          <TouchableOpacity
                            testID={`repair-history-copy-code-${item.orderId}`}
                            style={styles.copyCodeButton}
                            accessibilityRole="button"
                            accessibilityLabel={`Sao chép mã đơn ${item.code}`}
                            onPress={event => void copyOrderCode(event, item.orderId, item.code)}
                          >
                            <Ionicons name="copy-outline" size={15} color={colors.primaryStrong} />
                            <Text style={styles.copyCodeText}>Sao chép</Text>
                          </TouchableOpacity>
                        ) : null}
                        {copyMessageForOrder === item.orderId ? <Text style={styles.copyCodeFeedback} accessibilityLiveRegion="polite">Đã sao chép mã đơn.</Text> : null}
                        {copyMessageForOrder === `failed:${item.orderId}` ? <Text style={styles.copyCodeFeedback} accessibilityRole="alert">Không thể sao chép mã đơn.</Text> : null}
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
              accessibilityLabel="Tải thêm lịch sử sửa chữa"
              accessibilityState={{ disabled: loadingMore }}
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
    paddingVertical: 16,
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
  headerCopy: { flex: 1, alignItems: 'center' },
  headerOverline: { fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 1, color: colors.textSecondary, textAlign: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: colors.text, textAlign: 'center' },
  headerSubtitle: { fontSize: 12, color: colors.textSecondary, marginTop: 2, textAlign: 'center' },
  searchWrap: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  searchBar: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.text, paddingVertical: 0 },
  searchResetButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  modeRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  modeChip: { minHeight: 44, paddingHorizontal: 16, borderRadius: 22, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  modeChipActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  modeText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  modeTextActive: { fontSize: 14, fontWeight: '600', color: colors.primaryStrong },
  searchScopeNote: { fontSize: 12, lineHeight: 18, color: colors.textSecondary, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 },
  scrollContent: { padding: 16, paddingBottom: 56, flexGrow: 1 },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 32 },
  stateText: { fontSize: 13, lineHeight: 19, color: colors.textSecondary, textAlign: 'center' },
  emptyState: { alignItems: 'center', paddingHorizontal: 28, paddingVertical: 56 },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: colors.text, marginBottom: 6 },
  errorBanner: {
    flexDirection: 'row',
    gap: 8,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginBottom: 12,
  },
  errorCopy: { flex: 1 },
  errorText: { fontSize: 13, lineHeight: 18, color: colors.text, marginBottom: 6 },
  retryText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  retryButton: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', paddingHorizontal: 2 },
  listHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: colors.text },
  sectionCount: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 12,
    minHeight: 84,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: colors.tone?.success?.bg ?? '#DCFCE7',
  },
  statusText: { fontSize: 12, fontWeight: '700', color: colors.tone?.success?.text ?? colors.success },
  dateText: { fontSize: 12, color: colors.textSecondary },
  serviceTitle: { fontSize: 16, lineHeight: 22, fontWeight: '800', color: colors.text, marginBottom: 8 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  metaText: { flex: 1, fontSize: 13, color: colors.textSecondary },
  cardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  referenceLabel: { fontSize: 12, lineHeight: 17, textTransform: 'uppercase', fontWeight: '700', color: colors.textSecondary },
  referenceText: { fontSize: 12, fontWeight: '700', color: colors.text, marginTop: 2 },
  copyCodeButton: { minHeight: 44, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 4 },
  copyCodeText: { fontSize: 12, fontWeight: '600', color: colors.primaryStrong },
  copyCodeFeedback: { fontSize: 11, color: colors.textSecondary },
  totalBlock: { flex: 1, alignItems: 'flex-end' },
  totalText: { fontSize: 14, fontWeight: '800', color: colors.primaryStrong, marginTop: 2 },
  loadMoreButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
});
