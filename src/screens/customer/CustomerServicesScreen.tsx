import { useAppTheme } from '../../constants/theme';
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  TextInput,
  ActivityIndicator,
  Image,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../types';
import * as Haptics from 'expo-haptics';
import { servicesApi, type CategoryItem, type ServiceItem } from '../../api/services.api';
import {
  createServiceCatalogLoader,
  fetchAllCatalogServices,
  initialCatalogState,
  resolveServicePrice,
} from './service-catalog';
import CategoryPills from '../../components/CategoryPills';
import CustomerSkeleton from '../../components/customer/CustomerSkeleton';
import { getServicePresentation } from '../../constants/service-presentation';
import { CUSTOMER_UI_ARTWORK } from '../../constants/customer-artwork';
import { customerDiscoveryColumns, displayCustomerServiceName } from '../../constants/customer-display';
import { groupCustomerServices } from './customer-service-discovery';
import { useAuthStore } from '../../store';
import BackButton from '../../components/BackButton';

type ServicesRoute = RouteProp<RootStackParamList, 'CustomerServices'>;

export default function CustomerServicesScreen() {
  const { colors, spacing, fontSize, isDark } = useAppTheme();
  const styles = getStyles(colors, spacing, fontSize);
  const { width: viewportWidth, fontScale } = useWindowDimensions();
  const discoveryColumns = customerDiscoveryColumns(viewportWidth, fontScale);
  const discoveryArtworkSize = discoveryColumns === 3 ? 76 : 82;
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<ServicesRoute>();
  const [searchQuery, setSearchQuery] = useState(route.params?.query ?? '');
  const browseMode = searchQuery.trim().length === 0;
  const [catalogState, setCatalogState] = useState(initialCatalogState);
  const { services, total, loading, loadingMore, error } = catalogState;
  const loaderRef = useRef<ReturnType<typeof createServiceCatalogLoader> | null>(null);
  if (loaderRef.current === null) {
    loaderRef.current = createServiceCatalogLoader(
      (params) => servicesApi.getServices(params),
      setCatalogState,
    );
  }

  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [categoriesLoaded, setCategoriesLoaded] = useState(false);
  const [categoryLoadFailed, setCategoryLoadFailed] = useState(false);
  const [categoryReloadKey, setCategoryReloadKey] = useState(0);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [discoveryServices, setDiscoveryServices] = useState<ServiceItem[]>([]);
  const [discoveryComplete, setDiscoveryComplete] = useState(true);
  const [discoveryLoading, setDiscoveryLoading] = useState(true);
  const [discoveryError, setDiscoveryError] = useState(false);
  const discoveryRequest = useRef(0);

  // Resolve the requested categoryCode against the loaded categories exactly
  // once, so a code that doesn't (yet) exist just falls back to unfiltered.
  const requestedCategoryCode = useRef(route.params?.categoryCode);
  useEffect(() => {
    let cancelled = false;
    servicesApi
      .getCategories()
      .then((rows) => {
        if (cancelled) return;
        setCategories(rows);
        const wanted = requestedCategoryCode.current;
        if (wanted) {
          setCategoryId(rows.find((category) => category.code === wanted)?.id ?? null);
        }
      })
      .catch(() => {
        if (!cancelled) setCategoryLoadFailed(true);
      })
      .finally(() => {
        if (!cancelled) setCategoriesLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [categoryReloadKey]);

  useEffect(() => {
    if (!browseMode || !categoriesLoaded || categoryLoadFailed) return;
    const requestId = ++discoveryRequest.current;
    let cancelled = false;
    fetchAllCatalogServices(
      (params) => servicesApi.getServices(params),
      () => !cancelled && discoveryRequest.current === requestId,
    )
      .then((rows) => {
        if (!cancelled && discoveryRequest.current === requestId) {
          setDiscoveryServices(rows);
          setDiscoveryComplete(true);
          setDiscoveryError(false);
        }
      })
      .catch(() => {
        if (!cancelled && discoveryRequest.current === requestId) {
          setDiscoveryServices([]);
          setDiscoveryError(true);
        }
      })
      .finally(() => {
        if (!cancelled && discoveryRequest.current === requestId) setDiscoveryLoading(false);
      });
    return () => {
      cancelled = true;
      if (discoveryRequest.current === requestId) discoveryRequest.current += 1;
    };
  }, [browseMode, categoriesLoaded, categoryLoadFailed]);

  // Debounced server search: every keystroke re-queries page one, and the
  // loader drops stale responses so only the latest query renders. Held
  // until categories resolve so a requested categoryCode never flashes the
  // unfiltered list first.
  useEffect(() => {
    if (!categoriesLoaded || browseMode) return;
    const timer = setTimeout(() => {
      void loaderRef.current?.search(searchQuery.trim(), categoryId ?? undefined);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, categoryId, categoriesLoaded, browseMode]);

  const selectedCategoryName = categories.find((category) => category.id === categoryId)?.name;

  const onRetry = () => { void loaderRef.current?.retry(); };
  const onLoadMore = () => { void loaderRef.current?.loadMore(); };
  const retryDiscovery = () => {
    if (categoryLoadFailed) {
      setDiscoveryLoading(true);
      setDiscoveryError(false);
      setCategoriesLoaded(false);
      setCategoryLoadFailed(false);
      setCategoryReloadKey((value) => value + 1);
      return;
    }
    const requestId = ++discoveryRequest.current;
    setDiscoveryLoading(true);
    setDiscoveryError(false);
    void fetchAllCatalogServices(
      (params) => servicesApi.getServices(params),
      () => discoveryRequest.current === requestId,
    )
      .then((rows) => {
        if (discoveryRequest.current === requestId) {
          setDiscoveryServices(rows);
          setDiscoveryComplete(true);
        }
      })
      .catch(() => {
        if (discoveryRequest.current === requestId) setDiscoveryError(true);
      })
      .finally(() => {
        if (discoveryRequest.current === requestId) setDiscoveryLoading(false);
      });
  };

  const selectedCategoryCode = categories.find((category) => category.id === categoryId)?.code;
  const groups = groupCustomerServices(categories, discoveryServices, selectedCategoryCode);
  const openAiHelp = () => {
    const session = useAuthStore.getState();
    navigation.navigate(session.isAuthenticated ? 'CustomerAIDiagnosis' : 'Auth');
  };

  const openService = (service: ServiceItem) => {
    Haptics.selectionAsync();
    navigation.navigate('CustomerServiceDetail', { serviceId: service.id });
  };

  const onSearchChange = (value: string) => {
    if (value.trim().length === 0) {
      setDiscoveryLoading(true);
      setDiscoveryError(false);
    }
    setSearchQuery(value);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      {/* Page header */}
      <View style={styles.header}>
        <BackButton />
        <Text style={styles.headerTitle} numberOfLines={1}>
          {browseMode ? selectedCategoryName ?? 'Khám phá dịch vụ' : selectedCategoryName ?? 'Kết quả tìm kiếm'}
        </Text>
        <View style={{ width: 44 }} />
      </View>

      {/* Search bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={colors.muted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Tìm điều hòa, máy giặt…"
          placeholderTextColor={colors.muted}
          value={searchQuery}
          onChangeText={onSearchChange}
          autoFocus={Boolean(route.params?.query?.trim())}
          autoCorrect={false}
          autoCapitalize="none"
          accessibilityLabel="Tìm kiếm dịch vụ"
          returnKeyType="search"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity
            onPress={() => setSearchQuery('')}
            style={styles.clearBtn}
            accessibilityRole="button"
            accessibilityLabel="Xóa nội dung tìm kiếm"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="close-circle" size={20} color={colors.muted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Search results keep the existing server-backed filters and loader. */}
      {!browseMode && categories.length > 0 && (
        <View style={styles.pillsContainer}>
          <CategoryPills categories={categories} selectedId={categoryId} onSelect={setCategoryId} />
        </View>
      )}

      {browseMode ? (
        <ScrollView
          style={styles.discoveryBody}
          contentContainerStyle={styles.discoveryContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <TouchableOpacity
            style={styles.aiEntry}
            onPress={openAiHelp}
            activeOpacity={0.82}
            accessibilityRole="button"
            accessibilityLabel="Hỏi FixHome AI"
            accessibilityHint="Mở chẩn đoán sơ bộ bằng AI"
          >
            <Image source={CUSTOMER_UI_ARTWORK.aiHelper} style={styles.aiArtwork} resizeMode="contain" accessible={false} />
            <View style={styles.aiCopy}>
              <Text style={styles.aiTitle}>Chưa biết bắt đầu từ đâu?</Text>
              <Text style={styles.aiSubtitle}>Mô tả sự cố để nhận gợi ý sơ bộ.</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.primaryStrong} />
          </TouchableOpacity>
          {selectedCategoryName && (
            <TouchableOpacity
              style={styles.allGroupsAction}
              onPress={() => setCategoryId(null)}
              accessibilityRole="button"
              accessibilityLabel="Xem tất cả danh mục dịch vụ"
            >
              <Text style={styles.groupActionText}>Xem tất cả danh mục</Text>
            </TouchableOpacity>
          )}

          {categoryLoadFailed ? (
            <View style={styles.discoveryState}>
              <Text style={styles.stateTitle}>Chưa tải được danh mục dịch vụ</Text>
              <Text style={styles.stateText}>Vui lòng thử lại để xem các dịch vụ hiện có.</Text>
              <TouchableOpacity onPress={retryDiscovery} accessibilityRole="button" accessibilityLabel="Thử tải lại danh mục dịch vụ" style={styles.retryBtn}>
                <Text style={styles.retryText}>Thử lại</Text>
              </TouchableOpacity>
            </View>
          ) : discoveryLoading ? (
            <View style={styles.discoveryLoading}>
              <CustomerSkeleton variant="service" rows={3} />
              <Text style={styles.loadingText} accessibilityLiveRegion="polite">Đang tải danh mục dịch vụ…</Text>
            </View>
          ) : discoveryError ? (
            <View style={styles.discoveryState}>
              <Text style={styles.stateTitle}>Chưa tải được dịch vụ</Text>
              <Text style={styles.stateText}>Vui lòng kiểm tra kết nối và thử lại.</Text>
              <TouchableOpacity onPress={retryDiscovery} accessibilityRole="button" accessibilityLabel="Thử tải lại dịch vụ" style={styles.retryBtn}>
                <Text style={styles.retryText}>Thử lại</Text>
              </TouchableOpacity>
            </View>
          ) : groups.every((group) => group.services.length === 0) ? (
            <View style={styles.discoveryState}>
              <Text style={styles.stateTitle}>Chưa có dịch vụ trong danh mục này</Text>
              <Text style={styles.stateText}>Danh sách sẽ cập nhật theo dữ liệu dịch vụ hiện có.</Text>
            </View>
          ) : (
            groups.filter((group) => group.services.length > 0).map((group) => (
              <View key={group.category.id} style={styles.discoveryGroup}>
                <View style={styles.discoveryGroupHeader}>
                  <View style={styles.discoveryGroupCopy}>
                    <Text style={styles.discoveryGroupTitle}>{group.category.name}</Text>
                    {discoveryComplete && (
                      <Text style={styles.discoveryGroupCount}>{`${group.services.length} dịch vụ`}</Text>
                    )}
                  </View>
                  <TouchableOpacity
                    style={styles.groupAction}
                    onPress={() => setCategoryId(group.category.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Xem trong nhóm ${group.category.name}`}
                  >
                    <Text style={styles.groupActionText}>Xem trong nhóm</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.discoveryGrid}>
                  {group.services.map((service) => {
                    const presentation = getServicePresentation(service.code);
                    return (
                      <TouchableOpacity
                        key={service.id}
                        style={[styles.discoveryService, { width: `${100 / discoveryColumns}%` }]}
                        onPress={() => openService(service)}
                        activeOpacity={0.82}
                        accessibilityRole="button"
                        accessibilityLabel={service.name}
                        accessibilityHint="Mở chi tiết dịch vụ"
                      >
                        <View style={[styles.discoveryArtworkFrame, { height: discoveryArtworkSize }]}>
                          {presentation ? (
                            <Image
                              source={presentation.imageSource}
                              style={{ width: discoveryArtworkSize, height: discoveryArtworkSize }}
                              resizeMode="contain"
                              accessible={false}
                            />
                          ) : (
                            <Ionicons name="construct-outline" size={28} color={colors.textSecondary} />
                          )}
                        </View>
                        <Text style={styles.discoveryServiceName} numberOfLines={2}>
                          {displayCustomerServiceName(service.code, service.name)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))
          )}
        </ScrollView>
      ) : (
        <>
      {/* Result count */}
      {!loading && !error && services.length > 0 && (
        <Text style={styles.resultCount} accessibilityLiveRegion="polite">
          {`Đã tải ${services.length} trên ${total} dịch vụ`}
        </Text>
      )}

      {loading && services.length === 0 ? (
        <View style={styles.loadingState}>
          <CustomerSkeleton variant="service" rows={4} />
          <Text style={styles.loadingText} accessibilityLiveRegion="polite">
            Đang tải danh sách dịch vụ...
          </Text>
        </View>
      ) : error && services.length === 0 ? (
        <View style={styles.centerState}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.muted} />
          <Text style={styles.stateText}>{error}</Text>
          <TouchableOpacity
            onPress={onRetry}
            accessibilityRole="button"
            accessibilityLabel="Thử tải lại danh sách dịch vụ"
            style={styles.retryBtn}
          >
            <Text style={styles.retryText}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      ) : services.length === 0 ? (
        <View style={styles.centerState}>
          <Image source={CUSTOMER_UI_ARTWORK.emptySearch} style={{ width: 144, height: 112 }} resizeMode="contain" accessible={false} testID="services-empty-art" />
          <Text style={styles.stateTitle}>Chưa tìm thấy dịch vụ</Text>
          <Text style={styles.stateText}>Không tìm thấy dịch vụ nào phù hợp.</Text>
          <TouchableOpacity
            onPress={onRetry}
            accessibilityRole="button"
            accessibilityLabel="Tải lại danh sách dịch vụ"
            style={styles.retryBtn}
          >
            <Text style={styles.retryText}>Tải lại</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={services}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          onEndReached={onLoadMore}
          onEndReachedThreshold={0.5}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            error ? (
              <View style={styles.staleBanner} accessibilityRole="alert">
                <Text style={styles.staleText}>
                  Không tải được kết quả mới. Đang hiển thị kết quả đã tải trước đó.
                </Text>
                <TouchableOpacity
                  onPress={onRetry}
                  accessibilityRole="button"
                  accessibilityLabel="Thử tải lại kết quả mới"
                  style={styles.staleRetryBtn}
                >
                  <Text style={styles.retryText}>Thử lại</Text>
                </TouchableOpacity>
              </View>
            ) : null
          }
          ListFooterComponent={
            services.length < total ? (
              <TouchableOpacity
                onPress={onLoadMore}
                disabled={loadingMore}
                accessibilityRole="button"
                accessibilityLabel={`Tải thêm dịch vụ (${services.length} trên ${total})`}
                style={styles.retryBtn}
              >
                {loadingMore ? (
                  <ActivityIndicator size="small" color={colors.primaryStrong} />
                ) : (
                  <Text style={styles.retryText}>Tải thêm ({services.length}/{total})</Text>
                )}
              </TouchableOpacity>
            ) : null
          }
          renderItem={({ item }) => {
            const presentation = getServicePresentation(item.code);
            const price = resolveServicePrice(item).text;
            // Category eyebrow from item metadata when available
            const categoryName = (item as any).categoryName as string | undefined;
            return (
              <TouchableOpacity
                style={styles.itemCard}
                onPress={() => {
                  Haptics.selectionAsync();
                  navigation.navigate('CustomerServiceDetail', { serviceId: item.id });
                }}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={`${item.name}. ${price}`}
                accessibilityHint="Mở chi tiết dịch vụ"
              >
                {/* Artwork: full Codex catalog-card art style */}
                <View style={styles.itemImageContainer}>
                  {presentation ? (
                    <Image
                      source={presentation.imageSource}
                      style={styles.itemImage}
                      resizeMode="contain"
                      accessible={false}
                    />
                  ) : (
                    <Ionicons name="construct-outline" size={28} color={colors.textSecondary} />
                  )}
                </View>
                {/* Info block: category eyebrow + name + price */}
                <View style={styles.itemInfo}>
                  {!!categoryName?.trim() && (
                    <Text style={styles.itemEyebrow}>{categoryName.toUpperCase()}</Text>
                  )}
                  <Text style={styles.itemName} numberOfLines={2} ellipsizeMode="tail">
                    {displayCustomerServiceName(item.code, item.name)}
                  </Text>
                  <Text style={styles.itemPrice}>{price}</Text>
                </View>
                <Ionicons name="open-outline" size={20} color={colors.muted} />
              </TouchableOpacity>
            );
          }}
        />
      )}
        </>
      )}
    </SafeAreaView>
  );
}

const getStyles = (colors: any, spacing: any, fontSize: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  // Header — Codex "Một việc, đúng người." large title
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 10,
  },
  backBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 13,
    backgroundColor: colors.divider,
    marginTop: 4,
    marginLeft: -5,
    flexShrink: 0,
  },
  headerTitleBlock: {
    flex: 1,
    paddingTop: 2,
  },
  headerEyebrow: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.0,
    color: colors.textSecondary,
    marginBottom: 3,
  },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    lineHeight: 26,
    letterSpacing: -0.4,
  },

  // Search
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 4,
    paddingHorizontal: 14,
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    marginLeft: 10,
    fontSize: 14,
    color: colors.text,
    minHeight: 48,
  },
  clearBtn: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },

  discoveryBody: { flex: 1 },
  discoveryContent: { paddingHorizontal: 16, paddingBottom: 28 },
  aiEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 72,
    marginTop: 12,
    marginBottom: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: colors.primarySoft,
  },
  aiArtwork: { width: 44, height: 44 },
  aiCopy: { flex: 1 },
  aiTitle: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.text },
  aiSubtitle: { fontSize: 12, lineHeight: 18, color: colors.textSecondary, marginTop: 1 },
  discoveryLoading: { paddingTop: 4 },
  discoveryState: { alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  discoveryGroup: { marginBottom: 16 },
  discoveryGroupHeader: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  discoveryGroupCopy: { flex: 1 },
  discoveryGroupTitle: { fontSize: 16, lineHeight: 22, fontWeight: '700', color: colors.text },
  discoveryGroupCount: { fontSize: 12, lineHeight: 18, color: colors.textSecondary, marginTop: 1 },
  groupAction: { minHeight: 44, justifyContent: 'center', paddingLeft: 12 },
  allGroupsAction: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', marginTop: -14, marginBottom: 10, paddingHorizontal: 4 },
  groupActionText: { fontSize: 13, fontWeight: '600', color: colors.primaryStrong },
  discoveryGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },
  discoveryService: {
    minHeight: 112,
    paddingHorizontal: 4,
    paddingBottom: 6,
    justifyContent: 'flex-start',
  },
  discoveryArtworkFrame: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  discoveryServiceName: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
    paddingHorizontal: 2,
    paddingTop: 3,
  },

  // Category pills
  pillsContainer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: colors.background,
  },

  // Result count
  resultCount: {
    fontSize: 12,
    color: colors.textSecondary,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 2,
  },

  // States
  centerState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 12,
  },
  loadingState: {
    flex: 1,
  },
  loadingText: {
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  stateTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  stateText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  retryBtn: {
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 120,
  },
  retryText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primaryStrong,
  },
  staleBanner: {
    padding: 12,
    gap: 4,
    alignItems: 'center',
    backgroundColor: colors.tone.warning.bg,
    borderRadius: 12,
    marginBottom: 12,
  },
  staleText: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  staleRetryBtn: {
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },

  // List
  listContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
    gap: 0,
  },

  // Catalog card — Codex style: image on left, eyebrow+name+price on right
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingVertical: 16,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    minHeight: 100,
    gap: 14,
  },
  itemImageContainer: {
    width: 100,
    height: 90,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.divider,
    overflow: 'hidden',
    flexShrink: 0,
  },
  itemImage: {
    width: 100,
    height: 90,
  },
  itemInfo: {
    flex: 1,
    gap: 2,
  },
  itemEyebrow: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  itemName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    lineHeight: 22,
    flexShrink: 1,
  },
  itemPrice: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 3,
  },
});
