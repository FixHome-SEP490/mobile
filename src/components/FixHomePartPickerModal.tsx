import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Modal,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { partsCatalogApi, type FixHomePart } from '../api/parts-catalog.api';
import { useAppTheme } from '../constants/theme';

export interface FixHomePartPickerModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectPart: (part: FixHomePart, quantity: number) => void;
  title?: string;
  initialQuantity?: number;
}

const CATEGORIES = [
  { label: 'Tất cả', value: 'ALL' },
  { label: 'Điều hòa', value: 'Điều hòa' },
  { label: 'Máy giặt', value: 'Máy giặt' },
  { label: 'Tủ lạnh', value: 'Tủ lạnh' },
  { label: 'Bình nóng lạnh', value: 'Bình nóng lạnh' },
  { label: 'Quạt / Khác', value: 'Quạt' },
];

export const formatVnd = (amount: number): string => {
  return amount.toLocaleString('vi-VN') + ' đ';
};

export const formatWarranty = (days?: number | null, policy?: string | null): string => {
  if (days && days > 0) {
    if (days >= 360) {
      const years = Math.round(days / 365);
      return `BH ${years} năm`;
    }
    if (days >= 30) {
      const months = Math.round(days / 30);
      return `BH ${months} tháng`;
    }
    return `BH ${days} ngày`;
  }
  if (policy) return policy;
  return 'BH chính hãng';
};

export default function FixHomePartPickerModal({
  visible,
  onClose,
  onSelectPart,
  title = 'Chọn linh kiện từ kho FixHome',
  initialQuantity = 1,
}: FixHomePartPickerModalProps) {
  const { isDark } = useAppTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [parts, setParts] = useState<FixHomePart[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPart, setSelectedPart] = useState<FixHomePart | null>(null);
  const [quantity, setQuantity] = useState(initialQuantity);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchParts = useCallback(async (query: string, category: string) => {
    try {
      setLoading(true);
      const effectiveSearch = query.trim() || (category !== 'ALL' ? category : '');
      const res = await partsCatalogApi.getCatalog({
        search: effectiveSearch || undefined,
        limit: 50,
      });
      setParts(res.data);
    } catch {
      // Keep existing list on error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    const timer = setTimeout(() => {
      void partsCatalogApi.getCatalog({
        search: searchQuery.trim() || (selectedCategory !== 'ALL' ? selectedCategory : undefined),
        limit: 50,
      }).then((res) => {
        if (active) setParts(res.data);
      }).catch(() => {});
    }, 0);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [visible, searchQuery, selectedCategory]);

  const onSearchChange = (text: string) => {
    setSearchQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void fetchParts(text, selectedCategory);
    }, 300);
  };

  const onSelectCategory = (catVal: string) => {
    setSelectedCategory(catVal);
    void fetchParts(searchQuery, catVal);
  };

  const handleConfirmSelect = () => {
    if (!selectedPart) return;
    onSelectPart(selectedPart, quantity);
    onClose();
  };

  const renderPartItem = ({ item }: { item: FixHomePart }) => {
    const isSelected = selectedPart?.id === item.id;
    return (
      <TouchableOpacity
        style={[
          styles.partCard,
          { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: isSelected ? '#2563EB' : (isDark ? '#334155' : '#E2E8F0') },
          isSelected && styles.partCardSelected,
        ]}
        onPress={() => setSelectedPart(item)}
        activeOpacity={0.7}
      >
        <View style={styles.partCardHeader}>
          <Text style={[styles.partName, { color: isDark ? '#F8FAFC' : '#0F172A' }]} numberOfLines={2}>
            {item.name}
          </Text>
          {!!item.sku && (
            <View style={styles.skuBadge}>
              <Text style={styles.skuText}>{item.sku}</Text>
            </View>
          )}
        </View>

        {!!item.description && (
          <Text style={[styles.partDesc, { color: isDark ? '#94A3B8' : '#64748B' }]} numberOfLines={2}>
            {item.description}
          </Text>
        )}

        <View style={styles.partCardFooter}>
          <Text style={styles.partPrice}>{formatVnd(item.sellingPrice)}</Text>
          <View style={styles.warrantyBadge}>
            <Ionicons name="shield-checkmark" size={12} color="#059669" />
            <Text style={styles.warrantyText}>{formatWarranty(item.warrantyDays, item.warrantyPolicy)}</Text>
          </View>
        </View>

        {isSelected && (
          <View style={styles.selectedIndicator}>
            <Ionicons name="checkmark-circle" size={20} color="#2563EB" />
            <Text style={styles.selectedIndicatorText}>Đã chọn</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <SafeAreaView style={[styles.modalContainer, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC' }]}>
        {/* Header */}
        <View style={[styles.header, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderBottomColor: isDark ? '#334155' : '#E2E8F0' }]}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} accessibilityLabel="Đóng">
            <Ionicons name="close" size={24} color={isDark ? '#F8FAFC' : '#0F172A'} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: isDark ? '#F8FAFC' : '#0F172A' }]} numberOfLines={1}>
            {title}
          </Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Search Bar */}
        <View style={[styles.searchBox, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: isDark ? '#334155' : '#E2E8F0' }]}>
          <Ionicons name="search" size={20} color="#64748B" />
          <TextInput
            style={[styles.searchInput, { color: isDark ? '#F8FAFC' : '#0F172A' }]}
            placeholder="Tìm theo tên linh kiện hoặc mã SKU..."
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onChangeText={onSearchChange}
            clearButtonMode="while-editing"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => onSearchChange('')}>
              <Ionicons name="close-circle" size={18} color="#94A3B8" />
            </TouchableOpacity>
          )}
        </View>

        {/* Category Tabs */}
        <View style={styles.categoryContainer}>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={CATEGORIES}
            keyExtractor={(item) => item.value}
            contentContainerStyle={styles.categoryList}
            renderItem={({ item }) => {
              const active = selectedCategory === item.value;
              return (
                <TouchableOpacity
                  style={[
                    styles.categoryChip,
                    active ? styles.categoryChipActive : { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: isDark ? '#334155' : '#E2E8F0' },
                  ]}
                  onPress={() => onSelectCategory(item.value)}
                >
                  <Text style={[styles.categoryText, active && styles.categoryTextActive]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            }}
          />
        </View>

        {/* Parts List */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#2563EB" />
            <Text style={[styles.loadingText, { color: isDark ? '#94A3B8' : '#64748B' }]}>
              Đang tải danh mục linh kiện...
            </Text>
          </View>
        ) : parts.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="cube-outline" size={48} color="#94A3B8" />
            <Text style={[styles.emptyText, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>
              Không tìm thấy linh kiện nào
            </Text>
            <Text style={[styles.emptySubtext, { color: isDark ? '#94A3B8' : '#64748B' }]}>
              Thử tìm kiếm với từ khóa khác hoặc danh mục khác.
            </Text>
          </View>
        ) : (
          <FlatList
            data={parts}
            keyExtractor={(item) => item.id}
            renderItem={renderPartItem}
            contentContainerStyle={styles.partsList}
          />
        )}

        {/* Bottom Confirmation Bar */}
        {selectedPart && (
          <View style={[styles.bottomBar, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderTopColor: isDark ? '#334155' : '#E2E8F0' }]}>
            <View style={styles.bottomInfoRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.bottomPartName, { color: isDark ? '#F8FAFC' : '#0F172A' }]} numberOfLines={1}>
                  {selectedPart.name}
                </Text>
                <Text style={styles.bottomPartPrice}>
                  {formatVnd(selectedPart.sellingPrice * quantity)}
                </Text>
              </View>

              {/* Quantity Stepper */}
              <View style={styles.stepperContainer}>
                <TouchableOpacity
                  style={styles.stepperBtn}
                  onPress={() => setQuantity((q) => Math.max(1, q - 1))}
                  disabled={quantity <= 1}
                >
                  <Ionicons name="remove" size={16} color={quantity <= 1 ? '#CBD5E1' : '#0F172A'} />
                </TouchableOpacity>
                <Text style={[styles.stepperValue, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>{quantity}</Text>
                <TouchableOpacity
                  style={styles.stepperBtn}
                  onPress={() => setQuantity((q) => Math.min(100, q + 1))}
                >
                  <Ionicons name="add" size={16} color="#0F172A" />
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity style={styles.confirmBtn} onPress={handleConfirmSelect} activeOpacity={0.8}>
              <Ionicons name="checkmark" size={20} color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={styles.confirmBtnText}>Chọn linh kiện này</Text>
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  closeBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    flex: 1,
    textAlign: 'center',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    paddingHorizontal: 12,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 0,
  },
  categoryContainer: {
    marginVertical: 4,
  },
  categoryList: {
    paddingHorizontal: 16,
    gap: 8,
  },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  categoryChipActive: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  categoryText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  categoryTextActive: {
    color: '#FFFFFF',
  },
  partsList: {
    padding: 16,
    paddingBottom: 110,
    gap: 12,
  },
  partCard: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    gap: 6,
  },
  partCardSelected: {
    borderColor: '#2563EB',
    backgroundColor: '#EFF6FF',
  },
  partCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  partName: {
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
    lineHeight: 20,
  },
  skuBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  skuText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
    fontFamily: 'monospace',
  },
  partDesc: {
    fontSize: 13,
    lineHeight: 18,
  },
  partCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  partPrice: {
    fontSize: 16,
    fontWeight: '800',
    color: '#2563EB',
  },
  warrantyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  warrantyText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#059669',
  },
  selectedIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#BFDBFE',
  },
  selectedIndicatorText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563EB',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 8,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '700',
  },
  emptySubtext: {
    fontSize: 13,
    textAlign: 'center',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    borderTopWidth: 1,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 8,
  },
  bottomInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  bottomPartName: {
    fontSize: 14,
    fontWeight: '700',
  },
  bottomPartPrice: {
    fontSize: 17,
    fontWeight: '800',
    color: '#2563EB',
    marginTop: 2,
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 2,
  },
  stepperBtn: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepperValue: {
    fontSize: 14,
    fontWeight: '700',
    paddingHorizontal: 8,
  },
  confirmBtn: {
    backgroundColor: '#2563EB',
    height: 46,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
