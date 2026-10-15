import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ordersApi, type RepairHistoryItem, type WarrantyClaimView } from '../../api/orders.api';
import { useAppTheme } from '../../constants/theme';
import type { RootStackParamList } from '../../types';
import { extractApiErrorMessage } from '../../utils/input-validation';
import {
  busyWarrantyCoverageIds,
  formatWarrantyDate,
  historyToWarrantyGroupSeed,
  isWarrantyCoverageClaimable,
  orderToWarrantyGroupSeed,
  validateWarrantyText,
  warrantyClaimDisplayMeta,
  warrantyCoverageLabel,
  warrantyCoverageUiStatus,
  warrantyCustomerPromptCopy,
  type CustomerWarrantyGroup,
  type WarrantyClaimTone,
} from './customer-warranty';

const PAGE_SIZE = 10;
type WarrantyRoute = RouteProp<RootStackParamList, 'CustomerWarranties'>;

const toneIcon: Record<WarrantyClaimTone, keyof typeof Ionicons.glyphMap> = {
  info: 'information-circle-outline',
  warning: 'alert-circle-outline',
  repair: 'construct-outline',
  success: 'checkmark-circle-outline',
  neutral: 'remove-circle-outline',
};

export default function CustomerWarrantiesScreen() {
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<WarrantyRoute>();
  const focusOrderId = route.params?.orderId;
  const generationRef = useRef(0);

  const [groups, setGroups] = useState<CustomerWarrantyGroup[]>([]);
  const [sourcePage, setSourcePage] = useState(0);
  const [sourceLoaded, setSourceLoaded] = useState(0);
  const [sourceTotal, setSourceTotal] = useState(0);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [disputeClaim, setDisputeClaim] = useState<WarrantyClaimView | null>(null);
  const [disputeNote, setDisputeNote] = useState('');
  const [disputeError, setDisputeError] = useState<string | null>(null);
  const [responseBusyId, setResponseBusyId] = useState<string | null>(null);

  const mergeGroups = useCallback((incoming: CustomerWarrantyGroup[]) => {
    setGroups((current) => {
      const merged = new Map(current.map((group) => [group.orderId, group] as const));
      incoming.forEach((group) => merged.set(group.orderId, group));
      return [...merged.values()].sort((a, b) => {
        const at = a.completedAt ? new Date(a.completedAt).getTime() : 0;
        const bt = b.completedAt ? new Date(b.completedAt).getTime() : 0;
        return bt - at;
      });
    });
  }, []);

  const loadGroupFromHistory = useCallback(async (row: RepairHistoryItem): Promise<CustomerWarrantyGroup | null> => {
    const [coverages, claims] = await Promise.all([
      ordersApi.getOrderWarranties(row.orderId),
      ordersApi.getOrderWarrantyClaims(row.orderId),
    ]);
    if (!coverages.length) return null;
    return { ...historyToWarrantyGroupSeed(row), coverages, claims };
  }, []);

  const loadFocusedOrder = useCallback(async (): Promise<CustomerWarrantyGroup | null> => {
    if (!focusOrderId) return null;
    const order = await ordersApi.getOrder(focusOrderId);
    if (String(order.status).toUpperCase() !== 'COMPLETED') return null;
    const [coverages, claims] = await Promise.all([
      ordersApi.getOrderWarranties(focusOrderId),
      ordersApi.getOrderWarrantyClaims(focusOrderId),
    ]);
    if (!coverages.length) return null;
    return { ...orderToWarrantyGroupSeed(order), coverages, claims };
  }, [focusOrderId]);

  const loadPage = useCallback(async (page: number, reset = false) => {
    const generation = reset ? ++generationRef.current : generationRef.current;
    if (reset) {
      setError(null);
      setGroups([]);
      setSourcePage(0);
      setSourceLoaded(0);
      setSourceTotal(0);
    }
    try {
      const [historyResult, focusedResult] = await Promise.all([
        ordersApi.getRepairHistory(page, PAGE_SIZE, 'completed'),
        reset && focusOrderId ? loadFocusedOrder().catch(() => null) : Promise.resolve(null),
      ]);
      if (generation !== generationRef.current) return;

      const settled = await Promise.allSettled(historyResult.data.map(loadGroupFromHistory));
      if (generation !== generationRef.current) return;
      const loadedGroups = settled
        .filter((result): result is PromiseFulfilledResult<CustomerWarrantyGroup | null> => result.status === 'fulfilled')
        .map((result) => result.value)
        .filter((group): group is CustomerWarrantyGroup => group !== null);

      const failedCount = settled.filter((result) => result.status === 'rejected').length;
      if (focusedResult) loadedGroups.unshift(focusedResult);
      mergeGroups(loadedGroups);
      setSourcePage(page);
      setSourceLoaded((current) => reset ? historyResult.data.length : current + historyResult.data.length);
      setSourceTotal(historyResult.total);
      if (failedCount > 0) {
        setError('Một số thông tin bảo hành chưa tải được. Bạn có thể kéo xuống để thử lại.');
      }
    } catch (reason) {
      if (generation !== generationRef.current) return;
      setError(extractApiErrorMessage(reason, 'Không thể tải danh sách bảo hành. Vui lòng thử lại.'));
    }
  }, [focusOrderId, loadFocusedOrder, loadGroupFromHistory, mergeGroups]);

  const loadFirst = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    try {
      await loadPage(1, true);
    } finally {
      if (refresh) setRefreshing(false);
      else setLoading(false);
    }
  }, [loadPage]);

  useFocusEffect(useCallback(() => {
    void loadFirst();
    return () => { generationRef.current += 1; };
  }, [loadFirst]));

  const onLoadMore = async () => {
    if (loadingMore || sourceLoaded >= sourceTotal) return;
    setLoadingMore(true);
    try {
      await loadPage(sourcePage + 1, false);
    } finally {
      setLoadingMore(false);
    }
  };

  const visibleGroups = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('vi');
    if (!q) return groups;
    return groups.filter((group) =>
      [group.orderCode, group.serviceName, group.technicianName]
        .some((value) => value.toLocaleLowerCase('vi').includes(q)),
    );
  }, [groups, query]);

  /** Claims are created only by the order-flow warranty screens (idempotent controller), never by a direct POST from this list. */
  const openCreateClaim = (group: CustomerWarrantyGroup) => {
    navigation.navigate('CustomerOrderDetail', { serviceOrderId: group.orderId, screen: 'CustomerWarranty' });
  };

  const applyClaimUpdate = (updated: WarrantyClaimView) => {
    setGroups((current) => current.map((group) =>
      group.orderId === updated.serviceOrderId
        ? {
            ...group,
            claims: group.claims.map((claim) => claim.id === updated.id ? updated : claim),
          }
        : group,
    ));
  };

  const respondAgree = (claim: WarrantyClaimView) => {
    const copy = warrantyCustomerPromptCopy(claim);
    Alert.alert(copy.agree, copy.question, [
      { text: 'Hủy', style: 'cancel' },
      {
        text: copy.agree,
        onPress: async () => {
          if (responseBusyId) return;
          setResponseBusyId(claim.id);
          try {
            const updated = await ordersApi.respondWarrantyClaim(
              claim.serviceOrderId,
              claim.id,
              { decision: 'agree' },
            );
            applyClaimUpdate(updated);
          } catch (reason) {
            Alert.alert('Không thể gửi phản hồi', extractApiErrorMessage(
              reason,
              'Vui lòng tải lại trạng thái trước khi thử lại.',
            ));
          } finally {
            setResponseBusyId(null);
          }
        },
      },
    ]);
  };

  const openDispute = (claim: WarrantyClaimView) => {
    setDisputeClaim(claim);
    setDisputeNote('');
    setDisputeError(null);
  };

  const submitDispute = async () => {
    if (!disputeClaim || responseBusyId) return;
    const validation = validateWarrantyText(disputeNote);
    if (validation) {
      setDisputeError(validation);
      return;
    }
    setResponseBusyId(disputeClaim.id);
    setDisputeError(null);
    try {
      const updated = await ordersApi.respondWarrantyClaim(
        disputeClaim.serviceOrderId,
        disputeClaim.id,
        { decision: 'dispute', note: disputeNote.trim() },
      );
      applyClaimUpdate(updated);
      setDisputeClaim(null);
      setDisputeNote('');
      Alert.alert('Đã gửi phản đối', 'FixHome đã chuyển yêu cầu sang quy trình xem xét hỗ trợ.');
    } catch (reason) {
      setDisputeError(extractApiErrorMessage(
        reason,
        'Chưa xác nhận được kết quả. Vui lòng tải lại trạng thái trước khi thử lại.',
      ));
    } finally {
      setResponseBusyId(null);
    }
  };

  const renderClaim = (group: CustomerWarrantyGroup, claim: WarrantyClaimView) => {
    const meta = warrantyClaimDisplayMeta(claim);
    const coverage = group.coverages.find((item) => item.id === claim.warrantyCoverageId);
    const waitingForMe = claim.status === 'awaiting_customer' && !claim.customerResponse;
    const copy = warrantyCustomerPromptCopy(claim);
    const toneColor = meta.tone === 'success'
      ? colors.success
      : meta.tone === 'warning'
        ? colors.warning
        : meta.tone === 'repair'
          ? colors.primary
          : colors.textSecondary;

    return (
      <View key={claim.id} style={styles.claimCard}>
        <View style={styles.claimHeader}>
          <View style={styles.claimTitleWrap}>
            <Text style={styles.claimTitle}>{coverage ? warrantyCoverageLabel(coverage) : 'Yêu cầu bảo hành'}</Text>
            <View style={styles.statusLine}>
              <Ionicons name={toneIcon[meta.tone]} size={16} color={toneColor} />
              <Text style={[styles.statusText, { color: toneColor }]}>{meta.label}</Text>
            </View>
          </View>
          <Text style={styles.dateText}>{formatWarrantyDate(claim.submittedAt)}</Text>
        </View>
        <Text style={styles.bodyText}>{claim.description}</Text>
        {claim.submittedAfterExpiry && (
          <View style={styles.warningBox}>
            <Ionicons name="alert-circle-outline" size={17} color={colors.warning} />
            <Text style={styles.warningText}>Yêu cầu được gửi sau khi hạng mục hết hạn; quản lý dịch vụ sẽ xem xét.</Text>
          </View>
        )}
        {!!claim.resolutionNotes && (
          <View style={styles.responseBox}>
            <Text style={styles.responseLabel}>Phản hồi</Text>
            <Text style={styles.bodyText}>{claim.resolutionNotes}</Text>
          </View>
        )}
        {claim.status === 'awaiting_customer' && claim.customerResponse === 'agreed' && (
          <Text style={styles.helperText}>{copy.agreed}</Text>
        )}
        {waitingForMe && (
          <View style={styles.customerPrompt}>
            <Text style={styles.promptText}>{copy.question}</Text>
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.secondaryButton, { borderColor: colors.success }]}
                onPress={() => respondAgree(claim)}
                disabled={responseBusyId === claim.id}
                accessibilityRole="button"
              >
                {responseBusyId === claim.id
                  ? <ActivityIndicator size="small" color={colors.success} />
                  : <Text style={[styles.secondaryButtonText, { color: colors.success }]}>{copy.agree}</Text>}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => openDispute(claim)}
                disabled={responseBusyId === claim.id}
                accessibilityRole="button"
              >
                <Text style={styles.secondaryButtonText}>{copy.dispute}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    );
  };

  const renderGroup = (group: CustomerWarrantyGroup) => {
    const busyIds = busyWarrantyCoverageIds(group.claims);
    const canCreate = group.coverages.some((coverage) => isWarrantyCoverageClaimable(coverage, group.claims));
    const hasActive = group.coverages.some((coverage) => warrantyCoverageUiStatus(coverage) === 'ACTIVE');

    return (
      <View key={group.orderId} style={styles.orderCard}>
        <View style={styles.orderHeader}>
          <View style={styles.orderHeaderCopy}>
            <Text style={styles.orderCode}>{group.orderCode}</Text>
            <Text style={styles.orderTitle}>{group.serviceName}</Text>
            <Text style={styles.helperText}>Kỹ thuật viên: {group.technicianName}</Text>
          </View>
          <View style={[styles.orderStatusPill, { backgroundColor: hasActive ? colors.primarySoft : colors.background }]}>
            <Ionicons
              name={hasActive ? 'shield-checkmark-outline' : 'time-outline'}
              size={16}
              color={hasActive ? colors.success : colors.textSecondary}
            />
            <Text style={[styles.orderStatusText, { color: hasActive ? colors.success : colors.textSecondary }]}>
              {hasActive ? 'Còn bảo hành' : 'Đã hết hạn'}
            </Text>
          </View>
        </View>

        <View style={styles.coverageBox}>
          <Text style={styles.subheading}>Hạng mục bảo hành</Text>
          {group.coverages.map((coverage) => {
            const uiStatus = warrantyCoverageUiStatus(coverage);
            const busy = busyIds.includes(coverage.id);
            return (
              <View key={coverage.id} style={styles.coverageRow}>
                <Ionicons
                  name={uiStatus === 'ACTIVE' ? 'checkmark-circle-outline' : 'ellipse-outline'}
                  size={18}
                  color={uiStatus === 'ACTIVE' ? colors.success : colors.textSecondary}
                />
                <View style={styles.coverageCopy}>
                  <Text style={styles.coverageTitle}>{warrantyCoverageLabel(coverage)}</Text>
                  <Text style={styles.helperText}>
                    Hạn {formatWarrantyDate(coverage.expiresAt)}
                    {busy ? ' · Đang có yêu cầu chưa xử lý' : ''}
                  </Text>
                </View>
                <Text style={[styles.coverageState, { color: uiStatus === 'ACTIVE' ? colors.success : colors.textSecondary }]}>
                  {uiStatus === 'ACTIVE'
                    ? 'Còn hạn'
                    : uiStatus === 'VOIDED'
                      ? 'Đã hủy'
                      : uiStatus === 'EXPIRED'
                        ? 'Hết hạn'
                        : 'Chưa xác định'}
                </Text>
              </View>
            );
          })}
        </View>

        {!!group.claims.length && (
          <View style={styles.claimsWrap}>
            <Text style={styles.subheading}>Yêu cầu bảo hành</Text>
            {group.claims.map((claim) => renderClaim(group, claim))}
          </View>
        )}

        <View style={styles.footerRow}>
          <TouchableOpacity
            onPress={() => navigation.navigate('CustomerOrderDetail', { serviceOrderId: group.orderId })}
            style={styles.linkButton}
            accessibilityRole="button"
            accessibilityLabel={`Xem đơn sửa chữa ${group.orderCode}`}
          >
            <Text style={styles.linkText}>Xem đơn sửa chữa</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.primaryButton, !canCreate && styles.disabledButton]}
            onPress={() => openCreateClaim(group)}
            disabled={!canCreate}
            accessibilityRole="button"
            accessibilityLabel={`Yêu cầu bảo hành cho ${group.orderCode}`}
            accessibilityState={{ disabled: !canCreate }}
          >
            <Ionicons name="shield-checkmark-outline" size={17} color="#FFFFFF" />
            <Text style={styles.primaryButtonText}>Yêu cầu bảo hành</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };


  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Quay lại">
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle} accessibilityRole="header">Bảo hành</Text>
          <Text style={styles.headerSubtitle}>Theo dõi bảo hành theo từng đơn đã hoàn tất</Text>
        </View>
      </View>

      <View style={styles.searchWrap}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color={colors.textSecondary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Tìm mã đơn, dịch vụ, kỹ thuật viên..."
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
            accessibilityLabel="Tìm trong bảo hành đã tải"
          />
          {!!query && (
            <TouchableOpacity onPress={() => setQuery('')} style={styles.searchResetButton} accessibilityRole="button" accessibilityLabel="Xóa tìm kiếm">
              <Ionicons name="close-circle" size={20} color={colors.muted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.helperText}>Đang tải bảo hành...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadFirst(true)} />}
        >
          {!!query.trim() && sourceLoaded < sourceTotal && (
            <Text style={styles.searchScopeNote}>
              Tìm kiếm chỉ áp dụng cho các đơn đã tải. Bạn có thể tải thêm để tìm tiếp.
            </Text>
          )}
          {!!error && (
            <View style={styles.warningBox}>
              <Ionicons name="alert-circle-outline" size={18} color={colors.warning} />
              <Text style={[styles.warningText, { flex: 1 }]}>{error}</Text>
            </View>
          )}

          {!!error && groups.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>Chưa thể xác nhận danh sách bảo hành</Text>
              <Text style={styles.emptyText}>Một số thông tin chưa tải được. Hãy thử lại để kiểm tra trạng thái bảo hành mới nhất.</Text>
              <TouchableOpacity
                style={styles.retryButton}
                onPress={() => void loadFirst(true)}
                accessibilityRole="button"
                accessibilityLabel="Thử tải lại bảo hành"
              >
                <Ionicons name="refresh-outline" size={18} color={colors.primary} />
                <Text style={styles.linkText}>Thử tải lại</Text>
              </TouchableOpacity>
            </View>
          ) : groups.length === 0 && sourceLoaded >= sourceTotal ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Ionicons name="shield-checkmark-outline" size={32} color={colors.primary} />
              </View>
              <Text style={styles.emptyTitle}>Chưa có hạng mục bảo hành</Text>
              <Text style={styles.emptyText}>
                Khi đơn sửa chữa hoàn tất và hệ thống tạo bảo hành, hạng mục sẽ xuất hiện tại đây.
              </Text>
            </View>
          ) : visibleGroups.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>
                {query.trim() && sourceLoaded < sourceTotal
                  ? 'Không có kết quả trong bảo hành đã tải'
                  : sourceLoaded < sourceTotal
                    ? 'Chưa có bảo hành trong các đơn đã tải'
                    : 'Không tìm thấy kết quả'}
              </Text>
              <Text style={styles.emptyText}>
                {sourceLoaded < sourceTotal
                  ? 'Có thể còn hạng mục bảo hành trong những đơn chưa tải.'
                  : 'Thử tìm theo mã đơn, dịch vụ hoặc kỹ thuật viên khác.'}
              </Text>
            </View>
          ) : (
            visibleGroups.map(renderGroup)
          )}

          {sourceLoaded < sourceTotal && (
            <TouchableOpacity
              style={styles.loadMoreButton}
              onPress={() => void onLoadMore()}
              disabled={loadingMore}
              accessibilityRole="button"
              accessibilityLabel="Tải thêm đơn đã hoàn tất"
              accessibilityState={{ disabled: loadingMore }}
            >
              {loadingMore
                ? <ActivityIndicator size="small" color={colors.primary} />
                : <Text style={styles.linkText}>Tải thêm đơn đã hoàn tất</Text>}
            </TouchableOpacity>
          )}
        </ScrollView>
      )}

      <Modal visible={!!disputeClaim} transparent animationType="slide" onRequestClose={() => !responseBusyId && setDisputeClaim(null)}>
        <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderCopy}>
                <Text style={styles.modalTitle}>{disputeClaim ? warrantyCustomerPromptCopy(disputeClaim).dispute : 'Phản đối'}</Text>
                <Text style={styles.helperText}>{disputeClaim ? warrantyCustomerPromptCopy(disputeClaim).reason : ''}</Text>
              </View>
              <TouchableOpacity onPress={() => !responseBusyId && setDisputeClaim(null)} style={styles.modalCloseButton} disabled={!!responseBusyId} accessibilityRole="button" accessibilityLabel="Đóng biểu mẫu phản đối" accessibilityState={{ disabled: !!responseBusyId }}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <TextInput
              value={disputeNote}
              onChangeText={setDisputeNote}
              editable={!responseBusyId}
              multiline
              maxLength={2000}
              placeholder="Mô tả rõ lý do để FixHome xem xét"
              placeholderTextColor={colors.muted}
              style={styles.textArea}
              textAlignVertical="top"
              accessibilityLabel="Lý do phản đối kết quả bảo hành"
            />
            {!!disputeError && <Text style={styles.errorText}>{disputeError}</Text>}
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => setDisputeClaim(null)} disabled={!!responseBusyId}>
                <Text style={styles.secondaryButtonText}>Quay lại</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.primaryButton} onPress={() => void submitDispute()} disabled={!!responseBusyId}>
                {responseBusyId
                  ? <ActivityIndicator size="small" color="#FFFFFF" />
                  : <Text style={styles.primaryButtonText}>Gửi phản đối</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const getStyles = (colors: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backButton: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 4 },
  headerCopy: { flex: 1 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: colors.text },
  headerSubtitle: { fontSize: 12, lineHeight: 17, color: colors.textSecondary, marginTop: 2 },
  searchWrap: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 },
  searchBar: {
    minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14,
    borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.text, paddingVertical: 0 },
  searchResetButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  searchScopeNote: { fontSize: 12, lineHeight: 18, color: colors.textSecondary, paddingHorizontal: 4, paddingBottom: 8 },
  content: { padding: 16, paddingBottom: 72, flexGrow: 1 },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 32 },
  emptyState: { alignItems: 'center', paddingHorizontal: 16, paddingVertical: 40, gap: 8 },
  retryButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 18, borderRadius: 12, backgroundColor: colors.primarySoft, marginTop: 10 },
  emptyIcon: {
    width: 58, height: 58, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.primarySoft, marginBottom: 14,
  },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: colors.text, marginBottom: 6 },
  emptyText: { fontSize: 13, lineHeight: 19, color: colors.textSecondary, textAlign: 'center' },
  orderCard: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: 18, padding: 16, marginBottom: 14,
  },
  orderHeader: { flexDirection: 'row', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 14 },
  orderHeaderCopy: { flex: 1 },
  orderCode: { fontSize: 12, lineHeight: 18, fontWeight: '800', color: colors.primary, marginBottom: 3 },
  orderTitle: { fontSize: 16, lineHeight: 22, fontWeight: '800', color: colors.text, marginBottom: 4 },
  orderStatusPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 9 },
  orderStatusText: { fontSize: 12, lineHeight: 17, fontWeight: '800' },
  coverageBox: { borderRadius: 14, backgroundColor: colors.background, padding: 12, gap: 8 },
  subheading: { fontSize: 13, fontWeight: '800', color: colors.text, marginBottom: 2 },
  coverageRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  coverageCopy: { flex: 1 },
  coverageTitle: { fontSize: 13, fontWeight: '700', color: colors.text },
  coverageState: { fontSize: 12, lineHeight: 18, fontWeight: '700' },
  helperText: { fontSize: 12, lineHeight: 17, color: colors.textSecondary },
  claimsWrap: { marginTop: 14, gap: 8 },
  claimCard: { borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 12, gap: 8 },
  claimHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  claimTitleWrap: { flex: 1 },
  claimTitle: { fontSize: 13, fontWeight: '800', color: colors.text },
  statusLine: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  statusText: { fontSize: 12, lineHeight: 18, fontWeight: '700' },
  dateText: { fontSize: 12, lineHeight: 18, color: colors.textSecondary },
  bodyText: { fontSize: 13, lineHeight: 19, color: colors.text },
  warningBox: {
    flexDirection: 'row', gap: 8, padding: 11, borderRadius: 12,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
    marginBottom: 10,
  },
  warningText: { fontSize: 12, lineHeight: 17, color: colors.text },
  responseBox: { backgroundColor: colors.background, borderRadius: 10, padding: 10 },
  responseLabel: { fontSize: 12, lineHeight: 18, fontWeight: '800', color: colors.textSecondary, marginBottom: 3 },
  customerPrompt: { borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: 10, gap: 8 },
  promptText: { fontSize: 13, lineHeight: 18, fontWeight: '700', color: colors.text },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  footerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10,
    marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.divider,
  },
  linkText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  linkButton: { minHeight: 44, minWidth: 132, justifyContent: 'center', paddingHorizontal: 4 },
  primaryButton: {
    minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingHorizontal: 14, borderRadius: 12, backgroundColor: colors.primary,
  },
  primaryButtonText: { fontSize: 13, fontWeight: '800', color: '#FFFFFF' },
  disabledButton: { opacity: 0.45 },
  secondaryButton: {
    minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14,
    borderRadius: 11, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  secondaryButtonText: { fontSize: 13, fontWeight: '700', color: colors.text },
  loadMoreButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.45)' },
  modalCard: {
    maxHeight: '88%', backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 18, paddingTop: 18, paddingBottom: 44,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 16 },
  modalHeaderCopy: { flex: 1 },
  modalCloseButton: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  modalTitle: { fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: 3 },
  fieldLabel: { fontSize: 13, fontWeight: '800', color: colors.text, marginBottom: 8, marginTop: 4 },
  coverageChoice: {
    minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderColor: colors.border,
    borderRadius: 12, padding: 11, marginBottom: 8,
  },
  textArea: {
    minHeight: 108, borderWidth: 1, borderColor: colors.border, borderRadius: 12,
    backgroundColor: colors.background, color: colors.text, padding: 12, fontSize: 14,
    marginBottom: 6,
  },
  errorText: { fontSize: 12, lineHeight: 17, color: colors.error, marginTop: 8 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 8, marginTop: 16 },
});
