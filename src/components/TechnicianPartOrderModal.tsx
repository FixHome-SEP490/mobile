import React, { useState } from 'react';
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
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { partRequestsApi, type FulfillmentMethod } from '../api/part-requests.api';
import type { FixHomePart } from '../api/parts-catalog.api';
import FixHomePartPickerModal, { formatVnd, formatWarranty } from './FixHomePartPickerModal';
import { useAppTheme } from '../constants/theme';

export interface SelectedOrderPartItem {
  partCatalogId: string;
  partName: string;
  sku: string | null;
  price: number;
  quantity: number;
  warrantyDays: number | null;
  warrantyPolicy: string | null;
  note?: string;
}

export interface TechnicianPartOrderModalProps {
  visible: boolean;
  orderId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function TechnicianPartOrderModal({
  visible,
  orderId,
  onClose,
  onSuccess,
}: TechnicianPartOrderModalProps) {
  const { isDark } = useAppTheme();
  const [selectedItems, setSelectedItems] = useState<SelectedOrderPartItem[]>([]);
  const [fulfillmentMethod, setFulfillmentMethod] = useState<FulfillmentMethod>('pickup');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCatalogPicker, setShowCatalogPicker] = useState(false);

  const handleAddPartFromCatalog = (part: FixHomePart, quantity: number) => {
    setSelectedItems((prev) => {
      const existing = prev.find((item) => item.partCatalogId === part.id);
      if (existing) {
        return prev.map((item) =>
          item.partCatalogId === part.id
            ? { ...item, quantity: item.quantity + quantity }
            : item,
        );
      }
      return [
        ...prev,
        {
          partCatalogId: part.id,
          partName: part.name,
          sku: part.sku,
          price: part.sellingPrice,
          quantity,
          warrantyDays: part.warrantyDays,
          warrantyPolicy: part.warrantyPolicy,
        },
      ];
    });
  };

  const handleRemoveItem = (catalogId: string) => {
    setSelectedItems((prev) => prev.filter((item) => item.partCatalogId !== catalogId));
  };

  const handleUpdateQuantity = (catalogId: string, delta: number) => {
    setSelectedItems((prev) =>
      prev
        .map((item) => {
          if (item.partCatalogId === catalogId) {
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as SelectedOrderPartItem[],
    );
  };

  const totalPrice = selectedItems.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );

  const handleSubmit = async () => {
    if (selectedItems.length === 0) {
      Alert.alert('Chưa chọn linh kiện', 'Vui lòng chọn ít nhất 1 linh kiện từ kho FixHome.');
      return;
    }

    try {
      setLoading(true);
      await partRequestsApi.createPreRepair(orderId, {
        items: selectedItems.map((item) => ({
          partCatalogId: item.partCatalogId,
          quantity: item.quantity,
          note: item.note,
        })),
        fulfillmentMethod,
        reason: reason.trim() || 'Linh kiện phục vụ sửa chữa đơn hàng',
      });

      Alert.alert('Thành công', 'Đã gửi yêu cầu linh kiện tới kho FixHome.');
      setSelectedItems([]);
      setReason('');
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Không thể gửi yêu cầu linh kiện. Vui lòng kiểm tra lại.';
      Alert.alert('Lỗi', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <SafeAreaView style={[styles.container, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC' }]}>
        {/* Header */}
        <View style={[styles.header, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderBottomColor: isDark ? '#334155' : '#E2E8F0' }]}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} accessibilityLabel="Đóng">
            <Ionicons name="close" size={24} color={isDark ? '#F8FAFC' : '#0F172A'} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>
            Yêu cầu linh kiện FixHome
          </Text>
          <View style={{ width: 40 }} />
        </View>

        <FlatList
          data={selectedItems}
          keyExtractor={(item) => item.partCatalogId}
          contentContainerStyle={styles.contentList}
          ListHeaderComponent={
            <View style={styles.headerSection}>
              {/* Fulfillment Method Selection */}
              <Text style={[styles.sectionHeading, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>
                Phương thức nhận linh kiện
              </Text>
              <View style={styles.fulfillmentRow}>
                <TouchableOpacity
                  style={[
                    styles.fulfillmentOption,
                    fulfillmentMethod === 'pickup' && styles.fulfillmentOptionActive,
                    { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: fulfillmentMethod === 'pickup' ? '#2563EB' : (isDark ? '#334155' : '#E2E8F0') },
                  ]}
                  onPress={() => setFulfillmentMethod('pickup')}
                >
                  <Ionicons
                    name="storefront-outline"
                    size={20}
                    color={fulfillmentMethod === 'pickup' ? '#2563EB' : '#64748B'}
                  />
                  <Text
                    style={[
                      styles.fulfillmentText,
                      fulfillmentMethod === 'pickup' && styles.fulfillmentTextActive,
                    ]}
                  >
                    Tự đến lấy tại kho
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.fulfillmentOption,
                    fulfillmentMethod === 'delivery' && styles.fulfillmentOptionActive,
                    { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: fulfillmentMethod === 'delivery' ? '#2563EB' : (isDark ? '#334155' : '#E2E8F0') },
                  ]}
                  onPress={() => setFulfillmentMethod('delivery')}
                >
                  <Ionicons
                    name="bicycle-outline"
                    size={20}
                    color={fulfillmentMethod === 'delivery' ? '#2563EB' : '#64748B'}
                  />
                  <Text
                    style={[
                      styles.fulfillmentText,
                      fulfillmentMethod === 'delivery' && styles.fulfillmentTextActive,
                    ]}
                  >
                    Giao hàng tận nơi
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Reason Input */}
              <Text style={[styles.sectionHeading, { color: isDark ? '#F8FAFC' : '#0F172A', marginTop: 16 }]}>
                Lý do yêu cầu
              </Text>
              <TextInput
                style={[
                  styles.reasonInput,
                  { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: isDark ? '#334155' : '#E2E8F0', color: isDark ? '#F8FAFC' : '#0F172A' },
                ]}
                placeholder="Nhập lý do cần linh kiện (ví dụ: hỏng tụ nguồn, cần thay quạt dàn lạnh...)"
                placeholderTextColor="#94A3B8"
                value={reason}
                onChangeText={setReason}
                multiline
                numberOfLines={2}
              />

              {/* Selected Parts List Heading */}
              <View style={styles.partsHeaderRow}>
                <Text style={[styles.sectionHeading, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>
                  Danh sách linh kiện ({selectedItems.length})
                </Text>
                <TouchableOpacity
                  style={styles.addPartBtn}
                  onPress={() => setShowCatalogPicker(true)}
                >
                  <Ionicons name="add-circle" size={18} color="#2563EB" />
                  <Text style={styles.addPartBtnText}>+ Thêm linh kiện</Text>
                </TouchableOpacity>
              </View>
            </View>
          }
          renderItem={({ item }) => (
            <View style={[styles.itemCard, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: isDark ? '#334155' : '#E2E8F0' }]}>
              <View style={styles.itemHeader}>
                <Text style={[styles.itemName, { color: isDark ? '#F8FAFC' : '#0F172A' }]} numberOfLines={2}>
                  {item.partName}
                </Text>
                <TouchableOpacity onPress={() => handleRemoveItem(item.partCatalogId)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="trash-outline" size={18} color="#EF4444" />
                </TouchableOpacity>
              </View>

              <View style={styles.itemMetaRow}>
                {!!item.sku && (
                  <View style={styles.skuBadge}>
                    <Text style={styles.skuText}>{item.sku}</Text>
                  </View>
                )}
                <View style={styles.warrantyBadge}>
                  <Ionicons name="shield-checkmark" size={12} color="#059669" />
                  <Text style={styles.warrantyText}>{formatWarranty(item.warrantyDays, item.warrantyPolicy)}</Text>
                </View>
              </View>

              <View style={styles.itemFooter}>
                <Text style={styles.itemPrice}>{formatVnd(item.price * item.quantity)}</Text>
                <View style={styles.stepperContainer}>
                  <TouchableOpacity
                    style={styles.stepperBtn}
                    onPress={() => handleUpdateQuantity(item.partCatalogId, -1)}
                  >
                    <Ionicons name="remove" size={16} color="#0F172A" />
                  </TouchableOpacity>
                  <Text style={[styles.stepperValue, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>{item.quantity}</Text>
                  <TouchableOpacity
                    style={styles.stepperBtn}
                    onPress={() => handleUpdateQuantity(item.partCatalogId, 1)}
                  >
                    <Ionicons name="add" size={16} color="#0F172A" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <TouchableOpacity
              style={[styles.emptyPickerCard, { borderColor: isDark ? '#334155' : '#CBD5E1' }]}
              onPress={() => setShowCatalogPicker(true)}
            >
              <Ionicons name="cube-outline" size={36} color="#2563EB" />
              <Text style={styles.emptyPickerTitle}>Chưa có linh kiện nào</Text>
              <Text style={styles.emptyPickerSub}>Bấm để mở danh mục kho FixHome và chọn linh kiện</Text>
            </TouchableOpacity>
          }
        />

        {/* Footer Submit */}
        <View style={[styles.footer, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderTopColor: isDark ? '#334155' : '#E2E8F0' }]}>
          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>Tổng tạm tính:</Text>
            <Text style={styles.totalAmount}>{formatVnd(totalPrice)}</Text>
          </View>
          <TouchableOpacity
            style={[styles.submitBtn, (selectedItems.length === 0 || loading) && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={selectedItems.length === 0 || loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <Ionicons name="send" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.submitBtnText}>Gửi yêu cầu tới kho FixHome</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Catalog Picker Modal */}
        <FixHomePartPickerModal
          visible={showCatalogPicker}
          onClose={() => setShowCatalogPicker(false)}
          onSelectPart={handleAddPartFromCatalog}
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
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
  contentList: {
    padding: 16,
    paddingBottom: 110,
    gap: 12,
  },
  headerSection: {
    marginBottom: 8,
  },
  sectionHeading: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
  },
  fulfillmentRow: {
    flexDirection: 'row',
    gap: 10,
  },
  fulfillmentOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  fulfillmentOptionActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#2563EB',
  },
  fulfillmentText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  fulfillmentTextActive: {
    color: '#2563EB',
    fontWeight: '700',
  },
  reasonInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 13,
    minHeight: 64,
    textAlignVertical: 'top',
  },
  partsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 18,
    marginBottom: 4,
  },
  addPartBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addPartBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2563EB',
  },
  itemCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  itemMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  skuBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  skuText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#475569',
    fontFamily: 'monospace',
  },
  warrantyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 4,
  },
  warrantyText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#059669',
  },
  itemFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  itemPrice: {
    fontSize: 15,
    fontWeight: '800',
    color: '#2563EB',
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  stepperBtn: {
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepperValue: {
    fontSize: 13,
    fontWeight: '700',
    paddingHorizontal: 6,
  },
  emptyPickerCard: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  emptyPickerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2563EB',
  },
  emptyPickerSub: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    gap: 12,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 14,
  },
  totalAmount: {
    fontSize: 18,
    fontWeight: '800',
    color: '#2563EB',
  },
  submitBtn: {
    backgroundColor: '#2563EB',
    height: 48,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitBtnDisabled: {
    backgroundColor: '#94A3B8',
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
