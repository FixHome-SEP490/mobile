// src/screens/technician/technician-parts-section.tsx
//
// Mirrors web/src/components/TechnicianPartsSection.vue: pre-repair parts request
// (predict + request before driving out) and the receive/usage flow shared with
// mid-repair "additional" parts requests (those are created server-side once a
// customer approves an additional-cost proposal that contains FixHome parts —
// see technician-additional-cost-create.ts).
import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useAppTheme } from '../../constants/theme';
import { partRequestsApi, type PartRequest, type FulfillmentMethod } from '../../api/part-requests.api';
import { partsCatalogApi, type FixHomePart } from '../../api/parts-catalog.api';

const CATEGORY_TABS = [
  { label: 'Tất cả', value: '' },
  { label: 'Điều hòa / Máy lạnh', value: 'Điều hòa' },
  { label: 'Máy giặt', value: 'Máy giặt' },
  { label: 'Tủ lạnh', value: 'Tủ lạnh' },
  { label: 'Bình nóng lạnh', value: 'Bình nóng lạnh' },
  { label: 'Quạt / Khác', value: 'Quạt' },
];

interface SelectedPartItem {
  partCatalogId: string;
  partName: string;
  sku: string | null;
  price: number;
  warrantyDays: number | null;
  quantity: number;
  note: string;
}

function warrantyBadge(days?: number | null): string {
  if (days && days > 0) {
    if (days >= 360) return `BH ${Math.round(days / 365)} năm`;
    if (days >= 30) return `BH ${Math.round(days / 30)} tháng`;
    return `BH ${days} ngày`;
  }
  return 'BH chính hãng';
}

function statusLabel(status: PartRequest['status']): string {
  switch (status) {
    case 'requested': return 'Đã gửi - Chờ kho chuẩn bị';
    case 'ready': return 'Sẵn sàng nhận';
    case 'delivering': return 'Đang giao hàng';
    case 'received': return 'Đã nhận linh kiện';
    case 'completed': return 'Đã hoàn thành';
    case 'cancelled': return 'Đã huỷ';
    default: return status;
  }
}

function statusColor(status: PartRequest['status'], colors: any): string {
  switch (status) {
    case 'requested': return '#D97706';
    case 'ready': return '#2563EB';
    case 'delivering': return '#7C3AED';
    case 'received': return colors.success;
    case 'completed': return colors.textSecondary;
    case 'cancelled': return colors.error;
    default: return colors.textSecondary;
  }
}

function errorMessage(err: any, fallback: string): string {
  return err?.response?.data?.message || fallback;
}

export default function TechnicianPartsSection({ orderId, orderStatus }: { orderId: string; orderStatus: string }) {
  const { colors } = useAppTheme();
  const styles = getStyles(colors);
  const [loading, setLoading] = useState(true);
  const [partRequests, setPartRequests] = useState<PartRequest[]>([]);
  const [partsMap, setPartsMap] = useState<Record<string, FixHomePart>>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const isAccepted = orderStatus.toUpperCase() === 'ACCEPTED';
  const isUnderRepair = orderStatus.toUpperCase() === 'UNDER_REPAIR';
  const hasActivePreRepair = partRequests.some((pr) => pr.requestType === 'pre_repair' && pr.status !== 'cancelled');

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [fulfillmentMethod, setFulfillmentMethod] = useState<FulfillmentMethod>('pickup');
  const [requestReason, setRequestReason] = useState('');
  const [selectedItems, setSelectedItems] = useState<SelectedPartItem[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<FixHomePart[]>([]);
  const [selectedPart, setSelectedPart] = useState<FixHomePart | null>(null);
  const [selectedQuantity, setSelectedQuantity] = useState(1);
  const [itemNote, setItemNote] = useState('');
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [receivingId, setReceivingId] = useState<string | null>(null);
  const [qrTokenInput, setQrTokenInput] = useState('');
  const [scanningFor, setScanningFor] = useState<string | null>(null);
  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  const loadPartRequests = async () => {
    try {
      setLoading(true);
      setPartRequests(await partRequestsApi.getByOrderId(orderId));
    } catch (err) {
      setActionError(errorMessage(err, 'Không thể tải danh sách yêu cầu linh kiện.'));
    } finally {
      setLoading(false);
    }
  };

  const runSearch = async (query: string, category: string) => {
    const effective = query.trim() || category;
    if (!effective) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await partsCatalogApi.getCatalog({ search: effective, limit: 50 });
      setSearchResults(res.data);
      setPartsMap((prev) => {
        const next = { ...prev };
        for (const p of res.data) next[p.id] = p;
        return next;
      });
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    void loadPartRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  const onSearchChange = (text: string) => {
    setSearchQuery(text);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => void runSearch(text, activeCategory), 250);
  };

  const selectCategory = (value: string) => {
    setActiveCategory(value);
    void runSearch(searchQuery, value);
  };

  const selectPartForForm = (part: FixHomePart) => {
    setSelectedPart(part);
    setSelectedQuantity(1);
    setItemNote('');
    setSearchResults([]);
  };

  const addItemToForm = () => {
    if (!selectedPart) return;
    const part = selectedPart;
    setSelectedItems((prev) => {
      const idx = prev.findIndex((i) => i.partCatalogId === part.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + Math.max(1, selectedQuantity) };
        return next;
      }
      return [
        ...prev,
        {
          partCatalogId: part.id,
          partName: part.name,
          sku: part.sku,
          price: part.sellingPrice,
          warrantyDays: part.warrantyDays,
          quantity: Math.max(1, selectedQuantity),
          note: itemNote.trim(),
        },
      ];
    });
    setSelectedPart(null);
    setSelectedQuantity(1);
    setItemNote('');
  };

  const removeItem = (partCatalogId: string) => {
    setSelectedItems((prev) => prev.filter((i) => i.partCatalogId !== partCatalogId));
  };

  const adjustQuantity = (partCatalogId: string, delta: number) => {
    setSelectedItems((prev) =>
      prev
        .map((i) => (i.partCatalogId === partCatalogId ? { ...i, quantity: i.quantity + delta } : i))
        .filter((i) => i.quantity > 0),
    );
  };

  const submitPreRepairRequest = async () => {
    if (selectedItems.length === 0) {
      setActionError('Vui lòng chọn ít nhất 1 linh kiện từ danh mục FixHome.');
      return;
    }
    setSubmitting(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      await partRequestsApi.createPreRepair(orderId, {
        items: selectedItems.map((i) => ({ partCatalogId: i.partCatalogId, quantity: i.quantity, note: i.note || undefined })),
        fulfillmentMethod,
        reason: requestReason.trim() || 'Linh kiện dự kiến trước khi đi kiểm tra',
      });
      setActionSuccess('Đã gửi yêu cầu linh kiện dự kiến tới Quản lý dịch vụ!');
      setShowCreateForm(false);
      setSelectedItems([]);
      setRequestReason('');
      await loadPartRequests();
    } catch (err) {
      setActionError(errorMessage(err, 'Không thể tạo yêu cầu linh kiện.'));
    } finally {
      setSubmitting(false);
    }
  };

  const confirmReceive = async (requestId: string, token: string) => {
    if (!token.trim()) {
      setActionError('Vui lòng nhập hoặc quét mã QR token.');
      return;
    }
    setActionError(null);
    setActionSuccess(null);
    try {
      await partRequestsApi.receiveByQr(requestId, token.trim());
      setActionSuccess('Xác nhận nhận linh kiện thành công! Giờ bạn có thể tiến hành sửa chữa.');
      setReceivingId(null);
      setQrTokenInput('');
      await loadPartRequests();
    } catch (err) {
      setActionError(errorMessage(err, 'Mã QR không hợp lệ hoặc không khớp.'));
    }
  };

  const openScanner = async (requestId: string) => {
    if (!cameraPermission?.granted) {
      const res = await requestCameraPermission();
      if (!res.granted) {
        Alert.alert('Cần quyền camera', 'Hãy cấp quyền camera để quét mã QR nhận linh kiện, hoặc nhập mã thủ công.');
        return;
      }
    }
    setScanningFor(requestId);
  };

  const onBarcodeScanned = (result: BarcodeScanningResult) => {
    const requestId = scanningFor;
    setScanningFor(null);
    if (!requestId) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    void confirmReceive(requestId, result.data);
  };

  const handleUpdateUsage = async (requestId: string, itemId: string, status: 'used' | 'returned') => {
    setUpdatingItemId(itemId);
    setActionError(null);
    try {
      await partRequestsApi.updateItemUsage(requestId, itemId, status);
      setActionSuccess(status === 'used' ? 'Đã ghi nhận linh kiện ĐÃ DÙNG.' : 'Đã ghi nhận linh kiện HOÀN TRẢ.');
      await loadPartRequests();
    } catch (err) {
      setActionError(errorMessage(err, 'Không thể cập nhật trạng thái linh kiện.'));
    } finally {
      setUpdatingItemId(null);
    }
  };

  return (
    <View style={styles.jobCard}>
      <Text style={styles.sectionTitle}>Linh kiện sửa chữa</Text>

      {!!actionSuccess && (
        <View style={styles.successBanner}>
          <Ionicons name="checkmark-circle" size={15} color={colors.success} />
          <Text style={[styles.jobMeta, { flex: 1 }]}>{actionSuccess}</Text>
        </View>
      )}
      {!!actionError && (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={15} color={colors.error} />
          <Text style={[styles.jobMeta, { flex: 1 }]}>{actionError}</Text>
        </View>
      )}

      <View style={styles.ruleBanner}>
        <Text style={styles.ruleBannerTitle}>Quy tắc quản lý linh kiện FixHome:</Text>
        <Text style={styles.jobMeta}>• Linh kiện dự kiến: lấy trước từ kho, chưa tính tiền khách.</Text>
        <Text style={styles.jobMeta}>• Khách chỉ trả cho linh kiện thực tế ĐÃ DÙNG và đã duyệt qua báo giá/chi phí phát sinh.</Text>
        <Text style={styles.jobMeta}>• Linh kiện không dùng: đánh dấu HOÀN TRẢ, không tính chi phí.</Text>
      </View>

      {isAccepted && !hasActivePreRepair && (
        <View style={styles.createBox}>
          {!showCreateForm ? (
            <TouchableOpacity style={styles.primaryBtn} onPress={() => setShowCreateForm(true)}>
              <Ionicons name="add" size={16} color={colors.surface} />
              <Text style={styles.primaryBtnText}>Tạo yêu cầu linh kiện</Text>
            </TouchableOpacity>
          ) : (
            <>
              <Text style={styles.fieldLabel}>Phương thức nhận linh kiện</Text>
              <View style={styles.chipRow}>
                <TouchableOpacity
                  style={[styles.chip, fulfillmentMethod === 'pickup' && styles.chipActive]}
                  onPress={() => setFulfillmentMethod('pickup')}
                >
                  <Text style={[styles.chipText, fulfillmentMethod === 'pickup' && styles.chipTextActive]}>🏪 Tự lấy tại kho</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.chip, fulfillmentMethod === 'delivery' && styles.chipActive]}
                  onPress={() => setFulfillmentMethod('delivery')}
                >
                  <Text style={[styles.chipText, fulfillmentMethod === 'delivery' && styles.chipTextActive]}>🚚 Giao hàng</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.fieldLabel}>Lý do yêu cầu linh kiện</Text>
              <TextInput
                style={styles.fieldInput}
                value={requestReason}
                onChangeText={setRequestReason}
                placeholder="VD: Nghi hỏng bo mạch chính"
                placeholderTextColor={colors.muted}
              />

              <Text style={styles.fieldLabel}>Tìm linh kiện FixHome</Text>
              <View style={styles.chipRow}>
                {CATEGORY_TABS.map((cat) => (
                  <TouchableOpacity
                    key={cat.value}
                    style={[styles.chip, activeCategory === cat.value && styles.chipActive]}
                    onPress={() => selectCategory(cat.value)}
                  >
                    <Text style={[styles.chipText, activeCategory === cat.value && styles.chipTextActive]}>{cat.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                style={styles.fieldInput}
                value={searchQuery}
                onChangeText={onSearchChange}
                placeholder="Gõ tên linh kiện, SKU..."
                placeholderTextColor={colors.muted}
              />
              {searching && <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 6 }} />}
              {searchResults.length > 0 && (
                <View style={styles.resultsBox}>
                  {searchResults.map((part) => (
                    <TouchableOpacity key={part.id} style={styles.resultItem} onPress={() => selectPartForForm(part)}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.resultName}>{part.name}{part.sku ? ` (${part.sku})` : ''}</Text>
                      </View>
                      <Text style={styles.resultPrice}>{part.sellingPrice.toLocaleString('vi-VN')}đ</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {!!selectedPart && (
                <View style={styles.spotlightCard}>
                  <Text style={styles.resultName}>{selectedPart.name}</Text>
                  <Text style={styles.jobMeta}>
                    {selectedPart.sellingPrice.toLocaleString('vi-VN')}đ · {warrantyBadge(selectedPart.warrantyDays)}
                  </Text>
                  <View style={styles.qtyRow}>
                    <TouchableOpacity style={styles.qtyBtn} onPress={() => setSelectedQuantity((q) => Math.max(1, q - 1))}>
                      <Ionicons name="remove" size={14} color={colors.text} />
                    </TouchableOpacity>
                    <Text style={styles.qtyText}>{selectedQuantity}</Text>
                    <TouchableOpacity style={styles.qtyBtn} onPress={() => setSelectedQuantity((q) => q + 1)}>
                      <Ionicons name="add" size={14} color={colors.text} />
                    </TouchableOpacity>
                  </View>
                  <TextInput
                    style={styles.fieldInput}
                    value={itemNote}
                    onChangeText={setItemNote}
                    placeholder="Ghi chú (không bắt buộc)"
                    placeholderTextColor={colors.muted}
                  />
                  <TouchableOpacity style={styles.primaryBtn} onPress={addItemToForm}>
                    <Ionicons name="add" size={16} color={colors.surface} />
                    <Text style={styles.primaryBtnText}>Thêm vào danh sách</Text>
                  </TouchableOpacity>
                </View>
              )}

              {selectedItems.length > 0 && (
                <View style={{ marginTop: 8 }}>
                  <Text style={styles.fieldLabel}>Danh sách linh kiện dự kiến ({selectedItems.length})</Text>
                  {selectedItems.map((item) => (
                    <View key={item.partCatalogId} style={styles.selectedRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.resultName}>{item.partName}</Text>
                        <Text style={styles.jobMeta}>{item.price.toLocaleString('vi-VN')}đ × {item.quantity}</Text>
                      </View>
                      <View style={styles.qtyRow}>
                        <TouchableOpacity style={styles.qtyBtn} onPress={() => adjustQuantity(item.partCatalogId, -1)}>
                          <Ionicons name="remove" size={14} color={colors.text} />
                        </TouchableOpacity>
                        <Text style={styles.qtyText}>{item.quantity}</Text>
                        <TouchableOpacity style={styles.qtyBtn} onPress={() => adjustQuantity(item.partCatalogId, 1)}>
                          <Ionicons name="add" size={14} color={colors.text} />
                        </TouchableOpacity>
                      </View>
                      <TouchableOpacity onPress={() => removeItem(item.partCatalogId)} style={{ marginLeft: 8 }}>
                        <Ionicons name="trash" size={16} color={colors.error} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              <View style={styles.formActionsRow}>
                <TouchableOpacity style={styles.ghostBtn} onPress={() => setShowCreateForm(false)}>
                  <Text style={styles.ghostBtnText}>Hủy bỏ</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.primaryBtn, (selectedItems.length === 0 || submitting) && { opacity: 0.6 }]}
                  onPress={submitPreRepairRequest}
                  disabled={selectedItems.length === 0 || submitting}
                >
                  {submitting ? (
                    <ActivityIndicator size="small" color={colors.surface} />
                  ) : (
                    <>
                      <Ionicons name="send" size={14} color={colors.surface} />
                      <Text style={styles.primaryBtnText}>Gửi yêu cầu tới Quản lý</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      )}

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 12 }} />
      ) : partRequests.length === 0 ? (
        !showCreateForm && (
          <View style={styles.emptyBox}>
            <Ionicons name="cube-outline" size={28} color={colors.muted} />
            <Text style={styles.emptyTitle}>Chưa có yêu cầu linh kiện nào cho đơn này.</Text>
            <Text style={styles.jobMeta}>Nếu cần linh kiện dự kiến trước khi đi hoặc phát sinh khi sửa, hãy bấm &quot;Tạo yêu cầu linh kiện&quot; ở trên.</Text>
          </View>
        )
      ) : (
        <View style={{ marginTop: 8, gap: 10 }}>
          <Text style={styles.fieldLabel}>Lịch sử yêu cầu linh kiện ({partRequests.length} đợt)</Text>
          {partRequests.map((pr) => {
            const showReceive = (pr.fulfillmentMethod === 'pickup' && pr.status === 'ready') ||
              (pr.fulfillmentMethod === 'delivery' && pr.status === 'delivering');
            return (
              <View key={pr.id} style={styles.requestCard}>
                <View style={styles.requestHeader}>
                  <View style={[styles.statusBadge, { borderColor: statusColor(pr.status, colors) }]}>
                    <Text style={[styles.statusBadgeText, { color: statusColor(pr.status, colors) }]}>{statusLabel(pr.status)}</Text>
                  </View>
                  <Text style={styles.typeTag}>{pr.requestType === 'pre_repair' ? 'Trước sửa chữa' : 'Phát sinh khi sửa'}</Text>
                  <Text style={styles.jobMeta}>{pr.fulfillmentMethod === 'delivery' ? '🚚 Giao hàng' : '📦 Tự lấy'}</Text>
                </View>
                {!!pr.reason && <Text style={styles.jobMeta}>Lý do: {pr.reason}</Text>}
                {pr.shippingFee > 0 && <Text style={styles.jobMeta}>Phí giao hàng: {pr.shippingFee.toLocaleString('vi-VN')}đ</Text>}

                {showReceive && (
                  receivingId === pr.id ? (
                    <View style={styles.receiveBox}>
                      <TextInput
                        style={styles.fieldInput}
                        value={qrTokenInput}
                        onChangeText={setQrTokenInput}
                        placeholder="Nhập mã QR token (VD: FH-PR-...)"
                        placeholderTextColor={colors.muted}
                        autoCapitalize="none"
                      />
                      <View style={styles.formActionsRow}>
                        <TouchableOpacity style={styles.ghostBtn} onPress={() => { setReceivingId(null); setQrTokenInput(''); }}>
                          <Text style={styles.ghostBtnText}>Hủy</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.primaryBtn} onPress={() => confirmReceive(pr.id, qrTokenInput)}>
                          <Text style={styles.primaryBtnText}>Xác nhận đã nhận</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.formActionsRow}>
                      <TouchableOpacity style={styles.primaryBtn} onPress={() => openScanner(pr.id)}>
                        <Ionicons name="qr-code" size={16} color={colors.surface} />
                        <Text style={styles.primaryBtnText}>Quét mã QR nhận hàng</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.ghostBtn} onPress={() => setReceivingId(pr.id)}>
                        <Text style={styles.ghostBtnText}>Nhập mã thủ công</Text>
                      </TouchableOpacity>
                    </View>
                  )
                )}

                {!!pr.receivedAt && (
                  <Text style={[styles.jobMeta, { color: colors.success }]}>
                    Đã nhận lúc: {new Date(pr.receivedAt).toLocaleString('vi-VN')}
                  </Text>
                )}

                {pr.items.map((item) => (
                  <View key={item.id} style={styles.itemRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.resultName}>{item.partNameSnapshot}</Text>
                      <Text style={styles.jobMeta}>
                        {warrantyBadge(item.partCatalogId ? partsMap[item.partCatalogId]?.warrantyDays : null)} · SL {item.quantity} ·{' '}
                        {item.unitPriceSnapshot.toLocaleString('vi-VN')}đ
                      </Text>
                      {!!item.note && <Text style={styles.jobMeta}>{item.note}</Text>}
                    </View>
                    {isUnderRepair && pr.status === 'received' ? (
                      <View style={styles.usageBtnRow}>
                        <TouchableOpacity
                          style={[styles.usageBtn, item.usageStatus === 'used' && styles.usageBtnActiveGreen]}
                          disabled={updatingItemId === item.id}
                          onPress={() => handleUpdateUsage(pr.id, item.id, 'used')}
                        >
                          <Text style={[styles.usageBtnText, item.usageStatus === 'used' && { color: colors.surface }]}>Đã dùng</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.usageBtn, item.usageStatus === 'returned' && styles.usageBtnActiveAmber]}
                          disabled={updatingItemId === item.id}
                          onPress={() => handleUpdateUsage(pr.id, item.id, 'returned')}
                        >
                          <Text style={[styles.usageBtnText, item.usageStatus === 'returned' && { color: colors.surface }]}>Hoàn trả</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <Text style={styles.usageStatusText}>
                        {item.usageStatus === 'used' ? 'ĐÃ DÙNG' : item.usageStatus === 'returned' ? 'HOÀN TRẢ' : 'Chưa ghi nhận'}
                      </Text>
                    )}
                  </View>
                ))}
              </View>
            );
          })}
        </View>
      )}

      <Modal visible={!!scanningFor} animationType="slide" onRequestClose={() => setScanningFor(null)}>
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          {cameraPermission?.granted && (
            <CameraView
              style={{ flex: 1 }}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={scanningFor ? onBarcodeScanned : undefined}
            />
          )}
          <TouchableOpacity style={styles.scanCloseBtn} onPress={() => setScanningFor(null)}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          <View style={styles.scanHintBox}>
            <Text style={styles.scanHintText}>Đưa camera vào mã QR trên màn hình/phiếu của Quản lý kho</Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const getStyles = (colors: any) => StyleSheet.create({
  jobCard: { backgroundColor: colors.surface, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: colors.border },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 8 },
  jobMeta: { fontSize: 12, color: colors.textSecondary, lineHeight: 17 },
  successBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#ECFDF5', borderColor: '#A7F3D0', borderWidth: 1, borderRadius: 8, padding: 8, marginBottom: 8 },
  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FEF2F2', borderColor: '#FECACA', borderWidth: 1, borderRadius: 8, padding: 8, marginBottom: 8 },
  ruleBanner: { backgroundColor: colors.primaryTint, borderRadius: 8, padding: 10, marginBottom: 10, gap: 2 },
  ruleBannerTitle: { fontSize: 12, fontWeight: '700', color: colors.primaryStrong, marginBottom: 2 },
  createBox: { marginBottom: 10, gap: 8 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: colors.text, marginTop: 6, marginBottom: 4 },
  fieldInput: { height: 40, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 10, color: colors.text, fontSize: 13 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 12, color: colors.text },
  chipTextActive: { color: colors.surface, fontWeight: '700' },
  resultsBox: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, maxHeight: 220, overflow: 'hidden' },
  resultItem: { flexDirection: 'row', alignItems: 'center', padding: 10, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 8 },
  resultName: { fontSize: 13, fontWeight: '600', color: colors.text },
  resultPrice: { fontSize: 12, fontWeight: '700', color: colors.primaryStrong },
  spotlightCard: { borderWidth: 2, borderColor: colors.primary, backgroundColor: colors.primaryTint, borderRadius: 10, padding: 10, gap: 6 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyBtn: { width: 28, height: 28, borderRadius: 6, backgroundColor: colors.border, justifyContent: 'center', alignItems: 'center' },
  qtyText: { fontSize: 14, fontWeight: '700', color: colors.text, minWidth: 20, textAlign: 'center' },
  selectedRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  formActionsRow: { flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
  primaryBtnText: { color: colors.surface, fontWeight: '700', fontSize: 13 },
  ghostBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.border },
  ghostBtnText: { color: colors.textSecondary, fontWeight: '700', fontSize: 13 },
  emptyBox: { alignItems: 'center', paddingVertical: 20, gap: 4, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed', borderRadius: 12 },
  emptyTitle: { fontSize: 13, fontWeight: '700', color: colors.text },
  requestCard: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, gap: 6 },
  requestHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  statusBadge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  statusBadgeText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  typeTag: { fontSize: 11, color: colors.textSecondary, fontWeight: '600' },
  receiveBox: { backgroundColor: colors.background, borderRadius: 8, padding: 10, gap: 8 },
  itemRow: { flexDirection: 'row', alignItems: 'center', paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border, gap: 8 },
  usageBtnRow: { flexDirection: 'row', gap: 6 },
  usageBtn: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: colors.border },
  usageBtnActiveGreen: { backgroundColor: colors.success, borderColor: colors.success },
  usageBtnActiveAmber: { backgroundColor: '#D97706', borderColor: '#D97706' },
  usageBtnText: { fontSize: 11, fontWeight: '700', color: colors.text },
  usageStatusText: { fontSize: 11, fontWeight: '700', color: colors.textSecondary },
  scanCloseBtn: { position: 'absolute', top: 50, right: 20, zIndex: 10, padding: 8, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20 },
  scanHintBox: { position: 'absolute', bottom: 60, left: 20, right: 20, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 10, padding: 12 },
  scanHintText: { color: '#fff', fontSize: 13, textAlign: 'center' },
});
