import { useAppTheme } from '../../constants/theme';
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar, TextInput, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../types';
import { servicesApi } from '../../api/services.api';
import {
  createServiceCatalogLoader,
  initialCatalogState,
  resolveServicePrice,
} from './service-catalog';

type ServicesRoute = RouteProp<RootStackParamList, 'CustomerServices'>;

export default function CustomerServicesScreen() {
  const { colors, spacing, fontSize, isDark } = useAppTheme();
  const styles = getStyles(colors, spacing, fontSize);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<ServicesRoute>();
  const [searchQuery, setSearchQuery] = useState(route.params?.query ?? '');
  const [catalogState, setCatalogState] = useState(initialCatalogState);
  const { services, total, loading, loadingMore, error } = catalogState;
  const loaderRef = useRef<ReturnType<typeof createServiceCatalogLoader> | null>(null);
  if (loaderRef.current === null) {
    loaderRef.current = createServiceCatalogLoader(
      (params) => servicesApi.getServices(params),
      setCatalogState,
    );
  }

  // Debounced server search: every keystroke re-queries page one, and the
  // loader drops stale responses so only the latest query renders.
  useEffect(() => {
    const timer = setTimeout(() => {
      void loaderRef.current?.search(searchQuery.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const onRetry = () => { void loaderRef.current?.retry(); };
  const onLoadMore = () => { void loaderRef.current?.loadMore(); };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Tất cả dịch vụ</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#94A3B8" />
        <TextInput
          style={styles.searchInput}
          placeholder="Tìm kiếm dịch vụ..."
          placeholderTextColor="#94A3B8"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={20} color="#94A3B8" />
          </TouchableOpacity>
        )}
      </View>

      {loading && services.length === 0 ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.stateText}>Đang tải danh sách dịch vụ...</Text>
        </View>
      ) : error && services.length === 0 ? (
        <View style={styles.centerState}>
          <Text style={styles.stateText}>{error}</Text>
          <TouchableOpacity onPress={onRetry} accessibilityRole="button" style={styles.retryBtn}>
            <Text style={styles.retryText}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      ) : services.length === 0 ? (
        <View style={styles.centerState}>
          <Ionicons name="search-outline" size={56} color="#CBD5E1" />
          <Text style={styles.stateText}>Không tìm thấy dịch vụ nào phù hợp.</Text>
          <TouchableOpacity onPress={onRetry} accessibilityRole="button" style={styles.retryBtn}>
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
          ListHeaderComponent={
            error ? (
              <View style={styles.staleBanner} accessibilityRole="alert">
                <Text style={styles.staleText}>
                  Không tải được kết quả mới. Đang hiển thị kết quả đã tải trước đó.
                </Text>
                <TouchableOpacity onPress={onRetry} accessibilityRole="button">
                  <Text style={styles.retryText}>Thử lại</Text>
                </TouchableOpacity>
              </View>
            ) : null
          }
          ListFooterComponent={
            services.length < total ? (
              <TouchableOpacity onPress={onLoadMore} disabled={loadingMore} accessibilityRole="button" style={styles.retryBtn}>
                {loadingMore ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Text style={styles.retryText}>Tải thêm ({services.length}/{total})</Text>
                )}
              </TouchableOpacity>
            ) : null
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.itemCard}
              onPress={() => navigation.navigate('CustomerServiceDetail', { serviceId: item.id })}
              activeOpacity={0.7}
            >
              <View style={styles.iconContainer}>
                <Ionicons name="construct-outline" size={24} color={colors.primary} />
              </View>
              <View style={styles.itemInfo}>
                <Text style={styles.itemName}>{item.name}</Text>
                <Text style={styles.itemPrice}>{resolveServicePrice(item).text}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
            </TouchableOpacity>
          )}
        />
      )}
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
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    margin: 16,
    marginBottom: 4,
    paddingHorizontal: 12,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    color: colors.text,
  },
  centerState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 12,
  },
  stateText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  retryBtn: {
    padding: 12,
    alignItems: 'center',
  },
  retryText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
  },
  staleBanner: {
    padding: 12,
    gap: 4,
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
  },
  staleText: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  listContainer: {
    padding: 16,
    gap: 12,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: 12,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    backgroundColor: '#EFF6FF',
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  itemPrice: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  }
});
